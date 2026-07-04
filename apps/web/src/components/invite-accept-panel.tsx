"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type InviteAcceptPanelProps = {
  token: string;
  locale: string;
  labels: {
    accept: string;
    accepted: string;
    openDashboard: string;
    errorFallback: string;
    working: string;
  };
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

export function InviteAcceptPanel({ token, locale, labels }: InviteAcceptPanelProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isAccepted, setIsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function acceptInvite() {
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/v1/invites/accept", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const payload: unknown = isJson ? await response.json() : null;

      if (!response.ok) {
        const errorPayload =
          payload && typeof payload === "object" ? (payload as ApiErrorPayload) : null;
        throw new Error(errorPayload?.error?.message ?? labels.errorFallback);
      }

      setIsAccepted(true);
      setMessage(labels.accepted);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-6 grid gap-3">
      {isAccepted ? (
        <Button asChild>
          <Link href={`/${locale}/app`}>{labels.openDashboard}</Link>
        </Button>
      ) : (
        <Button disabled={isSubmitting} onClick={acceptInvite} type="button">
          {isSubmitting ? labels.working : labels.accept}
        </Button>
      )}
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
