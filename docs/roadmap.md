# Formlane release roadmap

The finish line is a portfolio-ready release. Each milestone includes automated checks, a checked commit and push, and verification on [Netlify](https://formlane.netlify.app).

## Conversational chatbot milestones

Requested 2026-10-21. These extend the existing reviewed AI editor helper; milestone 4 below records that earlier helper, not completion of a conversational chatbot.

1. [x] **Document the actual application:** inspect the source and produce the [product guide](formlane-guide.md). On 2026-10-22 the owner requested using the reviewed documentation as chatbot context. See the [source map and review record](documentation-review.md).
2. [ ] **Start with a native voice Dialog:** updated scope 2026-10-21: first achieve continuous `gemini-3.8-live` audio-to-audio conversation with visible chronological user/AI transcripts, using Talker's Dialog as a read-only reference. Local implementation, 174 unit tests, four video timing tests, all 92 ordinary browser tests (including six Dialog tests), and a separate real local Chromium/Gemini 3.8 audio/transcript exchange passed. Manual microphone/speaker and hosted verification remain pending. See [Dialog setup and verification](dialog.md). Direct product-guide context was added on 2026-10-22; retrieval, possible typed input, and application tools remain later work.
3. [ ] **Add retrieval only if needed:** the guide is now included directly in system context (2026-10-22); introduce RAG only when size, relevance, maintenance, or measured quality warrants it.
4. [ ] **Add application tools later:** allow the conversational chatbot to perform Formlane operations through explicit application integrations.

The native Dialog now receives the complete product guide in its constrained system instructions. Retrieval and conversational application tools are not implemented. Typed input, manual microphone/speaker checks, and hosted verification remain pending.

## Portfolio release milestones

1. [x] **Improve content import:** local pasted Markdown, search/type filters, full previews, and capacity-aware selection. Website imports and original Markdown exports remain available.
2. [x] **Expand templates:** blog, social feed, and dashboard with the shared brand and existing editor blocks. Article, post, and metric layouts stay editable and portable; earlier v1 projects gain the new starter pages.
3. [x] **Strengthen meeting workflows:** a device-local named project library, durable named versions with undoable restoration, and current/all-template print-to-PDF handouts. Existing saves migrate; shared snapshots get separate project slots.
4. [x] **Add the AI assistant:** server-side Gemini 3.5 Flash-Lite integration, current-template or selected-section context, before/proposed review, validated atomic operations, undo, cancellation, and a clearly labeled local example. **Verified 2026-10-21:** 160 unit tests, 78 browser tests, 16 hosted deployment checks including real generation/review/apply/undo, and GitHub Actions passed for `afe8fa5`. The user also confirmed the production manual test passed. No essential milestone 4 work remains.
5. [ ] **Create the introduction:** short explainer video and a polished guided example.
6. [ ] **Polish and harden:** mobile usability, accessibility, performance, and failure handling across the complete release. **Local pass verified 2026-10-21:** phone navigation focus containment/restoration, background scroll locking and resize recovery; input-method composition; deliberate dialog backdrop dismissal; video failure/retry; and snapshot links that open the prototype directly. The release gate now includes video timing checks. Passed 161 unit tests, 4 video timing tests, and 86 browser tests, including phone navigation accessibility. A separate Chrome audit found no page overflow across all six templates at 320, 360, 390, 768, 1024, and 1440 pixels. Publication and hosted verification of this pass remain pending.
7. [ ] **Finish the portfolio release:** case study, final architecture documentation, full tests, and verified deployment.

The current foundation includes six templates; shared themes and source style review; website and local Markdown content import; inline and structural editing; history; presentation; named projects and saved versions; PDF handouts; local autosave; project files; shareable snapshots; and the verified assistant workflow. Milestone 4 is complete. For milestone 5, the user approved the full introduction and then requested slower pacing, visible typing, and clicks taking effect after their feedback animation. The [80.5-second video and editable source](video/README.md) include 75% opening and theme/template pacing, 50% pacing thereafter, half-second click-feedback holds, real initial title keystrokes, and movie-style subtitles on individually fitted 50%-black backgrounds. The assistant scene uses the app's explicitly labeled built-in example after live generation failed during capture. The introduction video is complete; the separate polished guided example remains pending, so milestone 5 remains incomplete.
