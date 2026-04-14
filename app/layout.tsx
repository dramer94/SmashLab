import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Nav } from "@/components/nav"
import { Footer } from "@/components/footer"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: {
    default: "SmashLab - Malaysian Badminton Analytics",
    template: "%s | SmashLab",
  },
  description:
    "Deep analytics, head-to-head records, form trends, and tournament performance for Malaysian badminton players. Track Lee Zii Jia, Aaron Chia, Pearly Tan and more.",
  keywords: [
    "Malaysian badminton",
    "Lee Zii Jia",
    "Aaron Chia",
    "Soh Wooi Yik",
    "Pearly Tan",
    "Thinaah Muralitharan",
    "badminton analytics",
    "BWF",
    "head to head",
    "badminton stats",
  ],
  openGraph: {
    title: "SmashLab - Malaysian Badminton Analytics",
    description:
      "The data hub for Malaysian badminton. Player stats, head-to-head records, form trends, and tournament analytics.",
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
