import { z } from "zod";

import {
  DesignDocumentValidationError,
  parseDesignDocument,
  type DesignDocument,
} from "@/src/editor/design-document";
import { ApiError } from "@/src/http/api";

const saveDesignVersionRequestSchema = z
  .object({
    document: z.unknown(),
  })
  .strict();

export function parseSaveDesignVersionRequest(input: unknown): {
  document: DesignDocument;
} {
  const request = saveDesignVersionRequestSchema.safeParse(input);
  if (!request.success) {
    throw new ApiError(
      "DESIGN_DOCUMENT_INVALID",
      400,
      "版本保存请求格式无效。",
      { fields: request.error.flatten().fieldErrors },
    );
  }

  try {
    return { document: parseDesignDocument(request.data.document) };
  } catch (error) {
    if (error instanceof DesignDocumentValidationError) {
      throw new ApiError(
        "DESIGN_DOCUMENT_INVALID",
        400,
        "设计文档未通过 V1 Schema 校验。",
        { fields: error.fieldErrors },
      );
    }
    throw error;
  }
}
