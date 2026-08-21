import type { Metadata } from "next";
import Link from "next/link";

import { AuthButtons } from "@/components/AuthButtons";
import { Providers } from "@/components/Providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "GameShare",
  description: "Transmita sua tela ao vivo enquanto joga.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>
          <header className="border-b border-slate-800">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <Link href="/" className="text-lg font-bold text-white">
                Game<span className="text-primary">Share</span>
              </Link>
              <AuthButtons />
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
