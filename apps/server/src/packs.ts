import { prisma } from "./db";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function uniquePackSlug(base: string): Promise<string> {
  let slug = slugify(base) || "pack";
  let n = 0;
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const hit = await prisma.gamePack.findUnique({ where: { slug: candidate } });
    if (!hit) return candidate;
    n += 1;
  }
}

export async function listPacks(opts?: { includeDrafts?: boolean }) {
  const where = opts?.includeDrafts
    ? { status: { in: ["draft", "ready", "archived"] } }
    : { status: "ready" };
  const packs = await prisma.gamePack.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { questions: true } } },
  });
  return packs.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    status: p.status,
    questionCount: p._count.questions,
    updatedAt: p.updatedAt,
  }));
}

export async function getPack(idOrSlug: string) {
  const pack = await prisma.gamePack.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });
  return pack;
}

export async function createPack(input: {
  name: string;
  description?: string;
  status?: string;
}) {
  const name = input.name.trim();
  if (!name) throw Object.assign(new Error("Pack name required"), { status: 400 });
  const status = input.status || "draft";
  if (!["draft", "ready", "archived"].includes(status)) {
    throw Object.assign(new Error("Invalid status"), { status: 400 });
  }
  return prisma.gamePack.create({
    data: {
      name,
      slug: await uniquePackSlug(name),
      description: input.description?.trim() || null,
      status,
    },
  });
}

export async function updatePack(
  id: string,
  input: { name?: string; description?: string | null; status?: string }
) {
  const data: { name?: string; description?: string | null; status?: string; slug?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw Object.assign(new Error("Pack name required"), { status: 400 });
    data.name = name;
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.status !== undefined) {
    if (!["draft", "ready", "archived"].includes(input.status)) {
      throw Object.assign(new Error("Invalid status"), { status: 400 });
    }
    data.status = input.status;
  }
  return prisma.gamePack.update({ where: { id }, data });
}

export async function deletePack(id: string) {
  await prisma.gamePack.delete({ where: { id } });
}

export async function addQuestion(
  packId: string,
  input: {
    prompt: string;
    answer: string;
    category?: string;
    difficulty?: string;
    notes?: string;
  }
) {
  const prompt = input.prompt.trim();
  const answer = input.answer.trim();
  if (!prompt || !answer) {
    throw Object.assign(new Error("Prompt and answer required"), { status: 400 });
  }
  const agg = await prisma.question.aggregate({
    where: { packId },
    _max: { sortOrder: true },
  });
  const sortOrder = (agg._max.sortOrder ?? -1) + 1;
  return prisma.question.create({
    data: {
      packId,
      sortOrder,
      prompt,
      answer,
      category: input.category?.trim() || null,
      difficulty: input.difficulty?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
}

export async function updateQuestion(
  id: string,
  input: {
    prompt?: string;
    answer?: string;
    category?: string | null;
    difficulty?: string | null;
    notes?: string | null;
    sortOrder?: number;
  }
) {
  const data: Record<string, unknown> = {};
  if (input.prompt !== undefined) {
    const prompt = input.prompt.trim();
    if (!prompt) throw Object.assign(new Error("Prompt required"), { status: 400 });
    data.prompt = prompt;
  }
  if (input.answer !== undefined) {
    const answer = input.answer.trim();
    if (!answer) throw Object.assign(new Error("Answer required"), { status: 400 });
    data.answer = answer;
  }
  if (input.category !== undefined) data.category = input.category?.trim() || null;
  if (input.difficulty !== undefined) data.difficulty = input.difficulty?.trim() || null;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  return prisma.question.update({ where: { id }, data });
}

export async function deleteQuestion(id: string) {
  await prisma.question.delete({ where: { id } });
}

/** Bulk import: lines as category | prompt | answer  (pipe or tab). Blank lines skipped. */
export async function importQuestions(packId: string, text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw Object.assign(new Error("No lines to import"), { status: 400 });
  }

  const agg = await prisma.question.aggregate({
    where: { packId },
    _max: { sortOrder: true },
  });
  let sortOrder = (agg._max.sortOrder ?? -1) + 1;
  const rows: {
    packId: string;
    sortOrder: number;
    category: string | null;
    prompt: string;
    answer: string;
  }[] = [];

  for (const line of lines) {
    const parts = line.includes("\t")
      ? line.split("\t")
      : line.split("|").map((p) => p.trim());
    let category: string | null = null;
    let prompt = "";
    let answer = "";
    if (parts.length >= 3) {
      category = parts[0] || null;
      prompt = parts[1] || "";
      answer = parts.slice(2).join("|").trim();
    } else if (parts.length === 2) {
      prompt = parts[0] || "";
      answer = parts[1] || "";
    } else {
      continue;
    }
    if (!prompt || !answer) continue;
    rows.push({ packId, sortOrder, category, prompt, answer });
    sortOrder += 1;
  }

  if (rows.length === 0) {
    throw Object.assign(
      new Error("Could not parse any lines. Use: category | question | answer"),
      { status: 400 }
    );
  }

  await prisma.question.createMany({ data: rows });
  return { imported: rows.length };
}

export function packForRoom(pack: NonNullable<Awaited<ReturnType<typeof getPack>>>) {
  return {
    packId: pack.id,
    packName: pack.name,
    maxQuestions: pack.questions.length || 20,
    questions: pack.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      answer: q.answer,
      category: q.category || undefined,
    })),
  };
}
