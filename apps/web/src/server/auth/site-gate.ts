type SiteGateEnv = Record<string, string | undefined>;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function decodeBasicAuthorization(authorization: string | null) {
  const [scheme, encoded] = authorization?.split(" ") ?? [];

  if (scheme?.toLowerCase() !== "basic" || !encoded) {
    return null;
  }

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function resolveSiteGateSessionEmailFromAuthorization(
  authorization: string | null,
  env: SiteGateEnv = process.env,
) {
  const expectedUsername = env.ROOMPIRE_SITE_GATE_USERNAME?.trim();
  const expectedPassword = env.ROOMPIRE_SITE_GATE_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    return null;
  }

  const providedCredentials = decodeBasicAuthorization(authorization);

  if (
    !providedCredentials ||
    providedCredentials.username !== expectedUsername ||
    providedCredentials.password !== expectedPassword
  ) {
    return null;
  }

  return resolveConfiguredSiteGateSessionEmail(env);
}

export function resolveConfiguredSiteGateSessionEmail(env: SiteGateEnv = process.env) {
  const expectedUsername = env.ROOMPIRE_SITE_GATE_USERNAME?.trim();
  const expectedPassword = env.ROOMPIRE_SITE_GATE_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    return null;
  }

  const email = normalizeEmail(env.ROOMPIRE_SITE_GATE_SESSION_EMAIL || expectedUsername);

  return looksLikeEmail(email) ? email : null;
}

export function basicAuthorizationHeader(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
