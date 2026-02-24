"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiUrl, readErrorMessage } from "@/lib/client-api";

type DsarStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";

export function DsarStatusForm({
  requestId,
  currentStatus,
}: {
  requestId: string;
  currentStatus: DsarStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<DsarStatus>(currentStatus);
  const [resolutionNote, setResolutionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `${apiUrl}/api/admin/privacy/dsar/${encodeURIComponent(requestId)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            status,
            resolutionNote: resolutionNote || undefined,
          }),
        },
      );

      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }

      router.refresh();
    } catch {
      setError("Unable to update DSAR status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-dsar-form" onSubmit={onSubmit}>
      <select
        className="input"
        value={status}
        onChange={(event) => setStatus(event.target.value as DsarStatus)}
      >
        <option value="OPEN">Open</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="COMPLETED">Completed</option>
        <option value="REJECTED">Rejected</option>
      </select>
      <input
        className="input"
        type="text"
        value={resolutionNote}
        onChange={(event) => setResolutionNote(event.target.value)}
        maxLength={2000}
        placeholder="Resolution note (optional)"
      />
      <button className="btn ghost small" type="submit" disabled={saving}>
        {saving ? "Saving..." : "Update"}
      </button>
      {error ? <span className="form-message error">{error}</span> : null}
    </form>
  );
}
