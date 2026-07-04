"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type HouseholdSummary = {
  id: string;
  name: string;
  role: Role;
  timezone: string;
  settlementCurrency: string;
};

type MemberSummary = {
  id: string;
  displayName: string;
  email: string;
  role: Role;
};

type DevUser = {
  email: string;
  displayName: string;
};

type IdentityLabels = {
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
  createHouseholdButton: string;
  householdCreated: string;
  householdList: string;
  activeHousehold: string;
  memberDirectory: string;
  memberDirectoryHint: string;
  inviteMember: string;
  inviteMemberHint: string;
  inviteEmail: string;
  inviteRole: string;
  createInvite: string;
  inviteCreated: string;
  inviteCode: string;
  acceptInvite: string;
  acceptInviteHint: string;
  inviteToken: string;
  acceptInviteButton: string;
  inviteAccepted: string;
  noHousehold: string;
  openMembers: string;
  cannotInvite: string;
  apiBoundary: string;
  apiBoundaryHint: string;
  errorFallback: string;
  working: string;
  roles: Record<Role, string>;
};

type IdentityWorkspaceProps = {
  locale: string;
  currentUserEmail: string;
  activeHouseholdId: string | null;
  canInviteMembers: boolean;
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

async function submitJson<T>(url: string, body: unknown, errorFallback: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload;
    throw new Error(errorPayload.error?.message ?? errorFallback);
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

export function IdentityWorkspace({
  locale,
  currentUserEmail,
  activeHouseholdId,
  canInviteMembers,
  households,
  members,
  devUsers,
  labels,
}: IdentityWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [devEmail, setDevEmail] = useState(currentUserEmail);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [acceptMessage, setAcceptMessage] = useState<string | null>(null);

  function refreshAfter(messageSetter: (message: string) => void, message: string) {
    messageSetter(message);
    startTransition(() => router.refresh());
  }

  async function onSwitchDevUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateMessage(null);
    setInviteMessage(null);
    setAcceptMessage(null);

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
          settlementCurrency: String(formData.get("settlementCurrency") ?? ""),
        },
        labels.errorFallback,
      );
      form.reset();
      refreshAfter(setCreateMessage, labels.householdCreated);
    } catch (error) {
      setCreateMessage(error instanceof Error ? error.message : labels.errorFallback);
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
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{labels.householdAccess}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{labels.householdAccessHint}</p>
            </div>
            <Badge variant="neutral">{labels.apiBoundary}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{labels.apiBoundaryHint}</p>

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
                      {household.timezone} · {household.settlementCurrency}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/${locale}/app/households/${household.id}/members`}>
                      {labels.openMembers}
                    </a>
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{labels.memberDirectory}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.memberDirectoryHint}</p>

          <div className="mt-5 divide-y divide-border">
            {members.map((member) => (
              <div className="flex items-center justify-between gap-3 py-3" key={member.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
                <Badge variant={roleBadgeVariant(member.role)}>{labels.roles[member.role]}</Badge>
              </div>
            ))}
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

        <form className="rounded-lg border border-border bg-card p-5" onSubmit={onCreateHousehold}>
          <h2 className="text-lg font-semibold">{labels.createHousehold}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.createHouseholdHint}</p>
          <div className="mt-4 grid gap-3">
            <Field label={labels.householdName}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                name="name"
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={labels.timezone}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  defaultValue="America/Los_Angeles"
                  name="timezone"
                  required
                />
              </Field>
              <Field label={labels.settlementCurrency}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm uppercase focus-ring"
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
