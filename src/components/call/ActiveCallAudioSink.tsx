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
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return <audio ref={ref} autoPlay />;
}
