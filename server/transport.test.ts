import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";

const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ request: mocked.request }));
import { requestPinned } from "./public-fetch.ts";

function transport(headers: Record<string, string | undefined>, body: string) {
  const response = Object.assign(new PassThrough(), {
    statusCode: 200,
    headers,
  });
  const req = Object.assign(new EventEmitter(), {
    setTimeout: vi.fn(),
    end: () => {},
    destroy: () => {},
  });
  req.end = () => {
    const callback = mocked.request.mock.calls.at(-1)![2] as (
      response: IncomingMessage,
    ) => void;
    callback(response as unknown as IncomingMessage);
    queueMicrotask(() => response.end(body));
  };
  mocked.request.mockReturnValue(req);
  return { response, req };
}

describe("bounded pinned HTTPS transport", () => {
  it("uses the verified address instead of performing another DNS lookup", async () => {
    transport({ "content-type": "text/html" }, "<h1>Hello</h1>");
    const result = await requestPinned(
      new URL("https://example.com/"),
      { address: "93.184.216.34", family: 4 },
      1000,
      AbortSignal.timeout(1000),
    );
    expect(result.text).toBe("<h1>Hello</h1>");
    const options = mocked.request.mock.calls.at(-1)![1];
    const callback = vi.fn();
    options.lookup("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(options.family).toBe(4);
    expect(options.headers.Cookie).toBeUndefined();
    expect(options.headers.Authorization).toBeUndefined();
  });
  it("rejects responses that exceed the byte budget without trusting Content-Length", async () => {
    transport({ "content-type": "text/html" }, "x".repeat(101));
    await expect(
      requestPinned(
        new URL("https://example.com/"),
        { address: "93.184.216.34", family: 4 },
        100,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow(/too large/);
  });
  it.each([
    { "content-type": "image/png" },
    { "content-type": "text/html", "content-encoding": "gzip" },
    { "content-type": "text/html", "content-length": "10000" },
  ])("rejects unexpected or oversized responses %j", async (headers) => {
    transport(headers, "test");
    await expect(
      requestPinned(
        new URL("https://example.com/"),
        { address: "93.184.216.34", family: 4 },
        100,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow();
  });
});
