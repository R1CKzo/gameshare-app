"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

import { useSpeakingDetector } from "@/hooks/useSpeakingDetector";
import type { ConnectionQuality, PresentUser } from "@/hooks/useVoiceMesh";

const QUALITY_RANK: Record<ConnectionQuality, number> = { good: 0, medium: 1, bad: 2 };

// A "minha" bolinha nao tem uma RTCPeerConnection consigo mesma pra medir
// — mostra a pior entre todas as conexoes que eu tenho com os outros,
// como um proxy de "quao boa esta minha propria conexao agora".
function worstQuality(quality: Map<string, ConnectionQuality>): ConnectionQuality | null {
  let worst: ConnectionQuality | null = null;
  for (const q of quality.values()) {
    if (!worst || QUALITY_RANK[q] > QUALITY_RANK[worst]) worst = q;
  }
  return worst;
}

export function ParticipantGrid({
  present,
  currentUserId,
  localStream,
  remoteStreams,
  isMuted,
  sharingUserId,
  connectionQuality,
}: {
  present: PresentUser[];
  currentUserId: string;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isMuted: boolean;
  sharingUserId: string | null;
  connectionQuality: Map<string, ConnectionQuality>;
}) {
  const sharer = sharingUserId ? present.find((u) => u.id === sharingUserId) : null;
  const sharerStream = sharer
    ? sharer.id === currentUserId
      ? localStream
      : sharer.peerId
        ? remoteStreams.get(sharer.peerId) ?? null
        : null
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
      {sharer && sharerStream && (
        <div className="relative flex-1 overflow-hidden rounded-2xl border-2 border-accent bg-black">
          <ScreenView stream={sharerStream} />
          <div className="absolute left-2 top-2 flex max-w-[calc(100%-16px)] items-center gap-2 truncate rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold backdrop-blur sm:left-4 sm:top-4 sm:px-3.5 sm:py-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
            </svg>
            <span className="truncate">
              {sharer.id === currentUserId ? "Você está compartilhando a tela" : `${sharer.nickname ?? "Alguém"} está compartilhando a tela`}
            </span>
          </div>
        </div>
      )}

      <div
        className={`grid gap-3 ${
          sharer ? "grid-cols-[repeat(auto-fill,minmax(120px,1fr))]" : "flex-1 content-center grid-cols-[repeat(auto-fill,minmax(140px,1fr))]"
        }`}
      >
        {present.map((user) => {
          const isSelf = user.id === currentUserId;
          return (
            <ParticipantTile
              key={user.id}
              user={user}
              isSelf={isSelf}
              isSharing={user.id === sharingUserId}
              stream={isSelf ? localStream : user.peerId ? remoteStreams.get(user.peerId) ?? null : null}
              muted={isSelf ? isMuted : user.isMuted}
              size={tileSize(present.length, !!sharer)}
              quality={isSelf ? worstQuality(connectionQuality) : user.peerId ? connectionQuality.get(user.peerId) ?? null : null}
            />
          );
        })}
      </div>
    </div>
  );
}

// Sempre mudo: o audio de quem esta compartilhando (mic + audio do sistema
// misturados na mesma faixa) ja toca via ActiveCallAudioSink, montado na
// raiz — tocar de novo aqui duplicaria o som (e causaria eco pra quem esta
// se ouvindo, no caso do proprio compartilhador vendo a propria tela).
function ScreenView({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);
  return <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />;
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
  stream,
  muted,
  size,
  quality,
}: {
  user: PresentUser;
  isSelf: boolean;
  isSharing: boolean;
  stream: MediaStream | null;
  muted: boolean;
  size: TileSize;
  quality: ConnectionQuality | null;
}) {
  const speaking = useSpeakingDetector(stream, muted);

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
      {quality && <SignalIcon quality={quality} />}
      <div className="flex max-w-full items-center gap-1 px-2 text-xs font-semibold text-[#d5d7dc]">
        {muted && <MutedIcon />}
        <span className="truncate">{isSelf ? "Você" : label}</span>
      </div>
    </div>
  );
}

const QUALITY_COLOR: Record<ConnectionQuality, string> = {
  good: "#22c55e",
  medium: "#eab308",
  bad: "#ef4444",
};
const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  good: "Conexão boa",
  medium: "Conexão instável",
  bad: "Conexão ruim",
};
// Quantas barrinhas ficam "acesas" (cor cheia) pra cada nivel — as demais
// ficam esmaecidas, mesmo desenho de indicador de sinal que apps de
// chamada em geral usam.
const QUALITY_BARS: Record<ConnectionQuality, number> = { good: 3, medium: 2, bad: 1 };

// Sinal de conexao acima do nome — so aparece quando ja tem uma medicao de
// verdade (RTT/perda de pacote real da conexao P2P, ver useVoiceMesh),
// nunca um valor inventado.
function SignalIcon({ quality }: { quality: ConnectionQuality }) {
  const lit = QUALITY_BARS[quality];
  const color = QUALITY_COLOR[quality];
  return (
    <div title={QUALITY_LABEL[quality]} className="flex items-end gap-[1.5px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ height: 3 + i * 2.5, backgroundColor: i < lit ? color : "#3a3f4d" }}
          className="w-[3px] rounded-sm"
        />
      ))}
    </div>
  );
}

// Mesmo indicador de "compartilhando" que ja aparece na barra da miniatura
// grande, só que como um selinho no canto do avatar pequeno — antes so
// dava pra saber quem estava compartilhando olhando o video grande.
function ShareBadge() {
  return (
    <div className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-elevated bg-accent text-[#08090d]">
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
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M1 1l22 22" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.11 1.23" />
    </svg>
  );
}
