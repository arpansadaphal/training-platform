import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Training Platform",
  description:
    "A program-design intelligence system: build a training program, get it evaluated transparently against a stated goal, train it, and revise it.",
};

// viewport-fit=cover lets the fixed bottom tab bar sit inside the iPhone safe area.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}