'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import Modal from '@/components/Modal'
import { convertToJpegIfNeeded } from '@/lib/image-utils'

/* ─── PINロック解除モーダル ─── */
function PinUnlockModal({
  open,
  onUnlock,
  onCancel,
}: {
  open: boolean
  onUnlock: () => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPin('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleVerify = async () => {
    if (!pin) return
    setVerifying(true)
    setError('')
    try {
      const res = await fetch('/api/store/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (data.valid) {
        onUnlock()
      } else {
        setError('暗証番号が正しくありません')
        setPin('')
        inputRef.current?.focus()
      }
    } catch {
      setError('検証に失敗しました')
    } finally {
      setVerifying(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--md-sys-color-surface)] rounded-2xl shadow-xl w-[min(90vw,360px)] p-6 space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--portal-primary)]/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-[var(--portal-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">画面ロック</h2>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
            暗証番号を入力してロックを解除してください
          </p>
        </div>

        <div>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerify() }}
            placeholder="暗証番号（4〜6桁）"
            className="w-full px-4 py-3 text-center text-lg tracking-[0.5em] rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)]/50 placeholder:tracking-normal placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
          />
          {error && (
            <p className="text-xs text-[var(--md-sys-color-error)] mt-2 text-center">{error}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-medium text-[var(--md-sys-color-on-surface-variant)] rounded-xl hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleVerify}
            disabled={pin.length < 4 || verifying}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-[var(--portal-primary)] rounded-xl hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {verifying ? '確認中...' : '解除'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── 型定義 ─── */
type PurchaseItem = {
  id: string
  itemName: string
  category: string
  quantity: number
  purchasePrice: number
}

type WorkItem = {
  id: string
  workName: string
  unitPrice: number
  quantity: number
}

type VisitUser = {
  id: string
  name: string
  address: string
  phone: string
  email?: string
  idAddress?: string | null
  idName?: string | null
  idDocumentType?: string | null
  idDocumentPath?: string | null
  idDocumentBackPath?: string | null
  idBirthDate?: string | null
}

type VisitDetail = {
  id: string
  visitDate: string
  status: string
  note: string | null
  user: VisitUser
  store: { id: string; name: string; address?: string | null; phone?: string | null }
  purchaseItems: PurchaseItem[]
  workItems: WorkItem[]
  revisitDate?: string | null
  revisitStart?: string | null
  revisitEnd?: string | null
  revisitNote?: string | null
}

/* ─── 身分証アップロードモーダル ─── */
const DOC_TYPES = [
  { value: '運転免許証', label: '運転免許証（裏面も必要）' },
  { value: 'マイナンバーカード', label: 'マイナンバーカード（表面のみ）' },
  { value: 'パスポート', label: 'パスポート' },
  { value: '健康保険証', label: '健康保険証' },
  { value: '在留カード', label: '在留カード' },
  { value: 'その他', label: 'その他' },
]
const DOC_TYPES_REQUIRING_BACK = ['運転免許証']

type IdEditState = {
  documentType: string
  name: string
  address: string
  birthDate: string
}

function IdDocumentUploadModal({
  open,
  userId,
  initialDocType,
  onClose,
  onSuccess,
}: {
  open: boolean
  userId: string
  initialDocType?: string | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [step, setStep] = useState<'upload' | 'confirm'>('upload')
  const [docType, setDocType] = useState('')
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [frontPreview, setFrontPreview] = useState('')
  const [backFile, setBackFile] = useState<File | null>(null)
  const [backPreview, setBackPreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [edit, setEdit] = useState<IdEditState>({ documentType: '', name: '', address: '', birthDate: '' })
  const [ocrWarning, setOcrWarning] = useState('')

  const needsBack = DOC_TYPES_REQUIRING_BACK.includes(docType)

  useEffect(() => {
    if (open) {
      setStep('upload')
      setDocType(initialDocType || '')
      setFrontFile(null); setFrontPreview('')
      setBackFile(null); setBackPreview('')
      setError(''); setOcrWarning('')
      setEdit({ documentType: '', name: '', address: '', birthDate: '' })
    }
  }, [open, initialDocType])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('ファイルサイズは10MB以下にしてください')
      return
    }
    setError('')
    const converted = await convertToJpegIfNeeded(file)
    if (side === 'front') {
      setFrontFile(converted)
      setFrontPreview(URL.createObjectURL(converted))
    } else {
      setBackFile(converted)
      setBackPreview(URL.createObjectURL(converted))
    }
  }

  async function handleUpload() {
    if (!frontFile || !docType) {
      setError('書類種別と前面画像を選択してください')
      return
    }
    if (needsBack && !backFile) {
      setError('運転免許証は裏面の画像も必要です')
      return
    }
    setError('')
    setOcrWarning('')
    setUploading(true)

    try {
      const fd = new FormData()
      fd.append('file', frontFile)
      fd.append('documentType', docType)
      const res = await fetch(`/api/users/${userId}/id-document`, { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'アップロードに失敗しました')
      }
      const data = await res.json()

      if (backFile && needsBack) {
        const backFd = new FormData()
        backFd.append('file', backFile)
        backFd.append('documentType', docType)
        await fetch(`/api/users/${userId}/id-document/back`, { method: 'POST', body: backFd })
      }

      setEdit({
        documentType: data?.documentType ?? data?.ocr?.idDocumentType ?? docType,
        name:         data?.ocr?.idName ?? '',
        address:      data?.ocr?.idAddress ?? '',
        birthDate:    data?.ocr?.idBirthDate ?? '',
      })

      if (data?.ocrError) {
        setOcrWarning('OCRが失敗しました。お手数ですが、手入力で情報を入力してください。')
      } else if (!data?.ocr?.idName || !data?.ocr?.idAddress) {
        setOcrWarning('一部の情報が読み取れませんでした。空欄を手入力で補完してください。')
      }

      setStep('confirm')
    } catch (e: any) {
      setError(e?.message || 'アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  async function handleConfirm(applyToProfile: boolean) {
    if (!edit.name.trim() || !edit.address.trim()) {
      setError('氏名と住所は必須です')
      return
    }
    setError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/users/${userId}/id-document/confirm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idName:         edit.name.trim(),
          idAddress:      edit.address.trim(),
          idBirthDate:    edit.birthDate.trim() || null,
          idDocumentType: edit.documentType || null,
          applyToProfile,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || '保存に失敗しました')
      }
      onSuccess()
      onClose()
    } catch (e: any) {
      setError(e?.message || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="お客様の身分証明証アップロード" size="lg">
      {step === 'upload' ? (
        <div className="space-y-4">
          {error && <MessageBanner severity="error">{error}</MessageBanner>}

          <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
              書類の種類
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
            >
              <option value="">選択してください</option>
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
              前面画像 <span className="text-[var(--md-sys-color-error)]">*</span>
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              capture="environment"
              onChange={(e) => handleFileSelect(e, 'front')}
              className="block w-full text-xs text-[var(--md-sys-color-on-surface-variant)] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[var(--portal-primary)] file:text-white hover:file:opacity-90"
            />
            {frontPreview && (
              <img src={frontPreview} alt="前面プレビュー" className="mt-2 w-full max-h-56 object-contain rounded-lg border border-[var(--md-sys-color-outline-variant)]" />
            )}
          </div>

          {needsBack && (
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                裏面画像 <span className="text-[var(--md-sys-color-error)]">*</span>
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                capture="environment"
                onChange={(e) => handleFileSelect(e, 'back')}
                className="block w-full text-xs text-[var(--md-sys-color-on-surface-variant)] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[var(--portal-primary)] file:text-white hover:file:opacity-90"
              />
              {backPreview && (
                <img src={backPreview} alt="裏面プレビュー" className="mt-2 w-full max-h-56 object-contain rounded-lg border border-[var(--md-sys-color-outline-variant)]" />
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="text" onClick={onClose} disabled={uploading}>キャンセル</Button>
            <Button onClick={handleUpload} disabled={uploading || !frontFile || !docType || (needsBack && !backFile)}>
              {uploading ? 'アップロード中...' : 'アップロードしてOCR実行'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-300">
            <p className="text-sm font-bold text-blue-800 mb-1 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              読み取り結果の確認
            </p>
            <p className="text-xs text-blue-700">身分証から読み取った情報です。誤りがあれば下記の欄を修正してください。</p>
          </div>

          {ocrWarning && <MessageBanner severity="warning">{ocrWarning}</MessageBanner>}
          {error && <MessageBanner severity="error">{error}</MessageBanner>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">書類種別</label>
              <select
                value={edit.documentType}
                onChange={(e) => setEdit({ ...edit, documentType: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
              >
                <option value="">選択してください</option>
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.value}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">生年月日</label>
              <input
                type="text"
                value={edit.birthDate}
                onChange={(e) => setEdit({ ...edit, birthDate: e.target.value })}
                placeholder="例: 1990-01-23"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
              氏名 <span className="text-[var(--md-sys-color-error)]">*</span>
            </label>
            <input
              type="text"
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
              住所 <span className="text-[var(--md-sys-color-error)]">*</span>
            </label>
            <textarea
              value={edit.address}
              onChange={(e) => setEdit({ ...edit, address: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40 resize-y"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button variant="text" onClick={() => setStep('upload')} disabled={saving}>
              ← 画像を選び直す
            </Button>
            <div className="flex-1" />
            <Button variant="outlined" onClick={() => handleConfirm(false)} disabled={saving}>
              {saving ? '保存中...' : '本人確認情報のみ保存'}
            </Button>
            <Button onClick={() => handleConfirm(true)} disabled={saving}>
              {saving ? '保存中...' : '顧客情報に反映して保存'}
            </Button>
          </div>
          <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] text-right">
            「顧客情報に反映」を選ぶと、お客様の氏名・住所が上の値で上書きされます。
          </p>
        </div>
      )}
    </Modal>
  )
}

/* ─── メイン ─── */
export default function AgreementPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const scheduleId = params.id as string
  const staffName = searchParams.get('staff') || ''

  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [idModalOpen, setIdModalOpen] = useState(false)

  // 再訪問日（後日引取）設定
  const [showRevisitForm, setShowRevisitForm] = useState(false)
  const [revisitForm, setRevisitForm] = useState({ date: '', start: '', end: '', note: '' })
  const [savingRevisit, setSavingRevisit] = useState(false)

  // PIN lock state
  const [pinLocked, setPinLocked] = useState(true)
  const [hasPin, setHasPin] = useState<boolean | null>(null)
  const [showPinModal, setShowPinModal] = useState(false)
  const pendingNavigationRef = useRef<string | null>(null)

  useEffect(() => {
    fetch('/api/store/lock-pin')
      .then(r => r.json())
      .then(data => {
        setHasPin(data.hasPin)
        if (!data.hasPin) setPinLocked(false)
      })
      .catch(() => {
        setHasPin(false)
        setPinLocked(false)
      })
  }, [])

  useEffect(() => {
    if (!pinLocked) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [pinLocked])

  useEffect(() => {
    if (!pinLocked) return
    window.history.pushState(null, '', window.location.href)
    const handler = () => {
      window.history.pushState(null, '', window.location.href)
      setShowPinModal(true)
      pendingNavigationRef.current = `/store/schedule/${scheduleId}`
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [pinLocked, scheduleId])

  const navigateWithPinCheck = useCallback((href: string) => {
    if (pinLocked) {
      pendingNavigationRef.current = href
      setShowPinModal(true)
    } else {
      router.push(href)
    }
  }, [pinLocked, router])

  const handlePinUnlock = useCallback(() => {
    setPinLocked(false)
    setShowPinModal(false)
    if (pendingNavigationRef.current) {
      const dest = pendingNavigationRef.current
      pendingNavigationRef.current = null
      router.push(dest)
    }
  }, [router])

  const fetchVisit = useCallback(async () => {
    const res = await fetch(`/api/visit-schedules/${scheduleId}`)
    if (res.ok) {
      const data = await res.json()
      setVisit(data)
    }
    setLoading(false)
  }, [scheduleId])

  useEffect(() => {
    if (session) fetchVisit()
  }, [session, fetchVisit])

  const fmtYen = (n: number) => `¥${n.toLocaleString()}`

  const purchaseTotal = visit?.purchaseItems.reduce((sum, i) => sum + i.purchasePrice * i.quantity, 0) ?? 0
  const workTotal = visit?.workItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) ?? 0
  const hasIdDocument = !!visit?.user.idDocumentPath

  function openRevisitForm() {
    if (!visit) return
    setRevisitForm({
      date: visit.revisitDate ? new Date(visit.revisitDate).toISOString().slice(0, 10) : '',
      start: visit.revisitStart || '',
      end: visit.revisitEnd || '',
      note: visit.revisitNote || '',
    })
    setShowRevisitForm(true)
  }

  async function saveRevisit() {
    if (!visit) return
    setSavingRevisit(true)
    try {
      const res = await fetch(`/api/visit-schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revisitDate: revisitForm.date || null,
          revisitStart: revisitForm.start || null,
          revisitEnd: revisitForm.end || null,
          revisitNote: revisitForm.note || null,
        }),
      })
      if (res.ok) {
        await fetchVisit()
        setShowRevisitForm(false)
        setMessage({ type: 'success', text: '再訪問日を保存しました' })
      } else {
        const d = await res.json().catch(() => ({}))
        setMessage({ type: 'error', text: d.error || '再訪問日の保存に失敗しました' })
      }
    } finally {
      setSavingRevisit(false)
    }
  }

  async function clearRevisit() {
    if (!visit) return
    if (!confirm('再訪問日の設定をクリアしますか？')) return
    setSavingRevisit(true)
    try {
      const res = await fetch(`/api/visit-schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisitDate: null, revisitStart: null, revisitEnd: null, revisitNote: null }),
      })
      if (res.ok) {
        await fetchVisit()
        setShowRevisitForm(false)
        setMessage({ type: 'success', text: '再訪問日をクリアしました' })
      }
    } finally {
      setSavingRevisit(false)
    }
  }

  const goToFinal = () => {
    if (!hasIdDocument) {
      setMessage({ type: 'error', text: '身分証明証をアップロードしてください' })
      return
    }
    const qs = staffName ? `?staff=${encodeURIComponent(staffName)}` : ''
    navigateWithPinCheck(`/store/schedule/${scheduleId}/agreement/final${qs}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[var(--portal-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!visit) {
    return (
      <div className="p-6">
        <MessageBanner severity="error">訪問スケジュールが見つかりません</MessageBanner>
        <Button variant="text" onClick={() => navigateWithPinCheck(`/store/schedule/${scheduleId}`)} className="mt-4">← 戻る</Button>
      </div>
    )
  }

  const today = format(new Date(), 'yyyy年M月d日', { locale: ja })

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      <PinUnlockModal
        open={showPinModal}
        onUnlock={handlePinUnlock}
        onCancel={() => {
          setShowPinModal(false)
          pendingNavigationRef.current = null
        }}
      />

      <IdDocumentUploadModal
        open={idModalOpen}
        userId={visit.user.id}
        initialDocType={visit.user.idDocumentType}
        onClose={() => setIdModalOpen(false)}
        onSuccess={() => { fetchVisit() }}
      />

      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigateWithPinCheck(`/store/schedule/${scheduleId}`)}
          className="text-[var(--portal-primary)] hover:underline text-sm"
        >
          ← 訪問詳細
        </button>
        <h1 className="text-lg font-bold text-[var(--md-sys-color-on-surface)] flex-1">取引内容の確認</h1>
        {pinLocked && (
          <button
            onClick={() => {
              pendingNavigationRef.current = null
              setShowPinModal(true)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[var(--portal-primary)]/10 text-[var(--portal-primary)] hover:bg-[var(--portal-primary)]/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            ロック解除
          </button>
        )}
      </div>

      {message && <MessageBanner severity={message.type}>{message.text}</MessageBanner>}

      {/* ──── 日付・店舗情報 ──── */}
      <Card variant="elevated" padding="md">
        <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <div><span className="font-medium">日付:</span> {today}</div>
            <div><span className="font-medium">訪問日:</span> {format(new Date(visit.visitDate), 'yyyy年M月d日（E）', { locale: ja })}</div>
          </div>
          <div className="space-y-1 p-3 rounded-lg bg-[var(--md-sys-color-surface-container-low)]">
            <div className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">店舗情報</div>
            <div><span className="font-medium">店舗名:</span> {visit.store.name}</div>
            {visit.store.address && <div><span className="font-medium">住所:</span> {visit.store.address}</div>}
            {visit.store.phone && <div><span className="font-medium">電話:</span> {visit.store.phone}</div>}
            {staffName && <div><span className="font-medium">担当者:</span> {staffName}</div>}
          </div>
        </div>
      </Card>

      {/* ──── 買取品目 ──── */}
      <Card variant="elevated" padding="md">
        <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">買取品目</h2>
        {visit.purchaseItems.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
                <th className="text-left py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">品名</th>
                <th className="text-left py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">カテゴリー</th>
                <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">数量</th>
                <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">単価</th>
                <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">小計</th>
              </tr>
            </thead>
            <tbody>
              {visit.purchaseItems.map((item) => (
                <tr key={item.id} className="border-b border-[var(--md-sys-color-outline-variant)]/50">
                  <td className="py-1.5 text-[var(--md-sys-color-on-surface)]">{item.itemName}</td>
                  <td className="py-1.5 text-[var(--md-sys-color-on-surface-variant)]">{item.category}</td>
                  <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{item.quantity}</td>
                  <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{fmtYen(item.purchasePrice)}</td>
                  <td className="py-1.5 text-right font-medium text-[var(--md-sys-color-on-surface)]">{fmtYen(item.purchasePrice * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">買取金額合計</td>
                <td className="py-2 text-right font-bold text-lg text-[var(--portal-primary)]">{fmtYen(purchaseTotal)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">買取品目は登録されていません</p>
        )}
      </Card>

      {/* ──── 作業品目 ──── */}
      <Card variant="elevated" padding="md">
        <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">作業品目</h2>
        {visit.workItems.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
                <th className="text-left py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">作業名</th>
                <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">数量</th>
                <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">単価</th>
                <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">小計</th>
              </tr>
            </thead>
            <tbody>
              {visit.workItems.map((item) => (
                <tr key={item.id} className="border-b border-[var(--md-sys-color-outline-variant)]/50">
                  <td className="py-1.5 text-[var(--md-sys-color-on-surface)]">{item.workName}</td>
                  <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{item.quantity}</td>
                  <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{fmtYen(item.unitPrice)}</td>
                  <td className="py-1.5 text-right font-medium text-[var(--md-sys-color-on-surface)]">{fmtYen(item.unitPrice * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">作業費合計</td>
                <td className="py-2 text-right font-bold text-lg text-[var(--md-sys-color-on-surface)]">{fmtYen(workTotal)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">作業品目は登録されていません</p>
        )}
      </Card>

      {/* ──── 再訪問日（後日引取） ──── */}
      <Card variant="elevated" padding="md">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">再訪問日（後日引取）</h2>
          {!showRevisitForm && (
            <button onClick={openRevisitForm} className="text-xs text-[var(--portal-primary)] hover:underline">
              {visit.revisitDate ? '編集' : '設定'}
            </button>
          )}
        </div>
        {showRevisitForm ? (
          <div className="space-y-3 p-3 rounded-lg border border-[var(--portal-primary)] bg-[var(--md-sys-color-surface-container-lowest)]">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">再訪問日</label>
                <input type="date" value={revisitForm.date} onChange={e => setRevisitForm(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">開始時間</label>
                <input type="time" value={revisitForm.start} onChange={e => setRevisitForm(p => ({ ...p, start: e.target.value }))} className="w-full px-3 py-2 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">終了時間</label>
                <input type="time" value={revisitForm.end} onChange={e => setRevisitForm(p => ({ ...p, end: e.target.value }))} className="w-full px-3 py-2 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">メモ（任意）</label>
              <textarea value={revisitForm.note} onChange={e => setRevisitForm(p => ({ ...p, note: e.target.value }))} rows={2} className="w-full px-3 py-2 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] resize-y" placeholder="集荷時の注意点など" />
            </div>
            <div className="flex justify-between gap-2">
              {visit.revisitDate ? (
                <button onClick={clearRevisit} disabled={savingRevisit} className="text-xs text-[var(--md-sys-color-error)] hover:underline">クリア</button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setShowRevisitForm(false)} disabled={savingRevisit} className="text-xs px-3 py-1.5 rounded text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]">キャンセル</button>
                <button onClick={saveRevisit} disabled={savingRevisit} className="text-xs px-3 py-1.5 rounded bg-[var(--portal-primary)] text-white disabled:opacity-50">{savingRevisit ? '保存中...' : '保存'}</button>
              </div>
            </div>
          </div>
        ) : visit.revisitDate ? (
          <div className="text-xs text-[var(--md-sys-color-on-surface)] space-y-1 p-3 rounded-lg bg-[var(--md-sys-color-surface-container-low)]">
            <div>日付: <strong>{format(new Date(visit.revisitDate), 'yyyy年M月d日（E）', { locale: ja })}</strong>
              {(visit.revisitStart || visit.revisitEnd) && <span className="ml-2">{visit.revisitStart} 〜 {visit.revisitEnd}</span>}
            </div>
            {visit.revisitNote && <div className="text-[var(--md-sys-color-on-surface-variant)]">メモ: {visit.revisitNote}</div>}
          </div>
        ) : (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">後日引取の予定があれば設定してください。設定すると売買契約書にも記載されます。</p>
        )}
      </Card>

      {/* ──── 身分証明証 ──── */}
      <Card variant="elevated" padding="md">
        <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">お客様の身分証明証</h2>
        {hasIdDocument ? (
          <div className="p-3 rounded-lg bg-green-50 border border-green-300 flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div className="flex-1 text-xs text-green-800">
              <p className="font-bold mb-0.5">提出済み</p>
              <p>種別: {visit.user.idDocumentType || '—'}</p>
              {visit.user.idName && <p>氏名: {visit.user.idName}</p>}
              <button onClick={() => setIdModalOpen(true)} className="mt-1 text-green-700 hover:underline">再アップロード</button>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-300">
            <p className="text-xs font-bold text-amber-800 mb-1">未提出</p>
            <p className="text-xs text-amber-700 mb-3">最終契約書に進むには、お客様の身分証明証のアップロードが必要です。OCRで氏名・住所を自動取得します。</p>
            <Button onClick={() => setIdModalOpen(true)}>身分証をアップロード</Button>
          </div>
        )}
      </Card>

      {/* ──── 操作ボタン ──── */}
      <div className="flex gap-3 justify-end pt-2">
        <Button
          variant="text"
          onClick={() => navigateWithPinCheck(`/store/schedule/${scheduleId}`)}
        >
          戻る
        </Button>
        <Button onClick={goToFinal} disabled={!hasIdDocument}>
          最終契約書へ進む →
        </Button>
      </div>
    </div>
  )
}
