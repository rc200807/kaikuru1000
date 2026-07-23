'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { parseSchema } from '@/lib/forms/types'
import { formatAnswersForDisplay } from '@/lib/forms/buildZodFromSchema'

type Submission = {
  id: string
  formId: string
  createdAt: string
  data: string
  form: { id: string; title: string; slug: string; schema: string }
  user: { id: string; name: string } | null
}

export default function LinkPartnerInquiryDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/linkpartner/inquiries/${params.id}`)
      .then((r) => { if (r.status === 404) { setNotFound(true); return null } return r.ok ? r.json() : null })
      .then((d) => { if (d?.submission) setSubmission(d.submission) })
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="p-8 text-sm text-[#999]">読み込み中…</div>
  if (notFound || !submission) {
    return (
      <div className="p-8 text-center text-[#999]">
        <p>問い合わせが見つかりません。</p>
        <Link href="/linkpartner/inquiries" className="inline-block mt-3 px-3 py-1.5 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm">一覧へ戻る</Link>
      </div>
    )
  }

  let answers: { label: string; value: string }[] = []
  try {
    const schema = parseSchema(submission.form.schema)
    const data = JSON.parse(submission.data || '{}')
    answers = formatAnswersForDisplay(schema, data)
  } catch {
    answers = []
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <button onClick={() => router.push('/linkpartner/inquiries')} className="text-xs text-[#999] hover:text-[#ededed] mb-4">← 問い合わせ一覧</button>
      <div className="mb-4">
        <h1 className="text-lg font-bold">{submission.form.title}</h1>
        <p className="text-xs text-[#999] mt-1">受信日時: {new Date(submission.createdAt).toLocaleString('ja-JP')}</p>
        {submission.user && (
          <Link href={`/linkpartner/customers/${submission.user.id}`} className="inline-block mt-2 text-xs text-sky-400 hover:underline">
            顧客情報を見る: {submission.user.name}
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] overflow-hidden">
        {answers.length === 0 ? (
          <p className="p-4 text-sm text-[#999]">回答内容を表示できませんでした。</p>
        ) : (
          answers.map((a, i) => (
            <div key={i} className="grid grid-cols-[140px_1fr] gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.04)] last:border-0">
              <span className="text-xs text-[#999]">{a.label}</span>
              <span className="text-sm whitespace-pre-wrap break-words">{a.value || '—'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
