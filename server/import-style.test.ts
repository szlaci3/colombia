import { describe, expect, it, vi } from "vitest";
import {
  extractStyle,
  importWebsite,
  parseColor,
  stylesheetUrls,
} from "./extract-style.ts";
import {
  fetchPublicText,
  ImportError,
  publicAddress,
  publicUrl,
  resolvePublic,
} from "./public-fetch.ts";
import { createHandler } from "../netlify/functions/import-style.mts";
import { paletteProblems } from "../src/theme";

const html =
  '<title>Northstar | Studio</title><meta property="og:site_name" content="Northstar"><link rel="stylesheet" href="/brand.css"><style>:root{--brand-primary: #663399;--page-background:#ffffff;--font-heading:"Georgia",serif}body{background:var(--page-background);color:#222222}h1{font-family:var(--font-heading)}button{background:var(--brand-primary);border-radius:.75rem}</style>';

describe("style evidence and adaptation", () => {
  it("extracts actual CSS colors, variables, heading fonts, and corners", () => {
    const result = extractStyle(html, "https://example.com/", []);
    expect(result.source.title).toBe("Northstar");
    expect(result.colors).toContain("#663399");
    expect(result.palette.accent).toBe("#663399");
    expect(result.palette.surface).toBe("#ffffff");
    expect(result.font).toBe("serif");
    expect(result.source.fontName).toBe("Georgia");
    expect(result.radius).toBe(12);
    expect(paletteProblems(result.palette)).toEqual([]);
  });
  it("converts modern CSS colors without copying executable CSS", () => {
    expect(parseColor("oklch(60% 0.2 250)")).toMatch(/^#[a-f0-9]{6}$/);
    expect(parseColor("rgb(20, 40, 60)")).toBe("#14283c");
    expect(parseColor("rgba(0, 0, 0, .5)")).toBeNull();
    expect(parseColor("url(javascript:alert(1))")).toBeNull();
  });
  it("adapts bright accents and dark source pages, and explains those changes", () => {
    const result = extractStyle(
      "<style>body{background:#101010;color:#ffffff}button{background:#ffea00}</style>",
      "https://example.com/",
      [],
    );
    expect(result.colors).toContain("#ffea00");
    expect(result.palette.accent).not.toBe("#ffea00");
    expect(result.notes.join(" ")).toMatch(/darkened/);
    expect(result.notes.join(" ")).toMatch(/dark source/);
    expect(paletteProblems(result.palette)).toEqual([]);
  });
  it("does not pretend to infer styles from a URL or scripts when no CSS is available", () => {
    expect(() =>
      extractStyle(
        '<title>Brand</title><script>document.body.style.color="red"</script>',
        "https://blue-company.example/",
        [],
      ),
    ).toThrow(/No usable colors/);
  });
  it("limits, deduplicates, and validates linked stylesheets", () => {
    expect(
      stylesheetUrls(
        '<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="http://example.com/b.css"><link rel="stylesheet" href="https://127.0.0.1/c.css"><link rel="stylesheet" href="/b.css"><link rel="stylesheet" href="/c.css"><link rel="stylesheet" href="/d.css">',
        "https://example.com/page",
      ),
    ).toEqual([
      "https://example.com/a.css",
      "https://example.com/b.css",
      "https://example.com/c.css",
    ]);
  });
  it("reads linked CSS and reports partial failure without discarding useful HTML styles", async () => {
    const fetchText = vi
      .fn()
      .mockResolvedValueOnce({ text: html, url: "https://example.com/" })
      .mockRejectedValueOnce(new Error("Unavailable"));
    const result = await importWebsite(
      "https://example.com",
      AbortSignal.timeout(1000),
      fetchText,
    );
    expect(result.palette.accent).toBe("#663399");
    expect(result.notes.join(" ")).toMatch(/stylesheet could not be read/);
    expect(result.stylesheetCount).toBe(0);
  });
});

describe("public URL and DNS boundaries", () => {
  it.each([
    "http://example.com",
    "file:///etc/passwd",
    "https://user:password@example.com",
    "https://example.com:8443",
    "https://localhost",
    "https://metadata.google.internal",
    "https://127.0.0.1",
    "https://2130706433",
    "https://0x7f000001",
    "https://[::1]",
    "https://[::ffff:127.0.0.1]",
  ])("rejects unsafe target %s", (value) => {
    expect(() => publicUrl(value)).toThrow(ImportError);
  });
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "100.64.1.1",
    "0.0.0.0",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.2",
    "203.0.113.4",
    "224.1.2.3",
    "255.255.255.255",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
    "2001:db8::1",
  ])("rejects nonpublic address %s", (value) => {
    expect(publicAddress(value)).toBe(false);
  });
  it("accepts public addresses and rejects a mixed DNS response", async () => {
    expect(publicAddress("93.184.216.34")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
    await expect(
      resolvePublic("example.com", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ]),
    ).rejects.toThrow(/exclusively/);
    await expect(
      resolvePublic("example.com", async () => []),
    ).rejects.toThrow();
  });
  it("revalidates redirects before any request and passes the vetted address to the transport", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ address: "93.184.216.34", family: 4 });
    const request = vi.fn().mockResolvedValue({
      status: 302,
      location: "https://169.254.169.254/latest/meta-data",
      type: "",
      text: "",
    });
    await expect(
      fetchPublicText(
        "https://example.com",
        "html",
        AbortSignal.timeout(1000),
        { resolve, request },
      ),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toEqual({
      address: "93.184.216.34",
      family: 4,
    });
    expect(resolve).toHaveBeenCalledTimes(1);
  });
  it("follows public redirects, limits loops, and enforces the requested document type", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ address: "93.184.216.34", family: 4 });
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        location: "/new",
        type: "",
        text: "",
      })
      .mockResolvedValueOnce({ status: 200, type: "text/html", text: html });
    expect(
      (
        await fetchPublicText(
          "https://example.com",
          "html",
          AbortSignal.timeout(1000),
          { resolve, request },
        )
      ).url,
    ).toBe("https://example.com/new");
    request.mockResolvedValue({
      status: 302,
      location: "/new",
      type: "",
      text: "",
    });
    await expect(
      fetchPublicText(
        "https://example.com",
        "html",
        AbortSignal.timeout(1000),
        { resolve, request },
      ),
    ).rejects.toThrow(/redirects/);
    request.mockResolvedValue({ status: 200, type: "text/html", text: html });
    await expect(
      fetchPublicText("https://example.com", "css", AbortSignal.timeout(1000), {
        resolve,
        request,
      }),
    ).rejects.toThrow(/stylesheet/);
  });
});

describe("function contract", () => {
  const makeRequest = (body: string, headers: Record<string, string> = {}) =>
    new Request("https://formlane.example/api/import-style", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });
  it("validates methods, origins, JSON, and body limits before fetching", async () => {
    const importer = vi.fn();
    const handler = createHandler(importer);
    expect(
      (await handler(new Request("https://formlane.example/api/import-style")))
        .status,
    ).toBe(405);
    expect(
      (await handler(makeRequest("{}", { origin: "https://attacker.example" })))
        .status,
    ).toBe(403);
    expect(
      (await handler(makeRequest("{}", { "Content-Type": "text/plain" })))
        .status,
    ).toBe(415);
    expect((await handler(makeRequest("{"))).status).toBe(400);
    expect((await handler(makeRequest("{}"))).status).toBe(400);
    expect((await handler(makeRequest(" ".repeat(4097)))).status).toBe(413);
    expect(importer).not.toHaveBeenCalled();
  });
  it("returns a validated style result without storing the source page", async () => {
    const result = extractStyle(html, "https://example.com/", []);
    const response = await createHandler(vi.fn().mockResolvedValue(result))(
      makeRequest('{"url":"https://example.com"}'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(result);
  });
  it("returns helpful public errors and does not leak internal exception details", async () => {
    const response = await createHandler(
      vi.fn().mockRejectedValue(new ImportError("Use a public website.", 400)),
    )(makeRequest('{"url":"https://example.com"}'));
    expect(response.status).toBe(400);
    const failure = await createHandler(
      vi.fn().mockRejectedValue(new Error("secret.internal: token")),
    )(makeRequest('{"url":"https://example.com"}'));
    expect(JSON.stringify(await failure.json())).not.toContain(
      "secret.internal",
    );
  });
});
