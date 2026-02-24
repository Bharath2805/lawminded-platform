import Link from "next/link";
import { CheckoutButton } from "@/components/billing/checkout-button";
import {
  fetchBillingPlansServer,
  fetchCurrentUserServer,
} from "@/lib/server-auth";

function formatPlanPrice(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function formatInterval(interval: "MONTH" | "YEAR" | "ONE_TIME") {
  if (interval === "MONTH") {
    return "mo";
  }

  if (interval === "YEAR") {
    return "yr";
  }

  return "one-time";
}

export default async function PricingPage() {
  const [plansResponse, user] = await Promise.all([
    fetchBillingPlansServer(),
    fetchCurrentUserServer(),
  ]);

  const plans = plansResponse?.plans ?? [];

  return (
    <section className="section">
      <div className="shell">
        <div className="section-head">
          <p className="eyebrow">Pricing</p>
          <h1>Select the plan that matches your governance needs.</h1>
        </div>

        {plans.length === 0 ? (
          <p className="muted">
            Pricing is temporarily unavailable. Please refresh and try again.
          </p>
        ) : (
          <div className="card-grid three">
            {plans.map((plan) => {
              const amount = formatPlanPrice(plan.amountCents, plan.currency);
              const interval = formatInterval(plan.interval);

              return (
                <article
                  key={plan.key}
                  className={
                    plan.highlighted
                      ? "price-card price-card-hot"
                      : "price-card"
                  }
                >
                  <h3>{plan.name}</h3>
                  <p className="price">
                    {amount}
                    {interval === "one-time" ? "" : `/${interval}`}
                  </p>
                  <p>{plan.description}</p>
                  <ul>
                    {plan.features.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>

                  <div className="price-actions">
                    {user ? (
                      <CheckoutButton
                        planKey={plan.key}
                        label={
                          interval === "one-time" ? "Purchase" : "Subscribe"
                        }
                        nextOnAuthFail="/pricing"
                        className="btn primary"
                      />
                    ) : (
                      <Link
                        href="/login?next=%2Fpricing"
                        className="btn primary"
                      >
                        Sign in to subscribe
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
