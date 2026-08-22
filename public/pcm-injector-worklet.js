// Reconstitui em uma faixa de audio de verdade o PCM (48kHz/16-bit/
// estereo) que chega em pedacos via IPC do app desktop (audio do sistema
// capturado excluindo a propria chamada — ver
// desktop/native/loopback-helper). Buffer circular de tamanho fixo: O(1)
// por amostra, sem crescer sem limite se os pedacos chegarem mais rapido
// do que o audio toca (o que sobra e descartado, nunca acumula atraso).
class PcmInjectorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 48000 * 2; // ~2s de audio por canal
    this.bufL = new Float32Array(this.capacity);
    this.bufR = new Float32Array(this.capacity);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.available = 0;

    this.port.onmessage = (event) => {
      const int16 = new Int16Array(event.data);
      const frames = int16.length / 2;
      for (let i = 0; i < frames; i++) {
        this.bufL[this.writeIndex] = int16[i * 2] / 32768;
        this.bufR[this.writeIndex] = int16[i * 2 + 1] / 32768;
        this.writeIndex = (this.writeIndex + 1) % this.capacity;
        if (this.available < this.capacity) {
          this.available++;
        } else {
          this.readIndex = (this.readIndex + 1) % this.capacity;
        }
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const chL = output[0];
    const chR = output.length > 1 ? output[1] : null;

    for (let i = 0; i < chL.length; i++) {
      if (this.available > 0) {
        chL[i] = this.bufL[this.readIndex];
        if (chR) chR[i] = this.bufR[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.capacity;
        this.available--;
      } else {
        chL[i] = 0;
        if (chR) chR[i] = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-injector-processor", PcmInjectorProcessor);
