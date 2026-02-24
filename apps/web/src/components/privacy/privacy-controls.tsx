"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiUrl, readErrorMessage } from "@/lib/client-api";

type DsarType =
  | "ACCESS"
  | "EXPORT"
  | "RECTIFICATION"
  | "ERASURE"
  | "RESTRICTION"
  | "OBJECTION";

type DsarStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";

type DsarRequestItem = {
  id: string;
  type: DsarType;
  status: DsarStatus;
  details: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

const OPEN_BANNER_EVENT = "lawminded:open-consent-banner";

const dsarTypeLabels: Record<DsarType, string> = {
  ACCESS: "Access",
  EXPORT: "Export",
  RECTIFICATION: "Rectification",
  ERASURE: "Deletion",
  RESTRICTION: "Restriction",
  OBJECTION: "Objection",
};

export function PrivacyControls() {
  const [requests, setRequests] = useState<DsarRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const [requestType, setRequestType] = useState<DsarType>("ACCESS");
  const [details, setDetails] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoadingRequests(true);

    try {
      const response = await fetch(`${apiUrl}/api/privacy/dsar/me`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        setRequestError(await readErrorMessage(response));
        setRequests([]);
        return;
      }

      const payload = (await response.json()) as {
        requests?: DsarRequestItem[];
      };

      setRequests(payload.requests ?? []);
      setRequestError(null);
    } catch {
      setRequestError("Unable to load privacy request history.");
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submittingRequest) {
      return;
    }

    setSubmittingRequest(true);
    setRequestMessage(null);
    setRequestError(null);

    try {
      const response = await fetch(`${apiUrl}/api/privacy/dsar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          type: requestType,
          details: details || undefined,
        }),
      });

      if (!response.ok) {
        setRequestError(await readErrorMessage(response));
        return;
      }

      setRequestMessage(
        "Request submitted. Our team will review and follow up.",
      );
      setDetails("");
      await loadRequests();
    } catch {
      setRequestError("Unable to submit request right now.");
    } finally {
      setSubmittingRequest(false);
    }
  };

  const exportMyData = async () => {
    if (exporting) {
      return;
    }

    setExporting(true);
    setExportMessage(null);
    setExportError(null);

    try {
      const response = await fetch(`${apiUrl}/api/privacy/export/me`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        setExportError(await readErrorMessage(response));
        return;
      }

      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `lawminded-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.URL.revokeObjectURL(url);

      setExportMessage("Export generated and downloaded successfully.");
    } catch {
      setExportError("Unable to generate the export right now.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="privacy-controls">
      <article className="panel">
        <h2>Cookie preferences</h2>
        <p>
          Review and update optional analytics and marketing consent at any
          time.
        </p>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => window.dispatchEvent(new Event(OPEN_BANNER_EVENT))}
        >
          Manage cookie preferences
        </button>
      </article>

      <article className="panel">
        <h2>Export personal data</h2>
        <p>
          Download an export of account, session, billing, lead, and privacy
          records currently associated with your profile.
        </p>
        <button
          type="button"
          className="btn secondary small"
          disabled={exporting}
          onClick={exportMyData}
        >
          {exporting ? "Preparing export..." : "Export my data"}
        </button>
        {exportMessage ? (
          <p className="form-message success">{exportMessage}</p>
        ) : null}
        {exportError ? (
          <p className="form-message error">{exportError}</p>
        ) : null}
      </article>

      <article className="panel">
        <h2>Submit a privacy request (DSAR)</h2>
        <p>
          Submit a rights request for access, deletion, rectification, or other
          GDPR rights.
        </p>

        <form className="panel-form" onSubmit={submitRequest}>
          <label>
            Request type
            <select
              className="input"
              value={requestType}
              onChange={(event) =>
                setRequestType(event.target.value as DsarType)
              }
            >
              {(Object.keys(dsarTypeLabels) as DsarType[]).map((type) => (
                <option key={type} value={type}>
                  {dsarTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>

          <label>
            Additional details
            <textarea
              className="input textarea"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={4000}
              placeholder="Describe relevant records, dates, and context for this request."
            />
          </label>

          <button
            type="submit"
            className="btn primary small"
            disabled={submittingRequest}
          >
            {submittingRequest ? "Submitting..." : "Submit request"}
          </button>
        </form>

        {requestMessage ? (
          <p className="form-message success">{requestMessage}</p>
        ) : null}
        {requestError ? (
          <p className="form-message error">{requestError}</p>
        ) : null}
      </article>

      <article className="panel">
        <h2>My DSAR requests</h2>

        {loadingRequests ? (
          <p className="muted">Loading request history...</p>
        ) : requests.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      {new Date(request.requestedAt).toLocaleDateString()}
                    </td>
                    <td>{dsarTypeLabels[request.type]}</td>
                    <td>{request.status}</td>
                    <td>
                      {request.resolvedAt
                        ? new Date(request.resolvedAt).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No privacy requests submitted yet.</p>
        )}
      </article>
    </div>
  );
}
