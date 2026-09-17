import type { AgentModel } from "@/stores/agent-store";
import { modelBadgeStyle, modelDisplayName } from "@/lib/model-display";

type ModelBadgeProps = {
  model: AgentModel;
  role?: string;
};

export function ModelBadge({ model, role }: ModelBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest rounded-[2px] border ${modelBadgeStyle(model)}`}
    >
      {role || modelDisplayName(model)}
    </span>
  );
}
