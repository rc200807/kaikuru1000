'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

type Target = { key: string; label: string }

type BatchResponse = {
  key: string
  label: string
  nextCursor: string | null
  scanned: number
  updatedRecords: number
  convertedImages: number
  failedImages: number
  originalBytes: number
  newBytes: number
  nextKey: string | null
  done: boolean
  dryRun: boolean
}

function fmtBytes(n: number): string {
  if (n <= 0) return '0'
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  return `${Math.round(n / 1024)}KB`
}

/**
 * 既存画像の WebP 化を実行する画面。
 *
 * 2026-08-25 以降にアップロードされた画像は保存時に WebP＋サムネになるが、
 * それ以前の画像は原本のまま。ここで作り直す。
 * サーバー側は1回の呼び出しで数レコードずつ処理するので、この画面が
 * 終わるまで繰り返し呼ぶ（途中で閉じても、次回は続きから再開できる）。
 */
export default function ImageOptimizationPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const allowed = role === 'superadmin' || role === 'sysadmin'

  const [targets, setTargets] = useState<Target[]>([])
  const [running, setRunning] = useState(false)
  const [dryRun, setDryRun] = useState(true)
  const [current, setCurrent] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [totals, setTotals] = useState({ converted: 0, failed: 0, records: 0, originalBytes: 0, newBytes: 0 })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const stopRef = useRef(false)

  useEffect(() => {
    if (!allowed) return
    fetch('/api/admin/maintenance/optimize-images')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.targets) setTargets(d.targets) })
      .catch(() => {})
  }, [allowed])

  async function run() {
    setRunning(true)
    setMessage(null)
    setLog([])
    setTotals({ converted: 0, failed: 0, records: 0, originalBytes: 0, newBytes: 0 })
    stopRef.current = false

    let key: string | null = null
    let cursor: string | null = null

    try {
      // 対象を順番に、カーソルを進めながら最後まで回す
      for (let i = 0; i < 5000; i++) {
        if (stopRef.current) { setMessage({ type: 'success', text: '中断しました（次回は最初から実行しても、変換済みの画像は飛ばされます）' }); break }

        const res = await fetch('/api/admin/maintenance/optimize-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, cursor, batch: 5, dryRun }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setMessage({ type: 'error', text: d.error || '実行に失敗しました' })
          break
        }
        const data: BatchResponse = await res.json()
        setCurrent(data.label)

        setTotals(prev => ({
          converted: prev.converted + data.convertedImages,
          failed: prev.failed + data.failedImages,
          records: prev.records + data.updatedRecords,
          originalBytes: prev.originalBytes + data.originalBytes,
          newBytes: prev.newBytes + data.newBytes,
        }))
        if (data.convertedImages > 0 || data.failedImages > 0) {
          setLog(prev => [
            `${data.label}: ${data.convertedImages}枚変換` +
            (data.failedImages ? ` / ${data.failedImages}枚失敗` : '') +
            ` (${fmtBytes(data.originalBytes)} → ${fmtBytes(data.newBytes)})`,
            ...prev,
          ].slice(0, 60))
        }

        if (data.done) {
          setMessage({
            type: 'success',
            text: dryRun ? '確認モードで最後まで走査しました（DBは変更していません）' : '既存画像の変換が完了しました',
          })
          break
        }
        key = data.nextKey
        cursor = data.nextCursor
      }
    } catch {
      setMessage({ type: 'error', text: '通信に失敗しました。時間をおいて再実行してください（続きから再開されます）' })
    } finally {
      setRunning(false)
      setCurrent(null)
    }
  }

  if (!allowed) {
    return (
      <SettingsShell title="既存画像の最適化">
        <MessageBanner severity="error">この操作はスーパー管理者のみ実行できます。</MessageBanner>
      </SettingsShell>
    )
  }

  const saved = totals.originalBytes - totals.newBytes
  const savedPct = totals.originalBytes > 0 ? Math.round((saved / totals.originalBytes) * 100) : 0

  return (
    <SettingsShell title="既存画像の最適化">
      {message && (
        <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
          {message.text}
        </MessageBanner>
      )}

      <Card variant="elevated" padding="md">
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-2">既存画像を WebP に作り直す</h3>
        <div className="text-sm text-[var(--md-sys-color-on-surface-variant)] space-y-2 mb-5">
          <p>
            新しくアップロードされる画像は保存時に WebP へ変換され、一覧用のサムネイルも作られます。
            それ以前に保存された画像は原本のままなので、この画面でまとめて作り直します。
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>元のファイルは削除しません（URLを差し替えるだけ）</li>
            <li>何度実行しても安全です。変換済みの画像は飛ばします</li>
            <li>途中で閉じても壊れません。もう一度実行すれば続きから進みます</li>
            <li>身分証・本人確認書類は対象外です</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="flex items-center gap-2 text-sm text-[var(--md-sys-color-on-surface)]">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={e => setDryRun(e.target.checked)}
              disabled={running}
              className="w-4 h-4"
            />
            確認モード（DBを更新せず、対象の枚数と削減量だけ見る）
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="filled" onClick={run} loading={running} disabled={running}>
            {dryRun ? '確認モードで実行' : '変換を実行'}
          </Button>
          {running && (
            <Button variant="text" onClick={() => { stopRef.current = true }}>
              中断
            </Button>
          )}
        </div>

        {(running || totals.converted > 0 || totals.failed > 0) && (
          <div className="mt-5 rounded-lg border border-[var(--md-sys-color-outline-variant)] p-4 space-y-2">
            {running && current && (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">処理中: {current}</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">変換した画像</p>
                <p className="font-semibold tabular-nums">{totals.converted} 枚</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">更新レコード</p>
                <p className="font-semibold tabular-nums">{totals.records} 件</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">削減量</p>
                <p className="font-semibold tabular-nums">{fmtBytes(saved)}{savedPct > 0 ? `（-${savedPct}%）` : ''}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">失敗</p>
                <p className="font-semibold tabular-nums">{totals.failed} 枚</p>
              </div>
            </div>
            {log.length > 0 && (
              <ul className="text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-0.5 max-h-56 overflow-y-auto pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                {log.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            )}
          </div>
        )}

        {targets.length > 0 && (
          <details className="mt-5">
            <summary className="text-sm text-[var(--md-sys-color-on-surface-variant)] cursor-pointer">対象の一覧（{targets.length}種類）</summary>
            <ul className="mt-2 text-sm text-[var(--md-sys-color-on-surface-variant)] list-disc pl-5 space-y-0.5">
              {targets.map(t => <li key={t.key}>{t.label}</li>)}
            </ul>
          </details>
        )}
      </Card>
    </SettingsShell>
  )
}
