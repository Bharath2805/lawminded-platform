import { CheckoutButton } from "@/components/billing/checkout-button";
import { PortalButton } from "@/components/billing/portal-button";
import {
  fetchBillingMeServer,
  fetchBillingPlansServer,
} from "@/lib/server-auth";

function formatMoney(amountCents: number, currency: string) {
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

function toReadableStatus(status: string | undefined): string {
  if (!status) {
    return "No active subscription";
  }

  if (status === "TRIALING") {
    return "Trial active";
  }

  if (status === "ACTIVE") {
    return "Active";
  }

  if (status === "PAST_DUE") {
    return "Payment issue";
  }

  if (status === "CANCELED") {
    return "Canceled";
  }

  return status.replaceAll("_", " ").toLowerCase();
}

function toReadablePaymentStatus(status: string): string {
  if (status === "SUCCEEDED") {
    return "Succeeded";
  }

  if (status === "FAILED") {
    return "Failed";
  }

  if (status === "CANCELED") {
    return "Canceled";
  }

  if (status === "REFUNDED") {
    return "Refunded";
  }

  return status.replaceAll("_", " ").toLowerCase();
}

export default async function BillingPage() {
  const [billing, plansResponse] = await Promise.all([
    fetchBillingMeServer(),
    fetchBillingPlansServer(),
  ]);

  const plans = plansResponse?.plans ?? [];
  const subscription = billing?.subscription ?? null;

  return (
    <section className="section">
      <div className="shell">
        <div className="section-head">
          <p className="eyebrow">Billing</p>
          <h1>Manage your plan, payment method, and invoices.</h1>
          <p className="lead">
            Billing actions are processed through Stripe&apos;s secure customer
            portal.
          </p>
        </div>

        <div className="card-grid three">
          <article className="feature-card">
            <h3>Current Status</h3>
            <p>{toReadableStatus(subscription?.status)}</p>
          </article>
          <article className="feature-card">
            <h3>Current Plan</h3>
            <p>{subscription?.plan?.name ?? "No active plan"}</p>
          </article>
          <article className="feature-card">
            <h3>Period End</h3>
            <p>
              {subscription?.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                : "-"}
            </p>
          </article>
        </div>

        <div className="split billing-split">
          <article className="feature-card">
            <h3>Customer Portal</h3>
            <p>
              Update payment method, download invoices, and manage cancellation
              from the Stripe portal.
            </p>
            <PortalButton className="btn secondary" />
          </article>

          <article className="feature-card">
            <h3>Available Plans</h3>
            <div className="billing-plan-list">
              {plans.map((plan) => {
                const price = formatMoney(plan.amountCents, plan.currency);
                const interval = formatInterval(plan.interval);

                return (
                  <div key={plan.key} className="billing-plan-item">
                    <div>
                      <p className="billing-plan-title">{plan.name}</p>
                      <p className="muted">
                        {price}
                        {interval === "one-time" ? "" : `/${interval}`}
                      </p>
                    </div>
                    <CheckoutButton
                      planKey={plan.key}
                      label={
                        interval === "one-time"
                          ? "Buy"
                          : subscription?.plan?.key === plan.key
                            ? "Renew"
                            : "Choose"
                      }
                      className="btn ghost small"
                      nextOnAuthFail="/app/billing"
                    />
                  </div>
                );
              })}
            </div>
          </article>
        </div>

        <article className="feature-card">
          <h3>Recent Payments</h3>
          {billing?.payments && billing.payments.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {billing.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </td>
                      <td>{payment.plan?.name ?? "Not available"}</td>
                      <td>
                        {formatMoney(payment.amountCents, payment.currency)}
                      </td>
                      <td>{toReadablePaymentStatus(payment.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No payment history is available yet.</p>
          )}
        </article>
      </div>
    </section>
  );
}
