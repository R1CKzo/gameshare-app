// Sons curtos sintetizados na hora via osciladores do Web Audio API — sem
// precisar de nenhum arquivo de audio no repo (nada de licenca, nada de
// asset pra baixar). Reaproveitado tanto pra notificacao de mensagem quanto
// pros sons de entrar/sair da chamada e mutar/desmutar.
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  return audioContext;
}

function playTone(freq: number, duration: number, startAt: number, volume = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startAt;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playMessageSound(): void {
  playTone(880, 0.1, 0);
  playTone(1320, 0.12, 0.08);
}

export function playJoinCallSound(): void {
  playTone(520, 0.09, 0);
  playTone(780, 0.12, 0.07);
}

export function playLeaveCallSound(): void {
  playTone(780, 0.09, 0);
  playTone(520, 0.12, 0.07);
}

export function playMuteSound(muted: boolean): void {
  playTone(muted ? 400 : 620, 0.07, 0, 0.12);
}
