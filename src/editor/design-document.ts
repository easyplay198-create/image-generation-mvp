import { z } from "zod";

const layerIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/, "图层 ID 包含不支持的字符。");

const assetIdSchema = z.string().trim().min(1).max(120);
const coordinateSchema = z.number().finite().min(-4320).max(4320);
const scaleSchema = z.number().finite().min(0.01).max(10);
const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const commonLayerShape = {
  id: layerIdSchema,
  zIndex: z.number().int().min(0).max(1000),
  visible: z.boolean(),
  locked: z.boolean(),
  x: coordinateSchema,
  y: coordinateSchema,
  scaleX: scaleSchema,
  scaleY: scaleSchema,
  rotation: z.number().finite().min(-360).max(360),
  opacity: z.number().finite().min(0).max(1),
};

export const productLayerSchema = z
  .object({
    ...commonLayerShape,
    type: z.literal("PRODUCT"),
    sourceAssetId: assetIdSchema,
  })
  .strict();

export const backgroundLayerSchema = z
  .object({
    ...commonLayerShape,
    type: z.literal("AI_BACKGROUND"),
    sourceAssetId: assetIdSchema,
  })
  .strict();

export const textLayerSchema = z
  .object({
    ...commonLayerShape,
    type: z.literal("TEXT"),
    sourceAssetId: z.null(),
    text: z.string().min(1).max(500),
    fontFamily: z.enum(["Arial", "Helvetica", "Verdana", "Georgia"]),
    fontSize: z.number().int().min(8).max(240),
    color: colorSchema,
    textAlign: z.enum(["left", "center", "right"]),
  })
  .strict();

export const decorationLayerSchema = z
  .object({
    ...commonLayerShape,
    type: z.literal("DECORATION"),
    sourceAssetId: z.null(),
    shape: z.enum(["RECTANGLE", "CIRCLE"]),
    width: z.number().finite().min(1).max(2160),
    height: z.number().finite().min(1).max(2160),
    fill: colorSchema,
    stroke: colorSchema,
    strokeWidth: z.number().finite().min(0).max(50),
  })
  .strict();

export const designLayerSchema = z.discriminatedUnion("type", [
  productLayerSchema,
  backgroundLayerSchema,
  textLayerSchema,
  decorationLayerSchema,
]);

export const designDocumentSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    styleSpecRevisionId: z.string().trim().min(1).max(120),
    canvas: z
      .object({
        width: z.literal(1080),
        height: z.literal(1080),
        backgroundColor: colorSchema,
      })
      .strict(),
    layers: z.array(designLayerSchema).min(1).max(64),
  })
  .strict()
  .superRefine((document, context) => {
    const productLayers = document.layers.filter(
      (layer) => layer.type === "PRODUCT",
    );
    if (productLayers.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["layers"],
        message: "设计必须且只能包含一个商品图层。",
      });
    }

    const backgroundLayers = document.layers.filter(
      (layer) => layer.type === "AI_BACKGROUND",
    );
    if (backgroundLayers.length > 1) {
      context.addIssue({
        code: "custom",
        path: ["layers"],
        message: "设计最多只能包含一个 AI 背景图层。",
      });
    }

    const layerIds = new Set<string>();
    const zIndexes = new Set<number>();
    for (const [index, layer] of document.layers.entries()) {
      if (layerIds.has(layer.id)) {
        context.addIssue({
          code: "custom",
          path: ["layers", index, "id"],
          message: "图层 ID 必须唯一。",
        });
      }
      layerIds.add(layer.id);

      if (zIndexes.has(layer.zIndex)) {
        context.addIssue({
          code: "custom",
          path: ["layers", index, "zIndex"],
          message: "图层 zIndex 必须唯一。",
        });
      }
      zIndexes.add(layer.zIndex);
    }

    const background = backgroundLayers[0];
    if (
      background &&
      document.layers.some(
        (layer) =>
          layer.id !== background.id && layer.zIndex < background.zIndex,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["layers"],
        message: "AI 背景图层必须位于所有其他图层之下。",
      });
    }
  });

export type ProductLayer = z.infer<typeof productLayerSchema>;
export type BackgroundLayer = z.infer<typeof backgroundLayerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type DecorationLayer = z.infer<typeof decorationLayerSchema>;
export type DesignLayer = z.infer<typeof designLayerSchema>;
export type DesignDocument = z.infer<typeof designDocumentSchema>;

export class DesignDocumentValidationError extends Error {
  constructor(readonly fieldErrors: Record<string, string[] | undefined>) {
    super("Design document failed schema validation.");
    this.name = "DesignDocumentValidationError";
  }
}

export function parseDesignDocument(input: unknown): DesignDocument {
  const result = designDocumentSchema.safeParse(input);
  if (!result.success) {
    throw new DesignDocumentValidationError(
      result.error.flatten().fieldErrors,
    );
  }

  return sortLayers(result.data);
}

export function serializeDesignDocument(document: DesignDocument): string {
  return JSON.stringify(parseDesignDocument(document), null, 2);
}

export function deserializeDesignDocument(input: string): DesignDocument {
  if (input.length > 1_000_000) {
    throw new DesignDocumentValidationError({
      document: ["设计 JSON 不能超过 1 MiB。"],
    });
  }

  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch {
    throw new DesignDocumentValidationError({
      document: ["设计内容不是有效 JSON。"],
    });
  }

  return parseDesignDocument(value);
}

export function createInitialDesignDocument(input: {
  styleSpecRevisionId: string;
  productAssetId: string;
  productScale: number;
  backgroundAssetId?: string;
  headline?: string;
}): DesignDocument {
  const layers: DesignLayer[] = [];

  if (input.backgroundAssetId) {
    layers.push({
      id: "background-main",
      type: "AI_BACKGROUND",
      sourceAssetId: input.backgroundAssetId,
      zIndex: 0,
      visible: true,
      locked: true,
      x: 540,
      y: 540,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    });
  }

  layers.push({
    id: "product-main",
    type: "PRODUCT",
    sourceAssetId: input.productAssetId,
    zIndex: 10,
    visible: true,
    locked: false,
    x: 540,
    y: 600,
    scaleX: input.productScale,
    scaleY: input.productScale,
    rotation: 0,
    opacity: 1,
  });

  if (input.headline?.trim()) {
    layers.push({
      id: "text-headline",
      type: "TEXT",
      sourceAssetId: null,
      zIndex: 20,
      visible: true,
      locked: false,
      x: 540,
      y: 130,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      text: input.headline.trim().slice(0, 500),
      fontFamily: "Arial",
      fontSize: 64,
      color: "#172033",
      textAlign: "center",
    });
  }

  return parseDesignDocument({
    schemaVersion: "1.0",
    styleSpecRevisionId: input.styleSpecRevisionId,
    canvas: {
      width: 1080,
      height: 1080,
      backgroundColor: "#F5F6F8",
    },
    layers,
  });
}

export function replaceBackgroundAsset(
  document: DesignDocument,
  sourceAssetId: string | null,
  newLayerId = "background-main",
): DesignDocument {
  const current = parseDesignDocument(document);
  const background = current.layers.find(
    (layer): layer is BackgroundLayer => layer.type === "AI_BACKGROUND",
  );

  if (!sourceAssetId) {
    return parseDesignDocument({
      ...current,
      layers: current.layers.filter(
        (layer) => layer.type !== "AI_BACKGROUND",
      ),
    });
  }

  if (background) {
    return parseDesignDocument({
      ...current,
      layers: current.layers.map((layer) =>
        layer.id === background.id ? { ...layer, sourceAssetId } : layer,
      ),
    });
  }

  return parseDesignDocument({
    ...current,
    layers: [
      {
        id: newLayerId,
        type: "AI_BACKGROUND",
        sourceAssetId,
        zIndex: 0,
        visible: true,
        locked: true,
        x: 540,
        y: 540,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
      },
      ...current.layers,
    ],
  });
}

export function sortLayers(document: DesignDocument): DesignDocument {
  return {
    ...document,
    layers: [...document.layers].sort((left, right) =>
      left.zIndex === right.zIndex
        ? left.id.localeCompare(right.id)
        : left.zIndex - right.zIndex,
    ),
  };
}
