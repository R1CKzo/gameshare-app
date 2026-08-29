"use client";

import { useEffect, useMemo, useState } from "react";

import { useActiveCall } from "@/components/call/ActiveCallProvider";
import { useSpeakingDetector } from "@/hooks/useSpeakingDetector";
import { isBetaEnabled } from "@/lib/beta";
import { hideOverlay, isDesktopApp, isOverlayEnabled, showOverlay, syncOverlayState } from "@/lib/desktop";

// Fica montado na raiz igual ActiveCallAudioSink -- so existe pra
// alimentar a janela de sobreposicao em jogo (rota /overlay, ver
// createGameOverlayWindow em desktop/main.js) com quem esta presente,
// mutado e FALANDO agora. A deteccao de "falando" precisa rodar aqui (nao
// dentro do overlay, que e uma janela/processo separado sem acesso as
// faixas de audio de verdade) -- por isso cada participante ganha um
// "probe" escondido que roda o mesmo detector que ParticipantGrid.tsx usa
// pros aneis de fala, e so reporta o resultado pra cima.
export function ActiveCallOverlaySync() {
  const { target, present, currentUserId, remoteStreams, localStream, isMuted, isDeafened, sharingUserId } = useActiveCall();
  const [speakingById, setSpeakingById] = useState<Map<string, boolean>>(new Map());

  const enabled = isDesktopApp() && isBetaEnabled() && isOverlayEnabled();

  useEffect(() => {
    if (!enabled) return;
    if (target) showOverlay();
    else hideOverlay();
  }, [enabled, target]);

  useEffect(() => {
    if (!enabled || !target) return;
    syncOverlayState({
      participants: present.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        image: p.image,
        isMuted: p.id === currentUserId ? isMuted : p.isMuted,
        isDeafened: p.id === currentUserId ? isDeafened : p.isDeafened,
        isSharing: p.id === sharingUserId,
        isSpeaking: speakingById.get(p.id) ?? false,
      })),
    });
  }, [enabled, target, present, currentUserId, isMuted, isDeafened, sharingUserId, speakingById]);

  if (!enabled || !target) return null;

  return (
    <div aria-hidden className="hidden">
      {present.map((p) => (
        <SpeakingProbe
          key={p.id}
          isSelf={p.id === currentUserId}
          muted={p.id === currentUserId ? isMuted : p.isMuted}
          localStream={localStream}
          micTrack={p.peerId ? remoteStreams.get(p.peerId)?.micTrack ?? null : null}
          onChange={(speaking) =>
            setSpeakingById((prev) => {
              if (prev.get(p.id) === speaking) return prev;
              const next = new Map(prev);
              next.set(p.id, speaking);
              return next;
            })
          }
        />
      ))}
    </div>
  );
}

function SpeakingProbe({
  isSelf,
  muted,
  localStream,
  micTrack,
  onChange,
}: {
  isSelf: boolean;
  muted: boolean;
  localStream: MediaStream | null;
  micTrack: MediaStreamTrack | null;
  onChange: (speaking: boolean) => void;
}) {
  const micStream = useMemo(() => (micTrack ? new MediaStream([micTrack]) : null), [micTrack]);
  const speaking = useSpeakingDetector(isSelf ? localStream : micStream, muted);

  useEffect(() => {
    onChange(speaking);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaking]);

  return null;
}
