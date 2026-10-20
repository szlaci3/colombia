import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";

export class ImportError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}
export function publicUrl(value: string, base?: string): URL {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new ImportError(
      "Enter a complete public website URL, starting with https://.",
      400,
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.href.length > 2000
  )
    throw new ImportError(
      "Use a public HTTPS website without a password or custom port.",
      400,
    );
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|test|home|invalid)$/.test(host) ||
    ipaddr.isValid(host.replace(/^\[|\]$/g, ""))
  )
    throw new ImportError(
      "Only public website hostnames can be imported.",
      400,
    );
  url.hash = "";
  return url;
}
export function publicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export type ResolvedAddress = { address: string; family: number };
export async function resolvePublic(
  hostname: string,
  resolve = (host: string) => lookup(host, { all: true, verbatim: true }),
): Promise<ResolvedAddress> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      resolve(hostname),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new ImportError(
                "The website took too long to resolve. Try another URL.",
              ),
            ),
          2500,
        );
      }),
    ]);
    if (
      !addresses.length ||
      addresses.some((item) => !publicAddress(item.address))
    )
      throw new ImportError(
        "That website does not resolve exclusively to public internet addresses.",
        400,
      );
    return addresses.find((item) => item.family === 4) ?? addresses[0];
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(
      "The website could not be found. Check the address and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
type Hop = { status: number; location?: string; type: string; text: string };
export async function requestPinned(
  url: URL,
  address: ResolvedAddress,
  limit: number,
  signal: AbortSignal,
): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        signal,
        family: address.family,
        lookup: (_host, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          "User-Agent":
            "FormlaneStyleImport/1.0 (+https://formlane.netlify.app)",
          Accept: "text/html,text/css;q=0.9",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy();
          resolve({
            status,
            location: response.headers.location,
            type: "",
            text: "",
          });
          return;
        }
        if (status !== 200) {
          response.destroy();
          reject(
            new ImportError(
              "This website declined the request or is unavailable. Try another public page.",
            ),
          );
          return;
        }
        const type = String(
          response.headers["content-type"] ?? "",
        ).toLowerCase();
        if (
          !/^text\/(?:html|css)\b|^application\/xhtml\+xml\b/.test(type) ||
          (response.headers["content-encoding"] &&
            response.headers["content-encoding"] !== "identity")
        ) {
          response.destroy();
          reject(
            new ImportError("The website did not return readable HTML or CSS."),
          );
          return;
        }
        if (Number(response.headers["content-length"]) > limit) {
          response.destroy();
          reject(
            new ImportError("The website response is too large to analyze."),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > limit) {
            response.destroy(
              new ImportError("The website response is too large to analyze."),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status,
            type,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        response.on("error", reject);
      },
    );
    req.setTimeout(5000, () =>
      req.destroy(
        new ImportError(
          "The website took too long to respond. Try another public page.",
        ),
      ),
    );
    req.on("error", reject);
    req.end();
  });
}
export async function fetchPublicText(
  value: string,
  kind: "html" | "css",
  signal: AbortSignal,
  dependencies = { resolve: resolvePublic, request: requestPinned },
): Promise<{ url: string; text: string }> {
  let url = publicUrl(value);
  for (let redirect = 0; redirect <= 3; redirect++) {
    signal.throwIfAborted();
    const address = await dependencies.resolve(url.hostname);
    signal.throwIfAborted();
    const response = await dependencies.request(
      url,
      address,
      kind === "html" ? 600_000 : 250_000,
      signal,
    );
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location || redirect === 3)
        throw new ImportError(
          "This website redirects too many times. Try its final URL.",
        );
      url = publicUrl(response.location, url.href);
      continue;
    }
    if (
      kind === "html"
        ? !/html/.test(response.type)
        : !/^text\/css\b/.test(response.type)
    )
      throw new ImportError(
        `The website did not return a ${kind === "html" ? "web page" : "stylesheet"}.`,
      );
    return { url: url.href, text: response.text };
  }
  throw new ImportError("The website could not be read.");
}
