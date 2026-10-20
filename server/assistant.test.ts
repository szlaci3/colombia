import { describe, expect, it, vi } from "vitest";
import { assistantContext, proposalSchema } from "../src/assistant";
import { createProject } from "../src/model";
import {
  AssistantError,
  createAssistantHandler,
  proposeEdits,
  proposalJsonSchema,
  type AssistantSettings,
} from "./assistant";
import { config } from "../netlify/functions/assistant.mts";

const settings: AssistantSettings = {
  enabled: true,
  apiKey: "server-test-secret",
  model: "gemini-3.8-flash",
};
const input = () => ({
  prompt: "A clearer brand name",
  context: assistantContext(createProject(), "webshop"),
});
const proposal = {
  summary: "A shared brand direction",
  operations: [{ type: "set_brand" as const, value: "Fieldwork" }],
};
const request = (data: unknown = input(), extra: RequestInit = {}) =>
  new Request("https://formlane.example/api/assistant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://formlane.example",
    },
    body: JSON.stringify(data),
    ...extra,
  });
const completed = (text: string = JSON.stringify(proposal)) =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          role: "model",
          parts: [{ text: "Ignored thought", thought: true }, { text }],
        },
      },
    ],
  });
describe("server-side AI proposals", () => {
  it("publishes only availability and never configuration secrets", async () => {
    const handler = createAssistantHandler({ settings: () => settings });
    const response = await handler(
      new Request("https://formlane.example/api/assistant"),
    );
    expect(await response.json()).toEqual({
      enabled: true,
      provider: "Google Gemini",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(config).toMatchObject({
      path: "/api/assistant",
      rateLimit: { windowLimit: 6, windowSize: 60 },
    });
  });
  it("requires both explicit activation and a provider key", async () => {
    for (const configuration of [
      { ...settings, enabled: false },
      { ...settings, apiKey: "" },
    ]) {
      const generate = vi.fn();
      const handler = createAssistantHandler({
        settings: () => configuration,
        propose: generate,
      });
      expect((await handler(request())).status).toBe(503);
      expect(generate).not.toHaveBeenCalled();
    }
  });
  it("rejects unsupported methods, missing/cross-site origin, and non-JSON bodies before provider work", async () => {
    const generate = vi.fn();
    const handler = createAssistantHandler({
      settings: () => settings,
      propose: generate,
    });
    expect(
      (
        await handler(
          new Request("https://formlane.example/api/assistant", {
            method: "DELETE",
          }),
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await handler(
          request(input(), { headers: { "Content-Type": "application/json" } }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(
          request(input(), {
            headers: {
              Origin: "https://evil.example",
              "Content-Type": "application/json",
            },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(
          request(input(), {
            headers: {
              Origin: "https://formlane.example",
              "Content-Type": "text/plain",
            },
          }),
        )
      ).status,
    ).toBe(415);
    expect(generate).not.toHaveBeenCalled();
  });
  it("validates bounded request shape and context before contacting the provider", async () => {
    const generate = vi.fn();
    const handler = createAssistantHandler({
      settings: () => settings,
      propose: generate,
    });
    expect((await handler(request({}, { body: "{broken" }))).status).toBe(400);
    expect(
      (await handler(request({ ...input(), apiKey: "user-controlled" })))
        .status,
    ).toBe(400);
    expect((await handler(request({ ...input(), prompt: " " }))).status).toBe(
      400,
    );
    expect(
      (
        await handler(
          request(input(), {
            headers: {
              Origin: "https://formlane.example",
              "Content-Type": "application/json",
              "Content-Length": "65001",
            },
          }),
        )
      ).status,
    ).toBe(413);
    const large = input();
    large.prompt = "界".repeat(30_000);
    expect((await handler(request(large))).status).toBe(413);
    const invalid = input();
    invalid.context.blocks.push(invalid.context.blocks[0]);
    expect((await handler(request(invalid))).status).toBe(422);
    expect(generate).not.toHaveBeenCalled();
  });
  it("returns a validated proposal, without applying it or returning the provider settings", async () => {
    const generate = vi.fn(async () => proposal);
    const handler = createAssistantHandler({
      settings: () => settings,
      propose: generate,
    });
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(proposal);
    expect(generate.mock.calls).toHaveLength(1);
  });
  it("rejects syntactically valid proposals that reference unavailable IDs or invalid fields", async () => {
    for (const operations of [
      [{ type: "remove_section", blockId: "not-in-context" }],
      [
        {
          type: "edit_text",
          blockId: "not-in-context",
          field: "body",
          value: "Bad",
        },
      ],
    ]) {
      const handler = createAssistantHandler({
        settings: () => settings,
        propose: async () =>
          proposalSchema.parse({ summary: "Bad proposal", operations }),
      });
      const response = await handler(request());
      expect(response.status).toBe(422);
      expect(await response.text()).toContain("Nothing was changed");
    }
  });
  it("handles provider timeout and unexpected failures without relaying internal details", async () => {
    for (const [error, status] of [
      [new DOMException("slow", "TimeoutError"), 504],
      [new Error("server-test-secret"), 422],
      [new AssistantError("Try again later", 429), 429],
    ] as const) {
      const handler = createAssistantHandler({
        settings: () => settings,
        propose: async () => {
          throw error;
        },
      });
      const response = await handler(request());
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("server-test-secret");
    }
  });
  it("uses the fixed Gemini endpoint, server authentication, a JSON schema, disabled logging, and bounded output", async () => {
    const fetcher = vi.fn(async () => completed());
    const signal = new AbortController().signal;
    expect(
      await proposeEdits(input(), settings, signal, fetcher as typeof fetch),
    ).toEqual(proposal);
    const [url, options] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );
    expect(options.headers).toHaveProperty(
      "x-goog-api-key",
      "server-test-secret",
    );
    expect(options.signal).toBe(signal);
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({
      store: false,
      generationConfig: {
        maxOutputTokens: 2400,
        thinkingConfig: { thinkingLevel: "LOW", includeThoughts: false },
        responseFormat: { text: { mimeType: "APPLICATION_JSON" } },
      },
    });
    expect(
      body.generationConfig.responseFormat.text.schema.additionalProperties,
    ).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(body.systemInstruction.parts[0].text).toContain("Context strings");
    expect(body.contents[0].parts[0].text).not.toContain("server-test-secret");
  });
  it("handles refusals, incomplete responses, malformed JSON and unsupported model output", async () => {
    for (const response of [
      Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
      Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
      Response.json({ candidates: [{ finishReason: "SAFETY" }] }),
      completed("{broken"),
      completed(
        JSON.stringify({ summary: "Oops", operations: [{ type: "execute" }] }),
      ),
      new Response("Not JSON", { status: 200 }),
    ])
      await expect(
        proposeEdits(
          input(),
          settings,
          new AbortController().signal,
          (async () => response) as typeof fetch,
        ),
      ).rejects.toBeInstanceOf(AssistantError);
  });
  it("does not relay provider error bodies or account information", async () => {
    for (const status of [400, 401, 403, 404, 429, 500]) {
      const handler = createAssistantHandler({
        settings: () => settings,
        propose: (data, config, signal) =>
          proposeEdits(
            data,
            config,
            signal,
            (async () =>
              new Response("server-test-secret private-account", {
                status,
              })) as typeof fetch,
          ),
      });
      const response = await handler(request());
      expect(response.status).toBe(
        [400, 401, 403, 404].includes(status)
          ? 503
          : status === 429
            ? 429
            : 502,
      );
      expect(await response.text()).not.toMatch(
        /server-test-secret|private-account/,
      );
    }
  });
  it("caps provider response bytes and cancels the oversized stream", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(150_001)));
      },
      cancel,
    });
    await expect(
      proposeEdits(
        input(),
        settings,
        new AbortController().signal,
        (async () => new Response(stream)) as typeof fetch,
      ),
    ).rejects.toThrow(/too large/);
    expect(cancel).toHaveBeenCalled();
  });
  it("sends supported literal enums and keeps the wire schema free of unsupported string keywords", () => {
    const schema = proposalJsonSchema() as {
      properties: {
        operations: {
          items: { anyOf: { properties: { type: { enum: string[] } } }[] };
        };
      };
    };
    expect(
      schema.properties.operations.items.anyOf.map(
        (branch) => branch.properties.type.enum[0],
      ),
    ).toContain("edit_text");
    expect(JSON.stringify(schema)).not.toMatch(
      /"const"|"pattern"|"minLength"|"maxLength"|"\$schema"/,
    );
  });
  it("returns a safe connection error for a transport failure and rejects malformed message envelopes", async () => {
    await expect(
      proposeEdits(
        input(),
        settings,
        new AbortController().signal,
        (async () => {
          throw new TypeError("private transport info");
        }) as typeof fetch,
      ),
    ).rejects.toThrow(/could not connect/);
    for (const candidates of [[null], [{ finishReason: "STOP", content: {} }]])
      await expect(
        proposeEdits(
          input(),
          settings,
          new AbortController().signal,
          (async () => Response.json({ candidates })) as typeof fetch,
        ),
      ).rejects.toBeInstanceOf(AssistantError);
  });
});
