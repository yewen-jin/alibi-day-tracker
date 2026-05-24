import "server-only"

import { openai } from "@ai-sdk/openai"
import { embed, embedMany } from "ai"

export const DEFAULT_EMBEDDING_DIMENSIONS = 1536
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"

export interface EmbeddingConfig {
  provider: "openai"
  model: string
  dimensions: number
  batchSize: number
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const provider = process.env.ALIBI_EMBEDDING_PROVIDER ?? "openai"
  if (provider !== "openai") {
    throw new Error(`unsupported embedding provider: ${provider}`)
  }

  const dimensions = Number(
    process.env.ALIBI_EMBEDDING_DIMENSIONS ?? DEFAULT_EMBEDDING_DIMENSIONS,
  )

  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error("ALIBI_EMBEDDING_DIMENSIONS must be a positive integer")
  }

  return {
    provider,
    model: process.env.ALIBI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
    dimensions,
    batchSize: Math.max(
      1,
      Number(process.env.ALIBI_EMBEDDING_BATCH_SIZE ?? 32) || 32,
    ),
  }
}

function assertConfigured(config: EmbeddingConfig) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for server-owned embeddings")
  }
  if (config.dimensions !== DEFAULT_EMBEDDING_DIMENSIONS) {
    throw new Error(
      "embedding dimension changes require a memory_chunks migration and vector index rebuild",
    )
  }
}

export async function embedMemoryQuery(value: string) {
  const config = getEmbeddingConfig()
  assertConfigured(config)
  const { embedding } = await embed({
    model: openai.embedding(config.model),
    value,
    providerOptions: {
      openai: { dimensions: config.dimensions },
    },
  })
  return embedding
}

export async function embedMemoryTexts(values: string[]) {
  if (values.length === 0) return []
  const config = getEmbeddingConfig()
  assertConfigured(config)
  const embeddings: number[][] = []

  for (let i = 0; i < values.length; i += config.batchSize) {
    const batch = values.slice(i, i + config.batchSize)
    const result = await embedMany({
      model: openai.embedding(config.model),
      values: batch,
      providerOptions: {
        openai: { dimensions: config.dimensions },
      },
    })
    embeddings.push(...result.embeddings)
  }

  return embeddings
}
