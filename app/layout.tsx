import type { Metadata } from "next";
import "./globals.css";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { getLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: {
    default: "FightBase Media",
    template: "%s | FightBase Media"
  },
  description:
    "MMA media platform with news, events, fighter profiles, rankings, analysis, quotes, and AI-assisted publishing workflows."
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body>
        <div className="page-shell">
          <Header />
          {children}
          <Footer />
        </div>
      </body>
    </html>
  );
}
