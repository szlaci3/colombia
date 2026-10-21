import assert from "node:assert/strict";
import { once } from "node:events";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "docs/video/rendered");
const scene = JSON.parse(
  await readFile(path.join(root, "docs/video/scene-01.json")),
);
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const probe = spawnSync(ffmpeg, ["-hide_banner", "-encoders"], {
  encoding: "utf8",
  windowsHide: true,
});
if (probe.status !== 0 || !probe.stdout.includes("libx264")) {
  throw new Error(
    "Install an FFmpeg build with libx264, or set FFMPEG_PATH to its executable.",
  );
}
assert.equal(scene.fps * scene.duration, 240);
assert.deepEqual(
  scene.captions.map(({ start, end }) => [start, end]),
  [
    [0, 4],
    [4, 8],
  ],
);
await mkdir(out, { recursive: true });

let browser;
let encoder;
const server = await preview({
  root,
  configFile: false,
  preview: { host: "127.0.0.1", port: 4185, strictPort: true, open: false },
});
try {
  browser = await chromium.launch(
    process.env.FORMLANE_VIDEO_BROWSER
      ? { channel: process.env.FORMLANE_VIDEO_BROWSER }
      : {},
  );
  const context = await browser.newContext({
    viewport: { width: 1600, height: 800 },
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Isolated browser data and local assets: no existing user project or live API is used.
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto("http://127.0.0.1:4185/?template=webshop");
  await page.evaluate(() => document.fonts.ready);
  const canvas = page.locator(".prototype-canvas");
  const nav = page.getByRole("navigation", { name: "Templates" });
  const targets = {
    theme: page.getByRole("button", { name: "Tide theme", exact: true }),
    webshop: nav.getByRole("button", { name: "Webshop", exact: true }),
    blog: nav.getByRole("button", { name: "Blog", exact: true }),
    dashboard: nav.getByRole("button", { name: "Dashboard", exact: true }),
  };
  const resetView = async () => {
    await page.evaluate(() => window.scrollTo(0, 208));
    await page.mouse.move(1595, 795);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  };
  const snapshots = {};
  const boxes = {};
  async function capture(name, template, theme) {
    await expect(canvas).toHaveAttribute("data-template", template);
    await expect(canvas).toHaveAttribute("data-theme", theme);
    await resetView();
    snapshots[name] = (
      await page.screenshot({ animations: "disabled" })
    ).toString("base64");
  }
  await capture("grove-webshop", "webshop", "grove");
  for (const [name, locator] of Object.entries(targets)) {
    const box = await locator.boundingBox();
    assert(
      box && box.y >= 0 && box.y + box.height <= 800,
      `${name} must fit in the recording`,
    );
    boxes[name] = box;
  }
  await targets.theme.click();
  await expect(page.getByLabel("Corners", { exact: false })).toHaveValue("18");
  await capture("tide-webshop", "webshop", "tide");
  await targets.webshop.click();
  await expect(canvas).toHaveAttribute("data-template", "webshop");
  await targets.blog.click();
  await capture("tide-blog", "blog", "tide");
  await targets.dashboard.click();
  await capture("tide-dashboard", "dashboard", "tide");
  assert.deepEqual(errors, [], "The captured app must have no browser errors");

  const stage = await browser.newPage({
    viewport: { width: scene.width, height: scene.height },
    deviceScaleFactor: 1,
  });
  const font = await readFile(
    path.join(
      root,
      "node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
    ),
  );
  await stage.setContent(
    `<style>@font-face{font-family:DM;src:url(data:font/woff2;base64,${font.toString("base64")})}*{margin:0}html,body{width:1920px;height:1080px;overflow:hidden}canvas{display:block}</style><canvas width="1920" height="1080"></canvas>`,
  );
  await stage.evaluate(
    async ({ snapshots, boxes, scene }) => {
      await document.fonts.load("500 42px DM");
      const images = {};
      await Promise.all(
        Object.entries(snapshots).map(async ([name, data]) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          images[name] = image;
        }),
      );
      const ctx = document.querySelector("canvas").getContext("2d");
      const frame = { x: 64, y: 166, width: 1792, height: 896, scale: 1.12 };
      const center = (box) => ({
        x: frame.x + (box.x + box.width / 2) * frame.scale,
        y: frame.y + (box.y + box.height / 2) * frame.scale,
      });
      const ease = (t) => t * t * (3 - 2 * t);
      window.drawFrame = (time) => {
        ctx.clearRect(0, 0, 1920, 1080);
        ctx.fillStyle = "#f0f0e9";
        ctx.fillRect(0, 0, 1920, 1080);
        const caption = scene.captions.find(
          (entry) => time >= entry.start && time < entry.end,
        );
        ctx.fillStyle = "#30382d";
        ctx.font = "500 42px DM";
        caption.lines.forEach((line, index) =>
          ctx.fillText(line, 64, 65 + index * 55),
        );
        ctx.font = "650 28px DM";
        ctx.fillText("formlane.", 1726, 65);

        let state = "grove-webshop";
        for (const action of scene.actions)
          if (time >= action.time) state = action.state;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(frame.x, frame.y, frame.width, frame.height, 14);
        ctx.clip();
        ctx.drawImage(
          images[state],
          frame.x,
          frame.y,
          frame.width,
          frame.height,
        );
        ctx.restore();
        ctx.strokeStyle = "#cdd4c3";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(frame.x, frame.y, frame.width, frame.height, 14);
        ctx.stroke();

        // A steady highlight directs attention to the real control used in this phase.
        const focus =
          time < 4
            ? boxes.theme
            : boxes[time < 5.5 ? "webshop" : time < 6.7 ? "blog" : "dashboard"];
        ctx.strokeStyle = "#b37a18";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(
          frame.x + focus.x * frame.scale - 7,
          frame.y + focus.y * frame.scale - 7,
          focus.width * frame.scale + 14,
          focus.height * frame.scale + 14,
          9,
        );
        ctx.stroke();

        let pointer = { x: 1340, y: 500 };
        for (const action of scene.actions) {
          const target = center(boxes[action.target]);
          const start = action.time - 0.65;
          if (time >= action.time) pointer = target;
          else if (time >= start) {
            const amount = ease((time - start) / 0.65);
            pointer = {
              x: pointer.x + (target.x - pointer.x) * amount,
              y: pointer.y + (target.y - pointer.y) * amount,
            };
            break;
          } else break;
        }
        for (const action of scene.actions) {
          const age = time - action.time;
          if (age >= 0 && age < 0.4) {
            const target = center(boxes[action.target]);
            ctx.strokeStyle = `rgba(179,122,24,${1 - age / 0.4})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(target.x, target.y, 12 + 45 * age, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.save();
        ctx.translate(pointer.x, pointer.y);
        ctx.fillStyle = "#263322";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 30);
        ctx.lineTo(8, 23);
        ctx.lineTo(14, 37);
        ctx.lineTo(21, 34);
        ctx.lineTo(15, 21);
        ctx.lineTo(26, 20);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        ctx.restore();
      };
    },
    { snapshots, boxes, scene },
  );

  const videoPath = path.join(out, "formlane-theme-template.mp4");
  encoder = spawn(
    ffmpeg,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      String(scene.fps),
      "-vcodec",
      "png",
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      videoPath,
    ],
    { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
  );
  let encoderError = "";
  encoder.stderr.on("data", (data) => {
    encoderError += data;
  });
  const encodingDone = new Promise((resolve, reject) => {
    encoder.on("error", reject);
    encoder.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`FFmpeg exited ${code}: ${encoderError}`)),
    );
  });
  encoder.stdin.on("error", () => {});
  const samples = new Map([
    [0, "00-start"],
    [90, "03-theme"],
    [120, "04-templates"],
    [180, "06-blog"],
    [225, "07-dashboard"],
  ]);
  for (let index = 0; index < scene.fps * scene.duration; index++) {
    await stage.evaluate((time) => window.drawFrame(time), index / scene.fps);
    const png = await stage.screenshot();
    if (samples.has(index))
      await writeFile(path.join(out, `${samples.get(index)}.png`), png);
    if (encoder.exitCode !== null)
      throw new Error(`FFmpeg stopped: ${encoderError}`);
    if (!encoder.stdin.write(png)) await once(encoder.stdin, "drain");
    if (index % 60 === 0)
      console.log(`Rendered ${index}/${scene.fps * scene.duration} frames`);
  }
  encoder.stdin.end();
  await encodingDone;

  const inspection = spawnSync(
    ffmpeg,
    ["-hide_banner", "-i", videoPath, "-f", "null", "-"],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(inspection.status, 0, inspection.stderr);
  assert.match(inspection.stderr, /Duration: 00:00:08\.00/);
  assert.match(inspection.stderr, /1920x1080/);
  assert.match(inspection.stderr, /30 fps/);
  assert.match(inspection.stderr, /frame=\s*240/);
  const playbackPage = await browser.newPage();
  await playbackPage.goto(pathToFileURL(videoPath).href);
  const playback = await playbackPage
    .locator("video")
    .evaluate(async (video) => {
      video.muted = true;
      video.currentTime = 0;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 700));
      video.pause();
      return {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        currentTime: video.currentTime,
        decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames,
        error: video.error?.message ?? null,
      };
    });
  assert.equal(playback.error, null);
  assert.equal(playback.duration, scene.duration);
  assert.equal(playback.width, scene.width);
  assert.equal(playback.height, scene.height);
  assert(playback.currentTime > 0 && playback.decodedFrames > 0);
  const report = {
    source: "Real local production UI; separate browser context",
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    duration: scene.duration,
    frames: 240,
    captions: scene.captions,
    actions: scene.actions,
    browserErrors: errors,
    verification:
      "MP4 decoded successfully; 240 frames, 8.00 seconds, 1920x1080, 30 fps",
    audio: "silent",
    playback,
  };
  await writeFile(
    path.join(out, "verification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  const deliverable = path.join(root, "docs/video/formlane-theme-template.mp4");
  await copyFile(videoPath, deliverable);
  console.log(`Verified: ${deliverable}`);
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill();
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
