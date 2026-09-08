import { auth0 } from "@/lib/auth0/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import ChatWindow from "@/lib/components/ChatWindow";
import { getConnectionStatus, getDemoConnectionStatus } from "@/lib/auth0/token-vault";


export default async function Home() {
  const session = await auth0.getSession() || { user: { name: "Demo User", email: "demo@intent-agent.local" } };

  if (!session) redirect("/api/auth/auth0");

  let conns;
  try {
    conns = await getConnectionStatus();
  } catch {
    conns = getDemoConnectionStatus();
  }

  const connectedCount = [conns.google, conns.github, conns.slack, conns.microsoft].filter(Boolean).length;

  return (
    <main className="flex h-screen flex-col">

      <header className="glass border-b border-zinc-800/50 px-5 py-2.5 flex items-center justify-between shrink-0" role="banner">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20" aria-hidden="true">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813-2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white leading-tight">Intent Agent</h1>
            <p className="text-[10px] text-zinc-500 leading-tight">Auth0 Token Vault</p>
          </div>
        </div>

        <nav className="flex items-center gap-4" aria-label="User account">
          <div className="hidden md:flex items-center gap-3" aria-label="Service connections">
            {[
              { label: "Google", on: conns.google },
              { label: "GitHub", on: conns.github },
              { label: "Slack", on: conns.slack },
            ].map((c) => (
              <div key={c.label} className="flex items-center gap-1.5" title={`${c.label}: ${c.on ? "Connected" : "Not connected"}`}>
                <div className={`status-dot ${c.on ? "on" : "off"}`} aria-label={`${c.label} ${c.on ? "connected" : "disconnected"}`} />
                <span className="text-[10px] text-zinc-500">{c.label}</span>
              </div>
            ))}
          </div>

          <div className="w-px h-4 bg-zinc-800 hidden md:block" aria-hidden="true" />

          <Link href="/dashboard" className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors" title="Dashboard">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </Link>

          <Link href="/settings" className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors" title="Settings & Shortcuts">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 font-medium" aria-hidden="true">
              {(session.user?.name || session.user?.email || "U")[0].toUpperCase()}
            </div>
            <span className="text-xs text-zinc-400 hidden lg:inline">{session.user?.name?.split(" ")[0] || session.user?.email?.split("@")[0]}</span>
          </div>

          {(session.user?.email !== "demo@intent-agent.local") && (
            <Link href="/api/auth/logout" className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 rounded px-1">Sign out</Link>
          )}
        </nav>
      </header>

      <ChatWindow user={session.user} />
    </main>
  );
}
