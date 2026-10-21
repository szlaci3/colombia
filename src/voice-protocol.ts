import { z } from "zod";

export const VOICE_MODEL = "gemini-3.8-live";
export const VOICE_SOCKET =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

export const voiceSetup = {
  model: `models/${VOICE_MODEL}`,
  generationConfig: {
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
    },
  },
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  contextWindowCompression: { slidingWindow: {} },
  systemInstruction: {
    parts: [
      {
        text: "You are a helpful voice conversation partner in Formlane. Reply concisely and naturally in the user's language. You do not have access to the screen, project, documentation, or application tools. Never claim to have inspected or changed anything in Formlane. Ask for clarification when needed.",
      },
    ],
  },
};

export const voiceTokenSchema = z.object({
  token: z.string().startsWith("auth_tokens/").max(4096),
  // The complete setup is locked server-side when issuing the token.
  setup: z.object({ model: z.literal(`models/${VOICE_MODEL}`) }).passthrough(),
});

const transcription = z.object({ text: z.string().optional() });
export const voiceEventSchema = z.object({
  setupComplete: z.object({}).optional(),
  error: z.object({ code: z.number().optional() }).passthrough().optional(),
  goAway: z.object({}).passthrough().optional(),
  serverContent: z
    .object({
      inputTranscription: transcription.optional(),
      outputTranscription: transcription.optional(),
      interrupted: z.boolean().optional(),
      turnComplete: z.boolean().optional(),
      generationComplete: z.boolean().optional(),
      modelTurn: z
        .object({
          parts: z.array(
            z.object({
              inlineData: z
                .object({ data: z.string(), mimeType: z.string().optional() })
                .optional(),
            }),
          ),
        })
        .optional(),
    })
    .optional(),
});
export type VoiceEvent = z.infer<typeof voiceEventSchema>;
export type VoiceMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "streaming" | "complete" | "interrupted" | "error";
};
