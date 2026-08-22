"use client";

import { signIn } from "next-auth/react";

export function GoogleSignInButton({ className }: { className?: string }) {
  return (
    <button onClick={() => signIn("google")} className={className}>
      Entrar com Google
    </button>
  );
}
