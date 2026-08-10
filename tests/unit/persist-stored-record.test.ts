import { describe, expect, it, vi } from "vitest";

import type { ObjectStorage } from "../../src/storage/object-storage";
import {
  persistStoredRecord,
  StorageCompensationError,
} from "../../src/storage/persist-stored-record";

const object = {
  key: "owners/owner-1/assets/asset-1.png",
  body: new Uint8Array([1, 2, 3]),
  contentType: "image/png",
};

function createStorage(): ObjectStorage {
  return {
    putObject: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn().mockResolvedValue({
      body: new Uint8Array(),
      contentType: "application/octet-stream",
    }),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    checkConnection: vi.fn().mockResolvedValue(undefined),
  };
}

describe("persistStoredRecord", () => {
  it("creates a record only after the object is stored", async () => {
    const storage = createStorage();
    const createRecord = vi.fn().mockResolvedValue({ id: "asset-1" });

    await expect(
      persistStoredRecord({ storage, object, createRecord }),
    ).resolves.toEqual({ id: "asset-1" });
    expect(storage.putObject).toHaveBeenCalledWith(object);
    expect(createRecord).toHaveBeenCalledOnce();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("does not create a database record when object storage fails", async () => {
    const storage = createStorage();
    vi.mocked(storage.putObject).mockRejectedValue(new Error("storage failed"));
    const createRecord = vi.fn();

    await expect(
      persistStoredRecord({ storage, object, createRecord }),
    ).rejects.toThrow("storage failed");
    expect(createRecord).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes the stored object when database creation fails", async () => {
    const storage = createStorage();
    const databaseError = new Error("database failed");

    await expect(
      persistStoredRecord({
        storage,
        object,
        createRecord: vi.fn().mockRejectedValue(databaseError),
      }),
    ).rejects.toBe(databaseError);
    expect(storage.deleteObject).toHaveBeenCalledWith(object.key);
  });

  it("surfaces both failures when compensation cleanup fails", async () => {
    const storage = createStorage();
    const databaseError = new Error("database failed");
    const cleanupError = new Error("cleanup failed");
    vi.mocked(storage.deleteObject).mockRejectedValue(cleanupError);

    const promise = persistStoredRecord({
      storage,
      object,
      createRecord: vi.fn().mockRejectedValue(databaseError),
    });

    await expect(promise).rejects.toMatchObject({
      name: "StorageCompensationError",
      databaseError,
      cleanupError,
    });
    await expect(promise).rejects.toBeInstanceOf(StorageCompensationError);
  });
});
