export type StoredObject = {
  key: string;
  body: Uint8Array;
  contentType: string;
  metadata?: Record<string, string>;
};

export type RetrievedObject = {
  body: Uint8Array;
  contentType: string;
};

export interface ObjectStorage {
  putObject(object: StoredObject): Promise<void>;
  getObject(key: string): Promise<RetrievedObject>;
  deleteObject(key: string): Promise<void>;
  checkConnection(): Promise<void>;
}
