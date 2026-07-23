import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

import type { SessionUser } from "@/lib/archive";
import { ApiRequestError } from "@/server/http";

export const SESSION_COOKIE_NAME = "f_archive_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 8;

interface AuthConfiguration {
  username: string;
  password: string;
  sessionSecret: string;
}

interface SessionPayload {
  exp: number;
  nonce: string;
  username: string;
}

function getAuthConfiguration(): AuthConfiguration {
  const isProduction = process.env.NODE_ENV === "production";
  const username =
    process.env.APP_USERNAME ?? (isProduction ? undefined : "demo");
  const password =
    process.env.APP_PASSWORD ?? (isProduction ? undefined : "demo");
  const sessionSecret =
    process.env.SESSION_SECRET ??
    (isProduction ? undefined : "development-only-session-secret-change-me");

  if (!username || !password || !sessionSecret) {
    throw new Error("Server authentication environment is incomplete.");
  }

  if (isProduction && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }

  return { username, password, sessionSecret };
}

function safeTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

export function authenticateCredentials(
  username: string,
  password: string,
): SessionUser | null {
  const configuration = getAuthConfiguration();
  if (
    !safeTextEqual(username, configuration.username) ||
    !safeTextEqual(password, configuration.password)
  ) {
    return null;
  }
  return { username: configuration.username };
}

export function createSessionToken(user: SessionUser): string {
  const { sessionSecret } = getAuthConfiguration();
  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
    nonce: randomBytes(12).toString("base64url"),
    username: user.username,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return `${encodedPayload}.${sign(encodedPayload, sessionSecret)}`;
}

export function verifySessionToken(token: string | undefined): SessionUser | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) {
    return null;
  }

  const { sessionSecret, username } = getAuthConfiguration();
  const expectedSignature = sign(encodedPayload, sessionSecret);
  if (!safeTextEqual(suppliedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    if (
      payload.username !== username ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { username: payload.username };
  } catch {
    return null;
  }
}

export function requireApiSession(request: Request): SessionUser {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
  const user = verifySessionToken(token);
  if (!user) {
    throw new ApiRequestError(
      401,
      "authentication_required",
      "로그인이 필요합니다.",
    );
  }
  return user;
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
