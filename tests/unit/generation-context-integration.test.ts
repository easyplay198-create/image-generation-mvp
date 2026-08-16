import { describe, expect, it, vi } from "vitest";

import {
  parseCreateGenerationJob,
  type CreateGenerationJobInput,
} from "../../src/domain/generation-job";
import { parseStyleSpecV1 } from "../../src/domain/style-spec";
import { MockImageGenerationProvider } from "../../src/providers/mock-image-generation-provider";
import { GenerationService } from "../../src/services/generation-service";
import type { DatabaseClient } from "../../src/storage/database";
import {
  GenerationContextValidationError,
  parseGenerationContextSource,
  type GenerationContextSource,
} from "../../src/vision/contracts/generation-context";
import { GenerationContextAdapter } from "../../src/vision/generation-context/generation-context-adapter";

describe("Generation Context V1 contract and adapter", () => {
  it("validates and normalizes Product Profile, Visual DNA and Visual Strategy", () => {
    const source = parseGenerationContextSource({
      ...validSource(),
      productProfile: {
        ...validSource().productProfile,
        category: "  Drinkware  ",
      },
      visualDna: {
        ...validSource().visualDna,
        dominant_colors: ["#aabbcc"],
      },
      visualStrategy: {
        ...validSource().visualStrategy,
        strategy_name: "  Warm Urban Momentum  ",
      },
    });

    expect(source.productProfile.category).toBe("Drinkware");
    expect(source.visualDna.dominant_colors).toEqual(["#AABBCC"]);
    expect(source.visualStrategy.strategy_name).toBe("Warm Urban Momentum");
  });

  it.each([
    [
      "invalid Product Profile",
      {
        ...validSource(),
        productProfile: {
          ...validSource().productProfile,
          product_features: [],
        },
      },
    ],
    [
      "invalid Visual DNA",
      {
        ...validSource(),
        visualDna: { ...validSource().visualDna, dominant_colors: [] },
      },
    ],
    [
      "invalid Visual Strategy",
      {
        ...validSource(),
        visualStrategy: {
          ...validSource().visualStrategy,
          scene_direction: [],
        },
      },
    ],
    ["unknown source field", { ...validSource(), provider: "qwen" }],
  ])("rejects %s", (_name, candidate) => {
    expect(() => parseGenerationContextSource(candidate)).toThrow(
      GenerationContextValidationError,
    );
  });

  it("maps all three Vision contracts into a valid provider-neutral StyleSpec", () => {
    const context = new GenerationContextAdapter().adapt(validSource());

    expect(context.schemaVersion).toBe("1.0");
    expect(parseStyleSpecV1(context.styleSpec)).toEqual(context.styleSpec);
    expect(context.styleSpec).toMatchObject({
      summary: expect.stringContaining("Warm Urban Momentum"),
      palette: [{ hex: "#AABBCC", role: "市场视觉参考色 1" }],
      background: {
        scene: expect.stringContaining("Morning commute"),
      },
      typography: {
        tone: expect.stringContaining("concise and reassuring"),
      },
      negativeConstraints: expect.arrayContaining([
        "Unsupported performance badges",
        "Do not imply unlimited heat retention",
        "Not suitable for microwave use",
      ]),
    });
    expect(context.styleSpec.summary).toContain("商品类别：Drinkware");
    expect(context.styleSpec.summary).toContain(
      "商品特征：Double-wall construction",
    );
  });

  it("bounds and de-duplicates values to the existing StyleSpec limits", () => {
    const repeatedDirection = "A".repeat(120);
    const source = validSource();
    source.visualStrategy.scene_direction = Array.from(
      { length: 16 },
      (_, index) => `${index}-${repeatedDirection}`,
    );
    source.visualStrategy.visual_style_direction = [
      repeatedDirection,
      repeatedDirection,
    ];

    const context = new GenerationContextAdapter().adapt(source);

    expect(context.styleSpec.background.scene.length).toBeLessThanOrEqual(300);
    expect(context.styleSpec.moodKeywords).toHaveLength(3);
    expect(new Set(context.styleSpec.moodKeywords).size).toBe(
      context.styleSpec.moodKeywords.length,
    );
    expect(context.styleSpec.moodKeywords[0]?.length).toBeLessThanOrEqual(120);
  });

  it("feeds the unchanged ImageGenerationProvider interface", async () => {
    const context = new GenerationContextAdapter().adapt(validSource());
    const provider = new MockImageGenerationProvider();
    const submission = await provider.generateBackground({
      projectId: "project-1",
      styleSpec: context.styleSpec,
      productContext: {
        productName: "Insulated travel mug",
        category: "Drinkware",
        sellingPoints: ["Portable temperature retention"],
        targetAudience: "Urban commuters",
        forbiddenClaims: ["Keeps drinks hot forever"],
      },
      canvas: { width: 1080, height: 1080 },
      idempotencyKey: "context-generation-0001",
    });

    await expect(provider.getJobStatus(submission)).resolves.toMatchObject({
      status: "SUCCEEDED",
      image: { mimeType: "image/png" },
    });
  });
});

describe("Generation Context request integration", () => {
  it("preserves the legacy direct-generation request", () => {
    expect(
      parseCreateGenerationJob({
        idempotencyKey: "legacy-generation-0001",
        styleSpecRevisionId: "base-revision-1",
      }),
    ).toEqual({
      idempotencyKey: "legacy-generation-0001",
      styleSpecRevisionId: "base-revision-1",
    });
  });

  it("accepts an optional validated Generation Context source", () => {
    const request = parseCreateGenerationJob({
      idempotencyKey: "strategy-generation-0001",
      styleSpecRevisionId: "base-revision-1",
      generationContext: validSource(),
    });

    expect(request.generationContext?.visualStrategy.strategy_name).toBe(
      "Warm Urban Momentum",
    );
  });

  it("rejects an invalid Generation Context at the API boundary", () => {
    expect(() =>
      parseCreateGenerationJob({
        idempotencyKey: "strategy-generation-0002",
        styleSpecRevisionId: "base-revision-1",
        generationContext: {
          ...validSource(),
          visualDna: { ...validSource().visualDna, opportunities: [] },
        },
      }),
    ).toThrow("图片生成任务参数校验失败。");
  });

  it("persists a derived StyleSpec revision and points the existing job to it", async () => {
    const fixture = generationDatabaseFixture();
    const request: CreateGenerationJobInput = {
      idempotencyKey: "strategy-generation-0003",
      styleSpecRevisionId: "base-revision-1",
      generationContext: validSource(),
    };

    const job = await new GenerationService(fixture.database).createJob({
      ownerId: "owner-1",
      projectId: "project-1",
      providerName: "mock",
      requestId: "3ee2e9e9-d13d-4a58-8936-523607fa2965",
      request,
    });

    expect(fixture.styleSpecRevisionCreate).toHaveBeenCalledOnce();
    const revisionData =
      fixture.styleSpecRevisionCreate.mock.calls[0]![0].data;
    expect(revisionData).toMatchObject({
      ownerId: "owner-1",
      projectId: "project-1",
      revisionNumber: 5,
      schemaVersion: "1.0",
    });
    expect(parseStyleSpecV1(revisionData.specJson)).toMatchObject({
      summary: expect.stringContaining("Warm Urban Momentum"),
    });
    expect(fixture.jobCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        styleSpecRevisionId: "context-revision-5",
        inputJson: expect.objectContaining({
          styleSpecRevisionId: "context-revision-5",
        }),
      }),
    });
    expect(job.styleSpecRevisionId).toBe("context-revision-5");
  });

  it("does not create a derived revision for the legacy direct flow", async () => {
    const fixture = generationDatabaseFixture();

    const job = await new GenerationService(fixture.database).createJob({
      ownerId: "owner-1",
      projectId: "project-1",
      providerName: "mock",
      requestId: "3ee2e9e9-d13d-4a58-8936-523607fa2966",
      request: {
        idempotencyKey: "legacy-generation-0002",
        styleSpecRevisionId: "base-revision-1",
      },
    });

    expect(fixture.styleSpecRevisionCreate).not.toHaveBeenCalled();
    expect(fixture.jobCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        styleSpecRevisionId: "base-revision-1",
        inputJson: expect.objectContaining({
          styleSpecRevisionId: "base-revision-1",
        }),
      }),
    });
    expect(job.styleSpecRevisionId).toBe("base-revision-1");
  });

  it("binds revision 2, product and distinct visual references to an 800px Qwen context", async () => {
    const fixture = generationDatabaseFixture();

    await new GenerationService(fixture.database).createJob({
      ownerId: "owner-1",
      projectId: "project-1",
      providerName: "qwen",
      requestId: "3ee2e9e9-d13d-4a58-8936-523607fa2967",
      request: {
        idempotencyKey: "qwen-reference-generation-0001",
        styleSpecRevisionId: "base-revision-1",
      },
    });

    expect(fixture.productAssetFindFirst).toHaveBeenCalledWith({
      where: {
        ownerId: "owner-1",
        projectId: "project-1",
        kind: "PRODUCT",
      },
      select: expect.objectContaining({
        id: true,
        mimeType: true,
        width: true,
        height: true,
        byteSize: true,
        sha256: true,
      }),
    });
    expect(fixture.jobCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inputJson: expect.objectContaining({
          schemaVersion: "1.1",
          generationContext: {
            schemaVersion: "1.0",
            styleSpecRevisionNumber: 2,
            productReference: {
              assetId: "product-asset-1",
              mimeType: "image/png",
              width: 1080,
              height: 1080,
              byteSize: 4096,
              sha256: "product-sha256",
            },
            visualReferences: [
              {
                assetId: "reference-asset-2",
                mimeType: "image/png",
                width: 900,
                height: 1200,
                byteSize: 2048,
                sha256: "reference-sha256",
              },
            ],
            canvas: { width: 800, height: 800 },
          },
        }),
      }),
    });
  });

  it("rejects a Qwen job when the project has no product asset", async () => {
    const fixture = generationDatabaseFixture({ productAsset: null });

    await expect(
      new GenerationService(fixture.database).createJob({
        ownerId: "owner-1",
        projectId: "project-1",
        providerName: "qwen",
        requestId: "3ee2e9e9-d13d-4a58-8936-523607fa2968",
        request: {
          idempotencyKey: "qwen-reference-generation-0002",
          styleSpecRevisionId: "base-revision-1",
        },
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_ASSET_REQUIRED", status: 409 });
    expect(fixture.jobCreate).not.toHaveBeenCalled();
  });
});

function validSource(): GenerationContextSource {
  return {
    productProfile: {
      schemaVersion: "1.0",
      category: "Drinkware",
      product_features: ["Double-wall construction"],
      user_scenarios: ["Commuting"],
      selling_points: ["Portable temperature retention"],
      limitations: ["Not suitable for microwave use"],
      claims: ["Capacity is 500 ml"],
    },
    visualDna: {
      schemaVersion: "1.0",
      dominant_colors: ["#AABBCC"],
      composition_patterns: ["Centered product with negative space"],
      scene_patterns: ["Bright studio surface"],
      text_density: "low",
      visual_style: ["Minimal product-led commerce"],
      opportunities: ["Use a warmer lifestyle context"],
    },
    visualStrategy: {
      schemaVersion: "1.0",
      strategy_name: "Warm Urban Momentum",
      target_user: "Urban commuters who value practical design",
      user_psychology: ["Seeks reliable everyday convenience"],
      positioning:
        "A warm, practical alternative to sterile competitor imagery",
      scene_direction: ["Morning commute in natural light"],
      composition_direction: [
        "Product-centered with space for one proof point",
      ],
      visual_style_direction: [
        "Warm minimalism with restrained blue accents",
      ],
      text_direction: {
        hierarchy: "One concise headline followed by one proof point",
        tone: "concise and reassuring",
        density: "low",
        placement: ["Keep copy in the upper-left negative space"],
        copy_principles: ["Use factual, non-absolute language"],
      },
      selling_point_priority: [
        {
          priority: 1,
          selling_point: "Portable temperature retention",
          rationale: "Primary purchase motivation",
        },
      ],
      risk_notes: ["Do not imply unlimited heat retention"],
      generation_guidance: {
        objective: "Create a credible commuter-focused hero image",
        prompt_principles: ["Use natural morning light"],
        must_include: ["Recognizable morning commute context"],
        must_avoid: ["Unsupported performance badges"],
      },
    },
  };
}

function generationDatabaseFixture(
  options: {
    productAsset?: {
      id: string;
      mimeType: string;
      width: number;
      height: number;
      byteSize: bigint;
      sha256: string;
    } | null;
  } = {},
) {
  const now = new Date("2026-08-11T10:00:00.000Z");
  const styleSpecRevisionCreate = vi.fn(
    async (input: { data: Record<string, unknown> }) => {
      void input;
      return { id: "context-revision-5", revisionNumber: 5 };
    },
  );
  const jobCreate = vi.fn(async (input: { data: Record<string, unknown> }) => ({
    id: "job-1",
    projectId: "project-1",
    type: input.data.type,
    status: input.data.status,
    attemptCount: 0,
    maxAttempts: input.data.maxAttempts,
    providerName: input.data.providerName,
    providerRequestId: null,
    styleSpecRevisionId: input.data.styleSpecRevisionId,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  }));
  const productAssetFindFirst = vi.fn(async () =>
    options.productAsset === undefined
      ? {
          id: "product-asset-1",
          mimeType: "image/png",
          width: 1080,
          height: 1080,
          byteSize: BigInt(4096),
          sha256: "product-sha256",
        }
      : options.productAsset,
  );
  const transaction = {
    $queryRaw: vi.fn(async () => [{ id: "project-1" }]),
    job: {
      findFirst: vi.fn(async () => null),
      create: jobCreate,
    },
    styleSpecRevision: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({
          id: "base-revision-1",
          revisionNumber: 2,
          specJson: baseStyleSpec(),
        })
        .mockResolvedValueOnce({ revisionNumber: 4 }),
      create: styleSpecRevisionCreate,
    },
    project: {
      findFirst: vi.fn(async () => ({
        productName: "Insulated travel mug",
        category: "Drinkware",
        sellingPoints: ["Portable temperature retention"],
        targetAudience: "Urban commuters",
        forbiddenClaims: ["Keeps drinks hot forever"],
      })),
    },
    asset: {
      findFirst: productAssetFindFirst,
      findMany: vi.fn(async () => [
        {
          id: "reference-product-duplicate",
          mimeType: "image/png",
          width: 1080,
          height: 1080,
          byteSize: BigInt(4096),
          sha256: "product-sha256",
        },
        {
          id: "reference-asset-2",
          mimeType: "image/png",
          width: 900,
          height: 1200,
          byteSize: BigInt(2048),
          sha256: "reference-sha256",
        },
      ]),
    },
  };
  const database = {
    $transaction: async (operation: (value: typeof transaction) => unknown) =>
      operation(transaction),
  } as unknown as DatabaseClient;

  return {
    database,
    jobCreate,
    productAssetFindFirst,
    styleSpecRevisionCreate,
  };
}

function baseStyleSpec() {
  return {
    schemaVersion: "1.0",
    summary: "Existing direct-generation style",
    moodKeywords: ["clean"],
    palette: [{ hex: "#FFFFFF", role: "Background" }],
    background: {
      scene: "Studio sweep",
      texture: "Matte",
      lighting: "Soft key light",
    },
    composition: {
      productPlacement: "Centered",
      cameraAngle: "Eye level",
      negativeSpace: "Above product",
    },
    typography: {
      tone: "Modern",
      recommendedStyles: ["Sans serif"],
    },
    decorations: [],
    negativeConstraints: ["Do not alter the product"],
  };
}
