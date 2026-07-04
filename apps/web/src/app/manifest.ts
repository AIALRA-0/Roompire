import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Roompire",
    short_name: "Roompire",
    description: "Shared-house expenses, approvals, ledger, FX locks, and calendar operations.",
    start_url: "/en-US/app",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#16735a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
