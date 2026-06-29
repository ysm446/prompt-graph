// PNG の埋め込みメタデータ（A1111 互換 "parameters"）をローカルで読み取る。
// Forge 不要。tEXt / iTXt チャンクを解析する。
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

export interface ImageMetadata {
  positive: string
  negative: string
  settings: string
  raw: string
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** PNG の tEXt / iTXt チャンクを keyword -> text のマップで返す。 */
function extractPngText(buf: Buffer): Map<string, string> {
  const map = new Map<string, string>()
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return map
  let off = 8
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const dataStart = off + 8
    if (dataStart + len > buf.length) break
    const data = buf.subarray(dataStart, dataStart + len)

    if (type === 'tEXt') {
      const z = data.indexOf(0)
      if (z >= 0) map.set(data.toString('latin1', 0, z), data.toString('latin1', z + 1))
    } else if (type === 'iTXt') {
      const z = data.indexOf(0)
      if (z >= 0) {
        const keyword = data.toString('latin1', 0, z)
        const compFlag = data[z + 1]
        // z+2: compression method, then langTag\0 transKeyword\0 text
        const langEnd = data.indexOf(0, z + 3)
        const transEnd = data.indexOf(0, langEnd + 1)
        const textBuf = data.subarray(transEnd + 1)
        let text = ''
        if (compFlag === 1) {
          try {
            text = inflateSync(textBuf).toString('utf-8')
          } catch {
            text = ''
          }
        } else {
          text = textBuf.toString('utf-8')
        }
        if (keyword) map.set(keyword, text)
      }
    }
    if (type === 'IEND') break
    off = dataStart + len + 4 // data + CRC
  }
  return map
}

/** A1111 形式の "parameters" テキストを positive/negative/settings に分解。 */
function parseA1111(raw: string): ImageMetadata {
  const lines = raw.split(/\r?\n/)
  // 最後の "Steps:" 始まりの行を設定行とみなす
  let settingsIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*Steps:/.test(lines[i])) {
      settingsIdx = i
      break
    }
  }
  const settings = settingsIdx >= 0 ? lines[settingsIdx].trim() : ''
  const body = (settingsIdx >= 0 ? lines.slice(0, settingsIdx) : lines).join('\n')

  const negTag = 'Negative prompt:'
  const negPos = body.indexOf(negTag)
  let positive: string
  let negative = ''
  if (negPos >= 0) {
    positive = body.slice(0, negPos).trim()
    negative = body.slice(negPos + negTag.length).trim()
  } else {
    positive = body.trim()
  }
  return { positive, negative, settings, raw }
}

export async function readImageMetadata(path: string): Promise<ImageMetadata> {
  const buf = await readFile(path)
  const text = extractPngText(buf)
  const params = text.get('parameters') ?? text.get('Parameters') ?? ''
  if (!params) {
    throw new Error('この画像に A1111 形式のプロンプト情報が見つかりませんでした（PNG の parameters）')
  }
  return parseA1111(params)
}
