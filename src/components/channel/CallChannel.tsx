"use client";

import type { MediaConnection, default as Peer } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { createPeer } from "@/lib/peer";

type BroadcasterInfo = { id: string; nickname: string | null; userTag: string | null } | null;
type LiveState = { isLive: boolean; peerId: string | null; broadcaster: BroadcasterInfo };
type Phase = "idle" | "starting" | "broadcasting" | "connecting" | "watching" | "orphaned";

export function CallChannel({
  channelId,
  channelName,
  currentUserId,
  initialLive,
}: {
  channelId: string;
  channelName: string;
  currentUserId: string;
  initialLive: LiveState;
}) {
  const [live, setLive] = useState<LiveState>(initialLive);
  const [phase, setPhase] = useState<Phase>(() =>
    initialLive.isLive && initialLive.broadcaster?.id === currentUserId ? "orphaned" : "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallsRef = useRef<Set<MediaConnection>>(new Set());
  const hasLocalStreamRef = useRef(false);

  const cleanupPeer = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    hasLocalStreamRef.current = false;
    activeCallsRef.current.forEach((c) => c.close());
    activeCallsRef.current.clear();
    setViewerCount(0);
    peerRef.current?.destroy();
    peerRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Poll do estado do canal para saber se alguem esta transmitindo
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/channels/${channelId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setLive({ isLive: data.isLive, peerId: data.peerId, broadcaster: data.broadcaster });
      } catch {
        // ignora falhas transitorias de rede
      }
    }

    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [channelId]);

  // Reage a mudancas no estado ao vivo: conecta como espectador ou volta pro idle
  useEffect(() => {
    const iAmBroadcaster = live.broadcaster?.id === currentUserId;

    if (!live.isLive) {
      if (phase === "watching" || phase === "connecting") {
        cleanupPeer();
        setPhase("idle");
      }
      if (phase === "broadcasting" && !hasLocalStreamRef.current) {
        setPhase("idle");
      }
      return;
    }

    if (iAmBroadcaster) return; // fluxo tratado por startSharing()

    if (phase === "idle" || phase === "orphaned") {
      connectAsViewer(live.peerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.isLive, live.peerId, live.broadcaster?.id]);

  useEffect(() => cleanupPeer, [cleanupPeer]);

  async function connectAsViewer(peerId: string | null) {
    if (!peerId) return;
    setPhase("connecting");
    setErrorMsg(null);

    try {
      const peer = await createPeer();
      peerRef.current = peer;

      peer.on("open", () => {
        const call = peer.call(peerId, new MediaStream());
        call.on("stream", (remoteStream) => {
          if (videoRef.current) videoRef.current.srcObject = remoteStream;
          setPhase("watching");
        });
        call.on("close", () => {
          setPhase("idle");
          cleanupPeer();
        });
        call.on("error", () => setErrorMsg("Nao foi possivel conectar a transmissao."));
      });

      peer.on("error", () => setErrorMsg("Erro de conexao WebRTC."));
    } catch {
      setErrorMsg("Nao foi possivel conectar a transmissao.");
      setPhase("idle");
    }
  }

  async function startSharing() {
    setErrorMsg(null);
    setPhase("starting");

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });

      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        micStream = null;
      }

      const videoTrack = displayStream.getVideoTracks()[0];
      const outgoing = new MediaStream([videoTrack]);

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
        destination.stream.getAudioTracks().forEach((t) => outgoing.addTrack(t));
      }

      videoTrack.addEventListener("ended", () => stopSharing());

      localStreamRef.current = outgoing;
      hasLocalStreamRef.current = true;
      if (videoRef.current) videoRef.current.srcObject = outgoing;

      const res = await fetch(`/api/channels/${channelId}/start`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Nao foi possivel iniciar a transmissao.");
      }
      const { peerId } = await res.json();

      const peer = await createPeer(peerId);
      peerRef.current = peer;

      peer.on("open", () => {
        setPhase("broadcasting");
        setLive({ isLive: true, peerId, broadcaster: { id: currentUserId, nickname: null, userTag: null } });
      });

      peer.on("call", (call) => {
        call.answer(localStreamRef.current ?? undefined);
        activeCallsRef.current.add(call);
        setViewerCount((c) => c + 1);
        call.on("close", () => {
          activeCallsRef.current.delete(call);
          setViewerCount((c) => Math.max(0, c - 1));
        });
      });

      peer.on("error", (err) => setErrorMsg("Erro de conexao WebRTC: " + err.type));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Nao foi possivel compartilhar a tela.");
      cleanupPeer();
      setPhase("idle");
    }
  }

  async function stopSharing() {
    cleanupPeer();
    setPhase("idle");
    setLive({ isLive: false, peerId: null, broadcaster: null });
    fetch(`/api/channels/${channelId}/stop`, { method: "POST" }).catch(() => {});
  }

  const broadcasterLabel = live.broadcaster
    ? `${live.broadcaster.nickname ?? "Alguem"}${live.broadcaster.userTag ? "#" + live.broadcaster.userTag : ""}`
    : null;

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={phase === "broadcasting" || phase === "watching" ? "#22d3ee" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
        <span className="font-bold">{channelName}</span>
        {(phase === "broadcasting" || phase === "watching") && (
          <div className="flex items-center gap-1.5 rounded-full bg-accent/[0.12] px-2.5 py-0.5 text-xs font-bold text-accent">
            <div className="h-1.5 w-1.5 rounded-full bg-accent" />
            AO VIVO
          </div>
        )}
        {phase === "broadcasting" && viewerCount > 0 && (
          <span className="text-xs text-muted">{viewerCount} assistindo</span>
        )}
      </div>

      {errorMsg && (
        <div className="border-b border-danger/30 bg-danger/10 px-5 py-2 text-sm text-danger">{errorMsg}</div>
      )}

      {(phase === "broadcasting" || phase === "watching" || phase === "connecting") && (
        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="relative flex-1 overflow-hidden rounded-2xl border-2 border-accent bg-black">
            <video ref={videoRef} autoPlay muted={phase === "broadcasting"} playsInline className="h-full w-full object-contain" />
            {phase === "connecting" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-muted">
                Conectando a transmissao...
              </div>
            )}
            {(phase === "broadcasting" || phase === "watching") && (
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-2 text-xs font-semibold backdrop-blur">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8" />
                  <path d="M12 17v4" />
                </svg>
                {phase === "broadcasting" ? "Voce esta compartilhando a tela" : `${broadcasterLabel} esta compartilhando a tela`}
              </div>
            )}
          </div>

          {phase === "broadcasting" && (
            <div className="flex justify-center">
              <button
                onClick={stopSharing}
                className="flex items-center gap-2 rounded-full bg-danger px-6 py-3 text-sm font-bold text-white transition hover:bg-danger-hover"
              >
                Encerrar transmissao
              </button>
            </div>
          )}
        </div>
      )}

      {(phase === "idle" || phase === "starting" || phase === "orphaned") && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-elevated">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
            </svg>
          </div>
          <div className="max-w-sm text-center">
            <div className="font-display text-xl font-bold">Ninguem esta compartilhando a tela</div>
            <div className="mt-2 text-sm text-muted">
              Clique abaixo para transmitir sua tela e audio para quem estiver em {channelName}.
            </div>
          </div>
          <button
            onClick={startSharing}
            disabled={phase === "starting"}
            className="flex items-center gap-2.5 rounded-full bg-primary px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition hover:-translate-y-px disabled:opacity-60"
          >
            {phase === "starting" ? "Iniciando..." : "Compartilhar minha tela"}
          </button>
        </div>
      )}
    </>
  );
}

