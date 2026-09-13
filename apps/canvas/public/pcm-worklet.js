// AudioContext runs at 24 kHz. Batch mono PCM16 into 100 ms packets.
class CanvasPCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(2400);
    this.offset = 0;
    this.energy = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      const s = Math.max(-1, Math.min(1, sample));
      this.buffer[this.offset++] = s < 0 ? s * 32768 : s * 32767;
      this.energy += s * s;
      if (this.offset === this.buffer.length) {
        const packet = this.buffer;
        this.port.postMessage(
          {
            audio: packet.buffer,
            rms: Math.sqrt(this.energy / this.offset),
            level: Math.min(1, Math.sqrt(this.energy / this.offset) * 5),
          },
          [packet.buffer],
        );
        this.buffer = new Int16Array(2400);
        this.offset = 0;
        this.energy = 0;
      }
    }
    return true;
  }
}
registerProcessor("canvas-pcm", CanvasPCM);
