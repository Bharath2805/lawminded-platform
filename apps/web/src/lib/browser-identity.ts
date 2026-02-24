export const ANONYMOUS_ID_KEY = "lm_anonymous_id";

function generateAnonymousId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `anon_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

export function getOrCreateAnonymousId() {
  if (typeof window === "undefined") {
    return null;
  }

  const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY)?.trim();

  if (existing && existing.length >= 8) {
    return existing;
  }

  const next = generateAnonymousId();
  window.localStorage.setItem(ANONYMOUS_ID_KEY, next);
  return next;
}
