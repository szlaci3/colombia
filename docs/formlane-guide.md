# Formlane product guide

Draft for owner review. Initially inspected against application source at `cb4f7ec` on 2026-10-21; updated for the subsequent native Dialog implementation. This describes the local source; it does not establish what is currently deployed. The [documentation review](documentation-review.md) maps the original claims to code; [Dialog notes](dialog.md) cover the new voice implementation and verification boundaries.

## What Formlane does

Formlane is a browser-based visual prototyping workspace for exploring ideas in meetings. A project contains six templates with one shared brand: Webshop, Kanban board, Data table, Blog, Social feed, and Dashboard. Change the brand once and compare how it feels across the templates. Each template has its own editable content.

These are visual prototypes. Product prices, tasks, people, posts, and dashboard figures are editable example content. Payments, email delivery, customer databases, live analytics, and production task workflows are not connected. Formlane does not publish the prototype as a working website or export application code.

There are no application accounts, server-side project storage, or real-time collaboration. Work stays in this browser unless you export it, share a snapshot, import a public webpage, request an AI proposal, or start Dialog. The existing AI helper proposes editor changes for review. The separate native voice Dialog sends microphone audio to Gemini and displays both speakers' transcripts.

## Find your way around

Choose a template from the navigation. On a phone, use **Toggle navigation** to open it. The project name in the top bar is editable; it is separate from the brand name shown inside the prototype.

Use **Your brand** in Design settings to change the shared identity. Use **Sections** to find a section on the current page. **Explore building blocks** and **Add a section** open the section library. **Start from a website** opens visual-style and content imports. **Explore with AI** opens the proposal helper. **Projects and saved versions** opens the local project library.

**How it works** opens an introduction video and a three-step tour. The video has playback controls and download. The same help is available through **Take a quick tour** and **A little guidance**. A URL ending in `?intro=video` opens the introduction.

Template URLs use `?template=webshop`, `kanban`, `table`, `blog`, `social`, or `dashboard`. Browser Back and Forward restore template navigation. Choosing another template does not create another project.

## Change the brand

In **Your brand**, edit **Brand name**, choose Grove, Atelier, Tide, or Mono, select **Editorial serif** or **Modern sans** under Headings, and adjust Corners from 0 to 24 pixels. These choices affect all six templates. Content stays as it is.

Choosing a curated theme also resets headings and corners to that theme's defaults and replaces any imported palette. Undo can restore the previous settings. A website-style import provides another starting point; it does not copy the source website's layout.

## Edit content and sections

Click editable text in the prototype. Press Enter or click away to commit; Escape cancels the unfinished edit. Shift+Enter inserts a line break in multiline fields. Pasted content becomes plain text. Input-method composition finishes before Enter and Escape shortcuts apply.

Every template can contain any of these six building blocks:

| Building block     | Editable content and controls                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero section       | Eyebrow, headline, description.                                                                                                                                              |
| Product collection | Collection title; product name, description, and price. Add/delete products and move them left/right. Illustrations are built-in artwork; there is no image-upload control.  |
| Data table         | Title, headers, and cells. Add rows or columns, delete individual rows, or remove the last column. At least one column remains.                                              |
| Kanban board       | Board title, column titles, card titles, tags, and assignees. Add/delete columns and cards. Move cards with drag handles or a destination menu; at least one column remains. |
| Testimonial        | Quote and author. The displayed five-star decoration is fixed.                                                                                                               |
| Text section       | Heading and multiline body. **Section style** chooses Text, Article, Post, or Metric.                                                                                        |

Post initials come from the heading. For a Metric, put the figure on the first body line and the caption on subsequent lines. These are presentation styles for text, not connected posts or calculated metrics.

New sections appear after the selected section, or at the end if none is selected. Select a section in the canvas or through **Sections**. Its toolbar offers movement, duplication, and deletion. At least one section must remain on each template. Section and Kanban-card handles support pointer dragging and keyboard dragging: focus the handle, press Space, use arrow keys, then Space to drop or Escape to cancel. Section arrows and card menus offer alternatives.

## Undo and redo

Undo/Redo cover project content across all templates and the shared brand, with up to 50 history steps. Use the canvas buttons or Ctrl/Command+Z to undo, Ctrl/Command+Shift+Z or Ctrl/Command+Y to redo outside text fields and dialogs. While editing text, the field's native undo behavior applies. Editing after undo clears the redo branch.

History is temporary: reloading or opening another project starts a new stack. Named saved versions survive reloads. Library administration, such as removing a project or saved version, does not use project undo.

## Import a website's visual style

1. Choose **Start from a website** → **Visual style** (or **Import website style** in Your brand).
2. Enter a public HTTPS URL and choose **Explore style**. **Try the brand study example** fills a sample URL; submit it to fetch the page.
3. Review detected colors and the proposed Accent, Page, Text, and Soft background colors. Click a detected color to try it as the accent, or edit the palette. Adjust heading style and corners if needed.
4. Read **Where these styles came from** and **What was detected and adapted**. Optionally enable **Also change the brand name**.
5. Choose **Apply to all templates**. The shared style and optional brand rename are one undoable change. Cancel or close to leave the draft unchanged.

The importer reads static HTML, inline/embedded CSS, and up to three linked stylesheets. It estimates colors, a heading-font category, and simple corner radii. It does not run scripts, take a screenshot, reproduce layouts, or download fonts and images. Dynamic pages, conditional styling, unsupported CSS, and blocked sites can produce omissions or errors. Detected values and fallback/adaptation notes appear in review. Dark sources are adapted to the light prototype backgrounds; contrast problems must be resolved before applying.

Only public HTTPS hostnames on the standard port are supported, without URL credentials or private-network destinations. Fetching does not use your login or browser cookies. A login-only page or a page built entirely by scripts may not import successfully.

## Bring in webpage content or Markdown

For a webpage, choose **Start from a website** → **Page content** → **Website URL**, enter a public HTTPS page, and choose **Read page**. **Try the studio notes example** fills a sample URL. Extraction prefers the first main element, then the first article, then the body. It removes known navigation, forms, scripts, and explicitly hidden markup; it does not evaluate the page as a browser would.

For local text, choose **Page content** → **Paste Markdown**. Paste the document, optionally provide a title, and choose **Prepare sections**. **Use the meeting notes example** supplies a local sample. Parsing happens in the browser; referenced links and images are not fetched. The Markdown parser loads as an application asset when first needed.

Review the offered text and table sections. Search headings, bodies, or cells; filter Text or Tables; use **Preview full section** to inspect the result. Initial selection fills the available section slots. Hidden selections stay selected and count toward capacity. **Select matching** adds matching sections up to the remaining capacity; **Clear selection** clears all selections. Additions always follow source order, including selections hidden by a filter.

Adding selected sections inserts editable copies after the selected section or at the end of the current template in one undoable change. Existing sections, other templates, and the shared brand are retained. Imports offer up to 20 sections, subject to the page's 24-section capacity.

You can also **Copy Markdown** or **Download Markdown** without adding sections, including when the template is full. Website Markdown includes its source URL. For pasted documents, copy/download retains the complete original Markdown, including raw HTML, regardless of section selection. The prototype receives plain text and tables: code remains text, links retain labels, images contribute alt text, and raw HTML tags/blocks are omitted from editable sections. Merged website table cells are flattened and review notes explain adaptations. Closing the dialog discards the pending review and pasted text; only added sections become project content.

## Save projects and checkpoints

Normal editing autosaves in browser local storage. Watch the top-bar status: **Saving…**, **Saved on this device**, **Unsaved draft**, or **Could not save — export a backup**. Saving is delayed briefly after changes; storage failures are visible. A different browser, profile, or device has a different library. Clearing site/browser data removes projects, versions, and recovery backups.

Open **Projects and saved versions**. Enter a name and choose **Create project** for starter content or **Duplicate current** for another direction from the current draft. Open another saved project to switch. Switching saves pending committed changes first and starts separate undo history. Rename the active project through its top-bar name. Export a project before removing it if you need a backup; removal requires confirmation and the active project cannot be removed.

Under **Saved versions**, enter a version name and choose **Save version**. A version captures the entire project: all six templates, project name, and shared brand. Restore one to replace the working draft in a single undoable change. Versions can be exported individually; removing one requires confirmation. Duplicating a project copies its draft, not its saved-version history.

Prefer one editing tab per project. The app detects observed revision conflicts and refuses stale saves, but local storage does not provide fully atomic multi-tab editing or live synchronization. If a save fails, export the unsaved draft before reloading or freeing space. Do not assume the latest changes were stored.

If saved data cannot be read, autosave pauses to protect it. Export the open draft before using **Save this draft**. For an unreadable library, that action first backs up the original bytes in a separate recovery key, then starts a new library; it does not repair or automatically restore the old projects. A failed backup leaves the unreadable library untouched.

## Share, export, and import a project

Choose **Share prototype** → **Copy link** to share a snapshot of the whole current project, including all six templates and imported style provenance. Later edits do not update that link. Saved versions and undo history are excluded. The compressed project is carried in the URL fragment; there is no project upload. Anyone holding the link can read it and edit their own copy, with no access control or revocation.

A recipient opens an unsaved snapshot without replacing their local project. **Keep this copy** adds it as a separate project in their browser library. Use a URL the recipient can reach; a localhost link is usable only on that machine. If sharing is too large, export a project file instead. Other applications may truncate long links.

**Export project**, or **Keep a copy of your ideas** in Share prototype, downloads one editable `.formlane.json` draft. It contains all six templates and brand settings, without other library projects or named versions. Export versions separately when needed.

**Import project** validates a `.formlane.json` file before replacing the current draft. Import is one undoable change; it does not automatically create a separate library project. For an independent direction, create or duplicate a project first. Invalid or oversized files leave the current draft unchanged. Earlier three-template v1 projects gain starter Blog, Social feed, and Dashboard pages while retaining original content and identity; malformed supplied pages are rejected.

**Start fresh** replaces all six templates and brand settings after confirmation. It is undoable during the session. Export first or create another named project to preserve a direction durably.

## Present and prepare a PDF

**Mobile preview** shows a narrow canvas; **Desktop preview** restores the wider view. These are editor views of the same project.

Choose **Present** to hide editing controls. Switch templates through the presentation selector, share from there, and use **Exit presentation** or Escape to return. Presentation does not make the prototype's decorative actions into connected services.

For a handout, choose **Share prototype** → **Take it to the meeting**. Choose the current template or all six, then **Print / save PDF**. In the browser print dialog, select Save as PDF, A4 portrait, default scale, background graphics enabled, and browser headers/footers off. Pagination depends on the browser and print settings; long content can span extra pages. **Back to editor** returns from the handout preview. A PDF is static; use the project file for editable exchange.

## Use the existing AI proposal helper

1. Open **Explore with AI** and check its availability message.
2. Under **Share with the assistant**, choose the current template or an individual section. An existing editor selection is the default.
3. Enter a request and choose **Generate proposal**.
4. Inspect the summary and each **Before** / **Proposed** value. Nothing changes until you apply.
5. Apply the whole proposal if suitable. All edits form one undo step.

Supported proposals can edit section headings, hero text, text bodies, quotes/authors, table headers/cells, and append table rows; add text sections; reorder/remove sections; or change the shared brand and curated theme. Brand/theme changes affect all six templates, even when the shared context is one section. A proposed curated theme replaces an imported palette.

The helper cannot edit individual product fields or Kanban cards, add arbitrary block types, rename/create projects, browse websites, run tools, or operate across projects. Those manual editing features do not imply equivalent AI operations. It may answer with advice or a clarifying question and no changes. Invalid operations reject the proposal without partial application. A project change makes an old review unusable; request a fresh proposal. Changing the request/scope, cancelling, or closing discards pending results. Cancellation cannot guarantee that an already-running provider request stops incurring usage.

If live suggestions are disabled or unavailable, **Try an example · no AI request** demonstrates review/apply/undo with a built-in proposal. It is explicitly an example, not a provider response. Live generation requires server-side configuration; the default model in this checkout is `gemini-3.5-flash-lite`, with a server override available. Availability does not establish model quality or current hosted configuration.

AI generation sends the prompt, project name, shared brand settings/palette, and only the chosen template or section through the same-origin function to Google Gemini. Other templates, saved versions, and imported style-source details are excluded. Prompt/proposal text is not saved as chat history and is discarded on closing the dialog. Applied edits become ordinary saved project content. The provider request sets `store: false`; this is not a guarantee about all provider retention practices. Permanent credentials stay server-side.

## Limits and common problems

| Limit                   | Current bound                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Local library           | 10 projects; 10 saved versions per project; 3,000,000 serialized UTF-8 bytes total. Browser quota may be lower.        |
| Individual project/file | 750,000 UTF-8 bytes, including normalized legacy pages.                                                                |
| Snapshot payload        | 48,000 characters of compressed encoded project data.                                                                  |
| Each template           | 1–24 sections.                                                                                                         |
| Each product collection | 1–24 products.                                                                                                         |
| Each table              | 1–20 columns; 0–100 data rows.                                                                                         |
| Each Kanban board       | 1–8 columns; 0–100 cards per column.                                                                                   |
| Most editable strings   | 2,000 characters; project name 80; brand name 40.                                                                      |
| Content import          | Up to 20 offered sections; Markdown up to 100,000 characters; editable table cells/text bodies up to 2,000 characters. |
| AI request/proposal     | Prompt up to 2,000 characters; request up to 65,000 bytes; at most 12 operations.                                      |

If an add button is disabled, check the relevant capacity and whether a required name or selection is missing. If an AI template is too large, share an individual section. If style application is disabled, resolve palette contrast errors or an empty optional brand rename. If copying fails, select the visible link/Markdown and copy manually, or download/export instead.

Public website imports can fail on login-only, private-network, blocked, oversized, script-dependent, or slow pages. Try a smaller public HTTPS page or paste Markdown. Deployed rate-limit configuration allows 10 imports per minute per IP/domain per import endpoint and six assistant requests per minute, including availability checks. Wait a minute after a rate-limit response. Local development does not emulate these platform limits.

## Talk with native voice Dialog

Choose **Dialog** → **Start Dialog**, allow microphone access, speak, and pause for Gemini to reply aloud automatically. This is one continuous native audio-to-audio session using `gemini-3.8-live`. Both speakers' messages stay in chronological order, newest at the bottom; transcripts may arrive before or after the corresponding audio. Speak again to interrupt a reply. Already displayed content stays visible, with interrupted answers labeled.

**End Dialog**, Escape, or closing stops audio and releases the microphone. Reopening keeps the transcript until reload; starting again opens a fresh provider conversation and does not replay the previous transcript. Dialog is independently enabled by the server owner; disabled or unavailable connections show a status/error. It requires HTTPS or localhost and browser microphone/AudioWorklet support. See [Dialog setup and limits](dialog.md).

The first Dialog has no documentation context/retrieval, screen/project access, typed input, or application tools. It should not claim to see or change the project. The **Explore with AI** proposal workflow remains separate. After review, this guide can supply product knowledge in a later stage. Evaluate direct context inclusion before adding RAG.
