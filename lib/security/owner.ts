import { randomBytes } from "node:crypto";
import { hashOwner } from "./owner-hash";
import { cookies } from "next/headers";

const COOKIE = "p2m_owner";
const VALID = /^[A-Za-z0-9_-]{43}$/;

/**
 * Identifies the browser that created a job via an HttpOnly cookie. Job ids alone are
 * never sufficient to read a result or download it.
 */
export async function getOwnerHash(options: { create: boolean }): Promise<string | null> {
  const store = await cookies();
  let token = store.get(COOKIE)?.value;
  if (!token || !VALID.test(token)) {
    if (!options.create) return null;
    token = randomBytes(32).toString("base64url");
    store.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  return hashOwner(token);
}
