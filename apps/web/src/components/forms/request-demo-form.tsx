"use client";

import { FormEvent, useMemo, useState } from "react";

type SubmissionState = "idle" | "submitting" | "success" | "error";

export function RequestDemoForm() {
  const [status, setStatus] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState("");

  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [useCase, setUseCase] = useState("");
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
      const response = await fetch(`${apiUrl}/api/leads/demo-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          workEmail,
          company,
          jobTitle: jobTitle || undefined,
          teamSize: teamSize || undefined,
          useCase: useCase || undefined,
          message: note || undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Demo request failed");
      }

      setStatus("success");
      setMessage(
        "Your demo request has been submitted. We will contact you within one business day.",
      );
      setFullName("");
      setWorkEmail("");
      setCompany("");
      setJobTitle("");
      setTeamSize("");
      setUseCase("");
      setNote("");
    } catch {
      setStatus("error");
      setMessage("We could not submit your request. Please try again shortly.");
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
            maxLength={100}
            required
          />
        </label>
        <label>
          Work email
          <input
            className="input"
            type="email"
            value={workEmail}
            onChange={(event) => setWorkEmail(event.target.value)}
            maxLength={160}
            required
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
            required
          />
        </label>
        <label>
          Job title
          <input
            className="input"
            type="text"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
            maxLength={120}
          />
        </label>
      </div>

      <div className="form-grid two">
        <label>
          Team size
          <select
            className="input"
            value={teamSize}
            onChange={(event) => setTeamSize(event.target.value)}
          >
            <option value="">Select team size</option>
            <option value="1-10">1-10</option>
            <option value="11-50">11-50</option>
            <option value="51-200">51-200</option>
            <option value="200+">200+</option>
          </select>
        </label>
        <label>
          Main use case
          <input
            className="input"
            type="text"
            value={useCase}
            onChange={(event) => setUseCase(event.target.value)}
            maxLength={2000}
            placeholder="Example: AI hiring workflow readiness"
          />
        </label>
      </div>

      <label>
        Additional context
        <textarea
          className="input textarea"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={3000}
          placeholder="Share timeline, current tooling, and key compliance priorities."
        />
      </label>

      <button
        type="submit"
        className="btn primary"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? "Submitting..." : "Request Demo"}
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
