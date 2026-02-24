import Link from "next/link";
import { ResourceAccessButton } from "@/components/resources/resource-access-button";

export type ResourceItem = {
  id: string;
  key: string;
  title: string;
  summary: string;
  category: string | null;
  href: string;
  visibility: "PUBLIC" | "AUTHENTICATED";
  deliveryType: "LINK" | "FILE";
  entitlementMode: "ALL_AUTHENTICATED" | "PLAN_RESTRICTED";
  isGated: boolean;
  requiresPlan: boolean;
  isLocked: boolean;
  requiredPlanKeys: string[];
  hasFile: boolean;
  fileName: string | null;
  fileSizeBytes: number | null;
  fileMimeType: string | null;
};

type ResourceGridProps = {
  resources: ResourceItem[];
  authenticated: boolean;
  source: "marketing" | "dashboard";
  loginNextPath: string;
  emptyState: string;
};

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getActionLabel(item: ResourceItem): string {
  if (item.deliveryType === "FILE" || item.hasFile) {
    return "Download";
  }

  return "Open";
}

export function ResourceGrid({
  resources,
  authenticated,
  source,
  loginNextPath,
  emptyState,
}: ResourceGridProps) {
  if (resources.length === 0) {
    return <p className="muted">{emptyState}</p>;
  }

  return (
    <div className="card-grid three">
      {resources.map((item) => {
        const lockedByPlan = item.isLocked && item.requiresPlan;

        return (
          <article key={item.id} className="resource-card">
            <div className="resource-meta">
              <span className="resource-category">
                {item.category ?? "General"}
              </span>
              {item.isGated ? (
                <span className="resource-visibility gated">Member</span>
              ) : (
                <span className="resource-visibility public">Public</span>
              )}
            </div>

            <h3>{item.title}</h3>
            <p>{item.summary}</p>

            {item.fileName ? (
              <p className="resource-file-meta muted">
                {item.fileName}
                {item.fileSizeBytes
                  ? ` · ${formatBytes(item.fileSizeBytes)}`
                  : ""}
              </p>
            ) : null}

            {item.isGated && !authenticated ? (
              <Link
                href={`/login?next=${encodeURIComponent(loginNextPath)}`}
                className="btn secondary small"
              >
                Sign in to access
              </Link>
            ) : lockedByPlan ? (
              <div className="resource-lock-box">
                <p className="form-message error">
                  An eligible plan is required for this resource.
                </p>
                {item.requiredPlanKeys.length > 0 ? (
                  <p className="muted">
                    Eligible plans: {item.requiredPlanKeys.join(", ")}
                  </p>
                ) : null}
                <Link href="/app/billing" className="btn primary small">
                  View plans
                </Link>
              </div>
            ) : (
              <ResourceAccessButton
                resourceId={item.id}
                fallbackHref={item.href}
                source={source}
                label={getActionLabel(item)}
                className="btn secondary small"
                loginNextPath={loginNextPath}
              />
            )}
          </article>
        );
      })}
    </div>
  );
}
