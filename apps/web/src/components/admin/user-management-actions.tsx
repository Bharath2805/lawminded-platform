"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiUrl, readErrorMessage } from "@/lib/client-api";

type AdminUserRow = {
  id: string;
  email: string;
  status: string;
  roles: string[];
};

type UserManagementActionsProps = {
  user: AdminUserRow;
};

type ConfirmationState = {
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<void>;
};

export function UserManagementActions({ user }: UserManagementActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user.roles.includes("admin");
  const hasAssistantAccess = user.roles.includes("assistant_access");
  const isSuspended = user.status === "SUSPENDED";
  const busy = isPending || exporting || confirming;

  const refresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const refreshWithFeedback = (successMessage: string) => {
    setMessage(successMessage);

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        refresh();
      }, 900);
      return;
    }

    refresh();
  };

  const callApi = async (
    path: string,
    options?: {
      method?: "PATCH" | "POST";
      body?: Record<string, unknown>;
    },
  ) => {
    const response = await fetch(`${apiUrl}${path}`, {
      method: options?.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
  };

  const toggleStatus = async () => {
    setError(null);
    setMessage(null);

    try {
      await callApi(`/api/admin/users/${user.id}/status`, {
        method: "PATCH",
        body: {
          status: isSuspended ? "ACTIVE" : "SUSPENDED",
        },
      });
      refreshWithFeedback(isSuspended ? "User activated." : "User suspended.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update user status.",
      );
    }
  };

  const toggleAdminRole = async () => {
    setError(null);
    setMessage(null);

    try {
      await callApi(`/api/admin/users/${user.id}/admin-role`, {
        method: "PATCH",
        body: {
          enabled: !isAdmin,
        },
      });
      refreshWithFeedback(
        isAdmin ? "Admin role removed." : "Admin role granted.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update admin role.",
      );
    }
  };

  const toggleAssistantAccess = async () => {
    setError(null);
    setMessage(null);

    try {
      await callApi(`/api/admin/users/${user.id}/assistant-access`, {
        method: "PATCH",
        body: {
          enabled: !hasAssistantAccess,
        },
      });
      refreshWithFeedback(
        hasAssistantAccess
          ? "Assistant access removed."
          : "Assistant access granted.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update assistant access.",
      );
    }
  };

  const revokeSessions = async () => {
    setError(null);
    setMessage(null);

    try {
      await callApi(`/api/admin/users/${user.id}/revoke-sessions`, {
        method: "POST",
      });
      refreshWithFeedback("All active sessions revoked.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to revoke user sessions.",
      );
    }
  };

  const emergencyRestoreAccess = async () => {
    setError(null);
    setMessage(null);

    try {
      if (isSuspended) {
        await callApi(`/api/admin/users/${user.id}/status`, {
          method: "PATCH",
          body: {
            status: "ACTIVE",
          },
        });
      }

      if (!hasAssistantAccess) {
        await callApi(`/api/admin/users/${user.id}/assistant-access`, {
          method: "PATCH",
          body: {
            enabled: true,
          },
        });
      }

      refreshWithFeedback("Emergency restore completed.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to complete emergency restore.",
      );
    }
  };

  const exportUserData = async () => {
    setError(null);
    setMessage(null);
    setExporting(true);

    try {
      const response = await fetch(
        `${apiUrl}/api/admin/privacy/export/${user.id}`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `gdpr-export-${user.email.replace(/[^a-zA-Z0-9_-]/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setMessage("GDPR export downloaded.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to export user data.",
      );
    } finally {
      setExporting(false);
    }
  };

  const requestConfirmation = (next: ConfirmationState) => {
    if (busy) {
      return;
    }

    setConfirmation(next);
  };

  const confirmAction = async () => {
    if (!confirmation || confirming) {
      return;
    }

    setConfirming(true);

    try {
      await confirmation.action();
      setConfirmation(null);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="admin-user-actions">
      <div className="admin-user-actions-row">
        <button
          type="button"
          className="btn secondary small"
          disabled={busy}
          onClick={() =>
            requestConfirmation({
              title: isSuspended
                ? "Activate User Account"
                : "Suspend User Account",
              description: isSuspended
                ? "This user will be able to sign in again."
                : "This user will be blocked from signing in until reactivated.",
              confirmLabel: isSuspended ? "Activate User" : "Suspend User",
              action: toggleStatus,
            })
          }
        >
          {isSuspended ? "Activate User" : "Suspend User"}
        </button>
        <button
          type="button"
          className="btn secondary small"
          disabled={busy}
          onClick={() =>
            requestConfirmation({
              title: hasAssistantAccess
                ? "Remove Assistant Access"
                : "Grant Assistant Access",
              description: hasAssistantAccess
                ? "This user will lose access to AI Assistant features."
                : "This user will gain access to AI Assistant features.",
              confirmLabel: hasAssistantAccess
                ? "Remove Access"
                : "Grant Access",
              action: toggleAssistantAccess,
            })
          }
        >
          {hasAssistantAccess
            ? "Remove Assistant Access"
            : "Grant Assistant Access"}
        </button>
      </div>

      <div className="admin-user-actions-row">
        <button
          type="button"
          className="btn secondary small"
          disabled={busy}
          onClick={() =>
            requestConfirmation({
              title: isAdmin ? "Remove Admin Access" : "Grant Admin Access",
              description: isAdmin
                ? "This user will no longer have full administrative control."
                : "This user will receive full administrative control.",
              confirmLabel: isAdmin ? "Remove Admin" : "Grant Admin",
              action: toggleAdminRole,
            })
          }
        >
          {isAdmin ? "Remove Admin" : "Make Admin"}
        </button>
        <button
          type="button"
          className="btn secondary small"
          disabled={busy}
          onClick={() =>
            requestConfirmation({
              title: "Emergency Restore Access",
              description:
                "This will activate the account (if suspended) and grant assistant access.",
              confirmLabel: "Run Restore",
              action: emergencyRestoreAccess,
            })
          }
        >
          Emergency Restore Access
        </button>
      </div>

      <div className="admin-user-actions-row">
        <button
          type="button"
          className="btn secondary small"
          disabled={busy}
          onClick={() =>
            requestConfirmation({
              title: "Sign Out All Devices",
              description:
                "All active sessions for this user will be revoked immediately.",
              confirmLabel: "Sign Out",
              action: revokeSessions,
            })
          }
        >
          Sign Out All Devices
        </button>
        <button
          type="button"
          className="btn secondary small"
          disabled={busy}
          onClick={exportUserData}
        >
          {exporting ? "Preparing..." : "Download User Data"}
        </button>
      </div>

      {message ? <p className="form-message success">{message}</p> : null}
      {error ? <p className="form-message error">{error}</p> : null}

      {confirmation ? (
        <div className="plan-change-modal-backdrop" role="presentation">
          <div className="plan-change-modal" role="dialog" aria-modal="true">
            <h4>{confirmation.title}</h4>
            <p>{confirmation.description}</p>
            <div className="plan-change-actions">
              <button
                type="button"
                className="btn ghost small"
                disabled={confirming}
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary small"
                disabled={confirming}
                onClick={() => {
                  void confirmAction();
                }}
              >
                {confirming ? "Applying..." : confirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
