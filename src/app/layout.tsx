import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HarmoniQ: Edge-to-Cloud Physical AI Fault Recovery',
  description:
    'Closed-loop Physical AI agent that triages real-time MCU FFT & voltage telemetry with Nemotron Nano, diagnoses faults via Tavily & Nemotron Ultra on Nebius, and autonomously stabilizes hardware.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-[#0B0F17] text-[#F9FAFB]">
        {children}
      </body>
    </html>
  );
}
