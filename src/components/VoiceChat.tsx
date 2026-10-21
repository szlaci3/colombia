import { useEffect, useRef, useState } from "react";
import { AudioLines, Square } from "lucide-react";
import { Dialog } from "./Dialog";
import { VoiceConversation, type VoiceStatus } from "../voice";
import type { VoiceMessage } from "../voice-protocol";

export function VoiceChat({
  messages,
  onMessage,
  close,
}: {
  messages: VoiceMessage[];
  onMessage: (message: VoiceMessage) => void;
  close: () => void;
}) {
  const [availability, setAvailability] = useState<
    "checking" | "ready" | "disabled" | "error"
  >("checking");
  const [status, setStatus] = useState<VoiceStatus>("stopped");
  const [error, setError] = useState("");
  const controller = useRef<VoiceConversation | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const messageCallback = useRef(onMessage);
  messageCallback.current = onMessage;

  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/voice-token", {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10_000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (typeof data?.enabled !== "boolean") throw new Error();
        if (!abort.signal.aborted)
          setAvailability(data.enabled ? "ready" : "disabled");
      })
      .catch(() => {
        if (!abort.signal.aborted) setAvailability("error");
      });
    const end = () => controller.current?.stop();
    window.addEventListener("pagehide", end);
    return () => {
      abort.abort();
      window.removeEventListener("pagehide", end);
      controller.current?.stop();
      controller.current = null;
    };
  }, []);

  useEffect(() => {
    if (follow.current && log.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);

  function stop() {
    controller.current?.stop();
    controller.current = null;
  }

  function start() {
    setError("");
    controller.current?.stop();
    const next = new VoiceConversation({
      onMessage: (message) => messageCallback.current(message),
      onStatus: (value) => {
        if (controller.current === next) setStatus(value);
      },
      onError: (message) => {
        if (controller.current === next) setError(message);
      },
    });
    controller.current = next;
    void next.start();
  }

  const active = status !== "stopped";
  const label =
    status === "connecting"
      ? "Connecting…"
      : status === "speaking"
        ? "Gemini is speaking"
        : active
          ? "Listening — you can speak"
          : "Ready when you are";
  return (
    <Dialog
      title="Dialog"
      close={() => {
        stop();
        close();
      }}
      wide
    >
      <div className="voice-chat">
        <p className="dialog-description">
          Talk naturally with Gemini. It hears you and speaks back
          automatically. Your words and its replies appear below, with the
          newest message at the bottom.
        </p>
        <p className="dialog-fineprint">
          Starting sends microphone audio directly to Google Gemini. Transcripts
          stay on this page until you reload; they are not saved in your
          project. This conversation has no access to your project or
          application tools.
        </p>
        <div className="voice-status" role="status">
          {availability === "checking"
            ? "Checking voice availability…"
            : availability === "disabled"
              ? "Dialog is not enabled on this deployment yet."
              : availability === "error"
                ? "Voice availability could not be checked. Close and reopen to retry."
                : label}
        </div>
        <div className="voice-controls">
          {active ? (
            <>
              <button className="button dark" onClick={stop}>
                <Square size={15} /> End Dialog
              </button>
            </>
          ) : (
            <button
              className="button dark"
              disabled={availability !== "ready"}
              onClick={start}
            >
              <AudioLines size={15} /> Start Dialog
            </button>
          )}
        </div>
        {error && (
          <p className="voice-error" role="alert">
            {error}
          </p>
        )}
        <div
          className="voice-transcript"
          aria-label="Voice transcript"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          ref={log}
          tabIndex={0}
          onScroll={() => {
            const node = log.current;
            if (node)
              follow.current =
                node.scrollHeight - node.scrollTop - node.clientHeight < 60;
          }}
        >
          {messages
            .filter(
              (message) =>
                message.text ||
                (message.role === "assistant" &&
                  message.status === "streaming"),
            )
            .map((message) => (
              <article
                key={message.id}
                className={`voice-message voice-${message.role}`}
              >
                <strong>{message.role === "user" ? "You" : "Gemini"}</strong>
                <p>{message.text || "Waiting for the voice transcript…"}</p>
                {message.status === "interrupted" && <small>Interrupted</small>}
                {message.status === "error" && <small>Connection ended</small>}
              </article>
            ))}
        </div>
        {!messages.some((message) => message.text) && (
          <p className="voice-empty">
            Start the conversation, then speak. Pause to let Gemini reply. You
            can speak again to interrupt.
          </p>
        )}
        <p className="dialog-fineprint">
          Stopping or closing releases the microphone and keeps the transcript.
          Starting again opens a fresh conversation with Gemini.
        </p>
      </div>
    </Dialog>
  );
}
