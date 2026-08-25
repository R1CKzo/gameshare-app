"use client";

import { useEffect, useMemo, useRef } from "react";

import { useActiveCall } from "@/components/call/ActiveCallProvider";
import type { RemotePeerTracks } from "@/hooks/useVoiceMesh";

// Os elementos <audio> que realmente tocam a voz e a transmissao dos
// outros participantes moram aqui, fora de qualquer tela de canal/DM —
// montados direto na raiz, sempre presentes enquanto a chamada estiver
// ativa. Antes eles viviam dentro do ParticipantGrid, que so existe na
// propria tela da chamada: ao navegar pra outra pagina esses elementos
// somem, a malha WebRTC continua viva mas ninguem mais toca o audio
// recebido — dava a impressao de ter saido da call mesmo continuando
// conectado.
export function ActiveCallAudioSink() {
  const { remoteStreams, present, sharingUserId, isWatchingBroadcast, getVolumeFor } = useActiveCall();

  const sharerPeerId = sharingUserId ? present.find((u) => u.id === sharingUserId)?.peerId ?? null : null;

  return (
    <div aria-hidden className="hidden">
      {Array.from(remoteStreams.entries()).map(([peerId, tracks]) => {
        const userId = present.find((u) => u.peerId === peerId)?.id ?? null;
        return (
          <RemoteAudio
            key={peerId}
            tracks={tracks}
            playBroadcast={isWatchingBroadcast && peerId === sharerPeerId}
            volume={userId ? getVolumeFor(userId) : 100}
          />
        );
      })}
    </div>
  );
}

function RemoteAudio({
  tracks,
  playBroadcast,
  volume,
}: {
  tracks: RemotePeerTracks;
  playBroadcast: boolean;
  volume: number;
}) {
  const micRef = useRef<HTMLAudioElement>(null);
  const broadcastRef = useRef<HTMLAudioElement>(null);
  // Faixa isolada (nao a stream inteira, que agora tem mic + video +
  // transmissao juntos vindo de useVoiceMesh) -- a voz toca sempre, pra
  // todo mundo; a transmissao so toca pra quem clicou "entrar".
  const micStream = useMemo(() => (tracks.micTrack ? new MediaStream([tracks.micTrack]) : null), [tracks.micTrack]);
  const broadcastStream = useMemo(
    () => (tracks.broadcastTrack ? new MediaStream([tracks.broadcastTrack]) : null),
    [tracks.broadcastTrack],
  );

  useEffect(() => {
    const el = micRef.current;
    if (!el || !micStream) return;
    el.srcObject = micStream;
    // O atributo autoPlay e "solte e esqueça" — se o navegador bloquear
    // (politica de autoplay) isso falha em silencio, sem erro nenhum em
    // lugar nenhum. Chamando play() na mao a gente pelo menos consegue ver
    // no console quando isso acontece, em vez de só "sem audio, sem pista".
    el.play().catch((err) => {
      console.error("[ActiveCallAudioSink] play() da voz falhou:", err);
    });
  }, [micStream]);

  useEffect(() => {
    const el = broadcastRef.current;
    if (!el || !broadcastStream) return;
    el.srcObject = broadcastStream;
  }, [broadcastStream]);

  useEffect(() => {
    const el = broadcastRef.current;
    if (!el) return;
    if (playBroadcast) {
      el.play().catch((err) => {
        console.error("[ActiveCallAudioSink] play() da transmissão falhou:", err);
      });
    } else {
      el.pause();
    }
  }, [playBroadcast, broadcastStream]);

  useEffect(() => {
    if (broadcastRef.current) broadcastRef.current.volume = Math.max(0, Math.min(100, volume)) / 100;
  }, [volume]);

  return (
    <>
      <audio ref={micRef} autoPlay />
      <audio ref={broadcastRef} />
    </>
  );
}
