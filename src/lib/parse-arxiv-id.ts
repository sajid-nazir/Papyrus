// Recognizes a pasted arXiv URL or bare id as a search query and extracts
// the canonical id (no version suffix) — e.g. "2301.12345", "2301.12345v2",
// "arxiv.org/abs/2301.12345", "https://arxiv.org/pdf/2301.12345.pdf".
// Only the modern YYMM.NNNNN id format is handled; the index this app
// searches doesn't go back far enough for the old category/number scheme
// to matter.
const BARE_ID_RE = /^(\d{4}\.\d{4,5})(?:v\d+)?$/
const URL_RE = /^(?:https?:\/\/)?(?:www\.)?arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?$/

export function parseArxivId(input: string): string | null {
  const trimmed = input.trim()
  const bareMatch = BARE_ID_RE.exec(trimmed)
  if (bareMatch) return bareMatch[1]
  const urlMatch = URL_RE.exec(trimmed)
  if (urlMatch) return urlMatch[1]
  return null
}
