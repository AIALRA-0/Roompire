import Link from "next/link";
import { ArrowLeft, ShieldAlert, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { requirePageUser } from "@/server/auth/session";
import { listMembersForHousehold } from "@/server/households/service";

type PageProps = {
  params: Promise<{ locale: Locale; householdId: string }>;
};

type MemberListItem = Awaited<ReturnType<typeof listMembersForHousehold>>[number];

function roleLabel(
  role: MemberListItem["role"],
  common: Awaited<ReturnType<typeof getTranslations>>,
) {
  if (role === "OWNER") {
    return common("owner");
  }

  if (role === "ADMIN") {
    return common("admin");
  }

  if (role === "VIEWER") {
    return common("viewer");
  }

  return common("roleMember");
}

function ForbiddenMembersState({
  locale,
  title,
  body,
  back,
}: Readonly<{
  locale: Locale;
  title: string;
  body: string;
  back: string;
}>) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-center shadow-soft">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-amber-50 text-amber-700">
          <ShieldAlert aria-hidden="true" className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
        <Button asChild className="mt-6" variant="outline">
          <Link href={`/${locale}/app`}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {back}
          </Link>
        </Button>
      </section>
    </main>
  );
}

export default async function HouseholdMembersPage({ params }: PageProps) {
  const { locale, householdId } = await params;
  const identity = await getTranslations({ locale, namespace: "Identity" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const forbidden = await getTranslations({ locale, namespace: "Forbidden" });
  const user = await requirePageUser();

  let members: Awaited<ReturnType<typeof listMembersForHousehold>> | null = null;

  try {
    members = await listMembersForHousehold(user.id, householdId);
  } catch {
    members = null;
  }

  if (!members) {
    return (
      <ForbiddenMembersState
        back={forbidden("back")}
        body={forbidden("body")}
        locale={locale}
        title={forbidden("title")}
      />
    );
  }

  return (
    <main className="min-h-svh bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <section className="mx-auto max-w-4xl">
        <Button asChild className="mb-5" variant="outline">
          <Link href={`/${locale}/app`}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {forbidden("back")}
          </Link>
        </Button>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <UsersRound aria-hidden="true" className="h-5 w-5 text-primary" />
                  <h1 className="text-2xl font-semibold">{identity("memberDirectory")}</h1>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {identity("memberDirectoryHint")}
                </p>
              </div>
              <Badge variant="success">{identity("apiBoundary")}</Badge>
            </div>
          </div>

          <div className="divide-y divide-border">
            {members.map((member) => (
              <div className="flex items-center justify-between gap-3 p-5" key={member.id}>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {member.displayNameOverride ?? member.user.displayName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{member.user.email}</p>
                </div>
                <Badge variant="neutral">{roleLabel(member.role, common)}</Badge>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
