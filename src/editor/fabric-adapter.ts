import type { Canvas, FabricObject } from "fabric";

import {
  designLayerSchema,
  parseDesignDocument,
  type DecorationLayer,
  type DesignDocument,
  type DesignLayer,
  type TextLayer,
} from "@/src/editor/design-document";

type FabricLayerType = DesignLayer["type"];
type DecorationShape = DecorationLayer["shape"];

type EditorFabricObject = FabricObject & {
  editorLayerId?: string;
  editorLayerType?: FabricLayerType;
  editorSourceAssetId?: string | null;
  editorZIndex?: number;
  editorLocked?: boolean;
  editorDecorationShape?: DecorationShape;
};

export type FabricLayerSnapshot = {
  layerId: string;
  layerType: FabricLayerType;
  sourceAssetId: string | null;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
  objectType: "image" | "i-text" | "rectangle" | "circle";
  text?: string;
  fontFamily?: TextLayer["fontFamily"];
  fontSize?: number;
  fill?: string;
  textAlign?: TextLayer["textAlign"];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
};

export function designLayerToFabricSnapshot(
  layer: DesignLayer,
): FabricLayerSnapshot {
  const common = {
    layerId: layer.id,
    layerType: layer.type,
    sourceAssetId: layer.sourceAssetId,
    zIndex: layer.zIndex,
    visible: layer.visible,
    locked: layer.locked,
    left: layer.x,
    top: layer.y,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    angle: layer.rotation,
    opacity: layer.opacity,
  };

  switch (layer.type) {
    case "PRODUCT":
    case "AI_BACKGROUND":
      return { ...common, objectType: "image" };
    case "TEXT":
      return {
        ...common,
        objectType: "i-text",
        text: layer.text,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fill: layer.color,
        textAlign: layer.textAlign,
      };
    case "DECORATION":
      return {
        ...common,
        objectType: layer.shape === "RECTANGLE" ? "rectangle" : "circle",
        width: layer.width,
        height: layer.height,
        fill: layer.fill,
        stroke: layer.stroke,
        strokeWidth: layer.strokeWidth,
      };
  }
}

export function fabricSnapshotToDesignLayer(
  snapshot: FabricLayerSnapshot,
): DesignLayer {
  const common = {
    id: snapshot.layerId,
    type: snapshot.layerType,
    sourceAssetId: snapshot.sourceAssetId,
    zIndex: snapshot.zIndex,
    visible: snapshot.visible,
    locked: snapshot.locked,
    x: snapshot.left,
    y: snapshot.top,
    scaleX: snapshot.scaleX,
    scaleY: snapshot.scaleY,
    rotation: normalizeRotation(snapshot.angle),
    opacity: snapshot.opacity,
  };

  switch (snapshot.layerType) {
    case "PRODUCT":
    case "AI_BACKGROUND":
      return designLayerSchema.parse(common);
    case "TEXT":
      return designLayerSchema.parse({
        ...common,
        sourceAssetId: null,
        text: snapshot.text,
        fontFamily: snapshot.fontFamily,
        fontSize: Math.round(snapshot.fontSize ?? 0),
        color: snapshot.fill,
        textAlign: snapshot.textAlign,
      });
    case "DECORATION":
      return designLayerSchema.parse({
        ...common,
        sourceAssetId: null,
        shape: snapshot.objectType === "circle" ? "CIRCLE" : "RECTANGLE",
        width: snapshot.width,
        height: snapshot.height,
        fill: snapshot.fill,
        stroke: snapshot.stroke,
        strokeWidth: snapshot.strokeWidth,
      });
  }
}

export async function loadDesignDocumentIntoCanvas(input: {
  canvas: Canvas;
  document: DesignDocument;
  resolveAssetUrl: (layer: DesignLayer) => string;
  signal?: AbortSignal;
}): Promise<void> {
  const document = parseDesignDocument(input.document);
  input.canvas.clear();
  input.canvas.backgroundColor = document.canvas.backgroundColor;

  for (const layer of document.layers) {
    if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const object = await createFabricObject(
      layer,
      input.resolveAssetUrl,
      input.signal,
    );
    input.canvas.add(object);
  }

  input.canvas.requestRenderAll();
}

export function canvasToDesignDocument(
  canvas: Canvas,
  baseDocument: Pick<
    DesignDocument,
    "schemaVersion" | "styleSpecRevisionId" | "canvas"
  >,
): DesignDocument {
  const layers = canvas
    .getObjects()
    .map((object) =>
      fabricSnapshotToDesignLayer(fabricObjectToSnapshot(object)),
    );

  return parseDesignDocument({
    ...baseDocument,
    canvas: {
      ...baseDocument.canvas,
      backgroundColor:
        typeof canvas.backgroundColor === "string"
          ? canvas.backgroundColor
          : baseDocument.canvas.backgroundColor,
    },
    layers,
  });
}

export function findFabricObjectByLayerId(
  canvas: Canvas,
  layerId: string,
): EditorFabricObject | undefined {
  return canvas
    .getObjects()
    .map(toEditorObject)
    .find((object) => object.editorLayerId === layerId);
}

export function getFabricLayerId(
  object: FabricObject | undefined,
): string | null {
  return object ? toEditorObject(object).editorLayerId ?? null : null;
}

export function updateFabricObjectFromLayer(
  canvas: Canvas,
  layer: DesignLayer,
): void {
  const object = findFabricObjectByLayerId(canvas, layer.id);
  if (!object) throw new Error("画布中找不到指定图层。");

  object.set({
    left: layer.x,
    top: layer.y,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    angle: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    selectable: !layer.locked,
    evented: !layer.locked,
    lockMovementX: layer.locked,
    lockMovementY: layer.locked,
    lockRotation: layer.locked,
    lockScalingX: layer.locked,
    lockScalingY: layer.locked,
    lockScalingFlip: true,
    lockSkewingX: true,
    lockSkewingY: true,
  });
  object.editorLocked = layer.locked;

  if (layer.type === "TEXT") {
    const textObject = object as EditorFabricObject & {
      text: string;
      fontFamily: string;
      fontSize: number;
      fill: string;
      textAlign: string;
      editable: boolean;
    };
    textObject.set({
      text: layer.text,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fill: layer.color,
      textAlign: layer.textAlign,
      editable: !layer.locked,
    });
  }

  if (layer.type === "DECORATION") {
    object.set({
      width: layer.width,
      height: layer.height,
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
    });
  }

  object.setCoords();
  canvas.requestRenderAll();
}

function fabricObjectToSnapshot(object: FabricObject): FabricLayerSnapshot {
  const editorObject = toEditorObject(object);
  const layerId = editorObject.editorLayerId;
  const layerType = editorObject.editorLayerType;
  const zIndex = editorObject.editorZIndex;
  if (!layerId || !layerType || typeof zIndex !== "number") {
    throw new Error("Fabric 画布包含未受控对象。");
  }

  const fill =
    typeof editorObject.fill === "string" ? editorObject.fill : undefined;
  const stroke =
    typeof editorObject.stroke === "string" ? editorObject.stroke : undefined;

  return {
    layerId,
    layerType,
    sourceAssetId: editorObject.editorSourceAssetId ?? null,
    zIndex,
    visible: editorObject.visible,
    locked: editorObject.editorLocked ?? false,
    left: editorObject.left,
    top: editorObject.top,
    scaleX: editorObject.scaleX,
    scaleY: editorObject.scaleY,
    angle: editorObject.angle,
    opacity: editorObject.opacity,
    objectType:
      layerType === "TEXT"
        ? "i-text"
        : layerType === "DECORATION"
          ? editorObject.editorDecorationShape === "CIRCLE"
            ? "circle"
            : "rectangle"
          : "image",
    text:
      "text" in editorObject && typeof editorObject.text === "string"
        ? editorObject.text
        : undefined,
    fontFamily:
      "fontFamily" in editorObject &&
      isSupportedFontFamily(editorObject.fontFamily)
        ? editorObject.fontFamily
        : undefined,
    fontSize:
      "fontSize" in editorObject &&
      typeof editorObject.fontSize === "number"
        ? editorObject.fontSize
        : undefined,
    fill,
    textAlign:
      "textAlign" in editorObject &&
      isSupportedTextAlign(editorObject.textAlign)
        ? editorObject.textAlign
        : undefined,
    width: editorObject.width,
    height: editorObject.height,
    stroke,
    strokeWidth: editorObject.strokeWidth,
  };
}

async function createFabricObject(
  layer: DesignLayer,
  resolveAssetUrl: (layer: DesignLayer) => string,
  signal?: AbortSignal,
): Promise<EditorFabricObject> {
  const { Circle, FabricImage, IText, Rect } = await import("fabric");
  const snapshot = designLayerToFabricSnapshot(layer);
  const common = {
    left: snapshot.left,
    top: snapshot.top,
    originX: "center" as const,
    originY: "center" as const,
    scaleX: snapshot.scaleX,
    scaleY: snapshot.scaleY,
    angle: snapshot.angle,
    opacity: snapshot.opacity,
    visible: snapshot.visible,
    selectable: !snapshot.locked,
    evented: !snapshot.locked,
    lockMovementX: snapshot.locked,
    lockMovementY: snapshot.locked,
    lockRotation: snapshot.locked,
    lockScalingX: snapshot.locked,
    lockScalingY: snapshot.locked,
    lockScalingFlip: true,
    lockSkewingX: true,
    lockSkewingY: true,
  };

  let object: FabricObject;
  switch (snapshot.objectType) {
    case "image":
      object = await FabricImage.fromURL(
        resolveAssetUrl(layer),
        { crossOrigin: "anonymous", signal },
        common,
      );
      break;
    case "i-text":
      object = new IText(snapshot.text ?? "文字", {
        ...common,
        fontFamily: snapshot.fontFamily,
        fontSize: snapshot.fontSize,
        fill: snapshot.fill,
        textAlign: snapshot.textAlign,
        editable: !snapshot.locked,
      });
      break;
    case "rectangle":
      object = new Rect({
        ...common,
        width: snapshot.width,
        height: snapshot.height,
        fill: snapshot.fill,
        stroke: snapshot.stroke,
        strokeWidth: snapshot.strokeWidth,
      });
      break;
    case "circle":
      object = new Circle({
        ...common,
        radius: (snapshot.width ?? 1) / 2,
        fill: snapshot.fill,
        stroke: snapshot.stroke,
        strokeWidth: snapshot.strokeWidth,
      });
      break;
  }

  const editorObject = toEditorObject(object);
  editorObject.editorLayerId = snapshot.layerId;
  editorObject.editorLayerType = snapshot.layerType;
  editorObject.editorSourceAssetId = snapshot.sourceAssetId;
  editorObject.editorZIndex = snapshot.zIndex;
  editorObject.editorLocked = snapshot.locked;
  if (layer.type === "DECORATION") {
    editorObject.editorDecorationShape = layer.shape;
  }
  return editorObject;
}

function toEditorObject(object: FabricObject): EditorFabricObject {
  return object as EditorFabricObject;
}

function normalizeRotation(angle: number): number {
  const normalized = ((angle + 360) % 360 + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function isSupportedFontFamily(
  value: unknown,
): value is TextLayer["fontFamily"] {
  return ["Arial", "Helvetica", "Verdana", "Georgia"].includes(
    String(value),
  );
}

function isSupportedTextAlign(
  value: unknown,
): value is TextLayer["textAlign"] {
  return ["left", "center", "right"].includes(String(value));
}
