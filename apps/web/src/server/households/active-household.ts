export const ACTIVE_HOUSEHOLD_COOKIE_NAME = "roompire_active_household";
export const ACTIVE_HOUSEHOLD_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type HouseholdMembershipRef = {
  householdId: string;
};

export function selectActiveHouseholdMembership<T extends HouseholdMembershipRef>(
  memberships: T[],
  activeHouseholdId?: string | null,
) {
  return (
    memberships.find((membership) => membership.householdId === activeHouseholdId) ??
    memberships[0] ??
    null
  );
}

export function activeHouseholdCookieOptions() {
  return {
    httpOnly: true,
    maxAge: ACTIVE_HOUSEHOLD_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
