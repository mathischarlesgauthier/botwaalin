import argon2 from "argon2";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntime } from "./core";

const COOKIE_NAME = "aj_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sessionSecret(): string {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  // Secret éphémère si non configuré : les sessions sautent au redémarrage.
  const store = globalThis as unknown as { __ajSecret?: string };
  store.__ajSecret ??= crypto.randomBytes(32).toString("hex");
  return store.__ajSecret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      u: string;
      exp: number;
    };
    if (data.exp < Date.now()) return null;
    return data.u;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<string | null> {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value);
}

/** À appeler en tête de chaque page protégée. */
export async function requireSession(): Promise<string> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function setSessionCookie(username: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.DASHBOARD_INSECURE_COOKIE !== "1",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// ── Rate limit du login (en mémoire) ──
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export function loginRateLimited(ip: string): boolean {
  const nowTs = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < nowTs) {
    attempts.set(ip, { count: 1, resetAt: nowTs + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

/**
 * Vérifie les identifiants. Premier login : si la table users est vide, le mot
 * de passe est comparé à DASHBOARD_PASSWORD (env) puis stocké hashé (argon2).
 */
export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const { core } = getRuntime();
  if (core.users.count() === 0) {
    const bootstrapUser = process.env.DASHBOARD_USER || "jacob";
    const bootstrapPassword = process.env.DASHBOARD_PASSWORD || "";
    if (!bootstrapPassword) return false;
    if (username !== bootstrapUser || password !== bootstrapPassword) return false;
    core.users.create(bootstrapUser, await argon2.hash(password));
    return true;
  }
  const user = core.users.byUsername(username);
  if (!user) return false;
  try {
    return await argon2.verify(user.passwordHash, password);
  } catch {
    return false;
  }
}
