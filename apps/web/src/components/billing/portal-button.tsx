"use client";

import { useState } from "react";
import { apiUrl, readErrorMessage } from "@/lib/client-api";

type PortalButtonProps = {
  className?: string;
};

export function PortalButton({ className }: PortalButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onOpenPortal = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/billing/portal-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          returnPath: "/app/billing",
        }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }

      const payload = (await response.json()) as {
        url?: string;
      };

      if (!payload.url) {
        setError("Unable to open the billing portal.");
        return;
      }

      window.location.assign(payload.url);
    } catch {
      setError(
        `Unable to connect to API at ${apiUrl}. Start backend and try again.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="billing-action">
      <button
        type="button"
        className={className ?? "btn secondary"}
        disabled={submitting}
        onClick={onOpenPortal}
      >
        {submitting ? "Opening portal..." : "Open billing portal"}
      </button>
      {error ? <p className="form-message error">{error}</p> : null}
    </div>
  );
}
