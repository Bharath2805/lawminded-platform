"use client";

import { FormEvent, useMemo, useState } from "react";

type SubmissionState = "idle" | "submitting" | "success" | "error";

export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState("");

  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
    [],
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (status === "submitting") {
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch(`${apiUrl}/api/leads/newsletter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName: fullName || undefined }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Unable to subscribe");
      }

      setStatus("success");
      setMessage(
        "Subscription confirmed. You will receive product and compliance updates.",
      );
      setEmail("");
      setFullName("");
    } catch {
      setStatus("error");
      setMessage(
        "Subscription failed. Please verify your email and try again.",
      );
    }
  };

  return (
    <form
      className={compact ? "newsletter-form compact" : "newsletter-form"}
      onSubmit={onSubmit}
    >
      {!compact && (
        <input
          type="text"
          placeholder="Full name (optional)"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          maxLength={100}
          className="input"
        />
      )}
      <input
        type="email"
        placeholder="Work email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        maxLength={160}
        className="input"
      />
      <button
        type="submit"
        className="btn primary"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? "Subscribing..." : "Subscribe"}
      </button>
      {message && (
        <p
          className={
            status === "success" ? "form-message success" : "form-message error"
          }
        >
          {message}
        </p>
      )}
    </form>
  );
}
