import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { compileTimeline, stateAtFrame } from "./video-timeline.mjs";

const source = JSON.parse(
  await readFile(new URL("../docs/video/introduction.json", import.meta.url)),
);
const timeline = compileTimeline(source);

test("uses 75% speed through the theme/template introduction and 50% thereafter", () => {
  assert.equal(timeline.mapSourceFrame(4), 160);
  assert.equal(timeline.mapSourceFrame(12), 540);
  assert.equal(timeline.frames, 2415);
  assert.equal(timeline.duration, 80.5);
  assert.equal(
    timeline.mapSourceFrame(40) - timeline.mapSourceFrame(12),
    28 * 60 + 13 * 15,
  );
});

test("Apply leaves the review visible for every click-effect frame, then closes it", () => {
  const apply = timeline.actions.find((action) => action.target === "apply");
  for (let frame = apply.clickStartFrame; frame < apply.clickEndFrame; frame++)
    assert.equal(stateAtFrame(timeline, frame), "assistant-review");
  assert.equal(
    stateAtFrame(timeline, apply.clickEndFrame),
    "assistant-applied",
  );
  assert.equal(apply.clickEndFrame - apply.clickStartFrame, 15);
});

test("opening a dialog waits until its click effect finishes", () => {
  const importer = timeline.actions.find(
    (action) => action.target === "import",
  );
  assert.equal(
    stateAtFrame(timeline, importer.clickStartFrame),
    "content-ready",
  );
  assert.equal(
    stateAtFrame(timeline, importer.clickEndFrame - 1),
    "content-ready",
  );
  assert.equal(stateAtFrame(timeline, importer.clickEndFrame), "import-dialog");
});

test("shows a cleared title and successive letters before the full title", () => {
  const states = timeline.actions
    .filter((action) => action.sourceTime >= 13.4 && action.sourceTime < 16)
    .map((action) => action.state);
  assert.deepEqual(states, [
    "headline-cleared",
    "headline-type-1",
    "headline-type-2",
    "headline-type-3",
    "headline-type-4",
    "headline-type-5",
    "headline-type-6",
    "headline-type-7",
    "headline-edited",
  ]);
  assert.equal(
    timeline.actions.find((action) => action.state === "headline-type-1")
      .frame <
      timeline.actions.find((action) => action.state === "headline-edited")
        .frame,
    true,
  );
});
