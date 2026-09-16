import { test } from "node:test";
import assert from "node:assert/strict";
import { presets, forTool, newDraft, validateDraft } from "./presets";
test("presets never route Anthropic-only providers to Codex", () => {
  assert.ok(
    !forTool("codex").some((p) =>
      ["anthropic", "glm", "minimax"].includes(p.id),
    ),
  );
  assert.equal(new Set(presets.map((p) => p.id)).size, presets.length);
  assert.ok(forTool("claude").length >= 7);
});
test("rejects embedded credentials, insecure endpoints and full request paths", () => {
  const d = {
    ...newDraft("codex"),
    name: "test",
    model: "test",
    apiKey: "test-key",
  };
  assert.equal(validateDraft(d), undefined);
  for (const baseUrl of [
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com?key=private",
    "https://example.com/v1/responses",
  ])
    assert.ok(validateDraft({ ...d, baseUrl }));
  assert.equal(
    validateDraft({ ...d, baseUrl: "http://localhost:8000/v1" }),
    undefined,
  );
});
test("existing key can remain unchanged, new profiles require one", () => {
  const d = { ...newDraft("claude"), name: "test", model: "model", apiKey: "" };
  assert.ok(validateDraft(d));
  assert.equal(validateDraft({ ...d, id: "existing" }), undefined);
});
