"use client"

import { useRouter } from "next/navigation"
import { AuthForm } from "@/components/account/auth-form"

export function AccountClient({ next }: { next: string }) {
  const router = useRouter()
  return <AuthForm onDone={() => { router.push(next); router.refresh() }} />
}
