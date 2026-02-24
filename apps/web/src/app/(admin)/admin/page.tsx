import Link from "next/link";
import {
  fetchAdminResourceAccessLogsServer,
  fetchAdminResourcesServer,
  fetchAdminResourceStorageStatusServer,
  fetchAdminBillingServer,
  fetchAdminBillingPlansServer,
  fetchAdminOverviewServer,
  fetchAdminPrivacyConsentsServer,
  fetchAdminPrivacyDsarServer,
  fetchAdminUsersServer,
  fetchBillingPlansServer,
} from "@/lib/server-auth";
import { DsarStatusForm } from "@/components/admin/dsar-status-form";
import { PlanFeatureManager } from "@/components/admin/plan-feature-manager";
import { ResourceManager } from "@/components/admin/resource-manager";
import { UserManagementActions } from "@/components/admin/user-management-actions";
import styles from "./admin-page.module.css";

type SearchParamsInput = Record<string, string | string[] | undefined>;
type ResourceLogWindow = "7d" | "30d" | "90d" | "all";
type PrivacyWindow = "7d" | "30d" | "90d" | "all";
type DsarStatusFilter =
  | "ALL"
  | "OPEN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "REJECTED";

type AdminPageProps = {
  searchParams?: Promise<SearchParamsInput>;
};

function readQueryValue(
  source: SearchParamsInput,
  key: string,
): string | undefined {
  const value = source[key];

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  return undefined;
}

function parseUsersLimit(raw: string | undefined): number {
  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    return 25;
  }

  return Math.min(100, Math.max(1, Math.trunc(parsed)));
}

function parseResourceLogWindow(raw: string | undefined): ResourceLogWindow {
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "all") {
    return raw;
  }

  return "30d";
}

function parsePrivacyWindow(raw: string | undefined): PrivacyWindow {
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "all") {
    return raw;
  }

  return "30d";
}

function parseDsarStatusFilter(raw: string | undefined): DsarStatusFilter {
  if (
    raw === "ALL" ||
    raw === "OPEN" ||
    raw === "IN_PROGRESS" ||
    raw === "COMPLETED" ||
    raw === "REJECTED"
  ) {
    return raw;
  }

  return "ALL";
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString();
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function formatRoles(roles: string[]) {
  if (roles.length === 0) {
    return "-";
  }

  return roles
    .map((role) =>
      role === "admin"
        ? "Admin"
        : role === "assistant_access"
          ? "Assistant Access"
          : role === "user"
            ? "Member"
            : formatStatus(role),
    )
    .join(", ");
}

function statusTone(value: string): "good" | "warn" | "bad" | "neutral" {
  const normalized = value.toUpperCase();

  if (["ACTIVE", "COMPLETED", "SUCCEEDED"].includes(normalized)) {
    return "good";
  }

  if (["IN_PROGRESS", "PAST_DUE", "PENDING", "TRIALING"].includes(normalized)) {
    return "warn";
  }

  if (
    ["SUSPENDED", "REJECTED", "FAILED", "CANCELED", "UNPAID"].includes(
      normalized,
    )
  ) {
    return "bad";
  }

  return "neutral";
}

function badgeClass(tone: "good" | "warn" | "bad" | "neutral") {
  if (tone === "good") {
    return `${styles.badge} ${styles.good}`;
  }

  if (tone === "warn") {
    return `${styles.badge} ${styles.warn}`;
  }

  if (tone === "bad") {
    return `${styles.badge} ${styles.bad}`;
  }

  return `${styles.badge} ${styles.neutral}`;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const userSearch = (readQueryValue(resolvedSearchParams, "userSearch") ?? "")
    .trim()
    .slice(0, 160);
  const usersLimit = parseUsersLimit(
    readQueryValue(resolvedSearchParams, "usersLimit"),
  );
  const resourceLogWindow = parseResourceLogWindow(
    readQueryValue(resolvedSearchParams, "logWindow"),
  );
  const consentWindow = parsePrivacyWindow(
    readQueryValue(resolvedSearchParams, "consentWindow"),
  );
  const dsarWindow = parsePrivacyWindow(
    readQueryValue(resolvedSearchParams, "dsarWindow"),
  );
  const dsarStatus = parseDsarStatusFilter(
    readQueryValue(resolvedSearchParams, "dsarStatus"),
  );

  const [
    overview,
    users,
    billing,
    billingPlans,
    resources,
    resourceLogs,
    resourceStorageStatus,
    privacyConsents,
    privacyDsar,
    plans,
  ] = await Promise.all([
    fetchAdminOverviewServer(),
    fetchAdminUsersServer({
      limit: usersLimit,
      search: userSearch || undefined,
    }),
    fetchAdminBillingServer(10),
    fetchAdminBillingPlansServer(),
    fetchAdminResourcesServer(50),
    fetchAdminResourceAccessLogsServer(100, resourceLogWindow),
    fetchAdminResourceStorageStatusServer(),
    fetchAdminPrivacyConsentsServer(100, consentWindow),
    fetchAdminPrivacyDsarServer(100, dsarWindow, dsarStatus),
    fetchBillingPlansServer(),
  ]);

  return (
    <section className={`section ${styles.page}`}>
      <div className={`shell ${styles.shell}`}>
        <header className={styles.hero}>
          <p className={styles.heroTag}>Admin Center</p>
          <h1 className={styles.heroTitle}>
            Operations and compliance control center
          </h1>
          <p className={styles.heroSubtitle}>
            Manage users, payments, resources, and privacy requests in one
            place.
          </p>
        </header>

        <div className={styles.quickGuide}>
          <article className={styles.guideCard}>
            <h3>1. Check today&apos;s numbers</h3>
            <p>
              Review users, active subscriptions, and monthly revenue first.
            </p>
          </article>
          <article className={styles.guideCard}>
            <h3>2. Handle user updates</h3>
            <p>
              Suspend accounts, reset sessions, and grant assistant or admin
              access.
            </p>
          </article>
          <article className={styles.guideCard}>
            <h3>3. Keep privacy requests current</h3>
            <p>
              Update GDPR request statuses and keep notes for audit history.
            </p>
          </article>
        </div>

        <article className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <h2>Business overview</h2>
            <p>High-level snapshot for quick daily checks.</p>
          </div>

          {overview ? (
            <div className={styles.kpiGrid}>
              <article className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Total members</p>
                <p className={styles.kpiValue}>{overview.users.total}</p>
              </article>
              <article className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Active sessions</p>
                <p className={styles.kpiValue}>{overview.sessions.active}</p>
              </article>
              <article className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Active subscriptions</p>
                <p className={styles.kpiValue}>
                  {overview.billing.activeSubscriptions}
                </p>
              </article>
              <article className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Monthly recurring revenue</p>
                <p className={styles.kpiValue}>
                  {formatMoney(
                    overview.billing.monthlyRecurringRevenueCents,
                    "EUR",
                  )}
                </p>
              </article>
              <article className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Open privacy requests</p>
                <p className={styles.kpiValue}>{overview.privacy.dsarOpen}</p>
              </article>
              <article className={styles.kpiCard}>
                <p className={styles.kpiLabel}>Resource views and downloads</p>
                <p className={styles.kpiValue}>
                  {overview.resources.accessLogs}
                </p>
              </article>
            </div>
          ) : (
            <p className={styles.emptyText}>
              Dashboard data is not available right now. Check API connectivity.
            </p>
          )}
        </article>

        <article className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <h2>User management</h2>
            <p>Search and manage user access, status, and permissions.</p>
          </div>

          <form method="GET" className={styles.userFilters}>
            <input type="hidden" name="logWindow" value={resourceLogWindow} />
            <input type="hidden" name="consentWindow" value={consentWindow} />
            <input type="hidden" name="dsarWindow" value={dsarWindow} />
            <input type="hidden" name="dsarStatus" value={dsarStatus} />
            <label htmlFor="userSearch" className={styles.userFiltersLabel}>
              User Search
            </label>
            <input
              id="userSearch"
              name="userSearch"
              className="input"
              defaultValue={userSearch}
              placeholder="Search by email or user ID"
            />
            <label htmlFor="usersLimit" className={styles.userFiltersLabel}>
              Rows
            </label>
            <select
              id="usersLimit"
              name="usersLimit"
              className="input"
              defaultValue={String(usersLimit)}
            >
              <option value="12">12</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <button type="submit" className="btn secondary small">
              Apply
            </button>
            {userSearch ? (
              <Link href="/admin" className="btn ghost small">
                Clear
              </Link>
            ) : null}
          </form>

          {users?.meta ? (
            <p className={styles.userFilterMeta}>
              Showing {users.users.length} of {users.meta.totalMatching} users
              {users.meta.search ? ` for "${users.meta.search}"` : ""}.
            </p>
          ) : null}

          {users && users.users.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Account status</th>
                    <th>Role</th>
                    <th>Active sessions</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.email}</td>
                      <td>
                        <span className={badgeClass(statusTone(user.status))}>
                          {formatStatus(user.status)}
                        </span>
                      </td>
                      <td>{formatRoles(user.roles)}</td>
                      <td>{user.activeSessionCount}</td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>
                        <UserManagementActions user={user} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.emptyText}>No users found.</p>
          )}
        </article>

        <article className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <h2>Recent payments</h2>
            <p>Latest finalized payment records and their outcomes.</p>
          </div>

          {billing && billing.payments.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>User</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {billing.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatDate(payment.createdAt)}</td>
                      <td>{payment.user.email}</td>
                      <td>{payment.plan?.name ?? "N/A"}</td>
                      <td>
                        {formatMoney(payment.amountCents, payment.currency)}
                      </td>
                      <td>
                        <span
                          className={badgeClass(statusTone(payment.status))}
                        >
                          {formatStatus(payment.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.emptyText}>No billing events found.</p>
          )}
        </article>

        <article className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <h2>Plan controls</h2>
            <p>Turn plans on/off and control who can use the AI assistant.</p>
          </div>
          {billingPlans ? (
            <PlanFeatureManager plans={billingPlans.plans} />
          ) : (
            <p className={styles.emptyText}>
              Plan controls are currently unavailable.
            </p>
          )}
        </article>

        <article className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <h2>Resources and content</h2>
            <p>
              Review resource access, then create or update resource entries.
            </p>
          </div>

          {resources && resources.resources.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Who can access</th>
                    <th>Format</th>
                    <th>Access rule</th>
                    <th>Live</th>
                    <th>File</th>
                    <th>Total access</th>
                    <th>Last access</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.resources.map((resource) => (
                    <tr key={resource.id}>
                      <td>{resource.title}</td>
                      <td>{formatStatus(resource.visibility)}</td>
                      <td>{formatStatus(resource.deliveryType)}</td>
                      <td>{formatStatus(resource.entitlementMode)}</td>
                      <td>
                        <span
                          className={badgeClass(
                            resource.active ? "good" : "bad",
                          )}
                        >
                          {resource.active ? "Yes" : "No"}
                        </span>
                      </td>
                      <td>{resource.fileName ?? "-"}</td>
                      <td>{resource.totalAccesses}</td>
                      <td>{formatDate(resource.lastAccessAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.emptyText}>No resources configured.</p>
          )}

          {resources ? (
            <ResourceManager
              resources={resources.resources}
              plans={(plans?.plans ?? []).map((plan) => ({
                key: plan.key,
                name: plan.name,
              }))}
              storageStatus={resourceStorageStatus}
            />
          ) : (
            <p className={styles.emptyText}>
              Resource management controls are unavailable right now.
            </p>
          )}
        </article>

        <article className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <h2>Resource access history</h2>
            <p>See which documents were opened or downloaded recently.</p>
          </div>

          <form method="GET" className={styles.logFilters}>
            {userSearch ? (
              <input type="hidden" name="userSearch" value={userSearch} />
            ) : null}
            <input type="hidden" name="usersLimit" value={String(usersLimit)} />
            <input type="hidden" name="consentWindow" value={consentWindow} />
            <input type="hidden" name="dsarWindow" value={dsarWindow} />
            <input type="hidden" name="dsarStatus" value={dsarStatus} />
            <label htmlFor="logWindow" className={styles.userFiltersLabel}>
              Time range
            </label>
            <select
              id="logWindow"
              name="logWindow"
              className="input"
              defaultValue={resourceLogWindow}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
            <button type="submit" className="btn secondary small">
              Apply
            </button>
          </form>

          {resourceLogs && resourceLogs.logs.length > 0 ? (
            <div className={`table-wrap ${styles.logTableWrap}`}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Resource</th>
                    <th>Person</th>
                    <th>Action</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {resourceLogs.logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDate(log.createdAt)}</td>
                      <td>{log.resource.title}</td>
                      <td>
                        {log.user?.email ?? log.anonymousId ?? "Anonymous"}
                      </td>
                      <td>{formatStatus(log.action)}</td>
                      <td>{log.source ?? "web"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.emptyText}>No recent resource activity.</p>
          )}
        </article>

        <article className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <h2>Cookie and consent activity</h2>
            <p>Latest consent choices captured for privacy compliance.</p>
          </div>

          <form method="GET" className={styles.logFilters}>
            {userSearch ? (
              <input type="hidden" name="userSearch" value={userSearch} />
            ) : null}
            <input type="hidden" name="usersLimit" value={String(usersLimit)} />
            <input type="hidden" name="logWindow" value={resourceLogWindow} />
            <input type="hidden" name="dsarWindow" value={dsarWindow} />
            <input type="hidden" name="dsarStatus" value={dsarStatus} />
            <label htmlFor="consentWindow" className={styles.userFiltersLabel}>
              Time range
            </label>
            <select
              id="consentWindow"
              name="consentWindow"
              className="input"
              defaultValue={consentWindow}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
            <button type="submit" className="btn secondary small">
              Apply
            </button>
          </form>

          {privacyConsents && privacyConsents.consents.length > 0 ? (
            <div className={`table-wrap ${styles.logTableWrap}`}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Person</th>
                    <th>Analytics</th>
                    <th>Marketing</th>
                    <th>Policy version</th>
                  </tr>
                </thead>
                <tbody>
                  {privacyConsents.consents.map((consent) => (
                    <tr key={consent.id}>
                      <td>{formatDate(consent.consentedAt)}</td>
                      <td>
                        {consent.user?.email ??
                          consent.anonymousId ??
                          "Anonymous"}
                      </td>
                      <td>{consent.analytics ? "Yes" : "No"}</td>
                      <td>{consent.marketing ? "Yes" : "No"}</td>
                      <td>{consent.policyVersion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.emptyText}>No consent activity found.</p>
          )}
        </article>

        <article className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <h2>Privacy requests (GDPR)</h2>
            <p>Track and resolve access/export/deletion requests.</p>
          </div>

          <form method="GET" className={styles.logFilters}>
            {userSearch ? (
              <input type="hidden" name="userSearch" value={userSearch} />
            ) : null}
            <input type="hidden" name="usersLimit" value={String(usersLimit)} />
            <input type="hidden" name="logWindow" value={resourceLogWindow} />
            <input type="hidden" name="consentWindow" value={consentWindow} />
            <label htmlFor="dsarWindow" className={styles.userFiltersLabel}>
              Time range
            </label>
            <select
              id="dsarWindow"
              name="dsarWindow"
              className="input"
              defaultValue={dsarWindow}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
            <label htmlFor="dsarStatus" className={styles.userFiltersLabel}>
              Status
            </label>
            <select
              id="dsarStatus"
              name="dsarStatus"
              className="input"
              defaultValue={dsarStatus}
            >
              <option value="ALL">All</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <button type="submit" className="btn secondary small">
              Apply
            </button>
          </form>

          {privacyDsar && privacyDsar.requests.length > 0 ? (
            <div className={`table-wrap ${styles.logTableWrap}`}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Requester</th>
                    <th>Request type</th>
                    <th>Status</th>
                    <th>Update</th>
                  </tr>
                </thead>
                <tbody>
                  {privacyDsar.requests.map((request) => (
                    <tr key={request.id}>
                      <td>{formatDate(request.requestedAt)}</td>
                      <td>{request.requesterEmail}</td>
                      <td>{formatStatus(request.type)}</td>
                      <td>
                        <span
                          className={badgeClass(statusTone(request.status))}
                        >
                          {formatStatus(request.status)}
                        </span>
                      </td>
                      <td>
                        <DsarStatusForm
                          requestId={request.id}
                          currentStatus={request.status}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.emptyText}>No privacy requests in queue.</p>
          )}
        </article>
      </div>
    </section>
  );
}
