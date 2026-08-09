export type StoredObject = {
  key: string;
  body: Uint8Array;
  contentType: string;
  metadata?: Record<string, string>;
};

export interface ObjectStorage {
  putObject(object: StoredObject): Promise<void>;
  deleteObject(key: string): Promise<void>;
  checkConnection(): Promise<void>;
}
