import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Robotel · Malzeme Kütüphanesi",
  description: "Filamentleri kaynakları ve test koşullarıyla keşfedin, karşılaştırın ve ortak kütüphaneye katkı önerin.",
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
    <html lang="tr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
