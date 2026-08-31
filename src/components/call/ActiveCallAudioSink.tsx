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
  const {
    remoteStreams,
    present,
    sharingUserId,
    isWatchingBroadcast,
    getVolumeFor,
    getMicVolumeFor,
    isLocallyMuted,
    isDeafened,
  } = useActiveCall();

  const sharerPeerId = sharingUserId ? present.find((u) => u.id === sharingUserId)?.peerId ?? null : null;

  return (
    <div aria-hidden className="hidden">
      {Array.from(remoteStreams.entries()).map(([peerId, tracks]) => {
        const userId = present.find((u) => u.peerId === peerId)?.id ?? null;
        return (
          <RemoteAudio
            key={peerId}
            tracks={tracks}
            playMic={!isDeafened && !(userId && isLocallyMuted(userId))}
            playBroadcast={!isDeafened && isWatchingBroadcast && peerId === sharerPeerId}
            volume={userId ? getVolumeFor(userId) : 100}
            micVolume={userId ? getMicVolumeFor(userId) : 100}
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
  micVolume,
}: {
  tracks: RemotePeerTracks;
  playMic: boolean;
  playBroadcast: boolean;
  volume: number;
  micVolume: number;
}) {
  const broadcastRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
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

  // A voz toca via Web Audio (GainNode) em vez de <audio>.volume -- o
  // volume de elemento de audio trava em 100% (o navegador recusa valor
  // maior), e o "Volume do usuario" no menu de cada pessoa (ver
  // VoiceUserMenu.tsx) precisa amplificar ate 200%.
  useEffect(() => {
    if (!micStream) return;
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    const source = ctx.createMediaStreamSource(micStream);
    source.connect(gain);
    gain.connect(ctx.destination);
    audioCtxRef.current = ctx;
    gainRef.current = gain;
    ctx.resume().catch((err) => {
      console.error("[ActiveCallAudioSink] resume() da voz falhou:", err);
    });
    return () => {
      source.disconnect();
      gain.disconnect();
      ctx.close().catch(() => {});
      audioCtxRef.current = null;
      gainRef.current = null;
    };
  }, [micStream]);

  useEffect(() => {
    if (!gainRef.current) return;
    gainRef.current.gain.value = playMic ? Math.max(0, micVolume) / 100 : 0;
  }, [playMic, micVolume]);

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

  return <audio ref={broadcastRef} />;
}
