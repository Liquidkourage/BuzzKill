import { PrismaClient } from "./generated/prisma";

// Singleton Prisma client
export const prisma = new PrismaClient();

process.on("beforeExit", async () => {
  try {
    await prisma.$disconnect();
  } catch {}
});



