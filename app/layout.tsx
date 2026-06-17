import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aslı Filinta Operasyon",
  description: "Dahili görev yönetim sistemi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
