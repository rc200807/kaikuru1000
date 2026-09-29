'use client'

// 案件の会話録音（マイク録音＋音声ファイルのアップロード）を、ポータル全体で1つだけ持つ。
//
// 以前は録音ボタンが案件詳細ページ（DealDetailView）の中にあり、見積書・契約書の作成画面へ
// 遷移するとページごと破棄されて録音が止まっていた。契約書の署名まで会話を残せるように、
// 録音の状態とフローティングボタンをシェル（StoreShell / AdminShell）側に置き、
// 画面遷移しても録音を続けられるようにしている。
//
// - 録音先の案件は、案件詳細ならURLから、訪問（見積書・契約書）系の画面なら各画面が
//   useDealRecorderTarget で登録した案件IDから決める
// - 録音は何回でも開始できる（1回の録音 = DealRecording 1件。案件に対して複数件持てる）
// - 録音中はどの画面に居ても停止できる。停止するとその場でアップロードして登録する
// - アップロードに失敗した録音は端末内に保持し、再試行できる（録音を失わない）
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { upload } from '@vercel/blob/client'

const MAX_AUDIO_BYTES = 200 * 1024 * 1024

type Route =
  | { kind: 'deal'; dealId: string; portal: 'store' | 'admin' }
  | { kind: 'schedule'; scheduleId: string; flow: boolean }

/** 録音ボタンを出す画面かどうかと、その録音先の手がかりをURLから読む */
function parseRoute(pathname: string): Route | null {
  const deal = /^\/(store|admin)\/deals\/([^/]+)\/?$/.exec(pathname)
  if (deal && deal[2] !== 'new') return { kind: 'deal', dealId: deal[2], portal: deal[1] as 'store' | 'admin' }
  const schedule = /^\/store\/schedule\/([^/]+)(\/.*)?$/.exec(pathname)
  if (schedule) return { kind: 'schedule', scheduleId: schedule[1], flow: /^\/agreement/.test(schedule[2] ?? '') }
  return null
}

type RecorderContextValue = {
  isRecording: boolean
  /** アップロード中の件数 */
  uploadingCount: number
  /** 直近のアップロードの進捗（%） */
  uploadProgress: number
  /** 直近のアップロード／録音のエラーメッセージ */
  error: string | null
  clearError: () => void
  /** 録音が完了して登録されるたびに増える。案件詳細が一覧を取り直す合図 */
  uploadedTick: number
  lastUploadedDealId: string | null
  /** 現在の画面で録音できる案件ID（無ければ null） */
  currentDealId: string | null
  /** フローティングボタン（許可案内パネル込み）の高さ。案件詳細が末尾に空きを作るのに使う */
  floatingHeight: number
  /** 音声ファイルのアップロード（案件詳細の「録音をアップロード」から） */
  uploadFile: (file: File, dealId: string) => Promise<void>
}

const RecorderContext = createContext<RecorderContextValue | null>(null)
// 訪問画面が案件IDを知らせるための関数だけを別コンテキストにする。
// 値が変わらないので、録音・アップロードの状態が変わっても見積書・契約書の画面は再描画されない
// （PDF化の最中に画面が再描画されると要素が見つからず失敗することがある）
const RegisterContext = createContext<((scheduleId: string, dealId: string) => void) | null>(null)

export function useDealRecorder(): RecorderContextValue {
  const ctx = useContext(RecorderContext)
  if (!ctx) throw new Error('useDealRecorder は DealRecorderProvider の内側で使ってください')
  return ctx
}

/**
 * 訪問（見積書・契約書など）系の画面から呼ぶ。その訪問の案件IDを登録して、
 * この画面でも録音できるようにする。dealId が未取得の間は何もしない。
 */
export function useDealRecorderTarget(scheduleId: string | null | undefined, dealId: string | null | undefined) {
  const registerScheduleDeal = useContext(RegisterContext)
  if (!registerScheduleDeal) throw new Error('useDealRecorderTarget は DealRecorderProvider の内側で使ってください')
  useEffect(() => {
    if (scheduleId && dealId) registerScheduleDeal(scheduleId, dealId)
  }, [scheduleId, dealId, registerScheduleDeal])
}

type FailedUpload = { file: File; dealId: string; durationSec: number | null }

export function DealRecorderProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const route = useMemo(() => parseRoute(pathname), [pathname])

  const [scheduleDeals, setScheduleDeals] = useState<Record<string, string>>({})
  const registerScheduleDeal = useCallback((scheduleId: string, dealId: string) => {
    setScheduleDeals(prev => (prev[scheduleId] === dealId ? prev : { ...prev, [scheduleId]: dealId }))
  }, [])

  const currentDealId = route == null
    ? null
    : route.kind === 'deal' ? route.dealId : (scheduleDeals[route.scheduleId] ?? null)

  const [isRecording, setIsRecording] = useState(false)
  // 録音を始めた時刻。経過時間の表示は RecordingTimer が自分で刻む（毎秒この Provider を再描画しない）
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [micMessage, setMicMessage] = useState<string | null>(null)
  const [uploadedTick, setUploadedTick] = useState(0)
  const [lastUploadedDealId, setLastUploadedDealId] = useState<string | null>(null)
  const [failed, setFailed] = useState<FailedUpload[]>([])
  // 録音を開始した時点の案件。画面が変わっても、この案件に登録する
  const [recordingDealId, setRecordingDealId] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null)
  // ポータルを閉じる際など、録音を破棄してアップロードしない録音機
  const discardedRef = useRef(new WeakSet<MediaRecorder>())

  const [floatingEl, setFloatingEl] = useState<HTMLDivElement | null>(null)
  const [floatingHeight, setFloatingHeight] = useState(0)
  useEffect(() => {
    if (!floatingEl || typeof ResizeObserver === 'undefined') { setFloatingHeight(0); return }
    const update = () => setFloatingHeight(floatingEl.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(floatingEl)
    return () => ro.disconnect()
  }, [floatingEl])

  // ── アップロード（マイク録音・ファイル選択の共通処理） ──
  const uploadBlob = useCallback(async (file: File, dealId: string, durationSec: number | null): Promise<boolean> => {
    if (file.size > MAX_AUDIO_BYTES) {
      setError('音声ファイルは200MB以下にしてください')
      return false
    }
    setError(null)
    setUploadingCount(c => c + 1)
    setUploadProgress(0)
    try {
      const extMatch = (file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '').toLowerCase()
      const pathname = `deal-recordings/${dealId}/${Date.now()}${extMatch || '.m4a'}`
      const blob = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: `/api/deals/${dealId}/recordings/upload`,
        contentType: file.type || undefined,
        onUploadProgress: (p) => setUploadProgress(Math.round(p.percentage)),
      })
      const res = await fetch(`/api/deals/${dealId}/recordings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioUrl: blob.url, fileName: file.name, mimeType: file.type, fileSize: file.size,
          ...(durationSec != null ? { durationSec } : {}),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || '登録に失敗しました')
      }
      setLastUploadedDealId(dealId)
      setUploadedTick(t => t + 1)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました')
      return false
    } finally {
      setUploadingCount(c => Math.max(0, c - 1))
      setUploadProgress(0)
    }
  }, [])

  const uploadFile = useCallback(async (file: File, dealId: string) => {
    await uploadBlob(file, dealId, null)
  }, [uploadBlob])

  // ── マイク録音 ──
  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  const acquireWakeLock = useCallback(async () => {
    // 録音中に画面が消えるとブラウザがマイクを止めることがあるため、画面を点けたままにする（対応端末のみ）
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
      if (nav.wakeLock && !wakeLockRef.current) wakeLockRef.current = await nav.wakeLock.request('screen')
    } catch { /* 取得できなくても録音は続ける */ }
  }, [])

  /** 画面の点灯維持を止める（録音機ごとのマイクは onstop で自分の分だけ止める） */
  const stopTimers = releaseWakeLock

  const startRecording = useCallback(async () => {
    const dealId = currentDealId
    if (!dealId || recorderRef.current) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicMessage('この端末・ブラウザではマイク録音に対応していません（HTTPS接続が必要な場合があります）')
      return
    }
    setMicMessage(null)
    setError(null)
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ownStream = stream
      // ブラウザが対応する形式を優先順に試す（Safari は webm 非対応で mp4 のみ扱えることが多い）
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      const recorder = new MediaRecorder(ownStream, mimeType ? { mimeType } : undefined)
      // 録音機ごとに持つ。停止直後にすぐ次の録音を始めても、前の録音の保存と混ざらないようにする
      const chunks: Blob[] = []
      const startedAt = Date.now()
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        ownStream.getTracks().forEach(t => t.stop())
        if (discardedRef.current.has(recorder)) return
        const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
        const blobType = recorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(chunks, { type: blobType })
        if (audioBlob.size === 0) { setError('録音データが空でした。もう一度お試しください'); return }
        const ext = blobType.includes('mp4') ? '.m4a' : blobType.includes('ogg') ? '.ogg' : '.webm'
        const fileName = `録音_${new Date().toISOString().replace(/[:.]/g, '-')}${ext}`
        const file = new File([audioBlob], fileName, { type: blobType })
        const ok = await uploadBlob(file, dealId, durationSec)
        // 失敗した録音は端末内に残し、再試行できるようにする（会話は取り直せないため）
        if (!ok) setFailed(prev => [...prev, { file, dealId, durationSec }])
      }
      recorderRef.current = recorder
      setRecordingDealId(dealId)
      // 1秒ごとにデータを確定させ、長時間の録音でも途中で失われにくくする
      recorder.start(1000)
      setIsRecording(true)
      setRecordingStartedAt(startedAt)
      void acquireWakeLock()
    } catch (err: any) {
      stream?.getTracks().forEach(t => t.stop())
      recorderRef.current = null
      stopTimers()
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' || err?.name === 'SecurityError') {
        setMicMessage('マイクの使用がブロックされています。ブラウザのアドレスバー付近のサイト設定（鍵マーク等）で「マイク」を許可に変更し、再読み込みしてください。')
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setMicMessage('マイクが見つかりませんでした。端末にマイクが接続・有効になっているか確認してください')
      } else {
        setMicMessage('マイクへのアクセスに失敗しました。ブラウザの設定を確認してください')
      }
    }
  }, [currentDealId, acquireWakeLock, stopTimers, uploadBlob])

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current
    recorderRef.current = null
    if (rec && rec.state !== 'inactive') rec.stop() // 保存（アップロード）は onstop が行う
    stopTimers()
    setIsRecording(false)
    setRecordingStartedAt(null)
    setRecordingDealId(null)
  }, [stopTimers])

  // 画面が裏に回ると解放されるので、戻ってきたら取り直す
  useEffect(() => {
    if (!isRecording) return
    const onVisible = () => { if (document.visibilityState === 'visible') void acquireWakeLock() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [isRecording, acquireWakeLock])

  // 録音中・アップロード中にタブを閉じようとしたら確認する（録音が消えるため）
  useEffect(() => {
    if (!isRecording && uploadingCount === 0 && failed.length === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isRecording, uploadingCount, failed.length])

  // ポータルごと閉じる（ログアウト・別サイトへ）ときはマイクを解放する（録音は破棄）
  useEffect(() => () => {
    const rec = recorderRef.current
    recorderRef.current = null
    if (rec && rec.state !== 'inactive') {
      discardedRef.current.add(rec)
      rec.stop()
    }
    wakeLockRef.current?.release().catch(() => {})
  }, [])

  const retryFailed = useCallback(async () => {
    const queue = failed
    setFailed([])
    for (const item of queue) {
      const ok = await uploadBlob(item.file, item.dealId, item.durationSec)
      if (!ok) setFailed(prev => [...prev, item])
    }
  }, [failed, uploadBlob])

  // マイク許可の状態が設定変更で戻ったら、出していた警告を引っ込める
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return
    let status: PermissionStatus | null = null
    navigator.permissions.query({ name: 'microphone' as PermissionName }).then(s => {
      status = s
      s.onchange = () => { if (s.state !== 'denied') setMicMessage(null) }
    }).catch(() => { /* 非対応ブラウザは録音時のエラーで検知する */ })
    return () => { if (status) status.onchange = null }
  }, [])

  const recheckMicPermission = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) { setMicMessage(null); return }
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      setMicMessage(status.state === 'denied'
        ? 'まだマイクがブロックされています。ブラウザのサイト設定で「マイク」を許可にしてから、もう一度お試しください。'
        : null)
    } catch { setMicMessage(null) }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const value = useMemo<RecorderContextValue>(() => ({
    isRecording, uploadingCount, uploadProgress, error, clearError,
    uploadedTick, lastUploadedDealId, currentDealId, floatingHeight,
    uploadFile,
  }), [isRecording, uploadingCount, uploadProgress, error, clearError,
    uploadedTick, lastUploadedDealId, currentDealId, floatingHeight, uploadFile])

  // ボタンを出す条件: 録音できる画面／録音中／再試行待ちの録音がある
  const show = currentDealId != null || isRecording || failed.length > 0 || !!micMessage
  const recordingElsewhere = isRecording && recordingDealId != null && recordingDealId !== currentDealId

  // 画面ごとの置き場所。案件詳細は下部追従バー、他はボトムナビ／ページ末尾のボタンを避ける
  const positionClass = route?.kind === 'deal'
    ? 'bottom-[calc(9rem+env(safe-area-inset-bottom,0px))] md:bottom-20 right-4 md:right-8'
    : route?.kind === 'schedule' && route.flow
      ? 'bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-4 md:right-8'
      : 'bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6 right-4 md:right-8'
  const dealHref = recordingDealId
    ? `/${pathname.startsWith('/admin') ? 'admin' : 'store'}/deals/${recordingDealId}`
    : null

  return (
    <RegisterContext.Provider value={registerScheduleDeal}>
    <RecorderContext.Provider value={value}>
      {children}
      {show && (
        // data-portal: シェルの外側（画面遷移をまたいで残す位置）に描くため、ポータル配色の変数をここで与える
        <div
          ref={setFloatingEl}
          data-portal={pathname.startsWith('/admin') ? 'admin' : 'store'}
          className={`fixed z-40 flex flex-col items-end gap-2 ${positionClass}`}
        >
          {/* 録音ボタンを押して実際に使えなかったときだけ出す（初期表示では出さない） */}
          {micMessage && (
            <div className="max-w-[240px] text-xs px-3 py-2 rounded-lg shadow-lg space-y-1.5" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending-text)' }}>
              <p>{micMessage}</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={recheckMicPermission} className="text-[11px] font-semibold underline underline-offset-2">許可状況を再確認</button>
                <button type="button" onClick={() => setMicMessage(null)} className="text-[11px] underline underline-offset-2 opacity-80">閉じる</button>
              </div>
            </div>
          )}
          {/* アップロードに失敗した録音（会話は取り直せないので、再試行できるようにする） */}
          {failed.length > 0 && (
            <div className="max-w-[240px] text-xs px-3 py-2 rounded-lg shadow-lg space-y-1.5" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending-text)' }}>
              <p>録音 {failed.length}件のアップロードに失敗しました。{error ? `（${error}）` : ''}</p>
              <button type="button" onClick={retryFailed} disabled={uploadingCount > 0} className="text-[11px] font-semibold underline underline-offset-2 disabled:opacity-50">再アップロード</button>
            </div>
          )}
          {failed.length === 0 && error && (
            <div className="max-w-[240px] text-xs px-3 py-2 rounded-lg shadow-lg flex items-start gap-2" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending-text)' }}>
              <p className="flex-1">{error}</p>
              <button type="button" onClick={clearError} className="text-[11px] underline underline-offset-2 opacity-80">閉じる</button>
            </div>
          )}
          {uploadingCount > 0 && (
            <div className="text-xs font-medium px-3 py-1.5 rounded-full shadow-lg bg-[var(--md-sys-color-surface-container-highest,#333)] text-[var(--md-sys-color-on-surface,#fff)] tabular-nums">
              録音を保存中... {uploadProgress}%
            </div>
          )}
          {isRecording && (
            <div className="text-xs font-medium px-3 py-1.5 rounded-full shadow-lg bg-[var(--md-sys-color-error,#B3261E)] text-white tabular-nums">
              録音中 {recordingStartedAt != null && <RecordingTimer startedAt={recordingStartedAt} />}
              {recordingElsewhere && dealHref && (
                <Link href={dealHref} className="ml-2 underline underline-offset-2">案件へ</Link>
              )}
            </div>
          )}
          {(currentDealId != null || isRecording) && (
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              title={isRecording ? '録音を停止して保存' : '会話の録音を開始（何回でも録音できます）'}
              aria-label={isRecording ? '録音を停止して保存' : '会話の録音を開始'}
              className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-colors ${
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
          )}
        </div>
      )}
    </RecorderContext.Provider>
    </RegisterContext.Provider>
  )
}

/** 録音の経過時間（mm:ss）。自分だけが毎秒再描画される */
function RecordingTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000))
  return <>{String(Math.floor(sec / 60)).padStart(2, '0')}:{String(sec % 60).padStart(2, '0')}</>
}
