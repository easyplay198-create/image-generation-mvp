import type {
  ObjectStorage,
  StoredObject,
} from "@/src/storage/object-storage";

export class StorageCompensationError extends Error {
  readonly databaseError: unknown;
  readonly cleanupError: unknown;

  constructor(databaseError: unknown, cleanupError: unknown) {
    super("Database write failed and stored-object cleanup also failed.");
    this.name = "StorageCompensationError";
    this.databaseError = databaseError;
    this.cleanupError = cleanupError;
  }
}

type PersistStoredRecordOptions<RecordType> = {
  storage: ObjectStorage;
  object: StoredObject;
  createRecord: () => Promise<RecordType>;
};

export async function persistStoredRecord<RecordType>({
  storage,
  object,
  createRecord,
}: PersistStoredRecordOptions<RecordType>): Promise<RecordType> {
  await storage.putObject(object);

  try {
    return await createRecord();
  } catch (databaseError) {
    try {
      await storage.deleteObject(object.key);
    } catch (cleanupError) {
      throw new StorageCompensationError(databaseError, cleanupError);
    }

    throw databaseError;
  }
}
