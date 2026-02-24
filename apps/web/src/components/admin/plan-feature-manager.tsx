"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiUrl, readErrorMessage } from "@/lib/client-api";

type BillingPlan = {
  key: string;
  name: string;
  amountCents: number;
  currency: string;
  interval: "MONTH" | "YEAR" | "ONE_TIME";
  active: boolean;
  chatbotEnabled: boolean;
};

type PlanFeatureManagerProps = {
  plans: BillingPlan[];
};

type PlanFeatureRowProps = {
  plan: BillingPlan;
  onUpdated: () => void;
};

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function PlanFeatureRow({ plan, onUpdated }: PlanFeatureRowProps) {
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(plan.active);
  const [chatbotEnabled, setChatbotEnabled] = useState(plan.chatbotEnabled);
  const [initialActive, setInitialActive] = useState(plan.active);
  const [initialChatbotEnabled, setInitialChatbotEnabled] = useState(
    plan.chatbotEnabled,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setActive(plan.active);
    setChatbotEnabled(plan.chatbotEnabled);
    setInitialActive(plan.active);
    setInitialChatbotEnabled(plan.chatbotEnabled);
  }, [plan.active, plan.chatbotEnabled]);

  const dirty =
    active !== initialActive || chatbotEnabled !== initialChatbotEnabled;
  const busy = isPending || saving;

  const payload: Record<string, boolean> = {};

  if (active !== initialActive) {
    payload.active = active;
  }

  if (chatbotEnabled !== initialChatbotEnabled) {
    payload.chatbotEnabled = chatbotEnabled;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!dirty || busy) {
      return;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const response = await fetch(
        `${apiUrl}/api/admin/billing/plans/${plan.key}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }

      const body = (await response.json()) as {
        plan?: {
          active?: boolean;
          chatbotEnabled?: boolean;
        };
      };
      const nextActive = body.plan?.active ?? active;
      const nextChatbotEnabled = body.plan?.chatbotEnabled ?? chatbotEnabled;

      setActive(nextActive);
      setChatbotEnabled(nextChatbotEnabled);
      setInitialActive(nextActive);
      setInitialChatbotEnabled(nextChatbotEnabled);
      setSuccess("Saved");
      startTransition(() => {
        onUpdated();
      });
    } catch {
      setError(`Cannot reach API at ${apiUrl}. Start backend and try again.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="plan-feature-row" onSubmit={onSubmit}>
      <div>
        <p className="plan-feature-name">{plan.name}</p>
        <p className="muted">
          {formatMoney(plan.amountCents, plan.currency)} ·{" "}
          {formatStatus(plan.interval)}
        </p>
      </div>

      <div className="plan-feature-flags">
        <label className="checkbox-field">
          <span>Plan Available</span>
          <input
            type="checkbox"
            checked={active}
            disabled={busy}
            onChange={(event) => setActive(event.target.checked)}
          />
        </label>

        <label className="checkbox-field">
          <span>AI Assistant Access</span>
          <input
            type="checkbox"
            checked={chatbotEnabled}
            disabled={busy}
            onChange={(event) => setChatbotEnabled(event.target.checked)}
          />
        </label>
      </div>

      <div className="plan-feature-actions">
        <button
          className="btn secondary small"
          type="submit"
          disabled={!dirty || busy}
        >
          {busy ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="plan-feature-status">
        {error ? <p className="form-message error">{error}</p> : null}
        {success ? <p className="form-message success">{success}</p> : null}
      </div>
    </form>
  );
}

export function PlanFeatureManager({ plans }: PlanFeatureManagerProps) {
  const router = useRouter();

  if (plans.length === 0) {
    return <p className="muted">No plans available.</p>;
  }

  return (
    <div className="plan-feature-manager">
      {plans.map((plan) => (
        <PlanFeatureRow
          key={plan.key}
          plan={plan}
          onUpdated={() => {
            router.refresh();
          }}
        />
      ))}
    </div>
  );
}
