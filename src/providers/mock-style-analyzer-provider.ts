import type {
  StyleAnalysisResult,
  StyleAnalyzerProvider,
} from "@/src/providers/style-analyzer-provider";
import { StyleAnalyzerProviderError } from "@/src/providers/style-analyzer-provider";

export const MOCK_STYLE_ANALYSIS_SCENARIOS = [
  "success",
  "auth-failure",
  "rate-limited",
  "policy-rejected",
  "timeout",
  "invalid-response",
] as const;

export type MockStyleAnalysisScenario =
  (typeof MOCK_STYLE_ANALYSIS_SCENARIOS)[number];

export class MockStyleAnalyzerProvider implements StyleAnalyzerProvider {
  readonly name = "mock";

  constructor(
    private readonly scenario: MockStyleAnalysisScenario = "success",
  ) {}

  async analyze(
    input: Parameters<StyleAnalyzerProvider["analyze"]>[0],
  ): Promise<StyleAnalysisResult> {
    const requestId = `mock-${this.scenario}-${input.projectId}`;

    switch (this.scenario) {
      case "auth-failure":
        throw new StyleAnalyzerProviderError(
          "PROVIDER_AUTH_FAILED",
          false,
          "风格分析 Provider 认证失败。",
          requestId,
        );
      case "rate-limited":
        throw new StyleAnalyzerProviderError(
          "PROVIDER_RATE_LIMITED",
          true,
          "风格分析 Provider 请求受限。",
          requestId,
        );
      case "policy-rejected":
        throw new StyleAnalyzerProviderError(
          "PROVIDER_POLICY_REJECTED",
          false,
          "参考内容被 Provider 策略拒绝。",
          requestId,
        );
      case "timeout":
        throw new StyleAnalyzerProviderError(
          "PROVIDER_TIMEOUT",
          true,
          "风格分析 Provider 请求超时。",
          requestId,
        );
      case "invalid-response":
        return {
          providerRequestId: requestId,
          output: {
            schemaVersion: "1.0",
            summary: "invalid mock output",
            moodKeywords: [],
            palette: [{ hex: "not-a-color", role: "invalid" }],
          },
        };
      case "success":
        return {
          providerRequestId: requestId,
          output: {
            schemaVersion: "1.0",
            summary: `${input.productInfo.category} 商品的简洁电商视觉，参考 ${input.referenceImages.length} 张图片。`,
            moodKeywords: ["清晰", "克制", "可信赖"],
            palette: [
              { hex: "#F5F1E8", role: "背景主色" },
              { hex: "#243047", role: "文字与对比色" },
              { hex: "#D8A75B", role: "强调色" },
            ],
            background: {
              scene: "干净的棚拍台面与柔和纵深背景",
              texture: "低对比度哑光材质",
              lighting: "左上方柔光并保留自然接触阴影",
            },
            composition: {
              productPlacement: "商品位于画面中央偏下",
              cameraAngle: "与商品主体平视",
              negativeSpace: "顶部和右侧保留文案空间",
            },
            typography: {
              tone: "现代、清晰、不过度装饰",
              recommendedStyles: ["无衬线粗体标题", "常规字重说明文字"],
            },
            decorations: ["细线几何框", "小面积强调色块"],
            negativeConstraints: [
              "不得改变商品外观",
              "不得添加禁用宣传语",
              ...input.productInfo.forbiddenClaims.map(
                (claim) => `不得使用：${claim}`,
              ),
            ].slice(0, 20),
          },
        };
    }
  }
}
