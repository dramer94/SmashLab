"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

export interface SessionUser {
  id: string
  name: string
  email: string
  isPublic: boolean
}

const input = "w-full rounded-md border border-white/10 bg-[var(--background)] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"

/** Sign in / create account. Calls onDone with the signed-in user. */
export function AuthForm({ onDone, compact = false }: { onDone: (u: SessionUser) => void; compact?: boolean }) {
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { email, name, password } : { email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.")
      window.dispatchEvent(new Event("smashlab:auth"))
      onDone(data.user)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex rounded-md border border-white/10 p-0.5 text-sm">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null) }}
            className={`flex-1 rounded px-3 py-1.5 ${mode === m ? "bg-white/10 text-white" : "text-gray-400"}`}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      {mode === "signup" && (
        <label className="block text-xs text-gray-400">
          Your name (shown on leaderboards)
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={40} autoComplete="name" className={`${input} mt-1`} />
        </label>
      )}
      <label className="block text-xs text-gray-400">
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={`${input} mt-1`} />
      </label>
      <label className="block text-xs text-gray-400">
        Password{mode === "signup" ? " (at least 8 characters)" : ""}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === "signup" ? 8 : 1}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className={`${input} mt-1`}
        />
      </label>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {mode === "login" ? "Sign in" : "Create account"}
      </button>
      {!compact && (
        <p className="text-xs text-gray-500">
          An account keeps your stats from analysed videos on your profile, lets you share results pages and puts you on the weekly leaderboard.
          Your videos are never uploaded.
        </p>
      )}
    </form>
  )
}
