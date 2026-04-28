import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Ditto — Agentic Compatibility Match",
  description: "AI agents simulate your dates before you go on them.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ditto">{children}</body>
    </html>
  )
}
