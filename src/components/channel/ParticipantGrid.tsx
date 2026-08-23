"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

import { useSpeakingDetector } from "@/hooks/useSpeakingDetector";
import type { PresentUser } from "@/hooks/useVoiceMesh";

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
  remoteStreams: Map<string, MediaStream>;
  isMuted: boolean;
  sharingUserId: string | null;
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
        {present.map((user) => (
          <ParticipantTile
            key={user.id}
            user={user}
            isSelf={user.id === currentUserId}
            stream={user.id === currentUserId ? localStream : user.peerId ? remoteStreams.get(user.peerId) ?? null : null}
            muted={user.id === currentUserId ? isMuted : false}
            compact={!!sharer}
          />
        ))}
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

function ParticipantTile({
  user,
  isSelf,
  stream,
  muted,
  compact,
}: {
  user: PresentUser;
  isSelf: boolean;
  stream: MediaStream | null;
  muted: boolean;
  compact: boolean;
}) {
  const speaking = useSpeakingDetector(stream, muted);

  const initials = (user.nickname ?? "?").slice(0, 1).toUpperCase();
  const label = `${user.nickname ?? "Alguém"}${user.userTag ? "#" + user.userTag : ""}`;

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl bg-elevated/70 py-4 transition ${
        compact ? "py-3" : "py-6"
      }`}
    >
      <div
        className={`rounded-full border-[3px] p-0.5 transition-colors ${speaking ? "border-accent" : "border-transparent"}`}
      >
        <div
          className={`relative overflow-hidden rounded-full bg-primary ${compact ? "h-12 w-12" : "h-16 w-16"}`}
        >
          {user.image ? (
            <Image src={user.image} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-lg font-bold">{initials}</div>
          )}
        </div>
      </div>
      <div className="flex max-w-full items-center gap-1 px-2 text-xs font-semibold text-[#d5d7dc]">
        {muted && isSelf && <MutedIcon />}
        <span className="truncate">{isSelf ? "Você" : label}</span>
      </div>
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
