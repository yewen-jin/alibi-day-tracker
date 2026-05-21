import type { AiProviderId } from "@/lib/ai-providers"

export interface AiProviderPreset {
  id: string
  label: string
  // Which underlying AiProviderId the preset wires up. Direct providers
  // (openai, anthropic, openrouter) use their default base URL. China-based
  // and self-hosted endpoints use openai_compatible with a custom base URL.
  provider: AiProviderId
  baseUrl: string | null
  fastModel: string
  companionModel: string
  notes: string
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: "openrouter-default",
    label: "OpenRouter (hosted defaults)",
    provider: "openrouter",
    baseUrl: null,
    fastModel: "openai/gpt-4.1-nano",
    companionModel: "anthropic/claude-haiku-4.5",
    notes:
      "matches the built-in defaults. one openrouter key spans openai, anthropic, deepseek, qwen, and more.",
  },
  {
    id: "openrouter-anthropic",
    label: "OpenRouter · Anthropic voice",
    provider: "openrouter",
    baseUrl: null,
    fastModel: "openai/gpt-4.1-nano",
    companionModel: "anthropic/claude-sonnet-4.5",
    notes: "fast routing on gpt-4.1-nano, voice on claude sonnet 4.5 via openrouter.",
  },
  {
    id: "openrouter-deepseek",
    label: "OpenRouter · DeepSeek economy",
    provider: "openrouter",
    baseUrl: null,
    fastModel: "deepseek/deepseek-chat-v3.1",
    companionModel: "deepseek/deepseek-v3.2-exp",
    notes: "cheapest end-to-end. routes through openrouter, no separate key needed.",
  },
  {
    id: "openai-direct",
    label: "OpenAI (direct)",
    provider: "openai",
    baseUrl: null,
    fastModel: "gpt-4.1-nano",
    companionModel: "gpt-5-mini",
    notes: "direct openai key. fast and consistent json, conservative voice.",
  },
  {
    id: "anthropic-direct",
    label: "Anthropic (direct)",
    provider: "anthropic",
    baseUrl: null,
    fastModel: "claude-haiku-4-5",
    companionModel: "claude-sonnet-4-5",
    notes:
      "direct anthropic key. enables ephemeral prompt caching on the alibi voice guide.",
  },
  {
    id: "deepseek",
    label: "DeepSeek (direct)",
    provider: "openai_compatible",
    baseUrl: "https://api.deepseek.com/v1",
    fastModel: "deepseek-chat",
    companionModel: "deepseek-reasoner",
    notes: "low cost, strong json. paste your deepseek key.",
  },
  {
    id: "qwen",
    label: "Qwen (Alibaba DashScope)",
    provider: "openai_compatible",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    fastModel: "qwen-turbo",
    companionModel: "qwen-max",
    notes: "strong english + chinese. paste your dashscope api key.",
  },
  {
    id: "zhipu",
    label: "Zhipu (GLM)",
    provider: "openai_compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    fastModel: "glm-4.5-air",
    companionModel: "glm-4.6",
    notes: "very cheap fast tier. paste your zhipu api key.",
  },
  {
    id: "moonshot",
    label: "Moonshot (Kimi)",
    provider: "openai_compatible",
    baseUrl: "https://api.moonshot.ai/v1",
    fastModel: "moonshot-v1-8k",
    companionModel: "kimi-k2-0905-preview",
    notes: "long-context companion option. paste your moonshot api key.",
  },
]
