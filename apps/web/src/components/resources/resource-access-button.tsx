"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getOrCreateAnonymousId } from "@/lib/browser-identity";
import { apiUrl, readErrorMessage } from "@/lib/client-api";

type ResourceAccessButtonProps = {
  resourceId: string;
  fallbackHref?: string;
  source: string;
  className?: string;
  label?: string;
  loginNextPath?: string;
};

function isAbsoluteHttpUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function ResourceAccessButton({
  resourceId,
  fallbackHref,
  source,
  className,
  label,
  loginNextPath = "/resources",
}: ResourceAccessButtonProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = () => {
    if (!fallbackHref) {
      setError("Resource link is unavailable.");
      return;
    }

    if (fallbackHref.startsWith("/")) {
      router.push(fallbackHref);
      return;
    }

    if (isAbsoluteHttpUrl(fallbackHref)) {
      window.location.assign(fallbackHref);
      return;
    }

    setError("Resource link is invalid.");
  };

  const onClick = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const anonymousId = getOrCreateAnonymousId();

      const response = await fetch(
        `${apiUrl}/api/resources/${resourceId}/download`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            source,
            anonymousId: anonymousId ?? undefined,
          }),
        },
      );

      if (response.status === 401) {
        router.push(`/login?next=${encodeURIComponent(loginNextPath)}`);
        return;
      }

      if (!response.ok) {
        const message = await readErrorMessage(response);
        setError(message);
        return;
      }

      const payload = (await response.json()) as {
        downloadUrl?: string;
      };

      const url = payload.downloadUrl ?? null;

      if (!url) {
        setError("Download link is unavailable.");
        return;
      }

      if (url.startsWith("/")) {
        router.push(url);
        return;
      }

      if (isAbsoluteHttpUrl(url)) {
        window.location.assign(url);
        return;
      }

      setError("Download URL is invalid.");
    } catch {
      if (fallbackHref) {
        navigate();
        return;
      }
      setError(
        `Unable to connect to API at ${apiUrl}. Start backend and try again.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="resource-actions">
      <button
        type="button"
        className={className ?? "btn secondary small"}
        onClick={onClick}
        disabled={submitting}
      >
        {submitting ? "Opening..." : (label ?? "Open")}
      </button>
      {error ? <p className="form-message error">{error}</p> : null}
    </div>
  );
}
