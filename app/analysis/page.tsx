import type { Metadata } from "next"
import { AnalysisApp } from "./analysis-app"

export const metadata: Metadata = {
  title: "Rally Analysis",
  description:
    "Analyse your own badminton video: shot counts, shot types, rally score, shuttle speed estimates, footwork distance and a court heatmap. Runs in your browser; the video never leaves your device.",
}

export default function AnalysisPage() {
  return <AnalysisApp />
}
