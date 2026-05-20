export type AiProviderId = "openrouter" | "openai" | "openai_compatible" | "anthropic";

export const AI_PROVIDERS: Record<
  AiProviderId,
  { label: string; defaultBaseUrl: string | null; customBaseUrl: boolean }
> = {
  openrouter: {
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    customBaseUrl: false,
  },
  openai: {
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    customBaseUrl: false,
  },
  openai_compatible: {
    label: "OpenAI-compatible",
    defaultBaseUrl: null,
    customBaseUrl: true,
  },
  anthropic: {
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    customBaseUrl: false,
  },
};
