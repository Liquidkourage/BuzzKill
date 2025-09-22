import { PrismaClient } from "@prisma/client";

// Singleton Prisma client with connection error handling
export const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'pretty',
});

// Handle database connection errors
prisma.$on('error', (e) => {
  console.error('Database error:', e);
});

// Graceful database disconnection
const gracefulShutdown = async () => {
  try {
    await prisma.$disconnect();
    console.log('Database disconnected gracefully');
  } catch (error) {
    console.error('Error disconnecting from database:', error);
  }
};

process.on("beforeExit", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);



