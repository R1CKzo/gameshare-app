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
  const { remoteStreams, present, sharingUserId, isWatchingBroadcast, getVolumeFor, isDeafened } = useActiveCall();

  const sharerPeerId = sharingUserId ? present.find((u) => u.id === sharingUserId)?.peerId ?? null : null;

  return (
    <div aria-hidden className="hidden">
      {Array.from(remoteStreams.entries()).map(([peerId, tracks]) => {
        const userId = present.find((u) => u.peerId === peerId)?.id ?? null;
        return (
          <RemoteAudio
            key={peerId}
            tracks={tracks}
            playMic={!isDeafened}
            playBroadcast={!isDeafened && isWatchingBroadcast && peerId === sharerPeerId}
            volume={userId ? getVolumeFor(userId) : 100}
          />
        );
      })}
    </div>
  );
}

function RemoteAudio({
  tracks,
  playMic,
  playBroadcast,
  volume,
}: {
  tracks: RemotePeerTracks;
  playMic: boolean;
  playBroadcast: boolean;
  volume: number;
}) {
  const micRef = useRef<HTMLAudioElement>(null);
  const broadcastRef = useRef<HTMLAudioElement>(null);
  // Faixa isolada (nao a stream inteira, que agora tem mic + video +
  // transmissao juntos vindo de useVoiceMesh) -- a voz toca pra todo
  // mundo (a menos que eu tenha me silenciado geral -- ver isDeafened em
  // ActiveCallProvider); a transmissao so toca pra quem clicou "entrar" E
  // nao estiver silenciado.
  const micStream = useMemo(() => (tracks.micTrack ? new MediaStream([tracks.micTrack]) : null), [tracks.micTrack]);
  const broadcastStream = useMemo(
    () => (tracks.broadcastTrack ? new MediaStream([tracks.broadcastTrack]) : null),
    [tracks.broadcastTrack],
  );

  useEffect(() => {
    const el = micRef.current;
    if (!el || !micStream) return;
    el.srcObject = micStream;
  }, [micStream]);

  useEffect(() => {
    const el = micRef.current;
    if (!el) return;
    if (playMic) {
      // Chamando play() na mao (em vez de so confiar no autoPlay) a gente
      // consegue ver no console se o navegador bloquear por politica de
      // autoplay, em vez de só "sem audio, sem pista".
      el.play().catch((err) => {
        console.error("[ActiveCallAudioSink] play() da voz falhou:", err);
      });
    } else {
      el.pause();
    }
  }, [playMic, micStream]);

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
      <audio ref={micRef} />
      <audio ref={broadcastRef} />
    </>
  );
}
