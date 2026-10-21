import captureUrl from "./voice-capture.worklet.js?url";

// Keep the fractional position between batches (including at 44.1 kHz).
export class PcmEncoder {
  private position = 0;
  private sum = 0;
  private count = 0;

  encode(input: Float32Array, sourceRate: number): string {
    const output: number[] = [];
    for (const value of input) {
      this.sum += value;
      this.count++;
      this.position += 16_000;
      if (this.position >= sourceRate) {
        this.position -= sourceRate;
        const sample = Math.max(-1, Math.min(1, this.sum / this.count));
        const pcm = Math.round(sample * (sample < 0 ? 32768 : 32767));
        output.push(pcm & 255, (pcm >> 8) & 255);
        this.sum = 0;
        this.count = 0;
      }
    }
    let binary = "";
    for (const byte of output) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
}

export function decodePcm(data: string, mimeType: string) {
  if (!/^audio\/pcm(?:;|$)/.test(mimeType) || data.length > 2_000_000)
    throw new Error("Gemini returned an unsupported audio format.");
  const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1] ?? 24_000);
  if (rate < 8000 || rate > 48000)
    throw new Error("Gemini returned an invalid audio sample rate.");
  const binary = atob(data);
  if (!binary.length || binary.length % 2)
    throw new Error("Gemini returned invalid PCM audio.");
  const samples = new Float32Array(binary.length / 2);
  for (let i = 0; i < samples.length; i++) {
    const value =
      binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
    samples[i] = (value >= 32768 ? value - 65536 : value) / 32768;
  }
  return { samples, rate };
}

export interface VoiceAudio {
  open(
    capture: (data: string) => void,
    playback: (playing: boolean) => void,
    failure: () => void,
  ): Promise<void>;
  append(data: string, mimeType: string): void;
  interrupt(): void;
  dispose(): void;
}

// Adapted from Talker's DialogAudio scheduling, with AudioWorklet microphone capture.
export class BrowserVoiceAudio implements VoiceAudio {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private capture: AudioWorkletNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private disposed = false;
  private playback: (playing: boolean) => void = () => {};

  async open(
    capture: (data: string) => void,
    playback: (playing: boolean) => void,
    failure: () => void,
  ) {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext)
      throw new Error(
        "Voice chat needs HTTPS or localhost and microphone support.",
      );
    this.playback = playback;
    // Resume directly from the Start click, before permission/network awaits.
    const context = new AudioContext();
    this.context = context;
    await context.resume();
    if (this.disposed) return;
    if (!context.audioWorklet)
      throw new Error("This browser does not support live microphone audio.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (this.disposed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (!this.disposed) failure();
      };
    });
    await context.audioWorklet.addModule(captureUrl);
    if (this.disposed) return;
    const encoder = new PcmEncoder();
    const node = new AudioWorkletNode(context, "formlane-voice-capture");
    this.capture = node;
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!this.disposed)
        capture(encoder.encode(event.data, context.sampleRate));
    };
    this.source = context.createMediaStreamSource(stream);
    this.source.connect(node);
    // The processor's output is silence; connecting keeps capture running.
    node.connect(context.destination);
    context.onstatechange = () => {
      if (!this.disposed && context.state === "suspended") failure();
    };
  }

  append(data: string, mimeType: string) {
    const context = this.context;
    if (!context || this.disposed) return;
    const { samples, rate } = decodePcm(data, mimeType);
    if (this.nextTime - context.currentTime > 30)
      throw new Error(
        "Voice playback fell behind. Stop and start a new conversation.",
      );
    const buffer = context.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      if (!this.sources.size) this.playback(false);
    };
    const start = Math.max(context.currentTime + 0.015, this.nextTime);
    source.start(start);
    this.nextTime = start + buffer.duration;
    this.playback(true);
  }

  interrupt() {
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    this.nextTime = 0;
    this.playback(false);
  }

  dispose() {
    this.disposed = true;
    this.interrupt();
    if (this.capture) this.capture.port.onmessage = null;
    this.capture?.disconnect();
    this.capture?.port.close();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => {});
    }
    this.context = null;
    this.stream = null;
  }
}
