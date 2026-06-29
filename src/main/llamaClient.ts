// llama-server の OpenAI 互換 API を叩くクライアント。
// 現状は可視性フィルタ（画面外タグの判定）に使用。

const SYSTEM_PROMPT = `You decide which Danbooru-style tags depict things that would NOT be visible in the frame, given a camera framing, so they can be removed from a text-to-image prompt.

Rules:
- Only remove tags for body parts, clothing, or scenery clearly outside the frame for the given framing/angle.
  Examples: with "head focus" / "portrait", remove lower-body clothing and footwear; with "from above", floor-level scenery may be hidden, etc.
- Keep any tag that could plausibly be visible, and keep ambiguous tags.
- Never invent tags. Only choose from the given list.
- Output ONLY a JSON array of the exact tags to remove, e.g. ["black skirt","shoes"]. If nothing should be removed, output [].`

function parseTagArray(content: string, candidates: string[]): string[] {
  const match = content.match(/\[[\s\S]*\]/)
  let arr: unknown = []
  if (match) {
    try {
      arr = JSON.parse(match[0])
    } catch {
      arr = []
    }
  }
  if (!Array.isArray(arr)) return []
  const cand = new Set(candidates.map((t) => t.trim().toLowerCase()))
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of arr) {
    if (typeof x !== 'string') continue
    const key = x.trim().toLowerCase()
    if (cand.has(key) && !seen.has(key)) {
      seen.add(key)
      out.push(x.trim())
    }
  }
  return out
}

export async function runVisibilityFilter(
  baseUrl: string,
  framing: string | null,
  tags: string[]
): Promise<string[]> {
  if (tags.length === 0) return []
  const user = `Camera framing: ${framing || '(unspecified)'}\nTags:\n${tags.map((t) => `- ${t}`).join('\n')}`

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user }
      ],
      temperature: 0, // 再現性のため決定的に
      max_tokens: 512,
      stream: false
    })
  })
  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content ?? ''
  return parseTagArray(content, tags)
}
