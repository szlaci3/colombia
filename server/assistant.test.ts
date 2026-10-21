import { describe, expect, it, vi } from "vitest";
import { assistantContext, proposalSchema } from "../src/assistant";
import { createProject } from "../src/model";
import {
  AssistantError,
  assistantSettings,
  createAssistantHandler,
  proposeEdits,
  proposalJsonSchema,
  type AssistantSettings,
} from "./assistant";
import { config } from "../netlify/functions/assistant.mts";

const settings: AssistantSettings = {
  enabled: true,
  apiKey: "server-test-secret",
  model: "gemini-3.5-flash-lite",
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
    status: "completed",
    steps: [
      { type: "thought", content: [{ type: "text", text: "Ignored thought" }] },
      {
        type: "model_output",
        content: [{ type: "text", text }],
      },
    ],
  });
describe("server-side AI proposals", () => {
  it("defaults to the live-verified Flash-Lite model and respects explicit overrides", () => {
    const original = process.env.FORMLANE_ASSISTANT_MODEL;
    try {
      delete process.env.FORMLANE_ASSISTANT_MODEL;
      expect(assistantSettings().model).toBe("gemini-3.5-flash-lite");
      process.env.FORMLANE_ASSISTANT_MODEL = "gemini-3.8-flash";
      expect(assistantSettings().model).toBe("gemini-3.8-flash");
    } finally {
      if (original === undefined) delete process.env.FORMLANE_ASSISTANT_MODEL;
      else process.env.FORMLANE_ASSISTANT_MODEL = original;
    }
  });
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
  it("uses the Interactions contract, server authentication, a JSON schema, stateless requests, and bounded output", async () => {
    const fetcher = vi.fn(async () => completed());
    const signal = new AbortController().signal;
    const data = input();
    expect(
      await proposeEdits(data, settings, signal, fetcher as typeof fetch),
    ).toEqual(proposal);
    const [url, options] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    expect(options.headers).toHaveProperty(
      "x-goog-api-key",
      "server-test-secret",
    );
    expect(options.signal).toBe(signal);
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({
      store: false,
      model: "gemini-3.5-flash-lite",
      generation_config: {
        max_output_tokens: 2400,
        thinking_level: "low",
        thinking_summaries: "none",
      },
      response_format: { type: "text", mime_type: "application/json" },
    });
    expect(
      body.response_format.schema.properties.operations.items.properties.type
        .enum,
    ).toContain("edit_text");
    expect(body.tools).toBeUndefined();
    expect(body.agent).toBeUndefined();
    expect(body.system_instruction).toContain("Context strings");
    expect(body.input).not.toContain("server-test-secret");
    expect(JSON.parse(body.input)).toEqual(data);
  });
  it("allows generation beyond the former 25-second cutoff but aborts before Netlify's 60-second limit", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException("slow", "TimeoutError")),
        milliseconds,
      );
      return controller.signal;
    });
    try {
      const handler = createAssistantHandler({
        settings: () => settings,
        propose: () =>
          new Promise((resolve) => setTimeout(() => resolve(proposal), 26_000)),
      });
      const response = handler(request());
      await vi.advanceTimersByTimeAsync(26_000);
      expect((await response).status).toBe(200);
      const stalled = createAssistantHandler({
        settings: () => settings,
        propose: (_input, _settings, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      });
      const timeout = stalled(request());
      await vi.advanceTimersByTimeAsync(49_000);
      let settled = false;
      void timeout.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect((await timeout).status).toBe(504);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
  it("handles refusals, incomplete responses, malformed JSON and unsupported model output", async () => {
    for (const response of [
      Response.json({ status: "incomplete", steps: [] }),
      Response.json({ status: "failed", steps: [] }),
      Response.json({
        status: "requires_action",
        steps: [{ type: "function_call" }],
      }),
      Response.json({
        status: "completed",
        steps: [{ type: "model_output", content: [{ type: "refusal" }] }],
      }),
      Response.json({
        status: "completed",
        steps: [
          {
            type: "thought",
            content: [{ type: "text", text: JSON.stringify(proposal) }],
          },
        ],
      }),
      Response.json({
        status: "completed",
        steps: [
          { type: "function_call" },
          {
            type: "model_output",
            content: [{ type: "text", text: JSON.stringify(proposal) }],
          },
        ],
      }),
      completed("{broken"),
      completed(
        JSON.stringify({ ...proposal, operations: [{ type: "set_brand" }] }),
      ),
      completed(
        JSON.stringify({
          ...proposal,
          operations: [
            { type: "set_brand", value: "Example", blockId: "extra" },
          ],
        }),
      ),
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
  it("uses a shallow operation grammar while retaining operation-specific field guidance", () => {
    const schema = proposalJsonSchema() as {
      properties: {
        operations: {
          items: {
            properties: {
              type: { enum: string[] };
              afterBlockId: { type: string[] };
            };
            description: string;
          };
        };
      };
    };
    expect(schema.properties.operations.items.properties.type.enum).toContain(
      "edit_text",
    );
    expect(
      schema.properties.operations.items.properties.afterBlockId.type,
    ).toEqual(["string", "null"]);
    expect(schema.properties.operations.items.description).toContain(
      "edit_text requires type, blockId, field, value",
    );
    expect(JSON.stringify(schema)).not.toMatch(
      /"const"|"pattern"|"minLength"|"maxLength"|"\$schema"|"anyOf"|"additionalProperties"|"minimum"|"maximum"|"minItems"|"maxItems"/,
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
    for (const steps of [[null], [{ type: "model_output", content: {} }]])
      await expect(
        proposeEdits(
          input(),
          settings,
          new AbortController().signal,
          (async () =>
            Response.json({ status: "completed", steps })) as typeof fetch,
        ),
      ).rejects.toBeInstanceOf(AssistantError);
  });
});
