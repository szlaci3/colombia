import type { VoiceEvent, VoiceMessage } from "./voice-protocol";

type Turn = { user: VoiceMessage; assistant: VoiceMessage };

// Reserve a user position before its reply: input transcription may arrive late.
export class VoiceTranscript {
  private current: Turn | null = null;
  private lateInput: Turn | null = null;
  private interruptedBoundary = false;

  constructor(private publish: (message: VoiceMessage) => void) {}

  private ensure() {
    if (!this.current) {
      this.current = {
        user: {
          id: crypto.randomUUID(),
          role: "user",
          text: "",
          status: "streaming",
        },
        assistant: {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "",
          status: "streaming",
        },
      };
      this.publish({ ...this.current.user });
      this.publish({ ...this.current.assistant });
    }
    return this.current;
  }

  receive(content: NonNullable<VoiceEvent["serverContent"]>) {
    // A final output fragment in an interruption event still belongs to the old reply.
    const output = content.outputTranscription?.text;
    if (output) {
      const turn = this.ensure();
      turn.assistant.text += output;
      this.publish({ ...turn.assistant });
    }
    if (content.modelTurn?.parts.some((part) => part.inlineData)) this.ensure();
    if (content.interrupted) {
      this.finish("interrupted");
      this.lateInput = null;
      this.interruptedBoundary = true;
    }
    const input = content.inputTranscription?.text;
    if (input) {
      const turn = this.lateInput ?? this.ensure();
      turn.user.text += input;
      this.publish({ ...turn.user });
      this.lateInput = null;
    }
    if (content.turnComplete) {
      // interrupted → turnComplete can straddle the next input transcript.
      if (this.interruptedBoundary) this.interruptedBoundary = false;
      else this.finish("complete");
    }
  }

  finish(status: VoiceMessage["status"]) {
    const turn = this.current;
    if (!turn) return;
    turn.user.status = "complete";
    turn.assistant.status = status;
    this.publish({ ...turn.user });
    this.publish({ ...turn.assistant });
    this.current = null;
    this.lateInput = status === "complete" && !turn.user.text ? turn : null;
  }
}
