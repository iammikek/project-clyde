import type { Agent, AgentPlatform } from "@/stores/agent-store";

const knownBadgeStyles: Record<string, string> = {
  opus: "bg-agent-opus/15 text-agent-opus border-agent-opus/30",
  sonnet: "bg-agent-sonnet/15 text-agent-sonnet border-agent-sonnet/30",
  haiku: "bg-agent-haiku/15 text-agent-haiku border-agent-haiku/30",
  "gemini-pro": "bg-[#4285F4]/15 text-[#4285F4] border-[#4285F4]/30",
  "gemini-flash": "bg-[#FBBC04]/15 text-[#FBBC04] border-[#FBBC04]/30",
  "gemini-lite": "bg-[#34A853]/15 text-[#34A853] border-[#34A853]/30",
  "gpt-5.4": "bg-[#10A37F]/15 text-[#10A37F] border-[#10A37F]/30",
  "gpt-5.4-mini": "bg-[#10A37F]/15 text-[#10A37F] border-[#10A37F]/30",
  "gpt-5.4-nano": "bg-[#10A37F]/15 text-[#10A37F] border-[#10A37F]/30",
};

const openrouterProviderStyles: Record<string, string> = {
  anthropic: "bg-[#D97706]/15 text-[#D97706] border-[#D97706]/30",
  openai: "bg-[#10A37F]/15 text-[#10A37F] border-[#10A37F]/30",
  google: "bg-[#4285F4]/15 text-[#4285F4] border-[#4285F4]/30",
  meta: "bg-[#0668E1]/15 text-[#0668E1] border-[#0668E1]/30",
  deepseek: "bg-[#5B6EE1]/15 text-[#5B6EE1] border-[#5B6EE1]/30",
  "x-ai": "bg-[#787878]/15 text-[#E8E8E8] border-[#787878]/30",
};

const defaultBadgeStyle = "bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30";

const knownNodeBorders: Record<string, string> = {
  opus: "border-agent-opus",
  sonnet: "border-agent-sonnet",
  haiku: "border-agent-haiku",
  "gemini-pro": "border-[#4285F4]",
  "gemini-flash": "border-[#FBBC04]",
  "gemini-lite": "border-[#34A853]",
  "gpt-5.4": "border-[#10A37F]",
  "gpt-5.4-mini": "border-[#10A37F]",
  "gpt-5.4-nano": "border-[#10A37F]",
};

export function isOpenRouterSlug(model: string): boolean {
  return model.includes("/");
}

export function modelDisplayName(model: string): string {
  if (isOpenRouterSlug(model)) {
    return model.split("/").pop() || model;
  }
  return model;
}

export function modelBadgeStyle(model: string): string {
  if (model in knownBadgeStyles) return knownBadgeStyles[model];
  if (isOpenRouterSlug(model)) {
    const provider = model.split("/")[0];
    return openrouterProviderStyles[provider] || defaultBadgeStyle;
  }
  return defaultBadgeStyle;
}

export function modelNodeBorderClass(model: string): string {
  return (
    knownNodeBorders[model] ||
    (isOpenRouterSlug(model) ? "border-[#787878]" : "border-agent-opus")
  );
}

export function resolveAgentPlatform(
  platform: string | undefined | null,
  model: string
): AgentPlatform {
  if (platform) return platform as AgentPlatform;
  return isOpenRouterSlug(model) ? "openrouter" : "claude";
}

export function orchestratorPatchForSetting(
  key: string,
  value: unknown
): Partial<Pick<Agent, "model" | "platform">> | null {
  if (key === "clyde_model") {
    return { model: value as Agent["model"] };
  }
  if (key === "openrouter_model") {
    return { model: value as Agent["model"], platform: "openrouter" };
  }
  if (key === "agent_provider") {
    return { platform: value === "openrouter" ? "openrouter" : "claude" };
  }
  return null;
}
