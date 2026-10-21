# Formlane introduction video

The complete [40-second introduction](formlane-introduction.mp4) explains visible actions in plain language. The [updated eight-second excerpt](formlane-theme-template.mp4) contains the theme/template scene with the user's exact captions.

Both are silent, 1920 × 1080 H.264 MP4s at 30 fps. White subtitles sit at the bottom of the picture. Each line has its own tightly fitted black rectangle at 50% opacity; there is no full-width caption bar. The controls being clicked stay readable above the subtitle text.

## Storyboard

| Time   | What the viewer sees                                                | Subtitle                                                                    |
| ------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 0–4s   | The real Formlane workspace                                         | Formlane turns an idea into a prototype you can explore and show to others. |
| 4–8s   | Switch Grove to Tide: palette, typography, and corners change       | Choose a theme. It defines colors and shapes.                               |
| 8–12s  | Click Webshop, Blog, and Dashboard                                  | Choose a template: Webshop, blog, dashboard or something else.              |
| 12–16s | Click and edit the webshop headline                                 | Click any text to change it.                                                |
| 16–19s | Open the content tools and paste short Markdown notes               | Paste your notes to bring in your own content.                              |
| 19–22s | Review two selected sections, add them, and show the imported table | Choose the sections you want to add.                                        |
| 22–26s | Open Explore with AI and click its explicitly labeled example       | Open Explore with AI and try the example suggestion.                        |
| 26–30s | Compare before/proposed values and explicitly Apply                 | Review the changes, then choose whether to apply them.                      |
| 30–34s | Switch the actual editor to mobile preview                          | Check how your idea looks on a phone.                                       |
| 34–37s | Click Present and show the prototype without editing controls       | Use Present to show your prototype without editing controls.                |
| 37–40s | Formlane wordmark and address                                       | Try your own idea at formlane.netlify.app.                                  |

The assistant segment in this deliverable is an **actual built-in example**, with both the app and subtitle identifying it as such. Live generation returned HTTP 502 during capture, including a retry. The video does not present that example as a generated AI response. Rendering can also capture a real proposal when the provider is available; its subtitles then explain asking AI and reviewing the suggestion.

## Reproduce

Use the existing npm dependencies, Playwright Chromium or installed Chrome, and FFmpeg with libx264. If FFmpeg is not on PATH, set `FFMPEG_PATH` to the absolute executable path. Optionally set `FORMLANE_VIDEO_BROWSER=chrome` to use installed Chrome.

To reproduce the full introduction with its labeled example:

```powershell
$env:FORMLANE_VIDEO_BASE_URL = 'https://formlane.netlify.app'
$env:FORMLANE_VIDEO_ASSISTANT = 'example'
npm run video:intro
```

This captures the deployed app in a new browser context with synthetic example content. It does not change an existing user's projects, and the example mode makes no AI generation request. The successful full render also extracts and verifies the updated eight-second scene at 4–12 seconds.

To attempt real generation, remove `FORMLANE_VIDEO_ASSISTANT` before rendering. The renderer tries the enabled provider, then retries once on failure. If it uses the built-in example instead, it updates the subtitles to name the example explicitly. This optional mode sends only synthetic example content through the app's existing assistant endpoint and can incur provider usage.

For the eight-second scene alone, without any external service:

```powershell
Remove-Item Env:FORMLANE_VIDEO_BASE_URL -ErrorAction SilentlyContinue
npm run video:scene
```

The source scripts use real UI interactions and screenshots, with editorial pointer motion and click rings. Cuts omit loading and scrolling pauses; the film is not a latency measurement. They add captions and an end card without recreating the application interface. Fonts and illustrations come from the app's bundled assets. No app behavior or production data is changed.

## Source and verification

`introduction.json` and `scene-01.json` contain captions and action times. `scripts/render-video.mjs` captures and composes both videos; `scripts/render-intro-scene.mjs` preserves the original render entry point.

Ignored working files live in `docs/video/rendered/introduction/` and `docs/video/rendered/scene/`: real UI captures, sampled frames, a contact sheet, cached captures, and verification reports. Add `--reuse-captures` to the renderer to adjust composition using the cached states without another provider request. Keep the same `FORMLANE_VIDEO_BASE_URL` when reusing captures.

Checks cover the complete subtitle timeline and widths, clicked-control centers staying clear of subtitles, real template/theme state, text edits, imported content, reviewed application, mobile preview, presentation, and absence of browser errors. Each finished MP4 is fully decoded to check resolution, frame rate, duration, and frame count (1,200 for the introduction; 240 for the excerpt). Actual browser playback is verified for the main render. Generated frames receive visual review. The milestone's separate guided example remains pending.
