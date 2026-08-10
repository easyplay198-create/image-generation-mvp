import { describe, expect, it } from "vitest";

import {
  deserializeDesignDocument,
  parseDesignDocument,
  replaceBackgroundAsset,
  serializeDesignDocument,
  type DesignDocument,
} from "../../src/editor/design-document";
import { DesignHistory } from "../../src/editor/design-history";
import {
  designLayerToFabricSnapshot,
  fabricSnapshotToDesignLayer,
} from "../../src/editor/fabric-adapter";

describe("DesignDocument V1", () => {
  it("round-trips all four controlled layer types through design JSON", () => {
    const document = validDocument();
    const serialized = serializeDesignDocument(document);
    const restored = deserializeDesignDocument(serialized);

    expect(restored).toEqual(document);
    expect(restored.layers.map((layer) => layer.type)).toEqual([
      "AI_BACKGROUND",
      "PRODUCT",
      "TEXT",
      "DECORATION",
    ]);
    expect(serialized).not.toContain("<script");
  });

  it("rejects missing or duplicate product layers and duplicate identities", () => {
    const document = validDocument();
    const withoutProduct = {
      ...document,
      layers: document.layers.filter((layer) => layer.type !== "PRODUCT"),
    };
    const duplicateProduct = {
      ...document,
      layers: [
        ...document.layers,
        { ...document.layers[1]!, id: "product-copy", zIndex: 50 },
      ],
    };
    const duplicateId = {
      ...document,
      layers: document.layers.map((layer, index) =>
        index === 2 ? { ...layer, id: document.layers[1]!.id } : layer,
      ),
    };

    expect(() => parseDesignDocument(withoutProduct)).toThrow(
      "Design document failed schema validation",
    );
    expect(() => parseDesignDocument(duplicateProduct)).toThrow(
      "Design document failed schema validation",
    );
    expect(() => parseDesignDocument(duplicateId)).toThrow(
      "Design document failed schema validation",
    );
  });

  it("rejects executable-shaped unknown fields and oversized JSON", () => {
    const document = validDocument();
    expect(() =>
      parseDesignDocument({ ...document, onLoad: "alert(1)" }),
    ).toThrow("Design document failed schema validation");
    expect(() => deserializeDesignDocument("x".repeat(1_000_001))).toThrow(
      "Design document failed schema validation",
    );
  });

  it("replaces only the background asset reference", () => {
    const before = validDocument();
    const beforeNonBackground = before.layers.filter(
      (layer) => layer.type !== "AI_BACKGROUND",
    );
    const after = replaceBackgroundAsset(before, "background-asset-2");

    expect(
      after.layers.find((layer) => layer.type === "AI_BACKGROUND"),
    ).toMatchObject({
      id: "background-main",
      sourceAssetId: "background-asset-2",
    });
    expect(
      after.layers.filter((layer) => layer.type !== "AI_BACKGROUND"),
    ).toEqual(beforeNonBackground);
  });

  it("round-trips key properties through the Fabric adapter snapshot", () => {
    const document = validDocument();
    const restoredLayers = document.layers.map((layer) =>
      fabricSnapshotToDesignLayer(designLayerToFabricSnapshot(layer)),
    );

    expect(restoredLayers).toEqual(document.layers);
  });

  it("supports bounded session undo and redo", () => {
    const first = validDocument();
    const second = changeText(first, "Second headline");
    const third = changeText(second, "Third headline");
    const history = new DesignHistory(first, 10);

    history.push(second);
    history.push(third);
    expect(history.canUndo).toBe(true);
    expect(findText(history.undo())).toBe("Second headline");
    expect(findText(history.undo())).toBe("Original headline");
    expect(history.canUndo).toBe(false);
    expect(findText(history.redo())).toBe("Second headline");
    expect(findText(history.redo())).toBe("Third headline");
    expect(history.canRedo).toBe(false);
  });
});

function validDocument(): DesignDocument {
  return parseDesignDocument({
    schemaVersion: "1.0",
    styleSpecRevisionId: "style-revision-1",
    canvas: {
      width: 1080,
      height: 1080,
      backgroundColor: "#F5F6F8",
    },
    layers: [
      {
        id: "background-main",
        type: "AI_BACKGROUND",
        sourceAssetId: "background-asset-1",
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
      {
        id: "product-main",
        type: "PRODUCT",
        sourceAssetId: "product-asset-1",
        zIndex: 10,
        visible: true,
        locked: false,
        x: 510,
        y: 570,
        scaleX: 0.8,
        scaleY: 0.8,
        rotation: -10,
        opacity: 1,
      },
      {
        id: "text-headline",
        type: "TEXT",
        sourceAssetId: null,
        zIndex: 20,
        visible: true,
        locked: false,
        x: 540,
        y: 120,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        text: "Original headline",
        fontFamily: "Arial",
        fontSize: 64,
        color: "#172033",
        textAlign: "center",
      },
      {
        id: "decoration-main",
        type: "DECORATION",
        sourceAssetId: null,
        zIndex: 30,
        visible: true,
        locked: false,
        x: 850,
        y: 850,
        scaleX: 1,
        scaleY: 1,
        rotation: 15,
        opacity: 0.8,
        shape: "CIRCLE",
        width: 160,
        height: 160,
        fill: "#DDE4FF",
        stroke: "#566CD6",
        strokeWidth: 3,
      },
    ],
  });
}

function changeText(
  document: DesignDocument,
  text: string,
): DesignDocument {
  return parseDesignDocument({
    ...document,
    layers: document.layers.map((layer) =>
      layer.type === "TEXT" ? { ...layer, text } : layer,
    ),
  });
}

function findText(document: DesignDocument): string | undefined {
  return document.layers.find((layer) => layer.type === "TEXT")?.text;
}
