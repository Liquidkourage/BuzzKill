import { prisma } from "./db";

const DEFAULT_SLUG = "current";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function ensureActiveSeason() {
  const existing = await prisma.season.findFirst({
    where: { status: { in: ["open", "active"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const name = process.env.LEAGUE_SEASON_NAME || "Season 1";
  const fee = Number(process.env.LEAGUE_ENTRY_FEE_CENTS || "0");
  return prisma.season.create({
    data: {
      name,
      slug: DEFAULT_SLUG,
      status: "open",
      entryFeeCents: Number.isFinite(fee) ? fee : 0,
      entryNote:
        process.env.LEAGUE_ENTRY_NOTE ||
        "Pay the organizer to confirm your spot. Your registration stays pending until marked paid.",
      blurb:
        process.env.LEAGUE_BLURB ||
        "A live video trivia league. Teams enter the season, show up on match night, and climb the table.",
    },
  });
}

export async function getLeaguePublic() {
  const season = await ensureActiveSeason();
  const teamCount = await prisma.registration.count({ where: { seasonId: season.id } });
  const paidCount = await prisma.registration.count({
    where: { seasonId: season.id, paymentStatus: "paid" },
  });
  return {
    leagueName: process.env.LEAGUE_NAME || "BuzzKill League",
    organizer: process.env.LEAGUE_ORGANIZER || "League organizer",
    season: {
      id: season.id,
      name: season.name,
      slug: season.slug,
      status: season.status,
      entryFeeCents: season.entryFeeCents,
      entryNote: season.entryNote,
      blurb: season.blurb,
    },
    teamCount,
    paidCount,
  };
}

export async function registerTeam(input: {
  teamName: string;
  captainName: string;
  captainEmail: string;
  captainPhone?: string;
  rosterText: string;
}) {
  const season = await ensureActiveSeason();
  if (season.status === "closed") {
    throw Object.assign(new Error("Season is closed for entry"), { status: 400 });
  }

  const teamName = input.teamName.trim();
  const captainName = input.captainName.trim();
  const captainEmail = input.captainEmail.trim().toLowerCase();
  const rosterText = input.rosterText.trim();
  if (!teamName || !captainName || !captainEmail || !rosterText) {
    throw Object.assign(new Error("Missing required fields"), { status: 400 });
  }

  let baseSlug = slugify(teamName) || `team-${Date.now()}`;
  let slug = baseSlug;
  let n = 2;
  while (await prisma.team.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${n++}`;
  }

  const team = await prisma.team.create({
    data: { name: teamName, slug },
  });

  try {
    const registration = await prisma.registration.create({
      data: {
        seasonId: season.id,
        teamId: team.id,
        captainName,
        captainEmail,
        captainPhone: input.captainPhone?.trim() || null,
        rosterText,
        paymentStatus: "pending",
      },
      include: { team: true, season: true },
    });
    return registration;
  } catch (err) {
    await prisma.team.delete({ where: { id: team.id } }).catch(() => {});
    throw err;
  }
}

export async function listRegistrations(seasonId?: string) {
  const season = seasonId
    ? await prisma.season.findUnique({ where: { id: seasonId } })
    : await ensureActiveSeason();
  if (!season) throw Object.assign(new Error("Season not found"), { status: 404 });

  const rows = await prisma.registration.findMany({
    where: { seasonId: season.id },
    include: { team: true },
    orderBy: [{ wins: "desc" }, { pointsFor: "desc" }, { team: { name: "asc" } }],
  });

  return { season, registrations: rows };
}

export async function getStandings() {
  const { season, registrations } = await listRegistrations();
  const standings = registrations.map((r, index) => ({
    rank: index + 1,
    teamId: r.teamId,
    teamName: r.team.name,
    teamSlug: r.team.slug,
    wins: r.wins,
    losses: r.losses,
    ties: r.ties,
    pointsFor: r.pointsFor,
    pointsAgainst: r.pointsAgainst,
    paymentStatus: r.paymentStatus,
    games: r.wins + r.losses + r.ties,
  }));
  return { season, standings };
}

export async function setPaymentStatus(
  registrationId: string,
  paymentStatus: "pending" | "paid" | "waived"
) {
  return prisma.registration.update({
    where: { id: registrationId },
    data: { paymentStatus },
    include: { team: true },
  });
}

/** Apply final score to season standings when a league match completes. */
export async function recordMatchResult(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { teamA: true, teamB: true },
  });
  if (!match || !match.seasonId || match.status !== "completed") return;

  const seasonId = match.seasonId;
  const regA = await prisma.registration.findUnique({
    where: { seasonId_teamId: { seasonId, teamId: match.teamAId } },
  });
  const regB = await prisma.registration.findUnique({
    where: { seasonId_teamId: { seasonId, teamId: match.teamBId } },
  });
  if (!regA || !regB) return;

  // Idempotency: only count once — check for prior standings event
  const already = await prisma.matchEvent.findFirst({
    where: { matchId, type: "standings_applied" },
  });
  if (already) return;

  const aWin = match.scoreA > match.scoreB;
  const bWin = match.scoreB > match.scoreA;
  const tie = match.scoreA === match.scoreB;

  await prisma.$transaction([
    prisma.registration.update({
      where: { id: regA.id },
      data: {
        wins: { increment: aWin ? 1 : 0 },
        losses: { increment: bWin ? 1 : 0 },
        ties: { increment: tie ? 1 : 0 },
        pointsFor: { increment: match.scoreA },
        pointsAgainst: { increment: match.scoreB },
      },
    }),
    prisma.registration.update({
      where: { id: regB.id },
      data: {
        wins: { increment: bWin ? 1 : 0 },
        losses: { increment: aWin ? 1 : 0 },
        ties: { increment: tie ? 1 : 0 },
        pointsFor: { increment: match.scoreB },
        pointsAgainst: { increment: match.scoreA },
      },
    }),
    prisma.matchEvent.create({
      data: {
        matchId,
        type: "standings_applied",
        payload: { scoreA: match.scoreA, scoreB: match.scoreB },
      },
    }),
  ]);
}
