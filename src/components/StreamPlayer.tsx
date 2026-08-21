"use client";

import { useEffect, useRef, useState } from "react";

import { createPeer } from "@/lib/peer";

type ConnectionStatus = "connecting" | "connected" | "offline" | "error";

export function StreamPlayer({ peerId, isLive }: { peerId: string | null; isLive: boolean }) {
  const [status, setStatus] = useState<ConnectionStatus>(isLive && peerId ? "connecting" : "offline");
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isLive || !peerId) {
      setStatus("offline");
      return;
    }

    let cancelled = false;
    let peer: Awaited<ReturnType<typeof createPeer>> | null = null;

    (async () => {
      peer = await createPeer();

      peer.on("open", () => {
        if (cancelled || !peer) return;
        // Chamada "somente recebimento": enviamos um MediaStream vazio para
        // estabelecer a conexao e escutamos o evento 'stream' com o video da live.
        const call = peer.call(peerId, new MediaStream());

        call.on("stream", (remoteStream) => {
          if (cancelled || !videoRef.current) return;
          videoRef.current.srcObject = remoteStream;
          setStatus("connected");
        });

        call.on("close", () => !cancelled && setStatus("offline"));
        call.on("error", () => !cancelled && setStatus("error"));
      });

      peer.on("error", (err) => {
        console.error("PeerJS viewer error:", err);
        if (!cancelled) setStatus("error");
      });
    })();

    return () => {
      cancelled = true;
      peer?.destroy();
    };
  }, [peerId, isLive]);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-black">
        <video ref={videoRef} autoPlay playsInline className="h-full w-full object-contain" />

        {status !== "connected" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-slate-300">
            {status === "offline" && "Esta transmissao esta offline no momento."}
            {status === "connecting" && "Conectando a transmissao..."}
            {status === "error" && "Nao foi possivel conectar. Atualize a pagina para tentar novamente."}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={typeof window !== "undefined" ? window.location.href : ""}
          className="w-full truncate rounded-md border border-slate-700 bg-surface px-3 py-2 text-sm text-slate-300"
        />
        <button
          onClick={copyLink}
          className="shrink-0 rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-surface"
        >
          {copied ? "Copiado!" : "Compartilhar"}
        </button>
      </div>
    </div>
  );
}
