import { prisma } from "./db";
import { hashPassword, publicUser } from "./auth";
import { ensureActiveSeason } from "./league";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function uniqueTeamSlug(base: string): Promise<string> {
  let slug = slugify(base) || "team";
  let n = 0;
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const hit = await prisma.team.findUnique({ where: { slug: candidate } });
    if (!hit) return candidate;
    n += 1;
  }
}

/** Next Sunday 00:00 UTC on or after `from` (if from is Sunday, use it). */
export function sundayOnOrAfter(from = new Date()): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const day = d.getUTCDay(); // 0 Sun
  const add = day === 0 ? 0 : 7 - day;
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

export async function getAccountHome(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: { team: true },
  });
  const season = await ensureActiveSeason();
  const reading = user.isReader
    ? await prisma.scheduledMatch.findMany({
        where: {
          readerId: userId,
          status: { in: ["scheduled", "confirmed", "live"] },
        },
        include: {
          week: true,
          teamA: true,
          teamB: true,
        },
        orderBy: { startsAt: "asc" },
      })
    : [];

  const teamIds = memberships.map((m) => m.teamId);
  const mySchedule =
    teamIds.length === 0
      ? []
      : await prisma.scheduledMatch.findMany({
          where: {
            seasonId: season.id,
            status: { not: "canceled" },
            OR: [{ teamAId: { in: teamIds } }, { teamBId: { in: teamIds } }],
          },
          include: {
            week: true,
            teamA: true,
            teamB: true,
            reader: { select: { id: true, name: true, email: true } },
          },
          orderBy: [{ week: { weekIndex: "asc" } }, { startsAt: "asc" }],
        });

  return {
    user: publicUser(user),
    memberships: memberships.map((m) => ({
      role: m.role,
      teamId: m.teamId,
      teamName: m.team.name,
      seasonId: m.seasonId,
    })),
    season: { id: season.id, name: season.name, status: season.status },
    reading,
    schedule: mySchedule,
  };
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  isCommissioner?: boolean;
  isReader?: boolean;
}) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;
  if (!email || !name || password.length < 8) {
    throw Object.assign(new Error("Name, email, and password (8+ chars) required"), { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw Object.assign(new Error("Email already registered"), { status: 409 });
  return prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      isCommissioner: Boolean(input.isCommissioner),
      isReader: Boolean(input.isReader),
    },
  });
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      memberships: { include: { team: true } },
      _count: { select: { readingMatches: true } },
    },
  });
  return users.map((u) => ({
    ...publicUser(u),
    teams: u.memberships.map((m) => ({ role: m.role, teamId: m.teamId, teamName: m.team.name })),
    readingCount: u._count.readingMatches,
  }));
}

export async function setUserFlags(
  userId: string,
  flags: { isCommissioner?: boolean; isReader?: boolean; name?: string }
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(flags.isCommissioner !== undefined ? { isCommissioner: flags.isCommissioner } : {}),
      ...(flags.isReader !== undefined ? { isReader: flags.isReader } : {}),
      ...(flags.name !== undefined ? { name: flags.name.trim() } : {}),
    },
  });
}

/** Commissioner: create team + registration + captain account + roster of up to 5. */
export async function commissionerCreateTeam(input: {
  teamName: string;
  captainName: string;
  captainEmail: string;
  captainPassword: string;
  rosterNames: string[];
  markPaid?: boolean;
}) {
  const season = await ensureActiveSeason();
  const teamName = input.teamName.trim();
  const captainName = input.captainName.trim();
  const captainEmail = input.captainEmail.trim().toLowerCase();
  const rosterNames = input.rosterNames.map((n) => n.trim()).filter(Boolean).slice(0, 5);
  if (!teamName || !captainName || !captainEmail) {
    throw Object.assign(new Error("Team name and captain required"), { status: 400 });
  }
  if (rosterNames.length < 1) {
    throw Object.assign(new Error("Add at least one roster player"), { status: 400 });
  }

  let captain = await prisma.user.findUnique({ where: { email: captainEmail } });
  if (!captain) {
    if (!input.captainPassword || input.captainPassword.length < 8) {
      throw Object.assign(new Error("Captain password (8+) required for new accounts"), {
        status: 400,
      });
    }
    captain = await prisma.user.create({
      data: {
        email: captainEmail,
        name: captainName,
        passwordHash: hashPassword(input.captainPassword),
      },
    });
  }

  const team = await prisma.team.create({
    data: { name: teamName, slug: await uniqueTeamSlug(teamName) },
  });

  const registration = await prisma.registration.create({
    data: {
      seasonId: season.id,
      teamId: team.id,
      captainName,
      captainEmail,
      rosterText: rosterNames.join("\n"),
      paymentStatus: input.markPaid ? "paid" : "pending",
      roster: {
        create: rosterNames.map((name, i) => ({
          name,
          sortOrder: i,
          userId: i === 0 ? captain!.id : undefined,
        })),
      },
    },
    include: { roster: true, team: true },
  });

  await prisma.teamMember.upsert({
    where: { userId_teamId: { userId: captain.id, teamId: team.id } },
    create: { userId: captain.id, teamId: team.id, role: "captain", seasonId: season.id },
    update: { role: "captain", seasonId: season.id },
  });

  return { team, registration, captain: publicUser(captain) };
}

export async function setRoster(registrationId: string, names: string[]) {
  const cleaned = names.map((n) => n.trim()).filter(Boolean).slice(0, 5);
  if (cleaned.length < 1 || cleaned.length > 5) {
    throw Object.assign(new Error("Roster must be 1–5 players"), { status: 400 });
  }
  await prisma.rosterPlayer.deleteMany({ where: { registrationId } });
  await prisma.rosterPlayer.createMany({
    data: cleaned.map((name, i) => ({ registrationId, name, sortOrder: i })),
  });
  await prisma.registration.update({
    where: { id: registrationId },
    data: { rosterText: cleaned.join("\n") },
  });
  return prisma.rosterPlayer.findMany({
    where: { registrationId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function ensureWeeks(count: number) {
  const season = await ensureActiveSeason();
  const existing = await prisma.seasonWeek.findMany({
    where: { seasonId: season.id },
    orderBy: { weekIndex: "asc" },
  });
  if (existing.length >= count) return existing;
  let start = existing.length
    ? new Date(existing[existing.length - 1].startsOn)
    : sundayOnOrAfter(new Date());
  if (existing.length) {
    start = new Date(start);
    start.setUTCDate(start.getUTCDate() + 7);
  }
  const created = [];
  for (let i = existing.length; i < count; i++) {
    const startsOn = new Date(start);
    startsOn.setUTCDate(start.getUTCDate() + (i - existing.length) * 7);
    const week = await prisma.seasonWeek.create({
      data: {
        seasonId: season.id,
        weekIndex: i + 1,
        startsOn,
        label: `Week ${i + 1}`,
      },
    });
    created.push(week);
  }
  return prisma.seasonWeek.findMany({
    where: { seasonId: season.id },
    orderBy: { weekIndex: "asc" },
    include: {
      matches: {
        include: {
          teamA: true,
          teamB: true,
          reader: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

export async function listSchedule() {
  const season = await ensureActiveSeason();
  const weeks = await prisma.seasonWeek.findMany({
    where: { seasonId: season.id },
    orderBy: { weekIndex: "asc" },
    include: {
      matches: {
        where: { status: { not: "canceled" } },
        include: {
          teamA: true,
          teamB: true,
          reader: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  return { season: { id: season.id, name: season.name }, weeks };
}

export async function scheduleMatch(input: {
  weekId: string;
  teamAId: string;
  teamBId: string;
  readerId?: string;
  startsAt?: string;
  notes?: string;
}) {
  if (!input.teamAId || !input.teamBId || input.teamAId === input.teamBId) {
    throw Object.assign(new Error("Pick two different teams"), { status: 400 });
  }
  const week = await prisma.seasonWeek.findUnique({ where: { id: input.weekId } });
  if (!week) throw Object.assign(new Error("Week not found"), { status: 404 });

  // Each team ≤ 1 match this week
  const conflict = await prisma.scheduledMatch.findFirst({
    where: {
      weekId: week.id,
      status: { not: "canceled" },
      OR: [
        { teamAId: input.teamAId },
        { teamBId: input.teamAId },
        { teamAId: input.teamBId },
        { teamBId: input.teamBId },
      ],
    },
  });
  if (conflict) {
    throw Object.assign(
      new Error("A selected team already has a match this week (max 1 per team per week)"),
      { status: 400 }
    );
  }

  if (input.readerId) {
    const reader = await prisma.user.findUnique({ where: { id: input.readerId } });
    if (!reader?.isReader) {
      throw Object.assign(new Error("Reader must have reader access"), { status: 400 });
    }
  }

  return prisma.scheduledMatch.create({
    data: {
      seasonId: week.seasonId,
      weekId: week.id,
      teamAId: input.teamAId,
      teamBId: input.teamBId,
      readerId: input.readerId || null,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      notes: input.notes?.trim() || null,
      status: "scheduled",
    },
    include: {
      teamA: true,
      teamB: true,
      week: true,
      reader: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function assignReader(scheduledMatchId: string, readerId: string | null) {
  if (readerId) {
    const reader = await prisma.user.findUnique({ where: { id: readerId } });
    if (!reader?.isReader) {
      throw Object.assign(new Error("User is not a reader"), { status: 400 });
    }
  }
  return prisma.scheduledMatch.update({
    where: { id: scheduledMatchId },
    data: { readerId },
    include: {
      teamA: true,
      teamB: true,
      week: true,
      reader: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function commissionerDashboard() {
  const season = await ensureActiveSeason();
  const [users, registrations, schedule, readers] = await Promise.all([
    listUsers(),
    prisma.registration.findMany({
      where: { seasonId: season.id },
      include: {
        team: true,
        roster: { orderBy: { sortOrder: "asc" }, include: { user: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    listSchedule(),
    prisma.user.findMany({
      where: { isReader: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    season: {
      id: season.id,
      name: season.name,
      status: season.status,
      entryFeeCents: season.entryFeeCents,
    },
    users,
    teams: registrations.map((r) => ({
      registrationId: r.id,
      teamId: r.teamId,
      name: r.team.name,
      slug: r.team.slug,
      paymentStatus: r.paymentStatus,
      captainName: r.captainName,
      captainEmail: r.captainEmail,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      roster: r.roster.map((p) => ({
        id: p.id,
        name: p.name,
        userId: p.userId,
        userEmail: p.user?.email,
      })),
    })),
    schedule,
    readers,
  };
}

export async function getTeamPortal(userId: string) {
  const membership = await prisma.teamMember.findFirst({
    where: { userId, role: { in: ["captain", "player"] } },
    include: { team: true },
  });
  if (!membership) return null;
  const season = await ensureActiveSeason();
  const registration = await prisma.registration.findUnique({
    where: { seasonId_teamId: { seasonId: season.id, teamId: membership.teamId } },
    include: { roster: { orderBy: { sortOrder: "asc" }, include: { user: true } } },
  });
  const schedule = await prisma.scheduledMatch.findMany({
    where: {
      seasonId: season.id,
      status: { not: "canceled" },
      OR: [{ teamAId: membership.teamId }, { teamBId: membership.teamId }],
    },
    include: {
      week: true,
      teamA: true,
      teamB: true,
      reader: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ week: { weekIndex: "asc" } }],
  });
  return {
    role: membership.role,
    team: { id: membership.team.id, name: membership.team.name },
    registration,
    schedule,
  };
}
