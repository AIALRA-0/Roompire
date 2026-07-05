"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type ProposalReceiptUploadLabels = {
  attachReceipt: string;
  receiptHint: string;
  receiptAttached: string;
  selectedReceipt: string;
  errorFallback: string;
  working: string;
};

type ProposalReceiptUploadProps = {
  householdId: string;
  proposalId: string;
  labels: ProposalReceiptUploadLabels;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

type FileUploadIntentResponse = {
  file: {
    id: string;
  };
  upload: {
    uploadUrl: string;
    headers: Record<string, string>;
  };
};

async function postJson<T>(url: string, body: unknown, errorFallback: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload: unknown = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object" ? (payload as ApiErrorPayload) : null;
    throw new Error(errorPayload?.error?.message ?? errorFallback);
  }

  return payload as T;
}

async function uploadAndAttachReceipt({
  errorFallback,
  file,
  householdId,
  proposalId,
}: {
  errorFallback: string;
  file: File;
  householdId: string;
  proposalId: string;
}) {
  const intent = await postJson<FileUploadIntentResponse>(
    `/api/v1/households/${householdId}/files/presign-upload`,
    {
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    },
    errorFallback,
  );
  const uploadResponse = await fetch(intent.upload.uploadUrl, {
    method: "PUT",
    credentials: "same-origin",
    headers: intent.upload.headers,
    body: file,
  });
  const isJson = uploadResponse.headers.get("content-type")?.includes("application/json");
  const payload: unknown = isJson ? await uploadResponse.json() : null;

  if (!uploadResponse.ok) {
    const errorPayload =
      payload && typeof payload === "object" ? (payload as ApiErrorPayload) : null;
    throw new Error(errorPayload?.error?.message ?? errorFallback);
  }

  await postJson(
    `/api/v1/households/${householdId}/files/complete-upload`,
    {
      fileId: intent.file.id,
      proposalId,
      purpose: "receipt",
    },
    errorFallback,
  );
}

export function ProposalReceiptUpload({
  householdId,
  labels,
  proposalId,
}: ProposalReceiptUploadProps) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submitReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage(null);

    if (!file) {
      return;
    }

    setIsUploading(true);

    try {
      await uploadAndAttachReceipt({
        errorFallback: labels.errorFallback,
        file,
        householdId,
        proposalId,
      });
      form.reset();
      setFile(null);
      setMessage(labels.receiptAttached);
      router.refresh();
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className="mt-3 grid gap-2" onSubmit={submitReceipt}>
      <label className="grid gap-1.5 text-sm font-medium">
        <span>{labels.attachReceipt}</span>
        <input
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="sr-only"
          data-testid="proposal-receipt-upload-file"
          name="receipt"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          type="file"
        />
        <span className="rounded-md border border-dashed border-input px-3 py-2 text-xs text-muted-foreground">
          {file ? `${labels.selectedReceipt}: ${file.name}` : labels.receiptHint}
        </span>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          data-testid="proposal-receipt-upload-submit"
          disabled={isUploading || !file}
          size="sm"
          type="submit"
        >
          <Upload aria-hidden="true" className="h-4 w-4" />
          {isUploading ? labels.working : labels.attachReceipt}
        </Button>
        {message ? (
          <p className="text-xs text-muted-foreground" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
