import { Suspense } from "react"
import { Metadata } from "next"
import { HeadToHeadClient } from "./client"

export const metadata: Metadata = {
  title: "Head-to-Head",
  description: "Compare head-to-head records between badminton players. See match history and rivalry stats.",
}

export default function HeadToHeadPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-4 py-12 text-gray-400">Loading...</div>}>
      <HeadToHeadClient />
    </Suspense>
  )
}
