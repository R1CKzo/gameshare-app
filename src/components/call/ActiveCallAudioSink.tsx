"use client";

import { useEffect, useRef } from "react";

import { useActiveCall } from "@/components/call/ActiveCallProvider";

// Os elementos <audio> que realmente tocam a voz dos outros participantes
// moram aqui, fora de qualquer tela de canal/DM — montados direto na raiz,
// sempre presentes enquanto a chamada estiver ativa. Antes eles viviam
// dentro do ParticipantGrid, que so existe na propria tela da chamada: ao
// navegar pra outra pagina esses elementos somem, a malha WebRTC continua
// viva mas ninguem mais toca o audio recebido — dava a impressao de ter
// saido da call mesmo continuando conectado.
export function ActiveCallAudioSink() {
  const { remoteStreams } = useActiveCall();

  return (
    <div aria-hidden className="hidden">
      {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
        <RemoteAudio key={peerId} stream={stream} />
      ))}
    </div>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    // O atributo autoPlay e "solte e esqueça" — se o navegador bloquear
    // (politica de autoplay) isso falha em silencio, sem erro nenhum em
    // lugar nenhum. Chamando play() na mao a gente pelo menos consegue ver
    // no console quando isso acontece, em vez de só "sem audio, sem pista".
    el.play().catch((err) => {
      console.error("[ActiveCallAudioSink] play() falhou:", err);
    });
  }, [stream]);

  return <audio ref={ref} autoPlay />;
}
