'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

type ShareSettings = {
  calendarShareAddress: boolean
  calendarShareVisitNote: boolean
  calendarShareDealDetail: boolean
  calendarShareInternalNote: boolean
  calendarShareLinks: boolean
}

const ITEMS: { key: keyof ShareSettings; label: string; desc: string }[] = [
  { key: 'calendarShareAddress', label: '住所', desc: 'イベントの場所欄、および説明欄の「住所:」の行' },
  { key: 'calendarShareVisitNote', label: '訪問メモ', desc: '訪問予定に入力したメモの内容' },
  { key: 'calendarShareDealDetail', label: '案件内容', desc: '紐づく案件の内容（本部office@rcinc.jpへの招待のみ）' },
  { key: 'calendarShareInternalNote', label: '顧客の内部メモ', desc: '店舗・管理者限定で顧客に非公開の内部メモ（本部office@rcinc.jpへの招待のみ）' },
  { key: 'calendarShareLinks', label: '関連リンク', desc: '顧客情報・訪問詳細への内部管理画面リンク（本部office@rcinc.jpへの招待のみ）' },
]

export default function CalendarSharePage() {
  const [settings, setSettings] = useState<ShareSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/calendar-share')
      .then(r => r.json())
      .then(setSettings)
      .catch(() => setMessage({ type: 'error', text: '設定の取得に失敗しました' }))
  }, [])

  async function toggle(key: keyof ShareSettings) {
    if (!settings) return
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/calendar-share', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next[key] }),
      })
      if (!res.ok) throw new Error()
      setMessage({ type: 'success', text: '保存しました' })
    } catch {
      setSettings(settings) // 失敗時は元に戻す
      setMessage({ type: 'error', text: '保存に失敗しました' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsShell title="カレンダー連携の共有内容">
      {message && (
        <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
          {message.text}
        </MessageBanner>
      )}

      <Card variant="elevated" padding="md">
        <div className="flex items-center gap-3 mb-1">
          <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">訪問予定をGoogleカレンダーに登録する際の共有内容</h3>
        </div>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
          店舗が連携した自分のGoogleカレンダー、および本部（office@rcinc.jp）から送る訪問予定の招待メールに、
          どの情報を含めるかを設定します。オフにした項目は、次に作成・更新される予定から反映されます
          （すでに登録済みの予定は変わりません）。
        </p>

        {!settings ? (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] ml-8">読み込み中...</p>
        ) : (
          <div className="ml-8 divide-y divide-[var(--md-sys-color-outline-variant)] max-w-xl">
            {ITEMS.map(item => (
              <div key={item.key} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{item.label}</p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{item.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings[item.key]}
                  disabled={saving}
                  onClick={() => toggle(item.key)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    settings[item.key] ? 'bg-[var(--portal-primary)]' : 'bg-[var(--md-sys-color-outline-variant)]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings[item.key] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </SettingsShell>
  )
}
