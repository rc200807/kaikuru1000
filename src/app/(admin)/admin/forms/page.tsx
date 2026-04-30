'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import Card from '@/components/Card'
import EmptyState from '@/components/EmptyState'
import LoadingSpinner from '@/components/LoadingSpinner'

type FormItem = {
  id: string
  slug: string
  title: string
  status: string
  submissionCount: number
  updatedAt: string
}

const STATUS_LABEL: Record<string, { label: string; bg: string; fg: string }> = {
  draft: {
    label: '下書き',
    bg: 'var(--md-sys-color-surface-container-high)',
    fg: 'var(--md-sys-color-on-surface-variant)',
  },
  published: {
    label: '公開中',
    bg: 'rgba(34,197,94,0.12)',
    fg: '#4ade80',
  },
  closed: {
    label: '終了',
    bg: 'rgba(239,68,68,0.12)',
    fg: '#f87171',
  },
}

export default function AdminFormsPage() {
  const router = useRouter()
  const [forms, setForms] = useState<FormItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/forms')
      if (res.ok) setForms(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function createNew() {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '新しいフォーム' }) })
      if (res.ok) {
        const f = await res.json()
        router.push(`/admin/forms/${f.id}/edit`)
      } else {
        alert('フォームの作成に失敗しました')
      }
    } finally {
      setCreating(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('このフォームと回答を全て削除します。よろしいですか？')) return
    const res = await fetch(`/api/admin/forms/${id}`, { method: 'DELETE' })
    if (res.ok) await load()
    else alert('削除に失敗しました')
  }

  async function copyUrl(slug: string, id: string) {
    const url = `${window.location.origin}/f/${slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      prompt('このURLをコピーしてください', url)
    }
  }

  if (loading) return <LoadingSpinner size="lg" fullPage />

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">
            フォーム管理
          </h1>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            汎用フォームを作成し、公開URL・回答管理ができます
          </p>
        </div>
        <Button onClick={createNew} loading={creating}>+ 新規作成</Button>
      </div>

      {forms.length === 0 ? (
        <Card variant="outlined" padding="none">
          <EmptyState
            title="まだフォームがありません"
            description="新規作成からフォームを作って、公開URLを発行しましょう"
            action={<Button onClick={createNew} loading={creating}>最初のフォームを作成</Button>}
          />
        </Card>
      ) : (
        <Card variant="elevated" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">タイトル</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">ステータス</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">回答数</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">更新日</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((f, idx) => {
                  const st = STATUS_LABEL[f.status] ?? STATUS_LABEL.draft
                  return (
                    <tr
                      key={f.id}
                      className="hover:bg-[var(--md-sys-color-surface-container)] transition-colors cursor-pointer"
                      style={{ boxShadow: idx === 0 ? 'rgba(255,255,255,0.06) 0 1px 0 0 inset' : 'rgba(255,255,255,0.06) 0 1px 0 0 inset' }}
                      onClick={() => router.push(`/admin/forms/${f.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-[var(--md-sys-color-on-surface)]">{f.title}</span>
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 font-mono">/f/{f.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{ backgroundColor: st.bg, color: st.fg }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[hsla(212,100%,68%,1)]">{f.submissionCount}件</span>
                      </td>
                      <td className="px-4 py-3 text-[var(--md-sys-color-on-surface-variant)]">{new Date(f.updatedAt).toLocaleDateString('ja-JP')}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button variant="outlined" size="sm" onClick={() => copyUrl(f.slug, f.id)}>
                            {copiedId === f.id ? 'コピー済' : 'URLコピー'}
                          </Button>
                          <Link href={`/admin/forms/${f.id}/edit`}>
                            <Button variant="outlined" size="sm">編集</Button>
                          </Link>
                          <Button variant="outlined" size="sm" danger onClick={() => remove(f.id)}>削除</Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
