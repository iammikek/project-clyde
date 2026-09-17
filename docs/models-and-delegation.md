# Models and delegation

Real org-chart delegation (specialists using files, APIs, integrations) is a **provider** feature, not a model-name feature.

Clyde gives each specialist a common UK first name. Those names are labels, not product roles — route by **role and skills**, not by whoever was called Oliver or James this week.

| Clyde setup | Can specialists run with tools? | Notes |
|---|---|---|
| **Anthropic** + Opus / Sonnet / Haiku | Yes — Claude Agent SDK `Task` tool | This is the team OS |
| **OpenRouter** + any slug (Grok, Claude, GPT, …) | No — `Task` is not available | Specialists are prompt-in/text-out (`claude_task`). Clyde keeps the APIs and usually does the work himself |

Switching OpenRouter to `anthropic/claude-sonnet-4` does **not** restore `Task`. Only **Settings → Agent Provider → Anthropic** does.

## Best value that still delegates

**Anthropic, Clyde on Sonnet, subagents on Haiku.**

That is the wizard **cost-saving mode**. Sonnet is cheap enough to run as CEO and still routes work. Haiku specialists do the volume.

| Role | Model | Why |
|---|---|---|
| Clyde | **Sonnet** | Best value orchestrator with `Task` |
| Engineering / architecture specialist | Sonnet | Needs more headroom than Haiku |
| High-volume CRM / ops specialists | Haiku | Cheap enough to run often |
| Clyde | Opus | Highest quality routing; default; not the value pick |
| Clyde | Haiku | Cheapest Anthropic CEO; still has `Task`, weaker at handing work off |

Haiku-as-Clyde *can* delegate. Sonnet-as-Clyde is the setup that actually does it reliably without Opus prices.

## What OpenRouter is for

- Run Clyde as a **single** agent on Grok or another slug
- Optional **tool-free** specialists (review, rewrite, summarise text Clyde already fetched)

It is not a substitute for Anthropic when you want the org chart to do the jobs on the cards.

After changing provider or Clyde’s model, start a **new chat**. The live session keeps the old manager.
