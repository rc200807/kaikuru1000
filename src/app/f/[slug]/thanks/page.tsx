import { prisma } from '@/lib/prisma'
import ConversionBeacon from '@/components/tracking/ConversionBeacon'

export default async function ThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ fsid?: string }>
}) {
  const { slug } = await params
  const { fsid } = await searchParams
  const form = await prisma.form.findUnique({ where: { slug }, select: { title: true, successMessage: true, status: true } })

  const message = form?.successMessage || 'ご回答いただきありがとうございました。'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      {/* このページの表示＝フォーム完了。CVとして計測する */}
      <ConversionBeacon formSubmissionId={fsid} />
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">送信完了</h1>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{message}</p>
      </div>
    </div>
  )
}
