import { ResourceGrid } from "@/components/resources/resource-grid";
import {
  fetchCurrentUserServer,
  fetchResourcesServer,
} from "@/lib/server-auth";

export default async function ResourcesPage() {
  const [resourcesResponse, currentUser] = await Promise.all([
    fetchResourcesServer(),
    fetchCurrentUserServer(),
  ]);
  const resources = resourcesResponse?.resources ?? [];

  return (
    <section className="section">
      <div className="shell">
        <div className="section-head">
          <p className="eyebrow">Resources</p>
          <h1>Implementation assets for AI governance programs.</h1>
        </div>

        <ResourceGrid
          resources={resources}
          authenticated={Boolean(currentUser)}
          source="marketing"
          loginNextPath="/resources"
          emptyState="No resources are currently published."
        />
      </div>
    </section>
  );
}
