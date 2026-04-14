import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Nav } from "@/components/nav"
import { Footer } from "@/components/footer"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: {
    default: "SmashLab - Global Badminton Analytics",
    template: "%s | SmashLab",
  },
  description:
    "Complete global badminton database. Head-to-head records, career stats, form trends, and tournament results for players worldwide. Malaysia's deepest analytics hub.",
  keywords: [
    "badminton analytics",
    "badminton statistics",
    "BWF World Tour",
    "Malaysian badminton",
    "Lee Zii Jia",
    "Aaron Chia",
    "Viktor Axelsen",
    "Kento Momota",
    "head to head",
    "badminton stats",
    "badminton database",
  ],
  openGraph: {
    title: "SmashLab - Global Badminton Analytics",
    description:
      "Complete global badminton database. Career stats, head-to-head records, and tournament results since the 1990s.",
    url: "https://smashlab.vacabc.my",
    siteName: "SmashLab",
    type: "website",
    locale: "en_MY",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[var(--background)] text-[var(--foreground)] min-h-screen flex flex-col`}>
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
