import type { EvidenceClaim } from "@/lib/types"

export type EvidenceSourceType = EvidenceClaim["source_type"]

export interface EvidencePatternSpec {
  source_field: string
  kind: string
  patterns: RegExp[]
  limit?: number
}

export type PendingEvidenceClaim = EvidenceClaim

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function trimMatch(text: string, start: number, raw: string) {
  let nextStart = start
  let nextEnd = start + raw.length

  while (nextStart < nextEnd && /\s/.test(text[nextStart] ?? "")) {
    nextStart += 1
  }

  while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1] ?? "")) {
    nextEnd -= 1
  }

  return {
    start: nextStart,
    end: nextEnd,
    text: text.slice(nextStart, nextEnd),
  }
}

function contextExcerpt(source: string, start: number, end: number) {
  const contextStart = Math.max(0, start - 48)
  const contextEnd = Math.min(source.length, end + 48)
  const prefix = contextStart > 0 ? "..." : ""
  const suffix = contextEnd < source.length ? "..." : ""
  return normalizeWhitespace(`${prefix}${source.slice(contextStart, contextEnd)}${suffix}`)
}

export function buildEvidenceClaims(
  source: string,
  source_type: EvidenceSourceType,
  specs: EvidencePatternSpec[],
): PendingEvidenceClaim[] {
  const claims: PendingEvidenceClaim[] = []
  const seen = new Set<string>()

  for (const spec of specs) {
    let fieldCount = 0
    for (const pattern of spec.patterns) {
      pattern.lastIndex = 0
      for (const match of source.matchAll(pattern)) {
        if (typeof match.index !== "number") continue

        const trimmed = trimMatch(source, match.index, match[0] ?? "")
        const exact = trimmed.text
        const key = `${spec.source_field}:${trimmed.start}:${trimmed.end}:${exact.toLowerCase()}`
        if (!exact || seen.has(key)) continue

        seen.add(key)
        claims.push({
          id: `${source_type}-${spec.source_field}-${trimmed.start}-${trimmed.end}`,
          source_type,
          source_id: "",
          source_field: spec.source_field,
          kind: spec.kind,
          text: exact,
          context_excerpt: contextExcerpt(source, trimmed.start, trimmed.end),
          start_index: trimmed.start,
          end_index: trimmed.end,
        })

        fieldCount += 1
        if (fieldCount >= (spec.limit ?? 4)) break
      }
      if (fieldCount >= (spec.limit ?? 4)) break
    }
  }

  return claims
}

export function validateEvidenceClaims(
  source: string,
  source_type: EvidenceSourceType,
  claims: Array<Partial<EvidenceClaim>> | null | undefined,
): PendingEvidenceClaim[] {
  const valid: PendingEvidenceClaim[] = []
  const seen = new Set<string>()

  for (const claim of claims ?? []) {
    const text = typeof claim.text === "string" ? claim.text.trim() : ""
    const sourceField = typeof claim.source_field === "string" ? claim.source_field.trim() : ""
    const kind = typeof claim.kind === "string" ? claim.kind.trim() : ""
    const index = text ? source.indexOf(text) : -1
    if (!text || !sourceField || !kind || index < 0) continue

    const key = `${sourceField}:${index}:${text.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    const end = index + text.length
    valid.push({
      id: `${source_type}-${sourceField}-${index}-${end}`,
      source_type,
      source_id: "",
      source_field: sourceField,
      kind,
      text,
      context_excerpt: contextExcerpt(source, index, end),
      start_index: index,
      end_index: end,
    })
  }

  return valid.slice(0, 16)
}

export function attachEvidenceSourceId(
  claims: EvidenceClaim[] | PendingEvidenceClaim[] | null | undefined,
  sourceId: string,
): EvidenceClaim[] {
  return (claims ?? []).map((claim) => ({
    ...claim,
    source_id: sourceId,
    id: claim.id.includes(sourceId) ? claim.id : `${claim.id}-${sourceId}`,
  }))
}

export function quoteEvidence(value: string | null | undefined) {
  if (!value) return "no excerpt"
  const excerpt = value.length > 140 ? `${value.slice(0, 137)}...` : value
  return `"${excerpt}"`
}
