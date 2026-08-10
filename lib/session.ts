import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET;

function getSecret(): string {
  if (!SECRET) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one (e.g. `openssl rand -hex 32`) and add it to your environment variables."
    );
  }

  return SECRET;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

export interface TokenPayload {
  discordId: string;
  purpose: "session";
  iat: number;
  exp: number;
}

export function createToken(
  discordId: string,
  ttlSeconds: number
): string {
  const now = Math.floor(Date.now() / 1000);

  const payload: TokenPayload = {
    discordId,
    purpose: "session",
    iat: now,
    exp: now + ttlSeconds,
  };

  const encoded = base64url(JSON.stringify(payload));
  const signature = sign(encoded);

  return `${encoded}.${signature}`;
}

export function verifyToken(
  token: string | null | undefined
): TokenPayload | null {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const [encoded, signature] = token.split(".");

  if (!encoded || !signature) {
    return null;
  }

  let expectedSignature: string;

  try {
    expectedSignature = sign(encoded);
  } catch {
    return null;
  }

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload: TokenPayload;

  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
  } catch {
    return null;
  }

  if (payload.purpose !== "session") {
    return null;
  }

  if (
    typeof payload.exp !== "number" ||
    Math.floor(Date.now() / 1000) > payload.exp
  ) {
    return null;
  }

  if (typeof payload.discordId !== "string" || !payload.discordId) {
    return null;
  }

  return payload;
}

export const SESSION_COOKIE_NAME = "vorpium_session";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

export function createSessionToken(discordId: string): string {
  return createToken(discordId, SESSION_TTL_SECONDS);
}

export function verifySessionToken(
  token: string | null | undefined
): string | null {
  const payload = verifyToken(token);

  return payload ? payload.discordId : null;
}