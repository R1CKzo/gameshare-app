// Preferencias de audio do microfone, salvas so no navegador (por
// dispositivo, sem precisar sincronizar com o servidor). Aplicadas como
// constraints do getUserMedia toda vez que a pessoa entra numa chamada.
export type AudioSettings = {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
};

const STORAGE_KEY = "gameshare:audioSettings";

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

export function loadAudioSettings(): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      noiseSuppression: parsed.noiseSuppression ?? DEFAULT_AUDIO_SETTINGS.noiseSuppression,
      echoCancellation: parsed.echoCancellation ?? DEFAULT_AUDIO_SETTINGS.echoCancellation,
      autoGainControl: parsed.autoGainControl ?? DEFAULT_AUDIO_SETTINGS.autoGainControl,
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
    noiseSuppression: settings.noiseSuppression,
    echoCancellation: settings.echoCancellation,
    autoGainControl: settings.autoGainControl,
  };
}
