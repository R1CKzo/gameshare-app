"use client";

import { signIn } from "next-auth/react";

export function GoogleSignInButton({
  className,
  callbackUrl,
}: {
  className?: string;
  callbackUrl?: string;
}) {
  return (
    <button onClick={() => signIn("google", callbackUrl ? { callbackUrl } : undefined)} className={className}>
      Entrar com Google
    </button>
  );
}
