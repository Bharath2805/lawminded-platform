"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { getOrCreateAnonymousId } from "@/lib/browser-identity";
import { apiUrl, readErrorMessage } from "@/lib/client-api";

type MessageRole = "user" | "assistant" | "system" | "error";
type ApiMessageRole = "USER" | "ASSISTANT" | "SYSTEM" | "ERROR";

type TrialMessage = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  loading?: boolean;
};

type TrialStateResponse = {
  trial: {
    isAuthenticated: boolean;
    conversationId: string | null;
    promptLimit: number;
    usedPrompts: number;
    remainingPrompts: number | null;
    canSend: boolean;
    isPremiumUser: boolean;
    messages: Array<{
      id: string;
      role: ApiMessageRole;
      content: string;
      createdAt: string;
    }>;
  };
};

type StreamPayload =
  | { type: "meta"; thread_id: string; conversation_id: string }
  | { type: "status"; content: string }
  | { type: "text"; content: string }
  | { type: "error"; content: string };

type HomeAssistantTrialProps = {
  enabled?: boolean;
};

const TRIAL_STATE_TIMEOUT_MS = 20_000;
const TRIAL_STREAM_TIMEOUT_MS = 180_000;

function mapRole(role: ApiMessageRole): MessageRole {
  if (role === "USER") {
    return "user";
  }
  if (role === "ASSISTANT") {
    return "assistant";
  }
  if (role === "SYSTEM") {
    return "system";
  }
  return "error";
}

function formatLimitText(remainingPrompts: number | null) {
  if (remainingPrompts === null) {
    return "Unlimited prompts available for this account.";
  }

  if (remainingPrompts <= 0) {
    return "Trial limit reached. Upgrade to continue.";
  }

  if (remainingPrompts === 1) {
    return "1 trial prompt remaining.";
  }

  return `${remainingPrompts} trial prompts remaining.`;
}

function clearTrailingLoadingMessage(messages: TrialMessage[]): TrialMessage[] {
  const next = [...messages];

  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index]?.loading) {
      next[index] = {
        ...next[index],
        loading: false,
      };
      return next;
    }
  }

  return messages;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

export function HomeAssistantTrial({
  enabled = false,
}: HomeAssistantTrialProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TrialMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [canSend, setCanSend] = useState(enabled);
  const [remainingPrompts, setRemainingPrompts] = useState<number | null>(
    enabled ? 1 : 0,
  );

  const anonymousIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const requestInFlightRef = useRef(false);

  const buildHeaders = useCallback((isJson = false) => {
    const id = anonymousIdRef.current ?? getOrCreateAnonymousId();
    const headers: Record<string, string> = {};

    if (isJson) {
      headers["Content-Type"] = "application/json";
    }

    anonymousIdRef.current = id;

    if (id) {
      headers["x-lm-anonymous-id"] = id;
    }

    return headers;
  }, []);

  const refreshState = useCallback(async () => {
    const response = await fetchWithTimeout(
      `${apiUrl}/api/chat/trial`,
      {
        method: "GET",
        credentials: "include",
        headers: buildHeaders(),
      },
      TRIAL_STATE_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const payload = (await response.json()) as TrialStateResponse;
    const trial = payload.trial;

    setConversationId(trial.conversationId);
    setIsAuthenticated(trial.isAuthenticated);
    setIsPremiumUser(trial.isPremiumUser);
    setCanSend(trial.canSend);
    setRemainingPrompts(trial.remainingPrompts);
    setMessages(
      trial.messages.map((message) => ({
        id: message.id,
        role: mapRole(message.role),
        content: message.content,
        createdAt: message.createdAt,
      })),
    );
  }, [buildHeaders]);

  useEffect(() => {
    if (!enabled) {
      setInitializing(false);
      setCanSend(false);
      setRemainingPrompts(0);
      setMessages([]);
      return;
    }

    void (async () => {
      setInitializing(true);
      setError(null);

      try {
        await refreshState();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load trial assistant.",
        );
      } finally {
        setInitializing(false);
      }
    })();
  }, [enabled, refreshState]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const setAssistantMessage = (
    content: string,
    role: MessageRole = "assistant",
  ) => {
    setMessages((prev) => {
      const next = [...prev];
      for (let index = next.length - 1; index >= 0; index -= 1) {
        if (next[index]?.role === "assistant" || next[index]?.loading) {
          next[index] = {
            ...next[index],
            role,
            content,
            loading: false,
          };
          return next;
        }
      }

      next.push({
        id: `${role}-${Date.now()}`,
        role,
        content,
        createdAt: new Date().toISOString(),
      });
      return next;
    });
  };

  const sendMessage = async () => {
    const message = input.trim();

    if (!message || loading || !canSend || requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    setError(null);
    setLoading(true);
    setInput("");

    const now = new Date().toISOString();

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: message,
        createdAt: now,
      },
      {
        id: `pending-${Date.now()}`,
        role: "assistant",
        content: "",
        createdAt: now,
        loading: true,
      },
    ]);

    try {
      const response = await fetchWithTimeout(
        `${apiUrl}/api/chat/trial/stream`,
        {
          method: "POST",
          credentials: "include",
          headers: buildHeaders(true),
          body: JSON.stringify({
            message,
            conversation_id: conversationId,
          }),
        },
        TRIAL_STREAM_TIMEOUT_MS,
      );

      if (!response.ok || !response.body) {
        throw new Error(await readErrorMessage(response));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let buffer = "";
      let streamReportedError = false;

      const processFrames = (frames: string[]) => {
        for (const frame of frames) {
          const lines = frame.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) {
              continue;
            }

            const data = line.slice(6).trim();
            if (!data || data === "[DONE]") {
              continue;
            }

            let payload: StreamPayload;
            try {
              payload = JSON.parse(data) as StreamPayload;
            } catch {
              continue;
            }

            if (payload.type === "meta") {
              setConversationId(payload.conversation_id);
            }

            if (payload.type === "status") {
              setAssistantMessage(payload.content, "assistant");
            }

            if (payload.type === "text") {
              assistantText += payload.content;
              setAssistantMessage(assistantText, "assistant");
            }

            if (payload.type === "error") {
              streamReportedError = true;
              setAssistantMessage(payload.content, "error");
            }
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim().length > 0) {
            processFrames([buffer]);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        processFrames(frames);
      }

      if (!assistantText.trim() && !streamReportedError) {
        setAssistantMessage(
          "The assistant did not return a response. Please retry.",
          "error",
        );
      }

      await refreshState();
    } catch (nextError) {
      const messageText = isAbortError(nextError)
        ? "Assistant response timed out. Please retry or shorten the request."
        : nextError instanceof Error
          ? nextError.message
          : "Unable to complete trial request.";
      setError(messageText);
      setAssistantMessage(messageText, "error");
      await refreshState().catch(() => undefined);
    } finally {
      requestInFlightRef.current = false;
      setMessages((prev) => clearTrailingLoadingMessage(prev));
      setLoading(false);
    }
  };

  if (!enabled) {
    return (
      <section className="section trial-assistant">
        <div className="shell">
          <div className="section-head text-center">
            <p className="eyebrow">AI Assistant</p>
            <h2>Assistant access is currently limited.</h2>
            <p className="lead">
              Assistant access is currently available to authorized admin
              accounts and users approved by admins.
            </p>
          </div>

          <div className="trial-panel">
            <div className="trial-panel-head">
              <div className="trial-badge">
                <Sparkles size={14} />
                <span>Admin-only testing mode</span>
              </div>
              <div className="trial-cta-inline">
                <Link
                  href="/login?next=%2Fapp%2Fassistant"
                  className="btn primary small"
                >
                  Admin Login
                </Link>
              </div>
            </div>
            <p className="trial-note">
              End users can continue using billing, resources, and privacy
              settings while assistant access is controlled.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section trial-assistant">
      <div className="shell">
        <div className="section-head text-center">
          <p className="eyebrow">AI Assistant Trial</p>
          <h2>Evaluate the assistant with a real compliance question.</h2>
          <p className="lead">
            Submit one real compliance query. If you subscribe later, this
            conversation remains available in your dashboard.
          </p>
        </div>

        <div className="trial-panel">
          <div className="trial-panel-head">
            <div className="trial-badge">
              <Sparkles size={14} />
              <span>{formatLimitText(remainingPrompts)}</span>
            </div>
            {!canSend ? (
              <div className="trial-cta-inline">
                <Link href="/pricing" className="btn primary small">
                  View Plans
                </Link>
                <Link href="/contact" className="btn ghost small">
                  Contact Sales
                </Link>
              </div>
            ) : null}
          </div>

          {error ? <p className="form-message error">{error}</p> : null}

          <div className="trial-messages">
            {initializing ? (
              <p className="muted">Loading trial assistant...</p>
            ) : null}

            {!initializing && messages.length === 0 ? (
              <p className="muted">
                Example: &quot;Classify my AI recruiting system under the EU AI
                Act.&quot;
              </p>
            ) : null}

            {!initializing &&
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`trial-message ${message.role}`}
                >
                  <div className="trial-message-content">
                    {message.loading ? (
                      <span className="muted">Thinking...</span>
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="trial-input-wrap">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={
                canSend
                  ? "Ask one compliance question..."
                  : "Trial limit reached. Upgrade to continue."
              }
              disabled={loading || !canSend}
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim() || !canSend}
              className="btn primary"
            >
              {loading ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>

          {!canSend ? (
            <p className="trial-note">
              {isAuthenticated
                ? "Your trial conversation is saved. Upgrade from billing to continue in the full assistant."
                : "Your trial conversation is saved in this browser. Sign in later to continue from the dashboard after upgrading."}
            </p>
          ) : null}

          {isPremiumUser ? (
            <p className="trial-note">
              Premium access is active. For the full experience, continue in{" "}
              <Link href="/app/assistant">Dashboard Assistant</Link>.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
