import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { getRequiredEnvironmentVariable } from "@/src/config/environment";
import type {
  ObjectStorage,
  RetrievedObject,
  StoredObject,
} from "@/src/storage/object-storage";

export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async putObject(object: StoredObject): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType,
        Metadata: object.metadata,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async getObject(key: string): Promise<RetrievedObject> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error("S3 returned an object without a body.");
    }

    return {
      body: await response.Body.transformToByteArray(),
      contentType: response.ContentType ?? "application/octet-stream",
    };
  }

  async checkConnection(): Promise<void> {
    await this.client.send(
      new HeadBucketCommand({
        Bucket: this.bucket,
      }),
    );
  }
}

export function createS3ObjectStorage(
  environment: Record<string, string | undefined> = process.env,
): S3ObjectStorage {
  const client = new S3Client({
    endpoint: getRequiredEnvironmentVariable("S3_ENDPOINT", environment),
    region: getRequiredEnvironmentVariable("S3_REGION", environment),
    forcePathStyle:
      environment.S3_FORCE_PATH_STYLE?.trim().toLowerCase() !== "false",
    credentials: {
      accessKeyId: getRequiredEnvironmentVariable(
        "S3_ACCESS_KEY_ID",
        environment,
      ),
      secretAccessKey: getRequiredEnvironmentVariable(
        "S3_SECRET_ACCESS_KEY",
        environment,
      ),
    },
  });

  return new S3ObjectStorage(
    client,
    getRequiredEnvironmentVariable("S3_BUCKET", environment),
  );
}
