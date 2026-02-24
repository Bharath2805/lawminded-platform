"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl, readErrorMessage } from "@/lib/client-api";
import { getOrCreateAnonymousId } from "@/lib/browser-identity";

type StoredConsent = {
  analytics: boolean;
  marketing: boolean;
  policyVersion: string;
  updatedAt: string;
};

const CONSENT_KEY = "lm_cookie_preferences";
const OPEN_BANNER_EVENT = "lawminded:open-consent-banner";

export function CookieConsentBanner() {
  const policyVersion =
    process.env.NEXT_PUBLIC_COOKIE_POLICY_VERSION ?? "2026-02-17";

  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [anonymousId, setAnonymousId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const source = useMemo(() => "web", []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onOpen = () => {
      setVisible(true);
      setExpanded(true);
    };

    window.addEventListener(OPEN_BANNER_EVENT, onOpen);

    return () => {
      window.removeEventListener(OPEN_BANNER_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const id = getOrCreateAnonymousId();
    setAnonymousId(id);

    const raw = window.localStorage.getItem(CONSENT_KEY);

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StoredConsent;

        if (parsed.policyVersion === policyVersion) {
          setAnalytics(parsed.analytics);
          setMarketing(parsed.marketing);
          setVisible(false);
        } else {
          setVisible(true);
        }
      } catch {
        setVisible(true);
      }
    } else {
      setVisible(true);
    }

    if (!id) {
      setError("Unable to initialize browser identity for consent tracking.");
      return;
    }

    const sync = async () => {
      try {
        const response = await fetch(
          `${apiUrl}/api/privacy/consent?anonymousId=${encodeURIComponent(id)}`,
          {
            method: "GET",
            credentials: "include",
          },
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          preference?: {
            analytics: boolean;
            marketing: boolean;
            policyVersion: string;
            updatedAt: string | null;
          };
        };

        if (!payload.preference) {
          return;
        }

        setAnalytics(payload.preference.analytics);
        setMarketing(payload.preference.marketing);

        if (
          payload.preference.updatedAt &&
          payload.preference.policyVersion === policyVersion
        ) {
          setVisible(false);

          const nextStored: StoredConsent = {
            analytics: payload.preference.analytics,
            marketing: payload.preference.marketing,
            policyVersion,
            updatedAt: payload.preference.updatedAt,
          };

          window.localStorage.setItem(CONSENT_KEY, JSON.stringify(nextStored));
        }
      } catch {
        // Keep local behavior when API is unavailable.
      }
    };

    void sync();
  }, [policyVersion]);

  const persistConsent = async (
    nextAnalytics: boolean,
    nextMarketing: boolean,
  ) => {
    if (!anonymousId) {
      setError("Unable to create browser identity for consent tracking.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/privacy/consent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          analytics: nextAnalytics,
          marketing: nextMarketing,
          anonymousId,
          policyVersion,
          source,
        }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }

      const payload = (await response.json()) as {
        preference: {
          analytics: boolean;
          marketing: boolean;
          policyVersion: string;
          updatedAt: string;
        };
      };

      setAnalytics(payload.preference.analytics);
      setMarketing(payload.preference.marketing);

      const nextStored: StoredConsent = {
        analytics: payload.preference.analytics,
        marketing: payload.preference.marketing,
        policyVersion: payload.preference.policyVersion,
        updatedAt: payload.preference.updatedAt,
      };

      window.localStorage.setItem(CONSENT_KEY, JSON.stringify(nextStored));
      setVisible(false);
      setExpanded(false);
    } catch {
      setError("Unable to save cookie preferences right now.");
    } finally {
      setSaving(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <aside className="cookie-banner" role="dialog" aria-live="polite">
      <div className="cookie-banner-content">
        <p className="eyebrow">Cookie Preferences</p>
        <h3>Control optional cookies</h3>
        <p>
          We use strictly necessary cookies for security and sessions. Optional
          analytics and marketing cookies are disabled by default and only
          activated with consent.
        </p>

        <div className="cookie-banner-actions">
          <button
            type="button"
            className="btn secondary small"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Hide options" : "Manage options"}
          </button>
          <button
            type="button"
            className="btn ghost small"
            disabled={saving}
            onClick={() => {
              void persistConsent(false, false);
            }}
          >
            Reject optional
          </button>
          <button
            type="button"
            className="btn primary small"
            disabled={saving}
            onClick={() => {
              void persistConsent(true, true);
            }}
          >
            Accept all
          </button>
        </div>

        {expanded ? (
          <div className="cookie-options">
            <div className="cookie-option">
              <div>
                <p className="cookie-option-title">Strictly necessary</p>
                <p className="muted">
                  Required for authentication, fraud prevention, and core
                  functionality.
                </p>
              </div>
              <input type="checkbox" checked disabled aria-label="Necessary" />
            </div>

            <div className="cookie-option">
              <div>
                <p className="cookie-option-title">Analytics</p>
                <p className="muted">
                  Helps us improve product reliability and performance.
                </p>
              </div>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
                aria-label="Analytics"
              />
            </div>

            <div className="cookie-option">
              <div>
                <p className="cookie-option-title">Marketing</p>
                <p className="muted">
                  Supports campaign attribution and communication relevance.
                </p>
              </div>
              <input
                type="checkbox"
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
                aria-label="Marketing"
              />
            </div>

            <button
              type="button"
              className="btn primary small"
              disabled={saving}
              onClick={() => {
                void persistConsent(analytics, marketing);
              }}
            >
              {saving ? "Saving..." : "Save preferences"}
            </button>
          </div>
        ) : null}

        {error ? <p className="form-message error">{error}</p> : null}
      </div>
    </aside>
  );
}
