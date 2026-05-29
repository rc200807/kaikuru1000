'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import LoadingSpinner from '@/components/LoadingSpinner'

type Store = {
  id: string
  code: string
  name: string
  email?: string | null
  phone?: string | null
  prefecture?: string | null
  address?: string | null
  storeStatus?: string | null
  openingDate?: string | null
  closingDate?: string | null
  googleBusinessUrl?: string | null
  oikuraPageUrl?: string | null
  bankInfo?: string | null
  invoiceNumber?: string | null
  antiquePermitNumber?: string | null
  isActive: boolean
  _count?: { customers: number }
}

type LineChannel = {
  id: string
  name: string
  channelId: string
  isActive: boolean
  userCount: number
  unreadCount: number
}

type LineUser = {
  id: string
  lineUserId: string
  displayName: string
  pictureUrl: string | null
  channel: { id: string; name: string }
  linkedUser: { id: string; name: string; furigana: string; phone: string } | null
  lastMessage: { content: string | null; sentAt: string; direction: string; messageType: string } | null
  unreadCount: number
}

type Message = {
  id: string
  direction: string
  messageType: string
  content: string | null
  sentAt: string
  status?: string
}

type Insights = {
  followersToday?: any
  followersWeekAgo?: any
  quotaConsumption?: any
  quota?: any
  messageStats?: any
}

export default function StoreDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const storeId = params.id

  const [store, setStore] = useState<Store | null>(null)

  /* 問い合わせ記録シート state */
  type InquirySheet = { spreadsheetId: string | null; url: string | null; sharedEmails: string[]; issuedAt: string | null }
  const [inquirySheet, setInquirySheet] = useState<InquirySheet | null>(null)
  const [sheetIssuing, setSheetIssuing] = useState(false)
  const [sheetModalOpen, setSheetModalOpen] = useState(false)
  const [sheetShareInput, setSheetShareInput] = useState('')
  const [sheetMessage, setSheetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [channels, setChannels] = useState<LineChannel[]>([])
  const [lineUsers, setLineUsers] = useState<LineUser[]>([])
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState<Record<string, Insights>>({})
  const [loadingInsights, setLoadingInsights] = useState<Record<string, boolean>>({})
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 編集／PW再発行
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')
  const [resetting, setResetting] = useState(false)
  const [pwModal, setPwModal] = useState<{ password: string } | null>(null)
  const [pwCopied, setPwCopied] = useState(false)
  const [inquiryUrlCopied, setInquiryUrlCopied] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const selectedUser = lineUsers.find(u => u.id === selectedUserId) ?? null

  /* 認証 */
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  /* 店舗データ＋LINE情報 */
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [storeRes, lineRes, sheetRes] = await Promise.all([
      fetch(`/api/admin/stores/${storeId}`),
      fetch(`/api/admin/stores/${storeId}/line`),
      fetch(`/api/admin/stores/${storeId}/inquiry-sheet`),
    ])
    if (storeRes.ok) setStore(await storeRes.json())
    if (lineRes.ok) {
      const d = await lineRes.json()
      setChannels(d.channels)
      setLineUsers(d.lineUsers)
    }
    if (sheetRes.ok) setInquirySheet(await sheetRes.json())
    setLoading(false)
  }, [storeId])

  /* シート発行 */
  async function handleIssueSheet() {
    if (!store) return
    setSheetIssuing(true)
    setSheetMessage(null)
    const shareEmails = sheetShareInput
      .split(/[\s,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/inquiry-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareEmails }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSheetMessage({ type: 'error', text: data.error || '発行に失敗しました' })
        return
      }
      setInquirySheet({
        spreadsheetId: data.spreadsheetId,
        url: data.url,
        sharedEmails: data.sharedEmails || [],
        issuedAt: new Date().toISOString(),
      })
      setSheetModalOpen(false)
      setSheetShareInput('')
      const note = data.backfilledCount > 0 ? `（既存${data.backfilledCount}件をシートへ書き込み）` : ''
      setSheetMessage({ type: 'success', text: `シートを発行しました${note}` })
    } finally {
      setSheetIssuing(false)
    }
  }

  /* 共有メール追加 */
  async function handleAddShare() {
    if (!store || !inquirySheet?.spreadsheetId) return
    setSheetIssuing(true)
    setSheetMessage(null)
    const emails = sheetShareInput
      .split(/[\s,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean)
    if (emails.length === 0) { setSheetIssuing(false); return }
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/inquiry-sheet`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareEmails: emails }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSheetMessage({ type: 'error', text: data.error || '共有追加に失敗しました' })
        return
      }
      setInquirySheet(prev => prev ? { ...prev, sharedEmails: data.sharedEmails || prev.sharedEmails } : prev)
      setSheetModalOpen(false)
      setSheetShareInput('')
      setSheetMessage({ type: 'success', text: `${data.addedCount ?? 0}件のメールに共有しました` })
    } finally {
      setSheetIssuing(false)
    }
  }

  useEffect(() => {
    if (status === 'authenticated') fetchData()
  }, [status, fetchData])

  /* チャネル分析を取得 */
  const fetchInsights = useCallback(async (channelId: string) => {
    setLoadingInsights(p => ({ ...p, [channelId]: true }))
    try {
      const res = await fetch(`/api/admin/line/channels/${channelId}/insights`)
      if (res.ok) {
        const d = await res.json()
        setInsights(p => ({ ...p, [channelId]: d }))
      }
    } finally {
      setLoadingInsights(p => ({ ...p, [channelId]: false }))
    }
  }, [])

  /* メッセージ取得 */
  useEffect(() => {
    if (!selectedUserId) { setMessages([]); return }
    setLoadingMessages(true)
    fetch(`/api/admin/line/users/${selectedUserId}/messages`)
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        setMessages(d)
        setLineUsers(prev => prev.map(u => u.id === selectedUserId ? { ...u, unreadCount: 0 } : u))
      })
      .finally(() => setLoadingMessages(false))
  }, [selectedUserId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* 編集開始 */
  function handleStartEdit() {
    if (!store) return
    setEditError('')
    setEditForm({
      name: store.name || '',
      email: store.email || '',
      phone: store.phone || '',
      address: store.address || '',
      prefecture: store.prefecture || '',
      storeStatus: store.storeStatus || 'active',
      openingDate: store.openingDate ? store.openingDate.slice(0, 10) : '',
      closingDate: store.closingDate ? store.closingDate.slice(0, 10) : '',
      googleBusinessUrl: store.googleBusinessUrl || '',
      oikuraPageUrl: store.oikuraPageUrl || '',
      bankInfo: store.bankInfo || '',
      invoiceNumber: store.invoiceNumber || '',
      antiquePermitNumber: store.antiquePermitNumber || '',
    })
    setEditMode(true)
  }

  /* 編集保存 */
  async function handleSaveEdit() {
    if (!store) return
    setSavingEdit(true)
    setEditError('')
    const res = await fetch(`/api/admin/stores/${store.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updateDetails: true, ...editForm }),
    })
    setSavingEdit(false)
    if (res.ok) {
      const updated = await res.json()
      setStore({ ...store, ...updated })
      setEditMode(false)
      setActionMessage({ type: 'success', text: '店舗情報を更新しました' })
      setTimeout(() => setActionMessage(null), 4000)
    } else {
      const data = await res.json().catch(() => ({}))
      setEditError(data.error || '更新に失敗しました')
    }
  }

  /* PW再発行 */
  async function handleResetPassword() {
    if (!store) return
    if (!confirm(`「${store.name}」のパスワードを再発行しますか？\n現在のパスワードは無効になります。`)) return
    setResetting(true)
    const res = await fetch(`/api/admin/stores/${store.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetPassword: true }),
    })
    const data = await res.json().catch(() => ({}))
    setResetting(false)
    if (res.ok) {
      setPwModal({ password: data.password })
      setPwCopied(false)
      setEmailSent(false)
    } else {
      setActionMessage({ type: 'error', text: data.error || 'パスワードの再発行に失敗しました' })
      setTimeout(() => setActionMessage(null), 5000)
    }
  }

  function handleCopyPassword() {
    if (!pwModal) return
    navigator.clipboard.writeText(pwModal.password)
    setPwCopied(true)
    setTimeout(() => setPwCopied(false), 2000)
  }

  async function handleCopyInquiryUrl() {
    if (!store) return
    const url = `${window.location.origin}/inquiry/${store.code}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // クリップボードAPIが使えない環境向けのフォールバック
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setInquiryUrlCopied(true)
    setTimeout(() => setInquiryUrlCopied(false), 2000)
  }

  async function handleSendPasswordEmail() {
    if (!pwModal || !store) return
    setSendingEmail(true)
    const res = await fetch(`/api/admin/stores/${store.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendPasswordEmail: true, password: pwModal.password }),
    })
    setSendingEmail(false)
    if (res.ok) {
      setEmailSent(true)
    } else {
      const data = await res.json().catch(() => ({}))
      setActionMessage({ type: 'error', text: data.error || 'メール送信に失敗しました' })
      setTimeout(() => setActionMessage(null), 5000)
    }
  }

  /* 返信送信 */
  async function handleSend() {
    if (!replyText.trim() || !selectedUserId || sending) return
    setSending(true); setSendError('')
    try {
      const res = await fetch(`/api/admin/line/users/${selectedUserId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessages(prev => [...prev, d])
        setReplyText('')
      } else {
        if (d.message) setMessages(prev => [...prev, d.message])
        setSendError(d.error ?? '送信に失敗しました')
      }
    } catch {
      setSendError('ネットワークエラー')
    } finally {
      setSending(false)
    }
  }

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }
  if (!store) return <p style={{ padding: 40, textAlign: 'center' }}>店舗が見つかりません</p>

  const inquiryUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/inquiry/${store.code}`

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1200, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      {/* パンくず */}
      <div style={{ marginBottom: 16, fontSize: 13 }}>
        <Link href="/admin/stores" style={{ color: '#4f8ef7', textDecoration: 'none' }}>← 店舗管理</Link>
      </div>

      {/* ヘッダー */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{store.name}</h1>
          <div style={{ display: 'flex', gap: 12, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 4 }}>
            <code>{store.code}</code>
            {store.storeStatus && <span>{store.storeStatus === 'active' ? '営業中' : '閉店'}</span>}
            {store._count && <span>顧客 {store._count.customers}名</span>}
          </div>
        </div>
        {!editMode && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleResetPassword}
              disabled={resetting}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: resetting ? 'wait' : 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontWeight: 600, opacity: resetting ? 0.6 : 1 }}
            >
              {resetting ? '処理中...' : 'PW再発行'}
            </button>
            <button
              onClick={handleStartEdit}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 600 }}
            >
              編集
            </button>
          </div>
        )}
      </div>

      {/* メッセージバナー */}
      {actionMessage && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8,
          background: actionMessage.type === 'success' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
          color: actionMessage.type === 'success' ? '#4ade80' : '#f87171',
          fontSize: 13,
        }}>
          {actionMessage.text}
        </div>
      )}

      {/* 基本情報 */}
      <Section title="基本情報">
        {editMode ? (
          <div style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <EditField label="店舗名 *" value={editForm.name} onChange={v => setEditForm({ ...editForm, name: v })} />
              <EditSelect label="ステータス" value={editForm.storeStatus} onChange={v => setEditForm({ ...editForm, storeStatus: v })} options={[{ value: 'active', label: '営業中' }, { value: 'closed', label: '閉店' }]} />
              <EditField label="電話番号" value={editForm.phone} onChange={v => setEditForm({ ...editForm, phone: v })} />
              <EditField label="メールアドレス" type="email" value={editForm.email} onChange={v => setEditForm({ ...editForm, email: v })} />
              <EditField label="都道府県" value={editForm.prefecture} onChange={v => setEditForm({ ...editForm, prefecture: v })} />
              <EditField label="住所" value={editForm.address} onChange={v => setEditForm({ ...editForm, address: v })} />
              <EditField label="開業日" type="date" value={editForm.openingDate} onChange={v => setEditForm({ ...editForm, openingDate: v })} />
              <EditField label="閉店日" type="date" value={editForm.closingDate} onChange={v => setEditForm({ ...editForm, closingDate: v })} />
              <EditField label="GoogleビジネスURL" value={editForm.googleBusinessUrl} onChange={v => setEditForm({ ...editForm, googleBusinessUrl: v })} />
              <EditField label="おいくらページURL" value={editForm.oikuraPageUrl} onChange={v => setEditForm({ ...editForm, oikuraPageUrl: v })} />
              <EditField label="インボイス番号" value={editForm.invoiceNumber} onChange={v => setEditForm({ ...editForm, invoiceNumber: v })} />
              <EditField label="古物営業許可番号" value={editForm.antiquePermitNumber} onChange={v => setEditForm({ ...editForm, antiquePermitNumber: v })} />
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>銀行情報</label>
              <textarea
                value={editForm.bankInfo || ''}
                onChange={e => setEditForm({ ...editForm, bankInfo: e.target.value })}
                placeholder={'金融機関名:\n支店名:\n支店番号:\n口座種別: 普通/当座\n口座番号:\n口座名義:\n入金時の名義:'}
                rows={6}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>
            {editError && <p style={{ color: '#f87171', fontSize: 13, marginTop: 12 }}>{editError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setEditMode(false); setEditError('') }}
                disabled={savingEdit}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editForm.name?.trim()}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 700, opacity: (savingEdit || !editForm.name?.trim()) ? 0.5 : 1 }}
              >
                {savingEdit ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        ) : (
          <InfoGrid items={[
            ['店舗コード', store.code],
            ['電話番号', store.phone],
            ['メール', store.email],
            ['都道府県', store.prefecture],
            ['住所', store.address],
            ['Googleビジネス', store.googleBusinessUrl ? <a href={store.googleBusinessUrl} target="_blank" rel="noreferrer" style={{ color: '#4f8ef7' }}>開く</a> : null],
            ['おいくらページ', store.oikuraPageUrl ? <a href={store.oikuraPageUrl} target="_blank" rel="noreferrer" style={{ color: '#4f8ef7' }}>開く</a> : null],
            ['インボイス番号', store.invoiceNumber],
            ['古物営業許可番号', store.antiquePermitNumber],
          ]} />
        )}
        {!editMode && store.bankInfo && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 6 }}>銀行情報</div>
            <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap', background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8, padding: 12, margin: 0 }}>{store.bankInfo}</pre>
          </div>
        )}
      </Section>

      {/* お問い合わせフォームURL */}
      <Section title="店舗専用お問い合わせフォームURL">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', lineHeight: 1.7 }}>
            この店舗専用のお問い合わせフォームのURLです。お客様へのご案内やQRコード化などにご利用ください。
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              readOnly
              value={inquiryUrl}
              onFocus={e => e.currentTarget.select()}
              style={{ flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontFamily: 'monospace' }}
            />
            <button
              onClick={handleCopyInquiryUrl}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: inquiryUrlCopied ? '#4ade80' : '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              {inquiryUrlCopied ? 'コピー済' : 'URLをコピー'}
            </button>
            <a
              href={inquiryUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              開く
            </a>
          </div>
        </div>
      </Section>

      {/* 問い合わせ記録シート */}
      <Section title="問い合わせ記録シート（Googleスプレッドシート）">
        {sheetMessage && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: sheetMessage.type === 'success' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)', color: sheetMessage.type === 'success' ? '#4ade80' : '#f87171' }}>
            {sheetMessage.text}
          </div>
        )}
        {inquirySheet?.spreadsheetId ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>発行済み</span>
              {inquirySheet.issuedAt && <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>発行日: {new Date(inquirySheet.issuedAt).toLocaleString('ja-JP')}</span>}
            </div>
            {inquirySheet.url && (
              <a href={inquirySheet.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: '#1f7a4d', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', alignSelf: 'flex-start' }}>
                📄 シートを開く
              </a>
            )}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--md-sys-color-on-surface-variant)' }}>共有中のメールアドレス（{inquirySheet.sharedEmails.length}件）</div>
              {inquirySheet.sharedEmails.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--md-sys-color-on-surface)', lineHeight: 1.7 }}>
                  {inquirySheet.sharedEmails.map(e => <li key={e}>{e}</li>)}
                </ul>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>共有メール未登録</p>
              )}
            </div>
            <button
              onClick={() => { setSheetShareInput(''); setSheetMessage(null); setSheetModalOpen(true) }}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' }}
            >
              + 共有メールを追加
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', lineHeight: 1.7 }}>
              この店舗専用のGoogleスプレッドシートを発行し、指定のメールアドレスに共有します。<br />
              発行後は、この店舗宛の新規問い合わせが自動でシートに追記されます。
            </p>
            <button
              onClick={() => {
                setSheetShareInput(store?.email || '')
                setSheetMessage(null)
                setSheetModalOpen(true)
              }}
              style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}
            >
              📄 シートを発行する
            </button>
          </div>
        )}

        {/* 発行/共有モーダル */}
        {sheetModalOpen && (
          <div
            onClick={() => !sheetIssuing && setSheetModalOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480 }}
            >
              <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>
                {inquirySheet?.spreadsheetId ? '共有メールを追加' : 'シートを発行'}
              </h2>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', lineHeight: 1.7 }}>
                共有したいメールアドレスを改行・カンマ・空白で区切って入力してください。
                {!inquirySheet?.spreadsheetId && '（店舗アカウントのメールが初期値として入っています）'}
              </p>
              <textarea
                value={sheetShareInput}
                onChange={e => setSheetShareInput(e.target.value)}
                rows={5}
                placeholder="store@example.com&#10;manager@example.com"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => setSheetModalOpen(false)}
                  disabled={sheetIssuing}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, cursor: sheetIssuing ? 'wait' : 'pointer' }}
                >
                  キャンセル
                </button>
                <button
                  onClick={inquirySheet?.spreadsheetId ? handleAddShare : handleIssueSheet}
                  disabled={sheetIssuing}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 600, cursor: sheetIssuing ? 'wait' : 'pointer', opacity: sheetIssuing ? 0.7 : 1 }}
                >
                  {sheetIssuing ? '処理中...' : inquirySheet?.spreadsheetId ? '共有を追加' : '発行する'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* LINE チャネル */}
      <Section title={`紐付けLINEチャネル（${channels.length}件）`}>
        {channels.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            この店舗に紐付けられた LINE チャネルはありません。
            <Link href="/admin/line" style={{ color: '#4f8ef7', marginLeft: 8 }}>LINE管理画面で設定</Link>
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {channels.map(ch => (
              <ChannelInsightCard
                key={ch.id}
                channel={ch}
                insights={insights[ch.id]}
                loading={!!loadingInsights[ch.id]}
                onLoad={() => fetchInsights(ch.id)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* LINE 会話 */}
      <Section title={`LINE会話（${lineUsers.length}件）`}>
        {lineUsers.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>会話がありません</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12, height: 520 }}>
            {/* ユーザー一覧 */}
            <div style={{ background: 'var(--md-sys-color-surface)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {lineUsers.map(u => (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUserId(u.id)}
                    style={{
                      padding: '12px 14px',
                      cursor: 'pointer',
                      background: selectedUserId === u.id ? 'rgba(79,142,247,0.15)' : 'transparent',
                      borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                      borderLeft: selectedUserId === u.id ? '3px solid #4f8ef7' : '3px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {u.pictureUrl ? (
                        <img src={u.pictureUrl} alt="" referrerPolicy="no-referrer"
                          style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--md-sys-color-surface-container-high)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>👤</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: u.unreadCount > 0 ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.linkedUser?.name ?? u.displayName}
                          </span>
                          {u.unreadCount > 0 && (
                            <span style={{ background: 'var(--md-sys-color-error)', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
                              {u.unreadCount}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 2 }}>
                          {u.channel.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                          {u.lastMessage ? (u.lastMessage.content ?? `[${u.lastMessage.messageType}]`) : '— メッセージなし —'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* メッセージスレッド */}
            <div style={{ background: 'var(--md-sys-color-surface)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {selectedUser ? (
                <>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {selectedUser.pictureUrl ? (
                      <img src={selectedUser.pictureUrl} alt="" referrerPolicy="no-referrer" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--md-sys-color-surface-container-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
                    )}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedUser.linkedUser?.name ?? selectedUser.displayName}</div>
                      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{selectedUser.channel.name}</div>
                    </div>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {loadingMessages ? <LoadingSpinner /> : messages.map(msg => {
                      const isOutbound = msg.direction === 'outbound'
                      const isFailed = msg.status === 'failed'
                      return (
                        <div key={msg.id} style={{ display: 'flex', justifyContent: isOutbound ? 'flex-end' : 'flex-start' }}>
                          <div style={{
                            maxWidth: '72%', padding: '10px 14px', borderRadius: isOutbound ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                            background: isFailed ? 'rgba(248,113,113,0.15)' : isOutbound ? '#4f8ef7' : 'var(--md-sys-color-surface-container-high)',
                            color: isFailed ? '#f87171' : isOutbound ? '#ffffff' : 'var(--md-sys-color-on-surface)',
                            border: isFailed ? '1px solid rgba(248,113,113,0.4)' : 'none',
                            fontSize: 14,
                          }}>
                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content ?? `[${msg.messageType}]`}</div>
                            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7, textAlign: isOutbound ? 'right' : 'left' }}>
                              {isFailed && <span style={{ color: '#f87171', marginRight: 6 }}>送信失敗</span>}
                              {new Date(msg.sentAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {sendError && <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>⚠ {sendError}</p>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                        placeholder="返信を入力（Enterで送信）"
                        rows={2}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13, resize: 'none', fontFamily: 'inherit' }}
                      />
                      <button
                        onClick={handleSend}
                        disabled={sending || !replyText.trim()}
                        style={{ padding: '0 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#fff', fontWeight: 700, opacity: (sending || !replyText.trim()) ? 0.5 : 1 }}
                      >送信</button>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 14 }}>
                  ユーザーを選択
                </div>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* PW再発行モーダル */}
      {pwModal && (
        <div
          onClick={() => setPwModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480 }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>パスワードを発行しました</h2>
            <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 0, marginBottom: 16 }}>{store.name}</p>
            <div style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 6 }}>ログインパスワード</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{ flex: 1, fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: 'var(--md-sys-color-on-surface)' }}>{pwModal.password}</code>
                <button
                  onClick={handleCopyPassword}
                  style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: pwCopied ? '#4ade80' : '#4f8ef7', color: '#fff', fontSize: 12, fontWeight: 600 }}
                >
                  {pwCopied ? 'コピー済' : 'コピー'}
                </button>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#f87171', marginBottom: 16 }}>
              ⚠ このパスワードは一度しか表示されません。必ず控えてから閉じてください。
            </p>
            {store.email && (
              <div style={{ marginBottom: 16 }}>
                <button
                  onClick={handleSendPasswordEmail}
                  disabled={sendingEmail || emailSent}
                  style={{
                    width: '100%', padding: '10px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)',
                    cursor: (sendingEmail || emailSent) ? 'default' : 'pointer',
                    background: emailSent ? 'rgba(74,222,128,0.15)' : 'transparent',
                    color: emailSent ? '#4ade80' : 'var(--md-sys-color-on-surface)',
                    fontSize: 13, fontWeight: 600, opacity: sendingEmail ? 0.5 : 1,
                  }}
                >
                  {emailSent ? '✓ メール送信済み' : sendingEmail ? '送信中...' : `📧 ${store.email} にメール送信`}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPwModal(null)}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 700 }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── 補助コンポーネント ───────────────────────── */
function EditField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
      />
    </div>
  )
}

function EditSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>{label}</label>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: 'var(--md-sys-color-on-surface)' }}>{title}</h2>
      {children}
    </section>
  )
}

function InfoGrid({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface)' }}>{value || '—'}</div>
        </div>
      ))}
    </div>
  )
}

function ChannelInsightCard({ channel, insights, loading, onLoad }: { channel: LineChannel; insights?: Insights; loading: boolean; onLoad: () => void }) {
  const followers = insights?.followersToday
  const followersWeek = insights?.followersWeekAgo
  const ready = followers?.status === 'ready'

  return (
    <div style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{channel.name}</div>
          <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
            Channel ID: {channel.channelId} ／ ユーザー {channel.userCount}人
            {channel.unreadCount > 0 && <span style={{ marginLeft: 8, color: '#f87171', fontWeight: 700 }}>未読 {channel.unreadCount}</span>}
            {!channel.isActive && <span style={{ marginLeft: 8, color: '#f87171' }}>無効</span>}
          </div>
        </div>
        {!insights && !loading && (
          <button
            onClick={onLoad}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 12, fontWeight: 600 }}
          >📊 分析を読み込む</button>
        )}
      </div>

      {loading && <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', padding: 24 }}>読み込み中（10〜30秒）...</p>}

      {insights && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <Stat
            label="友だち追加"
            value={ready ? followers.followers?.toLocaleString() : '—'}
            sub={ready && followersWeek?.status === 'ready' ? diffStr(followers.followers, followersWeek.followers) : null}
          />
          <Stat
            label="ターゲットリーチ"
            value={ready ? followers.targetedReaches?.toLocaleString() : '—'}
            sub={ready && followersWeek?.status === 'ready' ? diffStr(followers.targetedReaches, followersWeek.targetedReaches) : null}
          />
          <Stat
            label="ブロック"
            value={ready ? followers.blocks?.toLocaleString() : '—'}
            color="#f87171"
          />
          <Stat
            label="今月の使用通数"
            value={insights.quotaConsumption?.totalUsage?.toLocaleString() ?? '—'}
            sub={insights.quota?.value ? `/ ${insights.quota.value.toLocaleString()}通` : insights.quota?.type}
          />
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--md-sys-color-on-surface)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function diffStr(a?: number, b?: number): string | null {
  if (a === undefined || b === undefined) return null
  const d = a - b
  if (d === 0) return '7日前比 ±0'
  return d > 0 ? `7日前比 +${d}` : `7日前比 ${d}`
}
