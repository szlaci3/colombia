import { BrowserVoiceAudio, type VoiceAudio } from "./voice-audio";
import { VoiceTranscript } from "./voice-transcript";
import {
  VOICE_SOCKET,
  voiceEventSchema,
  voiceTokenSchema,
  type VoiceMessage,
} from "./voice-protocol";

export type VoiceStatus = "connecting" | "listening" | "speaking" | "stopped";
type Callbacks = {
  onMessage: (message: VoiceMessage) => void;
  onStatus: (status: VoiceStatus) => void;
  onError: (message: string) => void;
};

export class VoiceConversation {
  private active = false;
  private ready = false;
  private playing = false;
  private socket: WebSocket | null = null;
  private abort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private transcript: VoiceTranscript;
  private audio: VoiceAudio;

  constructor(
    private callbacks: Callbacks,
    private dependencies: {
      audio?: VoiceAudio;
      fetcher?: typeof fetch;
      socket?: (url: string) => WebSocket;
    } = {},
  ) {
    this.audio = dependencies.audio ?? new BrowserVoiceAudio();
    this.transcript = new VoiceTranscript(callbacks.onMessage);
  }

  async start() {
    if (this.active) return;
    this.active = true;
    this.callbacks.onStatus("connecting");
    try {
      await this.audio.open(
        (data) => {
          if (!this.active || !this.ready || !data) return;
          if ((this.socket?.bufferedAmount ?? 0) > 256_000) {
            this.fail("The voice connection is too slow. Please start again.");
            return;
          }
          this.send({
            realtimeInput: {
              audio: { data, mimeType: "audio/pcm;rate=16000" },
            },
          });
        },
        (playing) => {
          this.playing = playing;
          if (this.active && this.ready)
            this.callbacks.onStatus(playing ? "speaking" : "listening");
        },
        () =>
          this.fail(
            "Microphone or audio playback stopped. Start again to continue.",
          ),
      );
      if (!this.active) return;
      const response = await (this.dependencies.fetcher ?? fetch)(
        "/api/voice-token",
        {
          method: "POST",
          signal: AbortSignal.any([
            this.abort.signal,
            AbortSignal.timeout(20_000),
          ]),
        },
      );
      const result: unknown = await response.json().catch(() => null);
      if (!this.active) return;
      if (!response.ok) {
        const error =
          result && typeof result === "object" && "error" in result
            ? result.error
            : null;
        throw new Error(
          typeof error === "string"
            ? error
            : "Voice chat is unavailable. Try again later.",
        );
      }
      const { token, setup } = voiceTokenSchema.parse(result);
      const socket = (
        this.dependencies.socket ?? ((url) => new WebSocket(url))
      )(`${VOICE_SOCKET}?access_token=${encodeURIComponent(token)}`);
      this.socket = socket;
      socket.binaryType = "arraybuffer";
      this.timer = setTimeout(
        () => this.fail("Gemini voice setup timed out. Try again."),
        12_000,
      );
      socket.onopen = () => {
        if (this.active) socket.send(JSON.stringify({ setup }));
      };
      socket.onmessage = (event) => {
        if (!this.active) return;
        try {
          const text =
            event.data instanceof ArrayBuffer
              ? new TextDecoder().decode(event.data)
              : event.data;
          if (typeof text !== "string" || text.length > 3_000_000)
            throw new Error();
          const message = voiceEventSchema.parse(JSON.parse(text));
          if (message.error) {
            this.fail(
              "Gemini rejected the voice session. Check model access or try again later.",
            );
            return;
          }
          if (message.setupComplete && !this.ready) {
            clearTimeout(this.timer);
            this.ready = true;
            this.callbacks.onStatus("listening");
          }
          if (message.serverContent && this.ready) {
            const content = message.serverContent;
            this.transcript.receive(content);
            if (content.interrupted) this.audio.interrupt();
            else {
              // Events can contain multiple parts AND both transcripts at once.
              for (const part of content.modelTurn?.parts ?? [])
                if (part.inlineData)
                  this.audio.append(
                    part.inlineData.data,
                    part.inlineData.mimeType ?? "audio/pcm;rate=24000",
                  );
            }
            if (content.turnComplete && !this.playing)
              this.callbacks.onStatus("listening");
          }
          if (message.goAway)
            this.callbacks.onError(
              "This voice connection will end soon. Stop and start again when it ends; your transcript will stay here.",
            );
        } catch {
          this.fail(
            "The voice response could not be read or played. Please start again.",
          );
        }
      };
      socket.onerror = () =>
        this.fail("The Gemini voice connection failed. Please try again.");
      socket.onclose = () =>
        this.fail(
          "The voice connection ended. Start again to continue; your transcript is kept.",
        );
    } catch (error) {
      if (!this.active) return;
      const message =
        error instanceof Error ? error.message : "Voice chat could not start.";
      this.fail(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow it in your browser and start again."
          : error instanceof DOMException && error.name === "NotFoundError"
            ? "No microphone was found. Connect one and try again."
            : message,
      );
    }
  }

  private send(message: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }

  private fail(message: string) {
    if (!this.active) return;
    this.stop("error");
    this.callbacks.onError(message);
  }

  stop(status: "interrupted" | "error" = "interrupted") {
    if (!this.active) return;
    this.active = false;
    this.ready = false;
    clearTimeout(this.timer);
    this.abort.abort();
    if (this.socket) {
      this.socket.onopen =
        this.socket.onmessage =
        this.socket.onerror =
        this.socket.onclose =
          null;
      this.socket.close(1000, "Voice conversation ended");
    }
    this.socket = null;
    this.audio.dispose();
    this.transcript.finish(status);
    this.callbacks.onStatus("stopped");
  }
}
