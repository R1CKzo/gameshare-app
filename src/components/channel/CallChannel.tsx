"use client";

import Image from "next/image";
import type { MediaConnection, default as Peer } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { createPeer, createReceiveOnlyStream } from "@/lib/peer";
import { HamburgerIcon, MembersIcon, useMobileUI } from "@/components/shell/MobileUIContext";

type BroadcasterInfo = { id: string; nickname: string | null; userTag: string | null } | null;
type PresentUser = { id: string; nickname: string | null; userTag: string | null; image: string | null };
type LiveState = { isLive: boolean; peerId: string | null; broadcaster: BroadcasterInfo };

// Espelha o fluxo do Discord: primeiro voce "entra na sala" (fica visivel,
// sem compartilhar nada), so depois, se quiser, comeca a compartilhar a
// tela — e assistir quem esta ao vivo tambem e uma escolha, nao algo
// automatico so por estar na sala.
type Phase =
  | "notJoined"
  | "connected"
  | "startingShare"
  | "sharing"
  | "connectingWatch"
  | "watching"
  | "watchFailed"
  | "orphaned";

const HEARTBEAT_MS = 15000;
const CONNECT_TIMEOUT_MS = 15000;

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
  const [present, setPresent] = useState<PresentUser[]>([]);
  const [phase, setPhase] = useState<Phase>(() =>
    initialLive.isLive && initialLive.broadcaster?.id === currentUserId ? "orphaned" : "notJoined"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const { toggleSidebar, toggleMembers } = useMobileUI();

  const joined = phase !== "notJoined";

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallsRef = useRef<Set<MediaConnection>>(new Set());
  const hasLocalStreamRef = useRef(false);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Para a conexao de midia atual (compartilhando ou assistindo), sem sair
  // da sala — a presenca continua de pe.
  const cleanupMedia = useCallback(() => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
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

  // Poll do estado do canal: quem esta transmitindo e quem esta presente.
  // Roda sempre, mesmo antes de entrar na sala, pra dar pra ver "fulano
  // esta ao vivo" antes mesmo de entrar.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/channels/${channelId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setLive({ isLive: data.isLive, peerId: data.peerId, broadcaster: data.broadcaster });
        setPresent(data.present ?? []);
      } catch {
        // ignora falhas transitorias de rede
      }
    }

    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [channelId]);

  // Heartbeat de presenca: so roda enquanto estou "na sala". Sai da lista
  // automaticamente se fechar a aba sem avisar (presencas somem depois de
  // ~30s sem heartbeat).
  useEffect(() => {
    if (!joined) return;

    function beat() {
      fetch(`/api/channels/${channelId}/presence`, { method: "POST" }).catch(() => {});
    }

    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
      fetch(`/api/channels/${channelId}/presence`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, [joined, channelId]);

  // Se eu estava assistindo/compartilhando e o estado ao vivo muda por
  // baixo dos meus pes (a pessoa parou, ou o servidor perdeu o registro),
  // volta pro estado "conectado" (na sala, sem nada rolando).
  useEffect(() => {
    if (live.isLive) return;
    if (phase === "watching" || phase === "connectingWatch" || phase === "watchFailed") {
      cleanupMedia();
      setPhase("connected");
      setErrorMsg(null);
    }
    if (phase === "sharing" && !hasLocalStreamRef.current) {
      setPhase("connected");
    }
  }, [live.isLive, phase, cleanupMedia]);

  useEffect(() => cleanupMedia, [cleanupMedia]);

  function joinRoom() {
    setErrorMsg(null);
    setPhase("connected");
  }

  function leaveRoom() {
    cleanupMedia();
    if (phase === "sharing") {
      fetch(`/api/channels/${channelId}/stop`, { method: "POST" }).catch(() => {});
      setLive((l) => (l.broadcaster?.id === currentUserId ? { isLive: false, peerId: null, broadcaster: null } : l));
    }
    setErrorMsg(null);
    setPhase("notJoined");
  }

  async function watchStream() {
    if (!live.peerId) return;
    setPhase("connectingWatch");
    setErrorMsg(null);

    connectTimeoutRef.current = setTimeout(() => {
      cleanupMedia();
      setPhase("watchFailed");
      setErrorMsg("A conexao demorou demais. A rede de quem esta assistindo ou compartilhando pode estar bloqueando o WebRTC.");
    }, CONNECT_TIMEOUT_MS);

    try {
      const peer = await createPeer();
      peerRef.current = peer;

      peer.on("open", () => {
        const call = peer.call(live.peerId as string, createReceiveOnlyStream());

        // Como quem assiste nao manda nenhuma faixa de audio/video de
        // verdade, o WebRTC as vezes cria a offer sem nenhuma secao de
        // midia. O Safari/WebKit (motor de qualquer navegador no iPhone,
        // Chrome incluso) e bem mais estrito com isso do que o
        // Chrome/Firefox no computador. Forcar transceivers "recvonly"
        // logo apos criar a chamada garante que a offer sempre reserve
        // espaco pra receber video e audio, em qualquer navegador.
        const pc = call.peerConnection;
        if (pc && pc.getTransceivers().length === 0) {
          try {
            pc.addTransceiver("video", { direction: "recvonly" });
            pc.addTransceiver("audio", { direction: "recvonly" });
          } catch {
            // navegador muito antigo sem addTransceiver: segue so com o
            // comportamento padrao do PeerJS.
          }
        }

        call.on("stream", (remoteStream) => {
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
          if (videoRef.current) videoRef.current.srcObject = remoteStream;
          setPhase("watching");
        });
        call.on("close", () => {
          setPhase("connected");
          cleanupMedia();
        });
        call.on("error", () => {
          setErrorMsg("Nao foi possivel conectar a transmissao.");
          setPhase("watchFailed");
        });
      });

      peer.on("error", () => {
        setErrorMsg("Erro de conexao WebRTC.");
        setPhase("watchFailed");
      });
    } catch {
      setErrorMsg("Nao foi possivel conectar a transmissao.");
      setPhase("watchFailed");
    }
  }

  function stopWatching() {
    cleanupMedia();
    setErrorMsg(null);
    setPhase("connected");
  }

  async function startSharing() {
    setErrorMsg(null);
    setPhase("startingShare");

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
        setPhase("sharing");
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
      cleanupMedia();
      setPhase("connected");
    }
  }

  function stopSharing() {
    cleanupMedia();
    setPhase("connected");
    setLive({ isLive: false, peerId: null, broadcaster: null });
    fetch(`/api/channels/${channelId}/stop`, { method: "POST" }).catch(() => {});
  }

  function clearOrphaned() {
    setPhase("connected");
    setLive((l) => (l.broadcaster?.id === currentUserId ? { isLive: false, peerId: null, broadcaster: null } : l));
    fetch(`/api/channels/${channelId}/stop`, { method: "POST" }).catch(() => {});
  }

  const broadcasterLabel = live.broadcaster
    ? `${live.broadcaster.nickname ?? "Alguem"}${live.broadcaster.userTag ? "#" + live.broadcaster.userTag : ""}`
    : null;
  const someoneElseLive = live.isLive && live.broadcaster?.id !== currentUserId;

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 sm:gap-2.5 sm:px-5">
        <button
          onClick={toggleSidebar}
          aria-label="Abrir menu"
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7] md:hidden"
        >
          <HamburgerIcon />
        </button>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={phase === "sharing" || phase === "watching" ? "#22d3ee" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
        <span className="truncate font-bold">{channelName}</span>
        {live.isLive && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/[0.12] px-2.5 py-0.5 text-xs font-bold text-accent">
            <div className="h-1.5 w-1.5 rounded-full bg-accent" />
            AO VIVO
          </div>
        )}
        {phase === "sharing" && viewerCount > 0 && (
          <span className="hidden shrink-0 text-xs text-muted sm:inline">{viewerCount} assistindo</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {present.length > 0 && (
            <>
              <div className="flex">
                {present.slice(0, 5).map((u, i) => (
                  <PresenceAvatar key={u.id} user={u} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i }} />
                ))}
              </div>
              <span className="hidden text-xs text-muted sm:inline">
                {present.length} {present.length === 1 ? "pessoa aqui" : "pessoas aqui"}
              </span>
            </>
          )}
          {joined && (
            <button
              onClick={leaveRoom}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold text-muted transition hover:bg-danger/10 hover:text-danger"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
              <span className="hidden sm:inline">Sair da sala</span>
            </button>
          )}
          <button
            onClick={toggleMembers}
            aria-label="Ver membros"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7] lg:hidden"
          >
            <MembersIcon />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger sm:px-5">{errorMsg}</div>
      )}

      {(phase === "sharing" || phase === "watching" || phase === "connectingWatch") && (
        <div className="flex flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
          <div className="relative flex-1 overflow-hidden rounded-2xl border-2 border-accent bg-black">
            <video ref={videoRef} autoPlay muted={phase === "sharing"} playsInline className="h-full w-full object-contain" />
            {phase === "connectingWatch" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-muted">
                Conectando a transmissao...
              </div>
            )}
            {(phase === "sharing" || phase === "watching") && (
              <div className="absolute left-2 top-2 flex max-w-[calc(100%-16px)] items-center gap-2 truncate rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold backdrop-blur sm:left-4 sm:top-4 sm:px-3.5 sm:py-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8" />
                  <path d="M12 17v4" />
                </svg>
                <span className="truncate">
                  {phase === "sharing" ? "Voce esta compartilhando a tela" : `${broadcasterLabel} esta compartilhando a tela`}
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-center">
            {phase === "sharing" && (
              <button
                onClick={stopSharing}
                className="flex items-center gap-2 rounded-full bg-danger px-6 py-3 text-sm font-bold text-white transition hover:bg-danger-hover"
              >
                Parar de compartilhar
              </button>
            )}
            {(phase === "watching" || phase === "connectingWatch") && (
              <button
                onClick={stopWatching}
                className="flex items-center gap-2 rounded-full border border-[#2d3344] px-6 py-3 text-sm font-bold text-[#d5d7dc] transition hover:border-danger hover:text-danger"
              >
                Parar de assistir
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "watchFailed" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-danger/10">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 1l22 22" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <path d="M12 20h.01" />
            </svg>
          </div>
          <div className="max-w-sm text-center">
            <div className="font-display text-xl font-bold">Nao foi possivel conectar</div>
            <div className="mt-2 text-sm text-muted">
              {broadcasterLabel ?? "Alguem"} esta compartilhando, mas a conexao nao fechou. Pode ser a rede de
              uma das duas pontas bloqueando o WebRTC.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={stopWatching}
              className="rounded-full border border-[#2d3344] px-5 py-3 text-sm font-bold text-[#d5d7dc] transition hover:border-danger hover:text-danger"
            >
              Cancelar
            </button>
            <button
              onClick={watchStream}
              className="flex items-center gap-2.5 rounded-full bg-primary px-7 py-3 text-sm font-bold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition hover:-translate-y-px"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {phase === "orphaned" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
          <div className="max-w-sm text-center">
            <div className="font-display text-xl font-bold">Sua transmissao anterior ficou pendurada</div>
            <div className="mt-2 text-sm text-muted">
              Parece que voce atualizou a pagina enquanto compartilhava. Encerre pra poder compartilhar de novo.
            </div>
          </div>
          <button
            onClick={clearOrphaned}
            className="rounded-full bg-danger px-6 py-3 text-sm font-bold text-white transition hover:bg-danger-hover"
          >
            Encerrar transmissao
          </button>
        </div>
      )}

      {phase === "notJoined" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-elevated">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
          </div>
          <div className="max-w-sm text-center">
            <div className="font-display text-xl font-bold">Voce nao esta em {channelName}</div>
            <div className="mt-2 text-sm text-muted">
              {someoneElseLive
                ? `${broadcasterLabel} esta ao vivo aqui agora.`
                : "Entre pra ficar visivel e, se quiser, compartilhar sua tela."}
            </div>
          </div>
          <button
            onClick={joinRoom}
            className="flex items-center gap-2.5 rounded-full bg-primary px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition hover:-translate-y-px"
          >
            Entrar na sala
          </button>
        </div>
      )}

      {phase === "connected" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
          {someoneElseLive ? (
            <>
              <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-accent/10">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8" />
                  <path d="M12 17v4" />
                </svg>
              </div>
              <div className="max-w-sm text-center">
                <div className="font-display text-xl font-bold">{broadcasterLabel} esta ao vivo</div>
                <div className="mt-2 text-sm text-muted">Clique abaixo pra assistir a tela em tempo real.</div>
              </div>
              <button
                onClick={watchStream}
                className="flex items-center gap-2.5 rounded-full bg-accent px-7 py-3.5 text-[15px] font-bold text-[#08090d] shadow-[0_4px_16px_rgba(34,211,238,0.35)] transition hover:-translate-y-px"
              >
                Assistir transmissao
              </button>
            </>
          ) : (
            <>
              <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-elevated">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8" />
                  <path d="M12 17v4" />
                </svg>
              </div>
              <div className="max-w-sm text-center">
                <div className="font-display text-xl font-bold">Voce esta na sala</div>
                <div className="mt-2 text-sm text-muted">Ninguem esta compartilhando a tela ainda.</div>
              </div>
              <button
                onClick={startSharing}
                className="flex items-center gap-2.5 rounded-full bg-primary px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition hover:-translate-y-px"
              >
                Compartilhar minha tela
              </button>
            </>
          )}

          {present.filter((u) => u.id !== currentUserId).length > 0 && (
            <div className="flex items-center gap-2 rounded-full bg-elevated px-3 py-1.5">
              <div className="flex">
                {present
                  .filter((u) => u.id !== currentUserId)
                  .slice(0, 5)
                  .map((u, i) => (
                    <PresenceAvatar key={u.id} user={u} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i }} />
                  ))}
              </div>
              <span className="text-xs text-muted">tambem estao na sala</span>
            </div>
          )}
        </div>
      )}

      {phase === "startingShare" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-elevated">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
            </svg>
          </div>
          <button
            disabled
            className="flex items-center gap-2.5 rounded-full bg-primary/50 px-7 py-3.5 text-[15px] font-bold text-white"
          >
            Iniciando...
          </button>
        </div>
      )}
    </>
  );
}

function PresenceAvatar({ user, style }: { user: PresentUser; style?: React.CSSProperties }) {
  const initials = (user.nickname ?? "?").slice(0, 1).toUpperCase();
  return (
    <div
      title={user.nickname ? `${user.nickname}#${user.userTag ?? ""}` : undefined}
      style={style}
      className="relative h-6 w-6 overflow-hidden rounded-full border-2 border-main bg-primary"
    >
      {user.image ? (
        <Image src={user.image} alt="" fill sizes="24px" className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-display text-[10px] font-bold">
          {initials}
        </div>
      )}
    </div>
  );
}
