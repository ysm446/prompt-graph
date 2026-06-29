// システムリソース（CPU / RAM / GPU）の取得。
import { spawn } from 'node:child_process'
import { cpus, freemem, totalmem } from 'node:os'
import type { SystemResources } from '../shared/types'

function cpuTimes(): { idle: number; total: number } {
  let idle = 0
  let total = 0
  for (const c of cpus()) {
    for (const t of Object.values(c.times)) total += t
    idle += c.times.idle
  }
  return { idle, total }
}

let prev = cpuTimes()

function cpuUsage(): number {
  const now = cpuTimes()
  const idleD = now.idle - prev.idle
  const totalD = now.total - prev.total
  prev = now
  if (totalD <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((1 - idleD / totalD) * 100)))
}

let gpuAvailable = true

function readGpu(): Promise<SystemResources['gpu']> {
  if (!gpuAvailable) return Promise.resolve(null)
  return new Promise((resolve) => {
    let out = ''
    let done = false
    const finish = (v: SystemResources['gpu']): void => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    try {
      const cp = spawn(
        'nvidia-smi',
        ['--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
        { windowsHide: true }
      )
      const timer = setTimeout(() => {
        cp.kill()
        finish(null)
      }, 1500)
      cp.stdout.on('data', (d) => (out += String(d)))
      cp.on('error', () => {
        gpuAvailable = false // nvidia-smi が無い環境では以後試さない
        clearTimeout(timer)
        finish(null)
      })
      cp.on('exit', (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          finish(null)
          return
        }
        const line = out.split('\n')[0] ?? ''
        const [util, used, total] = line.split(',').map((s) => Number(s.trim()))
        if ([util, used, total].some((n) => !Number.isFinite(n))) {
          finish(null)
          return
        }
        finish({ util, memUsed: used, memTotal: total })
      })
    } catch {
      gpuAvailable = false
      finish(null)
    }
  })
}

export async function getResources(): Promise<SystemResources> {
  const total = totalmem()
  return {
    cpu: cpuUsage(),
    memUsed: total - freemem(),
    memTotal: total,
    gpu: await readGpu()
  }
}
