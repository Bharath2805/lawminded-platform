"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl, readErrorMessage } from "@/lib/client-api";

type CheckoutButtonProps = {
  planKey: string;
  className?: string;
  label?: string;
  nextOnAuthFail?: string;
};

export function CheckoutButton({
  planKey,
  className,
  label,
  nextOnAuthFail,
}: CheckoutButtonProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCheckout = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/billing/checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ planKey }),
      });

      if (response.status === 401) {
        const next = nextOnAuthFail ?? "/app/billing";
        router.push(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }

      const payload = (await response.json()) as {
        url?: string;
      };

      if (!payload.url) {
        setError("Unable to create a checkout session.");
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
        className={className ?? "btn primary"}
        disabled={submitting}
        onClick={onCheckout}
      >
        {submitting ? "Redirecting..." : (label ?? "Choose plan")}
      </button>
      {error ? <p className="form-message error">{error}</p> : null}
    </div>
  );
}
