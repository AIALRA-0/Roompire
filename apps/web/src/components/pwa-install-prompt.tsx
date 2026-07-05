"use client";

import { useEffect, useState } from "react";
import { Check, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type PwaInstallPromptLabels = {
  install: string;
  installed: string;
  installing: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallStatus = "checking" | "unavailable" | "ready" | "installing" | "installed";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return "prompt" in event && "userChoice" in event;
}

function isStandaloneDisplayMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

export function PwaInstallPrompt({ labels }: { labels: PwaInstallPromptLabels }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [status, setStatus] = useState<InstallStatus>("checking");

  useEffect(() => {
    let isMounted = true;
    let hasInstallPrompt = false;

    const markInstalled = () => {
      if (!isMounted) {
        return;
      }

      hasInstallPrompt = false;
      setInstallPrompt(null);
      setStatus("installed");
    };
    const timeoutId = window.setTimeout(() => {
      if (!isMounted || hasInstallPrompt) {
        return;
      }

      setStatus(isStandaloneDisplayMode() ? "installed" : "unavailable");
    }, 0);
    const handleBeforeInstallPrompt = (event: Event) => {
      if (!isBeforeInstallPromptEvent(event)) {
        return;
      }

      event.preventDefault();
      hasInstallPrompt = true;

      if (isMounted) {
        setInstallPrompt(event);
        setStatus("ready");
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", markInstalled);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      return;
    }

    setStatus("installing");

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      setStatus(
        choice.outcome === "accepted" || isStandaloneDisplayMode() ? "installed" : "unavailable",
      );
    } catch (error) {
      console.error(error);
      setStatus("ready");
    }
  }

  if (status === "installed") {
    return (
      <Badge data-testid="pwa-install-status" variant="success">
        <Check aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
        {labels.installed}
      </Badge>
    );
  }

  if (status !== "ready" && status !== "installing") {
    return null;
  }

  return (
    <Button
      data-testid="pwa-install-button"
      disabled={status === "installing"}
      onClick={() => {
        void install();
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      <Download aria-hidden="true" className="h-4 w-4" />
      {status === "installing" ? labels.installing : labels.install}
    </Button>
  );
}
