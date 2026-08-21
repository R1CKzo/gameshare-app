"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SetupPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/user/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erro ao definir nickname.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-bold text-white">Escolha seu nickname</h1>
      <p className="mb-6 text-sm text-slate-400">
        Voce recebera uma tag numerica unica, ex: <span className="text-accent">SeuNick#482913</span>
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="nickname" className="mb-1 block text-sm text-slate-300">
            Nickname
          </label>
          <input
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="ex: shadowplayer"
            minLength={3}
            maxLength={16}
            pattern="[a-zA-Z0-9_]+"
            required
            className="w-full rounded-md border border-slate-700 bg-surface px-3 py-2 text-white outline-none focus:border-primary"
          />
          <p className="mt-1 text-xs text-slate-500">3-16 caracteres: letras, numeros ou underline.</p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Confirmar"}
        </button>
      </form>
    </div>
  );
}
