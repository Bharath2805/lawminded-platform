import Link from "next/link";
import {
  fetchBillingChatEntitlementServer,
  fetchBillingMeServer,
  fetchMyResourcesServer,
  requireUser,
} from "@/lib/server-auth";

function normalizeSubscriptionStatus(status: string | undefined): string {
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

  return status.replaceAll("_", " ");
}

export default async function DashboardPage() {
  const [user, billing, chatEntitlement, resourcesResponse] = await Promise.all(
    [
      requireUser("/app"),
      fetchBillingMeServer(),
      fetchBillingChatEntitlementServer(),
      fetchMyResourcesServer(),
    ],
  );

  const subscription = billing?.subscription ?? null;
  const subscriptionStatus = normalizeSubscriptionStatus(
    subscription?.status ?? undefined,
  );
  const hasAssistantAccess =
    user.roles.includes("admin") ||
    user.roles.includes("assistant_access") ||
    Boolean(chatEntitlement?.allowed);
  const isAdmin = user.roles.includes("admin");

  const resources = resourcesResponse?.resources ?? [];
  const availableResourcesCount = resources.filter(
    (entry) => !entry.isLocked,
  ).length;
  const lockedResourcesCount = resources.filter(
    (entry) => entry.isLocked,
  ).length;

  return (
    <section className="section">
      <div className="shell">
        <div className="section-head">
          <p className="eyebrow">Dashboard</p>
          <h1>Workspace overview</h1>
          <p className="lead">
            Review your subscription, assistant access, and resource
            availability.
          </p>
        </div>

        <div className="card-grid four">
          <article className="feature-card">
            <h3>Current Plan</h3>
            <p>{subscription?.plan?.name ?? "No plan selected"}</p>
          </article>
          <article className="feature-card">
            <h3>Subscription Status</h3>
            <p>{subscriptionStatus}</p>
          </article>
          <article className="feature-card">
            <h3>AI Assistant</h3>
            <p>
              {hasAssistantAccess
                ? "Available for this account"
                : "Not enabled for this account"}
            </p>
          </article>
          <article className="feature-card">
            <h3>Resources</h3>
            <p>
              {availableResourcesCount} available · {lockedResourcesCount}{" "}
              locked
            </p>
          </article>
        </div>

        <div className="hero-actions">
          <Link href="/app/assistant" className="btn primary">
            Open Assistant
          </Link>
          <Link href="/app/resources" className="btn secondary">
            Open Resources
          </Link>
          <Link href="/app/billing" className="btn ghost">
            Manage Billing
          </Link>
          <Link href="/app/settings" className="btn ghost">
            Privacy Settings
          </Link>
          {isAdmin ? (
            <Link href="/admin" className="btn ghost">
              Open Admin Center
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
