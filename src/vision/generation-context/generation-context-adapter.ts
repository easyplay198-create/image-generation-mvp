import { parseStyleSpecV1 } from "@/src/domain/style-spec";
import {
  GENERATION_CONTEXT_SCHEMA_VERSION,
  parseGenerationContextSource,
  type GenerationContext,
} from "@/src/vision/contracts/generation-context";

/**
 * Converts Vision Intelligence outputs into the existing provider-compatible
 * StyleSpec contract. No image-provider-specific prompt or SDK field leaks
 * into the adapter output.
 */
export class GenerationContextAdapter {
  adapt(input: unknown): GenerationContext {
    const source = parseGenerationContextSource(input);
    const { productProfile, visualDna, visualStrategy } = source;

    const styleSpec = parseStyleSpecV1({
      schemaVersion: "1.0",
      summary: boundedText(
        [
          `商品类别：${productProfile.category}`,
          `商品特征：${productProfile.product_features.join("、")}`,
          `使用场景：${productProfile.user_scenarios.join("、")}`,
          visualStrategy.strategy_name,
          visualStrategy.positioning,
          `目标用户：${visualStrategy.target_user}`,
          `核心卖点：${visualStrategy.selling_point_priority[0].selling_point}`,
          `视觉机会：${visualDna.opportunities.join("、")}`,
        ],
        600,
      ),
      moodKeywords: boundedList(
        [
          ...visualStrategy.visual_style_direction,
          ...visualStrategy.user_psychology,
          ...visualDna.visual_style,
        ],
        12,
        120,
      ),
      palette: visualDna.dominant_colors.slice(0, 8).map((hex, index) => ({
        hex,
        role: `市场视觉参考色 ${index + 1}`,
      })),
      background: {
        scene: boundedText(
          [
            ...visualStrategy.scene_direction,
            ...visualDna.scene_patterns,
          ],
          300,
        ),
        texture: boundedText(
          [
            ...visualStrategy.visual_style_direction,
            ...visualDna.visual_style,
          ],
          200,
        ),
        lighting: boundedText(
          visualStrategy.generation_guidance.prompt_principles,
          200,
        ),
      },
      composition: {
        productPlacement: boundedText(
          [visualStrategy.composition_direction[0]],
          200,
        ),
        cameraAngle: boundedText(
          [
            visualStrategy.composition_direction[1] ??
              visualDna.composition_patterns[0],
          ],
          200,
        ),
        negativeSpace: boundedText(
          [
            ...visualStrategy.text_direction.placement,
            ...visualDna.composition_patterns,
          ],
          200,
        ),
      },
      typography: {
        tone: boundedText(
          [
            visualStrategy.text_direction.tone,
            visualStrategy.text_direction.hierarchy,
            `文字密度：${visualStrategy.text_direction.density}`,
          ],
          200,
        ),
        recommendedStyles: boundedList(
          visualStrategy.text_direction.copy_principles,
          8,
          120,
        ),
      },
      decorations: boundedList(
        visualStrategy.generation_guidance.must_include,
        12,
        120,
      ),
      negativeConstraints: boundedList(
        [
          ...visualStrategy.generation_guidance.must_avoid,
          ...visualStrategy.risk_notes,
          ...productProfile.limitations,
        ],
        20,
        120,
      ),
    });

    return {
      schemaVersion: GENERATION_CONTEXT_SCHEMA_VERSION,
      styleSpec,
    };
  }
}

function boundedText(values: string[], maximum: number): string {
  return values.join("；").slice(0, maximum).trim();
}

function boundedList(
  values: string[],
  maximumItems: number,
  maximumLength: number,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.slice(0, maximumLength).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length === maximumItems) break;
  }

  return result;
}
