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
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export interface TokenPayload {
  discordId: string;
  purpose: "link_ticket" | "session";
  iat: number;
  exp: number;
}

export function createToken(discordId: string, purpose: TokenPayload["purpose"], ttlSeconds: number): string {
  const payload: TokenPayload = {
    discordId,
    purpose,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = base64url(JSON.stringify(payload));
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

export function verifyToken(token: string | null | undefined, expectedPurpose: TokenPayload["purpose"]): TokenPayload | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;

  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;

  let expectedSig: string;
  try {
    expectedSig = sign(encoded);
  } catch {
    return null;
  }

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.purpose !== expectedPurpose) return null;
  if (typeof payload.exp !== "number" || Math.floor(Date.now() / 1000) > payload.exp) return null;
  if (typeof payload.discordId !== "string" || !payload.discordId) return null;

  return payload;
}

export const SESSION_COOKIE_NAME = "vorpium_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
export const LINK_TICKET_TTL_SECONDS = 60 * 10; // 10 minutes

export function createSessionToken(discordId: string): string {
  return createToken(discordId, "session", SESSION_TTL_SECONDS);
}

export function createLinkTicket(discordId: string): string {
  return createToken(discordId, "link_ticket", LINK_TICKET_TTL_SECONDS);
}

export function verifySessionToken(token: string | null | undefined): string | null {
  const payload = verifyToken(token, "session");
  return payload ? payload.discordId : null;
}

export function verifyLinkTicket(token: string | null | undefined): string | null {
  const payload = verifyToken(token, "link_ticket");
  return payload ? payload.discordId : null;
}