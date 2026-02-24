import Link from "next/link";
import { ChatApp } from "@/components/chat/chat-app";
import {
  fetchBillingChatEntitlementServer,
  requireUser,
} from "@/lib/server-auth";

export default async function AssistantPage() {
  const [user, entitlement] = await Promise.all([
    requireUser("/app/assistant"),
    fetchBillingChatEntitlementServer(),
  ]);
  const hasAssistantAccess =
    user.roles.includes("admin") || user.roles.includes("assistant_access");
  const hasPlanAccess = Boolean(entitlement?.allowed);

  if (!hasAssistantAccess && !hasPlanAccess) {
    return (
      <section className="section">
        <div className="shell">
          <div className="section-head">
            <p className="eyebrow">Assistant</p>
            <h1>Assistant access is currently limited</h1>
            <p className="lead">
              Assistant access is currently available to authorized admin
              accounts and users with assistant access enabled by an admin, or
              on plans that include assistant access.
            </p>
          </div>

          <div className="card-grid two">
            <article className="feature-card">
              <h3>Your Account</h3>
              <p>{user.email}</p>
            </article>
            <article className="feature-card">
              <h3>Current Access</h3>
              <p>
                Standard dashboard features remain fully available. Assistant
                access is limited to approved accounts at this stage.
              </p>
            </article>
          </div>

          <div className="hero-actions">
            <Link href="/app" className="btn primary">
              Back to Dashboard
            </Link>
            <Link href="/contact" className="btn secondary">
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return <ChatApp />;
}
