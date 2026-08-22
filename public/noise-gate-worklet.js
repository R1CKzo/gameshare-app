// Gate de ruido rodando na thread de audio dedicada (AudioWorklet), nao na
// thread principal do navegador. A primeira versao disso usava
// ScriptProcessorNode, que roda na thread principal — qualquer coisa que
// travasse o React por alguns milissegundos (um re-render, o poll de
// presenca, etc) atrasava o processamento de audio e causava estalos/
// gagueira exatamente como "audio repetindo". Aqui isso nao acontece.
//
// Tambem usa histerese (limiar pra abrir mais alto que o limiar pra
// fechar) pra nao ficar "chacoalhando" ligado/desligado quando o volume
// fica bem em cima do limiar, e coeficientes de ataque/liberacao baseados
// em tempo real (ms), nao um numero arbitrario por amostra — a versao
// antiga convergia em menos de 1ms, o que gera cliques audiveis toda vez
// que o gate abre ou fecha.
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const threshold = options.processorOptions?.threshold ?? 0.02;
    this.openThreshold = threshold;
    this.closeThreshold = threshold * 0.6;
    this.envelope = 0;
    this.isOpen = false;

    // Coeficientes por amostra derivados de constantes de tempo (5ms de
    // ataque, 180ms de liberacao) a 48kHz — se a taxa real for outra o
    // efeito muda pouco, nao precisa ser exato.
    const sr = sampleRate;
    this.attackCoeff = 1 - Math.exp(-1 / (0.005 * sr));
    this.releaseCoeff = 1 - Math.exp(-1 / (0.18 * sr));

    this.port.onmessage = (event) => {
      if (typeof event.data?.threshold === "number") {
        this.openThreshold = event.data.threshold;
        this.closeThreshold = event.data.threshold * 0.6;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output || output.length === 0) return true;
    const inCh = input[0];
    const outCh = output[0];
    if (!inCh || !outCh) return true;

    let sumSquares = 0;
    for (let i = 0; i < inCh.length; i++) sumSquares += inCh[i] * inCh[i];
    const rms = Math.sqrt(sumSquares / inCh.length);

    if (this.isOpen) {
      if (rms < this.closeThreshold) this.isOpen = false;
    } else if (rms > this.openThreshold) {
      this.isOpen = true;
    }
    const target = this.isOpen ? 1 : 0;
    const coeff = target > this.envelope ? this.attackCoeff : this.releaseCoeff;

    for (let i = 0; i < inCh.length; i++) {
      this.envelope += (target - this.envelope) * coeff;
      outCh[i] = inCh[i] * this.envelope;
    }
    return true;
  }
}

registerProcessor("noise-gate-processor", NoiseGateProcessor);
