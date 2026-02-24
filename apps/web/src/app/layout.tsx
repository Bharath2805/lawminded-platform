import type { Metadata } from "next";
import { Public_Sans, Sora } from "next/font/google";
import { CookieConsentBanner } from "@/components/privacy/cookie-consent-banner";
import "./globals.css";

const displayFont = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const bodyFont = Public_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LawMinded | AI Governance and EU AI Act Compliance",
  description:
    "LawMinded helps teams operationalize AI governance with structured compliance workflows, documentation, and audit evidence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="dark light" />
        <meta
          name="theme-color"
          content="#050914"
          media="(prefers-color-scheme: dark)"
        />
        <meta
          name="theme-color"
          content="#f8fafc"
          media="(prefers-color-scheme: light)"
        />
      </head>
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
