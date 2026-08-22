import { useEffect, useState } from "react";

// Mede o volume de uma MediaStream via Web Audio (sem nenhum sinal extra
// pela rede) e retorna se a pessoa esta "falando" agora, com uma margem de
// silencio (release) pra o aro nao ficar piscando entre palavras.
const SPEAKING_THRESHOLD = 0.05;
const RELEASE_MS = 300;

export function useSpeakingDetector(stream: MediaStream | null | undefined, muted?: boolean): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || muted || stream.getAudioTracks().length === 0) {
      setSpeaking(false);
      return;
    }

    let cancelled = false;
    let rafId: number;
    let releaseTimeout: ReturnType<typeof setTimeout> | null = null;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    const source = audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      if (cancelled) return;
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const normalized = (data[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);

      if (rms > SPEAKING_THRESHOLD) {
        if (releaseTimeout) {
          clearTimeout(releaseTimeout);
          releaseTimeout = null;
        }
        setSpeaking(true);
      } else if (!releaseTimeout) {
        releaseTimeout = setTimeout(() => setSpeaking(false), RELEASE_MS);
      }

      rafId = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (releaseTimeout) clearTimeout(releaseTimeout);
      source.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [stream, muted]);

  return speaking;
}
