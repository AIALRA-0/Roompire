import { describe, expect, it } from "vitest";
import {
  basicAuthorizationHeader,
  resolveConfiguredSiteGateSessionEmail,
  resolveSiteGateSessionEmailFromAuthorization,
} from "./site-gate";

describe("site gate session identity", () => {
  it("maps a verified email username to the app session email", () => {
    const authorization = basicAuthorizationHeader("Gate.User@example.test", "secret");

    expect(
      resolveSiteGateSessionEmailFromAuthorization(authorization, {
        ROOMPIRE_SITE_GATE_USERNAME: "Gate.User@example.test",
        ROOMPIRE_SITE_GATE_PASSWORD: "secret",
      }),
    ).toBe("gate.user@example.test");
  });

  it("supports a separate session email for non-email gate usernames", () => {
    const authorization = basicAuthorizationHeader("roompire", "secret");

    expect(
      resolveSiteGateSessionEmailFromAuthorization(authorization, {
        ROOMPIRE_SITE_GATE_USERNAME: "roompire",
        ROOMPIRE_SITE_GATE_PASSWORD: "secret",
        ROOMPIRE_SITE_GATE_SESSION_EMAIL: "Owner@example.test",
      }),
    ).toBe("owner@example.test");
  });

  it("resolves the configured session email without checking a request header", () => {
    expect(
      resolveConfiguredSiteGateSessionEmail({
        ROOMPIRE_SITE_GATE_USERNAME: "roompire",
        ROOMPIRE_SITE_GATE_PASSWORD: "secret",
        ROOMPIRE_SITE_GATE_SESSION_EMAIL: "Owner@example.test",
      }),
    ).toBe("owner@example.test");
  });

  it("rejects missing, malformed, or incorrect credentials", () => {
    const env = {
      ROOMPIRE_SITE_GATE_USERNAME: "owner@example.test",
      ROOMPIRE_SITE_GATE_PASSWORD: "secret",
    };

    expect(resolveSiteGateSessionEmailFromAuthorization(null, env)).toBeNull();
    expect(resolveSiteGateSessionEmailFromAuthorization("Bearer nope", env)).toBeNull();
    expect(
      resolveSiteGateSessionEmailFromAuthorization(
        basicAuthorizationHeader("owner@example.test", "wrong"),
        env,
      ),
    ).toBeNull();
  });

  it("rejects non-email usernames unless a session email mapping is configured", () => {
    const authorization = basicAuthorizationHeader("roompire", "secret");

    expect(
      resolveSiteGateSessionEmailFromAuthorization(authorization, {
        ROOMPIRE_SITE_GATE_USERNAME: "roompire",
        ROOMPIRE_SITE_GATE_PASSWORD: "secret",
      }),
    ).toBeNull();
  });
});
