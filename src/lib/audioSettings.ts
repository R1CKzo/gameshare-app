// Preferencias de audio do microfone, salvas so no navegador (por
// dispositivo, sem precisar sincronizar com o servidor). Aplicadas como
// constraints do getUserMedia e como um gate de ruido local toda vez que a
// pessoa entra numa chamada.
export type AudioSettings = {
  noiseSuppression: boolean;
  // Qual mecanismo faz a supressao quando noiseSuppression esta ligado.
  // "browser": supressao nativa do navegador (constraint do getUserMedia,
  // comportamento de sempre). "rnnoise": modelo de rede neural (RNNoise,
  // via @sapphi-red/web-noise-suppressor) que roda por cima da faixa do
  // microfone, mais robusto pra separar voz de ruido de teclado/fundo (ver
  // AudioTab em SettingsButton.tsx).
  noiseSuppressionModel: "browser" | "rnnoise";
  echoCancellation: boolean;
  autoGainControl: boolean;
  deviceId: string | null;
  // 0-100: quao facil o gate abre. Baixo = so deixa passar voz alta (corta
  // ruido/eco de fundo), alto = pega ate som baixinho.
  sensitivity: number;
  // App de desktop, beta: microfone comeca mudo e so abre enquanto o
  // atalho de push-to-talk esta sendo segurado (ver ActiveCallProvider.tsx
  // e desktop/main.js).
  pushToTalkEnabled: boolean;
};

const STORAGE_KEY = "gameshare:audioSettings";

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  noiseSuppression: true,
  noiseSuppressionModel: "browser",
  echoCancellation: true,
  autoGainControl: true,
  deviceId: null,
  sensitivity: 50,
  pushToTalkEnabled: false,
};

export function loadAudioSettings(): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      noiseSuppression: parsed.noiseSuppression ?? DEFAULT_AUDIO_SETTINGS.noiseSuppression,
      noiseSuppressionModel:
        parsed.noiseSuppressionModel === "rnnoise" ? "rnnoise" : DEFAULT_AUDIO_SETTINGS.noiseSuppressionModel,
      echoCancellation: parsed.echoCancellation ?? DEFAULT_AUDIO_SETTINGS.echoCancellation,
      autoGainControl: parsed.autoGainControl ?? DEFAULT_AUDIO_SETTINGS.autoGainControl,
      deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : DEFAULT_AUDIO_SETTINGS.deviceId,
      sensitivity: typeof parsed.sensitivity === "number" ? parsed.sensitivity : DEFAULT_AUDIO_SETTINGS.sensitivity,
      pushToTalkEnabled:
        typeof parsed.pushToTalkEnabled === "boolean"
          ? parsed.pushToTalkEnabled
          : DEFAULT_AUDIO_SETTINGS.pushToTalkEnabled,
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function saveAudioSettings(settings: AudioSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getMicConstraints(settings: AudioSettings): MediaTrackConstraints {
  return {
    // Quando o modelo e "rnnoise", a supressao nativa do navegador fica
    // desligada aqui — o RNNoise processa a faixa depois (ver
    // createMicPipeline em useVoiceMesh.ts), e rodar os dois juntos so
    // arrisca artefato sem ganho real.
    noiseSuppression: settings.noiseSuppression && settings.noiseSuppressionModel === "browser",
    echoCancellation: settings.echoCancellation,
    autoGainControl: settings.autoGainControl,
    ...(settings.deviceId ? { deviceId: { exact: settings.deviceId } } : {}),
  };
}

// RMS (0-1) que o gate de ruido usa como limiar pra "abrir". Sensibilidade
// 0 exige uma voz bem alta pra passar (corta praticamente tudo que nao for
// fala direta); 100 deixa passar quase qualquer som captado pelo mic.
export function sensitivityToGateThreshold(sensitivity: number): number {
  const clamped = Math.min(100, Math.max(0, sensitivity));
  const HIGH = 0.12;
  const LOW = 0.004;
  return HIGH - (clamped / 100) * (HIGH - LOW);
}
