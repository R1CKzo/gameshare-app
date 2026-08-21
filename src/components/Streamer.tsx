"use client";

import type { MediaConnection } from "peerjs";
import { useEffect, useRef, useState } from "react";

import { createPeer } from "@/lib/peer";

type StreamStatus = "idle" | "starting" | "live" | "error";

export function Streamer({ usernameTag }: { usernameTag: string }) {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [title, setTitle] = useState(`Live de ${usernameTag.split("#")[0]}`);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Awaited<ReturnType<typeof createPeer>> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallsRef = useRef<Set<MediaConnection>>(new Set());

  useEffect(() => {
    setShareUrl(`${window.location.origin}/stream/${encodeURIComponent(usernameTag)}`);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buildOutgoingStream(): Promise<MediaStream> {
    // Captura de tela (video + audio do sistema, quando suportado)
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });

    // Captura do microfone (opcional; usuario pode negar)
    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      micStream = null;
    }

    const videoTrack = displayStream.getVideoTracks()[0];
    const finalStream = new MediaStream([videoTrack]);

    const displayAudioTracks = displayStream.getAudioTracks();
    if (displayAudioTracks.length > 0 || micStream) {
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      if (displayAudioTracks.length > 0) {
        audioContext.createMediaStreamSource(new MediaStream(displayAudioTracks)).connect(destination);
      }
      if (micStream) {
        audioContext.createMediaStreamSource(micStream).connect(destination);
      }

      destination.stream.getAudioTracks().forEach((track) => finalStream.addTrack(track));
    }

    // Se o usuario encerrar o compartilhamento de tela pelo proprio navegador
    videoTrack.addEventListener("ended", () => stopStream());

    return finalStream;
  }

  async function startStream() {
    setErrorMsg(null);
    setStatus("starting");

    try {
      const outgoingStream = await buildOutgoingStream();
      localStreamRef.current = outgoingStream;
      if (videoRef.current) {
        videoRef.current.srcObject = outgoingStream;
      }

      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Falha ao registrar a live no servidor.");
      const stream = await res.json();

      const peer = await createPeer(stream.peerId);
      peerRef.current = peer;

      peer.on("open", () => setStatus("live"));

      peer.on("call", (call) => {
        call.answer(localStreamRef.current ?? undefined);
        activeCallsRef.current.add(call);
        setViewerCount((c) => c + 1);

        call.on("close", () => {
          activeCallsRef.current.delete(call);
          setViewerCount((c) => Math.max(0, c - 1));
        });
        call.on("error", () => {
          activeCallsRef.current.delete(call);
          setViewerCount((c) => Math.max(0, c - 1));
        });
      });

      peer.on("error", (err) => {
        console.error("PeerJS error:", err);
        setErrorMsg("Erro de conexao WebRTC: " + err.type);
      });
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err instanceof Error ? err.message : "Nao foi possivel iniciar a captura de tela."
      );
      setStatus("error");
      stopStream();
    }
  }

  function stopStream() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    activeCallsRef.current.forEach((call) => call.close());
    activeCallsRef.current.clear();
    setViewerCount(0);

    peerRef.current?.destroy();
    peerRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;

    if (status === "live" || status === "starting") {
      fetch("/api/stream", { method: "PATCH" }).catch(() => {});
    }

    setStatus("idle");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-black">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
        </div>
        {errorMsg && <p className="mt-2 text-sm text-danger">{errorMsg}</p>}
      </div>

      <div className="space-y-4 rounded-lg border border-slate-800 bg-surface p-4">
        <div>
          <label className="mb-1 block text-sm text-slate-300">Titulo da live</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={status === "live" || status === "starting"}
            className="w-full rounded-md border border-slate-700 bg-background px-3 py-2 text-white outline-none focus:border-primary disabled:opacity-60"
          />
        </div>

        {status === "idle" || status === "error" ? (
          <button
            onClick={startStream}
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary/90"
          >
            Selecionar tela e iniciar live
          </button>
        ) : status === "starting" ? (
          <button disabled className="w-full rounded-md bg-primary/50 px-4 py-2 font-medium text-white">
            Iniciando...
          </button>
        ) : (
          <button
            onClick={stopStream}
            className="w-full rounded-md bg-danger px-4 py-2 font-medium text-white hover:bg-danger/90"
          >
            Encerrar live
          </button>
        )}

        {status === "live" && (
          <div className="space-y-2 border-t border-slate-800 pt-4">
            <p className="text-sm text-slate-300">
              <span className="font-medium text-accent">{viewerCount}</span> espectador(es) conectado(s)
            </p>
            <label className="mb-1 block text-sm text-slate-300">Link da transmissao</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="w-full truncate rounded-md border border-slate-700 bg-background px-3 py-2 text-sm text-slate-300"
              />
              <button
                onClick={copyLink}
                className="shrink-0 rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-background"
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
