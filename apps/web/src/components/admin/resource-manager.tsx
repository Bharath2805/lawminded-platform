"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiUrl, readErrorMessage } from "@/lib/client-api";

type ResourceVisibility = "PUBLIC" | "AUTHENTICATED";
type ResourceDeliveryType = "LINK" | "FILE";
type ResourceEntitlementMode = "ALL_AUTHENTICATED" | "PLAN_RESTRICTED";

export type AdminResource = {
  id: string;
  key: string;
  title: string;
  summary: string;
  category: string | null;
  href: string;
  visibility: ResourceVisibility;
  deliveryType: ResourceDeliveryType;
  entitlementMode: ResourceEntitlementMode;
  entitledPlanKeys: string[];
  active: boolean;
  sortOrder: number;
  hasFile: boolean;
  fileName: string | null;
  fileSizeBytes: number | null;
  fileMimeType: string | null;
  totalAccesses: number;
  lastAccessAt: string | null;
};

type PlanOption = {
  key: string;
  name: string;
};

type ResourceStorageStatus = {
  configured: boolean;
  bucket: string | null;
  region: string | null;
  endpoint: string | null;
  keyPrefix: string;
  missingRequiredEnvKeys: string[];
  missingOptionalEnvKeys: string[];
};

type ResourceManagerProps = {
  resources: AdminResource[];
  plans: PlanOption[];
  storageStatus: ResourceStorageStatus | null;
};

type ResourceRowEditorProps = {
  resource: AdminResource;
  plans: PlanOption[];
  storageConfigured: boolean;
  onChanged: () => void;
};

type ResourceFormState = {
  title: string;
  summary: string;
  category: string;
  href: string;
  visibility: ResourceVisibility;
  deliveryType: ResourceDeliveryType;
  entitlementMode: ResourceEntitlementMode;
  entitledPlanKeys: string[];
  active: boolean;
  sortOrder: string;
};

type CreateFormState = {
  key: string;
  title: string;
  summary: string;
  category: string;
  href: string;
  visibility: ResourceVisibility;
  deliveryType: ResourceDeliveryType;
  entitlementMode: ResourceEntitlementMode;
  entitledPlanKeys: string[];
  active: boolean;
  sortOrder: string;
};

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toggleInList(list: string[], value: string): string[] {
  if (list.includes(value)) {
    return list.filter((entry) => entry !== value);
  }

  return [...list, value].sort();
}

function toUpdatePayload(state: ResourceFormState) {
  const entitlementMode = state.entitlementMode;
  const entitledPlanKeys =
    entitlementMode === "PLAN_RESTRICTED" ? state.entitledPlanKeys : [];

  return {
    title: state.title.trim(),
    summary: state.summary.trim(),
    category: state.category.trim() || undefined,
    href: state.href.trim(),
    visibility: state.visibility,
    deliveryType: state.deliveryType,
    entitlementMode,
    entitledPlanKeys,
    active: state.active,
    sortOrder: Number.isFinite(Number(state.sortOrder))
      ? Number(state.sortOrder)
      : 100,
  };
}

function toCreatePayload(state: CreateFormState) {
  const entitlementMode = state.entitlementMode;
  const entitledPlanKeys =
    entitlementMode === "PLAN_RESTRICTED" ? state.entitledPlanKeys : [];

  return {
    key: state.key.trim(),
    title: state.title.trim(),
    summary: state.summary.trim(),
    category: state.category.trim() || undefined,
    href: state.href.trim(),
    visibility: state.visibility,
    deliveryType: state.deliveryType,
    entitlementMode,
    entitledPlanKeys,
    active: state.active,
    sortOrder: Number.isFinite(Number(state.sortOrder))
      ? Number(state.sortOrder)
      : 100,
  };
}

function buildInitialRowState(resource: AdminResource): ResourceFormState {
  return {
    title: resource.title,
    summary: resource.summary,
    category: resource.category ?? "",
    href: resource.href,
    visibility: resource.visibility,
    deliveryType: resource.deliveryType,
    entitlementMode: resource.entitlementMode,
    entitledPlanKeys: resource.entitledPlanKeys,
    active: resource.active,
    sortOrder: String(resource.sortOrder),
  };
}

function ResourceRowEditor({
  resource,
  plans,
  storageConfigured,
  onChanged,
}: ResourceRowEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<ResourceFormState>(
    buildInitialRowState(resource),
  );

  const reset = () => {
    setState(buildInitialRowState(resource));
    setError(null);
    setSuccess(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const payload = toUpdatePayload(state);

    try {
      const response = await fetch(
        `${apiUrl}/api/admin/resources/${resource.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }

      setSuccess("Saved.");
      startTransition(() => {
        onChanged();
      });
    } catch {
      setError(`Cannot reach API at ${apiUrl}. Start backend and try again.`);
    }
  };

  const onUploadFile = async (file: File) => {
    setError(null);
    setSuccess(null);
    setUploading(true);

    try {
      const createUrlResponse = await fetch(
        `${apiUrl}/api/admin/resources/${resource.id}/file-upload-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
          }),
        },
      );

      if (!createUrlResponse.ok) {
        setError(await readErrorMessage(createUrlResponse));
        return;
      }

      const uploadPayload = (await createUrlResponse.json()) as {
        uploadUrl: string;
        storageKey: string;
        requiredHeaders?: {
          "Content-Type"?: string;
        };
      };

      const uploadResult = await fetch(uploadPayload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type":
            uploadPayload.requiredHeaders?.["Content-Type"] ||
            file.type ||
            "application/octet-stream",
        },
        body: file,
      });

      if (!uploadResult.ok) {
        setError(
          `File upload failed with status ${uploadResult.status}. Check storage credentials and CORS settings.`,
        );
        return;
      }

      const attachResponse = await fetch(
        `${apiUrl}/api/admin/resources/${resource.id}/file`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            storageKey: uploadPayload.storageKey,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
          }),
        },
      );

      if (!attachResponse.ok) {
        setError(await readErrorMessage(attachResponse));
        return;
      }

      setSuccess("File uploaded and attached.");
      startTransition(() => {
        onChanged();
      });
    } catch {
      setError(`Cannot reach API at ${apiUrl}. Start backend and try again.`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <article className="panel resource-editor">
      <div className="resource-editor-head">
        <div>
          <h3>{resource.title}</h3>
          <p className="muted resource-editor-key">Key: {resource.key}</p>
          {resource.hasFile ? (
            <p className="muted resource-editor-file">
              File: {resource.fileName ?? "Attached"}
              {resource.fileSizeBytes
                ? ` · ${formatBytes(resource.fileSizeBytes)}`
                : ""}
            </p>
          ) : (
            <p className="muted resource-editor-file">No file attached</p>
          )}
        </div>
        <div className="resource-editor-stats">
          <span>Accesses: {resource.totalAccesses}</span>
          <span>
            Last:{" "}
            {resource.lastAccessAt
              ? new Date(resource.lastAccessAt).toLocaleDateString()
              : "-"}
          </span>
        </div>
      </div>

      <form className="panel-form resource-editor-form" onSubmit={onSubmit}>
        <div className="form-grid two">
          <label>
            Title
            <input
              className="input"
              value={state.title}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              maxLength={160}
              required
            />
          </label>
          <label>
            Category
            <input
              className="input"
              value={state.category}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
              maxLength={80}
              placeholder="Guide, Template, Checklist"
            />
          </label>
        </div>

        <label>
          Summary
          <textarea
            className="input textarea"
            value={state.summary}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                summary: event.target.value,
              }))
            }
            maxLength={600}
            required
          />
        </label>

        <label>
          Link URL (https://... or /path)
          <input
            className="input"
            value={state.href}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                href: event.target.value,
              }))
            }
            maxLength={500}
            required
          />
        </label>

        <div className="form-grid three">
          <label>
            Visibility
            <select
              className="input"
              value={state.visibility}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  visibility: event.target.value as ResourceVisibility,
                }))
              }
            >
              <option value="PUBLIC">PUBLIC</option>
              <option value="AUTHENTICATED">AUTHENTICATED</option>
            </select>
          </label>

          <label>
            Resource Type
            <select
              className="input"
              value={state.deliveryType}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  deliveryType: event.target.value as ResourceDeliveryType,
                }))
              }
            >
              <option value="LINK">LINK</option>
              <option value="FILE">FILE</option>
            </select>
          </label>

          <label>
            Sort Order
            <input
              className="input"
              type="number"
              min={0}
              max={10000}
              value={state.sortOrder}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  sortOrder: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="form-grid two">
          <label>
            Access Rule
            <select
              className="input"
              value={state.entitlementMode}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  entitlementMode: event.target
                    .value as ResourceEntitlementMode,
                  entitledPlanKeys:
                    event.target.value === "PLAN_RESTRICTED"
                      ? current.entitledPlanKeys
                      : [],
                }))
              }
            >
              <option value="ALL_AUTHENTICATED">ALL_AUTHENTICATED</option>
              <option value="PLAN_RESTRICTED">PLAN_RESTRICTED</option>
            </select>
          </label>

          <label className="checkbox-field">
            <span>Active</span>
            <input
              type="checkbox"
              checked={state.active}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
            />
          </label>
        </div>

        {state.entitlementMode === "PLAN_RESTRICTED" ? (
          <div className="plan-checkbox-list">
            <p className="muted">Allowed plans</p>
            <div className="plan-checkbox-grid">
              {plans.map((plan) => (
                <label key={plan.key} className="checkbox-field">
                  <span>{plan.name}</span>
                  <input
                    type="checkbox"
                    checked={state.entitledPlanKeys.includes(plan.key)}
                    onChange={() =>
                      setState((current) => ({
                        ...current,
                        entitledPlanKeys: toggleInList(
                          current.entitledPlanKeys,
                          plan.key,
                        ),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="resource-editor-actions">
          <button
            className="btn primary small"
            type="submit"
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Save changes"}
          </button>
          <button
            className="btn ghost small"
            type="button"
            disabled={isPending}
            onClick={reset}
          >
            Reset
          </button>
          <button
            className="btn secondary small"
            type="button"
            onClick={() => {
              window.location.assign(resource.href);
            }}
          >
            Open
          </button>
          <label
            className="btn ghost small file-upload-btn"
            aria-disabled={!storageConfigured || uploading}
          >
            {!storageConfigured
              ? "Upload disabled (storage not configured)"
              : uploading
                ? "Uploading..."
                : "Upload file"}
            <input
              type="file"
              hidden
              disabled={uploading || !storageConfigured}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }

                void onUploadFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        {error ? <p className="form-message error">{error}</p> : null}
        {success ? <p className="form-message success">{success}</p> : null}
      </form>
    </article>
  );
}

const defaultCreateState: CreateFormState = {
  key: "",
  title: "",
  summary: "",
  category: "",
  href: "",
  visibility: "AUTHENTICATED",
  deliveryType: "LINK",
  entitlementMode: "ALL_AUTHENTICATED",
  entitledPlanKeys: [],
  active: true,
  sortOrder: "100",
};

export function ResourceManager({
  resources,
  plans,
  storageStatus,
}: ResourceManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createState, setCreateState] =
    useState<CreateFormState>(defaultCreateState);

  const refresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const payload = toCreatePayload(createState);

    try {
      const response = await fetch(`${apiUrl}/api/admin/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }

      setSuccess("Resource created.");
      setCreateState(defaultCreateState);
      refresh();
    } catch {
      setError(`Cannot reach API at ${apiUrl}. Start backend and try again.`);
    }
  };

  return (
    <div className="resource-manager">
      {storageStatus && !storageStatus.configured ? (
        <article className="panel">
          <h3>File uploads are disabled</h3>
          <p className="form-message error">
            Storage is not configured yet. You can still manage link-based
            resources, but FILE delivery requires storage setup.
          </p>
          {storageStatus.missingRequiredEnvKeys.length > 0 ? (
            <p className="muted">
              Missing required keys:{" "}
              {storageStatus.missingRequiredEnvKeys.join(", ")}
            </p>
          ) : null}
          {storageStatus.missingOptionalEnvKeys.length > 0 ? (
            <p className="muted">
              Optional keys not set:{" "}
              {storageStatus.missingOptionalEnvKeys.join(", ")}
            </p>
          ) : null}
        </article>
      ) : null}

      <article className="panel">
        <h3>Create resource</h3>
        <p className="muted">
          Add public or authenticated resources for marketing and dashboard
          pages.
        </p>

        <form className="panel-form" onSubmit={onCreate}>
          <div className="form-grid two">
            <label>
              Key
              <input
                className="input"
                value={createState.key}
                onChange={(event) =>
                  setCreateState((current) => ({
                    ...current,
                    key: event.target.value,
                  }))
                }
                maxLength={64}
                placeholder="eu-ai-act-readiness-checklist"
                required
              />
            </label>
            <label>
              Title
              <input
                className="input"
                value={createState.title}
                onChange={(event) =>
                  setCreateState((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                maxLength={160}
                required
              />
            </label>
          </div>

          <label>
            Summary
            <textarea
              className="input textarea"
              value={createState.summary}
              onChange={(event) =>
                setCreateState((current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
              maxLength={600}
              required
            />
          </label>

          <label>
            Link URL (https://... or /path)
            <input
              className="input"
              value={createState.href}
              onChange={(event) =>
                setCreateState((current) => ({
                  ...current,
                  href: event.target.value,
                }))
              }
              maxLength={500}
              required
            />
          </label>

          <div className="form-grid three">
            <label>
              Category
              <input
                className="input"
                value={createState.category}
                onChange={(event) =>
                  setCreateState((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                maxLength={80}
              />
            </label>

            <label>
              Visibility
              <select
                className="input"
                value={createState.visibility}
                onChange={(event) =>
                  setCreateState((current) => ({
                    ...current,
                    visibility: event.target.value as ResourceVisibility,
                  }))
                }
              >
                <option value="AUTHENTICATED">AUTHENTICATED</option>
                <option value="PUBLIC">PUBLIC</option>
              </select>
            </label>

            <label>
              Resource Type
              <select
                className="input"
                value={createState.deliveryType}
                onChange={(event) =>
                  setCreateState((current) => ({
                    ...current,
                    deliveryType: event.target.value as ResourceDeliveryType,
                  }))
                }
              >
                <option value="LINK">LINK</option>
                <option value="FILE">FILE</option>
              </select>
            </label>
          </div>

          <div className="form-grid two">
            <label>
              Access Rule
              <select
                className="input"
                value={createState.entitlementMode}
                onChange={(event) =>
                  setCreateState((current) => ({
                    ...current,
                    entitlementMode: event.target
                      .value as ResourceEntitlementMode,
                    entitledPlanKeys:
                      event.target.value === "PLAN_RESTRICTED"
                        ? current.entitledPlanKeys
                        : [],
                  }))
                }
              >
                <option value="ALL_AUTHENTICATED">ALL_AUTHENTICATED</option>
                <option value="PLAN_RESTRICTED">PLAN_RESTRICTED</option>
              </select>
            </label>

            <label>
              Sort Order
              <input
                className="input"
                type="number"
                min={0}
                max={10000}
                value={createState.sortOrder}
                onChange={(event) =>
                  setCreateState((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          {createState.entitlementMode === "PLAN_RESTRICTED" ? (
            <div className="plan-checkbox-list">
              <p className="muted">Allowed plans</p>
              <div className="plan-checkbox-grid">
                {plans.map((plan) => (
                  <label key={plan.key} className="checkbox-field">
                    <span>{plan.name}</span>
                    <input
                      type="checkbox"
                      checked={createState.entitledPlanKeys.includes(plan.key)}
                      onChange={() =>
                        setCreateState((current) => ({
                          ...current,
                          entitledPlanKeys: toggleInList(
                            current.entitledPlanKeys,
                            plan.key,
                          ),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <label className="checkbox-field">
            <span>Active</span>
            <input
              type="checkbox"
              checked={createState.active}
              onChange={(event) =>
                setCreateState((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
            />
          </label>

          <div className="resource-editor-actions">
            <button
              className="btn primary small"
              type="submit"
              disabled={isPending}
            >
              {isPending ? "Creating..." : "Create resource"}
            </button>
          </div>

          {error ? <p className="form-message error">{error}</p> : null}
          {success ? <p className="form-message success">{success}</p> : null}
        </form>
      </article>

      <div className="resource-editor-list">
        {resources.map((resource) => (
          <ResourceRowEditor
            key={resource.id}
            resource={resource}
            plans={plans}
            storageConfigured={Boolean(storageStatus?.configured)}
            onChanged={refresh}
          />
        ))}
      </div>
    </div>
  );
}
