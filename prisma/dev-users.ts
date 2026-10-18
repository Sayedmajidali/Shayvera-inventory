/** Local development only: (re)sets the admin password and a default-permission staff user from .env. */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/server/auth-hash";
import { DEFAULT_STAFF_PERMISSIONS } from "../src/server/permissions";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("dev-users is for local development only");
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, DEV_STAFF_EMAIL, DEV_STAFF_PASSWORD } = process.env;
  if (SEED_ADMIN_EMAIL && SEED_ADMIN_PASSWORD) {
    await prisma.user.update({
      where: { email: SEED_ADMIN_EMAIL },
      data: { passwordHash: await hashPassword(SEED_ADMIN_PASSWORD), failedLogins: 0, lockedUntil: null },
    });
    console.log(`Admin password set for ${SEED_ADMIN_EMAIL}`);
  }
  if (DEV_STAFF_EMAIL && DEV_STAFF_PASSWORD) {
    const passwordHash = await hashPassword(DEV_STAFF_PASSWORD);
    await prisma.user.upsert({
      where: { email: DEV_STAFF_EMAIL },
      update: { passwordHash },
      create: { email: DEV_STAFF_EMAIL, name: "Priya Staff", role: "STAFF", permissions: DEFAULT_STAFF_PERMISSIONS, passwordHash },
    });
    console.log(`Staff user ready: ${DEV_STAFF_EMAIL}`);
  }
}

main().finally(() => prisma.$disconnect());
