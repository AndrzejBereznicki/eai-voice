import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { pluginManifestV1Schema } from "@paperclipai/shared";
import plugin from "../dist/worker.js";
import manifest from "../dist/manifest.js";

const companyId = "48dd5ec6-1ea3-44d9-8bb0-f1762912b8c9";
const human = { actor: { type: "user", userId: "andrzej" } };

// createTestHarness only enforces capabilities, not the host's install-time Zod
// schema — a manifest can pass every worker test here and still get a 400 from
// POST /api/plugins/install (this is exactly how the commentAnnotation slot's
// missing entityTypes shipped unnoticed in the first install attempt).
test("manifest passes the host's install-time schema", () => {
  const result = pluginManifestV1Schema.safeParse(manifest);
  assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
});

async function setup() {
  const harness = createTestHarness({ manifest });
  // Mirrors production: the host only honors actorUserId attribution for an active human member.
  harness.seed({ accessMembers: [{ id: "m1", companyId, principalType: "user", principalId: "andrzej", status: "active", membershipRole: "admin", grants: [], createdAt: new Date(), updatedAt: new Date() }] });
  await plugin.definition.setup(harness.ctx);
  return harness;
}

test("settings default to a Polish voice preset and round-trip through save-settings", async () => {
  const harness = await setup();
  const defaults = await harness.getData("settings", { companyId });
  assert.deepEqual(defaults, { voiceURI: null, rate: 1, autoRead: false });

  const { settings } = await harness.performAction("save-settings", { companyId, voiceURI: "Zosia", rate: 1.25, autoRead: true }, human);
  assert.deepEqual(settings, { voiceURI: "Zosia", rate: 1.25, autoRead: true });

  const reloaded = await harness.getData("settings", { companyId });
  assert.deepEqual(reloaded, settings);
});

test("save-settings clamps rate to the 0.5x-2x range", async () => {
  const harness = await setup();
  const { settings } = await harness.performAction("save-settings", { companyId, rate: 9 }, human);
  assert.equal(settings.rate, 2);
  const { settings: low } = await harness.performAction("save-settings", { companyId, rate: -1 }, human);
  assert.equal(low.rate, 0.5);
});

test("create-task creates an issue with the dictated title, attributed to the human actor", async () => {
  const harness = await setup();
  const { issue } = await harness.performAction("create-task", { companyId, title: "Zamów domenę dla EkspertAI" }, human);
  assert.equal(issue.title, "Zamów domenę dla EkspertAI");
  assert.ok(issue.id);
});

test("create-task rejects an empty dictation", async () => {
  const harness = await setup();
  await assert.rejects(harness.performAction("create-task", { companyId, title: "   " }, human), /nie wykryło żadnego tekstu/);
});

test("add-comment posts a human-attributed comment and last-comment serves it back for TTS", async () => {
  const harness = await setup();
  const { issue } = await harness.performAction("create-task", { companyId, title: "Zadanie testowe" }, human);
  const { comment } = await harness.performAction("add-comment", { companyId, issueId: issue.id, body: "To jest **dyktowany** komentarz." }, human);
  assert.equal(comment.authorUserId, "andrzej");

  const served = await harness.getData("last-comment", { companyId, issueId: issue.id });
  assert.equal(served.id, comment.id);
  assert.equal(served.body, "To jest **dyktowany** komentarz.");
  assert.equal(served.authorType, "user");
});

test("last-comment returns the most recently created comment, not the first", async () => {
  const harness = await setup();
  const { issue } = await harness.performAction("create-task", { companyId, title: "Zadanie testowe" }, human);
  await harness.performAction("add-comment", { companyId, issueId: issue.id, body: "Pierwszy" }, human);
  const { comment: second } = await harness.performAction("add-comment", { companyId, issueId: issue.id, body: "Drugi" }, human);

  const served = await harness.getData("last-comment", { companyId, issueId: issue.id });
  assert.equal(served.id, second.id);
  assert.equal(served.body, "Drugi");
});

// The real host lists comments newest-first (issues.listComments default order "desc").
test("last-comment picks the newest comment when the host lists newest-first", async () => {
  const harness = await setup();
  const newest = { id: "c-new", body: "Najnowszy", authorType: "agent", createdAt: new Date("2026-10-10T13:00:00Z"), deletedAt: null };
  const oldest = { id: "c-old", body: "Najstarszy", authorType: "user", createdAt: new Date("2026-10-10T07:00:00Z"), deletedAt: null };
  harness.ctx.issues.listComments = async () => [newest, oldest];
  const served = await harness.getData("last-comment", { companyId, issueId: "i-1" });
  assert.equal(served.id, "c-new");
});

test("last-comment returns null for an issue with no comments", async () => {
  const harness = await setup();
  const { issue } = await harness.performAction("create-task", { companyId, title: "Bez komentarzy" }, human);
  const served = await harness.getData("last-comment", { companyId, issueId: issue.id });
  assert.equal(served, null);
});

test("agents and system callers are rejected for every mutating action", async () => {
  const harness = await setup();
  const { issue } = await harness.performAction("create-task", { companyId, title: "Seed" }, human);
  for (const actor of [
    { actor: { type: "agent", agentId: "f751d89c", runId: "run-1" } },
    { actor: { type: "system" } },
    {},
    { actor: { type: "user", userId: null } },
  ]) {
    await assert.rejects(harness.performAction("create-task", { companyId, title: "Nie powinno powstać" }, actor), /tylko dla użytkownika board/);
    await assert.rejects(harness.performAction("add-comment", { companyId, issueId: issue.id, body: "Nie powinno powstać" }, actor), /tylko dla użytkownika board/);
    await assert.rejects(harness.performAction("save-settings", { companyId, rate: 1 }, actor), /tylko dla użytkownika board/);
  }
});
