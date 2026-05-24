import { describe, expect, it } from "vitest"
import {
  chunksForCompanionMessage,
  chunksForTimeBlock,
  chunksForTimeBlockNoteVersion,
} from "@/lib/rag/chunking"
import type {
  CompanionMessage,
  TimeBlock,
  TimeBlockNoteVersion,
} from "@/lib/types"

function block(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    id: "block-1",
    user_id: "user-1",
    started_at: "2026-01-01T10:00:00.000Z",
    ended_at: "2026-01-01T11:00:00.000Z",
    duration_seconds: 3600,
    category_id: null,
    task_name: "invoice",
    category: "admin",
    hashtags: ["money"],
    notes: "finished the invoice after avoiding it",
    mood: null,
    effort_level: "hard",
    satisfaction: "satisfied",
    avoidance_marker: true,
    hyperfocus_marker: false,
    guilt_marker: false,
    novelty_marker: false,
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-01T11:00:00.000Z",
    ...overrides,
  }
}

function message(overrides: Partial<CompanionMessage> = {}): CompanionMessage {
  return {
    id: "message-1",
    conversation_id: "conversation-1",
    user_id: "user-1",
    role: "user",
    content: "i avoided the invoice then finished it",
    message_type: "chat",
    model: "test",
    related_time_block_id: null,
    metadata: {},
    created_at: "2026-01-01T12:00:00.000Z",
    ...overrides,
  }
}

describe("rag chunking", () => {
  it("builds deterministic source-backed block chunks", () => {
    const first = chunksForTimeBlock(block())
    const second = chunksForTimeBlock(block())

    expect(first).toEqual(second)
    expect(first[0]).toMatchObject({
      id: "time_block:block-1:0",
      sourceType: "time_block",
      sourceId: "block-1",
      contentHash: first[0].contentHash,
    })
    expect(first[0].chunkText).toContain("finished the invoice")
    expect(first[0].chunkText).toContain("markers: avoidance")
  })

  it("changes hashes when source text changes", () => {
    const before = chunksForTimeBlock(block({ notes: "first note" }))[0]
    const after = chunksForTimeBlock(block({ notes: "second note" }))[0]

    expect(before.id).toBe(after.id)
    expect(before.contentHash).not.toBe(after.contentHash)
  })

  it("skips assistant messages and tiny note versions", () => {
    expect(chunksForCompanionMessage(message({ role: "assistant" }))).toEqual([])

    const version: TimeBlockNoteVersion = {
      id: "version-1",
      time_block_id: "block-1",
      user_id: "user-1",
      previous_notes: null,
      new_notes: "tiny",
      source: "manual",
      created_at: "2026-01-01T12:00:00.000Z",
    }
    expect(chunksForTimeBlockNoteVersion(version)).toEqual([])
  })
})
