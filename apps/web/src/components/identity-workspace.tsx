"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
type DefaultLocale = "en-US" | "zh-CN";
type FxPolicy =
  | "LOCK_AT_EXPENSE_DATE"
  | "ORIGINAL_CURRENCY_DEBT"
  | "MANUAL_RATE_WITH_APPROVAL"
  | "FX_DIFFERENCE_ADJUSTMENT";
type ApprovalPolicy = "PAYER_AND_EACH_DEBTOR" | "ALL_PARTICIPANTS" | "PAYER_ONLY";
type ClearingPolicy = "DIRECT_ONLY" | "HOUSEHOLD_NETTING";
type JsonMethod = "POST" | "PATCH" | "DELETE";

type HouseholdSummary = {
  id: string;
  name: string;
  role: Role;
  timezone: string;
  settlementCurrency: string;
  defaultLocale: DefaultLocale;
  fxPolicy: FxPolicy;
  approvalPolicy: ApprovalPolicy;
  clearingPolicy: ClearingPolicy;
};

type MemberSummary = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: Role;
};

type DevUser = {
  email: string;
  displayName: string;
};

type NotificationPreferences = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  proposalUpdatesEnabled: boolean;
  settlementUpdatesEnabled: boolean;
  taskRemindersEnabled: boolean;
};

type IdentityLabels = {
  profileSettings: string;
  profileSettingsHint: string;
  displayName: string;
  preferredLocale: string;
  notificationPreferences: string;
  notificationPreferencesHint: string;
  inAppNotifications: string;
  emailNotifications: string;
  proposalUpdates: string;
  settlementUpdates: string;
  taskReminders: string;
  saveProfile: string;
  profileSaved: string;
  devSession: string;
  devSessionHint: string;
  devUser: string;
  useDevUser: string;
  householdAccess: string;
  householdAccessHint: string;
  createHousehold: string;
  createHouseholdHint: string;
  householdName: string;
  timezone: string;
  settlementCurrency: string;
  defaultLocale: string;
  fxPolicy: string;
  approvalPolicy: string;
  clearingPolicy: string;
  approvalEachDebtor: string;
  approvalAllParticipants: string;
  approvalPayerOnly: string;
  clearingDirectOnly: string;
  clearingHouseholdNetting: string;
  fxLockExpenseDate: string;
  fxManualApproval: string;
  householdSettings: string;
  householdSettingsHint: string;
  saveSettings: string;
  settingsSaved: string;
  createHouseholdButton: string;
  householdCreated: string;
  householdList: string;
  activeHousehold: string;
  activeHouseholdHint: string;
  useHousehold: string;
  householdSwitched: string;
  memberDirectory: string;
  memberDirectoryHint: string;
  inviteMember: string;
  inviteMemberHint: string;
  inviteEmail: string;
  inviteRole: string;
  createInvite: string;
  inviteCreated: string;
  inviteCode: string;
  inviteLink: string;
  acceptInvite: string;
  acceptInviteHint: string;
  inviteToken: string;
  acceptInviteButton: string;
  inviteAccepted: string;
  noHousehold: string;
  openMembers: string;
  updateRole: string;
  roleUpdated: string;
  removeMember: string;
  memberRemoved: string;
  transferOwnership: string;
  ownershipTransferred: string;
  ownershipTransferHint: string;
  memberManagement: string;
  memberManagementHint: string;
  cannotInvite: string;
  cannotManageMembers: string;
  apiBoundary: string;
  apiBoundaryHint: string;
  errorFallback: string;
  working: string;
  locales: Record<DefaultLocale, string>;
  roles: Record<Role, string>;
};

type IdentityWorkspaceProps = {
  locale: string;
  currentUserEmail: string;
  currentUserDisplayName: string;
  currentUserPreferredLocale: DefaultLocale;
  notificationPreferences: NotificationPreferences;
  activeHouseholdId: string | null;
  canInviteMembers: boolean;
  canManageMembers: boolean;
  households: HouseholdSummary[];
  members: MemberSummary[];
  devUsers: DevUser[];
  labels: IdentityLabels;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

async function submitJson<T>(
  url: string,
  body: unknown,
  errorFallback: string,
  method: JsonMethod = "POST",
): Promise<T> {
  const requestInit: RequestInit = {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  }

  const response = await fetch(url, requestInit);
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload: unknown = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object" ? (payload as ApiErrorPayload) : null;
    throw new Error(errorPayload?.error?.message ?? errorFallback);
  }

  return payload as T;
}

function Field({
  label,
  children,
}: Readonly<{
  label: string;
  children: React.ReactNode;
}>) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function roleBadgeVariant(role: Role) {
  if (role === "OWNER") {
    return "success" as const;
  }

  if (role === "ADMIN") {
    return "default" as const;
  }

  if (role === "VIEWER") {
    return "neutral" as const;
  }

  return "warning" as const;
}

function roleInputOptions(labels: IdentityLabels, currentRole: Role) {
  const options: Array<{ value: Role; label: string; disabled?: boolean }> = [
    { value: "ADMIN", label: labels.roles.ADMIN },
    { value: "MEMBER", label: labels.roles.MEMBER },
    { value: "VIEWER", label: labels.roles.VIEWER },
  ];

  if (currentRole === "OWNER") {
    return [{ value: "OWNER", label: labels.roles.OWNER, disabled: true }, ...options];
  }

  return options;
}

function fxPolicyOptions(labels: IdentityLabels) {
  return [
    { value: "LOCK_AT_EXPENSE_DATE", label: labels.fxLockExpenseDate },
    { value: "MANUAL_RATE_WITH_APPROVAL", label: labels.fxManualApproval },
  ] satisfies Array<{ value: FxPolicy; label: string }>;
}

function approvalPolicyOptions(labels: IdentityLabels) {
  return [
    { value: "PAYER_AND_EACH_DEBTOR", label: labels.approvalEachDebtor },
    { value: "ALL_PARTICIPANTS", label: labels.approvalAllParticipants },
    { value: "PAYER_ONLY", label: labels.approvalPayerOnly },
  ] satisfies Array<{ value: ApprovalPolicy; label: string }>;
}

function clearingPolicyOptions(labels: IdentityLabels) {
  return [
    { value: "DIRECT_ONLY", label: labels.clearingDirectOnly },
    { value: "HOUSEHOLD_NETTING", label: labels.clearingHouseholdNetting },
  ] satisfies Array<{ value: ClearingPolicy; label: string }>;
}

export function IdentityWorkspace({
  locale,
  currentUserEmail,
  currentUserDisplayName,
  currentUserPreferredLocale,
  notificationPreferences,
  activeHouseholdId,
  canInviteMembers,
  canManageMembers,
  households,
  members,
  devUsers,
  labels,
}: IdentityWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [devEmail, setDevEmail] = useState(currentUserEmail);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [householdMessage, setHouseholdMessage] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [memberMessage, setMemberMessage] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [acceptMessage, setAcceptMessage] = useState<string | null>(null);
  const activeHousehold =
    households.find((household) => household.id === activeHouseholdId) ?? null;
  const inviteHref = inviteToken ? `/${locale}/invite/${inviteToken}` : null;
  const settingsDisabled = !activeHouseholdId || !activeHousehold || !canManageMembers;
  const canTransferOwnership = activeHousehold?.role === "OWNER";

  function clearActionMessages() {
    setProfileMessage(null);
    setCreateMessage(null);
    setHouseholdMessage(null);
    setSettingsMessage(null);
    setMemberMessage(null);
    setInviteMessage(null);
    setAcceptMessage(null);
  }

  function refreshAfter(messageSetter: (message: string) => void, message: string) {
    messageSetter(message);
    startTransition(() => router.refresh());
  }

  async function onSwitchDevUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearActionMessages();

    const selectedUser = devUsers.find((user) => user.email === devEmail);

    try {
      await submitJson(
        "/api/v1/dev/session",
        { email: devEmail, displayName: selectedUser?.displayName },
        labels.errorFallback,
      );
      startTransition(() => router.refresh());
    } catch (error) {
      setCreateMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  async function onUpdateUserSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage(null);
    const formData = new FormData(event.currentTarget);

    try {
      await submitJson(
        "/api/v1/users/me",
        {
          displayName: String(formData.get("displayName") ?? ""),
          preferredLocale: String(formData.get("preferredLocale") ?? "en-US"),
          notificationPreferences: {
            inAppEnabled: formData.has("inAppEnabled"),
            emailEnabled: formData.has("emailEnabled"),
            proposalUpdatesEnabled: formData.has("proposalUpdatesEnabled"),
            settlementUpdatesEnabled: formData.has("settlementUpdatesEnabled"),
            taskRemindersEnabled: formData.has("taskRemindersEnabled"),
          },
        },
        labels.errorFallback,
        "PATCH",
      );
      refreshAfter(setProfileMessage, labels.profileSaved);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  async function onCreateHousehold(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateMessage(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await submitJson(
        "/api/v1/households",
        {
          name: String(formData.get("name") ?? ""),
          timezone: String(formData.get("timezone") ?? ""),
          settlementCurrency: String(formData.get("settlementCurrency") ?? "").toUpperCase(),
        },
        labels.errorFallback,
      );
      form.reset();
      refreshAfter(setCreateMessage, labels.householdCreated);
    } catch (error) {
      setCreateMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  async function onSwitchActiveHousehold(householdId: string) {
    setHouseholdMessage(null);

    try {
      await submitJson(
        "/api/v1/session",
        {
          activeHouseholdId: householdId,
        },
        labels.errorFallback,
        "PATCH",
      );
      refreshAfter(setHouseholdMessage, labels.householdSwitched);
    } catch (error) {
      setHouseholdMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  async function onUpdateHouseholdSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsMessage(null);

    if (!activeHouseholdId) {
      setSettingsMessage(labels.noHousehold);
      return;
    }

    const formData = new FormData(event.currentTarget);

    try {
      await submitJson(
        `/api/v1/households/${activeHouseholdId}`,
        {
          name: String(formData.get("name") ?? ""),
          timezone: String(formData.get("timezone") ?? ""),
          settlementCurrency: String(formData.get("settlementCurrency") ?? "").toUpperCase(),
          defaultLocale: String(formData.get("defaultLocale") ?? "en-US"),
          fxPolicy: String(formData.get("fxPolicy") ?? "LOCK_AT_EXPENSE_DATE"),
          approvalPolicy: String(formData.get("approvalPolicy") ?? "PAYER_AND_EACH_DEBTOR"),
          clearingPolicy: String(formData.get("clearingPolicy") ?? "DIRECT_ONLY"),
        },
        labels.errorFallback,
        "PATCH",
      );
      refreshAfter(setSettingsMessage, labels.settingsSaved);
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  async function onUpdateMemberRole(event: React.FormEvent<HTMLFormElement>, membershipId: string) {
    event.preventDefault();
    setMemberMessage(null);

    if (!activeHouseholdId) {
      setMemberMessage(labels.noHousehold);
      return;
    }

    const formData = new FormData(event.currentTarget);

    try {
      await submitJson(
        `/api/v1/households/${activeHouseholdId}/members/${membershipId}`,
        {
          role: String(formData.get("role") ?? "MEMBER"),
        },
        labels.errorFallback,
        "PATCH",
      );
      refreshAfter(setMemberMessage, labels.roleUpdated);
    } catch (error) {
      setMemberMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  async function onRemoveMember(membershipId: string) {
    setMemberMessage(null);

    if (!activeHouseholdId) {
      setMemberMessage(labels.noHousehold);
      return;
    }

    try {
      await submitJson(
        `/api/v1/households/${activeHouseholdId}/members/${membershipId}`,
        undefined,
        labels.errorFallback,
        "DELETE",
      );
      refreshAfter(setMemberMessage, labels.memberRemoved);
    } catch (error) {
      setMemberMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  async function onTransferOwnership(membershipId: string) {
    setMemberMessage(null);

    if (!activeHouseholdId) {
      setMemberMessage(labels.noHousehold);
      return;
    }

    try {
      await submitJson(
        `/api/v1/households/${activeHouseholdId}/members/${membershipId}/transfer-ownership`,
        undefined,
        labels.errorFallback,
      );
      refreshAfter(setMemberMessage, labels.ownershipTransferred);
    } catch (error) {
      setMemberMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  async function onCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteMessage(null);
    setInviteToken(null);
    const form = event.currentTarget;

    if (!activeHouseholdId) {
      setInviteMessage(labels.noHousehold);
      return;
    }

    const formData = new FormData(form);

    try {
      const result = await submitJson<{ token: string }>(
        `/api/v1/households/${activeHouseholdId}/invites`,
        {
          email: String(formData.get("email") ?? ""),
          role: String(formData.get("role") ?? "MEMBER"),
        },
        labels.errorFallback,
      );
      setInviteMessage(labels.inviteCreated);
      setInviteToken(result.token);
      form.reset();
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  async function onAcceptInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAcceptMessage(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await submitJson(
        "/api/v1/invites/accept",
        {
          token: String(formData.get("token") ?? ""),
        },
        labels.errorFallback,
      );
      form.reset();
      refreshAfter(setAcceptMessage, labels.inviteAccepted);
    } catch (error) {
      setAcceptMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_410px]">
      <div className="grid gap-6">
        <form
          className="rounded-lg border border-border bg-card p-5"
          data-testid="profile-settings-form"
          onSubmit={onUpdateUserSettings}
        >
          <h2 className="text-lg font-semibold">{labels.profileSettings}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.profileSettingsHint}</p>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={labels.displayName}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="profile-display-name"
                  defaultValue={currentUserDisplayName}
                  maxLength={80}
                  name="displayName"
                  required
                />
              </Field>
              <Field label={labels.preferredLocale}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="profile-preferred-locale"
                  defaultValue={currentUserPreferredLocale}
                  name="preferredLocale"
                >
                  <option value="en-US">{labels.locales["en-US"]}</option>
                  <option value="zh-CN">{labels.locales["zh-CN"]}</option>
                </select>
              </Field>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium">{labels.notificationPreferences}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {labels.notificationPreferencesHint}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  {
                    name: "inAppEnabled",
                    label: labels.inAppNotifications,
                    defaultChecked: notificationPreferences.inAppEnabled,
                  },
                  {
                    name: "emailEnabled",
                    label: labels.emailNotifications,
                    defaultChecked: notificationPreferences.emailEnabled,
                  },
                  {
                    name: "proposalUpdatesEnabled",
                    label: labels.proposalUpdates,
                    defaultChecked: notificationPreferences.proposalUpdatesEnabled,
                  },
                  {
                    name: "settlementUpdatesEnabled",
                    label: labels.settlementUpdates,
                    defaultChecked: notificationPreferences.settlementUpdatesEnabled,
                  },
                  {
                    name: "taskRemindersEnabled",
                    label: labels.taskReminders,
                    defaultChecked: notificationPreferences.taskRemindersEnabled,
                  },
                ].map((option) => (
                  <label
                    className="flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm"
                    key={option.name}
                  >
                    <input
                      className="h-4 w-4 accent-primary"
                      data-testid={`profile-${option.name}`}
                      defaultChecked={option.defaultChecked}
                      name={option.name}
                      type="checkbox"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button disabled={isPending} type="submit">
              {isPending ? labels.working : labels.saveProfile}
            </Button>
            {profileMessage ? (
              <p className="text-sm text-muted-foreground" role="status">
                {profileMessage}
              </p>
            ) : null}
          </div>
        </form>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{labels.householdAccess}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{labels.householdAccessHint}</p>
            </div>
            <Badge variant="neutral">{labels.apiBoundary}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{labels.apiBoundaryHint}</p>
          <p className="mt-2 text-sm text-muted-foreground">{labels.activeHouseholdHint}</p>

          <div className="mt-5 grid gap-3">
            {households.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                {labels.noHousehold}
              </div>
            ) : (
              households.map((household) => (
                <div
                  className={cn(
                    "grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-[1fr_auto] md:items-center",
                    household.id === activeHouseholdId && "border-primary/50",
                  )}
                  data-testid={`household-row-${household.id}`}
                  key={household.id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{household.name}</p>
                      {household.id === activeHouseholdId ? (
                        <Badge variant="success">{labels.activeHousehold}</Badge>
                      ) : null}
                      <Badge variant={roleBadgeVariant(household.role)}>
                        {labels.roles[household.role]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {household.timezone} · {household.settlementCurrency} ·{" "}
                      {labels.locales[household.defaultLocale]}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {household.id !== activeHouseholdId ? (
                      <Button
                        data-testid={`household-switch-${household.id}`}
                        disabled={isPending}
                        onClick={() => onSwitchActiveHousehold(household.id)}
                        size="sm"
                        type="button"
                      >
                        {isPending ? labels.working : labels.useHousehold}
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="outline">
                      <a href={`/${locale}/app/households/${household.id}/members`}>
                        {labels.openMembers}
                      </a>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          {householdMessage ? (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              {householdMessage}
            </p>
          ) : null}
        </div>

        <form
          className="rounded-lg border border-border bg-card p-5"
          data-testid="household-settings-form"
          onSubmit={onUpdateHouseholdSettings}
        >
          <h2 className="text-lg font-semibold">{labels.householdSettings}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.householdSettingsHint}</p>
          {!canManageMembers ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {labels.cannotManageMembers}
            </p>
          ) : null}

          <div className="mt-4 grid gap-3">
            <Field label={labels.householdName}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="settings-household-name"
                defaultValue={activeHousehold?.name ?? ""}
                disabled={settingsDisabled}
                name="name"
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={labels.timezone}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="settings-household-timezone"
                  defaultValue={activeHousehold?.timezone ?? "America/Los_Angeles"}
                  disabled={settingsDisabled}
                  name="timezone"
                  required
                />
              </Field>
              <Field label={labels.settlementCurrency}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm uppercase focus-ring"
                  data-testid="settings-household-currency"
                  defaultValue={activeHousehold?.settlementCurrency ?? "CNY"}
                  disabled={settingsDisabled}
                  maxLength={3}
                  minLength={3}
                  name="settlementCurrency"
                  required
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={labels.defaultLocale}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="settings-household-locale"
                  defaultValue={activeHousehold?.defaultLocale ?? "en-US"}
                  disabled={settingsDisabled}
                  name="defaultLocale"
                >
                  <option value="en-US">{labels.locales["en-US"]}</option>
                  <option value="zh-CN">{labels.locales["zh-CN"]}</option>
                </select>
              </Field>
              <Field label={labels.fxPolicy}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="settings-household-fx-policy"
                  defaultValue={activeHousehold?.fxPolicy ?? "LOCK_AT_EXPENSE_DATE"}
                  disabled={settingsDisabled}
                  name="fxPolicy"
                >
                  {fxPolicyOptions(labels).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={labels.approvalPolicy}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="settings-household-approval-policy"
                  defaultValue={activeHousehold?.approvalPolicy ?? "PAYER_AND_EACH_DEBTOR"}
                  disabled={settingsDisabled}
                  name="approvalPolicy"
                >
                  {approvalPolicyOptions(labels).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={labels.clearingPolicy}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="settings-household-clearing-policy"
                  defaultValue={activeHousehold?.clearingPolicy ?? "DIRECT_ONLY"}
                  disabled={settingsDisabled}
                  name="clearingPolicy"
                >
                  {clearingPolicyOptions(labels).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Button disabled={isPending || settingsDisabled} type="submit">
              {isPending ? labels.working : labels.saveSettings}
            </Button>
            {settingsMessage ? (
              <p className="text-sm text-muted-foreground" role="status">
                {settingsMessage}
              </p>
            ) : null}
          </div>
        </form>

        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{labels.memberDirectory}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.memberDirectoryHint}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{labels.memberManagement}</p>
              <p className="mt-1 text-xs text-muted-foreground">{labels.memberManagementHint}</p>
            </div>
            <Badge variant={canManageMembers ? "success" : "neutral"}>
              {canManageMembers ? labels.roles.ADMIN : labels.roles.VIEWER}
            </Badge>
          </div>
          {!canManageMembers ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {labels.cannotManageMembers}
            </p>
          ) : null}

          {memberMessage ? (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              {memberMessage}
            </p>
          ) : null}

          <div className="mt-5 grid gap-3">
            {members.map((member) => {
              const isSelf = member.email === currentUserEmail;
              const isOwner = member.role === "OWNER";
              const canEditMember = canManageMembers && !isSelf && !isOwner;
              const canTransferMemberOwnership = canTransferOwnership && !isSelf && !isOwner;

              return (
                <form
                  className="grid gap-3 rounded-lg border border-border bg-background p-4"
                  data-testid={`member-row-${member.email}`}
                  key={member.id}
                  onSubmit={(event) => onUpdateMemberRole(event, member.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <Badge variant={roleBadgeVariant(member.role)}>
                      {labels.roles[member.role]}
                    </Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <select
                      aria-label={`${labels.updateRole} ${member.displayName}`}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                      defaultValue={member.role}
                      disabled={!canEditMember}
                      name="role"
                    >
                      {roleInputOptions(labels, member.role).map((option) => (
                        <option disabled={option.disabled} key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      data-testid={`member-update-${member.email}`}
                      disabled={isPending || !canEditMember}
                      type="submit"
                      variant="outline"
                    >
                      {isPending ? labels.working : labels.updateRole}
                    </Button>
                    <Button
                      data-testid={`member-remove-${member.email}`}
                      disabled={isPending || !canEditMember}
                      onClick={() => onRemoveMember(member.id)}
                      type="button"
                      variant="outline"
                    >
                      {isPending ? labels.working : labels.removeMember}
                    </Button>
                    <Button
                      data-testid={`member-transfer-ownership-${member.email}`}
                      disabled={isPending || !canTransferMemberOwnership}
                      onClick={() => onTransferOwnership(member.id)}
                      type="button"
                      variant="outline"
                    >
                      {isPending ? labels.working : labels.transferOwnership}
                    </Button>
                  </div>
                  {canTransferMemberOwnership ? (
                    <p className="text-xs text-muted-foreground">{labels.ownershipTransferHint}</p>
                  ) : null}
                </form>
              );
            })}
            {members.length === 0 ? (
              <div className="py-6 text-sm text-muted-foreground">{labels.noHousehold}</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <form className="rounded-lg border border-border bg-card p-5" onSubmit={onSwitchDevUser}>
          <h2 className="text-lg font-semibold">{labels.devSession}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.devSessionHint}</p>
          <div className="mt-4 grid gap-3">
            <Field label={labels.devUser}>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                name="email"
                onChange={(event) => setDevEmail(event.target.value)}
                value={devEmail}
              >
                {devUsers.map((user) => (
                  <option key={user.email} value={user.email}>
                    {user.displayName} · {user.email}
                  </option>
                ))}
              </select>
            </Field>
            <Button disabled={isPending} type="submit" variant="outline">
              {isPending ? labels.working : labels.useDevUser}
            </Button>
          </div>
        </form>

        <form
          className="rounded-lg border border-border bg-card p-5"
          data-testid="create-household-form"
          onSubmit={onCreateHousehold}
        >
          <h2 className="text-lg font-semibold">{labels.createHousehold}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.createHouseholdHint}</p>
          <div className="mt-4 grid gap-3">
            <Field label={labels.householdName}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="create-household-name"
                name="name"
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={labels.timezone}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="create-household-timezone"
                  defaultValue="America/Los_Angeles"
                  name="timezone"
                  required
                />
              </Field>
              <Field label={labels.settlementCurrency}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm uppercase focus-ring"
                  data-testid="create-household-currency"
                  defaultValue="CNY"
                  maxLength={3}
                  minLength={3}
                  name="settlementCurrency"
                  required
                />
              </Field>
            </div>
            <Button disabled={isPending} type="submit">
              {isPending ? labels.working : labels.createHouseholdButton}
            </Button>
            {createMessage ? (
              <p className="text-sm text-muted-foreground" role="status">
                {createMessage}
              </p>
            ) : null}
          </div>
        </form>

        <form className="rounded-lg border border-border bg-card p-5" onSubmit={onCreateInvite}>
          <h2 className="text-lg font-semibold">{labels.inviteMember}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.inviteMemberHint}</p>
          {!canInviteMembers ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {labels.cannotInvite}
            </p>
          ) : null}
          <div className="mt-4 grid gap-3">
            <Field label={labels.inviteEmail}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                name="email"
                type="email"
              />
            </Field>
            <Field label={labels.inviteRole}>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                defaultValue="MEMBER"
                name="role"
              >
                <option value="MEMBER">{labels.roles.MEMBER}</option>
                <option value="ADMIN">{labels.roles.ADMIN}</option>
                <option value="VIEWER">{labels.roles.VIEWER}</option>
              </select>
            </Field>
            <Button disabled={isPending || !activeHouseholdId} type="submit" variant="outline">
              {isPending ? labels.working : labels.createInvite}
            </Button>
            {inviteMessage ? (
              <p className="text-sm text-muted-foreground" role="status">
                {inviteMessage}
              </p>
            ) : null}
            {inviteToken ? (
              <div className="rounded-md border border-border bg-background p-3 text-sm">
                <p className="font-medium">{labels.inviteCode}</p>
                <code
                  className="mt-2 block break-all text-muted-foreground"
                  data-testid="invite-token"
                >
                  {inviteToken}
                </code>
                {inviteHref ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="font-medium">{labels.inviteLink}</p>
                    <a
                      className="focus-ring mt-2 block break-all rounded-sm text-muted-foreground underline underline-offset-4"
                      data-testid="invite-link"
                      href={inviteHref}
                    >
                      {inviteHref}
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </form>

        <form className="rounded-lg border border-border bg-card p-5" onSubmit={onAcceptInvite}>
          <h2 className="text-lg font-semibold">{labels.acceptInvite}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.acceptInviteHint}</p>
          <div className="mt-4 grid gap-3">
            <Field label={labels.inviteToken}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                name="token"
                required
              />
            </Field>
            <Button disabled={isPending} type="submit" variant="outline">
              {isPending ? labels.working : labels.acceptInviteButton}
            </Button>
            {acceptMessage ? (
              <p className="text-sm text-muted-foreground" role="status">
                {acceptMessage}
              </p>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
