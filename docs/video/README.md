# Formlane introduction video

The complete [80.5-second introduction](formlane-introduction.mp4) explains visible actions in plain language. The [12.67-second excerpt](formlane-theme-template.mp4) contains the theme/template scene with the user's exact captions.

Both are silent, 1920 × 1080 H.264 MP4s at 30 fps. White subtitles sit at the bottom of the picture. Each line has its own tightly fitted black rectangle at 50% opacity; there is no full-width caption bar. The controls being clicked stay readable above the subtitle text.

The opening workspace, theme, and template scenes run at 75% of the original speed. Editing and all subsequent scenes run at 50%. Each demonstrated click adds a half-second feedback pause: the screen holds its current state until the click animation has finished, then the action takes effect. The title edit shows an empty field, real keystrokes building `T`, `Th`, through `Thought`, and then the completed title.

## Storyboard

| Time        | What the viewer sees                                                       | Subtitle                                                                    |
| ----------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 0–5.33s     | The real Formlane workspace                                                | Formlane turns an idea into a prototype you can explore and show to others. |
| 5.33–11.17s | Switch Grove to Tide: palette, typography, and corners change              | Choose a theme. It defines colors and shapes.                               |
| 11.17–18s   | Click Webshop, Blog, and Dashboard                                         | Choose a template: Webshop, blog, dashboard or something else.              |
| 18–26.5s    | Click the headline, type the first letters, then reveal the complete title | Click any text to change it.                                                |
| 26.5–35s    | Open the content tools and paste short Markdown notes                      | Paste your notes to bring in your own content.                              |
| 35–41.5s    | Review two selected sections, add them, and show the imported table        | Choose the sections you want to add.                                        |
| 41.5–51s    | Open Explore with AI and click its explicitly labeled example              | Open Explore with AI and try the example suggestion.                        |
| 51–59.5s    | Compare before/proposed values and explicitly Apply                        | Review the changes, then choose whether to apply them.                      |
| 59.5–68s    | Switch the actual editor to mobile preview                                 | Check how your idea looks on a phone.                                       |
| 68–74.5s    | Click Present and show the prototype without editing controls              | Use Present to show your prototype without editing controls.                |
| 74.5–80.5s  | Formlane wordmark and address                                              | Try your own idea at formlane.netlify.app.                                  |

The assistant segment in this deliverable is an **actual built-in example**, with both the app and subtitle identifying it as such. Live generation returned HTTP 502 during capture, including a retry. The video does not present that example as a generated AI response. Rendering can also capture a real proposal when the provider is available; its subtitles then explain asking AI and reviewing the suggestion.

## Reproduce

Use the existing npm dependencies, Playwright Chromium or installed Chrome, and FFmpeg with libx264. If FFmpeg is not on PATH, set `FFMPEG_PATH` to the absolute executable path. Optionally set `FORMLANE_VIDEO_BROWSER=chrome` to use installed Chrome.

To reproduce the full introduction with its labeled example:

```powershell
$env:FORMLANE_VIDEO_BASE_URL = 'https://formlane.netlify.app'
$env:FORMLANE_VIDEO_ASSISTANT = 'example'
npm run video:intro
```

This captures the deployed app in a new browser context with synthetic example content. It does not change an existing user's projects, and the example mode makes no AI generation request. The successful full render also extracts and verifies the theme/template scene, now 380 frames (12.67 seconds), from the full cut at frames 160–539.

To attempt real generation, remove `FORMLANE_VIDEO_ASSISTANT` before rendering. The renderer tries the enabled provider, then retries once on failure. If it uses the built-in example instead, it updates the subtitles to name the example explicitly. This optional mode sends only synthetic example content through the app's existing assistant endpoint and can incur provider usage.

For the theme/template scene alone, without any external service:

```powershell
Remove-Item Env:FORMLANE_VIDEO_BASE_URL -ErrorAction SilentlyContinue
npm run video:scene
```

The source scripts use real UI interactions and screenshots, with editorial pointer motion and click rings. During capture, the recorder awaits a DOM animation's `finished` promise before calling the control's `.click()`. In the video, every callback/state change occurs after exactly 15 click-feedback frames. This sequencing belongs to the recorder and its timeline. Cuts omit loading and scrolling pauses; the film is not a latency measurement. Fonts and illustrations come from the app's bundled assets.

## Source and verification

`introduction.json` and `scene-01.json` retain the original source-time captions and actions, plus playback rates and feedback duration. `scripts/video-timeline.mjs` maps them to output frames, adding feedback holds before actions. `scripts/render-video.mjs` captures and composes both videos; `scripts/render-intro-scene.mjs` preserves the original render entry point.

Ignored working files live in `docs/video/rendered/introduction/` and `docs/video/rendered/scene/`: real UI captures, sampled frames, a contact sheet, cached captures, and verification reports. Add `--reuse-captures` to the renderer to adjust composition using the cached states without another provider request. Keep the same `FORMLANE_VIDEO_BASE_URL` when reusing captures.

Run `npm run test:video` for the timing contract: speed mapping, deferred dialog open/close, and partial typing before the full title. The render also checks every frame's visible state and click-effect timing, subtitle widths and overlap, real template/theme state, text edits, imported content, reviewed application, mobile preview, presentation, and absence of browser errors. Captured click records confirm that feedback finished before dispatch. Both MP4s are fully decoded to check resolution, frame rate, duration, and frame count (2,415 for the introduction; 380 for the excerpt). Actual browser playback is verified for the main render. Review frames include click starts, the final feedback frame, resulting states, and all typing prefixes. The milestone's separate guided example remains pending.
