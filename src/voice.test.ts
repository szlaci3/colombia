import { afterEach, describe, expect, it, vi } from "vitest";
import { PcmEncoder, decodePcm, type VoiceAudio } from "./voice-audio";
import { VoiceConversation } from "./voice";
import { VoiceTranscript } from "./voice-transcript";
import { voiceSetup, type VoiceMessage } from "./voice-protocol";

function transcriptStore() {
  const messages: VoiceMessage[] = [];
  const publish = (message: VoiceMessage) => {
    const index = messages.findIndex((value) => value.id === message.id);
    if (index < 0) messages.push(message);
    else messages[index] = message;
  };
  return { messages, publish };
}

describe("Dialog transcripts", () => {
  it("keeps both speakers in chronological order across streamed turns", () => {
    const { messages, publish } = transcriptStore();
    const transcript = new VoiceTranscript(publish);
    transcript.receive({ inputTranscription: { text: "Hello" } });
    transcript.receive({
      inputTranscription: { text: " there." },
      outputTranscription: { text: "Hi" },
    });
    transcript.receive({
      outputTranscription: { text: " again." },
      turnComplete: true,
    });
    transcript.receive({ inputTranscription: { text: "Second question" } });
    transcript.receive({
      outputTranscription: { text: "Second reply" },
      turnComplete: true,
    });
    expect(
      messages.map(({ role, text, status }) => [role, text, status]),
    ).toEqual([
      ["user", "Hello there.", "complete"],
      ["assistant", "Hi again.", "complete"],
      ["user", "Second question", "complete"],
      ["assistant", "Second reply", "complete"],
    ]);
  });

  it("fills the reserved user position when input arrives after the reply is complete", () => {
    const { messages, publish } = transcriptStore();
    const transcript = new VoiceTranscript(publish);
    transcript.receive({
      outputTranscription: { text: "A reply" },
      turnComplete: true,
    });
    transcript.receive({
      inputTranscription: { text: "The delayed question" },
    });
    transcript.receive({ inputTranscription: { text: "The next question" } });
    transcript.receive({
      outputTranscription: { text: "Another reply" },
      turnComplete: true,
    });
    expect(messages.map((value) => value.text)).toEqual([
      "The delayed question",
      "A reply",
      "The next question",
      "Another reply",
    ]);
  });

  it("retains interrupted content and does not finish the new utterance on an old turnComplete", () => {
    const { messages, publish } = transcriptStore();
    const transcript = new VoiceTranscript(publish);
    transcript.receive({
      inputTranscription: { text: "First question" },
      outputTranscription: { text: "Partial" },
    });
    transcript.receive({
      interrupted: true,
      inputTranscription: { text: "Wait" },
    });
    transcript.receive({ turnComplete: true });
    transcript.receive({
      inputTranscription: { text: ", a correction." },
      outputTranscription: { text: "Understood" },
      turnComplete: true,
    });
    expect(messages.map(({ text, status }) => [text, status])).toEqual([
      ["First question", "complete"],
      ["Partial", "interrupted"],
      ["Wait, a correction.", "complete"],
      ["Understood", "complete"],
    ]);
  });
});

describe("native PCM audio", () => {
  it("encodes clipped signed little-endian audio at 16 kHz without fractional batch drift", () => {
    const encoder = new PcmEncoder();
    const counts = Array.from(
      { length: 100 },
      () =>
        atob(encoder.encode(new Float32Array(441).fill(0.5), 44100)).length / 2,
    );
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(16000);
    const bytes = atob(
      new PcmEncoder().encode(new Float32Array([-2, 2]), 16000),
    );
    expect([...bytes].map((c) => c.charCodeAt(0))).toEqual([0, 128, 255, 127]);
    const decoded = decodePcm(btoa(bytes), "audio/pcm;rate=24000");
    expect(decoded.rate).toBe(24000);
    expect(decoded.samples[0]).toBe(-1);
    expect(decoded.samples[1]).toBeCloseTo(1);
  });
  it("rejects compressed, odd-sized, oversized, and invalid-rate audio", () => {
    for (const [data, mime] of [
      ["AA==", "audio/pcm"],
      ["AAAA", "audio/mp3"],
      ["AAAA", "audio/pcm;rate=1"],
      ["a".repeat(2_000_001), "audio/pcm"],
    ])
      expect(() => decodePcm(data, mime)).toThrow();
  });
});

function harness(open?: VoiceAudio["open"]) {
  let capture: (data: string) => void = () => {};
  let playback: (value: boolean) => void = () => {};
  const audio = {
    open:
      open ??
      vi.fn(async (onCapture, onPlayback) => {
        capture = onCapture;
        playback = onPlayback;
      }),
    append: vi.fn(() => playback(true)),
    interrupt: vi.fn(() => playback(false)),
    dispose: vi.fn(),
  } satisfies VoiceAudio;
  const socket = {
    readyState: 1,
    bufferedAmount: 0,
    send: vi.fn(),
    close: vi.fn(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  } as unknown as WebSocket;
  const store = transcriptStore();
  const onStatus = vi.fn();
  const onError = vi.fn();
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ token: "auth_tokens/test", setup: voiceSetup }),
    );
  const client = new VoiceConversation(
    { onMessage: store.publish, onStatus, onError },
    { audio, fetcher, socket: () => socket },
  );
  const receive = (value: unknown, binary = false) =>
    socket.onmessage?.({
      data: binary
        ? new TextEncoder().encode(JSON.stringify(value)).buffer
        : JSON.stringify(value),
    } as MessageEvent);
  return {
    ...store,
    client,
    audio,
    socket,
    onError,
    onStatus,
    fetcher,
    receive,
    capture: (data: string) => capture(data),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("native Dialog lifecycle", () => {
  it("waits for setupComplete, sends continuous audio, processes every output part and both transcripts", async () => {
    vi.stubGlobal("WebSocket", { OPEN: 1 });
    const h = harness();
    await h.client.start();
    h.capture("AAAA");
    expect(h.socket.send).not.toHaveBeenCalled();
    h.socket.onopen?.({} as Event);
    expect(h.socket.send).toHaveBeenLastCalledWith(
      JSON.stringify({ setup: voiceSetup }),
    );
    h.receive({ setupComplete: {} }, true);
    h.capture("AAAA");
    expect(h.socket.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        realtimeInput: {
          audio: { data: "AAAA", mimeType: "audio/pcm;rate=16000" },
        },
      }),
    );
    h.receive({
      serverContent: {
        inputTranscription: { text: "Hello" },
        outputTranscription: { text: "Hi!" },
        modelTurn: {
          parts: [
            { inlineData: { data: "AAAA", mimeType: "audio/pcm;rate=24000" } },
            { inlineData: { data: "BBBB", mimeType: "audio/pcm;rate=24000" } },
          ],
        },
        turnComplete: true,
      },
    });
    expect(h.audio.append).toHaveBeenCalledTimes(2);
    expect(h.messages.map((message) => message.text)).toEqual(["Hello", "Hi!"]);
    expect(h.onStatus).toHaveBeenLastCalledWith("speaking");
    h.receive({ serverContent: { interrupted: true, turnComplete: true } });
    expect(h.audio.interrupt).toHaveBeenCalledOnce();
    h.client.stop();
    expect(h.socket.close).toHaveBeenCalledOnce();
    expect(h.audio.dispose).toHaveBeenCalledOnce();
  });

  it("cancels pending microphone startup and ignores late completion", async () => {
    let resolve!: () => void;
    const h = harness(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const start = h.client.start();
    h.client.stop();
    resolve();
    await start;
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.audio.dispose).toHaveBeenCalledOnce();
  });

  it("stops and retains text on malformed responses, without relaying provider messages", async () => {
    const h = harness();
    await h.client.start();
    h.receive({ setupComplete: {} });
    h.receive({
      serverContent: {
        inputTranscription: { text: "Keep this" },
        outputTranscription: { text: "Partial reply" },
      },
    });
    h.receive({ error: { message: "secret provider details", code: 403 } });
    expect(h.audio.dispose).toHaveBeenCalledOnce();
    expect(h.messages[1]).toMatchObject({
      text: "Partial reply",
      status: "error",
    });
    expect(h.onError.mock.calls.flat().join(" ")).not.toContain("secret");
  });

  it("times out setup and aborts a stalled connection", async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.client.start();
    await vi.advanceTimersByTimeAsync(12001);
    expect(h.onError).toHaveBeenCalledWith(
      expect.stringContaining("timed out"),
    );
    expect(h.audio.dispose).toHaveBeenCalledOnce();
  });
});
