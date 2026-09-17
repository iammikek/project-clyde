import { describe, expect, it } from "vitest";
import {
  modelBadgeStyle,
  modelDisplayName,
  modelNodeBorderClass,
  orchestratorPatchForSetting,
  resolveAgentPlatform,
} from "./model-display";

describe("modelDisplayName", () => {
  it("shows the slug tail for OpenRouter models", () => {
    expect(modelDisplayName("x-ai/grok-4.6")).toBe("grok-4.6");
    expect(modelDisplayName("anthropic/claude-sonnet-4")).toBe("claude-sonnet-4");
  });

  it("keeps Claude tier names as-is", () => {
    expect(modelDisplayName("opus")).toBe("opus");
  });
});

describe("modelBadgeStyle", () => {
  it("styles x-ai slugs as Grok grey, not the unknown purple fallback", () => {
    const style = modelBadgeStyle("x-ai/grok-4.6");
    expect(style).toContain("text-[#E8E8E8]");
    expect(style).not.toContain("text-[#8B5CF6]");
  });

  it("keeps known Claude tiers on their agent tokens", () => {
    expect(modelBadgeStyle("opus")).toContain("text-agent-opus");
  });
});

describe("modelNodeBorderClass", () => {
  it("uses the slug border for custom OpenRouter models instead of Opus", () => {
    expect(modelNodeBorderClass("x-ai/grok-4.6")).toBe("border-[#787878]");
    expect(modelNodeBorderClass("opus")).toBe("border-agent-opus");
  });
});

describe("resolveAgentPlatform", () => {
  it("treats a model slug as OpenRouter when platform is missing", () => {
    expect(resolveAgentPlatform(undefined, "x-ai/grok-4.6")).toBe("openrouter");
    expect(resolveAgentPlatform("", "anthropic/claude-sonnet-4")).toBe("openrouter");
  });

  it("keeps an explicit platform", () => {
    expect(resolveAgentPlatform("openrouter", "opus")).toBe("openrouter");
    expect(resolveAgentPlatform("claude", "sonnet")).toBe("claude");
  });

  it("defaults missing platform plus a Claude tier to claude", () => {
    expect(resolveAgentPlatform(undefined, "opus")).toBe("claude");
  });
});

describe("orchestratorPatchForSetting", () => {
  it("writes the custom OpenRouter slug onto Clyde and sets platform", () => {
    expect(orchestratorPatchForSetting("openrouter_model", "x-ai/grok-4.6")).toEqual({
      model: "x-ai/grok-4.6",
      platform: "openrouter",
    });
  });

  it("updates only the Claude tier for clyde_model", () => {
    expect(orchestratorPatchForSetting("clyde_model", "sonnet")).toEqual({
      model: "sonnet",
    });
  });

  it("maps provider toggles onto platform", () => {
    expect(orchestratorPatchForSetting("agent_provider", "openrouter")).toEqual({
      platform: "openrouter",
    });
    expect(orchestratorPatchForSetting("agent_provider", "anthropic")).toEqual({
      platform: "claude",
    });
  });

  it("ignores unrelated settings", () => {
    expect(orchestratorPatchForSetting("debug_mode_enabled", true)).toBeNull();
  });
});
