"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Archive,
  ArchiveRestore,
  Check,
  FileText,
  Loader2,
  Menu,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Shield,
  Upload,
  X,
} from "lucide-react";
import { apiUrl, readErrorMessage } from "@/lib/client-api";
import { getOrCreateAnonymousId } from "@/lib/browser-identity";

type MessageRole = "user" | "assistant" | "system" | "error";
type ApiMessageRole = "USER" | "ASSISTANT" | "SYSTEM" | "ERROR";

type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  loading?: boolean;
};

type UploadedFile = {
  name: string;
  file_id: string;
};

type ChatState = {
  id: string;
  title: string;
  messages: ChatMessage[];
  uploadedFiles: UploadedFile[];
  threadId: string | null;
  pinnedAt: string | null;
  archivedAt: string | null;
  loaded: boolean;
  createdAt: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
};

type ChatMap = Record<string, ChatState>;
type ChatFilter = "active" | "archived";

type ConversationSummary = {
  id: string;
  title: string;
  threadId: string | null;
  pinnedAt: string | null;
  archivedAt: string | null;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  messageCount: number;
  lastMessagePreview: string | null;
};

type ConversationDetail = {
  conversation: {
    id: string;
    title: string;
    threadId: string | null;
    pinnedAt: string | null;
    archivedAt: string | null;
    isPinned: boolean;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string;
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
  | { type: "replace"; content: string }
  | { type: "error"; content: string };

type ConversationMutationResponse = {
  conversation: {
    id: string;
    title: string;
    threadId: string | null;
    pinnedAt: string | null;
    archivedAt: string | null;
    isPinned: boolean;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string;
  };
};

type AssistantUpdate = {
  role: "assistant" | "error";
  content: string;
  loading?: boolean;
};

const FILE_UPLOAD_TIMEOUT_MS = 45_000;
const CHAT_STREAM_TIMEOUT_MS = 180_000;

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

function mapMessageRole(role: ApiMessageRole): MessageRole {
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

function toChatError(status: number, fallback: string): string {
  if (status === 401) {
    return "Session expired. Please log in again.";
  }

  if (status === 403) {
    return "Assistant access is currently limited to authorized accounts.";
  }

  return fallback;
}

function sortChatsByPriority(chats: ChatState[]): ChatState[] {
  return [...chats].sort((a, b) => {
    const aPinned = a.pinnedAt ? Date.parse(a.pinnedAt) : 0;
    const bPinned = b.pinnedAt ? Date.parse(b.pinnedAt) : 0;

    if (Boolean(a.pinnedAt) !== Boolean(b.pinnedAt)) {
      return a.pinnedAt ? -1 : 1;
    }

    if (aPinned !== bPinned) {
      return bPinned - aPinned;
    }

    const aTs = Date.parse(a.lastMessageAt || a.createdAt);
    const bTs = Date.parse(b.lastMessageAt || b.createdAt);
    return bTs - aTs;
  });
}

function chatMatchesSearch(chat: ChatState, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const title = chat.title.toLowerCase();
  const preview = (chat.lastMessagePreview ?? "").toLowerCase();

  return title.includes(normalized) || preview.includes(normalized);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMessage(text: string) {
  if (!text) {
    return "";
  }

  let html = escapeHtml(text)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");

  html = `<p>${html}</p>`;
  html = html.replace(/(<li>[\s\S]*?<\/li>)+/g, "<ul>$&</ul>");

  return html;
}

function updateLastAssistantMessage(
  messages: ChatMessage[],
  updater: (message: ChatMessage) => ChatMessage,
): { messages: ChatMessage[]; updated: boolean } {
  const next = [...messages];

  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index]?.role === "assistant" || next[index]?.loading) {
      next[index] = updater(next[index]);
      return { messages: next, updated: true };
    }
  }

  return { messages: next, updated: false };
}

function clearTrailingLoadingMessage(messages: ChatMessage[]): ChatMessage[] {
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

export function ChatApp() {
  const [chats, setChats] = useState<ChatMap>({});
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<ChatFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarBusyChatId, setSidebarBusyChatId] = useState<string | null>(
    null,
  );
  const anonymousIdRef = useRef<string | null>(null);
  const sendInFlightRef = useRef(false);
  const uploadInFlightRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentChat = activeChat ? (chats[activeChat] ?? null) : null;
  const chatIsArchived = Boolean(currentChat?.archivedAt);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    anonymousIdRef.current = getOrCreateAnonymousId();
  }, []);

  const buildAnonymousHeader = useCallback(() => {
    const id = anonymousIdRef.current ?? getOrCreateAnonymousId();
    const headers: Record<string, string> = {};

    if (!id) {
      return headers;
    }

    anonymousIdRef.current = id;
    headers["x-lm-anonymous-id"] = id;
    return headers;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [currentChat?.messages, scrollToBottom]);

  useEffect(() => {
    if (!mobileSidebarOpen) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [mobileSidebarOpen]);

  const updateConversation = useCallback(
    (conversationId: string, updater: (chat: ChatState) => ChatState) => {
      setChats((prev) => {
        const existing = prev[conversationId];
        if (!existing) {
          return prev;
        }

        return {
          ...prev,
          [conversationId]: updater(existing),
        };
      });
    },
    [],
  );

  const setConversationMessages = useCallback(
    (
      conversationId: string,
      updater: ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[]),
    ) => {
      updateConversation(conversationId, (chat) => ({
        ...chat,
        messages:
          typeof updater === "function" ? updater(chat.messages) : updater,
      }));
    },
    [updateConversation],
  );

  const setConversationUploadedFiles = useCallback(
    (
      conversationId: string,
      updater: UploadedFile[] | ((files: UploadedFile[]) => UploadedFile[]),
    ) => {
      updateConversation(conversationId, (chat) => ({
        ...chat,
        uploadedFiles:
          typeof updater === "function" ? updater(chat.uploadedFiles) : updater,
      }));
    },
    [updateConversation],
  );

  const loadConversation = useCallback(
    async (conversationId: string) => {
      const response = await fetch(
        `${apiUrl}/api/chat/conversations/${encodeURIComponent(conversationId)}`,
        {
          method: "GET",
          headers: buildAnonymousHeader(),
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(
          toChatError(response.status, await readErrorMessage(response)),
        );
      }

      const payload = (await response.json()) as ConversationDetail;
      const data = payload.conversation;
      const lastMessage =
        data.messages.length > 0
          ? data.messages[data.messages.length - 1]
          : null;

      updateConversation(conversationId, (chat) => ({
        ...chat,
        title: data.title,
        threadId: data.threadId,
        pinnedAt: data.pinnedAt,
        archivedAt: data.archivedAt,
        loaded: true,
        createdAt: data.createdAt,
        lastMessageAt: data.lastMessageAt,
        lastMessagePreview: lastMessage?.content.slice(0, 220) ?? null,
        messages: data.messages.map((message) => ({
          id: message.id,
          role: mapMessageRole(message.role),
          content: message.content,
          timestamp: message.createdAt,
        })),
      }));
    },
    [buildAnonymousHeader, updateConversation],
  );

  const createConversation = useCallback(async () => {
    const response = await fetch(`${apiUrl}/api/chat/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAnonymousHeader(),
      },
      credentials: "include",
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(
        toChatError(response.status, await readErrorMessage(response)),
      );
    }

    const payload = (await response.json()) as ConversationMutationResponse;

    const created = payload.conversation;

    return {
      id: created.id,
      title: created.title,
      threadId: created.threadId,
      pinnedAt: created.pinnedAt,
      archivedAt: created.archivedAt,
      createdAt: created.createdAt,
      lastMessageAt: created.lastMessageAt,
    };
  }, [buildAnonymousHeader]);

  const updateConversationSettings = useCallback(
    async (
      conversationId: string,
      payload: {
        title?: string;
        isPinned?: boolean;
        isArchived?: boolean;
      },
    ) => {
      const response = await fetch(
        `${apiUrl}/api/chat/conversations/${encodeURIComponent(conversationId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...buildAnonymousHeader(),
          },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        throw new Error(
          toChatError(response.status, await readErrorMessage(response)),
        );
      }

      const body = (await response.json()) as ConversationMutationResponse;
      return body.conversation;
    },
    [buildAnonymousHeader],
  );

  const applyConversationMutation = useCallback(
    (conversation: ConversationMutationResponse["conversation"]) => {
      setChats((prev) => {
        const existing = prev[conversation.id];
        if (!existing) {
          return prev;
        }

        return {
          ...prev,
          [conversation.id]: {
            ...existing,
            title: conversation.title,
            threadId: conversation.threadId,
            pinnedAt: conversation.pinnedAt,
            archivedAt: conversation.archivedAt,
            createdAt: conversation.createdAt,
            lastMessageAt: conversation.lastMessageAt,
          },
        };
      });
    },
    [],
  );

  const bootstrapConversations = useCallback(async () => {
    setInitializing(true);
    setSidebarError(null);

    try {
      const response = await fetch(
        `${apiUrl}/api/chat/conversations?includeArchived=true`,
        {
          method: "GET",
          headers: buildAnonymousHeader(),
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(
          toChatError(response.status, await readErrorMessage(response)),
        );
      }

      const payload = (await response.json()) as {
        conversations: ConversationSummary[];
      };

      const map: ChatMap = {};

      for (const item of payload.conversations) {
        map[item.id] = {
          id: item.id,
          title: item.title,
          messages: [],
          uploadedFiles: [],
          threadId: item.threadId,
          pinnedAt: item.pinnedAt,
          archivedAt: item.archivedAt,
          loaded: false,
          createdAt: item.createdAt,
          lastMessageAt: item.lastMessageAt,
          lastMessagePreview: item.lastMessagePreview,
        };
      }

      if (Object.keys(map).length === 0) {
        const created = await createConversation();
        map[created.id] = {
          id: created.id,
          title: created.title,
          messages: [],
          uploadedFiles: [],
          threadId: created.threadId,
          pinnedAt: created.pinnedAt,
          archivedAt: created.archivedAt,
          loaded: true,
          createdAt: created.createdAt,
          lastMessageAt: created.lastMessageAt,
          lastMessagePreview: null,
        };
      }

      const ordered = sortChatsByPriority(Object.values(map));
      const firstId =
        ordered.find((item) => item.archivedAt === null)?.id ??
        ordered[0]?.id ??
        null;

      setChats(map);
      setActiveChat(firstId);

      if (firstId && !map[firstId].loaded) {
        await loadConversation(firstId);
      }
    } catch (error) {
      setSidebarError(
        error instanceof Error
          ? error.message
          : "Unable to load conversations.",
      );
    } finally {
      setInitializing(false);
    }
  }, [buildAnonymousHeader, createConversation, loadConversation]);

  useEffect(() => {
    void bootstrapConversations();
  }, [bootstrapConversations]);

  useEffect(() => {
    if (!activeChat) {
      return;
    }

    const chat = chats[activeChat];
    if (!chat || chat.loaded) {
      return;
    }

    void loadConversation(activeChat).catch((error) => {
      setSidebarError(
        error instanceof Error ? error.message : "Unable to load conversation.",
      );
    });
  }, [activeChat, chats, loadConversation]);

  const activeConversationCount = useMemo(
    () =>
      Object.values(chats).filter((chat) => chat.archivedAt === null).length,
    [chats],
  );

  const archivedConversationCount = useMemo(
    () =>
      Object.values(chats).filter((chat) => chat.archivedAt !== null).length,
    [chats],
  );

  const visibleChats = useMemo(() => {
    const byScope = Object.values(chats).filter((chat) =>
      chatFilter === "archived"
        ? chat.archivedAt !== null
        : chat.archivedAt === null,
    );

    const bySearch = byScope.filter((chat) =>
      chatMatchesSearch(chat, searchQuery),
    );
    return sortChatsByPriority(bySearch);
  }, [chats, chatFilter, searchQuery]);

  useEffect(() => {
    if (initializing) {
      return;
    }

    if (activeChat && visibleChats.some((chat) => chat.id === activeChat)) {
      return;
    }

    setActiveChat(visibleChats[0]?.id ?? null);
  }, [activeChat, initializing, visibleChats]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!currentChat || uploadInFlightRef.current) {
      return;
    }

    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    uploadInFlightRef.current = true;
    setLoading(true);
    const conversationId = currentChat.id;

    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);

          const response = await fetchWithTimeout(
            `${apiUrl}/api/upload`,
            {
              method: "POST",
              headers: buildAnonymousHeader(),
              credentials: "include",
              body: formData,
            },
            FILE_UPLOAD_TIMEOUT_MS,
          );

          if (!response.ok) {
            const message = toChatError(
              response.status,
              await readErrorMessage(response),
            );
            throw new Error(message);
          }

          const result = (await response.json()) as { file_id: string };

          return {
            name: file.name,
            file_id: result.file_id,
          };
        }),
      );

      setConversationUploadedFiles(conversationId, (prev) => [
        ...prev,
        ...uploaded,
      ]);

      setConversationMessages(conversationId, (prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: "system",
          content: `Uploaded: ${uploaded.map((item) => item.name).join(", ")}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      setConversationMessages(conversationId, (prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "error",
          content: isAbortError(error)
            ? "Upload timed out. Please retry with a smaller file or a more stable connection."
            : error instanceof Error
              ? error.message
              : "Upload failed. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      uploadInFlightRef.current = false;
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeFile = (index: number) => {
    if (!currentChat) {
      return;
    }

    setConversationUploadedFiles(currentChat.id, (prev) =>
      prev.filter((_, idx) => idx !== index),
    );
  };

  const sendMessage = async () => {
    if (!currentChat || loading || sendInFlightRef.current) {
      return;
    }

    const message = input.trim();
    if (!message) {
      return;
    }

    sendInFlightRef.current = true;

    const conversationId = currentChat.id;
    const now = new Date().toISOString();
    const hasUserMessage = currentChat.messages.some(
      (item) => item.role === "user",
    );

    setConversationMessages(conversationId, (prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: message,
        timestamp: now,
      },
      {
        id: `pending-${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: now,
        loading: true,
      },
    ]);

    updateConversation(conversationId, (chat) => ({
      ...chat,
      title:
        !hasUserMessage && chat.title === "New conversation"
          ? message.slice(0, 60)
          : chat.title,
      lastMessageAt: now,
      lastMessagePreview: message.slice(0, 220),
    }));

    setInput("");
    setLoading(true);

    const payload = {
      message,
      uploaded_file_ids:
        currentChat.uploadedFiles.length > 0
          ? currentChat.uploadedFiles.map((item) => item.file_id)
          : null,
    };

    const setAssistantState = (state: AssistantUpdate) => {
      setConversationMessages(conversationId, (prev) => {
        const result = updateLastAssistantMessage(prev, (assistantMessage) => ({
          ...assistantMessage,
          role: state.role,
          content: state.content,
          loading: Boolean(state.loading),
        }));

        if (result.updated) {
          return result.messages;
        }

        return [
          ...prev,
          {
            id: `${state.role}-${Date.now()}`,
            role: state.role,
            content: state.content,
            timestamp: new Date().toISOString(),
            loading: Boolean(state.loading),
          },
        ];
      });

      if (state.role === "assistant" && state.content.trim().length > 0) {
        updateConversation(conversationId, (chat) => ({
          ...chat,
          lastMessagePreview: state.content.slice(0, 220),
          lastMessageAt: new Date().toISOString(),
        }));
      }
    };

    try {
      const response = await fetchWithTimeout(
        `${apiUrl}/api/chat/conversations/${encodeURIComponent(conversationId)}/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildAnonymousHeader(),
          },
          credentials: "include",
          body: JSON.stringify(payload),
        },
        CHAT_STREAM_TIMEOUT_MS,
      );

      if (!response.ok || !response.body) {
        throw new Error(
          toChatError(response.status, await readErrorMessage(response)),
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";
      let streamReportedError: string | null = null;

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

            let parsed: StreamPayload;
            try {
              parsed = JSON.parse(data) as StreamPayload;
            } catch {
              continue;
            }

            if (parsed.type === "meta") {
              updateConversation(conversationId, (chat) => ({
                ...chat,
                threadId: parsed.thread_id,
              }));
            }

            if (parsed.type === "status") {
              setAssistantState({
                role: "assistant",
                content: parsed.content,
                loading: false,
              });
            }

            if (parsed.type === "text") {
              assistantContent += parsed.content;
              setAssistantState({
                role: "assistant",
                content: assistantContent,
                loading: false,
              });
            }

            if (parsed.type === "replace") {
              assistantContent = parsed.content;
              setAssistantState({
                role: "assistant",
                content: assistantContent,
                loading: false,
              });
            }

            if (parsed.type === "error") {
              streamReportedError = parsed.content;
              setAssistantState({
                role: "error",
                content: parsed.content,
                loading: false,
              });
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

      if (!assistantContent.trim() && !streamReportedError) {
        setAssistantState({
          role: "error",
          content: "The assistant did not return a response. Please retry.",
          loading: false,
        });
        streamReportedError = "empty-response";
      }

      if (!streamReportedError) {
        setConversationUploadedFiles(conversationId, []);
      }
      updateConversation(conversationId, (chat) => ({
        ...chat,
        lastMessageAt: new Date().toISOString(),
      }));
    } catch (error) {
      const messageText = isAbortError(error)
        ? "Assistant response timed out. Please retry or shorten the request."
        : error instanceof TypeError
          ? `Unable to connect to API at ${apiUrl}. Start the backend service and retry.`
          : error instanceof Error
            ? error.message
            : "Connection failed. Please try again.";

      setAssistantState({
        role: "error",
        content: messageText,
        loading: false,
      });
    } finally {
      sendInFlightRef.current = false;
      setConversationMessages(conversationId, (prev) =>
        clearTrailingLoadingMessage(prev),
      );
      setLoading(false);
    }
  };

  const startNewChat = async () => {
    if (loading || initializing) {
      return;
    }

    setSidebarError(null);

    try {
      const created = await createConversation();
      setChats((prev) => ({
        ...prev,
        [created.id]: {
          id: created.id,
          title: created.title,
          messages: [],
          uploadedFiles: [],
          threadId: created.threadId,
          pinnedAt: created.pinnedAt,
          archivedAt: created.archivedAt,
          loaded: true,
          createdAt: created.createdAt,
          lastMessageAt: created.lastMessageAt,
          lastMessagePreview: null,
        },
      }));
      setChatFilter("active");
      setActiveChat(created.id);
      setInput("");
      setMobileSidebarOpen(false);
    } catch (error) {
      setSidebarError(
        error instanceof Error
          ? error.message
          : "Unable to create a new conversation.",
      );
    }
  };

  const switchChat = (chatId: string) => {
    if (chatId === activeChat) {
      setMobileSidebarOpen(false);
      return;
    }

    setActiveChat(chatId);
    setInput("");
    setMobileSidebarOpen(false);
  };

  const beginRenameConversation = (
    chatId: string,
    currentTitle: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    setEditingChatId(chatId);
    setEditingTitle(currentTitle);
    setSidebarError(null);
  };

  const cancelRenameConversation = (
    chatId: string,
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event?.stopPropagation();
    if (editingChatId !== chatId) {
      return;
    }

    setEditingChatId(null);
    setEditingTitle("");
  };

  const saveRenameConversation = async (
    chatId: string,
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event?.stopPropagation();
    const nextTitle = editingTitle.trim();
    if (!nextTitle) {
      setSidebarError("Conversation title cannot be empty.");
      return;
    }

    setSidebarBusyChatId(chatId);
    setSidebarError(null);

    try {
      const updated = await updateConversationSettings(chatId, {
        title: nextTitle,
      });
      applyConversationMutation(updated);
      setEditingChatId(null);
      setEditingTitle("");
    } catch (error) {
      setSidebarError(
        error instanceof Error
          ? error.message
          : "Unable to rename conversation.",
      );
    } finally {
      setSidebarBusyChatId(null);
    }
  };

  const togglePinConversation = async (
    chatId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    const chat = chats[chatId];
    if (!chat || loading || initializing) {
      return;
    }

    setSidebarBusyChatId(chatId);
    setSidebarError(null);

    try {
      const updated = await updateConversationSettings(chatId, {
        isPinned: chat.pinnedAt === null,
      });
      applyConversationMutation(updated);
    } catch (error) {
      setSidebarError(
        error instanceof Error ? error.message : "Unable to update pin state.",
      );
    } finally {
      setSidebarBusyChatId(null);
    }
  };

  const toggleArchiveConversation = async (
    chatId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    const chat = chats[chatId];
    if (!chat || loading || initializing) {
      return;
    }

    setSidebarBusyChatId(chatId);
    setSidebarError(null);

    try {
      const updated = await updateConversationSettings(chatId, {
        isArchived: chat.archivedAt === null,
      });
      applyConversationMutation(updated);
    } catch (error) {
      setSidebarError(
        error instanceof Error
          ? error.message
          : "Unable to update archive state.",
      );
    } finally {
      setSidebarBusyChatId(null);
    }
  };

  const restoreConversation = async (chatId: string) => {
    if (loading || initializing) {
      return;
    }

    setSidebarBusyChatId(chatId);
    setSidebarError(null);

    try {
      const updated = await updateConversationSettings(chatId, {
        isArchived: false,
      });
      applyConversationMutation(updated);
      setChatFilter("active");
      setActiveChat(chatId);
    } catch (error) {
      setSidebarError(
        error instanceof Error
          ? error.message
          : "Unable to restore conversation.",
      );
    } finally {
      setSidebarBusyChatId(null);
    }
  };

  const deleteChat = async (
    chatId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();

    if (loading || initializing) {
      return;
    }

    setEditingChatId((prev) => (prev === chatId ? null : prev));
    setSidebarError(null);
    setSidebarBusyChatId(chatId);

    try {
      const response = await fetch(
        `${apiUrl}/api/chat/conversations/${encodeURIComponent(chatId)}`,
        {
          method: "DELETE",
          headers: buildAnonymousHeader(),
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(
          toChatError(response.status, await readErrorMessage(response)),
        );
      }

      const remainingAfterDelete = Object.keys(chats).filter(
        (id) => id !== chatId,
      );

      if (remainingAfterDelete.length === 0) {
        setChats({});
        setActiveChat(null);
        await startNewChat();
        return;
      }

      setChats((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });

      if (activeChat === chatId) {
        setActiveChat(remainingAfterDelete[0] ?? null);
      }
    } catch (error) {
      setSidebarError(
        error instanceof Error
          ? error.message
          : "Unable to delete conversation.",
      );
    } finally {
      setSidebarBusyChatId(null);
    }
  };

  const clearCurrentChat = () => {
    void startNewChat();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="app">
      <aside
        id="assistant-sidebar"
        className={`sidebar ${mobileSidebarOpen ? "open" : ""}`}
      >
        <div className="sidebar-header">
          <div className="logo">
            <Image
              src="/lawminded-logo.png"
              alt="LawMinded"
              width={24}
              height={24}
              className="logo-icon-img"
              priority
            />
            <span>LawMinded</span>
          </div>
          <button
            type="button"
            className="chat-sidebar-close"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close conversations panel"
          >
            <X size={16} />
          </button>
        </div>

        <button className="new-chat-btn" onClick={() => void startNewChat()}>
          <Plus size={18} />
          <span>New Chat</span>
        </button>

        <div className="chat-search">
          <Search size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search chats..."
            aria-label="Search conversations"
          />
        </div>

        <div
          className="chat-filter-tabs"
          role="tablist"
          aria-label="Conversation scope"
        >
          <button
            type="button"
            role="tab"
            aria-selected={chatFilter === "active"}
            className={`chat-filter-tab ${chatFilter === "active" ? "active" : ""}`}
            onClick={() => setChatFilter("active")}
          >
            Active ({activeConversationCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={chatFilter === "archived"}
            className={`chat-filter-tab ${chatFilter === "archived" ? "active" : ""}`}
            onClick={() => setChatFilter("archived")}
          >
            Archived ({archivedConversationCount})
          </button>
        </div>

        {sidebarError ? (
          <p className="form-message error" style={{ margin: "0 14px 10px" }}>
            {sidebarError}
          </p>
        ) : null}

        <div className="chat-history">
          {visibleChats.length === 0 ? (
            <div className="chat-history-empty">
              {searchQuery.trim().length > 0
                ? "No conversations match your search."
                : chatFilter === "archived"
                  ? "No archived conversations."
                  : "No active conversations."}
            </div>
          ) : null}

          {visibleChats.map((chat) => {
            const isEditing = editingChatId === chat.id;
            const isBusy = sidebarBusyChatId === chat.id;

            return (
              <div
                key={chat.id}
                className={`chat-history-item ${chat.id === activeChat ? "active" : ""}`}
                onClick={() => switchChat(chat.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    switchChat(chat.id);
                  }
                }}
              >
                <MessageSquare size={16} />
                {isEditing ? (
                  <input
                    className="chat-rename-input"
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void saveRenameConversation(chat.id);
                      }

                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelRenameConversation(chat.id);
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <div className="chat-item-title-wrap">
                    <span>{chat.title}</span>
                    {chat.pinnedAt ? (
                      <Pin size={12} className="pin-indicator" />
                    ) : null}
                  </div>
                )}

                <div className="chat-item-actions">
                  {isEditing ? (
                    <>
                      <button
                        className="chat-action-btn"
                        onClick={(event) => {
                          void saveRenameConversation(chat.id, event);
                        }}
                        disabled={isBusy}
                        title="Save title"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        className="chat-action-btn"
                        onClick={(event) =>
                          cancelRenameConversation(chat.id, event)
                        }
                        disabled={isBusy}
                        title="Cancel"
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="chat-action-btn"
                        onClick={(event) =>
                          beginRenameConversation(chat.id, chat.title, event)
                        }
                        disabled={isBusy || loading || initializing}
                        title="Rename"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="chat-action-btn"
                        onClick={(event) => {
                          void togglePinConversation(chat.id, event);
                        }}
                        disabled={isBusy || loading || initializing}
                        title={chat.pinnedAt ? "Unpin chat" : "Pin chat"}
                      >
                        {chat.pinnedAt ? (
                          <PinOff size={13} />
                        ) : (
                          <Pin size={13} />
                        )}
                      </button>
                      <button
                        className="chat-action-btn"
                        onClick={(event) => {
                          void toggleArchiveConversation(chat.id, event);
                        }}
                        disabled={isBusy || loading || initializing}
                        title={
                          chat.archivedAt ? "Restore chat" : "Archive chat"
                        }
                      >
                        {chat.archivedAt ? (
                          <ArchiveRestore size={13} />
                        ) : (
                          <Archive size={13} />
                        )}
                      </button>
                      <button
                        className="delete-chat-btn"
                        onClick={(event) => {
                          void deleteChat(chat.id, event);
                        }}
                        disabled={isBusy || loading || initializing}
                        title="Delete chat"
                      >
                        <X size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <div className="compliance-badge">
            <Shield size={14} />
            <span>EU AI Act Assistant</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <div className="header-title-wrap">
            <button
              type="button"
              className="chat-menu-btn"
              onClick={() => setMobileSidebarOpen((value) => !value)}
              aria-label="Toggle conversations panel"
              aria-expanded={mobileSidebarOpen}
              aria-controls="assistant-sidebar"
            >
              <Menu size={18} />
            </button>
            <div className="header-title">
              <h1>EU AI Act Compliance</h1>
              <p>Your compliance support workspace</p>
            </div>
          </div>
          <button
            onClick={clearCurrentChat}
            className="clear-btn"
            title="Start a new conversation"
            disabled={loading || initializing}
          >
            <X size={16} />
            <span>Clear</span>
          </button>
        </header>

        <div className="messages">
          {initializing ? (
            <div className="welcome">
              <h2>Loading conversations...</h2>
            </div>
          ) : null}

          {!initializing && !currentChat ? (
            <div className="welcome">
              <div className="welcome-icon">
                <Image
                  src="/lawminded-logo.png"
                  alt="LawMinded"
                  width={64}
                  height={64}
                  className="welcome-logo-img"
                  priority
                />
              </div>
              <h2>
                {chatFilter === "archived"
                  ? "No archived conversation selected"
                  : "Start a conversation"}
              </h2>
              <p>
                {chatFilter === "archived"
                  ? "Archived conversations appear here. Restore one to continue."
                  : "Create a conversation to begin compliance analysis."}
              </p>
              <div className="suggestions">
                <button onClick={() => void startNewChat()}>
                  Start New Chat
                </button>
              </div>
            </div>
          ) : null}

          {!initializing && currentChat && currentChat.messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">
                <Image
                  src="/lawminded-logo.png"
                  alt="LawMinded"
                  width={64}
                  height={64}
                  className="welcome-logo-img"
                  priority
                />
              </div>
              <h2>How can I help you today?</h2>
              <p>
                Ask about EU AI Act classification, obligations, documentation,
                or implementation controls.
              </p>

              <div className="suggestions">
                <button
                  onClick={() =>
                    setInput("What is Article 11 technical documentation?")
                  }
                >
                  Article 11 Requirements
                </button>
                <button
                  onClick={() =>
                    setInput("Classify my AI hiring system under the EU AI Act")
                  }
                >
                  Risk Classification
                </button>
                <button
                  onClick={() => setInput("What are high-risk AI categories?")}
                >
                  Annex III Categories
                </button>
              </div>
            </div>
          ) : null}

          {!initializing && currentChat && chatIsArchived ? (
            <div className="archived-chat-banner">
              <span>This conversation is archived.</span>
              <button
                type="button"
                onClick={() => void restoreConversation(currentChat.id)}
                disabled={
                  sidebarBusyChatId === currentChat.id ||
                  loading ||
                  initializing
                }
              >
                Restore
              </button>
            </div>
          ) : null}

          {!initializing &&
            currentChat?.messages.map((message, index) => (
              <div
                key={`${message.id}-${index}`}
                className={`message-row ${message.role}`}
              >
                <div className={`message ${message.role}`}>
                  {message.role === "assistant" && (
                    <div className="message-avatar">
                      <Image
                        src="/lawminded-logo.png"
                        alt="Bot"
                        width={20}
                        height={20}
                        className="avatar-icon-img"
                      />
                    </div>
                  )}
                  <div className="message-content">
                    {message.loading ? (
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    ) : (
                      <div
                        className="message-text"
                        dangerouslySetInnerHTML={{
                          __html: formatMessage(message.content),
                        }}
                      />
                    )}
                    <span className="message-time">
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}

          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          {currentChat && currentChat.uploadedFiles.length > 0 ? (
            <div className="attached-files">
              {currentChat.uploadedFiles.map((file, index) => (
                <div key={`${file.file_id}-${index}`} className="file-chip">
                  <FileText size={14} />
                  <span>{file.name}</span>
                  <button onClick={() => removeFile(index)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="input-wrapper">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.txt,.doc,.docx"
              multiple
              hidden
            />

            <button
              className="upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || !currentChat || chatIsArchived}
              title="Upload files"
            >
              <Upload size={18} />
            </button>

            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={
                chatIsArchived
                  ? "Restore this conversation to continue."
                  : "Ask a compliance question..."
              }
              disabled={loading || !currentChat || chatIsArchived}
              className="text-input"
            />

            <button
              className="send-btn"
              onClick={() => void sendMessage()}
              disabled={
                loading || !input.trim() || !currentChat || chatIsArchived
              }
              title="Send message"
            >
              {loading ? (
                <Loader2 size={18} className="spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
        </div>
      </main>
      <button
        type="button"
        className={`mobile-sidebar-backdrop ${mobileSidebarOpen ? "open" : ""}`}
        onClick={() => setMobileSidebarOpen(false)}
        aria-hidden={!mobileSidebarOpen}
        tabIndex={mobileSidebarOpen ? 0 : -1}
      />
    </div>
  );
}
