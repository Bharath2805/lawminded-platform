"use client";

import { FormEvent, useMemo, useState } from "react";

type SubmissionState = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [topic, setTopic] = useState("");
  const [note, setNote] = useState("");

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
      const response = await fetch(`${apiUrl}/api/leads/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          company: company || undefined,
          topic: topic || undefined,
          message: note,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Contact request failed");
      }

      setStatus("success");
      setMessage("Message sent successfully. We will respond shortly.");
      setFullName("");
      setEmail("");
      setCompany("");
      setTopic("");
      setNote("");
    } catch {
      setStatus("error");
      setMessage("We could not send your message. Please try again.");
    }
  };

  return (
    <form className="panel-form" onSubmit={onSubmit}>
      <div className="form-grid two">
        <label>
          Full name
          <input
            className="input"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            maxLength={100}
          />
        </label>
        <label>
          Email
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={160}
          />
        </label>
      </div>

      <div className="form-grid two">
        <label>
          Company
          <input
            className="input"
            type="text"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            maxLength={160}
          />
        </label>
        <label>
          Topic
          <select
            className="input"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          >
            <option value="">Select topic</option>
            <option value="Sales">Sales</option>
            <option value="Partnership">Partnership</option>
            <option value="Compliance">Compliance</option>
            <option value="Support">Support</option>
          </select>
        </label>
      </div>

      <label>
        Message
        <textarea
          className="input textarea"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          required
          minLength={10}
          maxLength={3000}
        />
      </label>

      <button
        type="submit"
        className="btn primary"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? "Sending..." : "Send Message"}
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
