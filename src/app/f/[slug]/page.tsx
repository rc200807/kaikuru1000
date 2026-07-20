'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FormRenderer from '@/components/forms/FormRenderer'
import { parseSchema, type FormSchema } from '@/lib/forms/types'

type PublicForm = {
  id: string
  slug: string
  title: string
  description: string | null
  schema: string
  status: string
  successMessage: string | null
  recaptchaEnabled: boolean
}

declare global {
  interface Window {
    grecaptcha?: { execute: (siteKey: string, options: { action: string }) => Promise<string>; ready: (cb: () => void) => void }
  }
}

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY

export default function PublicFormPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params.slug

  const [form, setForm] = useState<PublicForm | null>(null)
  const [schema, setSchema] = useState<FormSchema>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void load()
  }, [slug])

  useEffect(() => {
    // アクセス計測のクロスドメインリンカー（?_rctv=訪問者ID）を受け取り保持。URLからは除去する
    try {
      const url = new URL(window.location.href)
      const vk = url.searchParams.get('_rctv')
      if (vk) {
        sessionStorage.setItem('_rct_vid_sys', vk)
        url.searchParams.delete('_rctv')
        window.history.replaceState(null, '', url.toString())
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    // reCAPTCHA v3 スクリプト読み込み
    if (!form?.recaptchaEnabled || !RECAPTCHA_SITE_KEY) return
    const id = 'recaptcha-v3-script'
    if (document.getElementById(id)) return
    const s = document.createElement('script')
    s.id = id
    s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`
    s.async = true
    document.head.appendChild(s)
  }, [form?.recaptchaEnabled])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/forms/public/${slug}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? 'フォームを読み込めませんでした')
        return
      }
      const f: PublicForm = await res.json()
      setForm(f)
      setSchema(parseSchema(f.schema))
    } finally {
      setLoading(false)
    }
  }

  async function submit(values: Record<string, any>) {
    if (!form) return
    setSubmitting(true)
    try {
      let recaptchaToken: string | undefined
      if (form.recaptchaEnabled && RECAPTCHA_SITE_KEY && window.grecaptcha) {
        recaptchaToken = await new Promise<string | undefined>((resolve) => {
          window.grecaptcha!.ready(async () => {
            try {
              const t = await window.grecaptcha!.execute(RECAPTCHA_SITE_KEY!, { action: 'form_submit' })
              resolve(t)
            } catch {
              resolve(undefined)
            }
          })
        })
      }

      const res = await fetch(`/api/forms/public/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: values,
          recaptchaToken,
          trackingVisitorKey: (() => { try { return sessionStorage.getItem('_rct_vid_sys') || undefined } catch { return undefined } })(),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? '送信に失敗しました')
      }
      router.push(`/f/${slug}/thanks`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">読み込み中...</div>
  }
  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">フォームが見つかりません</h1>
          <p className="text-sm text-gray-600">{error ?? 'このフォームは公開されていません。'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{form.title}</h1>
        {form.description && <p className="text-sm text-gray-600 whitespace-pre-wrap mb-6">{form.description}</p>}
        <FormRenderer schema={schema} onSubmit={submit} submitting={submitting} />
        {form.recaptchaEnabled && RECAPTCHA_SITE_KEY && (
          <p className="mt-6 text-[10px] text-gray-400">
            このフォームは reCAPTCHA で保護されており、Googleの
            <a href="https://policies.google.com/privacy" className="underline mx-1" target="_blank" rel="noreferrer">プライバシーポリシー</a>と
            <a href="https://policies.google.com/terms" className="underline mx-1" target="_blank" rel="noreferrer">利用規約</a>が適用されます。
          </p>
        )}
      </div>
    </div>
  )
}
