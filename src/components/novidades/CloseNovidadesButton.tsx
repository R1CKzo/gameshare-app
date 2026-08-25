"use client";

import { useRouter } from "next/navigation";

export function CloseNovidadesButton() {
  const router = useRouter();

  // Sempre manda pra "/" (que decide sozinha pra onde ir: ultimo servidor,
  // /setup, etc.) em vez de router.back() — depender da pilha de historico
  // do navegador podia devolver pra propria /novidades (ex: quando a
  // pessoa chegou aqui via redirecionamento automatico) e prender a pessoa
  // num loop de fechar-reabrir.
  function close() {
    router.replace("/");
  }

  return (
    <button
      onClick={close}
      aria-label="Fechar"
      title="Fechar"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-foreground"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
}
