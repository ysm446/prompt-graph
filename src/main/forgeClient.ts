// WebUI Forge の REST API クライアント（/sdapi/v1/*）。
// Forge 2 でも --api 付き起動なら REST が使えることを実機確認済み。
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ForgeSdModel, ForgeTxt2ImgParams, ForgeTxt2ImgResult } from '../shared/types'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Forge API エラー (${res.status}): ${url}`)
  return (await res.json()) as T
}

export async function listSdModels(baseUrl: string): Promise<ForgeSdModel[]> {
  const raw = await getJson<Array<{ title: string; model_name: string }>>(
    `${baseUrl}/sdapi/v1/sd-models`
  )
  return raw.map((m) => ({ title: m.title, modelName: m.model_name }))
}

export async function listSamplers(baseUrl: string): Promise<string[]> {
  const raw = await getJson<Array<{ name: string }>>(`${baseUrl}/sdapi/v1/samplers`)
  return raw.map((s) => s.name)
}

export async function txt2img(
  baseUrl: string,
  params: ForgeTxt2ImgParams,
  outputDir: string,
  stamp: number
): Promise<ForgeTxt2ImgResult> {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    negative_prompt: '', // 本アプリは negative を使わない仕様
    steps: params.steps,
    cfg_scale: params.cfgScale,
    sampler_name: params.sampler,
    width: params.width,
    height: params.height,
    seed: params.seed,
    batch_size: 1,
    n_iter: 1
  }
  // モデル指定があれば一時的に切り替え（生成後に元へ戻す）。
  if (params.model) {
    body.override_settings = { sd_model_checkpoint: params.model }
    body.override_settings_restore_afterwards = true
  }

  const res = await fetch(`${baseUrl}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`txt2img に失敗しました (${res.status}): ${detail.slice(0, 300)}`)
  }
  const json = (await res.json()) as { images?: string[]; info?: string }
  const b64 = json.images?.[0]
  if (!b64) throw new Error('Forge が画像を返しませんでした。')

  // info から実 seed を拾う（失敗しても致命ではない）。
  let seed: number | null = null
  try {
    const info = JSON.parse(json.info ?? '{}') as { seed?: number }
    seed = typeof info.seed === 'number' ? info.seed : null
  } catch {
    /* noop */
  }

  // PNG をディスクに保存（ワークスペースにはこのパスだけを残す）。
  await mkdir(outputDir, { recursive: true })
  const savedPath = join(outputDir, `render-${stamp}${seed != null ? `-${seed}` : ''}.png`)
  await writeFile(savedPath, Buffer.from(b64, 'base64'))

  return { imageDataUrl: `data:image/png;base64,${b64}`, seed, savedPath }
}
