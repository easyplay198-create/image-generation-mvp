import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { P2WorkspacePrincipalResolver } from "../../src/auth/workspace-membership-scope";
import { createDatabaseClient, type DatabaseClient, type TransactionClient } from "../../src/storage/database";
import { createP2ProductProject } from "../../src/projects/product-project";
import { activateP2ProductTruthRevision, createP2ProductTruthRevision } from "../../src/truth/product-truth-revision";
import { createP2AssetTask } from "../../src/tasks/asset-task";
import { createP2AssetTaskHttpHandlers } from "../../src/http/p2-asset-task-api";
import { executeInternalAssetTask, exactInternalObject, internalIds, INTERNAL_PNG, type InternalObject, type InternalObjectStore } from "../../src/tasks/internal-asset-task-execution";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString || !["127.0.0.1", "localhost"].includes(new URL(connectionString).hostname)) throw Error("S1I requires an isolated loopback test database");
const SOURCE_COMMIT = "2dd6c6d7d50680d3e25579f4d6a562eede756b25";
const PRODUCT_VERSION = "0.1.0";
const migrationName = "20260905002000_p2_internal_attempt_artifact_lineage";
const migrationPath = join(process.cwd(), "prisma/migrations", migrationName, "migration.sql");
const migration = readFileSync(migrationPath, "utf8");
let database: DatabaseClient;
beforeAll(() => { database = createDatabaseClient(connectionString); });
afterAll(async () => { await database.$disconnect(); });

function storeHarness(mode = "success") {
  let object: InternalObject | null = null, puts = 0, deletes = 0, executions = 0, constructions = 0;
  const storage: InternalObjectStore = {
    async putObject(_key, value) {
      puts++;
      if (mode === "absent") return "ABSENT";
      if (mode === "unknown-absent") return "UNKNOWN";
      if (mode === "confirmed-absent") return "CONFIRMED";
      object = mode === "mismatch" ? { ...value, metadata: { ...value.metadata, sha256: "wrong" } } : value;
      return mode === "unknown" || mode === "mismatch" || mode === "unreadable" ? "UNKNOWN" : "CONFIRMED";
    },
    async readObject() { if (mode === "unreadable") throw Error("injected-read"); return object; },
    async deleteExact() { deletes++; if (mode === "delete-failed") return false; object = null; return true; },
  };
  return {
    storage,
    createRuntime() { constructions++; return { storage, async execute() { executions++; if (mode === "executor-failed") throw Error("injected-executor"); return mode === "invalid-output" ? new Uint8Array(68) : Buffer.from(INTERNAL_PNG.base64, "base64"); } }; },
    counts() { return { puts, deletes, executions, constructions }; },
    replaceObject(value: InternalObject | null) { object = value; },
  };
}

async function taskFixture(label: string) {
  const fixture = await createActiveTruthFixture(label);
  const task = await createP2AssetTask(database, { projectId: fixture.projectId, taskType: "INTERNAL_SINGLE_IMAGE", assetClass: "IMAGE", outputPurpose: "INTERNAL_TEST", truthRevisionId: fixture.truthRevisionId, productSourceSnapshotId: fixture.sourceSnapshotId }, resolverFor(fixture.identity));
  return { ...fixture, assetTaskId: task.assetTaskId };
}
type Fixture = Awaited<ReturnType<typeof taskFixture>>;
const BUILD_EVIDENCE = Object.freeze({ sourceCommit: SOURCE_COMMIT, productVersion: PRODUCT_VERSION });
function handlers(f: Fixture, h: ReturnType<typeof storeHarness>, db = database) { return createP2AssetTaskHttpHandlers({ database: db, principalResolver: resolverFor(f.identity), createRuntime: h.createRuntime, readObject: h.storage.readObject, buildEvidence: BUILD_EVIDENCE, createRequestId: () => "s1i-first-request" }); }
function taskContext(f: Fixture) { return { params: Promise.resolve({ projectId: f.projectId, assetTaskId: f.assetTaskId }) }; }
function execute(h: ReturnType<typeof handlers>, f: Fixture) { return h.execute(new Request("https://example.test/execute", { method: "POST" }), taskContext(f)); }
function contentContext(f: Fixture) { const ids = internalIds(f.assetTaskId); return { params: Promise.resolve({ projectId: f.projectId, assetTaskId: f.assetTaskId, artifactId: ids.artifact, artifactRevisionId: ids.revision }) }; }

// Failure injection wraps genuine transactions: after-commit failures are not simulated rollbacks.
function injectedDatabase(phase: "claim" | "finalize" | "terminal", afterCommit: boolean, state?: string, rereadUnavailable = false) {
  let injected = false;
  return new Proxy(database, {
    get(target, property) {
      if (property === "$transaction") return async (operation: (tx: TransactionClient) => Promise<unknown>, options: object) => {
        if (injected && rereadUnavailable) throw Error("injected-reread-unavailable");
        let matches = false;
        const value = await target.$transaction(async (tx) => operation(new Proxy(tx, {
          get(t, p) {
            if (p === "assetTask") return new Proxy(t.assetTask, { get(d, key) {
              if (key === "update") return async (...args: Parameters<typeof d.update>) => {
                const next = args[0].data.status;
                matches = phase === "claim" && next === "RUNNING" || phase === "finalize" && next === "SUCCEEDED" || phase === "terminal" && (next === "FAILED" || next === "HARD_BLOCKED");
                if (matches && !injected && !afterCommit) { injected = true; throw Object.assign(Error("injected-rollback"), { code: state }); }
                return d.update(...args);
              };
              const v = Reflect.get(d, key, d); return typeof v === "function" ? v.bind(d) : v;
            } });
            const v = Reflect.get(t, p, t); return typeof v === "function" ? v.bind(t) : v;
          },
        }) as TransactionClient), options);
        if (matches && !injected && afterCommit) { injected = true; throw Error("injected-commit-ack-loss"); }
        return value;
      };
      const v = Reflect.get(target, property, target); return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

describe.sequential("S1I internal attempt and immutable artifact lineage", () => {
  it("commits one frozen lineage, replays without calls, and serves only verified selected bytes", async () => {
    const f = await taskFixture("success"), h = storeHarness(), api = handlers(f, h);
    const response = await execute(api, f);
    expect(response.status).toBe(201);
    expect((await response.json()).requestId).toBe("s1i-first-request");
    const replay = await execute(api, f); expect(replay.status).toBe(201);
    expect(h.counts()).toEqual({ puts: 1, deletes: 0, executions: 1, constructions: 1 });
    const found = await api.get(new Request("https://example.test"), taskContext(f));
    expect(found.status).toBe(200);
    expect((await found.json()).assetTask).toMatchObject({ status: "SUCCEEDED", generationAttemptSummary: { status: "SUCCEEDED" }, artifactRevisionSummary: { contentDigest: INTERNAL_PNG.digest } });
    const bytes = await api.content(new Request("https://example.test"), contentContext(f));
    expect(bytes.status).toBe(200); expect(Buffer.from(await bytes.arrayBuffer())).toEqual(Buffer.from(INTERNAL_PNG.base64, "base64"));
    h.replaceObject({ ...exactInternalObject(Buffer.from(INTERNAL_PNG.base64, "base64"), f.assetTaskId), bytes: new Uint8Array(68) });
    const corrupt = await api.content(new Request("https://example.test"), contentContext(f));
    expect(corrupt.status).toBe(502); expect((await corrupt.json()).error.code).toBe("ARTIFACT_CONTENT_INTEGRITY_MISMATCH");
    const ids = internalIds(f.assetTaskId);
    expect(await database.generationAttempt.count({ where: { assetTaskId: f.assetTaskId } })).toBe(1);
    expect(await database.p2DomainEvent.count({ where: { eventId: { in: [ids.startedEvent, ids.createdEvent] } } })).toBe(2);
    expect(await database.artifactRevisionSourceLink.findFirst({ where: { assetTaskId: f.assetTaskId } })).toMatchObject({ sourceSnapshotId: f.sourceSnapshotId, inheritedFromAttemptId: ids.attempt });
  });
  it.each([
    ["absent", 409, "FAILED", "OBJECT_WRITE_FAILED_COMPENSATED"],
    ["unknown-absent", 409, "FAILED", "OBJECT_WRITE_FAILED_COMPENSATED"],
    ["confirmed-absent", 503, "HARD_BLOCKED", "OBJECT_WRITE_FAILED_COMPENSATION_FAILED"],
    ["unknown", 201, "SUCCEEDED", null],
    ["mismatch", 503, "HARD_BLOCKED", "OBJECT_WRITE_FAILED_COMPENSATION_FAILED"],
    ["unreadable", 503, "HARD_BLOCKED", "OBJECT_WRITE_FAILED_COMPENSATION_FAILED"],
    ["executor-failed", 409, "FAILED", "INTERNAL_TEST_EXECUTOR_FAILED"],
    ["invalid-output", 409, "FAILED", "INTERNAL_TEST_OUTPUT_INVALID"],
  ] as const)("resolves object/executor outcome %s without retry or unsafe deletion", async (mode, status, taskStatus, failureCode) => {
    const f = await taskFixture(mode), h = storeHarness(mode);
    expect((await execute(handlers(f, h), f)).status).toBe(status);
    expect(await database.assetTask.findUnique({ where: { assetTaskId: f.assetTaskId } })).toMatchObject({ status: taskStatus, failureCode });
    expect(h.counts().deletes).toBe(0); expect(h.counts().puts).toBe(mode.includes("executor") || mode === "invalid-output" ? 0 : 1);
  });
  it.each([false, true])("finalize rollback resolves absence before compensation; delete failure=%s", async (deleteFailure) => {
    const f = await taskFixture("finalize"), h = storeHarness(deleteFailure ? "delete-failed" : "success");
    const response = await execute(handlers(f, h, injectedDatabase("finalize", false)), f);
    expect(response.status).toBe(deleteFailure ? 503 : 409);
    expect(h.counts().deletes).toBe(1);
    expect(await database.artifact.count({ where: { assetTaskId: f.assetTaskId } })).toBe(0);
    expect(await database.assetTask.findUnique({ where: { assetTaskId: f.assetTaskId } })).toMatchObject({ status: deleteFailure ? "HARD_BLOCKED" : "FAILED", failureCode: deleteFailure ? "FINALIZE_FAILED_COMPENSATION_FAILED" : "FINALIZE_FAILED_COMPENSATED" });
  });
  it.each(["claim", "finalize", "terminal"] as const)("resolves a real %s commit with lost acknowledgment by authoritative reread", async (phase) => {
    const f = await taskFixture(`commit-${phase}`), h = storeHarness(phase === "terminal" ? "absent" : "success");
    const response = await execute(handlers(f, h, injectedDatabase(phase, true)), f);
    expect(response.status).toBe(phase === "claim" ? 202 : phase === "finalize" ? 201 : 409);
    expect(h.counts().constructions).toBe(phase === "claim" ? 0 : 1);
    expect(h.counts().deletes).toBe(0);
  });
  it("fails closed for claim rollback, unavailable reread, and resolves terminal rollback as coherent RUNNING", async () => {
    for (const unavailable of [false, true]) {
      const f = await taskFixture(`claim-rollback-${unavailable}`), h = storeHarness();
      const response = await execute(handlers(f, h, injectedDatabase("claim", false, undefined, unavailable)), f);
      expect(response.status).toBe(503); expect((await response.json()).error.code).toBe("DATABASE_COMMIT_OUTCOME_UNKNOWN");
      expect(h.counts()).toEqual({ puts: 0, deletes: 0, executions: 0, constructions: 0 });
    }
    const f = await taskFixture("terminal-rollback"), h = storeHarness("absent");
    const response = await execute(handlers(f, h, injectedDatabase("terminal", false)), f);
    expect(response.status).toBe(202); expect((await response.json()).status).toBe("RUNNING");
    expect(h.counts().deletes).toBe(0);
  });
  it.each([["40001", "DATABASE_TRANSACTION_RETRY_REQUIRED"], ["40P01", "DATABASE_TRANSACTION_RETRY_REQUIRED"], ["55P03", "ASSET_TASK_CLAIM_LOCK_TIMEOUT"]])("maps SQLSTATE %s and makes zero external calls", async (state, code) => {
    const f = await taskFixture(state), h = storeHarness();
    const response = await execute(handlers(f, h, injectedDatabase("claim", false, state)), f);
    expect(response.status).toBe(503); expect((await response.json()).error.code).toBe(code);
    expect(h.counts()).toEqual({ puts: 0, deletes: 0, executions: 0, constructions: 0 });
    expect(await database.generationAttempt.count({ where: { assetTaskId: f.assetTaskId } })).toBe(0);
  });
  it("hides tasks and content in another project or Workspace", async () => {
    const f = await taskFixture("tenant-a"), other = await taskFixture("tenant-b"), h = storeHarness();
    expect((await execute(handlers(other, h), f)).status).toBe(404);
    expect((await execute(handlers(f, h), { ...f, projectId: other.projectId })).status).toBe(404);
    expect(h.counts().puts).toBe(0);
  });
  it("fails closed when a locked QUEUED task has an orphan attempt graph", async () => {
    const f = await taskFixture("queued-orphan"), h = storeHarness();
    const ids = internalIds(f.assetTaskId);
    await database.generationAttempt.create({ data: {
      generationAttemptId: ids.attempt, workspaceId: f.identity.workspaceId,
      projectId: f.projectId, assetTaskId: f.assetTaskId, trigger: "INITIAL",
      autoRedoOrdinal: 0, idempotencyKey: ids.idempotencyKey,
      inputFingerprint: "0".repeat(64), truthRevisionId: f.truthRevisionId,
      provider: "INTERNAL_TEST", model: INTERNAL_PNG.model,
      promptVersion: INTERNAL_PNG.promptVersion, executorKind: INTERNAL_PNG.executorKind,
      status: "RUNNING", startedAt: new Date(),
    } });
    const response = await handlers(f, h).get(new Request("https://example.test"), taskContext(f));
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
    expect(h.counts()).toEqual({ puts: 0, deletes: 0, executions: 0, constructions: 0 });
  });
  it("rejects forbidden, delete, immutable, and no-state lineage mutations", async () => {
    const f = await taskFixture("immutable-guards"), h = storeHarness();
    expect((await execute(handlers(f, h), f)).status).toBe(201);
    const ids = internalIds(f.assetTaskId);
    const forbidden = [
      () => database.generationAttempt.update({ where: { generationAttemptId: ids.attempt }, data: { model: "MUTATED" } }),
      () => database.generationAttempt.update({ where: { generationAttemptId: ids.attempt }, data: { status: "SUCCEEDED" } }),
      () => database.generationAttempt.delete({ where: { generationAttemptId: ids.attempt } }),
      () => database.artifact.update({ where: { artifactId: ids.artifact }, data: { lifecycleStatus: "ACTIVE" } }),
      () => database.artifact.delete({ where: { artifactId: ids.artifact } }),
      () => database.artifactRevision.update({ where: { artifactRevisionId: ids.revision }, data: { status: "CANDIDATE" } }),
      () => database.artifactRevision.delete({ where: { artifactRevisionId: ids.revision } }),
      () => database.generationAttemptSourceLink.update({ where: { linkId: ids.attemptLink }, data: { linkStatus: "ACTIVE" } }),
      () => database.generationAttemptSourceLink.delete({ where: { linkId: ids.attemptLink } }),
      () => database.artifactRevisionSourceLink.update({ where: { linkId: ids.revisionLink }, data: { linkStatus: "ACTIVE" } }),
      () => database.artifactRevisionSourceLink.delete({ where: { linkId: ids.revisionLink } }),
    ];
    for (const mutate of forbidden) await expect(mutate()).rejects.toThrow();
    expect(await database.generationAttempt.count({ where: { generationAttemptId: ids.attempt } })).toBe(1);
    expect(await database.artifact.count({ where: { artifactId: ids.artifact } })).toBe(1);
    expect(await database.artifactRevision.count({ where: { artifactRevisionId: ids.revision } })).toBe(1);
    expect(await database.generationAttemptSourceLink.count({ where: { linkId: ids.attemptLink } })).toBe(1);
    expect(await database.artifactRevisionSourceLink.count({ where: { linkId: ids.revisionLink } })).toBe(1);
  });
  it("proves session B blocks on session A's scoped row lock, using a third observer", async () => {
    const f = await taskFixture("row-lock"), h = storeHarness();
    let release!: () => void, acquired!: () => void;
    const released = new Promise<void>((r) => { release = r; }), locked = new Promise<void>((r) => { acquired = r; });
    const pids: Record<string, number> = {};
    const wrapped = (name: string) => new Proxy(database, { get(target, prop) {
      if (prop === "$transaction") return (operation: (tx: TransactionClient) => Promise<unknown>, options: object) => target.$transaction(async (tx) => {
        const pid = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        return operation(new Proxy(tx, { get(t, p) {
          if (p === "$queryRaw") return async (...args: Parameters<typeof t.$queryRaw>) => {
            const query = args[0] as { strings?: readonly string[]; text?: string };
            const text = query.text ?? query.strings?.join("") ?? "";
            const rowLock = text.includes('FROM "AssetTask"') && text.includes("FOR UPDATE");
            if (rowLock && !pids[name]) pids[name] = pid[0].pid;
            const value = await t.$queryRaw(...args);
            if (rowLock && name === "a" && pids.a === pid[0].pid) { acquired(); await released; }
            return value;
          };
          const v = Reflect.get(t, p, t); return typeof v === "function" ? v.bind(t) : v;
        } }) as TransactionClient);
      }, { ...options, timeout: 15000 });
      const v = Reflect.get(target, prop, target); return typeof v === "function" ? v.bind(target) : v;
    } });
    let enterExecutor!: () => void, releaseExecutor!: () => void;
    const executorEntered = new Promise<void>((resolveEntered) => { enterExecutor = resolveEntered; });
    const executorRelease = new Promise<void>((resolveExecution) => { releaseExecutor = resolveExecution; });
    const winnerRuntime = () => {
      const runtime = h.createRuntime();
      return { ...runtime, async execute() { enterExecutor(); await executorRelease; return runtime.execute(); } };
    };
    const a = executeInternalAssetTask({ database: wrapped("a"), principalResolver: resolverFor(f.identity), createRuntime: winnerRuntime, buildEvidence: BUILD_EVIDENCE }, f, "winner");
    await locked;
    const b = executeInternalAssetTask({ database: wrapped("b"), principalResolver: resolverFor(f.identity), createRuntime: h.createRuntime, buildEvidence: BUILD_EVIDENCE }, f, "loser");
    const observer = new Client({ connectionString }); await observer.connect();
    try {
      let proof: { blockers: number[]; wait_event_type: string; waiting_locks: string } | undefined;
      for (let i = 0; i < 100; i++) {
        if (pids.b) proof = (await observer.query('SELECT pg_blocking_pids(pid) AS blockers, wait_event_type, (SELECT count(*)::text FROM pg_locks WHERE pid=$1 AND NOT granted) AS waiting_locks FROM pg_stat_activity WHERE pid=$1', [pids.b])).rows[0];
        if (proof?.blockers.includes(pids.a)) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(proof?.blockers).toContain(pids.a); expect(proof?.wait_event_type).toBe("Lock"); expect(Number(proof?.waiting_locks)).toBeGreaterThan(0);
      console.log("S1I_ROW_LOCK_PROOF", JSON.stringify({ pids, ...proof }));
    } finally { release(); await observer.end(); }
    await executorEntered;
    const loser = await b;
    expect(loser.status).toBe(202);
    releaseExecutor();
    const winner = await a;
    const outcomes = [winner, loser];
    expect(outcomes.map((outcome) => outcome.status)).toEqual([201, 202]);
    expect(outcomes.map((o) => o.requestId)).toEqual(["winner", "winner"]);
    expect(h.counts()).toEqual({ puts: 1, deletes: 0, executions: 1, constructions: 1 });
    expect(await database.generationAttempt.count({ where: { assetTaskId: f.assetTaskId } })).toBe(1);
    expect(await database.p2DomainEvent.count({ where: { eventId: internalIds(f.assetTaskId).startedEvent } })).toBe(1);
  }, 20000);
});

const catalogQuery = `SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relkind,c.relowner,c.relacl) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0),
 'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname='public'),
 'enums',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'),
 'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
 'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
) AS snapshot`;

const finalCatalogQuery = `SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,pg_get_userbyid(c.relowner)=current_user,c.relacl) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('AssetTask','P2DomainEvent','SourceSnapshot','GenerationAttempt','GenerationAttemptSourceLink','Artifact','ArtifactRevision','ArtifactRevisionSourceLink')),
 'columns',(SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname IN ('AssetTask','P2DomainEvent','SourceSnapshot','GenerationAttempt','GenerationAttemptSourceLink','Artifact','ArtifactRevision','ArtifactRevisionSourceLink') AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.relname,k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,k.confdeltype,k.confupdtype,pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('AssetTask','P2DomainEvent','SourceSnapshot','GenerationAttempt','GenerationAttemptSourceLink','Artifact','ArtifactRevision','ArtifactRevisionSourceLink')),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(tablename,indexname,indexdef) ORDER BY tablename,indexname) FROM pg_indexes WHERE schemaname='public' AND tablename IN ('AssetTask','P2DomainEvent','SourceSnapshot','GenerationAttempt','GenerationAttemptSourceLink','Artifact','ArtifactRevision','ArtifactRevisionSourceLink')),
 'enums',(SELECT jsonb_agg(jsonb_build_array(t.typname,e.enumlabel) ORDER BY t.typname,e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname IN ('AssetTaskStatus','GenerationAttemptTrigger','GenerationAttemptProvider','GenerationAttemptExecutorKind','GenerationAttemptStatus','ArtifactLifecycleStatus','ArtifactRevisionOrigin','ArtifactRevisionStatus','P2SourceLineageRole','P2SourceLineageStatus')),
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.proname,p.pronargs,format_type(p.prorettype,NULL),l.lanname,p.prosecdef,p.provolatile,p.proconfig,p.proacl,pg_get_userbyid(p.proowner)=current_user,replace(p.prosrc,E'\r\n',E'\n')) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND p.proname IN ('p2_guard_asset_task_change','p2_guard_generation_attempt_change','p2_guard_artifact_change','p2_reject_artifact_revision_change','p2_reject_generation_attempt_source_link_change','p2_reject_artifact_revision_source_link_change')),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgtype,t.tgenabled,p.proname,pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname IN ('AssetTask','GenerationAttempt','GenerationAttemptSourceLink','Artifact','ArtifactRevision','ArtifactRevisionSourceLink'))
)::text AS snapshot`;
const FINAL_CATALOG_SHA256 = "5fc025790bf82ee073b87fb662ac615fa8f2e741ae31e4d9f1dc97582034d1d5";
const FINAL_CATALOG_BYTES = 55690;

describe.sequential("S1I frozen predecessor migration, catalog and rollback", () => {
  it("upgrades the immediate predecessor once, preserves old rows and NULL semantics, and proves exact rollback", async () => {
    let containerId: string | null = null;
    let admin: Client | undefined, primary: Client | undefined, client: Client | undefined;
    let name: string | undefined, scratch: string | undefined;
    try {
    let upgradeUrl = process.env.S1I_UPGRADE_DATABASE_URL;
    if (!upgradeUrl) {
      if (process.env.CI !== "true") throw Error("S1I_UPGRADE_DATABASE_URL must identify a second PostgreSQL 17 cluster");
      containerId = execFileSync("docker", ["run", "--detach", "--rm", "--pull=never", "-e", "POSTGRES_USER=s1i_upgrade", "-e", "POSTGRES_PASSWORD=s1i_upgrade", "-e", "POSTGRES_DB=postgres", "-p", "127.0.0.1::5432", "postgres:17-alpine"], { encoding: "utf8", timeout: 30000 }).trim();
      const mapping = execFileSync("docker", ["port", containerId, "5432/tcp"], { encoding: "utf8", timeout: 10000 }).trim();
      const port = mapping.match(/:(\d+)$/u)?.[1];
      if (!port) throw Error("Unable to determine isolated upgrade cluster port");
      upgradeUrl = `postgresql://s1i_upgrade:s1i_upgrade@127.0.0.1:${port}/postgres`;
      for (let attempt = 0; attempt < 40; attempt++) {
        const probe = new Client({ connectionString: upgradeUrl });
        try { await probe.connect(); await probe.end(); break; }
        catch { await probe.end().catch(() => undefined); if (attempt === 39) throw Error("Isolated upgrade cluster did not become ready"); await new Promise((resolveReady) => setTimeout(resolveReady, 250)); }
      }
    }
    const adminUrl = new URL(upgradeUrl);
    if (!["127.0.0.1", "localhost"].includes(adminUrl.hostname)) throw Error("Upgrade fixture must be loopback");
    adminUrl.pathname = "/postgres";
    admin = new Client({ connectionString: adminUrl.href }); await admin.connect();
    primary = new Client({ connectionString }); await primary.connect();
    const primaryIdentity = (await primary.query("SELECT system_identifier::text FROM pg_control_system()" )).rows[0].system_identifier;
    const upgradeIdentity = (await admin.query("SELECT system_identifier::text FROM pg_control_system()" )).rows[0].system_identifier;
    const primaryVersion = (await primary.query("SHOW server_version_num")).rows[0].server_version_num;
    const upgradeVersion = (await admin.query("SHOW server_version_num")).rows[0].server_version_num;
    if (!/^17/u.test(primaryVersion) || !/^17/u.test(upgradeVersion)) throw Error("Both clusters must be PostgreSQL 17");
    await primary.end(); primary = undefined;
    if (primaryIdentity === upgradeIdentity) throw Error("Upgrade fixture must use a distinct PostgreSQL cluster identity");
    name = `s1i_upgrade_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    const fixtureUrl = new URL(adminUrl); fixtureUrl.pathname = `/${name}`;
    client = new Client({ connectionString: fixtureUrl.href }); await client.connect();
    scratch = mkdtempSync(join(tmpdir(), "s1i-upgrade-"));
      const root = join(process.cwd(), "prisma/migrations"), copy = join(scratch, "migrations");
      for (const entry of readdirSync(root)) if (entry !== migrationName) cpSync(join(root, entry), join(copy, entry), { recursive: true });
      const config = join(scratch, "prisma.config.ts");
      const configure = (path: string) => writeFileSync(config, `export default ${JSON.stringify({ schema: join(process.cwd(), "prisma/schema.prisma"), migrations: { path }, datasource: { url: fixtureUrl.href } })};\n`);
      const deploy = () => execFileSync(process.execPath, [join(process.cwd(), "node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", config], { encoding: "utf8", timeout: 60000 });
      configure(copy); deploy();
      expect((await client.query("SHOW server_version_num")).rows[0].server_version_num).toMatch(/^17/);
      await client.query(`INSERT INTO "UserActor" ("userActorId","authIssuer","authSubject",status) VALUES ('upgrade-actor','urn:test:upgrade','upgrade','ACTIVE'); INSERT INTO "Workspace" ("workspaceId","displayName",status,"createdByActorId") VALUES ('upgrade-workspace','Upgrade','ACTIVE','upgrade-actor'); INSERT INTO "Membership" ("membershipId","workspaceId","userActorId",role,status) VALUES ('upgrade-membership','upgrade-workspace','upgrade-actor','OWNER','ACTIVE'); INSERT INTO "ProductProject" ("projectId","workspaceId","skuIdentityKey","displayName",status,"createdByActorId") VALUES ('upgrade-project','upgrade-workspace','upgrade-sku','Upgrade','DRAFT','upgrade-actor');`);
      const persistedOldBodies = [
        { truthRevisionId: "truth", parentRevisionId: null, previousActiveTruthRevisionId: null, projectId: "upgrade-project", extra: "preserved" },
        { truthRevisionId: "truth", parentRevisionId: "parent", previousActiveTruthRevisionId: null, projectId: "upgrade-project", extra: "preserved" },
        { truthRevisionId: "truth", parentRevisionId: null, previousActiveTruthRevisionId: "previous", projectId: "upgrade-project", extra: "preserved" },
        { truthRevisionId: "truth", parentRevisionId: "parent", previousActiveTruthRevisionId: "previous", projectId: "upgrade-project", extra: "preserved" },
      ];
      for (const [index, body] of persistedOldBodies.entries()) await client.query(`INSERT INTO "P2DomainEvent" ("eventId","eventType","eventSchemaVersion","workspaceId","projectId","actorType","actorId","requestId","correlationId","sourceCommit","productVersion","eventBody") VALUES ($1,'truth_revision.activated.v1',1,'upgrade-workspace','upgrade-project','USER_ACTOR','upgrade-actor',$2,$2,$3,'0.1.0',$4::jsonb)`, [`upgrade-event-${index}`, `upgrade-request-${index}`, SOURCE_COMMIT, JSON.stringify(body)]);
      const oldChecks = (await client.query(`SELECT conname, pg_get_expr(conbin,conrelid) AS expr FROM pg_constraint WHERE conrelid='"P2DomainEvent"'::regclass AND conname IN ('P2DomainEvent_type_check','P2DomainEvent_body_check') ORDER BY conname`)).rows as { conname: string; expr: string }[];
      const before = (await client.query(catalogQuery)).rows[0].snapshot;
      const sentinel = "-- ROLLBACK_PROBE_INJECTION_POINT_P2_S1I_COMPAT_DDL_V1";
      expect(migration.split(sentinel)).toHaveLength(2);
      await expect(client.query(migration.replace(sentinel, `${sentinel}\nRAISE EXCEPTION 'S1I_INJECTED_ROLLBACK';`))).rejects.toThrow("S1I_INJECTED_ROLLBACK");
      await client.query("ROLLBACK");
      expect((await client.query(catalogQuery)).rows[0].snapshot).toEqual(before);
      configure(root); const first = deploy(); expect(first).toContain(migrationName);
      const second = deploy(); expect(second).toContain("No pending migrations");
      const finalCatalog = (await client.query(finalCatalogQuery)).rows[0].snapshot as string;
      expect(Buffer.byteLength(finalCatalog, "utf8")).toBe(FINAL_CATALOG_BYTES);
      expect(createHash("sha256").update(finalCatalog).digest("hex")).toBe(FINAL_CATALOG_SHA256);
      expect((await client.query('SELECT "eventBody" FROM "P2DomainEvent" WHERE "eventId" LIKE \'upgrade-event-%\' ORDER BY "eventId"')).rows.map((row) => row.eventBody)).toEqual(persistedOldBodies);
      const record = (await client.query('SELECT checksum,finished_at,rolled_back_at FROM "_prisma_migrations" WHERE migration_name=$1', [migrationName])).rows;
      expect(record).toHaveLength(1); expect(record[0].checksum).toBe(createHash("sha256").update(readFileSync(migrationPath)).digest("hex")); expect(record[0].finished_at).not.toBeNull(); expect(record[0].rolled_back_at).toBeNull();
      const newChecks = (await client.query(`SELECT conname, pg_get_expr(conbin,conrelid) AS expr FROM pg_constraint WHERE conrelid='"P2DomainEvent"'::regclass AND conname IN ('P2DomainEvent_type_check','P2DomainEvent_body_check') ORDER BY conname`)).rows as typeof oldChecks;
      const evaluate = async (checks: typeof oldChecks, type: string | null, body: unknown) => (await client!.query(`SELECT (${checks[0].expr}) AS body, (${checks[1].expr}) AS type FROM (SELECT $1::text AS "eventType", $2::jsonb AS "eventBody", 'project'::text AS "projectId") input`, [type, body === undefined ? null : JSON.stringify(body)])).rows[0];
      const oldBodies: unknown[] = [undefined, null, "string", 1, true, [], {}, { truthRevisionId: "truth", parentRevisionId: null, previousActiveTruthRevisionId: null, projectId: "project" }];
      for (const parent of [null, "parent"]) for (const previous of [null, "previous"]) oldBodies.push({ truthRevisionId: "truth", parentRevisionId: parent, previousActiveTruthRevisionId: previous, projectId: "project", extra: "preserved" });
      for (const body of oldBodies) expect(await evaluate(newChecks, "truth_revision.activated.v1", body)).toEqual(await evaluate(oldChecks, "truth_revision.activated.v1", body));
      const witnesses = [
        ["generation_attempt.started.v1", { assetTaskId: "task", autoRedoOrdinal: 0, generationAttemptId: "attempt", model: INTERNAL_PNG.model, provider: "INTERNAL_TEST", trigger: "INITIAL" }],
        ["artifact_revision.created.v1", { artifactRevisionId: "revision", assetTaskId: "task", contentDigest: INTERNAL_PNG.digest, kind: "IMAGE", origin: "SYSTEM_LAYOUT" }],
      ] as const;
      for (const [type, body] of witnesses) {
        const old = await evaluate(oldChecks, type, body), current = await evaluate(newChecks, type, body);
        expect(old.type).toBe(false); expect(current).toEqual({ body: true, type: true });
        for (const invalid of [undefined, null, "string", 1, false, [], {}, { ...body, extra: true }, ...Object.keys(body).map((key) => ({ ...body, [key]: null })), ...Object.keys(body).map((key) => Object.fromEntries(Object.entries(body).filter(([k]) => k !== key)))]) expect((await evaluate(newChecks, type, invalid)).body).toBe(false);
      }
      expect((await evaluate(newChecks, "unknown", {})).type).toBe(false);
      const after = (await client.query(catalogQuery)).rows[0].snapshot;
      const guard = (rows: Record<string, unknown>[]) => rows.find((row) => row.proname === "p2_guard_asset_task_change")!;
      const oldGuard = guard(before.functions), newGuard = guard(after.functions);
      expect({ ...newGuard, prosrc: oldGuard.prosrc }).toEqual(oldGuard);
      const trigger = (rows: Record<string, unknown>[]) => rows.find((row) => row.tgname === "AssetTask_guard_change_trigger");
      expect(trigger(after.triggers)).toEqual(trigger(before.triggers));
      const pointers = (await client.query(`SELECT conname,condeferrable,condeferred,confdeltype,confupdtype FROM pg_constraint WHERE conname IN ('Artifact_selected_revision_fkey','AssetTask_current_artifact_revision_direct_fkey','AssetTask_current_selected_equivalence_fkey')`)).rows;
      expect(pointers).toHaveLength(3); for (const p of pointers) expect(p).toMatchObject({ condeferrable: true, condeferred: true, confdeltype: "r", confupdtype: "c" });
      console.log("S1I_UPGRADE_ROLLBACK_CATALOG_PASS", JSON.stringify({ name, migrationName, checksum: record[0].checksum, guardOid: oldGuard.oid, oldDomainCases: oldBodies.length, strictSupersetWitnesses: 2 }));
    } finally {
      const cleanupErrors: unknown[] = [];
      try { await client?.end(); } catch (error) { cleanupErrors.push(error); }
      try { if (admin && name) await admin.query(`DROP DATABASE IF EXISTS "${name}"`); } catch (error) { cleanupErrors.push(error); }
      try { await admin?.end(); } catch (error) { cleanupErrors.push(error); }
      try { await primary?.end(); } catch (error) { cleanupErrors.push(error); }
      try { if (containerId) execFileSync("docker", ["rm", "--force", containerId], { stdio: "ignore", timeout: 30000 }); } catch (error) { cleanupErrors.push(error); }
      try { if (scratch) { const resolved = resolve(scratch); if (!resolved.startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/")) || !resolved.includes("s1i-upgrade-")) throw Error("Unsafe cleanup target"); rmSync(resolved, { recursive: true }); } } catch (error) { cleanupErrors.push(error); }
      if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "S1I upgrade fixture cleanup failed");
    }
  }, 180000);
});

type SyntheticIdentity = {
  authIssuer: string;
  authSubject: string;
  userActorId: string;
  workspaceId: string;
  membershipId: string;
};

type ActiveTruthFixture = {
  identity: SyntheticIdentity;
  projectId: string;
  sourceSnapshotId: string;
  truthRevisionId: string;
};
async function createActiveTruthFixture(label: string): Promise<ActiveTruthFixture> {
  const identity = await createIdentity(label);
  const resolver = resolverFor(identity);
  const project = await createP2ProductProject(
    database,
    { displayName: `P2 S1I ${label}` },
    resolver,
  );
  const sourceSnapshotId = await createSource(
    identity,
    project.projectId,
    "primary",
  );
  const draft = await createP2ProductTruthRevision(
    database,
    {
      projectId: project.projectId,
      expectedCurrentRevisionId: null,
      parentRevisionId: null,
      truthBody: { name: `P2 S1I ${label} product` },
      productContinuity: "SAME_PRODUCT",
      sourceBindings: [
        {
          sourceSnapshotId,
          sourceRole: "PRODUCT_PRIMARY",
          sortOrder: 0,
        },
      ],
    },
    resolver,
  );
  const truthRevisionId = draft.revision.productTruthRevisionId;
  await activateP2ProductTruthRevision(
    database,
    {
      projectId: project.projectId,
      truthRevisionId,
      expectedCurrentRevisionId: null,
      requestId: `s1i-activate-request-${label}`,
      correlationId: `s1i-activate-correlation-${label}`,
      sourceCommit: SOURCE_COMMIT,
      productVersion: PRODUCT_VERSION,
    },
    resolver,
  );
  return {
    identity,
    projectId: project.projectId,
    sourceSnapshotId,
    truthRevisionId,
  };
}

async function createSource(
  identity: SyntheticIdentity,
  projectId: string,
  label: string,
): Promise<string> {
  const sourceSnapshotId = uniqueId(`${label}-source`);
  await database.sourceSnapshot.create({
    data: {
      sourceSnapshotId,
      workspaceId: identity.workspaceId,
      projectId,
      sourceKind: "PRODUCT_SOURCE",
      mediaType: "image/png",
      byteSize: BigInt(128),
      contentDigest: crypto
        .randomUUID()
        .replaceAll("-", "")
        .padEnd(64, "0"),
      storageLocator: `p2-test/${identity.workspaceId}/${projectId}/${sourceSnapshotId}.png`,
      validationStatus: "VALID",
      lifecycleStatus: "ACTIVE",
      createdByActorId: identity.userActorId,
    },
  });
  return sourceSnapshotId;
}

async function createIdentity(label: string): Promise<SyntheticIdentity> {
  const discriminator = crypto.randomUUID();
  const identity = {
    authIssuer: `urn:image-generation-mvp:test-only:p2-s1i:${label}`,
    authSubject: discriminator,
    userActorId: uniqueId(`${label}-actor`),
    workspaceId: uniqueId(`${label}-workspace`),
    membershipId: uniqueId(`${label}-membership`),
  };
  await database.$transaction(async (transaction) => {
    await transaction.userActor.create({
      data: {
        userActorId: identity.userActorId,
        authIssuer: identity.authIssuer,
        authSubject: identity.authSubject,
        status: "ACTIVE",
      },
    });
    await transaction.workspace.create({
      data: {
        workspaceId: identity.workspaceId,
        displayName: `P2 S1I ${label}`,
        status: "ACTIVE",
        createdByActorId: identity.userActorId,
      },
    });
    await transaction.membership.create({
      data: {
        membershipId: identity.membershipId,
        workspaceId: identity.workspaceId,
        userActorId: identity.userActorId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
  });
  return identity;
}

function resolverFor(identity: SyntheticIdentity): P2WorkspacePrincipalResolver {
  return Object.freeze({
    async resolve() {
      return {
        authIssuer: identity.authIssuer,
        authSubject: identity.authSubject,
        workspaceId: identity.workspaceId,
      };
    },
  });
}

function uniqueId(label: string): string { return `p2_s1i_${label}_${randomUUID()}`; }
