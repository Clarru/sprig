import { type DebugSettings } from "./debug-types";
/** Detect utterance boundaries in PCM16 locally; this transcription model has no server VAD. */
export class AudioSegmenter {
  private prefix = Buffer.alloc(0);
  private active = false;
  private quietSamples = 0;
  private utteranceSamples = 0;
  constructor(
    private append: (audio: Buffer) => void,
    private commit: () => void,
    private threshold = 0.008,
    private observe: (rms: number, speaking: boolean) => void = () => {},
  ) {}
  private pauseMs = 700;
  private continuous = false;
  configure(settings: DebugSettings) {
    this.threshold = settings.threshold;
    this.pauseMs = settings.pauseMs;
    this.continuous = settings.continuous;
  }
  flush() {
    if (!this.active) return false;
    this.commit();
    this.active = false;
    this.quietSamples = 0;
    this.utteranceSamples = 0;
    return true;
  }
  push(audio: Buffer) {
    if (!audio.length || audio.length % 2) return;
    const samples = audio.length / 2;
    let energy = 0;
    for (let i = 0; i < audio.length; i += 2) {
      const value = audio.readInt16LE(i) / 32768;
      energy += value * value;
    }
    const rms = Math.sqrt(energy / samples);
    const speaking = rms >= this.threshold;
    this.observe(rms, speaking);
    if (!this.active) {
      if (!speaking && !this.continuous) {
        // Keep 300 ms before speech so initial consonants are not clipped.
        this.prefix = Buffer.concat([this.prefix, audio]).subarray(-14400);
        return;
      }
      this.active = true;
      if (this.prefix.length) this.append(this.prefix);
      this.utteranceSamples = this.prefix.length / 2;
      this.prefix = Buffer.alloc(0);
    }
    this.append(audio);
    this.utteranceSamples += samples;
    this.quietSamples = speaking ? 0 : this.quietSamples + samples;
    // Commit after 700 ms of quiet, or split a continuous explanation every 20 s.
    if (
      this.quietSamples >= 24 * this.pauseMs ||
      this.utteranceSamples >= 480000
    ) {
      this.commit();
      this.active = false;
      this.quietSamples = 0;
      this.utteranceSamples = 0;
    }
  }
}
