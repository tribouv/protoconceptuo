import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conceptuo — Atelier 3D",
  description: "Un atelier pour reconstruire et aménager votre intérieur.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
