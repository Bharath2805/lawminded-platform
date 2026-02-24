import { ResourceGrid } from "@/components/resources/resource-grid";
import { fetchMyResourcesServer } from "@/lib/server-auth";

export default async function DashboardResourcesPage() {
  const response = await fetchMyResourcesServer();
  const resources = response?.resources ?? [];
  const gatedCount = resources.filter((resource) => resource.isGated).length;
  const lockedCount = resources.filter((resource) => resource.isLocked).length;

  return (
    <section className="section">
      <div className="shell">
        <p className="eyebrow">Resources</p>
        <h1>Your compliance resource library</h1>
        <p>
          Access guides, templates, and reference documents. Some assets are
          gated by your current subscription plan.
        </p>

        <div className="card-grid three">
          <article className="feature-card">
            <h3>Total Items</h3>
            <p>{resources.length}</p>
          </article>
          <article className="feature-card">
            <h3>Login-Required Items</h3>
            <p>{gatedCount}</p>
          </article>
          <article className="feature-card">
            <h3>Locked by Plan</h3>
            <p>{lockedCount}</p>
          </article>
        </div>

        <ResourceGrid
          resources={resources}
          authenticated
          source="dashboard"
          loginNextPath="/app/resources"
          emptyState="No resources are currently available for your account."
        />
      </div>
    </section>
  );
}
