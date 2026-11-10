import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Khabri — live mandi prices across India",
  description:
    "Ask the price of rice, wheat, onion and more for any mandi in India. Type or speak, in Hindi or English.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}