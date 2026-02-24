import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeNextPath, type AuthUser } from "./client-api";

const serverApiUrl =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

type MeResponse = {
  user?: AuthUser;
  session?: {
    id?: string;
    expiresAt?: string;
  };
};

type AdminOverview = {
  users: {
    total: number;
    active: number;
    admin: number;
  };
  sessions: {
    active: number;
  };
  leads: {
    demoRequests: number;
    contactMessages: number;
    newsletterSubscribers: number;
  };
  billing: {
    activeSubscriptions: number;
    monthlyRecurringRevenueCents: number;
  };
  privacy: {
    consentLogs: number;
    dsarRequests: number;
    dsarOpen: number;
  };
  resources: {
    active: number;
    accessLogs: number;
  };
};

type AdminUsersResponse = {
  users: Array<{
    id: string;
    email: string;
    status: string;
    roles: string[];
    createdAt: string;
    activeSessionCount: number;
    lastActiveSession: {
      createdAt: string;
      expiresAt: string;
    } | null;
  }>;
  meta?: {
    search: string | null;
    limit: number;
    totalMatching: number;
  };
};

type BillingPlansResponse = {
  plans: Array<{
    key: string;
    name: string;
    description: string | null;
    amountCents: number;
    currency: string;
    interval: "MONTH" | "YEAR" | "ONE_TIME";
    highlighted: boolean;
    features: string[];
  }>;
};

type BillingMeResponse = {
  subscription: {
    id: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
    canceledAt: string | null;
    plan: {
      key: string;
      name: string;
      amountCents: number;
      currency: string;
      interval: "MONTH" | "YEAR" | "ONE_TIME";
    } | null;
  } | null;
  payments: Array<{
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    paidAt: string | null;
    failedAt: string | null;
    createdAt: string;
    plan: {
      key: string;
      name: string;
      interval: "MONTH" | "YEAR" | "ONE_TIME";
    } | null;
  }>;
};

type BillingChatEntitlementResponse = {
  allowed: boolean;
  reason: string | null;
  activePlan: {
    key: string;
    name: string;
  } | null;
  requiredPlanKeys: string[];
};

type AdminBillingResponse = {
  subscriptions: Array<{
    id: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    user: {
      id: string;
      email: string;
    };
    plan: {
      key: string;
      name: string;
      amountCents: number;
      currency: string;
      interval: "MONTH" | "YEAR" | "ONE_TIME";
    } | null;
  }>;
  payments: Array<{
    id: string;
    status: string;
    amountCents: number;
    currency: string;
    createdAt: string;
    paidAt: string | null;
    user: {
      id: string;
      email: string;
    };
    plan: {
      key: string;
      name: string;
      interval: "MONTH" | "YEAR" | "ONE_TIME";
    } | null;
  }>;
};

type AdminBillingPlansResponse = {
  plans: Array<{
    key: string;
    name: string;
    amountCents: number;
    currency: string;
    interval: "MONTH" | "YEAR" | "ONE_TIME";
    active: boolean;
    chatbotEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
};

type AdminPrivacyConsentsResponse = {
  window: "7d" | "30d" | "90d" | "all";
  consents: Array<{
    id: string;
    user: {
      id: string;
      email: string;
    } | null;
    anonymousId: string | null;
    necessary: boolean;
    analytics: boolean;
    marketing: boolean;
    policyVersion: string;
    source: string | null;
    consentedAt: string;
  }>;
};

type AdminPrivacyDsarResponse = {
  window: "7d" | "30d" | "90d" | "all";
  status: "ALL" | "OPEN" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
  requests: Array<{
    id: string;
    requesterEmail: string;
    type:
      | "ACCESS"
      | "EXPORT"
      | "RECTIFICATION"
      | "ERASURE"
      | "RESTRICTION"
      | "OBJECTION";
    status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
    details: string | null;
    source: string | null;
    requestedAt: string;
    resolvedAt: string | null;
    resolutionNote: string | null;
    user: {
      id: string;
      email: string;
    } | null;
    resolvedBy: {
      id: string;
      email: string;
    } | null;
  }>;
};

type ResourcesResponse = {
  resources: Array<{
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
  }>;
};

type AdminResourcesResponse = {
  resources: Array<{
    id: string;
    key: string;
    title: string;
    summary: string;
    category: string | null;
    href: string;
    visibility: "PUBLIC" | "AUTHENTICATED";
    deliveryType: "LINK" | "FILE";
    entitlementMode: "ALL_AUTHENTICATED" | "PLAN_RESTRICTED";
    entitledPlanKeys: string[];
    active: boolean;
    sortOrder: number;
    hasFile: boolean;
    fileName: string | null;
    fileSizeBytes: number | null;
    fileMimeType: string | null;
    totalAccesses: number;
    lastAccessAt: string | null;
  }>;
};

type ResourceAccessLogWindow = "7d" | "30d" | "90d" | "all";

type AdminResourceAccessLogsResponse = {
  window: ResourceAccessLogWindow;
  logs: Array<{
    id: string;
    action: "VIEW" | "DOWNLOAD";
    source: string | null;
    createdAt: string;
    anonymousId: string | null;
    user: {
      id: string;
      email: string;
    } | null;
    resource: {
      id: string;
      key: string;
      title: string;
    };
  }>;
};

type AdminResourceStorageStatusResponse = {
  configured: boolean;
  bucket: string | null;
  region: string | null;
  endpoint: string | null;
  keyPrefix: string;
  missingRequiredEnvKeys: string[];
  missingOptionalEnvKeys: string[];
};

async function buildCookieHeader(): Promise<string | null> {
  const cookieStore = await cookies();
  const values = cookieStore
    .getAll()
    .map(
      (entry: { name: string; value: string }) =>
        `${entry.name}=${entry.value}`,
    );

  if (values.length === 0) {
    return null;
  }

  return values.join("; ");
}

export async function fetchCurrentUserServer(): Promise<AuthUser | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${serverApiUrl}/api/auth/me`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as MeResponse;
    return payload.user ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(nextPath = "/app"): Promise<AuthUser> {
  const user = await fetchCurrentUserServer();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(normalizeNextPath(nextPath))}`);
  }

  return user;
}

export async function requireAdmin(nextPath = "/admin"): Promise<AuthUser> {
  const user = await requireUser(nextPath);

  if (!user.roles.includes("admin")) {
    redirect("/app");
  }

  return user;
}

export async function fetchAdminOverviewServer(): Promise<AdminOverview | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${serverApiUrl}/api/admin/overview`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminOverview;
  } catch {
    return null;
  }
}

export async function fetchAdminUsersServer(options?: {
  limit?: number;
  search?: string;
}): Promise<AdminUsersResponse | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const limit = options?.limit ?? 10;
    const search = options?.search?.trim();
    const query = new URLSearchParams({
      limit: String(limit),
    });

    if (search) {
      query.set("search", search);
    }

    const response = await fetch(
      `${serverApiUrl}/api/admin/users?${query.toString()}`,
      {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminUsersResponse;
  } catch {
    return null;
  }
}

export async function fetchBillingPlansServer(): Promise<BillingPlansResponse | null> {
  try {
    const response = await fetch(`${serverApiUrl}/api/billing/plans`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as BillingPlansResponse;
  } catch {
    return null;
  }
}

export async function fetchBillingMeServer(): Promise<BillingMeResponse | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${serverApiUrl}/api/billing/me`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as BillingMeResponse;
  } catch {
    return null;
  }
}

export async function fetchBillingChatEntitlementServer(): Promise<BillingChatEntitlementResponse | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(
      `${serverApiUrl}/api/billing/chat-entitlement`,
      {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as BillingChatEntitlementResponse;
  } catch {
    return null;
  }
}

export async function fetchAdminBillingServer(
  limit = 10,
): Promise<AdminBillingResponse | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(
      `${serverApiUrl}/api/admin/billing?limit=${encodeURIComponent(String(limit))}`,
      {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminBillingResponse;
  } catch {
    return null;
  }
}

export async function fetchAdminBillingPlansServer(): Promise<AdminBillingPlansResponse | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${serverApiUrl}/api/admin/billing/plans`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminBillingPlansResponse;
  } catch {
    return null;
  }
}

export async function fetchAdminPrivacyConsentsServer(
  limit = 10,
  window: "7d" | "30d" | "90d" | "all" = "30d",
): Promise<AdminPrivacyConsentsResponse | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const query = new URLSearchParams({
      limit: String(limit),
      window,
    });
    const response = await fetch(
      `${serverApiUrl}/api/admin/privacy/consents?${query.toString()}`,
      {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminPrivacyConsentsResponse;
  } catch {
    return null;
  }
}

export async function fetchAdminPrivacyDsarServer(
  limit = 10,
  window: "7d" | "30d" | "90d" | "all" = "30d",
  status: "ALL" | "OPEN" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" = "ALL",
): Promise<AdminPrivacyDsarResponse | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const query = new URLSearchParams({
      limit: String(limit),
      window,
      status,
    });
    const response = await fetch(
      `${serverApiUrl}/api/admin/privacy/dsar?${query.toString()}`,
      {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminPrivacyDsarResponse;
  } catch {
    return null;
  }
}

export async function fetchResourcesServer(): Promise<ResourcesResponse | null> {
  const cookieHeader = await buildCookieHeader();

  try {
    const response = await fetch(`${serverApiUrl}/api/resources`, {
      method: "GET",
      headers: cookieHeader
        ? {
            cookie: cookieHeader,
          }
        : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as ResourcesResponse;
  } catch {
    return null;
  }
}

export async function fetchMyResourcesServer(): Promise<ResourcesResponse | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${serverApiUrl}/api/resources/me`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as ResourcesResponse;
  } catch {
    return null;
  }
}

export async function fetchAdminResourcesServer(
  limit = 50,
): Promise<AdminResourcesResponse | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(
      `${serverApiUrl}/api/admin/resources?limit=${encodeURIComponent(String(limit))}`,
      {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminResourcesResponse;
  } catch {
    return null;
  }
}

export async function fetchAdminResourceAccessLogsServer(
  limit = 25,
  window: ResourceAccessLogWindow = "30d",
): Promise<AdminResourceAccessLogsResponse | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const query = new URLSearchParams({
      limit: String(limit),
      window,
    });
    const response = await fetch(
      `${serverApiUrl}/api/admin/resources/access-logs?${query.toString()}`,
      {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminResourceAccessLogsResponse;
  } catch {
    return null;
  }
}

export async function fetchAdminResourceStorageStatusServer(): Promise<AdminResourceStorageStatusResponse | null> {
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(
      `${serverApiUrl}/api/admin/resources/storage-status`,
      {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminResourceStorageStatusResponse;
  } catch {
    return null;
  }
}
