# Formlane architecture

## State and rendering

React and TypeScript render a single versioned JSON project. `src/model.ts` defines six discriminated block types and three independently editable page arrays. All pages reference the same project-level brand/theme. `src/components/Blocks.tsx` renders the same data in editing and presentation modes, so preview does not have a second implementation to drift out of sync.

Themes use an allowlisted preset, font choice, and numeric radius, passed to the canvas as CSS custom properties. The application chrome stays consistent while every prototype changes together. Original SVG illustrations are React components, so they work offline and scale without asset hosting.

`historyReducer` records immutable project snapshots and caps history at 50 steps. A change after undo discards the redo branch. Navigation, selection, dialogs, and viewport width are editor state, not project content. Text commits on blur rather than recording a snapshot per keystroke. Escape restores the previous value. Native text undo remains available while a field has focus.

The editor uses ordered blocks rather than arbitrary pixel positioning. Responsive sections provide useful meeting-time rearranging without creating a full design tool. Each page uses a query parameter, which works on static hosts without server rewrites.

## Rearranging and accessibility

`@dnd-kit/core` and `@dnd-kit/sortable` provide pointer and keyboard dragging. Sections and Kanban cards have separate contexts, with dedicated handles to avoid interfering with inline editing. Kanban supports same-column ordering and movement between columns, including empty ones. Section arrows, product arrows, and card destination menus provide alternatives to dragging.

Native dialogs provide focus containment and Escape dismissal. Inputs and editing controls have accessible names. Browser tests run axe checks on every template and the introduction dialog. These automated checks supplement keyboard tests; they do not establish complete assistive-technology compatibility.

## Persistence and sharing

`src/storage.ts` owns validation, autosave serialization, and compressed URL snapshots. Zod validates imports and stored data, including duplicate nested IDs, bounds, and table shape. Invalid imports leave the current project intact. Corrupt saved projects open a recoverable unsaved draft and pause autosave. Storage failures stay visible, and file export continues to work.

Autosave is debounced, with page-hide and visibility-change flushing. It stores one project per browser profile/origin, not an account or project library. Reload restores content but not the undo stack. Multiple tabs do not synchronize; the last tab to save wins. Export important work before editing the same project in multiple tabs.

Sharing uses `lz-string` in the URL fragment, with the current template in the query. Fragments are not part of HTTP requests, but anyone receiving the URL receives the project data. There is no server upload, live sync, permission model, link revocation, or guarantee that other applications preserve long links. Opening a shared project pauses autosave until an explicit “Keep this copy”. JSON export is the reliable fallback for large projects.

## Future work, in order

1. URL style extraction should resolve into the existing theme model, with review and manual correction. It must address cross-origin restrictions, server-side URL fetching/SSRF, CSS evaluation, font licensing, and unreliable source pages. A URL field that merely guesses a palette is not style extraction.
2. HTML-to-Markdown is a separate content-import adapter. Map headings, lists, and tables into supported blocks rather than trying to preserve source layout or execute source HTML.
3. An AI assistant should call validated project operations with undo support. Keep provider credentials server-side and make generated changes reviewable.
4. Add template families using these blocks before introducing new editor primitives. Combine templates into a custom application only after designing and testing that interaction.

No application server or external API is needed for this version. The production output is `dist/`, hosted at [formlane.netlify.app](https://formlane.netlify.app). `netlify.toml` declares the build command, output directory, and Node version for Git-based Netlify deployments. Manual uploads must contain the built output; publishing the source root leaves the browser trying to execute uncompiled TSX.
