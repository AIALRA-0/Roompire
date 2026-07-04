"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type HouseholdExportActionsProps = {
  activeHouseholdId: string | null;
  labels: {
    title: string;
    hint: string;
    dataset: string;
    format: string;
    download: string;
    ready: string;
    unavailable: string;
    errorFallback: string;
    datasets: Record<string, string>;
    formats: Record<string, string>;
  };
};

export function HouseholdExportActions({ activeHouseholdId, labels }: HouseholdExportActionsProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    if (!activeHouseholdId) {
      setMessage(labels.unavailable);
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch(`/api/v1/households/${activeHouseholdId}/exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset: String(formData.get("dataset") ?? "expense_proposals"),
          format: String(formData.get("format") ?? "json"),
        }),
      });

      if (!response.ok) {
        throw new Error(`Export request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { export: { downloadUrl: string } };

      setMessage(labels.ready);
      window.location.assign(payload.export.downloadUrl);
    } catch {
      setMessage(labels.errorFallback);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card" data-testid="export-panel">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">{labels.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.hint}</p>
      </div>
      <form
        action={handleSubmit}
        className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end"
      >
        <label className="grid gap-2 text-sm font-medium">
          {labels.dataset}
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="export-dataset"
            name="dataset"
          >
            {Object.entries(labels.datasets).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {labels.format}
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="export-format"
            name="format"
          >
            {Object.entries(labels.formats).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button
          data-testid="export-create"
          disabled={!activeHouseholdId || isSubmitting}
          type="submit"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          {labels.download}
        </Button>
        {message ? (
          <p className="text-sm text-muted-foreground md:col-span-3" role="status">
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
