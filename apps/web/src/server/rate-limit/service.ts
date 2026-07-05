import { ApiError } from "@/server/api/errors";

export type RateLimitScope =
  | "devSession"
  | "inviteCreate"
  | "inviteAccept"
  | "filePresign"
  | "proposalComment"
  | "shareDecision";

type RateLimitConfig = {
  limit: number;
  windowSeconds: number;
};

type RateLimitInput = {
  householdId?: string | null;
  scope: RateLimitScope;
  subject: string;
};

type RateLimitCheckInput = RateLimitInput & {
  nowMs?: number;
};

type RateLimitEntry = {
  count: number;
  resetAtMs: number;
};

export type RateLimitOutcome = RateLimitConfig & {
  allowed: boolean;
  key: string;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

export type RateLimitStore = {
  increment(key: string, input: RateLimitConfig & { nowMs: number }): RateLimitOutcome;
};

class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, RateLimitEntry>();
  private operationCount = 0;

  increment(key: string, input: RateLimitConfig & { nowMs: number }): RateLimitOutcome {
    this.operationCount += 1;

    if (this.operationCount % 500 === 0) {
      this.prune(input.nowMs);
    }

    const current = this.entries.get(key);
    const resetAtMs =
      current && current.resetAtMs > input.nowMs
        ? current.resetAtMs
        : input.nowMs + input.windowSeconds * 1000;
    const nextCount = current && current.resetAtMs > input.nowMs ? current.count + 1 : 1;

    this.entries.set(key, {
      count: nextCount,
      resetAtMs,
    });

    const remaining = Math.max(input.limit - nextCount, 0);
    const retryAfterSeconds = Math.max(Math.ceil((resetAtMs - input.nowMs) / 1000), 1);

    return {
      allowed: nextCount <= input.limit,
      key,
      limit: input.limit,
      remaining,
      resetAt: new Date(resetAtMs),
      retryAfterSeconds,
      windowSeconds: input.windowSeconds,
    };
  }

  private prune(nowMs: number) {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.resetAtMs <= nowMs) {
        this.entries.delete(key);
      }
    }
  }
}

const defaultConfigs: Record<RateLimitScope, RateLimitConfig> = {
  devSession: { limit: 120, windowSeconds: 5 * 60 },
  filePresign: { limit: 60, windowSeconds: 60 * 60 },
  inviteAccept: { limit: 30, windowSeconds: 10 * 60 },
  inviteCreate: { limit: 20, windowSeconds: 60 * 60 },
  proposalComment: { limit: 120, windowSeconds: 60 * 60 },
  shareDecision: { limit: 120, windowSeconds: 10 * 60 },
};

const envNames: Record<RateLimitScope, { limit: string; windowSeconds: string }> = {
  devSession: {
    limit: "ROOMPIRE_RATE_LIMIT_DEV_SESSION_LIMIT",
    windowSeconds: "ROOMPIRE_RATE_LIMIT_DEV_SESSION_WINDOW_SECONDS",
  },
  filePresign: {
    limit: "ROOMPIRE_RATE_LIMIT_FILE_PRESIGN_LIMIT",
    windowSeconds: "ROOMPIRE_RATE_LIMIT_FILE_PRESIGN_WINDOW_SECONDS",
  },
  inviteAccept: {
    limit: "ROOMPIRE_RATE_LIMIT_INVITE_ACCEPT_LIMIT",
    windowSeconds: "ROOMPIRE_RATE_LIMIT_INVITE_ACCEPT_WINDOW_SECONDS",
  },
  inviteCreate: {
    limit: "ROOMPIRE_RATE_LIMIT_INVITE_CREATE_LIMIT",
    windowSeconds: "ROOMPIRE_RATE_LIMIT_INVITE_CREATE_WINDOW_SECONDS",
  },
  proposalComment: {
    limit: "ROOMPIRE_RATE_LIMIT_PROPOSAL_COMMENT_LIMIT",
    windowSeconds: "ROOMPIRE_RATE_LIMIT_PROPOSAL_COMMENT_WINDOW_SECONDS",
  },
  shareDecision: {
    limit: "ROOMPIRE_RATE_LIMIT_SHARE_DECISION_LIMIT",
    windowSeconds: "ROOMPIRE_RATE_LIMIT_SHARE_DECISION_WINDOW_SECONDS",
  },
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __roompireRateLimitStore?: RateLimitStore;
};

export function createMemoryRateLimitStore(): RateLimitStore {
  return new MemoryRateLimitStore();
}

function defaultStore() {
  if (!globalForRateLimit.__roompireRateLimitStore) {
    globalForRateLimit.__roompireRateLimitStore = createMemoryRateLimitStore();
  }

  return globalForRateLimit.__roompireRateLimitStore;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function rateLimitsEnabled() {
  return process.env.ROOMPIRE_RATE_LIMITS_ENABLED?.trim().toLowerCase() !== "false";
}

export function rateLimitConfig(scope: RateLimitScope): RateLimitConfig {
  const defaults = defaultConfigs[scope];
  const names = envNames[scope];

  return {
    limit: parsePositiveInt(process.env[names.limit], defaults.limit),
    windowSeconds: parsePositiveInt(process.env[names.windowSeconds], defaults.windowSeconds),
  };
}

function normalizeSubject(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^\w:@.+-]+/g, "_")
      .slice(0, 160) || "unknown"
  );
}

function rateLimitKey(input: RateLimitInput) {
  const householdKey = input.householdId ? `household:${input.householdId}` : "global";

  return [input.scope, householdKey, normalizeSubject(input.subject)].join(":");
}

export function rateLimitHeaders(outcome: RateLimitOutcome) {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(outcome.limit),
    "RateLimit-Remaining": String(outcome.remaining),
    "RateLimit-Reset": String(Math.ceil(outcome.resetAt.getTime() / 1000)),
  };

  if (!outcome.allowed) {
    headers["Retry-After"] = String(outcome.retryAfterSeconds);
  }

  return headers;
}

export function checkRateLimit(
  input: RateLimitCheckInput,
  store: RateLimitStore = defaultStore(),
): RateLimitOutcome {
  const config = rateLimitConfig(input.scope);

  return store.increment(rateLimitKey(input), {
    ...config,
    nowMs: input.nowMs ?? Date.now(),
  });
}

export function rateLimitSubjectFromRequest(request: Request, fallback = "unknown") {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || fallback;
}

export async function enforceRateLimit(input: RateLimitInput) {
  if (!rateLimitsEnabled()) {
    return null;
  }

  const outcome = checkRateLimit(input);

  if (outcome.allowed) {
    return outcome;
  }

  throw new ApiError(
    429,
    "RATE_LIMITED",
    "Too many requests. Try again later.",
    {
      limit: outcome.limit,
      resetAt: outcome.resetAt.toISOString(),
      retryAfterSeconds: outcome.retryAfterSeconds,
      scope: input.scope,
      windowSeconds: outcome.windowSeconds,
    },
    rateLimitHeaders(outcome),
  );
}
