"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { useActiveCall } from "@/components/call/ActiveCallProvider";
import { SignalIcon } from "@/components/call/SignalIcon";
import { useSpeakingDetector } from "@/hooks/useSpeakingDetector";
import type { PresentUser, RemotePeerTracks } from "@/hooks/useVoiceMesh";

export function ParticipantGrid({
  present,
  currentUserId,
  localStream,
  remoteStreams,
  isMuted,
  sharingUserId,
}: {
  present: PresentUser[];
  currentUserId: string;
  localStream: MediaStream | null;
  remoteStreams: Map<string, RemotePeerTracks>;
  isMuted: boolean;
  sharingUserId: string | null;
}) {
  const { isWatchingBroadcast, joinBroadcast, leaveBroadcast, getVolumeFor, setVolumeFor } = useActiveCall();

  const sharer = sharingUserId ? present.find((u) => u.id === sharingUserId) : null;
  const isSharerSelf = !!sharer && sharer.id === currentUserId;
  const sharerTracks = sharer && !isSharerSelf && sharer.peerId ? remoteStreams.get(sharer.peerId) ?? null : null;
  // Vídeo/áudio da transmissão só aparecem pra quem clicou "entrar" -- o
  // próprio compartilhador sempre vê a própria tela, sem precisar disso.
  const showBroadcast = !!sharer && (isSharerSelf || isWatchingBroadcast);

  const sharerVideoStream = useMemo(() => {
    if (!sharer) return null;
    if (isSharerSelf) return localStream;
    const track = sharerTracks?.videoTrack ?? null;
    return track ? new MediaStream([track]) : null;
  }, [sharer, isSharerSelf, localStream, sharerTracks]);

  const sharerVolume = sharer && !isSharerSelf ? getVolumeFor(sharer.id) : 100;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
      {sharer && showBroadcast && sharerVideoStream && (
        <BroadcastPreview
          stream={sharerVideoStream}
          label={isSharerSelf ? "Você está compartilhando a tela" : `${sharer.nickname ?? "Alguém"} está compartilhando a tela`}
          showBroadcastControls={!isSharerSelf}
          volume={sharerVolume}
          onVolumeChange={(v) => setVolumeFor(sharer.id, v)}
          onLeave={leaveBroadcast}
        />
      )}

      {sharer && !showBroadcast && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-accent/40 bg-elevated/70 p-6 text-center">
          <ShareIcon size={26} />
          <div className="text-sm font-semibold">{sharer.nickname ?? "Alguém"} está compartilhando a tela</div>
          <button
            onClick={joinBroadcast}
            className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white transition hover:bg-primary-hover"
          >
            Entrar na transmissão
          </button>
        </div>
      )}

      <div
        className={`grid gap-3 ${
          sharer ? "grid-cols-[repeat(auto-fill,minmax(120px,1fr))]" : "flex-1 content-center grid-cols-[repeat(auto-fill,minmax(140px,1fr))]"
        }`}
      >
        {present.map((user) => {
          const isSelf = user.id === currentUserId;
          const tracks = !isSelf && user.peerId ? remoteStreams.get(user.peerId) ?? null : null;
          return (
            <ParticipantTile
              key={user.id}
              user={user}
              isSelf={isSelf}
              isSharing={user.id === sharingUserId}
              localStream={isSelf ? localStream : null}
              micTrack={isSelf ? null : tracks?.micTrack ?? null}
              muted={isSelf ? isMuted : user.isMuted}
              size={tileSize(present.length, !!sharer)}
            />
          );
        })}
      </div>
    </div>
  );
}

// Sempre mudo: a voz de quem esta compartilhando ja toca via
// ActiveCallAudioSink, montado na raiz -- tocar de novo aqui duplicaria o
// som (e causaria eco pra quem esta se ouvindo, no caso do proprio
// compartilhador vendo a propria tela). A faixa de video aqui nunca carrega
// audio junto (ver RemotePeerTracks em useVoiceMesh.ts): mic e transmissao
// sao faixas separadas, entao nem precisa filtrar nada.
function ScreenView({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);
  return <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />;
}

// Tempo parado do mouse ate os controles (volume, sair da transmissao,
// tela cheia) sumirem sozinhos -- mesmo padrao de qualquer player de
// video (YouTube, etc), pra nao ficar poluindo a tela durante a
// transmissao.
const CONTROLS_IDLE_MS = 3000;

// Video grande de quem esta compartilhando, com botao de tela cheia
// sempre disponivel e, so pra quem nao e o proprio compartilhador com
// beta ligado, volume da transmissao + "Sair da transmissao" -- os
// controles da direita somem depois de alguns segundos com o mouse
// parado e voltam no primeiro movimento.
function BroadcastPreview({
  stream,
  label,
  showBroadcastControls,
  volume,
  onVolumeChange,
  onLeave,
}: {
  stream: MediaStream;
  label: string;
  showBroadcastControls: boolean;
  volume: number;
  onVolumeChange: (volume: number) => void;
  onLeave: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function wakeControls() {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_IDLE_MS);
  }

  useEffect(() => {
    wakeControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement === containerRef.current) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current?.requestFullscreen().catch(() => {});
    }
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={wakeControls}
      className="relative flex-1 overflow-hidden rounded-2xl border-2 border-accent bg-black"
    >
      <ScreenView stream={stream} />
      <div className="absolute left-2 top-2 flex max-w-[calc(100%-16px)] items-center gap-2 truncate rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold backdrop-blur sm:left-4 sm:top-4 sm:px-3.5 sm:py-2">
        <ShareIcon />
        <span className="truncate">{label}</span>
      </div>
      <div
        className={`absolute right-2 top-2 flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1.5 backdrop-blur transition-opacity duration-300 sm:right-4 sm:top-4 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {showBroadcastControls && (
          <>
            <VolumeIcon />
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label="Volume da transmissão"
              className="w-16 accent-accent sm:w-20"
            />
            <button
              onClick={onLeave}
              className="whitespace-nowrap rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              Sair da transmissão
            </button>
          </>
        )}
        <button
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      </div>
    </div>
  );
}

function FullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

type TileSize = { avatar: string; pad: string };

// Faixas de tamanho por quantidade de gente na sala — 4 niveis, do maior
// (poucas pessoas) ao menor (sala cheia). O modo compacto (quando tem
// compartilhamento de tela rolando, disputando espaco com a miniatura
// grande) funciona como um multiplicador em cima disso: desloca a
// contagem efetiva pra frente, empurrando a mesma sala pra uma faixa menor
// mais cedo, em vez de precisar de uma tabela em dobro.
function tileSize(count: number, compact: boolean): TileSize {
  const effective = compact ? count + 4 : count;
  if (effective <= 4) return { avatar: "h-16 w-16", pad: "py-6" };
  if (effective <= 8) return { avatar: "h-14 w-14", pad: "py-5" };
  if (effective <= 12) return { avatar: "h-12 w-12", pad: "py-4" };
  return { avatar: "h-10 w-10", pad: "py-3" };
}

function ParticipantTile({
  user,
  isSelf,
  isSharing,
  localStream,
  micTrack,
  muted,
  size,
}: {
  user: PresentUser;
  isSelf: boolean;
  isSharing: boolean;
  localStream: MediaStream | null;
  micTrack: MediaStreamTrack | null;
  muted: boolean;
  size: TileSize;
}) {
  // So a voz (nunca a transmissao) alimenta o detector de "esta falando" --
  // sem isolar a faixa, o aro acenderia com o som do jogo/app de quem esta
  // compartilhando, nao so quando a pessoa fala de verdade.
  const micStream = useMemo(() => (micTrack ? new MediaStream([micTrack]) : null), [micTrack]);
  const speaking = useSpeakingDetector(isSelf ? localStream : micStream, muted);

  const initials = (user.nickname ?? "?").slice(0, 1).toUpperCase();
  const label = `${user.nickname ?? "Alguém"}${user.userTag ? "#" + user.userTag : ""}`;

  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-xl bg-elevated/70 transition ${size.pad}`}>
      <div
        className={`relative rounded-full border-[3px] p-0.5 transition-colors ${speaking ? "border-accent" : "border-transparent"}`}
      >
        <div className={`relative overflow-hidden rounded-full bg-primary ${size.avatar}`}>
          {user.image ? (
            <Image src={user.image} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-lg font-bold">{initials}</div>
          )}
        </div>
        {isSharing && <ShareBadge />}
      </div>
      <SignalIcon quality={user.connectionQuality} />
      <div className="flex max-w-full items-center gap-1 px-2 text-xs font-semibold text-foreground-secondary">
        {muted && <MutedIcon />}
        <span className="truncate">{isSelf ? "Você" : label}</span>
      </div>
    </div>
  );
}

function ShareIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

// Mesmo indicador de "compartilhando" que ja aparece na barra da miniatura
// grande, só que como um selinho no canto do avatar pequeno — antes so
// dava pra saber quem estava compartilhando olhando o video grande.
function ShareBadge() {
  return (
    <div className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-elevated bg-accent text-background">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
      </svg>
    </div>
  );
}

function MutedIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M1 1l22 22" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.11 1.23" />
    </svg>
  );
}
