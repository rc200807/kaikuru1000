'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

type AdminMember = {
  id: string
  name: string
  email: string
  createdAt: string
}

export default function AdminMembersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [members, setMembers] = useState<AdminMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      if (sessionUser.role !== 'admin') router.push('/')
    }
  }, [status, session, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/admin/members')
        .then(r => r.json())
        .then(data => {
          setMembers(Array.isArray(data) ? data : [])
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [status])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const res = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    setSaving(false)
    if (res.ok) {
      const created = await res.json()
      setMembers(prev => [...prev, created])
      setMessage({ type: 'success', text: `${form.name} さんのアカウントを作成しました` })
      setShowForm(false)
      setForm({ name: '', email: '', password: '' })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || 'アカウントの作成に失敗しました' })
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`${name} さんのアカウントを削除しますか？`)) return
    setDeletingId(id)

    const res = await fetch(`/api/admin/members/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.id !== id))
      setMessage({ type: 'success', text: `${name} さんのアカウントを削除しました` })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '削除に失敗しました' })
    }
  }

  const sessionUser = session?.user as any
  const otherMembers = members.filter(m => m.id !== sessionUser?.id)

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBFE]">
        <div className="w-10 h-10 border-4 border-gray-700 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FFFBFE]">
      <header className="bg-gray-800 text-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/admin/profile" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            {sessionUser?.avatar ? (
              <img src={sessionUser?.avatar} className="w-9 h-9 rounded-full object-cover border-2 border-gray-600" alt="" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-600 border-2 border-gray-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-semibold">{sessionUser?.name?.[0] ?? '?'}</span>
              </div>
            )}
            <div>
              <p className="text-gray-400 text-xs font-medium tracking-widest uppercase">買いクル 管理ポータル</p>
              <h1 className="text-base font-semibold mt-0.5">{sessionUser?.name}</h1>
            </div>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/admin/dashboard" className="text-sm text-gray-300 hover:text-white transition-colors">ダッシュボード</Link>
            <Link href="/admin/customers" className="text-sm text-gray-300 hover:text-white transition-colors">顧客管理</Link>
            <Link href="/admin/stores" className="text-sm text-gray-300 hover:text-white transition-colors">店舗管理</Link>
            <Link href="/admin/licenses" className="text-sm text-gray-300 hover:text-white transition-colors">ライセンスキー</Link>
            <Link href="/admin/members" className="text-sm font-medium text-white border-b border-white pb-0.5">メンバー</Link>
            <Link href="/admin/settings" className="text-sm text-gray-300 hover:text-white transition-colors">設定</Link>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="text-sm text-gray-400 hover:text-white transition-colors ml-2">ログアウト</button>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">メンバー管理</h2>
            <p className="text-sm text-gray-500 mt-0.5">管理ポータルにログインできるアカウントを管理します</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setMessage(null) }}
            className="bg-gray-800 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors"
          >
            メンバー追加
          </button>
        </div>

        {message && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* 自分のアカウント */}
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">自分のアカウント</p>
          </div>
          <div className="px-6 py-4 flex items-center gap-4 border-b border-gray-100">
            <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">{sessionUser?.name}</p>
              <p className="text-xs text-gray-400">{sessionUser?.email}</p>
            </div>
            <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">ログイン中</span>
          </div>

          {/* 他の管理者メンバー一覧 */}
          {otherMembers.length > 0 && (
            <>
              <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">その他のメンバー（{otherMembers.length}名）</p>
              </div>
              {otherMembers.map(member => (
                <div key={member.id} className="px-6 py-4 flex items-center gap-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{member.name}</p>
                    <p className="text-xs text-gray-400">{member.email}</p>
                  </div>
                  <p className="text-xs text-gray-400 flex-shrink-0">
                    {format(new Date(member.createdAt), 'yyyy/M/d 追加', { locale: ja })}
                  </p>
                  <button
                    onClick={() => handleDelete(member.id, member.name)}
                    disabled={deletingId === member.id}
                    className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    削除
                  </button>
                </div>
              ))}
            </>
          )}

          {otherMembers.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              <p>他のメンバーはいません</p>
              <p className="text-xs mt-1 text-gray-300">「メンバー追加」からアカウントを発行できます</p>
            </div>
          )}
        </div>
      </div>

      {/* メンバー追加モーダル */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-semibold text-gray-900">メンバー追加</h3>
              <button
                onClick={() => { setShowForm(false); setForm({ name: '', email: '', password: '' }) }}
                className="text-gray-300 hover:text-gray-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  氏名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="例：田中 次郎"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  メールアドレス <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                  placeholder="例：tanaka@kaikuru.jp"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  パスワード <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    required
                    minLength={6}
                    placeholder="6文字以上"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">このパスワードをメンバーに伝えてください</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm({ name: '', email: '', password: '' }) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-gray-800 text-white py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors disabled:opacity-50"
                >
                  {saving ? '作成中...' : 'アカウント作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
