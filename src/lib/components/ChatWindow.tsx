"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IntentPanel from "./IntentPanel";
import PermissionPanel from "./PermissionPanel";
import ConnectionManager from "./ConnectionManager";
import StepUpAuthModal from "./StepUpAuthModal";
import OnboardingFlow from "./OnboardingFlow";
import { useToast } from "./ToastProvider";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { IntentSpec, PermissionRequirement } from "@/lib/intent/types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; input: any; output: string }[];
}

interface Props {
  user: any;
}

type SideView = "intent" | "permissions" | "connections";

const suggestions = [
  { icon: "📧", text: "Search my Gmail for recent emails", label: "Gmail", desc: "Recent emails" },
  { icon: "📅", text: "Show my calendar events for today", label: "Calendar", desc: "Today&apos;s events" },
  { icon: "🐙", text: "List my GitHub repositories", label: "GitHub", desc: "My repos" },
  { icon: "💬", text: "List my Slack channels", label: "Slack", desc: "My channels" },
];

const toolMeta: Record<string, { icon: string; label: string; action: string }> = {
  search_gmail: { icon: "📧", label: "Gmail", action: "Searched" },
  read_gmail: { icon: "📧", label: "Gmail", action: "Read" },
  get_calendar: { icon: "📅", label: "Calendar", action: "Checked" },
  list_github: { icon: "🐙", label: "GitHub", action: "Listed" },
  github_search: { icon: "🐙", label: "GitHub", action: "Searched" },
  github_issues: { icon: "🐙", label: "GitHub", action: "Issues" },
  list_slack: { icon: "💬", label: "Slack", action: "Listed" },
  slack_messages: { icon: "💬", label: "Slack", action: "Messages" },
  send_email: { icon: "📤", label: "Gmail", action: "Sent" },
  create_issue: { icon: "📝", label: "GitHub", action: "Created issue" },
  post_slack: { icon: "📢", label: "Slack", action: "Posted" },
};

export default function ChatWindow({ user }: Props) {
  const { addToast } = useToast();
  const [intentSpec, setIntentSpec] = useState<IntentSpec | null>(null);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [sideView, setSideView] = useState<SideView>("intent");
  const [compiling, setCompiling] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [isDemoMode, setIsDemoMode] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("intent-agent-demo-mode");
      if (stored !== null) return stored === "true";
    }
    return true;
  });
  const [groqKey, setGroqKey] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("intent-agent-groq-key") || "";
    return "";
  });
  const [showGroqModal, setShowGroqModal] = useState(false);
  const [tempGroqKey, setTempGroqKey] = useState(groqKey);

  const handleToggleMode = () => {
    const newMode = !isDemoMode;
    if (!newMode && !groqKey) {
      setTempGroqKey("");
      setShowGroqModal(true);
      return;
    }
    setIsDemoMode(newMode);
    if (typeof window !== "undefined") localStorage.setItem("intent-agent-demo-mode", newMode.toString());
  };

  const handleSaveGroqKey = (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tempGroqKey.trim()) return;
    setGroqKey(tempGroqKey.trim());
    setIsDemoMode(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("intent-agent-groq-key", tempGroqKey.trim());
      localStorage.setItem("intent-agent-demo-mode", "false");
    }
    setShowGroqModal(false);
  };

  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window !== "undefined") {
      return !localStorage.getItem("intent-agent-onboarded");
    }
    return true;
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [stepUpRequest, setStepUpRequest] = useState<{
    id: string;
    action: string;
    service: string;
    scopes: string[];
    description: string;
    destructive: boolean;
  } | null>(null);
  const [stepUpProcessing, setStepUpProcessing] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<Record<string, boolean>>({
    "google-oauth2": false,
    github: false,
    "sign-in-with-slack": false,
    windowslive: false,
  });

  const permissionCount = intentSpec?.permissions?.length ?? 0;
  const destructiveCount = useMemo(
    () => (intentSpec?.permissions ?? []).filter((p) => p.destructive).length,
    [intentSpec]
  );

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/connections");
      if (res.ok) {
        const data = await res.json();
        setConnectedAccounts((prev) => ({
          ...prev,
          "google-oauth2": data.connections?.google ?? prev["google-oauth2"],
          github: data.connections?.github ?? prev.github,
          "sign-in-with-slack": data.connections?.slack ?? prev["sign-in-with-slack"],
          windowslive: data.connections?.microsoft ?? prev.windowslive,
        }));
      }
    } catch (error) {
      console.error('[intent-agent]', error);
    }
  }, []);

  useKeyboardShortcuts([
    { key: "Enter", ctrl: true, action: () => { if (input.trim()) send(input); }, description: "Send message" },
    { key: "K", ctrl: true, action: () => { if (input.trim()) compileIntent(); }, description: "Compile intent" },
    { key: "Escape", ctrl: false, action: () => { if (showSidePanel) setShowSidePanel(false); else if (input) setInput(""); }, description: "Close panels" },
    { key: "/", ctrl: true, action: () => { inputRef.current?.focus(); }, description: "Focus input" },
    { key: "N", ctrl: true, action: () => { if (messages.length > 0) { setMessages([]); setError(null); addToast("New conversation started", "info"); } }, description: "New conversation" },
    { key: "D", ctrl: true, action: () => { window.location.href = "/dashboard"; }, description: "Go to dashboard" },
    { key: "H", ctrl: true, action: () => { window.location.href = "/history"; }, description: "Go to history" },
  ]);

  useEffect(() => {
    if (error) {
      const type: "success" | "error" | "info" | "warning" = error.includes("approved") ? "success" : error.includes("denied") ? "warning" : "error";
      addToast(error, type, 5000);
    }
  }, [error, addToast]);

  async function send(text: string) {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setError(null);

    queueMicrotask(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Demo-Mode": isDemoMode.toString(), "X-Groq-Key": groqKey },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
            toolCalls: m.toolCalls?.map((tc) => ({
              name: tc.name,
              input: tc.input,
              output: tc.output,
            })),
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const raw = await res.text();
      const lines = raw.split("\n");

      let assistantText = "";
      const toolCalls: { name: string; input: any; output: string }[] = [];

      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "text") assistantText = data.text;
          if (data.type === "tool-input-available") {
            toolCalls.push({ name: data.toolName, input: data.input, output: "" });
          }
          if (data.type === "tool-output-available") {
            const last = toolCalls[toolCalls.length - 1];
            if (last) last.output = data.output;
          }
        } catch (error) {
          console.error('[intent-agent]', error);
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantText,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        },
      ]);

      queueMicrotask(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    } catch (err: any) {
      setError(err.message || "Request failed");
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  async function compileIntent() {
    if (!input.trim()) return;
    setCompiling(true);
    setError(null);

    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Demo-Mode": isDemoMode.toString(), "X-Groq-Key": groqKey },
        body: JSON.stringify({ prompt: input }),
      });

      if (!res.ok) throw new Error("Failed to compile intent");

      const spec = await res.json();
      setIntentSpec(spec);
      setShowSidePanel(true);
      setSideView("intent");
    } catch (err: any) {
      setError(err.message || "Intent compilation failed");
    } finally {
      setCompiling(false);
    }
  }

  function handleClearChat() {
    if (messages.length === 0) return;
    setShowClearConfirm(true);
  }

  function confirmClear() {
    setMessages([]);
    setError(null);
    setShowClearConfirm(false);
    inputRef.current?.focus();
  }

  function parseOutput(output: string): any[] {
    try {
      const d = JSON.parse(output);
      return Array.isArray(d) ? d : [];
    } catch {
      return [];
    }
  }

  function formatItemPreview(item: any): string {
    if (item.from) {
      const name = item.from.split("<")[0]?.trim() || item.from;
      return `${name} - ${item.subject || "No subject"}`;
    }
    if (item.name) return `${item.name}${item.stars !== undefined ? ` (${item.stars} stars)` : ""}`;
    if (item.title) return `${item.title}${item.time ? ` at ${item.time}` : ""}`;
    return JSON.stringify(item).slice(0, 100);
  }

  function formatReadEmail(raw: string): { from: string; subject: string; date: string; body: string } | null {
    try {
      const d = JSON.parse(raw);
      if (d.from && d.subject) return d;
    } catch (error) {
      console.error('[intent-agent]', error);
    }
    return null;
  }

  async function onApprove(permission: PermissionRequirement) {
    setStepUpProcessing(true);
    setError(null);

    try {
      const res = await fetch("/api/step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: `${permission.destructive ? "Write" : "Read"} access to ${permission.service}`,
          service: permission.service,
          scopes: permission.scopes,
          destructive: permission.destructive,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.status === "approved") {
        setError(`${permission.service} ${permission.destructive ? "write" : "read"} access approved via Token Vault.`);
      } else {
        setStepUpRequest({
          id: data.requestId,
          action: `${permission.destructive ? "Write" : "Read"} access to ${permission.service}`,
          service: permission.service,
          scopes: permission.scopes,
          description: `The agent needs ${permission.destructive ? "write" : "read"} access to ${permission.service} to complete this task. Scopes: ${permission.scopes.join(", ")}.`,
          destructive: permission.destructive,
        });
      }
    } catch (err: any) {
      setError(err.message || "Approval failed");
    } finally {
      setStepUpProcessing(false);
    }
  }

  function onDeny(_permission: PermissionRequirement) {
    setError("Permission denied. Edit your prompt and recompile intent to adjust required scopes.");
  }

  async function handleStepUpApprove(requestId: string) {
    setStepUpProcessing(true);
    try {
      const res = await fetch("/api/step-up", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision: "approved" }),
      });

      if (res.ok) {
        setError("Step-up authorization approved. The agent can now proceed.");
      } else {
        setError("Failed to approve step-up authorization.");
      }
    } catch (err: any) {
      setError(err.message || "Approval failed");
    } finally {
      setStepUpProcessing(false);
      setStepUpRequest(null);
    }
  }

  async function handleStepUpDeny(requestId: string) {
    setStepUpProcessing(true);
    try {
      await fetch("/api/step-up", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision: "denied" }),
      });
      setError("Step-up authorization denied. The agent cannot proceed with this action.");
    } catch (err: any) {
      setError(err.message || "Denial failed");
    } finally {
      setStepUpProcessing(false);
      setStepUpRequest(null);
    }
  }

  async function handleConnect(connection: string) {
    setConnecting(connection);
    setError(null);

    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        setConnectedAccounts((prev) => ({ ...prev, [connection]: true }));
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || "Connection failed");
    } finally {
      setConnecting(null);
    }
  }

  async function handleDisconnect(connection: string) {
    setConnecting(connection);
    setError(null);

    try {
      const res = await fetch("/api/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        setConnectedAccounts((prev) => ({ ...prev, [connection]: false }));
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || "Disconnection failed");
    } finally {
      setConnecting(null);
    }
  }

  const connectionList = [
    {
      id: "google",
      name: "Google",
      connection: "google-oauth2",
      icon: "📧",
      description: "Access Gmail and Google Calendar",
      scopes: ["gmail.readonly", "gmail.send", "calendar.readonly"],
      connected: connectedAccounts["google-oauth2"],
      color: "from-red-500 to-yellow-500",
    },
    {
      id: "github",
      name: "GitHub",
      connection: "github",
      icon: "🐙",
      description: "Access repositories and issues",
      scopes: ["public_repo", "repo", "read:user"],
      connected: connectedAccounts.github,
      color: "from-gray-600 to-gray-800",
    },
    {
      id: "slack",
      name: "Slack",
      connection: "sign-in-with-slack",
      icon: "💬",
      description: "Access channels and messages",
      scopes: ["channels:read", "chat:write", "users:read"],
      connected: connectedAccounts["sign-in-with-slack"],
      color: "from-purple-500 to-pink-500",
    },
    {
      id: "microsoft",
      name: "Microsoft",
      connection: "windowslive",
      icon: "🪟",
      description: "Access Outlook and Calendar",
      scopes: ["Mail.Read", "Mail.Send", "Calendars.Read"],
      connected: connectedAccounts.windowslive,
      color: "from-blue-500 to-cyan-500",
    },
  ];

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-[color:var(--line)]/70 px-4 py-2.5">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-[#0f2530] rounded-full p-0.5 border border-[color:var(--line)]">
                <button
                  onClick={() => { if (!isDemoMode) handleToggleMode(); }}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${isDemoMode ? "bg-cyan-500/20 text-cyan-300" : "text-[color:var(--muted)] hover:text-[color:var(--text)]"}`}
                >
                  Demo
                </button>
                <button
                  onClick={() => { if (isDemoMode) handleToggleMode(); }}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${!isDemoMode ? "bg-violet-500/20 text-violet-300" : "text-[color:var(--muted)] hover:text-[color:var(--text)]"}`}
                >
                  Real
                </button>
              </div>
              <div className="w-px h-3 bg-[color:var(--line)]" />
              <div className="text-[11px] text-[color:var(--muted)] tracking-wide uppercase">
                Intent - Permissions - Secure Execution
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <button
                onClick={() => {
                  if (!intentSpec) return;
                  setShowSidePanel(true);
                  setSideView("intent");
                }}
                disabled={!intentSpec}
                className="px-2.5 py-1 rounded-md border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)] disabled:opacity-40"
              >
                Intent {intentSpec ? `(${Math.round(intentSpec.completenessScore)}%)` : ""}
              </button>
              <button
                onClick={() => {
                  if (!intentSpec) return;
                  setShowSidePanel(true);
                  setSideView("permissions");
                }}
                disabled={!intentSpec}
                className="px-2.5 py-1 rounded-md border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)] disabled:opacity-40"
              >
                Permissions {intentSpec ? `(${permissionCount})` : ""}
                {destructiveCount > 0 ? ` - ${destructiveCount} write` : ""}
              </button>
              <button
                onClick={() => {
                  setShowSidePanel(true);
                  setSideView("connections");
                  fetchConnections();
                }}
                className="px-2.5 py-1 rounded-md border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
              >
                Accounts ({Object.values(connectedAccounts).filter(Boolean).length})
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" role="log" aria-label="Chat messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--brand-2)] flex items-center justify-center mb-6 shadow-lg shadow-cyan-900/30" aria-hidden="true">
                <svg className="w-8 h-8 text-[#05232b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813-2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-[color:var(--text)] mb-2">Intent Agent</h2>
              <p className="text-[color:var(--muted)] text-sm mb-8 max-w-xl text-center">
                Turn natural language into explicit intent specs, review required scopes, and execute with scoped credentials through Token Vault.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl" role="list" aria-label="Quick actions">
                {suggestions.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => send(s.text)}
                    role="listitem"
                    aria-label={`${s.label}: ${s.desc}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[color:var(--line)] hover:border-cyan-700/70 hover:bg-[#0f2530] transition-all text-left group focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <span className="text-lg" aria-hidden="true">{s.icon}</span>
                    <div>
                      <div className="text-xs text-[color:var(--muted)] font-medium uppercase tracking-wide">{s.label}</div>
                      <div className="text-sm text-[color:var(--text)]/90 group-hover:text-[color:var(--text)] transition-colors">{s.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
              <button
                onClick={handleClearChat}
                aria-label="Start new conversation"
                className="text-xs text-[color:var(--muted)] hover:text-[color:var(--text)] flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                New conversation
              </button>

              {messages.map((msg) => (
                <article
                  key={msg.id}
                  className={`animate-fade-in flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  aria-label={`${msg.role === "user" ? "Your message" : "Agent response"}`}
                >
                  <div className={`max-w-[88%] ${msg.role === "user" ? "msg-user px-4 py-2.5" : "msg-assistant px-4 py-3"}`}>
                    {msg.toolCalls?.map((tc, i) => {
                      const meta = toolMeta[tc.name] || { icon: "🔧", label: tc.name, action: "Called" };
                      const items = parseOutput(tc.output);
                      const readEmail = tc.name === "read_gmail" ? formatReadEmail(tc.output) : null;

                      return (
                        <div key={i} className="tool-card mb-3 px-3 py-2.5" role="region" aria-label={`${meta.label} ${meta.action}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm" aria-hidden="true">{meta.icon}</span>
                            <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wide">{meta.label}</span>
                            <span className="text-xs text-[color:var(--muted)]">- {meta.action}</span>
                          </div>

                          {readEmail ? (
                            <div className="text-xs space-y-1.5">
                              <div className="font-medium text-[color:var(--text)]">{readEmail.subject}</div>
                              <div className="text-[color:var(--muted)]">From: {readEmail.from.split("<")[0]?.trim()}</div>
                              <div className="text-[color:var(--muted)]">Date: {readEmail.date}</div>
                              <div className="mt-2 pt-2 border-t border-[color:var(--line)] text-[color:var(--text)]/90 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                                {readEmail.body}
                              </div>
                            </div>
                          ) : items.length > 0 ? (
                            <ul className="text-xs text-[color:var(--text)]/90 space-y-1 list-none">
                              {items.map((item, j) => (
                                <li key={j} className="flex items-start gap-2">
                                  <span className="text-cyan-500 mt-0.5" aria-hidden="true">•</span>
                                  <span className="leading-relaxed">{formatItemPreview(item)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : tc.output ? (
                            <div className="text-xs text-[color:var(--muted)]">{tc.output.slice(0, 240)}</div>
                          ) : null}
                        </div>
                      );
                    })}

                    {msg.content && (
                      <div className={`text-sm leading-relaxed ${msg.role === "user" ? "text-[#042129]" : "text-[color:var(--text)]/95"}`}>
                        {msg.content}
                      </div>
                    )}
                  </div>
                </article>
              ))}

              {isLoading && (
                <div className="flex justify-start animate-fade-in" aria-label="Agent is thinking">
                  <div className="msg-assistant px-4 py-3">
                    <div className="flex gap-1.5" role="status" aria-label="Loading">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse-dot" />
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse-dot" style={{ animationDelay: "0.18s" }} />
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse-dot" style={{ animationDelay: "0.36s" }} />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div role="alert" className="animate-fade-in flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-sm">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {showClearConfirm && (
          <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-label="Confirm clear conversation">
            <div className="bg-[color:var(--surface)] border border-[color:var(--line)] rounded-xl p-5 max-w-sm w-full mx-4 space-y-4">
              <h3 className="text-sm font-semibold text-[color:var(--text)]">Clear conversation?</h3>
              <p className="text-xs text-[color:var(--muted)]">This removes the current message history from the client view.</p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 rounded-lg border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)] text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmClear}
                  className="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs border border-red-500/30"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-[color:var(--line)] p-4">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="flex gap-2" role="search" aria-label="Chat input">
              <label htmlFor="chat-input" className="sr-only">Message</label>
              <input
                id="chat-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your task..."
                autoComplete="off"
                className="flex-1 bg-[#0f222d] border border-[color:var(--line)] rounded-xl px-4 py-3 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
              />

              <button
                type="button"
                onClick={compileIntent}
                disabled={compiling || !input.trim()}
                aria-label={compiling ? "Compiling intent..." : "Compile intent"}
                className="px-3 py-3 rounded-xl border border-[color:var(--line)] hover:border-cyan-600 text-[color:var(--muted)] hover:text-[color:var(--text)] disabled:opacity-40"
                title="Compile Intent"
              >
                {compiling ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813-2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                )}
              </button>

              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                aria-label="Send message"
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--brand-2)] hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed text-[#052029] text-sm font-semibold"
              >
                Send
              </button>
            </form>

            <p className="text-[10px] text-[color:var(--muted)] mt-2 text-center">
              Auth0 Token Vault - least privilege scopes - explicit permission visibility before execution
            </p>
          </div>
        </div>
      </div>

      {showSidePanel && (
        <aside className="w-[380px] border-l border-[color:var(--line)] flex flex-col overflow-hidden animate-slide-in bg-[#0b1d27]" aria-label="Side panel">
          <div className="flex items-center justify-between border-b border-[color:var(--line)] px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={() => setSideView("intent")}
                className={`px-2.5 py-1 rounded-md border ${sideView === "intent" ? "border-cyan-500 text-cyan-200 bg-cyan-500/10" : "border-[color:var(--line)] text-[color:var(--muted)]"}`}
              >
                Intent
              </button>
              <button
                onClick={() => setSideView("permissions")}
                className={`px-2.5 py-1 rounded-md border ${sideView === "permissions" ? "border-cyan-500 text-cyan-200 bg-cyan-500/10" : "border-[color:var(--line)] text-[color:var(--muted)]"}`}
              >
                Permissions {intentSpec ? `(${permissionCount})` : ""}
              </button>
              <button
                onClick={() => {
                  setSideView("connections");
                  fetchConnections();
                }}
                className={`px-2.5 py-1 rounded-md border ${sideView === "connections" ? "border-cyan-500 text-cyan-200 bg-cyan-500/10" : "border-[color:var(--line)] text-[color:var(--muted)]"}`}
              >
                Accounts
              </button>
            </div>

            <button onClick={() => setShowSidePanel(false)} className="text-[11px] text-[color:var(--muted)] hover:text-[color:var(--text)]">
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sideView === "intent" && intentSpec && (
              <IntentPanel spec={intentSpec} />
            )}
            {sideView === "permissions" && intentSpec && (
              <PermissionPanel permissions={intentSpec.permissions} onApprove={onApprove} onDeny={onDeny} />
            )}
            {sideView === "connections" && (
              <div className="p-4">
                <ConnectionManager
                  connections={connectionList}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  connecting={connecting}
                />
              </div>
            )}
          </div>
        </aside>
      )}


      {showGroqModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-[#0b1d27] border border-[color:var(--line)] rounded-2xl p-6 max-w-md w-full shadow-2xl shadow-cyan-900/20 animate-scale-in">
            <h2 className="text-lg font-semibold text-[color:var(--text)] mb-2">Groq API Key Required</h2>
            <p className="text-sm text-[color:var(--muted)] mb-5 leading-relaxed">
              To use Real Mode, you need a Groq API key to power the language model. Your key is stored only in your browser&apos;s local storage and sent directly to the backend.
            </p>
            <form onSubmit={handleSaveGroqKey} className="space-y-4">
              <div>
                <label htmlFor="groq-key" className="sr-only">Groq API Key</label>
                <input
                  id="groq-key"
                  type="password"
                  value={tempGroqKey}
                  onChange={(e) => setTempGroqKey(e.target.value)}
                  placeholder="gsk_..."
                  className="w-full bg-[#05141b] border border-[color:var(--line)] rounded-xl px-4 py-2.5 text-sm text-[color:var(--text)] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowGroqModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--text)] hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!tempGroqKey.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-cyan-600 to-cyan-500 hover:brightness-110 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Save & Switch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <StepUpAuthModal
        request={stepUpRequest}
        onApprove={handleStepUpApprove}
        onDeny={handleStepUpDeny}
        onCancel={() => setStepUpRequest(null)}
        isProcessing={stepUpProcessing}
      />

      {showOnboarding && (
        <OnboardingFlow onComplete={() => {
          setShowOnboarding(false);
          if (typeof window !== "undefined") {
            localStorage.setItem("intent-agent-onboarded", "true");
          }
          addToast("Welcome to Intent Agent! Try a quick action below.", "success");
        }} />
      )}
    </div>
  );
}
