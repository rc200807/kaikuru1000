'use client'

import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'

type Severity = 'success' | 'error' | 'info' | 'warning'
type ToastItem = { id: number; message: string; severity: Severity }

type ToastApi = {
  toast: (message: string, severity?: Severity) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** トースト通知を表示するフック。Provider 外でも no-op で安全に動く。 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (ctx) return ctx
  const noop = () => { /* Provider 未設置時は無視 */ }
  return { toast: noop, success: noop, error: noop, info: noop }
}

let _toastId = 0

const ACCENT: Record<Severity, string> = {
  success: '#16a34a',
  error: 'var(--md-sys-color-error)',
  info: '#0068d6',
  warning: '#c2410c',
}

function Icon({ severity }: { severity: Severity }) {
  const common = 'w-5 h-5 flex-shrink-0'
  const color = ACCENT[severity]
  if (severity === 'success') {
    return <svg className={common} style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  }
  if (severity === 'error') {
    return <svg className={common} style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
  }
  return <svg className={common} style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const remove = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id))
    const tm = timers.current[id]
    if (tm) { clearTimeout(tm); delete timers.current[id] }
  }, [])

  const push = useCallback((message: string, severity: Severity = 'success') => {
    _toastId += 1
    const id = _toastId
    setItems(prev => [...prev, { id, message, severity }])
    const ms = severity === 'error' ? 6000 : 3500
    timers.current[id] = setTimeout(() => remove(id), ms)
  }, [remove])

  const api = useMemo<ToastApi>(() => ({
    toast: push,
    success: (m: string) => push(m, 'success'),
    error: (m: string) => push(m, 'error'),
    info: (m: string) => push(m, 'info'),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed z-[60] bottom-24 md:bottom-4 right-3 left-3 sm:left-auto sm:right-4 sm:max-w-sm flex flex-col gap-2 pointer-events-none">
        {items.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto animate-toast-in rounded-xl pl-3.5 pr-2.5 py-3 flex items-start gap-2.5 bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-3)]"
            style={{ borderLeft: `3px solid ${ACCENT[t.severity]}` }}
            role="status"
          >
            <Icon severity={t.severity} />
            <span className="text-sm text-[var(--md-sys-color-on-surface)] flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              aria-label="閉じる"
              className="p-0.5 rounded text-[var(--md-sys-color-on-surface-faint)] hover:text-[var(--md-sys-color-on-surface)] transition-colors flex-shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
