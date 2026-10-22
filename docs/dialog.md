# Native voice Dialog

Formlane's **Dialog** is a continuous Gemini native audio-to-audio conversation. Choose **Dialog** → **Start Dialogue**, allow microphone access, speak, and pause for Gemini to reply aloud. There is no dictation/Send/Play sequence. **Stop Dialogue**, Escape, or closing the dialog stops microphone capture, closes the connection, and cancels queued audio.

Both speakers' transcripts accumulate chronologically, with the newest turn at the bottom. Transcription can arrive before or after its audio; the interface reserves the user's position before the corresponding reply. Speaking while Gemini is responding can interrupt it. Already displayed content stays visible with an Interrupted label. Stopping and reopening keeps the transcript until a page reload. Clicking Start Dialogue clears the previous transcript and creates a fresh provider conversation. The info icon shows guidance on hover, keyboard focus, or tap; stopping and closing do not clear messages.

Dialog receives the complete [Formlane product guide](formlane-guide.md) directly in its system instructions. It can explain documented features and workflows, but has no retrieval, screen/project context, typed input, or application tools. The existing **Explore with AI** proposal helper is separate.

## Product knowledge in system context

Direct inclusion is the current choice: the guide is a single small product reference, and supplying it in full avoids retrieval omissions and a separate index to maintain. `server/voice-context.ts` reads the guide once per server instance and places it in a separate, delimited system-instruction part after the behavioral instructions. There is no copied summary, vector database, or per-question retrieval. The same complete setup is constrained when minting the token and returned to the browser for its WebSocket setup, as supported by Google's [Live setup](https://ai.google.dev/api/live) and [token constraints](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens).

The instructions distinguish product knowledge from access to the user's project. They ask for concise answers in the user's language, documented control names, clarification when needed, and honesty when the guide does not cover a question. They prohibit claiming to see or change project state or verify deployment settings.

Only `docs/formlane-guide.md` is included as product knowledge. The review record, engineering notes, and roadmap are not supplied. Netlify's function-specific `included_files` configuration packages that guide with `voice-token` ([packaging reference](https://docs.netlify.com/build/functions/configuration/)). Update the guide when behavior changes, restart the local server or redeploy, and start a fresh Dialog. Existing sessions keep their original setup. The guide is visible in the token response and is public product information.

## Enable locally

In this repository's ignored `.env.local`, set:

```dotenv
GEMINI_API_KEY=your-server-side-key
FORMLANE_VOICE_ENABLED=true
```

Use a Google project with access to `gemini-3.8-live`. Voice activation is independent of `FORMLANE_ASSISTANT_ENABLED` and its model setting. Restart the local server after changing environment variables:

```powershell
npm.cmd run dev
```

Open the URL Vite prints. Microphone capture requires HTTPS or localhost and an AudioWorklet-capable browser. No permanent key belongs in a `VITE_` variable or the browser.

For Netlify, configure these same server variables for Functions and redeploy when publishing is intended. This change does not itself establish hosted configuration or verification.

## Design and reference

Inspected Talker read-only: `frontend/src/ui/dialog.ts`, `speechInput.ts`, `frontend/netlify/lib/live.mjs`, and `functions/live-access.mjs`. Reused its approach to ephemeral authentication, binary JSON WebSocket frames, ordered PCM playback, interruption, and cleanup. Talker's project files and local credentials were not modified or copied. Formlane uses its own React state, native dialog component, Vite API adapter, and Netlify functions; capture uses an AudioWorklet instead of ScriptProcessor.

Google documentation checked on 2026-10-21:

- [Gemini 3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live): exact model identifier, AUDIO response modality, no thinking-level configuration, no removed affective-dialog setting or disabled proactive audio.
- [Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities): input/output audio transcription, PCM audio, automatic voice activity detection, and interruptions.
- [Ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens) and [REST auth-token schema](https://ai.google.dev/api/generate-content#AuthToken): server-issued single-use tokens and constrained setup.
- [WebSocket reference](https://ai.google.dev/api/live): setup confirmation, binary event handling, concurrent parts/transcripts, and interrupted/turn-complete events.
- [Session management](https://ai.google.dev/gemini-api/docs/live-api/session-management): context compression and finite connection lifetime.

`server/voice.ts` issues single-use tokens through `/api/voice-token`, with 60 seconds to open a connection and a 30-minute token lifetime. The entire setup is constrained server-side, including the absence of tools. The browser connects directly to Google's `BidiGenerateContentConstrained` endpoint and waits for `setupComplete` before streaming microphone audio. There is no WebSocket proxy in the Netlify function and no fallback to another model.

`src/voice-audio.ts` captures mono audio, converts it to signed little-endian 16-bit PCM at 16 kHz, and schedules every returned PCM part in order (normally 24 kHz). `src/voice.ts` owns the connection and releases all resources on stop, setup failure, lost connection, page exit, or permission/capture failure. `src/voice-transcript.ts` owns turn grouping. `VoiceChat` displays messages stored in App state, outside the project/library/history model.

Context-window compression is enabled. Connection resumption is not implemented in this first version. When Google announces or closes an expiring connection, the UI asks the user to restart and keeps the transcript. Long-lived reconnect and background/mobile audio behavior need further real-device validation.

## Data and limits

Microphone audio streams directly from the browser to Google. The server issues tokens and receives no audio or project data. The product guide and behavioral instructions are sent to Google during token issuance and browser session setup. Transcripts stay in page memory, outside autosave, project exports, saved versions, and snapshot links; reload clears them. Google processes the documentation, audio, and generated content under the project's provider terms. Unlike the separate Interactions proposal API, this Live setup makes no `store: false` claim.

When enabled, token issuance is public, protected by a same-origin POST check and Netlify's configured limit of six requests per minute per IP/domain, including availability checks. These measures are not user authentication or a global spending cap. Local Vite does not emulate Netlify rate limits. The token endpoint accepts no client body/configuration and sanitizes provider errors. Tokens are never saved in local storage; responses use `Cache-Control: no-store`.

## Verification

The unit tests cover token constraints, credential secrecy, activation, invalid requests, bounded/sanitized provider responses, PCM conversion, mixed/binary events, transcript order, interruption, startup cancellation, and timeout cleanup. Browser tests use real Chromium Web Audio capture with a synthetic microphone and controlled Google WebSocket responses. They check automatic audio scheduling, chronological transcripts, interruption, retained messages, denied permission, disconnected sessions, unconfigured mode, phone layout, inert strings, and accessibility.

```powershell
npm.cmd test
npx.cmd playwright test tests/voice.spec.ts
```

Those controlled tests do not prove live model availability, audible hardware output, or real microphone/echo quality. Real provider and device verification must be recorded separately.

**Real provider verification, 2026-10-21:** the opt-in local Chromium check passed using the newly configured server-side key and `models/gemini-3.8-live`. A Windows-generated synthetic WAV said “Hello Gemini. Please say voice dialogue is working.” The user transcript matched that phrase, Gemini's output transcript was “Voice dialogue is working.”, and 11 native audio parts arrived over the same continuous connection after 312 microphone packets. No fallback model was used. Chromium processed the exchange without page errors or voice error alerts. This verifies a real browser/provider exchange with synthetic microphone input; a person's microphone, audible speakers, echo cancellation, and hosted Netlify behavior still need manual verification.

The opt-in test is [voice-live.spec.ts](../tests/voice-live.spec.ts). It only accepts a local target and requires `FORMLANE_VOICE_LIVE=true` plus `FORMLANE_VOICE_INPUT` pointing to a 16-bit mono WAV with 12 seconds of opening silence, a short spoken phrase, and trailing silence. Ordinary CI skips it. Do not enable it for routine regression runs.

Final local regression results on 2026-10-21: 174 unit tests, four video timing tests, and all 92 ordinary Chromium browser tests passed; the opt-in provider test was skipped during that ordinary suite and passed separately as recorded above. The production build, formatting, relative documentation links, and whitespace checks passed. A credential scan confirmed the configured permanent key is absent from the browser JavaScript/CSS. Adding the Dialog control exposed a 320-pixel toolbar overflow; wrapping the workspace actions fixed it and the full suite passed afterward.

**Documentation-context verification, 2026-10-22:** all 174 unit tests, six controlled Chromium Dialog tests, and the production build passed. The token-handler test verifies that the full current guide is included and that the constrained setup exactly matches the setup returned to the browser. Formatting, 88 relative documentation links, and whitespace checks passed. The guide measures 21,301 UTF-8 bytes (2,955 whitespace-separated words); the complete serialized setup measures 23,084 bytes. These are size measurements, not model token counts. The first browser run could not reach localhost from the sandbox; the successful run used local browser access with Google responses mocked.

Exact model token usage and real guide-answer accuracy were not verified in this pass. The attempted Gemini check could not resolve Google's hostname in the sandbox; automatic approval review then rejected external execution because sending the guide and test questions to Gemini required explicit destination approval. No provider result is claimed for the new context. Hosted deployment, real microphone/speaker behavior, and live documentation-answer checks remain unverified.
