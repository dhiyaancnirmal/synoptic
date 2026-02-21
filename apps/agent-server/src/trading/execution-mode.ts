import { getExecutionChainProfile } from "@synoptic/agent-core";
import type { SwapExecutionMode } from "../env.js";

export type EffectiveSwapExecutionMode = "live" | "simulated";

export interface SwapModeResolution {
  requestedMode: SwapExecutionMode;
  effectiveMode: EffectiveSwapExecutionMode;
  reason: string;
  profile: ReturnType<typeof getExecutionChainProfile>;
}

export function resolveSwapModeForChain(
  env: {
    swapExecutionMode: SwapExecutionMode;
    simulatedChainIds: number[];
    simulateOnchain: boolean;
  },
  chainId: number
): SwapModeResolution {
  const profile = getExecutionChainProfile(chainId);
  const requestedMode = env.swapExecutionMode;

  if (env.simulateOnchain) {
    return {
      requestedMode,
      effectiveMode: "simulated",
      reason: "SIMULATE_ONCHAIN compatibility flag is enabled",
      profile
    };
  }

  if (requestedMode === "simulated") {
    return {
      requestedMode,
      effectiveMode: "simulated",
      reason: "SWAP_EXECUTION_MODE is set to simulated",
      profile
    };
  }

  if (requestedMode === "live") {
    if (!profile.supportsLiveTradingApi) {
      return {
        requestedMode,
        effectiveMode: "simulated",
        reason: `chain ${chainId} is not marked as live-tradable`,
        profile
      };
    }
    return {
      requestedMode,
      effectiveMode: "live",
      reason: "SWAP_EXECUTION_MODE is set to live",
      profile
    };
  }

  const simulatedByList = env.simulatedChainIds.includes(chainId);
  if (profile.supportsLiveTradingApi && !simulatedByList) {
    return {
      requestedMode,
      effectiveMode: "live",
      reason: "auto mode selected live execution for this chain",
      profile
    };
  }

  return {
    requestedMode,
    effectiveMode: "simulated",
    reason: simulatedByList
      ? `chain ${chainId} is listed in SIMULATED_CHAIN_IDS`
      : `chain ${chainId} is not marked as live-tradable`,
    profile
  };
}

export function isLiveExecutionConfigured(env: {
  agentPrivateKey: string;
  executionRpcUrl: string;
  uniswapApiKey: string;
}): boolean {
  return Boolean(env.agentPrivateKey) && Boolean(env.executionRpcUrl) && Boolean(env.uniswapApiKey);
}
