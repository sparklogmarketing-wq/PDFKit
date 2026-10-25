import test from "node:test";
import assert from "node:assert/strict";
import { manifests } from "../apps/web/lib/registry.ts";
import { getRelatedTools } from "../apps/web/lib/relatedTools.ts";

test("Tool Manifests Schema and Status Validation", async (t) => {
  const manifestMap = new Map(manifests.map((m) => [m.id, m]));

  await t.test("all registered tools have valid metadata and active status", () => {
    assert.strictEqual(manifests.length >= 6, true, "Expected at least 6 tools in registry");

    const validCategories = new Set(["organize", "edit", "convert", "security", "ocr"]);
    const validBackends = new Set(["client", "server", "hybrid"]);
    const validStatuses = new Set(["active", "planned", "beta"]);

    for (const m of manifests) {
      assert.ok(m.id && typeof m.id === "string", `Tool missing valid id: ${JSON.stringify(m)}`);
      assert.ok(m.title && typeof m.title === "string", `Tool ${m.id} missing title`);
      assert.ok(m.description && typeof m.description === "string", `Tool ${m.id} missing description`);
      assert.ok(validCategories.has(m.category), `Tool ${m.id} has invalid category ${m.category}`);
      assert.ok(validBackends.has(m.backend), `Tool ${m.id} has invalid backend ${m.backend}`);
      assert.ok(validStatuses.has(m.status ?? "planned"), `Tool ${m.id} has invalid status ${m.status}`);
      assert.strictEqual(m.status, "active", `Expected implemented tool ${m.id} to have status="active"`);
      assert.ok(Array.isArray(m.accepts) && m.accepts.length > 0, `Tool ${m.id} missing accepts`);
      assert.strictEqual(typeof m.multiple, "boolean", `Tool ${m.id} missing multiple flag`);
      assert.ok(Array.isArray(m.fields), `Tool ${m.id} fields must be an array`);
    }
  });

  await t.test("all tools have meaningful and valid related tools", () => {
    for (const m of manifests) {
      assert.ok(Array.isArray(m.related), `Tool ${m.id} should define related array`);
      assert.ok(m.related.length > 0, `Tool ${m.id} should have at least 1 related tool`);

      // Must not reference self
      assert.strictEqual(m.related.includes(m.id), false, `Tool ${m.id} cannot reference itself in related`);

      // All referenced tools must exist
      for (const relId of m.related) {
        assert.ok(manifestMap.has(relId), `Tool ${m.id} references non-existent related tool "${relId}"`);
      }
    }
  });

  await t.test("getRelatedTools returns curated related tools", () => {
    const mergeManifest = manifestMap.get("merge");
    assert.ok(mergeManifest);

    const related = getRelatedTools(mergeManifest, manifests);
    assert.strictEqual(related.length, 3);
    assert.deepStrictEqual(related.map((m) => m.id), ["split", "organize", "rotate"]);
  });

  await t.test("getRelatedTools falls back to same category if related is empty or absent", () => {
    const dummy = {
      id: "dummy",
      title: "Dummy",
      description: "Dummy tool",
      category: "organize",
      backend: "client",
      accepts: ["application/pdf"],
      multiple: false,
      fields: [],
    };

    const related = getRelatedTools(dummy, manifests);
    assert.ok(related.length > 0);
    assert.strictEqual(related.length <= 4, true);
    assert.strictEqual(related.some((m) => m.id === "dummy"), false);
  });

  await t.test("getRelatedTools ignores nonexistent related IDs safely", () => {
    const custom = {
      id: "custom",
      title: "Custom",
      description: "Custom tool",
      category: "organize",
      backend: "client",
      accepts: ["application/pdf"],
      multiple: false,
      fields: [],
      related: ["merge", "non_existent_tool_123", "rotate"],
    };

    const related = getRelatedTools(custom, manifests);
    assert.deepStrictEqual(related.map((m) => m.id), ["merge", "rotate"]);
  });
});
