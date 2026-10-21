import assert from "node:assert/strict";

export function compileTimeline(source) {
  const fps = source.fps;
  const feedbackFrames = Math.round((source.clickFeedbackSeconds ?? 0.5) * fps);
  const speeds = source.playback ?? [
    { start: 0, end: source.duration, rate: 1 },
  ];
  assert.equal(speeds[0].start, 0);
  assert.equal(speeds.at(-1).end, source.duration);
  speeds.forEach((segment, index) => {
    assert(segment.end > segment.start && segment.rate > 0);
    if (index) assert.equal(segment.start, speeds[index - 1].end);
  });
  const clicks = source.actions.filter((action) => action.target);
  const slowed = (time) =>
    speeds.reduce(
      (sum, segment) =>
        sum +
        Math.max(0, Math.min(time, segment.end) - segment.start) / segment.rate,
      0,
    );
  const frameAt = (time, includeClickAtTime = true) =>
    Math.round(slowed(time) * fps) +
    clicks.filter((action) =>
      includeClickAtTime ? action.time <= time : action.time < time,
    ).length *
      feedbackFrames;
  const actions = source.actions.map((action) => {
    const frame = frameAt(action.time);
    return {
      ...action,
      sourceTime: action.time,
      frame,
      time: frame / fps,
      ...(action.target
        ? {
            clickStartFrame: frame - feedbackFrames,
            clickEndFrame: frame,
            clickStart: (frame - feedbackFrames) / fps,
            clickEnd: frame / fps,
          }
        : {}),
    };
  });
  const captions = source.captions.map((caption) => ({
    ...caption,
    sourceStart: caption.start,
    sourceEnd: caption.end,
    start: frameAt(caption.start, false) / fps,
    end: frameAt(caption.end, false) / fps,
  }));
  const frames = frameAt(source.duration);
  const compiled = {
    ...source,
    sourceDuration: source.duration,
    duration: frames / fps,
    frames,
    feedbackFrames,
    actions,
    captions,
  };
  compiled.mapSourceFrame = (time) => frameAt(time, false);
  actions.forEach((action, index) => {
    if (index) assert(action.frame >= actions[index - 1].frame);
    if (action.target) {
      assert.equal(
        action.clickEndFrame - action.clickStartFrame,
        feedbackFrames,
      );
      assert.equal(stateAtFrame(compiled, action.clickEndFrame), action.state);
      const before =
        actions.filter((entry) => entry.frame < action.clickEndFrame).at(-1)
          ?.state ?? compiled.initialState;
      assert.equal(stateAtFrame(compiled, action.clickEndFrame - 1), before);
    }
  });
  return compiled;
}

export function stateAtFrame(timeline, frame) {
  let state = timeline.initialState;
  for (const action of timeline.actions)
    if (frame >= action.frame) state = action.state;
  return state;
}
