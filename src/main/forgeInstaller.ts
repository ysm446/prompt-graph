// WebUI Forge（stable-diffusion-webui-forge）の取得（git clone）。
// llama とは異なり ZIP 配布ではなくリポジトリを clone し、初回起動時に
// webui.bat が venv / torch を自前でブートストラップする（image-assistant と同じ方式）。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ForgeInstallProgress } from '../shared/types'

export const FORGE_REPO_URL = 'https://github.com/lllyasviel/stable-diffusion-webui-forge'

// clone 済みかどうかは webui.bat の有無で判定する。
export function isForgeCloned(forgeDir: string): boolean {
  return existsSync(join(forgeDir, 'webui.bat'))
}

// git が使えるか（PATH 上に存在するか）を確認する。
function checkGit(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const cp = spawn('git', ['--version'], { windowsHide: true })
      cp.on('error', () => resolve(false))
      cp.on('exit', (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

// git の進捗行（"Receiving objects:  42% (…)" 等）からパーセントを抽出する。
function parseGitPercent(line: string): { label: string; percent: number } | null {
  const m = line.match(/(Receiving objects|Resolving deltas|Updating files):\s+(\d+)%/i)
  if (!m) return null
  return { label: m[1], percent: Number(m[2]) }
}

export async function cloneForge(input: {
  forgeDir: string
  onProgress: (progress: ForgeInstallProgress) => void
  signal: AbortSignal
}): Promise<{ path: string }> {
  const { forgeDir, onProgress, signal } = input

  if (isForgeCloned(forgeDir)) {
    onProgress({ phase: 'done', path: forgeDir })
    return { path: forgeDir }
  }
  if (existsSync(forgeDir)) {
    throw new Error(
      `フォルダが既に存在しますが webui.bat が見つかりません。中身を確認してください: ${forgeDir}`
    )
  }
  if (!(await checkGit())) {
    throw new Error('git が見つかりません。git をインストールして PATH を通してください。')
  }

  await mkdir(dirname(forgeDir), { recursive: true })

  await new Promise<void>((resolve, reject) => {
    // --depth 1 で履歴を省いて軽量に。--progress で stderr に進捗を出させる。
    const cp = spawn(
      'git',
      ['clone', '--depth', '1', '--progress', FORGE_REPO_URL, forgeDir],
      { windowsHide: true }
    )
    let stderrTail = ''
    const onAbort = (): void => {
      cp.kill()
      reject(new Error('インストールがキャンセルされました。'))
    }
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })

    cp.stderr.on('data', (d) => {
      const text = String(d)
      stderrTail = (stderrTail + text).slice(-2000)
      // git は進捗を \r で更新するため行分割して最後の割合を拾う。
      for (const line of text.split(/[\r\n]+/)) {
        const p = parseGitPercent(line)
        if (p) onProgress({ phase: 'clone', label: p.label, percent: p.percent })
      }
    })
    cp.on('error', (err) => {
      signal.removeEventListener('abort', onAbort)
      reject(err)
    })
    cp.on('exit', (code) => {
      signal.removeEventListener('abort', onAbort)
      if (code === 0) resolve()
      else reject(new Error(`git clone に失敗しました (code ${code}): ${stderrTail.trim()}`))
    })
  })

  if (!isForgeCloned(forgeDir)) {
    throw new Error('clone は完了しましたが webui.bat が見つかりません。')
  }
  onProgress({ phase: 'done', path: forgeDir })
  return { path: forgeDir }
}
