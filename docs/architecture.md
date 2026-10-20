# Formlane architecture

## State and rendering

React and TypeScript render a single versioned JSON project. `src/model.ts` defines six discriminated block types and three independently editable page arrays. All pages reference the same project-level brand/theme. `src/components/Blocks.tsx` renders the same data in editing and presentation modes, so preview does not have a second implementation to drift out of sync.

Themes use an allowlisted preset or optional validated custom palette, font category, and numeric radius, passed to the canvas as CSS custom properties. Custom palettes contain only six-digit hex colors and bounded source metadata; arbitrary CSS is never accepted. Existing v1 projects remain compatible. The application chrome stays consistent while every prototype changes together. Original SVG illustrations are React components, so they work offline and scale without asset hosting.

`historyReducer` records immutable project snapshots and caps history at 50 steps. A change after undo discards the redo branch. Navigation, selection, dialogs, and viewport width are editor state, not project content. Text commits on blur rather than recording a snapshot per keystroke. Escape restores the previous value. Native text undo remains available while a field has focus.

The editor uses ordered blocks rather than arbitrary pixel positioning. Responsive sections provide useful meeting-time rearranging without creating a full design tool. Each page uses a query parameter, which works on static hosts without server rewrites.

## Rearranging and accessibility

`@dnd-kit/core` and `@dnd-kit/sortable` provide pointer and keyboard dragging. Sections and Kanban cards have separate contexts, with dedicated handles to avoid interfering with inline editing. Kanban supports same-column ordering and movement between columns, including empty ones. Section arrows, product arrows, and card destination menus provide alternatives to dragging.

Native dialogs provide focus containment and Escape dismissal. Inputs and editing controls have accessible names. Browser tests run axe checks on every template and the introduction dialog. These automated checks supplement keyboard tests; they do not establish complete assistive-technology compatibility.

## Persistence and sharing

`src/storage.ts` owns validation, autosave serialization, and compressed URL snapshots. Zod validates imports and stored data, including duplicate nested IDs, bounds, and table shape. Invalid imports leave the current project intact. Corrupt saved projects open a recoverable unsaved draft and pause autosave. Storage failures stay visible, and file export continues to work.

Autosave is debounced, with page-hide and visibility-change flushing. It stores one project per browser profile/origin, not an account or project library. Reload restores content but not the undo stack. Multiple tabs do not synchronize; the last tab to save wins. Export important work before editing the same project in multiple tabs.

Sharing uses `lz-string` in the URL fragment, with the current template in the query. Fragments are not part of HTTP requests, but anyone receiving the URL receives the project data. There is no server upload, live sync, permission model, link revocation, or guarantee that other applications preserve long links. Opening a shared project pauses autosave until an explicit “Keep this copy”. JSON export is the reliable fallback for large projects.

## Website style import

`netlify/functions/import-style.mts` handles same-origin JSON POST requests at `/api/import-style`. It uses `server/public-fetch.ts` for bounded outbound requests, `server/style-cascade.ts` for a bounded static author-style sample, and `server/extract-style.ts` for ranking/adaptation. Cheerio matches selectors to representative page/heading/action elements and their ancestors. PostCSS reads embedded and linked styles in document order; linked sheets retain their original URL identity even when other fetches fail. The `specificity` parser compares selector specificity, including `:is()`/`:where()`. Applicable declarations resolve by importance, inline priority, specificity, and order. Inline declarations remain attached to their original element. Background shorthand and color longhand share a cascade slot; this is not general shorthand expansion.

Custom-property names remain case-sensitive. Values resolve within each sampled element’s inherited scope, including nested function fallbacks, cycles, and values computed at an ancestor before inheritance. Expansion depth/size is bounded. Explicit hidden elements and sampled `display:none`/`visibility:hidden` content do not contribute observations. Conditional rules, interactive selectors, pseudo-elements, layers, nesting, and animations are omitted with notes. Only unconditional `all`/`screen` media are accepted. This deliberately omits CSS features requiring a browser environment; it is not a computed-style engine. Limits bound analysis to 120 elements, 2,000 rules/selectors, and 25,000 declaration applications. Font shorthand, registered properties, full CSS-wide keyword semantics, relative-unit computation, and advanced background expansion remain unsupported.

Color.js normalizes supported colors, including OKLCH. Heuristics rank winning declarations using element/property roles, with global theme tokens and metadata as additional evidence. Source evidence identifies the selected value, selector, property, stylesheet label, and basis (matched, token, metadata, or fallback) for accent, page, text, font, and radius. The response schema bounds these strings; the UI renders them as text only. `StyleEvidence` compares unchanged detected values with the current review choices, so color picking or manual edits never rewrite source evidence. Evidence is review-only and does not change the project format. Existing responses without evidence remain supported. The importer does not execute source scripts, copy source markup into the editor, follow CSS imports, or download fonts/images.

Every request resolves all addresses and rejects the target if any is nonpublic. The HTTPS transport connects to the selected vetted address using a custom lookup while retaining the original hostname for TLS verification. Redirects repeat the validation, preventing a public URL from redirecting to a private target. Only HTTPS on port 443 is accepted, without credentials or IP-literal hosts. Outbound requests forward no cookies, authorization, or user headers. Limits bound response bytes, stylesheet count, redirects, DNS time, and total analysis time. Netlify provides a per-IP/domain limit of 10 imports per minute; the local Vite adapter does not emulate platform rate limiting.

The review dialog displays observed colors separately from the proposed palette, documents substitutions, supports manual corrections, and gates application on contrast. Bright accents are darkened and dark backgrounds are adapted to the light template system. Source fonts map to bundled/system serif or sans fallbacks rather than being downloaded or implying license rights. Applying a result updates the shared theme in one history transaction; optional brand renaming is part of that same transaction. Existing content is preserved. Cancelling, closing, and failed requests leave the project unchanged; an unmounted review aborts pending work.

`server/vite-api.ts` runs the same handlers during local dev and preview. The browser build includes no Node-only fetching or parsing dependencies. Netlify deploys the frontend and functions together. TypeScript 5.9 provides the compiler API needed by Netlify tooling. Mocked browser flows and parser/security unit tests supplement actual hosted function checks.

## Webpage content and Markdown

`netlify/functions/import-content.mts` exposes `/api/import-content`. Both import functions use `server/url-import-handler.ts` for method/origin/JSON validation, bounded request bodies, timeout signals, and safe errors, then the same DNS-pinned public HTTPS fetcher. Content import fetches a single page and never follows source links or media. Each function has its own platform rate limit of 10 requests per minute per IP/domain.

`server/extract-content.ts` cleans the document with Cheerio, preferring `main`, then `article`, then `body`. It removes active markup, known navigation and forms, and explicit hidden elements. It normalizes links to allowlisted HTTP/HTTPS/mail addresses and replaces images with escaped alt text. Turndown produces Markdown with a bounded table rule; literal angle brackets in ordinary text are escaped. No source scripts execute, and the UI displays Markdown in a read-only textarea rather than rendering HTML. CSS-based visibility and client-rendered content are not evaluated.

Headings group plain text into existing text blocks, and tables map to existing editable table blocks. No new editor primitive or project-version migration is needed. The adapter offers up to 20 sections with 2,000-character text bodies and rectangular tables bounded to 20 columns/100 data rows. Merged cells and missing headers receive explicit adaptation notes. The Markdown export includes source provenance and retains supported headings, lists, links, code, quotes, and tables; it can include content beyond the 20 editable sections but is limited to 100,000 characters. Long table cells are shortened only in the prototype. The complete source HTML is not returned or saved.

`WebsiteImport` presents visual-style and page-content modes in the same dialog. `ContentImport` handles selection, inert Markdown review, clipboard fallback, and a real `.md` download. `appendImportedSections` clones chosen sections with fresh IDs, inserts them after the selected section or at the end, and enforces page capacity. Applying them goes through one project-history transaction and retains other pages and the shared theme. Full pages can still export Markdown. Cancel, failure, and mode switching do not change project content. The original page under `public/examples/studio-notes.html` supports a repeatable first-party demonstration and opt-in hosted end-to-end checks.

## Future work, in order

1. Broaden style coverage beyond the supported static cascade subset. Rendered-browser extraction, conditional rules, advanced shorthand handling, exact fonts, spacing, and shadows remain separate future work; source-only analysis cannot reliably reproduce arbitrary pages.
2. Improve content selection and fidelity for more document structures. Pasted/rendered content and a browser extension remain future options; the current adapter reads static page HTML only.
3. An AI assistant should call validated project operations with undo support. Keep provider credentials server-side and make generated changes reviewable.
4. Add template families using these blocks before introducing new editor primitives. Combine templates into a custom application only after designing and testing that interaction.

The editor’s production output is `dist/`, hosted at [formlane.netlify.app](https://formlane.netlify.app). Website imports additionally use the included Netlify functions; no database, provider account, or API key is needed. `netlify.toml` declares the build command, output directory, Node version, and function source directory. A static-only host can serve the editor, but needs compatible endpoints to enable URL imports.
