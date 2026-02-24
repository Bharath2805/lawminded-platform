export type AuthUser = {
  id: string;
  email: string;
  roles: string[];
};

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveClientApiUrl(): string {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configuredApiUrl && configuredApiUrl.length > 0) {
    if (configuredApiUrl === "/backend") {
      return configuredApiUrl;
    }

    if (configuredApiUrl.startsWith("/")) {
      return normalizeBaseUrl(configuredApiUrl);
    }

    if (configuredAppUrl) {
      try {
        const apiHost = new URL(configuredApiUrl).host;
        const appHost = new URL(configuredAppUrl).host;

        if (apiHost === appHost) {
          return "/backend";
        }
      } catch {
        // ignore malformed URL and return configured value below.
      }
    }

    return normalizeBaseUrl(configuredApiUrl);
  }

  return process.env.NODE_ENV === "production"
    ? "/backend"
    : "http://localhost:3001";
}

export const apiUrl = resolveClientApiUrl();

export async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };

    if (Array.isArray(payload.message)) {
      return payload.message.join(", ");
    }

    if (typeof payload.message === "string" && payload.message.length > 0) {
      return payload.message;
    }

    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    // No-op. Fallback below.
  }

  return `Request failed with status ${response.status}`;
}

export function normalizeNextPath(value: string | null | undefined): string {
  if (!value || typeof value !== "string") {
    return "/app";
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/app";
  }

  return value;
}
