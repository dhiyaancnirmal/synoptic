export type LiquidityPreset = "uniform" | "bell" | "bid_ask_inverse";

export interface LiquidityPresetInput {
  volatilityScore: number;
  flowBias: number;
  risk: number;
}

export interface LiquidityBand {
  lowerBoundPct: number;
  upperBoundPct: number;
  leg?: "bid" | "ask";
}

export interface LiquidityPresetResult {
  preset: LiquidityPreset;
  bands: LiquidityBand[];
  executeAsSeparateLegs: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeLiquidityPreset(
  preset: LiquidityPreset,
  input: LiquidityPresetInput
): LiquidityPresetResult {
  const volatilityScore = clamp(input.volatilityScore, 0, 1);
  const flowBias = clamp(input.flowBias, -1, 1);
  const risk = clamp(input.risk, 0, 1);

  if (preset === "uniform") {
    const widthPct = clamp(0.35 + volatilityScore * 0.2 + risk * 0.15, 0.25, 0.85);
    return {
      preset,
      executeAsSeparateLegs: false,
      bands: [
        {
          lowerBoundPct: -widthPct / 2,
          upperBoundPct: widthPct / 2
        }
      ]
    };
  }

  if (preset === "bell") {
    const widthPct = clamp(0.08 + volatilityScore * 0.1 + risk * 0.08, 0.05, 0.3);
    return {
      preset,
      executeAsSeparateLegs: false,
      bands: [
        {
          lowerBoundPct: -widthPct / 2,
          upperBoundPct: widthPct / 2
        }
      ]
    };
  }

  const magnitude = clamp(Math.abs(flowBias), 0, 1);
  const widthPct = 0.18 + magnitude * 0.12;
  return {
    preset,
    executeAsSeparateLegs: true,
    bands: [
      {
        leg: "bid",
        lowerBoundPct: -widthPct,
        upperBoundPct: -0.02
      },
      {
        leg: "ask",
        lowerBoundPct: 0.02,
        upperBoundPct: widthPct
      }
    ]
  };
}

export function computeAllLiquidityPresets(input: LiquidityPresetInput): LiquidityPresetResult[] {
  return [
    computeLiquidityPreset("uniform", input),
    computeLiquidityPreset("bell", input),
    computeLiquidityPreset("bid_ask_inverse", input)
  ];
}
