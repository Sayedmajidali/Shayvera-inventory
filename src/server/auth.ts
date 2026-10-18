import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { hashPassword, verifyPassword } from "./auth-hash";
import { prisma } from "./db";
import { audit } from "./audit";
import { UnauthenticatedError } from "./errors";
import { can, type Actor, type Permission } from "./permissions";

export const SESSION_COOKIE = "shayvera_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 1000 * 60 * 15;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  return s;
}

export function hashToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export { hashPassword, verifyPassword };

// Compared against for unknown emails so response timing does not reveal which accounts exist.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash(randomBytes(16).toString("hex"), 12));

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(emailRaw: string, password: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  const generic = "Invalid email or password.";

  if (!user) {
    await bcrypt.compare(password, await getDummyHash());
    return { ok: false, error: generic };
  }
  if (!user.active) return { ok: false, error: "This account has been deactivated. Contact your administrator." };
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "Too many failed attempts. Try again in a few minutes." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null,
      },
    });
    if (failed >= MAX_FAILED_LOGINS) {
      await audit(prisma, {
        actorId: user.id,
        action: "auth.locked",
        entityType: "User",
        entityId: user.id,
        summary: `Account ${user.email} locked after repeated failed sign-ins`,
      });
    }
    return { ok: false, error: generic };
  }

  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  await prisma.$transaction([
    prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
        ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    }),
    prisma.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } }),
  ]);
  await audit(prisma, {
    actorId: user.id,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    summary: `${user.email} signed in`,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Re-validated against the database every request. */
export const getCurrentUser = cache(async (): Promise<Actor | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, name: true, role: true, permissions: true, active: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const { user } = session;
  return { id: user.id, name: user.name, role: user.role, permissions: user.permissions };
});

/** For server actions / route handlers: throws if not signed in. */
export async function requireActor(): Promise<Actor> {
  const actor = await getCurrentUser();
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

/** For pages: redirect to sign-in, or to the forbidden page when the permission is missing. */
export async function requirePage(permission?: Permission | Permission[]): Promise<Actor> {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!list.some((p) => can(actor, p))) redirect("/forbidden");
  }
  return actor;
}
