'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import StatusBadge from '@/components/StatusBadge'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import Modal from '@/components/Modal'
import TextField from '@/components/TextField'
import TimeSelect from '@/components/TimeSelect'
import SignaturePad from '@/components/SignaturePad'
import PurchaseItemManager, { type ManagedPurchaseItem } from '@/components/store/PurchaseItemManager'
import DocumentPdfPreview from '@/components/DocumentPdfPreview'
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL, DEAL_STATUS_BADGE, type DealStatus } from '@/lib/deal-status'
import Section, { SECTION_CLS, useOpenLatch } from '@/components/detail/SectionCard'
import { PropRow, Row } from '@/components/detail/PropRow'
import { formatDealNumber } from '@/lib/deal-number'
import {
  KOBUTSU_CATEGORY_LABEL,
  KOBUTSU_MISSING_LABEL,
  formatBirthDate,
  type KobutsuLedgerGroup,
} from '@/lib/kobutsu-ledger'
import { DEAL_CATEGORIES, DEAL_CATEGORY_LABEL, DEAL_CATEGORY_BADGE } from '@/lib/deal-categories'
import { storeSupportsAkikuru } from '@/lib/store-services'
import { formatYen } from '@/lib/currency'
import { convertToJpegIfNeeded } from '@/lib/image-utils'
import { upload } from '@vercel/blob/client'

type PurchaseItem = { id: string; itemName: string; category: string; quantity: number; purchasePrice: number }
type WorkItem = { id: string; workName: string; unitPrice: number; quantity: number; notes: string | null }
type WorkItemOption = { id: string; label: string }
type WorkItemMaster = { id: string; name: string; defaultUnitPrice: number; notes: string | null; allowExtraStaff: boolean; options: WorkItemOption[] }
type ContractInfo = { id: string; visitScheduleId?: string | null; agreedAt: string; emailSentAt: string | null; customerEmail: string | null; hasPdf: boolean; hasInvoicePdf: boolean }
type EstimateInfo = { id: string; visitScheduleId?: string | null; validUntil: string; purchaseAmount: number; billingAmount: number; emailSentAt: string | null; customerEmail: string | null; hasPdf: boolean; hasInvoicePdf: boolean }

type VisitSchedule = {
  id: string
  visitDate: string
  startTime: string | null
  endTime: string | null
  status: string
  note: string | null
  staffName: string | null
  /** 後日引取（売買契約書の作成時に登録される。訪問行そのものに保持される） */
  revisitDate: string | null
  revisitStart: string | null
  revisitEnd: string | null
  revisitNote: string | null
  purchaseAmount: number | null
  billingAmount: number | null
  purchaseItems: PurchaseItem[]
  workItems: WorkItem[]
  salesContract: ContractInfo | null
  estimate: EstimateInfo | null
}

type RecordingSummary = { overview: string; requests: string[]; important: string[]; nextActions: string[] }
type DealRecording = {
  id: string
  fileName: string | null
  mimeType: string | null
  fileSize: number | null
  durationSec: number | null
  status: 'pending' | 'processing' | 'done' | 'error'
  transcript: string | null
  summary: RecordingSummary | null
  error: string | null
  uploadedByName: string | null
  createdAt: string
  processedAt: string | null
  audioUrl: string
}

type Deal = {
  id: string
  /** 案件番号（例: 20260824001）。旧データは未採番の可能性あり */
  dealNumber?: string | null
  detail: string | null
  status: string
  category: string | null
  occurredAt: string | null
  createdByType: string | null
  createdByName: string | null
  purchaseAmount: number | null
  billingAmount: number | null
  preConsentAt: string | null
  hasPreConsent: boolean
  createdAt: string
  updatedAt: string
  userId: string
  storeId: string | null
  inquiryId: string | null
  user: {
    id: string
    name: string
    furigana: string | null
    email: string | null
    phone: string | null
    address: string | null
    customerType: string
    /** 顧客プロフィールの生年月日（身分証OCRから反映されることもある） */
    birthDate?: string | null
    /** 身分証OCRで読み取った生年月日 */
    idBirthDate?: string | null
    /** 身分証の種別（運転免許証など） */
    idDocumentType?: string | null
    /** 職業（売買契約書作成時に取得） */
    occupation?: string | null
  }
  store: { id: string; name: string; code: string; phone: string | null; address: string | null; prefecture: string | null; email: string | null; invoiceNumber: string | null; antiquePermitNumber: string | null; supportedServices?: string | null } | null
  inquiry: { id: string; inquiryType: string; details: string | null; createdAt: string } | null
  /** 案件の担当メンバー（一覧の「担当」列・一括担当変更と同じ正の値） */
  member: { id: string; name: string } | null
  visitSchedules: VisitSchedule[]
  // 案件直下（再ペアレント後の正）
  purchaseItems: ManagedPurchaseItem[]
  workItems: WorkItem[]
  dealContract: ContractInfo | null
  dealEstimate: EstimateInfo | null
  paperContractImages: string[]
  purchaseUpliftPercent: number
}

function fmtDate(d?: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
function fmtDateTime(d?: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function timeRange(s: string | null, e: string | null) {
  if (!s && !e) return ''
  return `${s ?? ''}${e ? `〜${e}` : ''}`
}
// ISO日時 → <input type="date"> 用の "yyyy-MM-dd"（ローカル時刻基準）
function toDateInput(d?: string | null) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const CREATOR_TYPE_LABEL: Record<string, string> = {
  store: '店舗', admin: '管理者', superadmin: '管理者', hr: '管理者', sysadmin: 'システム', customer: 'お客様', partner: 'パートナー',
}
function creatorLabel(d: { createdByName: string | null; createdByType: string | null }) {
  if (!d.createdByName && !d.createdByType) return '—'
  const t = d.createdByType ? CREATOR_TYPE_LABEL[d.createdByType] ?? d.createdByType : null
  return d.createdByName ? `${d.createdByName}${t ? `（${t}）` : ''}` : (t ?? '—')
}

// 生年月日の表示用整形。"YYYY-MM-DD" は "YYYY/MM/DD（満xx歳）"、和暦などのテキストはそのまま返す
function fmtBirthDate(v?: string | null) {
  if (!v) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
  if (!m) return v.trim()
  const [, y, mo, d] = m
  const birth = new Date(Number(y), Number(mo) - 1, Number(d))
  if (isNaN(birth.getTime())) return v.trim()
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const before = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  if (before) age -= 1
  return `${y}/${mo}/${d}${age >= 0 && age < 130 ? `（満${age}歳）` : ''}`
}

export default function DealDetailView({
  dealId,
  isAdmin,
  backHref,
  visitHrefBase,
}: {
  dealId: string
  isAdmin: boolean
  backHref: string
  visitHrefBase: string
}) {
  const router = useRouter()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailEdit, setDetailEdit] = useState('')
  const [savingDetail, setSavingDetail] = useState(false)
  const [isEditingDetail, setIsEditingDetail] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 案件発生日の編集
  const [occurredEdit, setOccurredEdit] = useState('') // yyyy-MM-dd
  const [savingOccurred, setSavingOccurred] = useState(false)

  // 担当者候補（店舗ポータルのみ取得）
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])

  // 訪問ごとの担当者編集
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [staffDraft, setStaffDraft] = useState('')
  const [savingStaff, setSavingStaff] = useState(false)

  // 「この案件に訪問を追加」モーダル
  const [showAddVisit, setShowAddVisit] = useState(false)
  const [addVisit, setAddVisit] = useState({ visitDate: '', startTime: '', endTime: '', staffName: '', note: '' })
  // 発行済みPDFのプレビュー（押した瞬間にダウンロードが始まらないよう、まず画面内で開く）
  const [pdfPreview, setPdfPreview] = useState<{ title: string; url: string } | null>(null)
  const [addingVisit, setAddingVisit] = useState(false)

  // 訪問日時の変更（リスケジュール）モーダル
  const [rescheduleTarget, setRescheduleTarget] = useState<VisitSchedule | null>(null)
  const [rescheduleForm, setRescheduleForm] = useState({ visitDate: '', startTime: '', endTime: '' })
  const [savingReschedule, setSavingReschedule] = useState(false)

  // 買取品目（PurchaseItemManager に委譲）／請求項目の登録（案件キー）
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [showAddWork, setShowAddWork] = useState(false)
  // 請求項目は管理ポータルのマスタから選択する（自由入力にしない）
  const [workMasters, setWorkMasters] = useState<WorkItemMaster[]>([])
  const [workForm, setWorkForm] = useState({ masterId: '', workName: '', unitPrice: '', quantity: 1, notes: '', optionIds: [] as string[], extraStaffCount: '' })
  const [showPreview, setShowPreview] = useState(false)
  const [numberCopied, setNumberCopied] = useState(false)
  const [uploadingContract, setUploadingContract] = useState(false)
  const [savingUplift, setSavingUplift] = useState(false)
  const [savingWork, setSavingWork] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  // 事前同意（案件単位）
  const [savingConsent, setSavingConsent] = useState(false)
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [consentDraft, setConsentDraft] = useState<string | null>(null)

  // 会話録音（AI文字起こし・要約）
  const [recordings, setRecordings] = useState<DealRecording[]>([])
  const [recUploading, setRecUploading] = useState(false)
  const [recProgress, setRecProgress] = useState(0)
  const [recError, setRecError] = useState<string | null>(null)
  const [openTranscriptId, setOpenTranscriptId] = useState<string | null>(null)
  // 古物台帳（売買契約が発行されている案件のみ記録がある）
  const [ledger, setLedger] = useState<KobutsuLedgerGroup | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  // 折りたたみセクションの見出しからファイル選択を開くための隠し input
  const paperInputRef = useRef<HTMLInputElement>(null)
  const recInputRef = useRef<HTMLInputElement>(null)
  // 折りたたみの既定開閉（共有フック）
  const initialOpen = useOpenLatch()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/deals/${dealId}`)
      if (res.status === 403) { setError('この案件を閲覧する権限がありません'); setLoading(false); return }
      if (res.status === 404) { setError('案件が見つかりません'); setLoading(false); return }
      if (!res.ok) { setError('案件の取得に失敗しました'); setLoading(false); return }
      const data: Deal = await res.json()
      setDeal(data)
      setDetailEdit(data.detail ?? '')
      setOccurredEdit(toDateInput(data.occurredAt ?? data.createdAt))
    } catch {
      setError('案件の取得に失敗しました')
    }
    setLoading(false)
  }, [dealId])

  useEffect(() => { load() }, [load])

  // 担当者候補（店舗ポータルのみ）
  useEffect(() => {
    if (isAdmin) return
    fetch('/api/store/members')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setMembers(Array.isArray(d) ? d.map((m: any) => ({ id: m.id, name: m.name })) : []))
      .catch(() => {})
  }, [isAdmin])

  // 買取品目カテゴリ
  useEffect(() => {
    fetch('/api/purchase-categories')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  // 請求項目マスタ（管理ポータルで設定された選択肢）
  useEffect(() => {
    fetch('/api/work-item-masters')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setWorkMasters(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  // 会話録音の一覧取得
  const loadRecordings = useCallback(async () => {
    try {
      const r = await fetch(`/api/deals/${dealId}/recordings`)
      if (r.ok) { const d = await r.json(); setRecordings(d.recordings ?? []) }
    } catch { /* ignore */ }
  }, [dealId])

  useEffect(() => { loadRecordings() }, [loadRecordings])

  // 古物台帳の取得（契約が発行されてから記録ができるので、契約の有無で判断）
  const loadLedger = useCallback(async () => {
    setLedgerLoading(true)
    try {
      const r = await fetch(`/api/deals/${dealId}/kobutsu-ledger`)
      if (r.ok) { const d = await r.json(); setLedger(d.group ?? null) }
    } catch { /* ignore */ }
    finally { setLedgerLoading(false) }
  }, [dealId])

  useEffect(() => {
    if (deal?.dealContract) loadLedger()
    else setLedger(null)
  }, [deal?.dealContract, loadLedger])

  // 解析中の録音があれば8秒ごとにポーリングして更新
  useEffect(() => {
    const busy = recordings.some(r => r.status === 'pending' || r.status === 'processing')
    if (!busy) return
    const t = setInterval(loadRecordings, 8000)
    return () => clearInterval(t)
  }, [recordings, loadRecordings])

  // ファイル選択・マイク録音の両方から呼ばれる共通アップロード処理。
  // DealRecording は案件に対してhasMany（複数件登録可能）なので、呼ぶたびに新しい1件として追加される
  async function uploadRecordingFile(file: File) {
    if (file.size > 200 * 1024 * 1024) { setRecError('音声ファイルは200MB以下にしてください'); return }
    setRecError(null)
    setRecUploading(true)
    setRecProgress(0)
    try {
      const extMatch = (file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '').toLowerCase()
      const pathname = `deal-recordings/${dealId}/${Date.now()}${extMatch || '.m4a'}`
      const blob = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: `/api/deals/${dealId}/recordings/upload`,
        contentType: file.type || undefined,
        onUploadProgress: (p) => setRecProgress(Math.round(p.percentage)),
      })
      const res = await fetch(`/api/deals/${dealId}/recordings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: blob.url, fileName: file.name, mimeType: file.type, fileSize: file.size }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || '登録に失敗しました') }
      await loadRecordings()
    } catch (err) {
      setRecError(err instanceof Error ? err.message : 'アップロードに失敗しました')
    } finally {
      setRecUploading(false)
      setRecProgress(0)
    }
  }

  async function handleUploadRecording(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await uploadRecordingFile(file)
  }

  // ── マイク録音（MediaRecorder） ──
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [micUnsupportedMsg, setMicUnsupportedMsg] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // フローティング録音ボタン（許可ブロック時の案内パネルを含む）の実際の高さ。
  // fixed配置なのでコンテンツの流れには影響しないが、逆に言うとページ末尾のコンテンツが
  // このボタン群の真裏に来て隠れてしまう。実測した高さぶんコンテンツ末尾に空きを作って回避する
  // 通常のref+マウント時useEffectだと、このページはローディング中に一度描画してから
  // データ取得後に本描画へ差し替わるため、空配列依存のeffectがローディング中（要素まだ無し）に
  // 一度だけ走って終わってしまう。コールバックrefにして、要素が実際にアタッチされた時点で
  // 確実に測るようにする
  const [floatingRecEl, setFloatingRecEl] = useState<HTMLDivElement | null>(null)
  const [floatingRecHeight, setFloatingRecHeight] = useState(0)

  useEffect(() => {
    if (!floatingRecEl || typeof ResizeObserver === 'undefined') return
    const update = () => setFloatingRecHeight(floatingRecEl.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(floatingRecEl)
    return () => ro.disconnect()
  }, [floatingRecEl])

  /** 「許可状況を再確認」。設定を変えたあとに押すと、その場で判定し直す */
  const recheckMicPermission = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      // Permissions APIが無い環境（Safari等）は、もう一度録音を試すしか確かめる手段がない
      setMicUnsupportedMsg(null)
      return
    }
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      setMicUnsupportedMsg(status.state === 'denied'
        ? 'まだマイクがブロックされています。ブラウザのサイト設定で「マイク」を許可にしてから、もう一度お試しください。'
        : null)
    } catch {
      setMicUnsupportedMsg(null)
    }
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return
    let status: PermissionStatus | null = null
    navigator.permissions.query({ name: 'microphone' as PermissionName }).then(s => {
      status = s
      // ブラウザ設定で許可に変えたら、出していた警告は自動で引っ込める
      s.onchange = () => { if (s.state !== 'denied') setMicUnsupportedMsg(null) }
    }).catch(() => { /* 非対応ブラウザは 'unknown' のまま録音時のエラーで検知する */ })
    return () => { if (status) status.onchange = null }
  }, [])

  function stopMicStream() {
    recordingStreamRef.current?.getTracks().forEach(t => t.stop())
    recordingStreamRef.current = null
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null }
  }

  async function startMicRecording() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicUnsupportedMsg('この端末・ブラウザではマイク録音に対応していません（HTTPS接続が必要な場合があります）')
      return
    }
    setMicUnsupportedMsg(null)
    setRecError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingStreamRef.current = stream
      // ブラウザが対応する形式を優先順に試す（Safari は webm 非対応で mp4 のみ扱えることが多い）
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recordedChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stopMicStream()
        const blobType = recorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(recordedChunksRef.current, { type: blobType })
        recordedChunksRef.current = []
        if (audioBlob.size === 0) { setRecError('録音データが空でした。もう一度お試しください'); return }
        const ext = blobType.includes('mp4') ? '.m4a' : blobType.includes('ogg') ? '.ogg' : '.webm'
        const fileName = `録音_${new Date().toISOString().replace(/[:.]/g, '-')}${ext}`
        await uploadRecordingFile(new File([audioBlob], fileName, { type: blobType }))
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
    } catch (err: any) {
      stopMicStream()
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' || err?.name === 'SecurityError') {
        setMicUnsupportedMsg('マイクの使用がブロックされています。ブラウザのアドレスバー付近のサイト設定（鍵マーク等）で「マイク」を許可に変更し、再読み込みしてください。')
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setMicUnsupportedMsg('マイクが見つかりませんでした。端末にマイクが接続・有効になっているか確認してください')
      } else {
        setMicUnsupportedMsg('マイクへのアクセスに失敗しました。ブラウザの設定を確認してください')
      }
    }
  }

  function stopMicRecording() {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  // ページを離れるときに録音中なら止める（マイクを掴んだままにしない）
  useEffect(() => () => {
    mediaRecorderRef.current?.stop()
    stopMicStream()
  }, [])

  async function handleDeleteRecording(recId: string) {
    if (!confirm('この録音を削除しますか？（文字起こし・要約も削除されます）')) return
    const res = await fetch(`/api/deals/${dealId}/recordings/${recId}`, { method: 'DELETE' })
    if (res.ok) setRecordings(prev => prev.filter(r => r.id !== recId))
  }

  async function handleRetryRecording(recId: string) {
    const res = await fetch(`/api/deals/${dealId}/recordings/${recId}`, { method: 'POST' })
    if (res.ok) loadRecordings()
  }


  function selectWorkMaster(masterId: string) {
    const master = workMasters.find(m => m.id === masterId)
    setWorkForm(prev => ({
      ...prev,
      masterId,
      workName: master?.name ?? '',
      // 既定単価を初期値として入れる（案件ごとに調整可）
      unitPrice: master ? String(master.defaultUnitPrice) : '',
      // チェック項目・追加人員は請求項目ごとに違うのでリセットする
      optionIds: [],
      extraStaffCount: '',
    }))
  }

  function toggleWorkOption(optionId: string) {
    setWorkForm(prev => ({
      ...prev,
      optionIds: prev.optionIds.includes(optionId)
        ? prev.optionIds.filter(id => id !== optionId)
        : [...prev.optionIds, optionId],
    }))
  }

  async function addWorkItem() {
    if (!deal || !workForm.masterId) return
    setSavingWork(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}/work-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterId: workForm.masterId,
        workName: workForm.workName,
        optionIds: workForm.optionIds,
        extraStaffCount: workForm.extraStaffCount === '' ? null : Number(workForm.extraStaffCount) || 0,
        unitPrice: Number(workForm.unitPrice) || 0,
        quantity: Number(workForm.quantity) || 1,
        notes: workForm.notes.trim() || null,
      }),
    })
    setSavingWork(false)
    if (res.ok) {
      setShowAddWork(false)
      setWorkForm({ masterId: '', workName: '', unitPrice: '', quantity: 1, notes: '', optionIds: [], extraStaffCount: '' })
      load()
    } else {
      const data = await res.json().catch(() => ({} as any))
      setMsg({ type: 'error', text: data?.error || '請求項目の追加に失敗しました' })
    }
  }

  async function deleteItem(kind: 'purchase' | 'work', itemId: string) {
    if (!confirm('この項目を削除しますか？')) return
    setDeletingItemId(itemId)
    const path = kind === 'purchase' ? `/api/purchase-items/${itemId}` : `/api/work-items/${itemId}`
    const res = await fetch(path, { method: 'DELETE' })
    setDeletingItemId(null)
    if (res.ok) load()
    else setMsg({ type: 'error', text: '削除に失敗しました' })
  }

  // 紙で作成した売買契約書の写真アップロード / 削除
  async function handlePaperContractUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploadingContract(true)
    setMsg(null)
    try {
      for (let i = 0; i < files.length; i++) {
        const converted = await convertToJpegIfNeeded(files[i])
        const fd = new FormData()
        fd.append('file', converted)
        const res = await fetch(`/api/deals/${dealId}/contract-images`, { method: 'POST', body: fd })
        if (!res.ok) { setMsg({ type: 'error', text: '写真のアップロードに失敗しました' }); break }
      }
      await load()
      setMsg({ type: 'success', text: '契約書の写真をアップロードしました' })
    } catch {
      setMsg({ type: 'error', text: '写真のアップロードに失敗しました' })
    } finally {
      setUploadingContract(false)
      e.target.value = ''
    }
  }

  async function deletePaperContract(index: number) {
    if (!confirm('この写真を削除しますか？')) return
    const res = await fetch(`/api/deals/${dealId}/contract-images?index=${index}`, { method: 'DELETE' })
    if (res.ok) { await load(); setMsg({ type: 'success', text: '写真を削除しました' }) }
    else setMsg({ type: 'error', text: '削除に失敗しました' })
  }

  // 買取金額の上乗せ率（10%/15%）。同じ値を再度押すと解除（排他トグル）
  async function saveUplift(pct: number) {
    if (!deal) return
    const next = (deal.purchaseUpliftPercent ?? 0) === pct ? 0 : pct
    setSavingUplift(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchaseUpliftPercent: next }),
    })
    setSavingUplift(false)
    if (res.ok) { await load(); setMsg({ type: 'success', text: next > 0 ? `買取金額を${next}%上乗せしました` : '上乗せを解除しました' }) }
    else setMsg({ type: 'error', text: '上乗せの更新に失敗しました' })
  }

  async function savePreConsent(signature: string | null) {
    setSavingConsent(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preConsentSignature: signature }),
    })
    setSavingConsent(false)
    if (res.ok) {
      setDeal(prev => prev ? { ...prev, hasPreConsent: !!signature, preConsentAt: signature ? new Date().toISOString() : null } : prev)
      setShowConsentModal(false)
      setConsentDraft(null)
      setMsg({ type: 'success', text: signature ? '事前同意を保存しました' : '事前同意をクリアしました' })
    } else setMsg({ type: 'error', text: '事前同意の保存に失敗しました' })
  }

  async function saveOccurred() {
    if (!deal || !occurredEdit) return
    setSavingOccurred(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occurredAt: occurredEdit }),
    })
    setSavingOccurred(false)
    if (res.ok) {
      setDeal(prev => prev ? { ...prev, occurredAt: new Date(occurredEdit).toISOString() } : prev)
      setMsg({ type: 'success', text: '案件発生日を保存しました' })
    } else setMsg({ type: 'error', text: '発生日の保存に失敗しました' })
  }

  async function saveStaff(visitId: string) {
    setSavingStaff(true)
    setMsg(null)
    const res = await fetch(`/api/visit-schedules/${visitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffName: staffDraft || null }),
    })
    setSavingStaff(false)
    if (res.ok) {
      setDeal(prev => prev ? { ...prev, visitSchedules: prev.visitSchedules.map(v => v.id === visitId ? { ...v, staffName: staffDraft || null } : v) } : prev)
      setEditingStaffId(null)
    } else setMsg({ type: 'error', text: '担当者の保存に失敗しました' })
  }

  async function handleAddVisit() {
    if (!deal || !deal.store || !addVisit.visitDate) return
    setAddingVisit(true)
    setMsg(null)
    const res = await fetch('/api/visit-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: deal.user.id,
        storeId: deal.store.id,
        dealId: deal.id,
        visitDate: addVisit.visitDate,
        startTime: addVisit.startTime || undefined,
        endTime: addVisit.endTime || undefined,
        staffName: addVisit.staffName || undefined,
        note: addVisit.note || undefined,
      }),
    })
    setAddingVisit(false)
    if (res.ok) {
      setShowAddVisit(false)
      setAddVisit({ visitDate: '', startTime: '', endTime: '', staffName: '', note: '' })
      setMsg({ type: 'success', text: '訪問を追加しました' })
      load()
    } else {
      const d = await res.json().catch(() => null)
      setMsg({ type: 'error', text: d?.error || '訪問の追加に失敗しました' })
    }
  }

  function openReschedule(v: VisitSchedule) {
    setRescheduleTarget(v)
    setRescheduleForm({ visitDate: toDateInput(v.visitDate), startTime: v.startTime ?? '', endTime: v.endTime ?? '' })
  }

  async function handleReschedule() {
    if (!rescheduleTarget || !rescheduleForm.visitDate) return
    setSavingReschedule(true)
    setMsg(null)
    const res = await fetch(`/api/visit-schedules/${rescheduleTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitDate: rescheduleForm.visitDate,
        startTime: rescheduleForm.startTime || null,
        endTime: rescheduleForm.endTime || null,
      }),
    })
    setSavingReschedule(false)
    if (res.ok) {
      setRescheduleTarget(null)
      setMsg({ type: 'success', text: '訪問日時を変更しました' })
      load()
    } else {
      const d = await res.json().catch(() => null)
      setMsg({ type: 'error', text: d?.error || '訪問日時の変更に失敗しました' })
    }
  }

  async function changeStatus(status: string) {
    if (!deal || status === deal.status) return
    setSavingStatus(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setSavingStatus(false)
    if (res.ok) setDeal(prev => prev ? { ...prev, status } : prev)
    else setMsg({ type: 'error', text: 'ステータスの変更に失敗しました' })
  }

  async function changeCategory(category: string) {
    if (!deal || category === deal.category) return
    setSavingCategory(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    })
    setSavingCategory(false)
    if (res.ok) setDeal(prev => prev ? { ...prev, category } : prev)
    else setMsg({ type: 'error', text: 'カテゴリーの変更に失敗しました' })
  }

  async function saveDetail() {
    if (!deal) return
    setSavingDetail(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detail: detailEdit }),
    })
    setSavingDetail(false)
    if (res.ok) {
      setDeal(prev => prev ? { ...prev, detail: detailEdit } : prev)
      setMsg({ type: 'success', text: '案件内容を保存しました' })
      setIsEditingDetail(false)
    } else {
      setMsg({ type: 'error', text: '保存に失敗しました' })
    }
  }

  async function handleDelete() {
    // 何が一緒に消えるのかを具体的に出す。訪問・書類・品目は案件と一緒に物理削除されるため、
    // 「案件だけ消えるつもりだった」という誤操作を防ぐ
    const d = deal
    const parts = [
      d && d.visitSchedules.length > 0 ? `訪問予定 ${d.visitSchedules.length}件` : null,
      purchaseItems.length > 0 ? `買取品目 ${purchaseItems.length}件` : null,
      workItems.length > 0 ? `請求項目 ${workItems.length}件` : null,
      d?.dealContract ? '売買契約書' : null,
      d?.dealEstimate ? '見積書' : null,
      recordings.length > 0 ? `会話の録音 ${recordings.length}件` : null,
    ].filter(Boolean)
    const detail = parts.length > 0
      ? `\n\n次の情報も一緒に削除されます:\n・${parts.join('\n・')}\n\nこの操作は取り消せません。`
      : '\n\nこの操作は取り消せません。'
    if (!confirm(`この案件を削除しますか？${detail}`)) return
    setDeleting(true)
    const res = await fetch(`/api/deals/${dealId}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) { router.push(backHref); return }
    const data = await res.json().catch(() => null)
    setMsg({ type: 'error', text: data?.error || '削除に失敗しました' })
  }

  // 全画面スピナーは初回だけ。保存後の再読込で出すと <details> の開閉がユーザー操作ごと巻き戻る
  if (loading && !deal) return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  if (error || !deal) {
    return (
      <div className="min-h-screen bg-[var(--md-sys-color-background)]">
        <AppBar title="案件詳細" actions={<Link href={backHref}><Button variant="text" size="sm">← 戻る</Button></Link>} />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {error ?? '案件が見つかりません'}
        </div>
      </div>
    )
  }

  const badge = DEAL_STATUS_BADGE[deal.status as DealStatus] ?? DEAL_STATUS_BADGE.inquiry
  const catBadge = DEAL_CATEGORY_BADGE[deal.category ?? 'purchase'] ?? DEAL_CATEGORY_BADGE.purchase
  // 案件直下の品目（再ペアレント後の正）
  const purchaseItems = deal.purchaseItems ?? []
  const workItems = deal.workItems ?? []
  const upliftPct = deal.purchaseUpliftPercent ?? 0
  const basePurchase = purchaseItems.reduce((s, i) => s + i.purchasePrice * i.quantity, 0)
  const upliftAmount = Math.round(basePurchase * upliftPct / 100)
  const totalPurchase = basePurchase + upliftAmount
  const totalBilling = deal.billingAmount ?? workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const dealContract = deal.dealContract
  const dealEstimate = deal.dealEstimate
  // 顧客情報の生年月日: プロフィール値 → 身分証OCRの読み取り値の順で採用
  const birthDateFromId = !deal.user.birthDate && !!deal.user.idBirthDate
  const birthDateDisplay = fmtBirthDate(deal.user.birthDate || deal.user.idBirthDate)
  const editable = !isAdmin // 品目・事前同意の編集は店舗ポータル（管理は閲覧）
  // 売買契約書はお客様の署名つきで発行される確定書類。発行後に品目や金額が変わると
  // 書類とDBがずれるため、取引内容（事前同意・買取品目・請求項目・上乗せ率）を凍結する。
  // 在庫化・AI調査・古物台帳・紙契約書の写真・録音は契約後に行う後続作業なので触れるままにする。
  const contractIssued = !!deal.dealContract
  const workEditable = editable && !contractIssued
  // 書類作成フローの対象訪問（最新）。フローは案件配下の品目で構成され、結果は案件の書類になる。
  const targetVisitId = deal.visitSchedules[0]?.id ?? null

  // 進捗タイムライン（取得可能な日時を時系列で）
  const timeline: { label: string; at: string; sub?: string }[] = [
    { label: '案件発生', at: deal.occurredAt ?? deal.createdAt },
    ...deal.visitSchedules.map(v => ({ label: '訪問', at: v.visitDate, sub: v.staffName ? `担当 ${v.staffName}` : undefined })),
    ...deal.visitSchedules
      .filter(v => !!v.revisitDate)
      .map(v => ({ label: '後日引取', at: v.revisitDate as string, sub: v.revisitNote ?? undefined })),
    ...(dealEstimate ? [{ label: '見積作成', at: dealEstimate.validUntil, sub: `有効期限 ${fmtDate(dealEstimate.validUntil)}` }] : []),
    ...(dealContract ? [{ label: '契約締結', at: dealContract.agreedAt }] : []),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  const pdfUrl = (type: 'contract' | 'estimate', visitId: string, kind: 'sale' | 'invoice') =>
    `/api/magic-link/document-pdf?type=${type}&visitId=${visitId}&kind=${kind}`

  // 書類作成の遷移先。下部の追従バーと「書類を作成」カードで共有する（URLを2箇所に書かない）。
  // staff= は売買契約書側だけに渡す: 契約書は未指定だと「担当者」欄が空になるため訪問の担当者を引き継ぐ。
  // 見積書は未指定ならログイン中ユーザー名が入る既存挙動なので、上書きしない。
  const docStaff = deal.visitSchedules[0]?.staffName ?? ''
  // PDF配信APIは訪問IDをキーにするため、プレビューを開く前に const へ退避する
  // （プロパティ参照のままだとクロージャ内で null 絞り込みが外れる）
  const contractVisitId = dealContract?.visitScheduleId ?? null
  const estimateVisitId = dealEstimate?.visitScheduleId ?? null
  const goEstimate = () => { if (targetVisitId) router.push(`/store/schedule/${targetVisitId}/estimate?dealId=${deal.id}`) }
  const goAgreement = () => {
    if (!targetVisitId) return
    const staffQuery = docStaff ? `&staff=${encodeURIComponent(docStaff)}` : ''
    router.push(`/store/schedule/${targetVisitId}/agreement?dealId=${deal.id}${staffQuery}`)
  }
  // 後日引取は訪問行の revisit* に入るため、訪問件数とは別に数えて見出しに出す
  const revisitCount = deal.visitSchedules.filter(v => !!v.revisitDate).length
  // 担当者は「案件の担当メンバー（Deal.memberId・一覧の担当列と同じ）」と
  // 「訪問ごとの担当者名（VisitSchedule.staffName・書類の担当者欄に使う）」の2系統がある。
  // どちらか片方にしか入っていないデータがあるため、両方をまとめて表示する
  const uniqueStaffNames = Array.from(new Set(
    [deal.member?.name, ...deal.visitSchedules.map(v => v.staffName)].filter((n): n is string => !!n),
  ))
  // お支払い金額（買取−請求）。契約プレビューと同じ計算を本文にも出す
  const paymentDiff = totalPurchase - totalBilling
  // 請求金額は deal.billingAmount 優先のため明細合計とズレ得る。ズレたときだけ明細合計を併記する
  const billingItemsTotal = workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const selectedWorkMaster = workMasters.find(m => m.id === workForm.masterId) ?? null
  const billingMismatch = deal.billingAmount != null && deal.billingAmount !== billingItemsTotal
  const recordingBusy = recordings.filter(r => r.status === 'pending' || r.status === 'processing').length
  const ledgerMissingCount = ledger?.missing.length ?? 0

  return (
    // 2カラム化は xl(1280px) から。lg では本文が768px（サイドバー256px固定）しかなく、右列が
    // 約410pxになって PurchaseItemManager と古物台帳テーブルの sm:grid-cols-2 が破綻する。
    <div className="min-h-dvh flex flex-col bg-[var(--md-sys-color-surface-container-low)]">
      <AppBar
        title={deal.user.name}
        subtitle={`案件番号 ${formatDealNumber(deal.dealNumber)} ・ 発生 ${fmtDate(deal.occurredAt ?? deal.createdAt)}`}
        actions={<Link href={backHref}><Button variant="text" size="sm">← 一覧</Button></Link>}
      />

      <div className="flex-1 flex flex-col gap-4 w-full max-w-3xl xl:max-w-7xl mx-auto px-4 sm:px-6 py-5">
        {msg && <MessageBanner severity={msg.type}>{msg.text}</MessageBanner>}

        {/* ── ゾーンA: 案件ヘッダー（全幅） ───────────────────────── */}
        <div className={SECTION_CLS}>
          <div className="px-4 sm:px-5 pt-4 sm:pt-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold" style={{ background: badge.bg, color: badge.fg }}>
                {DEAL_STATUS_LABEL[deal.status as DealStatus] ?? deal.status}
              </span>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold" style={{ background: catBadge.bg, color: catBadge.fg }}>
                {DEAL_CATEGORY_LABEL[deal.category ?? 'purchase'] ?? deal.category}
              </span>
              {/* 案件番号（クリックでコピー） */}
              <button
                type="button"
                onClick={() => {
                  if (!deal.dealNumber) return
                  navigator.clipboard?.writeText(deal.dealNumber).catch(() => { /* 権限なし等は無視 */ })
                  setNumberCopied(true)
                  setTimeout(() => setNumberCopied(false), 1500)
                }}
                disabled={!deal.dealNumber}
                title={deal.dealNumber ? '案件番号をコピー' : undefined}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold tabular-nums bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] disabled:opacity-60"
              >
                No. {formatDealNumber(deal.dealNumber)}
                {deal.dealNumber && (
                  <span className="text-[10px] font-normal text-[var(--md-sys-color-on-surface-variant)]">
                    {numberCopied ? 'コピー済' : 'コピー'}
                  </span>
                )}
              </button>
            </div>
            <Button size="sm" variant="outlined" onClick={() => setShowPreview(true)}>契約プレビュー</Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '訪問回数', value: `${deal.visitSchedules.length} 回` },
              { label: '合計買取金額', value: formatYen(totalPurchase) },
              { label: '合計請求金額', value: formatYen(totalBilling) },
              { label: '見積/契約', value: `${dealEstimate ? 1 : 0} / ${dealContract ? 1 : 0} 件` },
            ].map(s => (
              <div key={s.label} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--md-sys-color-surface-container-low)' }}>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{s.label}</div>
                <div className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>
          </div>
          {/* ステータス（最頻の書き込み。全幅なので7値が折り返さず並ぶ） */}
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-3 mt-1 border-t border-[var(--md-sys-color-outline-variant)]">
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">ステータス</label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {DEAL_STATUS_ORDER.map(s => {
                const active = deal.status === s
                const c = DEAL_STATUS_BADGE[s]
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={savingStatus}
                    onClick={() => changeStatus(s)}
                    className="text-xs px-3 py-1.5 rounded-full border transition-all disabled:opacity-50"
                    style={active
                      ? { background: c.bg, color: c.fg, borderColor: c.fg }
                      : { background: 'transparent', color: 'var(--md-sys-color-on-surface-variant)', borderColor: 'var(--md-sys-color-outline-variant)' }}
                  >
                    {DEAL_STATUS_LABEL[s]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── ゾーンB/C: 2カラム（items-start が無いと左カラムの sticky が無言で効かない） ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-4 xl:gap-6 items-start">

          {/* 左カラム: 参照レーン（顧客・案件属性・経緯） */}
          <div className="min-w-0 flex flex-col gap-3 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:pr-1 thin-scrollbar">

            {/* L1 顧客情報 */}
            <Section
              title="顧客情報"
              actions={isAdmin ? (
              <Link href={`/admin/customers?focus=${deal.user.id}`} className="text-xs text-[var(--portal-primary,#374151)] hover:underline">
                顧客ページ →
              </Link>
              ) : undefined}
            >
              <div className="pb-1">
                <div className="text-base font-semibold text-[var(--md-sys-color-on-surface)] break-words">{deal.user.name}</div>
                {deal.user.furigana && <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{deal.user.furigana}</div>}
              </div>
              <PropRow
                label="生年月日"
                alert={ledger?.missing.includes('age')}
                value={birthDateDisplay && (
                  <>
                    {birthDateDisplay}
                    {birthDateFromId && (
                      <span className="ml-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        身分証読み取り{deal.user.idDocumentType ? `・${deal.user.idDocumentType}` : ''}
                      </span>
                    )}
                  </>
                )}
              />
              <PropRow
                label="職業"
                alert={ledger?.missing.includes('occupation')}
                value={deal.user.occupation && (
                  <>
                    {deal.user.occupation}
                    <span className="ml-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">売買契約書</span>
                  </>
                )}
              />
              <PropRow
                label="電話"
                value={deal.user.phone ? (
                  <a href={`tel:${deal.user.phone.replace(/[-ー\s]/g, '')}`} className="text-[var(--portal-primary,#374151)] hover:underline">{deal.user.phone}</a>
                ) : null}
              />
              <PropRow
                label="メール"
                value={deal.user.email ? (
                  <a href={`mailto:${deal.user.email}`} className="text-[var(--portal-primary,#374151)] hover:underline break-all">{deal.user.email}</a>
                ) : null}
              />
              <PropRow label="住所" alert={ledger?.missing.includes('address')} value={deal.user.address} />
            </Section>

            {/* L2 案件情報（カテゴリー・案件内容・発生日・担当者・作成者） */}
            <Section title="案件情報">
              <div className="space-y-4">
                <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">カテゴリー</label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {DEAL_CATEGORIES.map(cat => {
                const active = (deal.category ?? 'purchase') === cat
                const c = DEAL_CATEGORY_BADGE[cat]
                const akikuruBlocked = cat === 'akikuru' && !!deal.store && !storeSupportsAkikuru(deal.store.supportedServices)
                return (
                  <button
                    key={cat}
                    type="button"
                    disabled={savingCategory || akikuruBlocked}
                    title={akikuruBlocked ? 'この店舗はアキクルに対応していません' : undefined}
                    onClick={() => changeCategory(cat)}
                    className="text-xs px-3 py-1.5 rounded-full border transition-all disabled:opacity-50"
                    style={active
                      ? { background: c.bg, color: c.fg, borderColor: c.fg }
                      : { background: 'transparent', color: 'var(--md-sys-color-on-surface-variant)', borderColor: 'var(--md-sys-color-outline-variant)' }}
                  >
                    {DEAL_CATEGORY_LABEL[cat]}
                  </button>
                )
              })}
            </div>
                </div>
                <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">案件内容</label>
              {!isEditingDetail && (
                <button
                  type="button"
                  onClick={() => { setDetailEdit(deal.detail ?? ''); setIsEditingDetail(true) }}
                  className="text-xs text-[var(--portal-primary,#374151)] hover:underline"
                >
                  編集
                </button>
              )}
            </div>
            {isEditingDetail ? (
              <>
                <textarea
                  value={detailEdit}
                  onChange={e => setDetailEdit(e.target.value)}
                  rows={3}
                  placeholder="買取内容・状況など..."
                  autoFocus
                  className="w-full px-3.5 py-2.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2 resize-y"
                />
                <div className="flex justify-end gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="text"
                    onClick={() => { setDetailEdit(deal.detail ?? ''); setIsEditingDetail(false) }}
                    disabled={savingDetail}
                  >
                    キャンセル
                  </Button>
                  <Button size="sm" onClick={saveDetail} loading={savingDetail} disabled={savingDetail || detailEdit === (deal.detail ?? '')}>
                    保存
                  </Button>
                </div>
              </>
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm text-[var(--md-sys-color-on-surface)] min-h-[1.5em]">
                {deal.detail?.trim() || <span className="text-[var(--md-sys-color-on-surface-variant)]">未入力（「編集」から入力できます）</span>}
              </p>
            )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">案件発生日</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={occurredEdit}
                      onChange={e => setOccurredEdit(e.target.value)}
                      className="h-9 px-2.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)]"
                    />
                    <Button
                      size="sm"
                      variant="text"
                      onClick={saveOccurred}
                      loading={savingOccurred}
                      disabled={savingOccurred || !occurredEdit || occurredEdit === toDateInput(deal.occurredAt ?? deal.createdAt)}
                    >
                      保存
                    </Button>
                  </div>
                </div>
                <div className="pt-1 border-t border-[var(--md-sys-color-outline-variant)]">
                  {/* 担当者は訪問レコード側が正。編集は訪問セクションで行う */}
                  <PropRow
                    label="担当者"
                    value={
                      <span className="flex items-center gap-2 flex-wrap">
                        {uniqueStaffNames.length > 0
                          ? uniqueStaffNames.join('／')
                          : <span className="text-[var(--md-sys-color-on-surface-variant)]">未設定</span>}
                        <a href="#deal-visits" className="text-[11px] text-[var(--portal-primary,#374151)] hover:underline">訪問で編集 →</a>
                      </span>
                    }
                  />
                  <PropRow label="作成者" value={creatorLabel(deal)} />
                </div>
              </div>
            </Section>

            {/* L3 担当店舗（管理のみ） */}
            {isAdmin && (
              <Section title="担当店舗">
              {deal.store ? (
                <>
                  <Row label="店舗名" value={`${deal.store.name}（${deal.store.code}）`} />
                  <Row label="電話" value={deal.store.phone} />
                  <Row label="住所" value={`${deal.store.prefecture ?? ''}${deal.store.address ?? ''}`} />
                  <Row label="メール" value={deal.store.email} />
                  <Row label="インボイス番号" value={deal.store.invoiceNumber} />
                  <Row label="古物許可番号" value={deal.store.antiquePermitNumber} />
                </>
              ) : (
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">店舗未割当</p>
              )}
              </Section>
            )}

            {/* L4 問い合わせ由来 */}
            {deal.inquiry && (
              <Section title="問い合わせ由来" collapsible defaultOpen={initialOpen('inquiry', false)}>
            <Row label="種別" value={deal.inquiry.inquiryType} />
            <Row label="受付日時" value={fmtDateTime(deal.inquiry.createdAt)} />
            {deal.inquiry.details && <Row label="内容" value={<span className="whitespace-pre-wrap">{deal.inquiry.details}</span>} />}
              </Section>
            )}

            {/* L5 進捗タイムライン */}
            <Section
              title="進捗タイムライン"
              meta={`${timeline.length}件`}
              collapsible
              defaultOpen={initialOpen('timeline', timeline.length > 1)}
            >
            <ol className="relative border-l border-[var(--md-sys-color-outline-variant)] ml-1.5 space-y-3">
              {timeline.map((t, i) => (
                <li key={i} className="ml-4">
                  <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full" style={{ background: 'var(--portal-primary,#374151)' }} />
                  <div className="text-sm text-[var(--md-sys-color-on-surface)]">
                    <span className="font-medium">{t.label}</span>
                    <span className="text-[var(--md-sys-color-on-surface-variant)] ml-2 text-xs">{fmtDate(t.at)}</span>
                  </div>
                  {t.sub && <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{t.sub}</div>}
                </li>
              ))}
            </ol>
            </Section>
          </div>

          {/* 右カラム: 作業レーン（訪問→事前同意→品目→請求→書類） */}
          <div className="min-w-0 flex flex-col gap-4">

            {/* R1 訪問スケジュール */}
            <Section
              id="deal-visits"
              className="scroll-mt-20"
              title="訪問スケジュール"
              meta={`${deal.visitSchedules.length}件${revisitCount > 0 ? ` ・ 後日引取 ${revisitCount}件` : ''}`}
              actions={
                <>
              {deal.store ? (
                <Button size="sm" variant="outlined" onClick={() => setShowAddVisit(true)}>＋ 訪問を追加</Button>
              ) : (
                <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">店舗未割当のため追加不可</span>
              )}
                </>
              }
            >
            {deal.visitSchedules.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">紐づく訪問はありません</p>
            ) : (
              <div className="space-y-2.5">
                {deal.visitSchedules.map(v => (
                  <div key={v.id} className="rounded-xl border border-[var(--md-sys-color-outline-variant)] p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusBadge status={v.status as any} />
                        <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{fmtDate(v.visitDate)}</span>
                        {timeRange(v.startTime, v.endTime) && (
                          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{timeRange(v.startTime, v.endTime)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button type="button" onClick={() => openReschedule(v)} className="text-xs text-[var(--portal-primary,#374151)] hover:underline">日時を変更</button>
                        <Link href={`${visitHrefBase}/${v.id}`} className="text-xs text-[var(--portal-primary,#374151)] hover:underline">訪問詳細 →</Link>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      {/* 担当者（訪問ごと・編集可） */}
                      {editingStaffId === v.id ? (
                        <span className="flex items-center gap-1.5">
                          <input
                            list="deal-staff-options"
                            value={staffDraft}
                            onChange={e => setStaffDraft(e.target.value)}
                            placeholder="担当者名"
                            className="h-8 px-2 text-xs bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)]"
                          />
                          <button type="button" disabled={savingStaff} onClick={() => saveStaff(v.id)} className="text-[var(--portal-primary,#374151)] hover:underline disabled:opacity-50">保存</button>
                          <button type="button" onClick={() => setEditingStaffId(null)} className="hover:underline">取消</button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          担当: {v.staffName || '未設定'}
                          <button type="button" onClick={() => { setEditingStaffId(v.id); setStaffDraft(v.staffName ?? '') }} className="text-[var(--portal-primary,#374151)] hover:underline">変更</button>
                        </span>
                      )}
                      <span>買取: {formatYen(v.purchaseAmount)}</span>
                      <span>請求: {formatYen(v.billingAmount)}</span>
                    </div>
                    {v.note && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 whitespace-pre-wrap">{v.note}</p>}
                    {/* 後日引取（売買契約書の作成時に登録される。訪問行のrevisit*に入るため
                        別の訪問レコードにはならないが、案件からも予定として見えるようにする） */}
                    {v.revisitDate && (
                      <div className="mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending-text)' }}>
                            後日引取
                          </span>
                          <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{fmtDate(v.revisitDate)}</span>
                          {(v.revisitStart || v.revisitEnd) && (
                            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{timeRange(v.revisitStart, v.revisitEnd)}</span>
                          )}
                        </div>
                        {v.revisitNote && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 whitespace-pre-wrap">{v.revisitNote}</p>}
                      </div>
                    )}
                    {/* 契約/見積DL */}
                    {(v.salesContract || v.estimate) && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                        {v.salesContract?.hasPdf && (
                          <button type="button" onClick={() => setPdfPreview({ title: '売買契約書PDF', url: pdfUrl('contract', v.id, 'sale') })} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">売買契約書PDF</button>
                        )}
                        {v.salesContract?.hasInvoicePdf && (
                          <button type="button" onClick={() => setPdfPreview({ title: '請求書PDF', url: pdfUrl('contract', v.id, 'invoice') })} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">請求書PDF</button>
                        )}
                        {v.estimate?.hasPdf && (
                          <button type="button" onClick={() => setPdfPreview({ title: '買取見積PDF', url: pdfUrl('estimate', v.id, 'sale') })} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">買取見積PDF</button>
                        )}
                        {v.estimate?.hasInvoicePdf && (
                          <button type="button" onClick={() => setPdfPreview({ title: '請求見積PDF', url: pdfUrl('estimate', v.id, 'invoice') })} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">請求見積PDF</button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            </Section>

            {/* 訪問時の作業レーンの入口。Step1〜4 がこの順に並ぶことを明示する */}
            <div className="rounded-xl border border-[var(--step-accent)] bg-[var(--step-surface)] px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full" style={{ background: 'var(--step-accent)', color: 'var(--step-on-badge)' }}>
                  訪問時の作業
                </span>
                <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                  STEP 1 事前同意 → 2 買取品目 → 3 請求項目 → 4 書類を作成
                </span>
              </div>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1.5">
                色帯の付いた4つのセクションが、お客様のお宅で上から順に操作する項目です。
                その下のセクション（売買契約書・見積／紙の売買契約書／会話の録音）は、作業の結果が残る記録です。
              </p>
              {contractIssued && (
                <p className="text-[11px] font-medium mt-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--status-completed-bg)', color: 'var(--status-completed-text)' }}>
                  売買契約書が発行済みです。STEP 1〜3（事前同意・買取品目・請求項目）は確定したため編集できません。
                </p>
              )}
            </div>

            {/* R2 事前同意（見出し行に状態と操作を収めて1行に圧縮） */}
            <Section
              step={1}
              tone="work"
              title="事前同意"
              badge={
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: deal.hasPreConsent ? 'var(--status-completed-bg)' : 'var(--status-pending-bg)',
                    color: deal.hasPreConsent ? 'var(--status-completed-text)' : 'var(--status-pending-text)',
                  }}
                >
                  {deal.hasPreConsent ? `取得済み ${fmtDateTime(deal.preConsentAt)}` : '未取得'}
                </span>
              }
              actions={workEditable ? (
                <>
                  <Button variant="outlined" size="sm" onClick={() => { setConsentDraft(null); setShowConsentModal(true) }}>
                    {deal.hasPreConsent ? '署名し直す' : '署名して同意取得'}
                  </Button>
                  {deal.hasPreConsent && (
                    <Button variant="text" size="sm" onClick={() => savePreConsent(null)} loading={savingConsent} disabled={savingConsent}>クリア</Button>
                  )}
                </>
              ) : undefined}
              bodyClassName="pb-2 sm:pb-2.5"
            >
              <span className="block" />
            </Section>

            {/* R3 買取品目 */}
            <Section
              step={2}
              tone="work"
              title="買取品目"
              meta={`${purchaseItems.length}件`}
              actions={
              <div className="text-right">
                <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">合計 {formatYen(totalPurchase)}</span>
                {upliftPct > 0 && (
                  <div className="text-[11px] text-[var(--portal-primary)]">（買取 {formatYen(basePurchase)} ＋{upliftPct}%上乗せ {formatYen(upliftAmount)}）</div>
                )}
              </div>
              }
            >
            {/* 買取金額の上乗せ（10%/15%・排他トグル） */}
            {workEditable && (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">買取金額の上乗せ:</span>
                {[10, 15].map(pct => {
                  const active = upliftPct === pct
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => saveUplift(pct)}
                      disabled={savingUplift}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${active ? 'bg-[var(--portal-primary)] text-white border-[var(--portal-primary)]' : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'}`}
                    >
                      {pct}%UP{active ? ' ✓' : ''}
                    </button>
                  )
                })}
                {upliftPct > 0 && (
                  <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">（同じボタンをもう一度押すと解除）</span>
                )}
              </div>
            )}

            <PurchaseItemManager
              parentType="deal"
              parentId={deal.id}
              items={purchaseItems}
              categories={categories}
              editable={editable}
              frozen={contractIssued}
              onChanged={load}
              onMessage={setMsg}
            />
            </Section>

            {/* R4 請求項目＋お支払い金額 */}
            <Section
              step={3}
              tone="work"
              title="請求項目"
              meta={`${workItems.length}件`}
              actions={workEditable ? <Button size="sm" variant="outlined" onClick={() => setShowAddWork(true)}>＋ 追加</Button> : undefined}
            >
            {workItems.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">請求項目はありません</p>
            ) : (
              <div className="space-y-1.5">
                {workItems.map(wi => (
                  <div key={wi.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-[var(--md-sys-color-outline-variant)] last:border-0">
                    <div className="min-w-0">
                      <div className="text-[var(--md-sys-color-on-surface)] truncate">{wi.workName}</div>
                      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{formatYen(wi.unitPrice)} ・ ×{wi.quantity}</div>
                      {wi.notes && <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] whitespace-pre-wrap break-words">備考: {wi.notes}</div>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-medium text-[var(--md-sys-color-on-surface)]">{formatYen(wi.unitPrice * wi.quantity)}</span>
                      {workEditable && <button type="button" onClick={() => deleteItem('work', wi.id)} disabled={deletingItemId === wi.id} className="text-[11px] text-[var(--md-sys-color-error,#B3261E)] hover:underline disabled:opacity-50">削除</button>}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                  <span>合計請求金額</span><span>{formatYen(totalBilling)}</span>
                </div>
              </div>
            )}
              {billingMismatch && (
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1 text-right">
                  明細合計 {formatYen(billingItemsTotal)}（案件に保存された請求金額と差があります）
                </p>
              )}
              {/* お支払い金額（買取−請求）。従来は契約プレビュー内にしか無かった */}
              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
                <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">お支払い金額</span>
                <span className="text-right">
                  <span className="text-base font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">{formatYen(Math.abs(paymentDiff))}</span>
                  <span className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    {paymentDiff >= 0 ? 'お客様へお支払い（買取−請求）' : 'お客様からお受け取り（請求−買取）'}
                  </span>
                </span>
              </div>
            </Section>

            {/* R5 書類を作成（主役は下部の追従バー。ここは対象訪問の明示と説明を担う） */}
            {editable && (
              <Section step={4} tone="work" title="書類を作成">
                {targetVisitId ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="text" onClick={goEstimate}>見積書を{dealEstimate ? '再' : ''}作成</Button>
                      <Button size="sm" variant="outlined" onClick={goAgreement}>売買契約書を{dealContract ? '再' : ''}作成</Button>
                    </div>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-2">
                      対象訪問: {fmtDate(deal.visitSchedules[0].visitDate)}
                      {deal.visitSchedules[0].staffName ? `（担当 ${deal.visitSchedules[0].staffName}）` : ''}
                      ／ この案件の買取品目・請求項目をもとに、署名・同意のうえ書類を作成します。
                    </p>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">書類作成には訪問が必要です。</p>
                    {/* Button は title を受け取らないので span で包む */}
                    <span title={!deal.store ? '店舗未割当のため追加できません' : undefined}>
                      <Button size="sm" variant="outlined" onClick={() => setShowAddVisit(true)} disabled={!deal.store}>
                        ＋ 訪問を追加
                      </Button>
                    </span>
                  </div>
                )}
              </Section>
            )}

            {/* R6 売買契約書・見積 */}
            <Section
              tone="record"
              title="売買契約書・見積"
              meta={`見積 ${dealEstimate ? 1 : 0} / 契約 ${dealContract ? 1 : 0}`}
            >
            {!dealContract && !dealEstimate ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">作成された書類はありません</p>
            ) : (
              <div className="space-y-3">
                {dealContract && (
                  <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] p-3">
                    <div className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">売買契約書・請求書</div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">締結: {fmtDateTime(dealContract.agreedAt)}</div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      メール: {dealContract.emailSentAt ? `${fmtDateTime(dealContract.emailSentAt)}（${dealContract.customerEmail ?? '-'}）` : '未送信'}
                    </div>
                    {contractVisitId && (dealContract.hasPdf || dealContract.hasInvoicePdf) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {dealContract.hasPdf && <button type="button" onClick={() => setPdfPreview({ title: '売買契約書PDF', url: pdfUrl('contract', contractVisitId, 'sale') })} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">売買契約書PDF</button>}
                        {dealContract.hasInvoicePdf && <button type="button" onClick={() => setPdfPreview({ title: '請求書PDF', url: pdfUrl('contract', contractVisitId, 'invoice') })} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">請求書PDF</button>}
                      </div>
                    )}
                    {/* 契約が発行済み＝古物台帳の記載対象。店舗ポータルから台帳の該当項目へ飛べるようにする */}
                    {!isAdmin && (
                      <Link href={`/store/kobutsu-ledger/${dealContract.id}`} className="inline-block text-[11px] mt-2 text-[var(--portal-primary,#374151)] hover:underline">
                        古物台帳の記載を見る →
                      </Link>
                    )}
                  </div>
                )}
                {dealEstimate && (
                  <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] p-3">
                    <div className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">見積</div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      有効期限: {fmtDate(dealEstimate.validUntil)} ・ 買取 {formatYen(dealEstimate.purchaseAmount)} / 請求 {formatYen(dealEstimate.billingAmount)}
                    </div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      メール: {dealEstimate.emailSentAt ? `${fmtDateTime(dealEstimate.emailSentAt)}（${dealEstimate.customerEmail ?? '-'}）` : '未送信'}
                    </div>
                    {estimateVisitId && (dealEstimate.hasPdf || dealEstimate.hasInvoicePdf) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {dealEstimate.hasPdf && <button type="button" onClick={() => setPdfPreview({ title: '買取見積PDF', url: pdfUrl('estimate', estimateVisitId, 'sale') })} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">買取見積PDF</button>}
                        {dealEstimate.hasInvoicePdf && <button type="button" onClick={() => setPdfPreview({ title: '請求見積PDF', url: pdfUrl('estimate', estimateVisitId, 'invoice') })} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">請求見積PDF</button>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            </Section>

            {/* R7 古物台帳 */}
            {dealContract && (
              <Section
                title="古物台帳"
                meta={ledger ? `${ledger.itemCount}品目` : undefined}
                badge={ledgerMissingCount > 0 ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending-text)' }}>
                    記載不足あり
                  </span>
                ) : undefined}
                collapsible
                defaultOpen={initialOpen('ledger', ledgerMissingCount > 0, !!ledger)}
                actions={!isAdmin ? (
              <Link href={`/store/kobutsu-ledger/${dealContract.id}`} className="text-xs text-[var(--portal-primary,#374151)] hover:underline whitespace-nowrap">
                台帳詳細を開く →
              </Link>
                ) : undefined}
              >
              {ledgerLoading && !ledger ? (
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">読み込み中...</p>
              ) : !ledger ? (
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                  この案件に台帳の対象となる買取品目がありません（買取品目を登録すると台帳に記載されます）。
                </p>
              ) : (
                <>
                  {ledger.missing.length > 0 && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 px-3 py-2 mb-3 text-[11px] text-amber-800 dark:text-amber-200">
                      法定記載事項に不足があります: {ledger.missing.map(m => KOBUTSU_MISSING_LABEL[m]).join('・')}
                      {!isAdmin && '（品目・特徴は台帳詳細から、住所・職業・年齢・確認方法は顧客情報から補えます）'}
                    </div>
                  )}

                  {/* 台帳の見出し（帳簿の様式順） */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                    <Row label="取引年月日" value={fmtDate(ledger.tradedAt)} />
                    <Row label="区別" value={ledger.tradeType} />
                    <Row
                      label="品目"
                      value={[
                        ...ledger.categories.map(c => KOBUTSU_CATEGORY_LABEL[c]),
                        ...(ledger.hasUnsetCategory ? ['未設定'] : []),
                      ].join('・') || '—'}
                    />
                    <Row label="合計" value={`${ledger.itemCount}品目 / ${ledger.quantity}点 / ${formatYen(ledger.total)}`} />
                    <Row label="相手方の氏名" value={ledger.customer.name} />
                    <Row label="相手方の住所" value={ledger.customer.address ?? '未登録'} />
                    <Row label="相手方の職業" value={ledger.customer.occupation ?? '未登録'} />
                    <Row label="相手方の生年月日" value={formatBirthDate(ledger.customer.birthDate) ?? '未登録'} />
                    <Row label="相手方の年齢" value={ledger.customer.age != null ? `${ledger.customer.age}歳` : '未登録'} />
                    <Row label="確認方法" value={ledger.customer.verification ?? '未確認'} />
                  </div>

                  {/* 明細（品目ごと） */}
                  <div className="mt-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)] overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          {['品目', '品名', '特徴', '数量', '代価'].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left font-semibold text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(ledger.rows ?? []).map(r => (
                          <tr key={r.id} className="border-t border-[var(--md-sys-color-outline-variant)] align-top">
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              {r.categoryKey ? (
                                <span className="text-[var(--md-sys-color-on-surface)]">
                                  {KOBUTSU_CATEGORY_LABEL[r.categoryKey]}
                                  {!r.categoryManual && <span className="ml-1 text-[10px] text-[var(--md-sys-color-on-surface-variant)]">推定</span>}
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400">未設定</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface)] min-w-[120px]">{r.itemName}</td>
                            <td className="px-2 py-1.5 min-w-[200px] text-[var(--md-sys-color-on-surface-variant)] break-words">
                              {r.features || <span className="text-amber-600 dark:text-amber-400">未記載</span>}
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-[var(--md-sys-color-on-surface)]">{r.quantity}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-[var(--md-sys-color-on-surface)]">{formatYen(r.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              </Section>
            )}

            {/* R8 紙の売買契約書（写真） */}
            <Section
              tone="record"
              title="紙の売買契約書（写真）"
              meta={`${deal.paperContractImages.length}枚`}
              collapsible
              defaultOpen={initialOpen('paper', deal.paperContractImages.length > 0)}
              actions={editable ? (
                // summary 内では preventDefault が入るため label 直包みだとファイル選択が開けない。
                // hidden input（本文側）を programmatic click する
                <button
                  type="button"
                  onClick={() => paperInputRef.current?.click()}
                  disabled={uploadingContract}
                  className={`text-xs px-3 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[var(--portal-primary)] hover:bg-[var(--md-sys-color-surface-container-high)] ${uploadingContract ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                >
                  {uploadingContract ? 'アップロード中...' : '＋ 写真を追加'}
                </button>
              ) : undefined}
            >
              <input ref={paperInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="hidden" onChange={handlePaperContractUpload} disabled={uploadingContract} />
            {deal.paperContractImages.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">紙で作成した売買契約書の写真はありません{editable ? '。「＋ 写真を追加」からアップロードできます。' : ''}</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {deal.paperContractImages.map((url, idx) => (
                  <div key={idx} className="relative">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img loading="lazy" decoding="async" src={`${url}?thumb=1`} alt={`紙契約書 ${idx + 1}`} className="w-24 h-24 object-cover rounded-lg border border-[var(--md-sys-color-outline-variant)]" />
                    </a>
                    {editable && (
                      <button type="button" onClick={() => deletePaperContract(idx)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--md-sys-color-error)] text-white text-xs flex items-center justify-center shadow">×</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            </Section>

            {/* R9 会話の録音・AI解析 */}
            <Section
              tone="record"
              title="会話の録音・AI解析"
              meta={`${recordings.length}件`}
              badge={recordingBusy > 0 ? (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending-text)' }}>
                  解析中 {recordingBusy}件
                </span>
              ) : undefined}
              collapsible
              defaultOpen={initialOpen('rec', false)}
              actions={
                <button
                  type="button"
                  onClick={() => recInputRef.current?.click()}
                  disabled={recUploading}
                  className={`text-xs px-3 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[var(--portal-primary)] hover:bg-[var(--md-sys-color-surface-container-high)] whitespace-nowrap ${recUploading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                >
                  {recUploading ? `アップロード中... ${recProgress}%` : '＋ 録音をアップロード'}
                </button>
              }
            >
              <input ref={recInputRef} type="file" accept="audio/*" className="hidden" onChange={handleUploadRecording} disabled={recUploading} />
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-3">
              顧客との会話は、画面右下の録音ボタンからその場でマイク録音するか、既存の音声ファイルをアップロードして登録できます（複数件登録可）。
              AIが自動で文字起こしと要約（顧客の要望・重要事項・次アクション）を作成します。解析には数分かかる場合があります。
            </p>
            {recError && <p className="text-sm text-[var(--md-sys-color-error)] mb-2">{recError}</p>}
            {recordings.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">まだ録音はありません。</p>
            ) : (
              <div className="space-y-3">
                {recordings.map(rec => {
                  const meta = rec.status === 'done' ? { label: '完了', bg: 'rgba(74,222,128,0.15)', fg: '#16a34a' }
                    : rec.status === 'processing' ? { label: 'AI解析中', bg: 'rgba(251,191,36,0.18)', fg: '#b45309' }
                    : rec.status === 'error' ? { label: '失敗', bg: 'rgba(248,113,113,0.18)', fg: '#dc2626' }
                    : { label: '解析待ち', bg: 'var(--md-sys-color-surface-container-high)', fg: 'var(--md-sys-color-on-surface-variant)' }
                  const sizeMb = rec.fileSize ? `${(rec.fileSize / 1024 / 1024).toFixed(1)}MB` : ''
                  return (
                    <div key={rec.id} className="rounded-lg border border-[var(--md-sys-color-outline-variant)] p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--md-sys-color-on-surface)] truncate">{rec.fileName || '録音音声'}</div>
                          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                            {new Date(rec.createdAt).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })}
                            {sizeMb && <span className="ml-2">{sizeMb}</span>}
                            {rec.uploadedByName && <span className="ml-2">{rec.uploadedByName}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>
                          <button type="button" onClick={() => handleDeleteRecording(rec.id)} className="text-xs text-[var(--md-sys-color-error)] hover:underline">削除</button>
                        </div>
                      </div>

                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio controls preload="none" src={rec.audioUrl} className="w-full h-9 mb-2" />

                      {(rec.status === 'pending' || rec.status === 'processing') && (
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1.5">
                          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          AIが文字起こし・要約を作成しています…
                        </p>
                      )}

                      {rec.status === 'error' && (
                        <div className="text-xs text-[var(--md-sys-color-error)]">
                          解析に失敗しました{rec.error ? `：${rec.error}` : ''}
                          <button type="button" onClick={() => handleRetryRecording(rec.id)} className="ml-2 underline text-[var(--portal-primary)]">再試行</button>
                        </div>
                      )}

                      {rec.status === 'done' && (
                        <div className="space-y-3">
                          {rec.summary && (
                            <div className="rounded-md bg-[var(--md-sys-color-surface-container)] p-3 space-y-2">
                              {rec.summary.overview && <p className="text-sm text-[var(--md-sys-color-on-surface)] leading-relaxed">{rec.summary.overview}</p>}
                              {rec.summary.requests.length > 0 && (
                                <RecList title="顧客の要望" items={rec.summary.requests} />
                              )}
                              {rec.summary.important.length > 0 && (
                                <RecList title="重要事項" items={rec.summary.important} />
                              )}
                              {rec.summary.nextActions.length > 0 && (
                                <RecList title="次のアクション" items={rec.summary.nextActions} />
                              )}
                            </div>
                          )}
                          {rec.transcript && (
                            <div>
                              <button
                                type="button"
                                onClick={() => setOpenTranscriptId(openTranscriptId === rec.id ? null : rec.id)}
                                className="text-xs text-[var(--portal-primary)] hover:underline"
                              >
                                {openTranscriptId === rec.id ? '▾ 文字起こしを隠す' : '▸ 文字起こしを表示'}
                              </button>
                              {openTranscriptId === rec.id && (
                                <pre className="mt-2 text-xs whitespace-pre-wrap leading-relaxed text-[var(--md-sys-color-on-surface)] bg-[var(--md-sys-color-surface-container)] rounded-md p-3 max-h-80 overflow-y-auto font-sans">{rec.transcript}</pre>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            </Section>
          </div>
        </div>

        {/* ── ゾーンD: 破壊的操作（管理のみ・全幅） ─────────────── */}
        {isAdmin && (
          <div className="flex justify-end pt-2">
            <Button variant="outlined" size="sm" onClick={handleDelete} loading={deleting} disabled={deleting}>
              案件を削除
            </Button>
          </div>
        )}

        {/* フローティング録音ボタン（許可ブロック時の案内パネル込み）の実高さ＋余白ぶんの空きを
             コンテンツ末尾に確保する。fixed要素はドキュメントの流れに影響しないため、これが無いと
             ページ最後のセクション（会話の録音・AI解析など）がボタン群の真裏に隠れてしまう */}
        {floatingRecHeight > 0 && <div aria-hidden style={{ height: floatingRecHeight + 24 }} />}

        {/* ── 下部追従バー（店舗ポータルのみ） ───────────────────
             fixed ではなくコンテナ最終子の sticky。mt-auto と root の flex flex-col min-h-dvh で
             訪問0件の短い案件でも画面下端に着地する。店舗モバイルは BottomNav(64px) の分を
             バー自身の下パディングで食う（BottomNav が不透明・z-40 で上に重なるので隙間ゼロ）。 */}
        {editable && (
          <div className="mt-auto sticky bottom-0 z-30 -mx-4 px-4 sm:-mx-6 sm:px-6 -mb-5 bg-[var(--md-sys-color-surface)] border-t border-[var(--md-sys-color-outline-variant)] pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">
            <div className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0 text-[11px] leading-tight text-[var(--md-sys-color-on-surface-variant)]">
                {targetVisitId ? (
                  <>
                    <span className="block truncate">
                      対象訪問 {fmtDate(deal.visitSchedules[0].visitDate)}
                      {!deal.hasPreConsent && <span className="ml-2" style={{ color: 'var(--status-pending-text)' }}>事前同意 未取得</span>}
                    </span>
                    <span className="hidden sm:block tabular-nums">
                      買取 {formatYen(totalPurchase)} ／ 請求 {formatYen(totalBilling)} ／ 差引 {formatYen(paymentDiff)}
                    </span>
                  </>
                ) : (
                  <span className="block">訪問が未登録のため書類を作成できません</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {targetVisitId ? (
                  <>
                    <Button size="sm" variant="outlined" onClick={goEstimate}>
                      <span className="sm:hidden">見積</span>
                      <span className="hidden sm:inline">見積書を{dealEstimate ? '再' : ''}作成</span>
                    </Button>
                    <Button size="sm" onClick={goAgreement}>
                      <span className="sm:hidden">契約書</span>
                      <span className="hidden sm:inline">売買契約書を{dealContract ? '再' : ''}作成</span>
                    </Button>
                  </>
                ) : (
                  <span title={!deal.store ? '店舗未割当のため追加できません' : undefined}>
                    <Button size="sm" onClick={() => setShowAddVisit(true)} disabled={!deal.store}>
                      ＋ 訪問を追加
                    </Button>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>


      {/* 発行済みPDFのプレビュー（ダウンロードはモーダル内のボタンから） */}
      <DocumentPdfPreview
        open={!!pdfPreview}
        title={pdfPreview?.title ?? ''}
        url={pdfPreview?.url ?? null}
        onClose={() => setPdfPreview(null)}
      />

      {/* 担当者候補（店舗メンバー） */}
      <datalist id="deal-staff-options">
        {members.map(m => <option key={m.id} value={m.name} />)}
      </datalist>

      {/* 契約プレビュー（顧客と買取・請求・お支払い金額を確認） */}
      <Modal open={showPreview} onClose={() => setShowPreview(false)} title="契約プレビュー" size="lg">
        <div className="space-y-4">
          <div className="rounded-lg px-3 py-2" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
            <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{deal.user.name} 様</span>
            {deal.store ? <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]"> ・ {deal.store.name}</span> : null}
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">お客様と一緒に、買取内容・請求内容・お支払い金額をご確認ください。</p>
          </div>

          {/* 買取品目 */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-2">買取品目</h3>
            {purchaseItems.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">買取品目はありません</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--md-sys-color-outline-variant)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
                      <th className="text-left px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">品名</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">数量</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">単価</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseItems.map(it => (
                      <tr key={it.id} className="border-b border-[var(--md-sys-color-outline-variant)]/50 last:border-0">
                        <td className="px-2 py-1.5 text-[var(--md-sys-color-on-surface)]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{it.itemName}</span>
                            {it.isAdditionalRequest && <span className="text-[9px] px-1 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">追加依頼品</span>}
                            <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{it.category}</span>
                          </div>
                          {it.notes && <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] whitespace-pre-wrap break-words">備考: {it.notes}</div>}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{it.quantity}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{formatYen(it.purchasePrice)}</td>
                        <td className="px-2 py-1.5 text-right font-medium text-[var(--md-sys-color-on-surface)]">{formatYen(it.purchasePrice * it.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {upliftPct > 0 && (
                      <>
                        <tr>
                          <td colSpan={3} className="px-2 py-1 text-right text-[var(--md-sys-color-on-surface-variant)]">小計</td>
                          <td className="px-2 py-1 text-right text-[var(--md-sys-color-on-surface)]">{formatYen(basePurchase)}</td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="px-2 py-1 text-right text-[var(--portal-primary)]">買取金額 {upliftPct}%上乗せ</td>
                          <td className="px-2 py-1 text-right text-[var(--portal-primary)]">＋{formatYen(upliftAmount)}</td>
                        </tr>
                      </>
                    )}
                    <tr className="bg-[var(--md-sys-color-surface-container-low)]">
                      <td colSpan={3} className="px-2 py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">買取合計</td>
                      <td className="px-2 py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">{formatYen(totalPurchase)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* 請求項目 */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-2">請求項目</h3>
            {workItems.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">請求項目はありません</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--md-sys-color-outline-variant)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
                      <th className="text-left px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">作業名</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">数量</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">単価</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workItems.map(wi => (
                      <tr key={wi.id} className="border-b border-[var(--md-sys-color-outline-variant)]/50 last:border-0">
                        <td className="px-2 py-1.5 text-[var(--md-sys-color-on-surface)]">
                          <div>{wi.workName}</div>
                          {wi.notes && <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] whitespace-pre-wrap break-words">備考: {wi.notes}</div>}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{wi.quantity}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{formatYen(wi.unitPrice)}</td>
                        <td className="px-2 py-1.5 text-right font-medium text-[var(--md-sys-color-on-surface)]">{formatYen(wi.unitPrice * wi.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[var(--md-sys-color-surface-container-low)]">
                      <td colSpan={3} className="px-2 py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">請求合計</td>
                      <td className="px-2 py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">{formatYen(totalBilling)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* お支払い金額 */}
          <div className="rounded-xl p-4 border border-[var(--portal-primary,#374151)]/30" style={{ background: 'var(--md-sys-color-surface-container-low)' }}>
            <div className="space-y-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              <div className="flex justify-between"><span>買取合計</span><span>{formatYen(totalPurchase)}</span></div>
              <div className="flex justify-between"><span>請求合計</span><span>− {formatYen(totalBilling)}</span></div>
            </div>
            <div className="mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)] flex justify-between items-center">
              <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">お支払い金額</span>
              <span className="text-xl font-bold text-[var(--portal-primary,#374151)]">{formatYen(totalPurchase - totalBilling)}</span>
            </div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
              お支払い金額 = 買取合計 − 請求合計
              {totalPurchase - totalBilling < 0 && '（マイナスの場合はお客様からのお支払いとなります）'}
            </p>
          </div>

          <div className="flex justify-end pt-1">
            <Button variant="text" onClick={() => setShowPreview(false)}>閉じる</Button>
          </div>
        </div>
      </Modal>

      {/* この案件に訪問を追加 */}
      <Modal open={showAddVisit} onClose={() => setShowAddVisit(false)} title="この案件に訪問を追加" size="md">
        <div className="space-y-4">
          <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
            <span className="font-semibold">{deal.user.name}</span>{deal.store ? ` ・ ${deal.store.name}` : ''}
          </div>
          <TextField
            label="訪問日"
            type="date"
            value={addVisit.visitDate}
            onChange={v => setAddVisit(prev => ({ ...prev, visitDate: v }))}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label="開始時間（任意）" value={addVisit.startTime} onChange={v => setAddVisit(prev => ({ ...prev, startTime: v }))} />
            <TimeSelect label="終了時間（任意）" value={addVisit.endTime} onChange={v => setAddVisit(prev => ({ ...prev, endTime: v }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">担当者（任意）</label>
            <input
              list="deal-staff-options"
              value={addVisit.staffName}
              onChange={e => setAddVisit(prev => ({ ...prev, staffName: e.target.value }))}
              placeholder="担当者名を選択または入力"
              className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
            />
          </div>
          <TextField
            label="メモ（任意）"
            value={addVisit.note}
            onChange={v => setAddVisit(prev => ({ ...prev, note: v }))}
            placeholder="訪問に関するメモ..."
            rows={3}
          />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outlined" type="button" onClick={() => setShowAddVisit(false)}>キャンセル</Button>
            <Button onClick={handleAddVisit} loading={addingVisit} disabled={addingVisit || !addVisit.visitDate}>
              訪問を追加
            </Button>
          </div>
        </div>
      </Modal>

      {/* 訪問日時の変更（リスケジュール） */}
      <Modal open={!!rescheduleTarget} onClose={() => setRescheduleTarget(null)} title="訪問日時を変更" size="md">
        {rescheduleTarget && (
          <div className="space-y-4">
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
              現在: {fmtDate(rescheduleTarget.visitDate)}{timeRange(rescheduleTarget.startTime, rescheduleTarget.endTime) ? ` ${timeRange(rescheduleTarget.startTime, rescheduleTarget.endTime)}` : ''}
            </div>
            <TextField
              label="訪問日"
              type="date"
              value={rescheduleForm.visitDate}
              onChange={v => setRescheduleForm(prev => ({ ...prev, visitDate: v }))}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <TimeSelect label="開始時間（任意）" value={rescheduleForm.startTime} onChange={v => setRescheduleForm(prev => ({ ...prev, startTime: v }))} />
              <TimeSelect label="終了時間（任意）" value={rescheduleForm.endTime} onChange={v => setRescheduleForm(prev => ({ ...prev, endTime: v }))} />
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              連携済みのGoogleカレンダーの予定も、変更後の日時に更新されます。
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outlined" type="button" onClick={() => setRescheduleTarget(null)} disabled={savingReschedule}>キャンセル</Button>
              <Button onClick={handleReschedule} loading={savingReschedule} disabled={savingReschedule || !rescheduleForm.visitDate}>
                変更を保存
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 請求項目を追加 */}
      <Modal open={showAddWork} onClose={() => setShowAddWork(false)} title="請求項目を追加" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">作業名 <span className="text-[var(--md-sys-color-error)]">*</span></label>
            <select
              className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-2 py-2.5 bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)]"
              value={workForm.masterId}
              onChange={e => selectWorkMaster(e.target.value)}
            >
              <option value="">請求項目を選択</option>
              {workMasters.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {workMasters.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--md-sys-color-error)]">
                選択できる請求項目がありません。管理ポータルの「設定 → 請求項目マスタ」で登録してください。
              </p>
            ) : (
              workForm.masterId && workMasters.find(m => m.id === workForm.masterId)?.notes && (
                <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {workMasters.find(m => m.id === workForm.masterId)!.notes}
                </p>
              )
            )}
          </div>
          {selectedWorkMaster && selectedWorkMaster.options.length > 0 && (
            <div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">
                該当する項目にチェック（備考に入ります）
              </p>
              <div className="space-y-1">
                {selectedWorkMaster.options.map(option => (
                  <label key={option.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={workForm.optionIds.includes(option.id)}
                      onChange={() => toggleWorkOption(option.id)}
                      className="w-4 h-4 accent-[var(--md-sys-color-primary)]"
                    />
                    <span className="text-sm text-[var(--md-sys-color-on-surface)]">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {selectedWorkMaster?.allowExtraStaff && (
            <TextField
              label="追加人員（人数）"
              type="number"
              value={workForm.extraStaffCount}
              onChange={v => setWorkForm(prev => ({ ...prev, extraStaffCount: v }))}
              helper="入力すると備考に「追加人員: ◯名」と入ります"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <TextField label="単価（円）" type="number" value={workForm.unitPrice} onChange={v => setWorkForm(prev => ({ ...prev, unitPrice: v }))} />
            <TextField label="数量" type="number" value={String(workForm.quantity)} onChange={v => setWorkForm(prev => ({ ...prev, quantity: Number(v) || 1 }))} />
          </div>
          <TextField label="備考（自由記入）" rows={2} value={workForm.notes} onChange={v => setWorkForm(prev => ({ ...prev, notes: v }))} helper="チェック項目・追加人員は自動で備考に入ります" />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outlined" type="button" onClick={() => setShowAddWork(false)}>キャンセル</Button>
            <Button onClick={addWorkItem} loading={savingWork} disabled={savingWork || !workForm.masterId}>追加</Button>
          </div>
        </div>
      </Modal>

      {/* 事前同意（署名） */}
      <Modal open={showConsentModal} onClose={() => setShowConsentModal(false)} title="事前同意の取得" size="md">
        <div className="space-y-4">
          {/* 同意文面（訪問詳細の事前同意と同一文面） */}
          <div className="rounded-[var(--md-sys-shape-small,8px)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-4 max-h-[40vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">弊社サービスをご利用のお客様へ</h3>
            <div className="text-sm text-[var(--md-sys-color-on-surface-variant)] space-y-3 leading-relaxed">
              <p className="indent-4">この度は、弊社高価古物買取サービスにお申込みいただき、ありがとうございます。お手数ではありますが、担当査定員がお客様のご自宅に訪問し、査定をさせていただく前に必ずご一読ください。</p>
              <p className="indent-4">法令を遵守したお取引をさせていただくために、必要な内容となっておりますのでご協力の程、よろしくお願いいたします。</p>
              <p className="indent-4">弊社コールセンター受付担当のご案内により、お客様のご自宅で買取に関する提案のご承諾をいただきました品種は下記になります。</p>
              <p className="font-semibold text-[var(--md-sys-color-on-surface)]">家電類／ブランド家具類／骨董品類／着物類／ブランド類／金券類／金／宝飾品類／酒類／車／玩具類／楽器類</p>
              <p className="indent-4">弊社ではお客様からの申し込み時に、査定員から上記品種に関する買取の提案について、ご承諾いただいております。査定員による買取の提案について、ご承諾いただけないお客様のご自宅への訪問購入は行っておりません。</p>
              <p className="indent-4">また、いただきました個人情報については、個人情報保護法に従い取り扱い、適切に管理させていただきます。</p>
            </div>
          </div>
          <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
            上記内容に同意します。下の枠内にご署名をお願いします。
          </p>
          <SignaturePad onSignatureChange={setConsentDraft} initialDataUrl={null} />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outlined" type="button" onClick={() => setShowConsentModal(false)}>キャンセル</Button>
            <Button onClick={() => savePreConsent(consentDraft)} loading={savingConsent} disabled={savingConsent || !consentDraft}>同意を保存</Button>
          </div>
        </div>
      </Modal>

      {/* マイク録音のフローティングボタン。案件詳細のどこにスクロールしていても押せるようにする。
          下部追従の書類作成バー（sticky, z-30。モバイルはさらにBottomNav分のpb-16を内包）の
          実高さぶん浮かせて重ならないようにする（モバイル: バー約117px+セーフエリア、
          デスクトップ: バー約53px）。録音中は赤く点滅させ、経過時間を表示する */}
      <div ref={setFloatingRecEl} className="fixed bottom-[calc(9rem+env(safe-area-inset-bottom,0px))] md:bottom-20 right-4 md:right-8 z-40 flex flex-col items-end gap-2">
        {/* 録音ボタンを押して実際に使えなかったときだけ出す（初期表示では出さない） */}
        {micUnsupportedMsg && (
          <div className="max-w-[240px] text-xs px-3 py-2 rounded-lg shadow-lg space-y-1.5" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending-text)' }}>
            <p>{micUnsupportedMsg}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={recheckMicPermission}
                className="text-[11px] font-semibold underline underline-offset-2"
              >
                許可状況を再確認
              </button>
              <button
                type="button"
                onClick={() => setMicUnsupportedMsg(null)}
                className="text-[11px] underline underline-offset-2 opacity-80"
              >
                閉じる
              </button>
            </div>
          </div>
        )}
        {isRecording && (
          <div className="text-xs font-medium px-3 py-1.5 rounded-full shadow-lg bg-[var(--md-sys-color-error,#B3261E)] text-white tabular-nums">
            録音中 {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
          </div>
        )}
        <button
          type="button"
          onClick={isRecording ? stopMicRecording : startMicRecording}
          disabled={recUploading}
          title={isRecording ? '録音を停止してアップロード' : '会話の録音を開始'}
          className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-colors disabled:opacity-50 ${
            isRecording ? 'bg-[var(--md-sys-color-error,#B3261E)] animate-pulse' : 'bg-[var(--portal-primary)]'
          }`}
        >
          {isRecording ? (
            <span className="w-4 h-4 rounded-sm bg-white" />
          ) : (
            <svg className="w-6 h-6" style={{ color: 'var(--portal-on-primary,#fff)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

// 録音要約の箇条書きブロック
function RecList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-0.5">{title}</p>
      <ul className="list-disc pl-4 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="text-xs text-[var(--md-sys-color-on-surface)] leading-relaxed">{it}</li>
        ))}
      </ul>
    </div>
  )
}
