// llama-server の OpenAI 互換 API を叩くクライアント。
// 可視性フィルタ（画面外タグの判定）と参照プロンプト分解に使用。
import type { ReferenceBuckets } from '../shared/types'
import { DEFAULT_VISIBILITY_PROMPT } from '../shared/prompts'

/** 思考（reasoning）出力を除去する。思考対応モデルが <think>…</think> を出しても無害化。 */
function stripThinking(s: string): string {
  let out = s.replace(/<think>[\s\S]*?<\/think>/gi, '')
  const idx = out.lastIndexOf('</think>') // 途中で切れた思考が残った場合の保険
  if (idx >= 0) out = out.slice(idx + '</think>'.length)
  return out.trim()
}

async function chat(baseUrl: string, system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0,
      max_tokens: maxTokens,
      stream: false,
      // 思考モードをオフに（対応モデル向け。非対応モデルでは無視される）
      reasoning_budget: 0,
      chat_template_kwargs: { enable_thinking: false }
    })
  })
  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return stripThinking(data.choices?.[0]?.message?.content ?? '')
}

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
  tags: string[],
  systemPrompt: string
): Promise<string[]> {
  if (tags.length === 0) return []
  const user = `Camera framing: ${framing || '(unspecified)'}\nTags:\n${tags.map((t) => `- ${t}`).join('\n')}`
  const content = await chat(baseUrl, systemPrompt || DEFAULT_VISIBILITY_PROMPT, user, 512)
  return parseTagArray(content, tags)
}

// --- 参照プロンプト分解（spec §4.9）---

const DECOMPOSE_PROMPT = `Split a Stable Diffusion (Danbooru-style) prompt into five buckets.
Return ONLY a JSON object with these string keys, each a comma-separated list of tags:
{"character":"","background":"","action":"","camera":"","style":""}
Rules:
- character: count tags (1girl/1boy), appearance (hair, eyes, face, body, clothing).
- background: scenery, location, environment, objects.
- action: poses, gestures, interactions (sitting, hugging, waving).
- camera: framing/angle (cowboy shot, from above, close-up, portrait).
- style: art style, medium, artist, quality tags (masterpiece, best quality).
- Put every tag into exactly one bucket; if unsure, choose the closest. Do not invent tags.`

function parseBuckets(content: string): ReferenceBuckets {
  const empty: ReferenceBuckets = { character: '', background: '', action: '', camera: '', style: '' }
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) return empty
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>
    const get = (k: string): string => (typeof obj[k] === 'string' ? (obj[k] as string).trim() : '')
    return {
      character: get('character'),
      background: get('background'),
      action: get('action'),
      camera: get('camera'),
      style: get('style')
    }
  } catch {
    return empty
  }
}

export async function runDecompose(baseUrl: string, positive: string): Promise<ReferenceBuckets> {
  if (!positive.trim()) {
    return { character: '', background: '', action: '', camera: '', style: '' }
  }
  const content = await chat(baseUrl, DECOMPOSE_PROMPT, `Prompt:\n${positive}`, 768)
  return parseBuckets(content)
}
