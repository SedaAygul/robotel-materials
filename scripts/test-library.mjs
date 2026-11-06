/**
 * Server regressions using the real TypeScript server and SQL migration.
 * Run with Node 22.13+ (node:sqlite) after the existing app dependencies are installed:
 *   node scripts/test-library.mjs
 * No remote service, real identity, persistent database, or additional package is used.
 */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const seed = JSON.parse(readFileSync(resolve(project, "data/seed-public.json"), "utf8"));
const migration = readFileSync(resolve(project, "drizzle/0000_milky_frog_thor.sql"), "utf8");
const server = ts.transpileModule(
  readFileSync(resolve(project, "app/lib/library-server.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// These are synthetic identities on the reserved .invalid domain.
const REVIEWER = { userId: "test-reviewer-1", email: "reviewer@example.invalid", fullName: "Test reviewer" };
const SECOND_REVIEWER = { userId: "test-reviewer-2", email: "second@example.invalid", fullName: "Second reviewer" };
const CONTRIBUTOR = { userId: "test-contributor-1", email: "contributor@example.invalid", fullName: "Test contributor" };
const OTHER = { userId: "test-contributor-2", email: "other@example.invalid", fullName: "Other contributor" };

function harness(t, { readDelay = 0, now = "2026-11-06T12:00:00.000Z" } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration);
  t.after(() => sqlite.close());
  let user = REVIEWER;
  let clock = now;
  let sequence = 0;

  class Statement {
    constructor(sql, params = []) { this.sql = sql; this.params = params; }
    bind(...params) { return new Statement(this.sql, params); }
    execute() {
      const statement = sqlite.prepare(this.sql);
      if (statement.columns().length) {
        return { success: true, results: statement.all(...this.params), meta: { changes: 0 } };
      }
      const result = statement.run(...this.params);
      return { success: true, results: [], meta: { changes: Number(result.changes) } };
    }
    async run() { return this.execute(); }
    async all() { return this.execute(); }
    async first() {
      const result = this.execute().results[0] ?? null;
      // Capture the read before yielding, so competing operations really see
      // the same old state instead of accidentally running sequentially.
      if (readDelay) await new Promise(resolve => setTimeout(resolve, readDelay));
      return result;
    }
  }
  const db = {
    prepare: sql => new Statement(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(statement => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return new Date(clock).getTime(); }
  }
  const auth = {
    getChatGPTUser: async () => user,
    chatGPTSignInPath: () => "/test-sign-in",
    chatGPTSignOutPath: () => "/test-sign-out",
  };
  const env = { DB: db, MAINTAINER_EMAILS: `${REVIEWER.email},${SECOND_REVIEWER.email}` };
  const module = { exports: {} };
  vm.runInNewContext(server, {
    module,
    exports: module.exports,
    require(name) {
      if (name === "cloudflare:workers") return { env };
      if (name === "../chatgpt-auth") return auth;
      if (name === "./seed-data") return { seedData: structuredClone(seed) };
      throw new Error(`Unexpected server import in regression harness: ${name}`);
    },
    crypto: webcrypto,
    Date: ClockDate,
    Intl,
    Map,
    TextEncoder,
    URL,
    Response,
    console: { error() {} },
  }, { filename: "library-server.regression" });
  const api = module.exports;
  const requestId = () => `test-request-${String(++sequence).padStart(6, "0")}`;
  const request = (body, extraHeaders = {}) => new Request("https://library.example.invalid/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://library.example.invalid", ...extraHeaders },
    body: JSON.stringify(body),
  });
  return {
    api,
    sqlite,
    request,
    requestId,
    setUser(value) { user = value; },
    setTime(value) { clock = value; },
    async http(fn) {
      const response = await api.api(fn);
      return { status: response.status, body: await response.json() };
    },
    submit(body) { return api.submitProposal(request({ requestId: requestId(), ...body })); },
    review(id, expectedRevision, action = "approve", extras = {}) {
      return api.reviewProposal(request({
        expectedRevision, action, note: "Synthetic regression review", requestId: requestId(), ...extras,
      }), id);
    },
    revert(eventId, expectedRevision, extras = {}) {
      return api.revertEvent(request({
        eventId, expectedRevision, note: "Synthetic regression revert", requestId: requestId(), ...extras,
      }));
    },
  };
}

function material(name, baseRevision = 0) {
  return { kind: "material", title: name, polymer: "PETG", manufacturer: "Test manufacturer", baseRevision };
}
function measurement(overrides = {}) {
  return {
    kind: "measurement", materialId: "P-PETG-01", propertyId: "O01", value: 1.3, unit: "g/cm³",
    method: "ISO 1183", specimen: "Synthetic test specimen", direction: "Uygulanamaz",
    conditioning: "23°C; dry", process: "Synthetic test process",
    sourceUrl: "https://example.org/technical-data.pdf", sourceTitle: "Synthetic technical source",
    sourceVersion: "Test version 1", sourceLocation: "p.2; test table", note: "Research observation only",
    baseRevision: 0, ...overrides,
  };
}
const status = expected => error => error?.status === expected;
const plain = value => JSON.parse(JSON.stringify(value));

test("anonymous writes and non-maintainer reviews are rejected", async t => {
  const h = harness(t);
  h.setUser(null);
  const anonymous = await h.http(() => h.submit(material("Anonymous candidate")));
  assert.equal(anonymous.status, 401);
  assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM proposals").get().n, 0);
  h.setUser(CONTRIBUTOR);
  const proposal = await h.submit(material("Contributor candidate"));
  const forbidden = await h.http(() => h.review(proposal.proposalId, 0));
  assert.equal(forbidden.status, 403);
  assert.equal((await h.api.snapshot()).history.length, 0);
});

test("public readers see approved proposals; pending and rejected payloads remain scoped", async t => {
  const h = harness(t);
  h.setUser(CONTRIBUTOR);
  const pending = await h.submit(material("Pending candidate"));
  const approved = await h.submit(material("Approved candidate"));
  const rejected = await h.submit(material("Rejected candidate"));
  h.setUser(REVIEWER);
  await h.review(approved.proposalId, 0);
  await h.review(rejected.proposalId, 1, "reject");
  assert.equal((await h.api.libraryResponse()).proposals.length, 3);
  h.setUser(null);
  const publicData = await h.api.libraryResponse();
  assert.deepEqual(publicData.proposals.map(p => p.id), [approved.proposalId]);
  assert.ok(!publicData.materials.some(m => ["Pending candidate", "Rejected candidate"].includes(m.name)));
  assert.ok(!JSON.stringify(publicData).includes(CONTRIBUTOR.email));
  assert.ok(!JSON.stringify(publicData).includes(CONTRIBUTOR.userId));
  h.setUser(OTHER);
  assert.deepEqual((await h.api.libraryResponse()).proposals.map(p => p.id), [approved.proposalId]);
  h.setUser(CONTRIBUTOR);
  assert.deepEqual(new Set((await h.api.libraryResponse()).proposals.map(p => p.id)), new Set([
    pending.proposalId, approved.proposalId, rejected.proposalId,
  ]));
});

test("HTTPS sources work while private file paths, personal email, and cross-origin writes fail", async t => {
  const h = harness(t);
  const valid = await h.submit(measurement());
  assert.ok(valid.proposalId);
  for (const bad of [
    measurement({ note: "C:\\private\\draft.xlsx" }),
    measurement({ note: "Personal contact: person@example.invalid" }),
    measurement({ sourceUrl: "file:///private/draft.pdf" }),
    measurement({ sourceUrl: "https://user:password@example.org/source" }),
  ]) await assert.rejects(h.submit(bad), status(400));
  await assert.rejects(h.api.submitProposal(h.request({ ...material("Cross-origin candidate"), requestId: h.requestId() }, {
    origin: "https://other.example.invalid",
  })), status(403));
  assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM proposals").get().n, 1);
  await assert.rejects(h.review(valid.proposalId, 0, "approve", {
    note: "Personal contact: person@example.invalid",
  }), status(400));
  assert.equal((await h.api.snapshot()).revision, 0);
  const approved = await h.review(valid.proposalId, 0);
  await assert.rejects(h.revert(approved.eventId, 1, { note: "C:\\private\\review.xlsx" }), status(400));
  assert.equal((await h.api.snapshot()).revision, 1);
  h.setUser({ ...CONTRIBUTOR, fullName: CONTRIBUTOR.email });
  assert.ok(!(await h.api.libraryResponse()).user.displayName.includes("@"));
});

test("documentary properties accept text and numeric properties preserve actual allowed units", async t => {
  const h = harness(t);
  for (const [propertyId, value, unit] of [
    ["O26", "Colour and SKU catalogue pending", "kod / katalog"],
    ["O25", "Biological evaluation document scope pending", "belge kapsamı"],
    ["O28", "Supplier stock confirmation pending", "stok / süre"],
    ["O11", 95, "Shore A"],
    ["O08", 3.3, "kJ/m²"],
  ]) assert.ok((await h.submit(measurement({ propertyId, value, unit }))).proposalId);
  for (const value of ["1500", null, false, {}, [], 1e13, -1]) {
    await assert.rejects(h.submit(measurement({ propertyId: "O02", value, unit: "MPa" })), status(400));
  }
  await assert.rejects(h.submit(measurement({ propertyId: "O02", value: 1.5, unit: "GPa" })), status(400));
  assert.ok((await h.submit(measurement({ propertyId: "O20", value: -20, unit: "°C" }))).proposalId);
});

test("approved measurements retain source, uncertainty, method, direction and conditioning", async t => {
  const h = harness(t);
  const proposed = measurement({
    propertyId: "O02", value: 1234, unit: "MPa", plusMinus: 45,
    plusMinusMeaning: "± type not specified by source", method: "ISO 527", direction: "Z",
    conditioning: "Wet; 48 hours in water", process: "FFF; annealed", sourceVersion: "Test version 2",
  });
  const proposal = await h.submit(proposed);
  await h.review(proposal.proposalId, 0);
  const data = await h.api.snapshot();
  const observation = data.measurements.find(m => m.id === `V-${proposal.proposalId}`);
  for (const field of [
    "materialId", "propertyId", "value", "unit", "plusMinus", "plusMinusMeaning", "method",
    "specimen", "direction", "conditioning", "process", "sourceVersion", "sourceLocation",
  ]) assert.equal(observation[field], proposed[field], field);
  assert.equal(data.sources.find(s => s.id === observation.sourceId).url, proposed.sourceUrl);
  assert.equal(data.history.length, 1);
  assert.equal(data.history[0].proposalId, proposal.proposalId);
});

test("uncertainty is preserved for the same observation and not copied across changed sources", async t => {
  const h = harness(t);
  const original = seed.measurements.find(m => m.id === "M002");
  const source = seed.sources.find(s => s.id === original.sourceId);
  const same = measurement({
    ...original, kind: "correction", measurementId: original.id,
    sourceUrl: source.url, sourceTitle: source.title,
  });
  delete same.plusMinus;
  delete same.plusMinusMeaning;
  const first = await h.submit(same);
  await h.review(first.proposalId, 0);
  assert.equal((await h.api.snapshot()).measurements.find(m => m.id === "M002").plusMinus, 100);
  const different = await h.submit({
    ...same, baseRevision: 1, sourceUrl: "https://example.org/different-source", sourceVersion: "Different source",
  });
  await h.review(different.proposalId, 1);
  const corrected = (await h.api.snapshot()).measurements.find(m => m.id === "M002");
  assert.equal(corrected.plusMinus, null);
  assert.equal(corrected.plusMinusMeaning, "Belirtilmemiş");
});

test("reverts append history and refuse to overwrite a newer correction", async t => {
  const h = harness(t);
  const proposal = await h.submit(measurement());
  const added = await h.review(proposal.proposalId, 0);
  const initialHistory = plain((await h.api.snapshot()).history);
  const corrected = await h.submit(measurement({
    kind: "correction", measurementId: `V-${proposal.proposalId}`, value: 1.4, baseRevision: 1,
  }));
  const correction = await h.review(corrected.proposalId, 1);
  await assert.rejects(h.revert(added.eventId, 2), status(409));
  assert.equal((await h.api.snapshot()).revision, 2);
  const reverted = await h.revert(correction.eventId, 2);
  let data = await h.api.snapshot();
  assert.equal(data.measurements.find(m => m.id === `V-${proposal.proposalId}`).value, 1.3);
  assert.deepEqual(plain(data.history.find(e => e.id === added.eventId)), initialHistory[0]);
  await h.revert(reverted.eventId, 3);
  data = await h.api.snapshot();
  assert.equal(data.measurements.find(m => m.id === `V-${proposal.proposalId}`).value, 1.4);
  assert.equal(data.history.length, 4);
});

test("a pending observation cannot be approved after its material is removed", async t => {
  const h = harness(t);
  const materialProposal = await h.submit(material("Temporary material"));
  const addedMaterial = await h.review(materialProposal.proposalId, 0);
  const pending = await h.submit(measurement({ materialId: `M-${materialProposal.proposalId}`, baseRevision: 1 }));
  await h.revert(addedMaterial.eventId, 1);
  await assert.rejects(h.review(pending.proposalId, 2), status(409));
  const data = await h.api.snapshot();
  assert.equal(data.revision, 2);
  assert.ok(!data.measurements.some(m => m.id === `V-${pending.proposalId}`));
});

test("material dependencies block deletion and restoring an observation before its material", async t => {
  const h = harness(t);
  const materialProposal = await h.submit(material("Dependency material"));
  const addedMaterial = await h.review(materialProposal.proposalId, 0);
  const observationProposal = await h.submit(measurement({ materialId: `M-${materialProposal.proposalId}`, baseRevision: 1 }));
  const addedObservation = await h.review(observationProposal.proposalId, 1);
  await assert.rejects(h.revert(addedMaterial.eventId, 2), status(409));
  const removedObservation = await h.revert(addedObservation.eventId, 2);
  const removedMaterial = await h.revert(addedMaterial.eventId, 3);
  await assert.rejects(h.revert(removedObservation.eventId, 4), status(409));
  assert.equal((await h.api.snapshot()).revision, 4);
  await h.revert(removedMaterial.eventId, 4);
  await h.revert(removedObservation.eventId, 5);
  const data = await h.api.snapshot();
  assert.equal(data.revision, 6);
  assert.ok(data.materials.some(m => m.id === `M-${materialProposal.proposalId}`));
  assert.ok(data.measurements.some(m => m.id === `V-${observationProposal.proposalId}`));
});

test("same actor and Istanbul day share a group while all immutable events remain", async t => {
  const h = harness(t, { now: "2026-11-06T21:30:00.000Z" });
  const first = await h.submit(material("Daily group A"));
  const second = await h.submit(material("Daily group B"));
  await h.review(first.proposalId, 0);
  await h.review(second.proposalId, 1);
  let data = await h.api.snapshot();
  assert.equal(data.history.length, 2);
  assert.equal(data.history[0].groupId, data.history[1].groupId);
  assert.match(data.history[0].groupId, /\|2026-11-07$/);
  const firstEvents = plain(data.history);
  h.setTime("2026-11-07T21:30:00.000Z");
  const third = await h.submit(material("Daily group C", 2));
  await h.review(third.proposalId, 2);
  data = await h.api.snapshot();
  assert.match(data.history[0].groupId, /\|2026-11-08$/);
  assert.notEqual(data.history[0].groupId, firstEvents[0].groupId);
  const thirdGroup = data.history[0].groupId;
  h.setUser(CONTRIBUTOR);
  const fourth = await h.submit(material("Daily group D", 3));
  h.setUser(SECOND_REVIEWER);
  await h.review(fourth.proposalId, 3);
  data = await h.api.snapshot();
  assert.notEqual(data.history[0].groupId, thirdGroup);
  assert.equal(data.history[0].actorName, SECOND_REVIEWER.fullName);
  for (const event of firstEvents) assert.deepEqual(plain(data.history.find(e => e.id === event.id)), event);
  assert.equal(data.history.length, 4);
});

test("parallel identical submissions are idempotent even when both duplicate reads are stale", async t => {
  const h = harness(t, { readDelay: 10 });
  const body = { ...material("Concurrent idempotent candidate"), requestId: "parallel-idempotent-0001" };
  const responses = await Promise.all([h.submit(body), h.submit(body)]);
  assert.equal(responses[0].proposalId, responses[1].proposalId);
  assert.equal(responses.filter(r => r.duplicate).length, 1);
  assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM proposals").get().n, 1);
  assert.equal((await h.api.snapshot()).revision, 0);
});

test("competing approvals use one revision atomically and return 409 without partial loser writes", async t => {
  const h = harness(t, { readDelay: 10 });
  const first = await h.submit(measurement({ value: 1.31 }));
  const second = await h.submit(measurement({ value: 1.32 }));
  const outcomes = await Promise.allSettled([
    h.review(first.proposalId, 0), h.review(second.proposalId, 0),
  ]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  const failed = outcomes.find(r => r.status === "rejected");
  assert.equal(failed.reason.status, 409);
  let data = await h.api.snapshot();
  assert.equal(data.revision, 1);
  assert.equal(data.history.length, 1);
  const winner = data.history[0].proposalId;
  const loser = winner === first.proposalId ? second.proposalId : first.proposalId;
  assert.ok(data.measurements.some(m => m.id === `V-${winner}`));
  assert.ok(data.sources.some(s => s.id === `S-${winner}`));
  assert.ok(!data.measurements.some(m => m.id === `V-${loser}`));
  assert.ok(!data.sources.some(s => s.id === `S-${loser}`));
  assert.equal(h.sqlite.prepare("SELECT status FROM proposals WHERE id=?").get(loser).status, "pending");
  await h.review(loser, 1);
  data = await h.api.snapshot();
  assert.equal(data.revision, 2);
  assert.equal(data.history.length, 2);
});
