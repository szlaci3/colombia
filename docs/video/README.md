# Introduction video: first scene

Only the eight-second theme/template scene is approved. The rest of milestone 5 remains unimplemented.

Captions explain the visible action in plain language for a nontechnical viewer. These exact captions replace the earlier promotional caption:

| Time | Caption                                                        | Visible action                                                                      |
| ---- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0–4s | Choose a theme. It defines colors and shapes.                  | Change the webshop from Grove to Tide; the palette, typography, and corners change. |
| 4–8s | Choose a template: Webshop, blog, dashboard or something else. | Click Webshop, Blog, then Dashboard, retaining the selected theme.                  |

The render uses screenshots taken through actual interactions with a local production build in an isolated browser context. It adds a pointer, click rings, control highlights, and captions; it does not recreate the app interface. No existing projects, live providers, or website imports are used. The output is silent, with captions embedded in the video.

## Render

Requires the existing npm dependencies, a Playwright Chromium installation, and FFmpeg with the libx264 encoder. Use an absolute executable path in `FFMPEG_PATH` if FFmpeg is not on PATH. Optionally set `FORMLANE_VIDEO_BROWSER=chrome` to use installed Google Chrome instead of Playwright Chromium.

```powershell
npm run video:scene
```

Editable captions and action timings are in `scene-01.json`. The command builds the app, captures its four real states, renders 240 frames, encodes a 1920 × 1080 H.264 MP4 at 30 fps, and decodes it to check the format and exact eight-second duration. It also verifies actual browser playback. A frame at exactly 4.00 seconds already contains the second caption. All assets and fonts are local.

The verified deliverable is [`formlane-theme-template.mp4`](formlane-theme-template.mp4), kept with the source for review. Intermediate files are in `docs/video/rendered/`: the working MP4, five review frames, and `verification.json`. This directory is ignored by Git. Visual review of the generated frames and video remains part of reviewing a new render. The app itself has no new controls or behavior.
