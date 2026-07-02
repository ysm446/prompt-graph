// 下部ステータスバーへ一時メッセージを流すための簡易バス。
// window カスタムイベントで飛ばし、StatusMessage が受けて数秒表示する。
export function notifyStatus(message: string): void {
  window.dispatchEvent(new CustomEvent('pg-status', { detail: message }))
}
