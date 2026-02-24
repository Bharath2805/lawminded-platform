"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { apiUrl, normalizeNextPath, readErrorMessage } from "@/lib/client-api";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next")),
    [searchParams],
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError(`Cannot reach API at ${apiUrl}. Start backend and try again.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1>Sign in</h1>
        <p>Access your workspace, records, and governance workflows.</p>

        <form className="panel-form" onSubmit={onSubmit}>
          <label>
            Email
            <input
              className="input"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {error ? <p className="form-message error">{error}</p> : null}

        <p className="muted">
          Need an account? <Link href="/signup">Create one</Link>
        </p>
      </div>
    </section>
  );
}
