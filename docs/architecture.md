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

`netlify/functions/import-style.mts` handles same-origin JSON POST requests at `/api/import-style`. It uses `server/public-fetch.ts` for bounded outbound requests and `server/extract-style.ts` for static HTML/CSS parsing. Cheerio reads markup; PostCSS and its value parser inspect declarations and resolve simple custom properties; Color.js normalizes CSS colors, including OKLCH. Heuristics rank candidate colors using property/selector roles and frequency. This is source analysis, not computed styles from a browser. It does not execute source scripts, copy source markup into the editor, follow CSS imports, or download fonts/images.

Every request resolves all addresses and rejects the target if any is nonpublic. The HTTPS transport connects to the selected vetted address using a custom lookup while retaining the original hostname for TLS verification. Redirects repeat the validation, preventing a public URL from redirecting to a private target. Only HTTPS on port 443 is accepted, without credentials or IP-literal hosts. Outbound requests forward no cookies, authorization, or user headers. Limits bound response bytes, stylesheet count, redirects, DNS time, and total analysis time. Netlify provides a per-IP/domain limit of 10 imports per minute; the local Vite adapter does not emulate platform rate limiting.

The review dialog displays observed colors separately from the proposed palette, documents substitutions, supports manual corrections, and gates application on contrast. Bright accents are darkened and dark backgrounds are adapted to the light template system. Source fonts map to bundled/system serif or sans fallbacks rather than being downloaded or implying license rights. Applying a result updates the shared theme in one history transaction; optional brand renaming is part of that same transaction. Existing content is preserved. Cancelling, closing, and failed requests leave the project unchanged; an unmounted review aborts pending work.

`server/vite-api.ts` runs the same handler during local dev and preview. The browser build includes no Node-only fetching or parsing dependencies. Netlify deploys the frontend and function together. TypeScript 5.9 provides the compiler API needed by Netlify tooling; function packaging was checked with Netlify’s native bundler before deployment. Mocked browser flows and parser/security unit tests supplement actual hosted function checks.

## Future work, in order

1. Improve style evidence with better selector/cascade handling and broader CSS coverage. Rendered-browser extraction, exact fonts, spacing, and shadows remain separate future work; source-only analysis cannot reliably reproduce arbitrary pages.
2. HTML-to-Markdown is a separate content-import adapter. Map headings, lists, and tables into supported blocks rather than trying to preserve source layout or execute source HTML.
3. An AI assistant should call validated project operations with undo support. Keep provider credentials server-side and make generated changes reviewable.
4. Add template families using these blocks before introducing new editor primitives. Combine templates into a custom application only after designing and testing that interaction.

The editor’s production output is `dist/`, hosted at [formlane.netlify.app](https://formlane.netlify.app). Website style import additionally uses the included Netlify function; no database, provider account, or API key is needed. `netlify.toml` declares the build command, output directory, Node version, and function source directory. A static-only host can serve the editor, but needs a compatible endpoint to enable URL imports.
