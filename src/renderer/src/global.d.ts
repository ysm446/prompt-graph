import type { PromptGraphApi } from '@shared/api'

declare global {
  interface Window {
    api: PromptGraphApi
  }
}

export {}
