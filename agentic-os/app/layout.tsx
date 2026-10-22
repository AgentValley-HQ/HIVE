import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGENTIC OS // Autonomous Marketing Orchestrator",
  description: "Local-first autonomous marketing agency powered by Claude Code",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="noise" aria-hidden />
        {children}
      </body>
    </html>
  );
}
