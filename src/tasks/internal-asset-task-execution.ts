import { createHash } from "node:crypto";

import { Prisma } from "@/src/generated/prisma/client";
import { P2AuthContextError, withP2WorkspaceMembershipScope, type P2AuthContext, type P2WorkspacePrincipalResolver } from "@/src/auth/workspace-membership-scope";
import type { DatabaseClient, TransactionClient } from "@/src/storage/database";

export const INTERNAL_PNG = Object.freeze({
  base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  digest: "431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460",
  digestBase64: "QxztaRaiohoVbjhwGv5Vu9f4iWn7v8Vtf+CZ1H8mVGA=",
  model: "INTERNAL_TEST_FIXED_PNG_1X1_V1",
  promptVersion: "INTERNAL_TEST_NO_PROMPT_V1",
  executorKind: "INTERNAL_TEST_PNG_V1" as const,
});

export class InternalExecutionError extends Error {
  constructor(readonly code: string, readonly durableRequestId?: string) {
    super(code);
    this.name = "InternalExecutionError";
  }
}

export function canonicalDigest(value: unknown): string {
  function serialize(v: unknown): string {
    if (typeof v === "string") return JSON.stringify(v.normalize("NFC"));
    if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(serialize).join(",")}]`;
    if (typeof v !== "object" || v === null) throw new InternalExecutionError("VALIDATION_FAILED");
    const record = v as Record<string, unknown>;
    const codePoints = (s: string) => Array.from(s, (c) => c.codePointAt(0)!);
    const compare = (a: string, b: string) => {
      const x = codePoints(a), y = codePoints(b);
      for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
      return x.length - y.length;
    };
    return `{${Object.keys(record).sort(compare).map((k) => `${JSON.stringify(k)}:${serialize(record[k])}`).join(",")}}`;
  }
  return createHash("sha256").update(serialize(value), "utf8").digest("hex");
}

export function internalIdentifier(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 256 || value.trim() !== value || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new InternalExecutionError("VALIDATION_FAILED");
  return value;
}

export function internalIds(assetTaskId: string) {
  const attempt = `p2:generation-attempt:${assetTaskId}:INITIAL:0`;
  const artifact = `p2:artifact:${assetTaskId}`;
  const revision = `${artifact}:revision:1`;
  return { attempt, artifact, revision, attemptLink: `${attempt}:source:0`, revisionLink: `${revision}:source:0`, startedEvent: `p2:event:generation-attempt:${attempt}:started:v1`, createdEvent: `p2:event:artifact-revision:${revision}:created:v1`, storageKey: `p2/internal-test/${attempt}/artifact-revision-1.png`, idempotencyKey: `p2:asset-task:${assetTaskId}:INITIAL:0` };
}

export type InternalObject = Readonly<{ bytes: Uint8Array; contentType: string; metadata: Readonly<Record<string, string>> }>;
export interface InternalObjectStore {
  putObject(key: string, object: InternalObject): Promise<"CONFIRMED" | "ABSENT" | "UNKNOWN">;
  readObject(key: string): Promise<InternalObject | null>;
  deleteExact(key: string, object: InternalObject): Promise<boolean>;
}
export type InternalRuntime = Readonly<{ execute(): Promise<Uint8Array>; storage: InternalObjectStore }>;
export type InternalExecutionDependencies = Readonly<{
  database: DatabaseClient;
  principalResolver?: P2WorkspacePrincipalResolver;
  createRuntime?: () => InternalRuntime;
  readObject?: (key: string) => Promise<InternalObject | null>;
  buildEvidence?: Readonly<{ sourceCommit: string; productVersion: string }>;
}>;

// Process-local test substitute only. Restart loses availability; it never fabricates a stored object.
let memoryStore: InternalObjectStore | undefined;
function defaultRuntime(): InternalRuntime {
  if (!memoryStore) {
    const objects = new Map<string, InternalObject>();
    const copy = (o: InternalObject): InternalObject => ({ bytes: Uint8Array.from(o.bytes), contentType: o.contentType, metadata: { ...o.metadata } });
    memoryStore = {
      async putObject(key, object) {
        if (objects.has(key)) return "UNKNOWN";
        objects.set(key, copy(object));
        return "CONFIRMED";
      },
      async readObject(key) { const o = objects.get(key); return o ? copy(o) : null; },
      async deleteExact(key, expected) {
        const actual = objects.get(key);
        if (!actual) return true;
        if (!sameObject(actual, expected)) return false;
        return objects.delete(key);
      },
    };
  }
  return { async execute() { return Buffer.from(INTERNAL_PNG.base64, "base64"); }, storage: memoryStore };
}

function sameObject(a: InternalObject, b: InternalObject): boolean {
  return Buffer.from(a.bytes).equals(Buffer.from(b.bytes)) && a.contentType === b.contentType && canonicalDigest(a.metadata) === canonicalDigest(b.metadata);
}
export function exactInternalObject(bytes: Uint8Array, assetTaskId: string): InternalObject {
  const b = Buffer.from(bytes);
  if (b.length !== 68 || !b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) || b.readUInt32BE(16) !== 1 || b.readUInt32BE(20) !== 1 || createHash("sha256").update(b).digest("hex") !== INTERNAL_PNG.digest || !b.equals(Buffer.from(INTERNAL_PNG.base64, "base64"))) throw new InternalExecutionError("INTERNAL_TEST_OUTPUT_INVALID");
  const ids = internalIds(assetTaskId);
  return { bytes: Uint8Array.from(b), contentType: "image/png", metadata: { sha256: INTERNAL_PNG.digest, generationattemptid: ids.attempt, artifactrevisionid: ids.revision } };
}

// Retain the established authentication/OWNER locks, while setting isolation before its first query.
export function readCommittedDatabase(database: DatabaseClient): DatabaseClient {
  return new Proxy(database, {
    get(target, property) {
      if (property === "$transaction") return <T>(operation: (tx: TransactionClient) => Promise<T>) => target.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ isolation: string }[]>`SELECT current_setting('transaction_isolation') AS isolation`;
        if (rows.length !== 1 || rows[0].isolation !== "read committed") throw new InternalExecutionError("DATABASE_TRANSACTION_RETRY_REQUIRED");
        return operation(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

type TaskInput = Readonly<{ projectId: string; assetTaskId: string }>;
function scoped<T>(deps: InternalExecutionDependencies, operation: (tx: TransactionClient, auth: P2AuthContext) => Promise<T>) {
  return withP2WorkspaceMembershipScope(readCommittedDatabase(deps.database), operation, deps.principalResolver);
}
async function lockedTask(tx: TransactionClient, auth: P2AuthContext, input: TaskInput) {
  const locked = await tx.$queryRaw<{ assetTaskId: string }[]>(Prisma.sql`SELECT "assetTaskId" FROM "AssetTask" WHERE "workspaceId"=${auth.workspaceId} AND "projectId"=${input.projectId} AND "assetTaskId"=${input.assetTaskId} FOR UPDATE`);
  if (locked.length !== 1) throw new InternalExecutionError("ASSET_TASK_NOT_FOUND");
  return tx.assetTask.findUniqueOrThrow({ where: { assetTaskId: input.assetTaskId } });
}
async function graph(tx: TransactionClient, auth: P2AuthContext, input: TaskInput) {
  const task = await lockedTask(tx, auth, input);
  const ids = internalIds(task.assetTaskId);
  const scope = { workspaceId: task.workspaceId, projectId: task.projectId, assetTaskId: task.assetTaskId };
  const attempts = await tx.generationAttempt.findMany({ where: scope });
  const links = await tx.generationAttemptSourceLink.findMany({ where: scope });
  const artifacts = await tx.artifact.findMany({ where: scope });
  const revisions = await tx.artifactRevision.findMany({ where: scope });
  const revisionLinks = await tx.artifactRevisionSourceLink.findMany({ where: scope });
  const started = await tx.p2DomainEvent.findUnique({ where: { eventId: ids.startedEvent } });
  const created = await tx.p2DomainEvent.findUnique({ where: { eventId: ids.createdEvent } });
  return { task, ids, attempts, links, artifacts, revisions, revisionLinks, started, created };
}
type Graph = Awaited<ReturnType<typeof graph>>;

function bindingDigest(g: Graph): string {
  const link = g.links[0];
  return canonicalDigest({ workspaceId: g.task.workspaceId, projectId: g.task.projectId, assetTaskId: g.task.assetTaskId, truthRevisionId: g.task.truthRevisionId, sourceSnapshotId: link.sourceSnapshotId, contentDigestAtBinding: link.contentDigestAtBinding });
}
function fingerprint(inputBindingDigest: string) {
  return canonicalDigest({ autoRedoOrdinal: 0, executorKind: INTERNAL_PNG.executorKind, inputBindingDigest, model: INTERNAL_PNG.model, promptVersion: INTERNAL_PNG.promptVersion, provider: "INTERNAL_TEST", trigger: "INITIAL" });
}
function exactEventBody(actual: unknown, expected: Readonly<Record<string, unknown>>): boolean {
  try { return canonicalDigest(actual) === canonicalDigest(expected); } catch { return false; }
}
function sameInstant(left: Date | null, right: Date | null): boolean {
  return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
}
function graphState(g: Graph): "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "HARD_BLOCKED" {
  const { task: t, ids, attempts: a, links: l, artifacts: ar, revisions: r, revisionLinks: rl, started, created } = g;
  const noOutput = ar.length === 0 && r.length === 0 && rl.length === 0 && created === null && t.currentArtifactRevisionId === null;
  if (t.status === "QUEUED" && t.startedAt === null && t.finishedAt === null && t.failureCode === null && a.length === 0 && l.length === 0 && !started && noOutput) return "QUEUED";
  if (a.length !== 1 || l.length !== 1 || !started) throw unknownCommit();
  const attempt = a[0], link = l[0];
  const scopeMatches = [attempt, link].every((row) => row.workspaceId === t.workspaceId && row.projectId === t.projectId && row.assetTaskId === t.assetTaskId);
  const attemptMatches = attempt.generationAttemptId === ids.attempt && attempt.trigger === "INITIAL" && attempt.autoRedoOrdinal === 0 && attempt.idempotencyKey === ids.idempotencyKey && attempt.truthRevisionId === t.truthRevisionId && attempt.brandKitRevisionId === null && attempt.visualPlanId === null && attempt.provider === "INTERNAL_TEST" && attempt.model === INTERNAL_PNG.model && attempt.promptVersion === INTERNAL_PNG.promptVersion && attempt.executorKind === INTERNAL_PNG.executorKind && attempt.transportRetryCount === 0 && attempt.providerRequestId === null && attempt.usageBody === null && attempt.costBody === null;
  const linkMatches = link.linkId === ids.attemptLink && link.generationAttemptId === ids.attempt && link.sourceSnapshotId === t.productSourceSnapshotId && link.inputRole === "PRODUCT_SOURCE" && link.inputOrder === 0 && link.linkStatus === "ACTIVE" && link.createdByActorId === started.actorId;
  const startedMatches = started.workspaceId === t.workspaceId && started.projectId === t.projectId && started.eventType === "generation_attempt.started.v1" && started.eventSchemaVersion === 1 && started.actorType === "USER_ACTOR" && typeof started.actorId === "string" && started.actorId.length > 0 && typeof started.requestId === "string" && started.requestId.length > 0 && started.correlationId === started.requestId && /^[0-9a-f]{40}$/u.test(started.sourceCommit) && started.productVersion === "0.1.0" && exactEventBody(started.eventBody, { assetTaskId: t.assetTaskId, autoRedoOrdinal: 0, generationAttemptId: ids.attempt, model: INTERNAL_PNG.model, provider: "INTERNAL_TEST", trigger: "INITIAL" });
  if (!scopeMatches || !attemptMatches || !linkMatches || !startedMatches || attempt.inputFingerprint !== fingerprint(bindingDigest(g)) || !sameInstant(t.startedAt, attempt.startedAt)) throw unknownCommit();
  if (t.status === "RUNNING" && attempt.status === "RUNNING" && t.finishedAt === null && t.failureCode === null && attempt.finishedAt === null && attempt.errorCode === null && noOutput) return "RUNNING";
  if (t.status === "FAILED" && attempt.status === "FAILED" && t.failureCode === attempt.errorCode && sameInstant(t.finishedAt, attempt.finishedAt) && noOutput) return "FAILED";
  if (t.status === "HARD_BLOCKED" && attempt.status === "AMBIGUOUS" && t.failureCode === attempt.errorCode && sameInstant(t.finishedAt, attempt.finishedAt) && noOutput) return "HARD_BLOCKED";
  if (t.status !== "SUCCEEDED" || attempt.status !== "SUCCEEDED" || t.failureCode !== null || attempt.errorCode !== null || !sameInstant(t.finishedAt, attempt.finishedAt) || ar.length !== 1 || r.length !== 1 || rl.length !== 1 || !created) throw unknownCommit();
  const artifact = ar[0], revision = r[0], revisionLink = rl[0];
  const outputScopeMatches = [artifact, revision, revisionLink].every((row) => row.workspaceId === t.workspaceId && row.projectId === t.projectId && row.assetTaskId === t.assetTaskId);
  const artifactMatches = artifact.artifactId === ids.artifact && artifact.assetClass === "IMAGE" && artifact.lifecycleStatus === "ACTIVE" && artifact.createdByActorId === started.actorId && artifact.selectedArtifactRevisionId === ids.revision && artifact.deletedAt === null && artifact.deletedByActorId === null;
  const revisionMatches = revision.artifactRevisionId === ids.revision && revision.artifactId === ids.artifact && revision.revisionNumber === 1 && revision.kind === "IMAGE" && revision.origin === "SYSTEM_LAYOUT" && revision.truthRevisionId === t.truthRevisionId && revision.generationAttemptId === ids.attempt && revision.editableDocumentId === null && revision.parentArtifactRevisionId === null && revision.brandKitRevisionId === null && revision.visualPlanId === null && revision.inputBindingDigest === bindingDigest(g) && revision.contentDigest === INTERNAL_PNG.digest && revision.storageLocator === ids.storageKey && revision.textBody === null && revision.status === "CANDIDATE" && revision.mediaType === "image/png" && revision.byteSize === BigInt(68) && revision.width === 1 && revision.height === 1 && revision.createdByActorId === null;
  const revisionLinkMatches = revisionLink.linkId === ids.revisionLink && revisionLink.artifactRevisionId === ids.revision && revisionLink.inheritedFromAttemptId === ids.attempt && revisionLink.sourceSnapshotId === link.sourceSnapshotId && revisionLink.contentDigestAtBinding === link.contentDigestAtBinding && revisionLink.inputOrder === link.inputOrder && revisionLink.sourceRole === link.inputRole && revisionLink.linkStatus === link.linkStatus && revisionLink.createdByActorId === link.createdByActorId;
  const createdMatches = created.workspaceId === t.workspaceId && created.projectId === t.projectId && created.eventType === "artifact_revision.created.v1" && created.eventSchemaVersion === 1 && created.actorType === started.actorType && created.actorId === started.actorId && created.requestId === started.requestId && created.correlationId === started.correlationId && created.sourceCommit === started.sourceCommit && created.productVersion === started.productVersion && exactEventBody(created.eventBody, { artifactRevisionId: ids.revision, assetTaskId: t.assetTaskId, contentDigest: INTERNAL_PNG.digest, kind: "IMAGE", origin: "SYSTEM_LAYOUT" });
  if (outputScopeMatches && artifactMatches && revisionMatches && revisionLinkMatches && createdMatches && t.currentArtifactRevisionId === ids.revision) return "SUCCEEDED";
  throw unknownCommit();
}
function unknownCommit() { return new InternalExecutionError("DATABASE_COMMIT_OUTCOME_UNKNOWN"); }
function result(g: Graph) {
  const state = graphState(g), requestId = g.started?.requestId;
  if (!requestId || state === "QUEUED") throw unknownCommit();
  if (state === "FAILED") throw new InternalExecutionError("ASSET_TASK_EXECUTION_FAILED", requestId);
  if (state === "HARD_BLOCKED") throw new InternalExecutionError("ASSET_TASK_EXECUTION_AMBIGUOUS", requestId);
  return { status: state === "SUCCEEDED" ? 201 : 202, requestId, assetTaskId: g.task.assetTaskId, state } as const;
}
async function reread(deps: InternalExecutionDependencies, input: TaskInput) {
  try { return await scoped(deps, (tx, auth) => graph(tx, auth, input)); } catch { throw unknownCommit(); }
}
function sqlState(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } }; cause?: unknown };
  return e.meta?.driverAdapterError?.cause?.originalCode ?? e.meta?.code ?? (e.code?.length === 5 ? e.code : sqlState(e.cause));
}

function exactBuildEvidence(value: InternalExecutionDependencies["buildEvidence"]) {
  if (!value || !/^[0-9a-f]{40}$/u.test(value.sourceCommit) || value.productVersion !== "0.1.0") throw new InternalExecutionError("BUILD_EVIDENCE_INVALID");
  return value;
}

export async function executeInternalAssetTask(deps: InternalExecutionDependencies, input: TaskInput, requestId: string) {
  internalIdentifier(input.projectId); internalIdentifier(input.assetTaskId);
  const buildEvidence = exactBuildEvidence(deps.buildEvidence);
  let claim: { winner: boolean; g: Graph };
  try {
    claim = await scoped(deps, async (tx, auth) => {
      let g = await graph(tx, auth, input);
      if (graphState(g) !== "QUEUED") return { winner: false, g };
      for (const value of [g.task.workspaceId, g.task.projectId, g.task.assetTaskId, g.task.truthRevisionId, g.task.productSourceSnapshotId, auth.userActorId]) internalIdentifier(value);
      const source = await tx.sourceSnapshot.findFirstOrThrow({ where: { workspaceId: auth.workspaceId, projectId: input.projectId, sourceSnapshotId: g.task.productSourceSnapshotId } });
      const scope = { workspaceId: auth.workspaceId, projectId: input.projectId, assetTaskId: input.assetTaskId };
      const digest = canonicalDigest({ ...scope, truthRevisionId: g.task.truthRevisionId, sourceSnapshotId: source.sourceSnapshotId, contentDigestAtBinding: source.contentDigest });
      const startedAt = new Date();
      await tx.generationAttempt.create({ data: { ...scope, generationAttemptId: g.ids.attempt, idempotencyKey: g.ids.idempotencyKey, inputFingerprint: fingerprint(digest), truthRevisionId: g.task.truthRevisionId, model: INTERNAL_PNG.model, promptVersion: INTERNAL_PNG.promptVersion, executorKind: INTERNAL_PNG.executorKind, status: "RUNNING", startedAt } });
      await tx.generationAttemptSourceLink.create({ data: { ...scope, linkId: g.ids.attemptLink, generationAttemptId: g.ids.attempt, sourceSnapshotId: source.sourceSnapshotId, inputRole: "PRODUCT_SOURCE", inputOrder: 0, contentDigestAtBinding: source.contentDigest, createdByActorId: auth.userActorId } });
      await tx.p2DomainEvent.create({ data: { eventId: g.ids.startedEvent, eventType: "generation_attempt.started.v1", eventSchemaVersion: 1, workspaceId: auth.workspaceId, projectId: input.projectId, actorType: "USER_ACTOR", actorId: auth.userActorId, requestId, correlationId: requestId, sourceCommit: buildEvidence.sourceCommit, productVersion: buildEvidence.productVersion, eventBody: { assetTaskId: input.assetTaskId, autoRedoOrdinal: 0, generationAttemptId: g.ids.attempt, model: INTERNAL_PNG.model, provider: "INTERNAL_TEST", trigger: "INITIAL" } } });
      await tx.assetTask.update({ where: { assetTaskId: input.assetTaskId }, data: { status: "RUNNING", startedAt } });
      g = await graph(tx, auth, input);
      if (graphState(g) !== "RUNNING") throw unknownCommit();
      return { winner: true, g };
    });
  } catch (error) {
    const state = sqlState(error);
    if (state === "40001" || state === "40P01") throw new InternalExecutionError("DATABASE_TRANSACTION_RETRY_REQUIRED");
    if (state === "55P03") throw new InternalExecutionError("ASSET_TASK_CLAIM_LOCK_TIMEOUT");
    if (error instanceof P2AuthContextError || error instanceof InternalExecutionError && error.code !== "DATABASE_COMMIT_OUTCOME_UNKNOWN") throw error;
    return result(await reread(deps, input));
  }
  if (!claim.winner) return result(claim.g);
  let runtime: InternalRuntime, object: InternalObject;
  try { runtime = (deps.createRuntime ?? defaultRuntime)(); object = exactInternalObject(await runtime.execute(), input.assetTaskId); }
  catch (error) { return terminal(deps, input, error instanceof InternalExecutionError && error.code === "INTERNAL_TEST_OUTPUT_INVALID" ? "INTERNAL_TEST_OUTPUT_INVALID" : "INTERNAL_TEST_EXECUTOR_FAILED", false); }
  let outcome: "CONFIRMED" | "ABSENT" | "UNKNOWN" = "UNKNOWN";
  try { outcome = await runtime.storage.putObject(claim.g.ids.storageKey, object); } catch { /* Resolve only from an authoritative exact-key read. */ }
  if (outcome === "ABSENT") return terminal(deps, input, "OBJECT_WRITE_FAILED_COMPENSATED", false);
  let stored: InternalObject | null;
  try { stored = await runtime.storage.readObject(claim.g.ids.storageKey); }
  catch { return terminal(deps, input, "OBJECT_WRITE_FAILED_COMPENSATION_FAILED", true); }
  if (stored === null) return terminal(deps, input, outcome === "CONFIRMED" ? "OBJECT_WRITE_FAILED_COMPENSATION_FAILED" : "OBJECT_WRITE_FAILED_COMPENSATED", outcome === "CONFIRMED");
  if (!sameObject(stored, object)) return terminal(deps, input, "OBJECT_WRITE_FAILED_COMPENSATION_FAILED", true);
  try {
    const completed = await scoped(deps, async (tx, auth) => {
      const g = await graph(tx, auth, input);
      if (graphState(g) !== "RUNNING") throw unknownCommit();
      const scope = { workspaceId: g.task.workspaceId, projectId: g.task.projectId, assetTaskId: g.task.assetTaskId };
      const link = g.links[0], started = g.started!;
      await tx.artifact.create({ data: { ...scope, artifactId: g.ids.artifact, createdByActorId: started.actorId } });
      await tx.artifactRevision.create({ data: { ...scope, artifactId: g.ids.artifact, artifactRevisionId: g.ids.revision, truthRevisionId: g.task.truthRevisionId, generationAttemptId: g.ids.attempt, inputBindingDigest: bindingDigest(g), contentDigest: INTERNAL_PNG.digest, storageLocator: g.ids.storageKey } });
      await tx.artifactRevisionSourceLink.create({ data: { ...scope, linkId: g.ids.revisionLink, artifactRevisionId: g.ids.revision, sourceSnapshotId: link.sourceSnapshotId, sourceRole: link.inputRole, inputOrder: link.inputOrder, contentDigestAtBinding: link.contentDigestAtBinding, inheritedFromAttemptId: g.ids.attempt, createdByActorId: link.createdByActorId } });
      await tx.p2DomainEvent.create({ data: { eventId: g.ids.createdEvent, eventType: "artifact_revision.created.v1", eventSchemaVersion: 1, workspaceId: scope.workspaceId, projectId: scope.projectId, actorType: started.actorType, actorId: started.actorId, requestId: started.requestId, correlationId: started.correlationId, sourceCommit: started.sourceCommit, productVersion: started.productVersion, eventBody: { artifactRevisionId: g.ids.revision, assetTaskId: scope.assetTaskId, contentDigest: INTERNAL_PNG.digest, kind: "IMAGE", origin: "SYSTEM_LAYOUT" } } });
      await tx.artifact.update({ where: { artifactId: g.ids.artifact }, data: { selectedArtifactRevisionId: g.ids.revision } });
      const finishedAt = new Date();
      await tx.generationAttempt.update({ where: { generationAttemptId: g.ids.attempt }, data: { status: "SUCCEEDED", finishedAt } });
      await tx.assetTask.update({ where: { assetTaskId: input.assetTaskId }, data: { status: "SUCCEEDED", finishedAt, currentArtifactRevisionId: g.ids.revision } });
      const output = await graph(tx, auth, input);
      if (graphState(output) !== "SUCCEEDED") throw unknownCommit();
      return output;
    });
    return result(completed);
  } catch {
    const observed = await reread(deps, input);
    const state = graphState(observed);
    if (state !== "RUNNING") return result(observed);
    // graphState proved every output row/event absent while holding the task lock.
    let deleted = false;
    try { deleted = await runtime.storage.deleteExact(observed.ids.storageKey, object); } catch { /* Unknown deletion is a hard block. */ }
    return terminal(deps, input, deleted ? "FINALIZE_FAILED_COMPENSATED" : "FINALIZE_FAILED_COMPENSATION_FAILED", !deleted);
  }
}

async function terminal(deps: InternalExecutionDependencies, input: TaskInput, code: string, ambiguous: boolean) {
  let g: Graph;
  try {
    g = await scoped(deps, async (tx, auth) => {
      const current = await graph(tx, auth, input);
      if (graphState(current) !== "RUNNING") throw unknownCommit();
      const finishedAt = new Date();
      await tx.generationAttempt.update({ where: { generationAttemptId: current.ids.attempt }, data: { status: ambiguous ? "AMBIGUOUS" : "FAILED", errorCode: code, finishedAt } });
      await tx.assetTask.update({ where: { assetTaskId: input.assetTaskId }, data: { status: ambiguous ? "HARD_BLOCKED" : "FAILED", failureCode: code, finishedAt } });
      return graph(tx, auth, input);
    });
  } catch { g = await reread(deps, input); }
  return result(g);
}

export async function readInternalArtifactContent(deps: InternalExecutionDependencies, input: TaskInput & { artifactId: string; artifactRevisionId: string }) {
  for (const id of Object.values(input)) internalIdentifier(id);
  const g = await scoped(deps, (tx, auth) => graph(tx, auth, input));
  if (graphState(g) !== "SUCCEEDED" || input.artifactId !== g.ids.artifact || input.artifactRevisionId !== g.ids.revision || g.artifacts[0].lifecycleStatus !== "ACTIVE") throw new InternalExecutionError("ARTIFACT_NOT_FOUND");
  const r = g.revisions[0];
  if (r.status !== "CANDIDATE" || r.kind !== "IMAGE" || r.origin !== "SYSTEM_LAYOUT" || r.mediaType !== "image/png" || r.byteSize !== BigInt(68) || r.width !== 1 || r.height !== 1 || r.storageLocator !== g.ids.storageKey || r.contentDigest !== INTERNAL_PNG.digest || r.textBody !== null) throw new InternalExecutionError("ARTIFACT_CONTENT_INTEGRITY_MISMATCH");
  let object: InternalObject | null;
  try { object = await (deps.readObject ?? (async (key) => memoryStore ? memoryStore.readObject(key) : null))(g.ids.storageKey); }
  catch { throw new InternalExecutionError("ARTIFACT_CONTENT_UNAVAILABLE"); }
  if (!object) throw new InternalExecutionError("ARTIFACT_CONTENT_UNAVAILABLE");
  if (!sameObject(object, exactInternalObject(Buffer.from(INTERNAL_PNG.base64, "base64"), input.assetTaskId))) throw new InternalExecutionError("ARTIFACT_CONTENT_INTEGRITY_MISMATCH");
  return object.bytes;
}

export async function internalTaskSummaries(tx: TransactionClient, auth: P2AuthContext, input: TaskInput) {
  const g = await graph(tx, auth, input);
  const state = graphState(g);
  return {
    status: state,
    generationAttemptSummary: state === "QUEUED" ? null : { generationAttemptId: g.ids.attempt, status: g.attempts[0].status, provider: g.attempts[0].provider, model: g.attempts[0].model },
    artifactRevisionSummary: state === "SUCCEEDED" ? { artifactId: g.ids.artifact, artifactRevisionId: g.ids.revision, kind: "IMAGE", origin: "SYSTEM_LAYOUT", contentDigest: INTERNAL_PNG.digest, mediaType: "image/png", byteSize: 68, width: 1, height: 1 } : null,
  };
}
