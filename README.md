# Formlane

**One brand. A few different ways to bring it to life.**

Formlane is a browser-based visual prototyping playground for the “what if?” moments in a meeting. Explore a webshop, Kanban board, and data table with one shared visual identity. Edit the examples, rearrange sections, and present an idea while it is still taking shape.

Colombia is the repository name; the application is called Formlane.

**Deployed URL:** [formlane.netlify.app](https://formlane.netlify.app)

![Formlane studio with the webshop prototype and shared brand settings](docs/formlane.png)

## Run locally

Requires Node.js 22.12 or newer and npm. From this checkout:

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. No account, API key, database, or environment file is required. Fonts and illustrations are bundled locally. The editor works locally; website style and content imports use same-origin endpoints to read the public website you submit. Both `npm run dev` and `npm run preview` provide those endpoints locally.

## First version

- **Three pages:** webshop, Kanban, and data table, with direct `?template=webshop`, `?template=kanban`, and `?template=table` links and browser history support.
- **One shared brand:** four curated themes (Grove, Atelier, Tide, Mono), brand name, serif/sans headings, and adjustable corners.
- **Website style import:** choose “Start from a website”, enter a public HTTPS URL, then review detected colors, heading style, and corners before applying them to all three templates. Edit the palette, optionally rename the brand, or cancel without changing the project. Imports are undoable and survive saving, sharing, and export.
- **Webpage content and Markdown:** choose “Start from a website” → “Page content”. Read a public page, review its sections, then add selected text and tables to the current template in one undoable step. Existing content and themes stay intact. Copy or download Markdown without changing the prototype, even when the page is full. The [studio notes example](https://formlane.netlify.app/examples/studio-notes.html) provides original content to try.
- **Inline editing:** edit headings, descriptions, products, table headers/cells, Kanban column titles/cards/tags/assignees, and testimonials. Enter commits, Escape cancels, and Shift+Enter adds a line in multiline fields. Paste becomes plain text.
- **Structural editing:** add/delete products, table rows/columns, Kanban columns/cards, and six kinds of sections. Move products with arrows; move cards with drag handles or their move menus. Sections support dragging, keyboard dragging, move arrows, duplication, and deletion.
- **Undo/redo:** 50 project-wide history steps, with Ctrl/⌘ Z, Ctrl/⌘ Shift Z, and Ctrl/⌘ Y outside text fields. History lasts for the current session.
- **Previews and presentation:** responsive layouts, mobile-width preview, and a presentation mode without editing controls. Escape returns to the editor.
- **Local autosave:** the most recent project stays in this browser. Storage errors are visible. Unreadable saved data is protected from automatic overwrites.
- **Portable projects:** export/import a validated, versioned `.formlane.json` file. Imports and confirmed start-fresh operations can be undone.
- **Shareable snapshots:** compressed project data travels in the URL fragment. A snapshot opens without replacing the recipient’s saved project; “Keep this copy” explicitly saves it. Links are snapshots, not live collaboration.
- **A guided introduction:** a three-step tour explains the actual tools and their limits.

Templates are visual examples. Store checkout, email delivery, real customer records, and production task management are outside this prototype.

## Check it

```powershell
npx playwright install chromium
npm run check
```

`npm run check` runs unit tests, TypeScript checks, the production build, and Chromium end-to-end tests against that production bundle. Browser tests cover editing, persistence, theme propagation, table structure, card movement, pointer and keyboard drag-and-drop, undo/redo, sharing across browser contexts, real file export/import, invalid files, untrusted content, presentation, navigation, storage failure/recovery, mobile overflow, and automated accessibility checks across all themes. Playwright builds the app and manages its own local preview server.

Style-import unit tests cover HTML/CSS evidence, modern colors, contrast adaptation, DNS/private-address rejection, redirects, input limits, and the function contract. Browser tests use controlled API responses for review, apply, cancel, failure, accessibility, and persistence; those are separate from live website/function verification.

Content tests cover semantic extraction, Markdown escaping, safe absolute links, headings/lists/code/tables, malformed and oversized tables, hidden/active markup, section limits, unique IDs, undo, project files, and snapshots. Browser tests additionally exercise selected imports, editable cells, actual Markdown downloads, clipboard fallback, full pages, mode switching, cancellation, and phone layouts. Ordinary CI uses fixtures; optional live checks exercise actual fetching through deployed functions.

Individual commands: `npm test`, `npm run build`, and `npm run test:e2e`. Failed browser tests retain traces under `test-results/`. CI runs the same checks on pushes and pull requests.

To inspect the production bundle, run `npm run build` followed by `npm run preview`. Any static host can serve the editor in `dist/`; website imports additionally require the included server endpoints. Templates use query parameters, so no route rewrite is required. A shared link must use a URL reachable by its recipient; a localhost link works only on that same machine.

## Deploy on Netlify

The deployed URL is [https://formlane.netlify.app](https://formlane.netlify.app). The repository’s `netlify.toml` configures Node.js 24, the build command `npm run build`, the publish directory `dist`, and the functions in `netlify/functions`. Git-based Netlify deployments publish the editor, `/api/import-style`, and `/api/import-content` together. TypeScript is pinned to 5.9 for compatibility with Netlify’s compiler-API tooling.

For Git-based deployments, connect `szlaci3/colombia` with production branch `main` and the repository root as the base directory. Netlify reads the checked-in configuration on the next deployment. After adding this configuration to an existing site, trigger a new deployment if one does not start automatically.

For a manual file/ZIP deployment, run `npm ci` and `npm run build` locally, then upload **only the generated `dist` folder** to the existing Netlify site. A manual upload does not execute the build command in `netlify.toml`. The uploaded site must have the built `index.html` at its root, with its `assets` directory alongside it.

A `dist`-only upload supports the editor, but does not deploy the import functions. Use the connected Git deployment for the complete app.

If the page is blank and the console reports a module with MIME type `application/octet-stream`, inspect the deployed HTML. A script pointing to `/src/main.tsx` means the unbuilt repository was published. Redeploy the built `dist` output; changing the MIME type for `.tsx` does not compile TypeScript or JSX. The built HTML should reference a generated `/assets/*.js` module, served with a JavaScript content type.

To check a deployment from PowerShell:

```powershell
$env:FORMLANE_BASE_URL = 'https://formlane.netlify.app'
npm run test:deployment
Remove-Item Env:FORMLANE_BASE_URL
```

The smoke checks verify the compiled module and its MIME type, load the actual editor without browser errors, open all three template URLs, and check that both deployed functions reject unsafe targets. They use separate browser contexts and do not change existing users’ saved projects. Without `FORMLANE_BASE_URL`, they build and check the local production bundle. To additionally exercise real style extraction and application through the hosted UI, set `FORMLANE_IMPORT_URL` to a public HTTPS page. Set `FORMLANE_CONTENT_URL` to `https://formlane.netlify.app/examples/studio-notes.html` to verify real content fetching, Markdown download, and table import. Remove these variables afterward. Live fetching is optional so normal CI never relies on external websites.

## Data and privacy

The app stores one project under `formlane.project.v1` in browser local storage. There is no server-side project storage or app telemetry. Website imports send the submitted URL to the corresponding same-origin function; source pages are fetched without your cookies or login and are not stored by the app. Reviewed style tokens and their provenance become project data. Selected content becomes ordinary editable text/table blocks; the Markdown export includes the source URL. Unselected content and the review’s Markdown are not saved in the project. Clearing browser data removes the saved project, so export a file for a durable backup. Shared links contain the **entire project**, including all three pages, selected imported content, and style provenance. Anyone with a link can read that snapshot and edit a copy; links have no access control or revocation. Use example data.

Imports are schema-validated, with bounded sizes, fixed theme choices, unique IDs, and rectangular table checks. Imported strings render as text, never HTML. A project supports 24 sections per page, 24 products per collection, 20 table columns/100 rows, and 8 Kanban columns/100 cards per column. Files are limited to 750 KB and encoded snapshot payloads to 48,000 characters; export a file when a project outgrows sharing by link. Extremely long links may be truncated by other applications.

## Scope decisions

The first version established three useful templates and a consistent editor. Website style import is the next increment: it analyzes static HTML, inline styles, and up to three linked stylesheets. It detects colors, a font category, and simple corner radii. Modern CSS colors and custom properties are supported on a best-effort basis. Dynamic/script-generated styles, CSS `@import`, image colors, spacing, shadows, exact font downloads, and source layouts are not reproduced. Blocked or unsupported pages return an error rather than a made-up theme. Review notes identify fallback colors, contrast adjustments, and local font substitutions. Dark source sites are adapted to light prototype backgrounds.

The content adapter prefers the first `main` element, then the first `article`, otherwise the page body. It removes known navigation/forms, scripts, hidden elements, and unsafe link schemes. Turndown converts the cleaned content to Markdown; tables have a bounded conversion rule. Relative links become absolute. Images contribute alt text only. Markdown is shown as inert text, never rendered source HTML. Editable text sections flatten formatting; Markdown retains supported inline formatting and links. Merged table cells are flattened and missing headers use the first row, with review notes. Each result offers up to 20 sections, splitting text at the editor’s 2,000-character limit; tables are capped at 20 columns/100 rows in both outputs. Markdown is limited to 100,000 characters. Very long pages or script-only pages return an error instead of a misleading result. Review notes explain omissions and adaptations.

Both importers use the same fetcher: public HTTPS hostnames on the standard port, no private/reserved DNS addresses, the vetted address pinned to the TLS request, and revalidation on every redirect. Imports have a 12-second deadline, three-redirect limit, 600 KB HTML/250 KB-per-stylesheet limits, and a Netlify rate limit of 10 requests per minute per IP/domain for each endpoint. Content import fetches only the page, not its stylesheets. Source scripts are never executed, and arbitrary CSS is never injected into the editor.

An AI chatbot, a recorded explainer video, accounts, real-time collaboration, free-positioned layouts, and production website/code generation remain deferred. These website imports run on demand; they are not a Chrome extension or a full browser capture.

See [the architecture notes](docs/architecture.md) for extension points and tradeoffs.
