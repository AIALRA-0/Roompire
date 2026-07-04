import Link from "next/link";
import { ArrowRight, ShieldAlert, UserPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { InviteAcceptPanel } from "@/components/invite-accept-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { requirePageUser } from "@/server/auth/session";
import { getInvitePreviewForUser } from "@/server/households/service";

type PageProps = {
  params: Promise<{ locale: Locale; token: string }>;
};

type InviteRole = NonNullable<
  Awaited<ReturnType<typeof getInvitePreviewForUser>>["invite"]
>["role"];

function roleLabel(role: InviteRole, common: Awaited<ReturnType<typeof getTranslations>>) {
  if (role === "ADMIN") {
    return common("admin");
  }

  if (role === "VIEWER") {
    return common("viewer");
  }

  return common("roleMember");
}

function InviteStateShell({
  icon,
  product,
  title,
  body,
  children,
}: Readonly<{
  icon: React.ReactNode;
  product: string;
  title: string;
  body: string;
  children: React.ReactNode;
}>) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-soft">
        <p className="text-xs font-medium uppercase text-muted-foreground">{product}</p>
        <div className="mt-5 flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
        <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
        {children}
      </section>
    </main>
  );
}

export default async function InvitePage({ params }: PageProps) {
  const { locale, token } = await params;
  const t = await getTranslations({ locale, namespace: "InvitePage" });
  const identity = await getTranslations({ locale, namespace: "Identity" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const user = await requirePageUser();
  const preview = await getInvitePreviewForUser(user.id, token);

  if (!preview.invite) {
    return (
      <InviteStateShell
        body={t("invalidBody")}
        icon={<ShieldAlert aria-hidden="true" className="h-6 w-6" />}
        product={common("product")}
        title={t("invalidTitle")}
      >
        <Button asChild className="mt-6" variant="outline">
          <Link href={`/${locale}/app`}>
            {t("openDashboard")}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Button>
      </InviteStateShell>
    );
  }

  if (preview.existingMembership) {
    return (
      <InviteStateShell
        body={t("alreadyMember")}
        icon={<UserPlus aria-hidden="true" className="h-6 w-6" />}
        product={common("product")}
        title={t("title")}
      >
        <Button asChild className="mt-6">
          <Link href={`/${locale}/app`}>
            {t("openDashboard")}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Button>
      </InviteStateShell>
    );
  }

  return (
    <InviteStateShell
      body={t("body", {
        householdName: preview.invite.household.name,
        email: user.email,
      })}
      icon={<UserPlus aria-hidden="true" className="h-6 w-6" />}
      product={common("product")}
      title={t("title")}
    >
      <div className="mt-5 flex flex-wrap gap-2">
        <Badge variant="success">{preview.invite.household.name}</Badge>
        <Badge variant="neutral">{roleLabel(preview.invite.role, common)}</Badge>
      </div>
      <InviteAcceptPanel
        labels={{
          accept: t("accept"),
          accepted: t("accepted"),
          openDashboard: t("openDashboard"),
          errorFallback: identity("errorFallback"),
          working: common("working"),
        }}
        locale={locale}
        token={token}
      />
    </InviteStateShell>
  );
}
