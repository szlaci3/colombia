import assert from "node:assert/strict";
import { once } from "node:events";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const full = process.argv.includes("--full");
const name = full ? "formlane-introduction" : "formlane-theme-template";
const out = path.join(
  root,
  "docs/video/rendered",
  full ? "introduction" : "scene",
);
const scene = JSON.parse(
  await readFile(
    path.join(root, `docs/video/${full ? "introduction" : "scene-01"}.json`),
  ),
);
scene.initialState ??= "grove-webshop";
const frames = scene.fps * scene.duration;
assert.equal(frames, full ? 1200 : 240);
assert.equal(scene.captions[0].start, 0);
assert.equal(scene.captions.at(-1).end, scene.duration);
scene.captions.forEach((caption, index) => {
  assert(caption.end > caption.start && caption.lines.length <= 2);
  if (index) assert.equal(caption.start, scene.captions[index - 1].end);
});
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const probe = spawnSync(ffmpeg, ["-hide_banner", "-encoders"], {
  encoding: "utf8",
  windowsHide: true,
});
if (probe.status !== 0 || !probe.stdout.includes("libx264"))
  throw new Error(
    "Install FFmpeg with libx264, or set FFMPEG_PATH to its executable.",
  );
await mkdir(out, { recursive: true });

let server, browser, encoder;
try {
  let base = process.env.FORMLANE_VIDEO_BASE_URL;
  if (full && !base)
    throw new Error(
      "Set FORMLANE_VIDEO_BASE_URL to a Formlane deployment before capturing the introduction.",
    );
  if (!base) {
    server = await preview({
      root,
      configFile: false,
      preview: { host: "127.0.0.1", port: 4185, strictPort: true, open: false },
    });
    base = "http://127.0.0.1:4185";
  }
  browser = await chromium.launch(
    process.env.FORMLANE_VIDEO_BROWSER
      ? { channel: process.env.FORMLANE_VIDEO_BROWSER }
      : {},
  );
  let snapshots = {},
    boxes = {},
    errors = [],
    assistantRequests = [],
    usedExample = false;
  if (process.argv.includes("--reuse-captures")) {
    const cached = JSON.parse(await readFile(path.join(out, "captures.json")));
    assert.equal(cached.source, base);
    ({ snapshots, boxes, errors, assistantRequests, usedExample } = cached);
    console.log(
      "Reusing previously captured real UI states; no new AI request",
    );
  } else {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === new URL(base).origin
        ? route.continue()
        : route.abort(),
    );
    page.on("response", (response) => {
      if (response.url().endsWith("/api/assistant"))
        assistantRequests.push({
          method: response.request().method(),
          status: response.status(),
        });
    });
    await page.goto(new URL("/?template=webshop", base).href);
    await page.evaluate(() => document.fonts.ready);
    const canvas = page.locator(".prototype-canvas");
    const nav = page.getByRole("navigation", { name: "Templates" });
    async function settle(scroll = 208) {
      if (scroll !== null)
        await page.evaluate((value) => window.scrollTo(0, value), scroll);
      await page.mouse.move(1595, 895);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    }
    async function shot(key, scroll = 208) {
      await settle(scroll);
      snapshots[key] = (
        await page.screenshot({ animations: "disabled" })
      ).toString("base64");
      await writeFile(
        path.join(out, `capture-${key}.png`),
        Buffer.from(snapshots[key], "base64"),
      );
      console.log(`Captured ${key}`);
    }
    async function target(key, locator) {
      const box = await locator.boundingBox();
      assert(
        box &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= 1601 &&
          box.y + box.height <= 901,
        `${key} must fit in the recording`,
      );
      boxes[key] = box;
    }
    await expect(canvas).toHaveAttribute("data-theme", "grove");
    await shot("overview", 0);
    await shot("grove-webshop");
    await target(
      "theme",
      page.getByRole("button", { name: "Tide theme", exact: true }),
    );
    for (const [key, title] of [
      ["webshop", "Webshop"],
      ["blog", "Blog"],
      ["dashboard", "Dashboard"],
    ])
      await target(key, nav.getByRole("button", { name: title, exact: true }));
    await page.getByRole("button", { name: "Tide theme", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-theme", "tide");
    await expect(page.getByLabel("Corners", { exact: false })).toHaveValue(
      "18",
    );
    await shot("tide-webshop");
    await nav.getByRole("button", { name: "Webshop", exact: true }).click();
    await nav.getByRole("button", { name: "Blog", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-template", "blog");
    await expect(canvas).toHaveAttribute("data-theme", "tide");
    await shot("tide-blog");
    await nav.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-template", "dashboard");
    await expect(canvas).toHaveAttribute("data-theme", "tide");
    await shot("tide-dashboard");

    if (full) {
      console.log(
        "Capturing editing, notes, live AI, mobile, and presentation",
      );
      await nav.getByRole("button", { name: "Webshop", exact: true }).click();
      await shot("edit-ready");
      const headline = page.getByRole("textbox", {
        name: "Hero headline",
        exact: true,
      });
      await target("headline", headline);
      await headline.click();
      await shot("headline-active");
      await headline.fill("Thoughtful pieces for everyday living.");
      await headline.press("Tab");
      await expect(headline).toHaveText(
        "Thoughtful pieces for everyday living.",
      );
      await shot("headline-edited");
      await shot("content-ready", 0);
      const importer = page.getByRole("button", {
        name: "Start from a website",
        exact: true,
      });
      await target("import", importer);
      await importer.click();
      await shot("import-dialog", null);
      const content = page.getByRole("button", {
        name: "Page content",
        exact: true,
      });
      await target("page-content", content);
      await content.click();
      await shot("content-dialog", null);
      const paste = page.getByRole("button", {
        name: "Paste Markdown",
        exact: true,
      });
      await target("paste", paste);
      await paste.click();
      await shot("markdown-dialog", null);
      const notes = page.getByRole("textbox", {
        name: "Your Markdown",
        exact: true,
      });
      await target("notes", notes);
      await notes.fill(
        "# Our next collection\n\nNatural materials. Useful objects. Room for a slower day.\n\n## Next steps\n\n| Idea | Owner |\n| --- | --- |\n| Explore colors | Alex |\n| Review the collection | Sam |",
      );
      await shot("notes-pasted", null);
      const prepare = page.getByRole("button", {
        name: "Prepare sections",
        exact: true,
      });
      await target("prepare", prepare);
      await prepare.click();
      const add = page.getByRole("button", {
        name: "Add 2 sections to Webshop",
        exact: true,
      });
      await expect(add).toBeEnabled();
      await add.scrollIntoViewIfNeeded();
      await shot("content-review", null);
      await target("add-content", add);
      await add.click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const cell = page.getByRole("textbox", {
        name: "Row 1, Owner",
        exact: true,
      });
      await expect(cell).toHaveText("Alex");
      await cell.scrollIntoViewIfNeeded();
      await shot("content-added", null);

      await settle(208);
      await headline.click();
      await shot("assistant-ready", 0);
      const assistant = page.getByRole("button", {
        name: "Explore with AI",
        exact: true,
      });
      await target("assistant", assistant);
      await assistant.click();
      await expect(
        page.getByText("AI suggestions are available.", { exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await shot("assistant-dialog", null);
      const prompt = page.getByLabel("What would you like to explore?");
      await target("prompt", prompt);
      await prompt.fill(
        "Make the headline clearer. Change only the hero headline to: A calmer home starts here. Leave all other fields unchanged.",
      );
      await shot("assistant-prompt", null);
      const generate = page.getByRole("button", {
        name: "Generate proposal",
        exact: true,
      });
      const forceExample = process.env.FORMLANE_VIDEO_ASSISTANT === "example";
      if (!forceExample) {
        await target("generate", generate);
        await generate.click();
        await shot("assistant-generating", null);
      }
      const apply = page.getByRole("button", {
        name: /^Apply [0-9]+ changes?$/,
      });
      for (let attempt = 0; !forceExample && attempt < 2; attempt++) {
        await page
          .locator(".assistant-review, .assistant-error")
          .waitFor({ state: "visible", timeout: 60000 });
        if (await apply.isVisible()) break;
        console.log(
          `AI attempt ${attempt + 1}: ${await page.locator(".assistant-error").textContent()}`,
        );
        if (attempt === 0) await generate.click();
      }
      let applyChoice = apply;
      if (forceExample || !(await apply.isVisible())) {
        usedExample = true;
        await prompt.fill("");
        await shot("assistant-prompt", null);
        const example = page.getByRole("button", {
          name: "Try an example · no AI request",
          exact: true,
        });
        await target("generate", example);
        await example.click();
        await shot("assistant-generating", null);
        applyChoice = page.getByRole("button", {
          name: "Apply 2 changes",
          exact: true,
        });
        console.log(
          "Live generation unavailable: capturing the explicitly labeled built-in example",
        );
      }
      await applyChoice.scrollIntoViewIfNeeded();
      if (!usedExample)
        await expect(page.locator(".assistant-diff")).toContainText(
          "A calmer home starts here.",
        );
      await shot("assistant-review", null);
      await target("apply", applyChoice);
      await applyChoice.click();
      if (!usedExample)
        await expect(headline).toHaveText("A calmer home starts here.");
      else await expect(canvas).toContainText("A direction to explore");
      await shot("assistant-applied");
      assert(
        usedExample ||
          assistantRequests.some(
            (request) => request.method === "POST" && request.status === 200,
          ),
        "A real successful AI request is required",
      );
      console.log(
        `${usedExample ? "Built-in example" : "Real AI proposal"} reviewed and applied successfully`,
      );

      await page
        .getByRole("button", { name: "Dismiss message", exact: true })
        .click();
      await expect(page.locator(".toast")).toHaveCount(0);
      await shot("preview-ready");
      const mobile = page.getByRole("button", {
        name: "Mobile preview",
        exact: true,
      });
      await target("mobile", mobile);
      await mobile.click();
      await expect(mobile).toHaveAttribute("aria-pressed", "true");
      await shot("mobile-preview");
      await page
        .getByRole("button", { name: "Desktop preview", exact: true })
        .click();
      await shot("present-ready", 0);
      const present = page.getByRole("button", {
        name: "Present",
        exact: true,
      });
      await target("present", present);
      await present.click();
      await expect(
        page.getByRole("button", { name: "Exit presentation", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".block-toolbar")).toHaveCount(0);
      await shot("presentation", 0);
    }
    await writeFile(
      path.join(out, "captures.json"),
      JSON.stringify({
        source: base,
        snapshots,
        boxes,
        errors,
        assistantRequests,
        usedExample,
      }),
    );
  }
  if (usedExample) {
    scene.captions.find((caption) => caption.start === 22).lines = [
      "Open Explore with AI and try the example suggestion.",
    ];
    scene.captions.find((caption) => caption.start === 26).lines = [
      "Review the changes, then choose whether to apply them.",
    ];
  }
  assert.deepEqual(errors, [], "The captured app must have no browser errors");
  for (const action of scene.actions) {
    assert(
      action.state === "end-card" || snapshots[action.state],
      `Missing screenshot: ${action.state}`,
    );
    if (action.target)
      assert(boxes[action.target], `Missing target: ${action.target}`);
  }

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
  const subtitleLayout = await stage.evaluate(
    async ({ snapshots, boxes, scene }) => {
      await document.fonts.load("500 40px DM");
      await document.fonts.load("650 90px DM");
      const images = {};
      await Promise.all(
        Object.entries(snapshots).map(async ([key, data]) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          images[key] = image;
        }),
      );
      const ctx = document.querySelector("canvas").getContext("2d");
      ctx.font = "500 40px DM";
      const subtitleLayout = scene.captions.map((caption) => ({
        start: caption.start,
        end: caption.end,
        lines: caption.lines.map((text) => ({
          text,
          width: ctx.measureText(text).width + 36,
        })),
        background: "rgba(0,0,0,0.5)",
        bottomMargin: 12,
      }));
      const center = (box) => ({
        x: (box.x + box.width / 2) * 1.2,
        y: (box.y + box.height / 2) * 1.2,
      });
      const ease = (t) => t * t * (3 - 2 * t);
      window.drawFrame = (time) => {
        let state = scene.initialState;
        for (const action of scene.actions)
          if (time >= action.time) state = action.state;
        ctx.fillStyle = "#f3f4ed";
        ctx.fillRect(0, 0, 1920, 1080);
        if (state === "end-card") {
          ctx.textAlign = "center";
          ctx.fillStyle = "#30382d";
          ctx.font = "650 90px DM";
          ctx.fillText("formlane.", 960, 465);
          ctx.font = "500 44px DM";
          ctx.fillText("formlane.netlify.app", 960, 550);
        } else {
          ctx.drawImage(images[state], 0, 0, 1920, 1080);
          // Pointer motion is editorial; the screens and state changes are real.
          const next = scene.actions.find(
            (action) =>
              action.target &&
              time >= action.time - 0.65 &&
              time < action.time + 0.4,
          );
          if (next) {
            const box = boxes[next.target],
              target = center(box);
            const amount = ease(
              Math.max(0, Math.min(1, (time - next.time + 0.65) / 0.65)),
            );
            const pointer = {
              x: target.x + 130 * (1 - amount),
              y: target.y + 75 * (1 - amount),
            };
            if (time < next.time) {
              ctx.strokeStyle = "#b37a18";
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.roundRect(
                box.x * 1.2 - 5,
                box.y * 1.2 - 5,
                box.width * 1.2 + 10,
                box.height * 1.2 + 10,
                8,
              );
              ctx.stroke();
            } else {
              const age = time - next.time;
              ctx.strokeStyle = `rgba(179,122,24,${1 - age / 0.4})`;
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.arc(target.x, target.y, 12 + age * 45, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.save();
            ctx.translate(pointer.x, pointer.y);
            ctx.fillStyle = "#263322";
            ctx.strokeStyle = "#fff";
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
          }
        }
        // Movie subtitles: individual 50%-black boxes tightly fit each text line.
        const caption = scene.captions.find(
          (entry) => time >= entry.start && time < entry.end,
        );
        ctx.font = "500 40px DM";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        const top = 1080 - 12 - caption.lines.length * 54;
        caption.lines.forEach((text, index) => {
          const width = ctx.measureText(text).width + 36,
            y = top + index * 54;
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect((1920 - width) / 2, y, width, 52);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(text, 960, y + 39);
        });
      };
      return subtitleLayout;
    },
    { snapshots, boxes, scene },
  );
  for (const caption of subtitleLayout)
    for (const line of caption.lines)
      assert(line.width <= 1824, `Subtitle too wide: ${line.text}`);
  // Keep the clicked control's center clear of the subtitle overlay.
  for (const action of scene.actions.filter((entry) => entry.target)) {
    const caption = subtitleLayout.find(
      (entry) => action.time >= entry.start && action.time < entry.end,
    );
    const box = boxes[action.target];
    const x = (box.x + box.width / 2) * 1.2,
      y = (box.y + box.height / 2) * 1.2;
    caption.lines.forEach((line, index) => {
      const top =
        1080 - caption.bottomMargin - caption.lines.length * 54 + index * 54;
      assert(
        !(
          y >= top &&
          y <= top + 52 &&
          x >= (1920 - line.width) / 2 &&
          x <= (1920 + line.width) / 2
        ),
        `Subtitle obscures ${action.target}`,
      );
    });
  }

  const videoPath = path.join(out, `${name}.mp4`);
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
  const sampleFrames = new Set(
    scene.captions.flatMap(({ start, end }) => [
      Math.round(start * scene.fps),
      Math.round(((start + end) / 2) * scene.fps),
    ]),
  );
  for (let index = 0; index < frames; index++) {
    await stage.evaluate((time) => window.drawFrame(time), index / scene.fps);
    const png = await stage.screenshot();
    if (sampleFrames.has(index))
      await writeFile(
        path.join(out, `${String(index).padStart(4, "0")}.png`),
        png,
      );
    if (encoder.exitCode !== null)
      throw new Error(`FFmpeg stopped: ${encoderError}`);
    if (!encoder.stdin.write(png)) await once(encoder.stdin, "drain");
    if (index % 120 === 0) console.log(`Rendered ${index}/${frames} frames`);
  }
  encoder.stdin.end();
  await encodingDone;
  const inspection = spawnSync(
    ffmpeg,
    ["-hide_banner", "-i", videoPath, "-f", "null", "-"],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(inspection.status, 0, inspection.stderr);
  assert(
    inspection.stderr.includes(
      `Duration: 00:00:${String(scene.duration).padStart(2, "0")}.00`,
    ),
  );
  assert.match(inspection.stderr, /1920x1080/);
  assert.match(inspection.stderr, /30 fps/);
  assert.match(inspection.stderr, new RegExp(`frame=\\s*${frames}\\b`));
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
    source: base,
    isolatedBrowserContext: true,
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    duration: scene.duration,
    frames,
    captions: scene.captions,
    subtitleLayout,
    actions: scene.actions,
    browserErrors: errors,
    assistantRequests,
    usedExample,
    verification: "All frames decoded successfully; browser playback passed",
    audio: "silent",
    playback,
  };
  await writeFile(
    path.join(out, "verification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    path.join(out, "contact-sheet.html"),
    `<body style="background:#ddd;display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${[...sampleFrames].map((index) => `<figure style="margin:0"><img style="width:100%" src="${String(index).padStart(4, "0")}.png"><figcaption>${(index / scene.fps).toFixed(2)} seconds</figcaption></figure>`).join("")}</body>`,
  );
  const deliverable = path.join(root, "docs/video", `${name}.mp4`);
  await copyFile(videoPath, deliverable);
  if (full) {
    const excerpt = path.join(root, "docs/video/formlane-theme-template.mp4");
    const extraction = spawnSync(
      ffmpeg,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "4",
        "-i",
        videoPath,
        "-t",
        "8",
        "-an",
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        excerpt,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(extraction.status, 0, extraction.stderr);
    const excerptCheck = spawnSync(
      ffmpeg,
      ["-hide_banner", "-i", excerpt, "-f", "null", "-"],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(excerptCheck.status, 0, excerptCheck.stderr);
    assert.match(excerptCheck.stderr, /Duration: 00:00:08\.00/);
    assert.match(excerptCheck.stderr, /frame=\s*240\b/);
    console.log(`Verified updated eight-second excerpt: ${excerpt}`);
  }
  console.log(`Verified: ${deliverable}`);
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill();
  await browser?.close();
  if (server)
    await new Promise((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
}
