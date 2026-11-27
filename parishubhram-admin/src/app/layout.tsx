import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "పరిశుభ్రం Admin • GHMC Official Portal",
  description: "GHMC Waste Accountability & Resolution Management Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
