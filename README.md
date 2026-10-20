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

Open the local URL printed by Vite. No account, API key, database, or environment file is required. Fonts and illustrations are bundled locally; the application makes no external API requests.

## First version

- **Three pages:** webshop, Kanban, and data table, with direct `?template=webshop`, `?template=kanban`, and `?template=table` links and browser history support.
- **One shared brand:** four curated themes (Grove, Atelier, Tide, Mono), brand name, serif/sans headings, and adjustable corners.
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

Individual commands: `npm test`, `npm run build`, and `npm run test:e2e`. Failed browser tests retain traces under `test-results/`. CI runs the same checks on pushes and pull requests.

To inspect the production bundle, run `npm run build` followed by `npm run preview`. Any static host can serve `dist/`; templates use query parameters, so no route rewrite is required. A shared link must use a URL reachable by its recipient; a localhost link works only on that same machine.

## Deploy on Netlify

The deployed URL is [https://formlane.netlify.app](https://formlane.netlify.app). The repository’s `netlify.toml` configures Node.js 24, the build command `npm run build`, and the publish directory `dist`.

For Git-based deployments, connect `szlaci3/colombia` with production branch `main` and the repository root as the base directory. Netlify reads the checked-in configuration on the next deployment. After adding this configuration to an existing site, trigger a new deployment if one does not start automatically.

For a manual file/ZIP deployment, run `npm ci` and `npm run build` locally, then upload **only the generated `dist` folder** to the existing Netlify site. A manual upload does not execute the build command in `netlify.toml`. The uploaded site must have the built `index.html` at its root, with its `assets` directory alongside it.

If the page is blank and the console reports a module with MIME type `application/octet-stream`, inspect the deployed HTML. A script pointing to `/src/main.tsx` means the unbuilt repository was published. Redeploy the built `dist` output; changing the MIME type for `.tsx` does not compile TypeScript or JSX. The built HTML should reference a generated `/assets/*.js` module, served with a JavaScript content type.

To check a deployment from PowerShell:

```powershell
$env:FORMLANE_BASE_URL = 'https://formlane.netlify.app'
npm run test:deployment
Remove-Item Env:FORMLANE_BASE_URL
```

The smoke checks verify the compiled module and its MIME type, load the actual editor without browser errors, and open all three template URLs. They use a separate browser context and do not change existing users’ saved projects. Without `FORMLANE_BASE_URL`, they build and check the local production bundle.

## Data and privacy

The app stores one project under `formlane.project.v1` in browser local storage. There is no server-side storage or telemetry. Clearing browser data removes the saved project, so export a file for a durable backup. Shared links contain the **entire project**, including text in all three pages. Anyone with a link can read that snapshot and edit a copy; links have no access control or revocation. Use example data.

Imports are schema-validated, with bounded sizes, fixed theme choices, unique IDs, and rectangular table checks. Imported strings render as text, never HTML. A project supports 24 sections per page, 24 products per collection, 20 table columns/100 rows, and 8 Kanban columns/100 cards per column. Files are limited to 750 KB and encoded snapshot payloads to 48,000 characters; export a file when a project outgrows sharing by link. Extremely long links may be truncated by other applications.

## Scope decisions

This implements the discussion’s tightly scoped first version: establish three useful templates and a consistent editor before experimenting with arbitrary website extraction. URL-based style extraction, webpage-to-Markdown conversion, an AI chatbot, a recorded explainer video, accounts, real-time collaboration, free-positioned layouts, and production website/code generation are deferred. The tour is an interactive introduction, not a placeholder video or simulated AI assistant.

See [the architecture notes](docs/architecture.md) for extension points and tradeoffs.
