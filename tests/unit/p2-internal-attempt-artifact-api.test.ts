import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createP2AssetTaskHttpHandlers, internalContentResponse, internalErrorResponse } from "../../src/http/p2-asset-task-api";
import { canonicalDigest, exactInternalObject, internalIdentifier, INTERNAL_PNG, InternalExecutionError } from "../../src/tasks/internal-asset-task-execution";
import type { DatabaseClient } from "../../src/storage/database";

const png = Buffer.from(INTERNAL_PNG.base64, "base64");
const context = { params: Promise.resolve({ projectId: "project", assetTaskId: "task" }) };
const forbiddenDatabase = new Proxy({}, { get() { throw Error("DATABASE_MUST_NOT_BE_READ"); } }) as DatabaseClient;

describe("S1I canonical binding, internal API and representation", () => {
  it("independently serializes and hashes both frozen golden vectors", () => {
    const binding = { workspaceId: "ws_fixture", projectId: "project_fixture", assetTaskId: "p2_asset_task_fixture", truthRevisionId: "truth_fixture", sourceSnapshotId: "source_fixture", contentDigestAtBinding: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" };
    const serialize = (o: Record<string, string | number>) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a < b ? -1 : 1)));
    const bytes = serialize(binding);
    expect(bytes).toBe('{"assetTaskId":"p2_asset_task_fixture","contentDigestAtBinding":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","projectId":"project_fixture","sourceSnapshotId":"source_fixture","truthRevisionId":"truth_fixture","workspaceId":"ws_fixture"}');
    const digest = createHash("sha256").update(Buffer.from(bytes, "utf8")).digest("hex");
    expect(digest).toBe("175e2683d6418c2aee377528c2aed48f4e53d393099f78ee4ec96d07bb2df1ae");
    expect(canonicalDigest(binding)).toBe(digest);
    const fingerprint = { autoRedoOrdinal: 0, executorKind: "INTERNAL_TEST_PNG_V1", inputBindingDigest: digest, model: "INTERNAL_TEST_FIXED_PNG_1X1_V1", promptVersion: "INTERNAL_TEST_NO_PROMPT_V1", provider: "INTERNAL_TEST", trigger: "INITIAL" };
    const fingerprintBytes = serialize(fingerprint);
    expect(fingerprintBytes).toBe('{"autoRedoOrdinal":0,"executorKind":"INTERNAL_TEST_PNG_V1","inputBindingDigest":"175e2683d6418c2aee377528c2aed48f4e53d393099f78ee4ec96d07bb2df1ae","model":"INTERNAL_TEST_FIXED_PNG_1X1_V1","promptVersion":"INTERNAL_TEST_NO_PROMPT_V1","provider":"INTERNAL_TEST","trigger":"INITIAL"}');
    expect(createHash("sha256").update(fingerprintBytes).digest("hex")).toBe("960871b2efb209661119125ba76c8c39b53ff2a06752289f96c252da2ee512d0");
    expect(canonicalDigest(fingerprint)).toBe("960871b2efb209661119125ba76c8c39b53ff2a06752289f96c252da2ee512d0");
  });
  it("normalizes leaves recursively, preserves arrays, rejects noncanonical identifiers", () => {
    expect(canonicalDigest({ x: ["e\u0301", { y: "e\u0301" }] })).toBe(canonicalDigest({ x: ["é", { y: "é" }] }));
    expect(canonicalDigest([1, 2])).not.toBe(canonicalDigest([2, 1]));
    expect(() => internalIdentifier("e\u0301")).toThrow("VALIDATION_FAILED");
    expect(() => canonicalDigest(Infinity)).toThrow("VALIDATION_FAILED");
    const unicodeOrder = '{"\uffff":1,"𐀀":2}';
    expect(canonicalDigest({ "𐀀": 2, "\uffff": 1 })).toBe(createHash("sha256").update(unicodeOrder).digest("hex"));
  });
  it("validates exact PNG and lowercase object metadata", () => {
    expect(exactInternalObject(png, "task")).toMatchObject({ contentType: "image/png", metadata: { sha256: INTERNAL_PNG.digest, generationattemptid: "p2:generation-attempt:task:INITIAL:0", artifactrevisionid: "p2:artifact:task:revision:1" } });
    const mutated = Buffer.from(png); mutated[30] ^= 1;
    expect(() => exactInternalObject(mutated, "task")).toThrow("INTERNAL_TEST_OUTPUT_INVALID");
    expect(() => exactInternalObject(png.subarray(1), "task")).toThrow();
  });
  it("authenticates before body or business access", async () => {
    const request = { headers: new Headers(), async text() { throw Error("BODY_MUST_NOT_BE_READ"); } } as unknown as Request;
    const response = await createP2AssetTaskHttpHandlers({ database: forbiddenDatabase }).execute(request, context);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatchObject({ category: "AUTHENTICATION", hardBlock: true, retryable: false });
  });
  it.each([
    { body: "{}" }, { headers: { "content-type": "application/json" } }, { headers: { "idempotency-key": "forged" } }, { query: "?workspaceId=forged" },
  ])("rejects client execution controls before database access: %j", async (input) => {
    const headers = input.headers ? new Headers(Object.entries(input.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : undefined;
    const request = new Request(`https://example.test/execute${input.query ?? ""}`, { method: "POST", headers, body: input.body });
    const response = await createP2AssetTaskHttpHandlers({ database: forbiddenDatabase, principalResolver: { async resolve() { return { authIssuer: "test", authSubject: "owner", workspaceId: "workspace" }; } } }).execute(request, context);
    expect(response.status).toBe(400);
  });
  it("returns exact representation headers and bytes, or 304 with no bytes", async () => {
    const full = internalContentResponse(png, new Request("https://example.test"), "current");
    expect(full.status).toBe(200);
    expect(full.headers.get("content-length")).toBe("68");
    expect(full.headers.get("content-digest")).toBe("sha-256=:QxztaRaiohoVbjhwGv5Vu9f4iWn7v8Vtf+CZ1H8mVGA=:");
    expect(full.headers.get("cache-control")).toBe("private, no-store");
    expect(full.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await full.arrayBuffer())).toEqual(png);
    const conditional = internalContentResponse(png, new Request("https://example.test", { headers: { "if-none-match": full.headers.get("etag")! } }), "next");
    expect(conditional.status).toBe(304); expect(await conditional.text()).toBe("");
  });
  it.each([["bytes=0-7", 0, 7], ["bytes=60-", 60, 67], ["bytes=-3", 65, 67], ["bytes=0-999", 0, 67]] as const)("serves one satisfiable range %s", async (range, start, end) => {
    const response = internalContentResponse(png, new Request("https://example.test", { headers: { range } }), "range");
    expect(response.status).toBe(206); expect(response.headers.get("content-range")).toBe(`bytes ${start}-${end}/68`);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png.subarray(start, end + 1));
  });
  it.each(["bytes=0-1,3-4", "bytes=68-", "bytes=-0", "bytes=-", "items=0-1", "bytes=2-1", "bytes=999999999999999999999999-", "bytes=0-NaN"])("rejects malformed or unsatisfiable range %s without image bytes", async (range) => {
    let error: unknown;
    try { internalContentResponse(png, new Request("https://example.test", { headers: { range } }), "range"); } catch (e) { error = e; }
    const response = internalErrorResponse(error, "range");
    expect(response.status).toBe(416); expect(response.headers.get("content-range")).toBe("bytes */68");
    expect((await response.json()).error.code).toBe("RANGE_NOT_SATISFIABLE");
  });
  it("does not expose raw failures and preserves durable terminal request identity", async () => {
    const error = await internalErrorResponse(Error("SQL password storageLocator"), "request").json();
    expect(JSON.stringify(error)).not.toMatch(/SQL|password|storageLocator/);
    expect(Object.keys(error.error).sort()).toEqual(["category", "code", "details", "hardBlock", "message", "requestId", "retryable", "userActionRequired"]);
    expect((await internalErrorResponse(new InternalExecutionError("ASSET_TASK_EXECUTION_FAILED", "first"), "later").json()).error.requestId).toBe("first");
  });
});
