import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const DEMO_SESSION_COOKIE = "juber_demo_session";

function secret(value = process.env.DEMO_SESSION_SECRET ?? process.env.DEMO_ADMIN_PASSCODE) {
  if (!value || value.length < 32) throw new Error("DEMO_SESSION_SECRET must contain at least 32 characters");
  return value;
}

function signature(sessionId: string, value?: string) {
  return createHmac("sha256", secret(value)).update(sessionId).digest("base64url");
}

export function createDemoSessionToken(sessionId: string, value?: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) throw new Error("Invalid demo session ID");
  return `${sessionId}.${signature(sessionId, value)}`;
}

export function verifyDemoSessionToken(token: string | null | undefined, value?: string) {
  if (!token) return null;
  const separator = token.indexOf(".");
  if (separator < 1) return null;
  const sessionId = token.slice(0, separator);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) return null;
  const supplied = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(signature(sessionId, value));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? sessionId : null;
}

export function readDemoSessionCookie(cookieHeader: string | null | undefined, value?: string) {
  if (!cookieHeader) return null;
  const encoded = cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${DEMO_SESSION_COOKIE}=`))?.slice(DEMO_SESSION_COOKIE.length + 1);
  if (!encoded) return null;
  try {
    return verifyDemoSessionToken(decodeURIComponent(encoded), value);
  } catch {
    return null;
  }
}

export function serializeDemoSessionCookie(token: string, options: { secure?: boolean; maxAgeSeconds?: number } = {}) {
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  return `${DEMO_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${options.maxAgeSeconds ?? 86400}${secure ? "; Secure" : ""}`;
}

export function clearDemoSessionCookie(options: { secure?: boolean } = {}) {
  return serializeDemoSessionCookie("", { secure: options.secure, maxAgeSeconds: 0 });
}
