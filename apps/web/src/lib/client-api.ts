export type AuthUser = {
  id: string;
  email: string;
  roles: string[];
};

export const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
