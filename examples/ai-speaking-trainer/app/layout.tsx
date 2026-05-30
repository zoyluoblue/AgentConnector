import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Speaking Trainer",
  description: "A scaffold for an AI-powered oral English practice app."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
