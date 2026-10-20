import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { AssistantRequest, Proposal } from "../src/assistant";
import { createProject } from "../src/model";
import { makeShareUrl } from "../src/storage";

async function open(page: Page) {
  await page
    .getByRole("button", { name: "Explore with AI", exact: true })
    .click();
}
async function mock(
  page: Page,
  propose: (input: AssistantRequest) => unknown | Promise<unknown>,
  enabled = true,
) {
  await page.route("**/api/assistant", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { enabled, provider: "Google Gemini" } });
    await route.fulfill({
      json: await propose(route.request().postDataJSON()),
    });
  });
}

test("reviews a controlled AI proposal, applies once, persists all changes, and undoes/redoes them together", async ({
  page,
}) => {
  await mock(page, (input) => ({
    summary: "A clearer opening with a shared brand direction.",
    operations: [
      {
        type: "edit_text",
        blockId: input.context.blocks[0].id,
        field: "title",
        value: "Good ideas start with a conversation.",
      },
      { type: "set_brand", value: "Fieldwork" },
      { type: "set_theme", preset: "tide", font: "sans", radius: 18 },
      {
        type: "add_text",
        afterBlockId: null,
        title: "Meeting next step",
        body: "Share the direction with the team.",
        appearance: "plain",
      },
    ],
  }));
  await page.goto("/");
  const original = await page
    .getByRole("textbox", { name: "Hero headline", exact: true })
    .textContent();
  await open(page);
  await page
    .getByLabel("What would you like to explore?")
    .fill(
      "Make the headline clearer, use Fieldwork and Tide, and add a meeting next step.",
    );
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review the proposal" }),
  ).toBeVisible();
  await expect(page.locator(".assistant-changes li")).toHaveCount(4);
  await expect(page.locator(".assistant-review")).toContainText(
    "all six templates",
  );
  await expect(page.locator(".assistant-diff").first()).toContainText(
    original!,
  );
  await expect(page.locator(".prototype-canvas")).not.toContainText(
    "Meeting next step",
  );
  await page
    .getByRole("button", { name: "Apply 4 changes", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Good ideas start with a conversation.");
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue(
    "Fieldwork",
  );
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "tide",
  );
  await expect(page.locator(".prototype-canvas")).toContainText(
    "Meeting next step",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText(original!);
  await expect(page.getByLabel("Brand name", { exact: true })).not.toHaveValue(
    "Fieldwork",
  );
  await expect(page.locator(".prototype-canvas")).not.toContainText(
    "Meeting next step",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(page.locator(".prototype-canvas")).toContainText(
    "Meeting next step",
  );
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue(
    "Fieldwork",
  );
});

test("keeps unavailable AI honest and runs a labeled example locally without posting project content", async ({
  page,
}) => {
  let posts = 0;
  await mock(
    page,
    () => {
      posts++;
      return {};
    },
    false,
  );
  await page.goto("/");
  await open(page);
  await expect(page.getByText(/AI suggestions aren’t enabled/)).toBeVisible();
  await page
    .getByLabel("What would you like to explore?")
    .fill("A warm welcome");
  await expect(
    page.getByRole("button", { name: "Generate proposal", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Try an example · no AI request",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Example proposal" }),
  ).toBeVisible();
  await expect(page.locator(".assistant-summary")).toContainText(
    "not an AI response",
  );
  await page
    .getByRole("button", { name: "Apply 2 changes", exact: true })
    .click();
  await expect(page.locator(".prototype-canvas")).toContainText(
    "A direction to explore",
  );
  expect(posts).toBe(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".prototype-canvas")).not.toContainText(
    "A direction to explore",
  );
});

test("sends only the selected section and can edit real table cells through the reviewed operation contract", async ({
  page,
}) => {
  let sent: AssistantRequest | undefined;
  await mock(page, (input) => {
    sent = input;
    const table = input.context.blocks.find((block) => block.type === "table")!;
    return {
      summary: "Rename the first column and update one example customer.",
      operations: [
        {
          type: "table_header",
          blockId: table.id,
          column: 0,
          value: "Customer",
        },
        {
          type: "table_cell",
          blockId: table.id,
          row: 0,
          column: 0,
          value: "Alex Example",
        },
      ],
    };
  });
  await page.goto("/?template=table");
  await page.getByRole("textbox", { name: "Table title", exact: true }).click();
  await open(page);
  await expect(page.getByLabel("Share with the assistant")).toHaveValue(
    "selected",
  );
  await page
    .getByLabel("What would you like to explore?")
    .fill(
      "Call the first column Customer and set the first row’s name to Alex Example.",
    );
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply 2 changes", exact: true })
    .click();
  expect(sent!.context.blocks).toHaveLength(1);
  expect(sent!.context.blocks[0].type).toBe("table");
  await expect(
    page.getByRole("textbox", { name: "Row 1, Customer", exact: true }),
  ).toHaveText("Alex Example");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Column 1 header", exact: true }),
  ).not.toHaveText("Customer");
});

test("rejects invalid proposals and missing IDs without partial edits", async ({
  page,
}) => {
  let response: unknown = {
    summary: "Bad plan",
    operations: [{ type: "execute", code: "alert(1)" }],
  };
  await mock(page, () => response);
  await page.goto("/");
  await open(page);
  await page
    .getByLabel("What would you like to explore?")
    .fill("Improve this page");
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("unsupported proposal");
  await expect(page.getByRole("button", { name: /^Apply/ })).toHaveCount(0);
  response = {
    summary: "Missing target",
    operations: [
      { type: "set_brand", value: "Must not change" },
      { type: "remove_section", blockId: "unknown" },
    ],
  };
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "outside the shared context",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByLabel("Brand name", { exact: true })).not.toHaveValue(
    "Must not change",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});

test("discards stale responses when a request is cancelled, changed or the dialog closes", async ({
  page,
}) => {
  const pending: {
    input: AssistantRequest;
    resolve: (value: Proposal) => void;
  }[] = [];
  await mock(
    page,
    (input) =>
      new Promise<Proposal>((resolve) => pending.push({ input, resolve })),
  );
  await page.goto("/");
  await open(page);
  await page
    .getByLabel("What would you like to explore?")
    .fill("First request");
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect.poll(() => pending.length).toBe(1);
  await page
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  pending[0].resolve({
    summary: "Old response",
    operations: [{ type: "set_brand", value: "Stale first" }],
  });
  await expect(
    page.getByRole("heading", { name: "Review the proposal" }),
  ).toHaveCount(0);
  await page
    .getByLabel("What would you like to explore?")
    .fill("Second request");
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect.poll(() => pending.length).toBe(2);
  await page
    .getByLabel("What would you like to explore?")
    .fill("Changed while waiting");
  pending[1].resolve({
    summary: "Old second response",
    operations: [{ type: "set_brand", value: "Stale second" }],
  });
  await expect(page.getByRole("button", { name: /^Apply/ })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect.poll(() => pending.length).toBe(3);
  await page.getByRole("button", { name: "Close dialog" }).click();
  pending[2].resolve({
    summary: "Closed dialog response",
    operations: [{ type: "set_brand", value: "Stale closed" }],
  });
  await open(page);
  await expect(page.getByLabel("What would you like to explore?")).toHaveValue(
    "",
  );
  await expect(page.getByRole("button", { name: /^Apply/ })).toHaveCount(0);
});

test("invalidates a reviewed proposal when the project changes externally", async ({
  page,
}) => {
  await mock(page, () => ({
    summary: "Before the shared snapshot",
    operations: [{ type: "set_brand", value: "Old proposal" }],
  }));
  await page.goto("/");
  await open(page);
  await page
    .getByLabel("What would you like to explore?")
    .fill("Change the brand");
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply 1 change", exact: true }),
  ).toBeVisible();
  const shared = new URL(
    makeShareUrl({ ...createProject(), brand: "Shared brand" }, page.url()),
  );
  await page.evaluate((hash) => {
    location.hash = hash;
  }, shared.hash);
  await expect(page.getByRole("alert")).toContainText("Your project changed");
  await expect(page.getByRole("button", { name: /^Apply/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue(
    "Shared brand",
  );
});

test("renders untrusted proposals as text and supports advice with no project changes", async ({
  page,
}) => {
  const malicious = "<img src=x onerror=alert(1)>";
  let answer: unknown = {
    summary: malicious,
    operations: [{ type: "set_brand", value: malicious }],
  };
  await mock(page, () => answer);
  await page.goto("/");
  await open(page);
  await page
    .getByLabel("What would you like to explore?")
    .fill("Literal text example");
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect(page.locator(".assistant-summary")).toHaveText(malicious);
  await expect(page.locator(".assistant-review img")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Apply 1 change", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Canvas brand name", exact: true }),
  ).toHaveText(malicious);
  answer = { summary: "Which audience is this for?", operations: [] };
  await open(page);
  await page
    .getByLabel("What would you like to explore?")
    .fill("Make it better");
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect(
    page.getByText("No project changes proposed.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Apply/ })).toHaveCount(0);
});

test("shows actionable provider failures and does not confuse a failed endpoint with a proposal", async ({
  page,
}) => {
  let status = 429;
  await page.route("**/api/assistant", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { enabled: true, provider: "Google Gemini" } })
      : route.fulfill({
          status,
          json: {
            error: "The assistant’s provider connection needs attention.",
          },
        }),
  );
  await page.goto("/");
  await open(page);
  await page
    .getByLabel("What would you like to explore?")
    .fill("Improve the heading");
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Wait a minute");
  status = 503;
  await page
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "provider connection needs attention",
  );
  await expect(page.getByRole("button", { name: /^Apply/ })).toHaveCount(0);
});

test("assistant review is accessible, keyboard-dismissible, and fits a phone", async ({
  page,
}) => {
  await mock(page, () => ({}), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await open(page);
  await page
    .getByRole("button", {
      name: "Try an example · no AI request",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Example proposal" }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/formlane-assistant-phone.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Explore with AI", exact: true }),
  ).toBeFocused();
});
