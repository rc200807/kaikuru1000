import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { parsePhotoUrls } from '@/lib/akiya-items'
import { akiyaPlanLabel } from '@/lib/akiya-plans'
import { formatJstDateTime } from '@/lib/datetime'

// 顧客向けの空き家管理レポート（トークンURLで誰でも閲覧できる公開ページ）。
// ※GPS等の内部証跡は顧客に開示しないため、このページには一切出力しない。

export const metadata: Metadata = {
  title: '空き家管理レポート | アキクル',
  robots: { index: false, follow: false }, // トークンURLなので検索避け
}

async function getReport(token: string) {
  const record = await prisma.akiyaRecord.findUnique({
    where: { reportToken: token },
    select: {
      performedAt: true,
      staffName: true,
      reportSubmittedAt: true,
      items: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, itemName: true, photoUrls: true, note: true },
      },
      akiyaCase: {
        select: {
          propertyAddress: true,
          plan: true,
          user: { select: { name: true } },
          store: { select: { name: true, phone: true } },
        },
      },
    },
  })
  // 未提出（トークンだけ存在する状態）は公開しない
  if (!record || !record.reportSubmittedAt) return null
  return record
}

export default async function AkiyaReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const report = await getReport(token)
  if (!report) notFound()

  const { akiyaCase } = report
  const performedStr = formatJstDateTime(report.performedAt, {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <main className="min-h-screen bg-[#faf9f7] text-[#1f2937]">
      {/* ヘッダー */}
      <header className="bg-[#b45309] text-white">
        <div className="max-w-3xl mx-auto px-5 py-7">
          <p className="text-[11px] tracking-[0.15em] uppercase text-white/75">アキクル</p>
          <h1 className="mt-1.5 text-xl sm:text-2xl font-bold">空き家管理レポート</h1>
          <p className="mt-2 text-sm text-white/90">{akiyaCase.user.name} 様</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        {/* 実施概要 */}
        <section className="bg-white rounded-xl border border-[#e7e5e4] overflow-hidden">
          <dl className="divide-y divide-[#f3f4f6]">
            <div className="flex gap-4 px-5 py-3.5">
              <dt className="w-28 shrink-0 text-[13px] text-[#6b7280]">物件所在地</dt>
              <dd className="text-sm font-semibold">{akiyaCase.propertyAddress}</dd>
            </div>
            <div className="flex gap-4 px-5 py-3.5">
              <dt className="w-28 shrink-0 text-[13px] text-[#6b7280]">管理実施日時</dt>
              <dd className="text-sm">{performedStr}</dd>
            </div>
            <div className="flex gap-4 px-5 py-3.5">
              <dt className="w-28 shrink-0 text-[13px] text-[#6b7280]">プラン</dt>
              <dd className="text-sm">{akiyaPlanLabel(akiyaCase.plan)}</dd>
            </div>
            <div className="flex gap-4 px-5 py-3.5">
              <dt className="w-28 shrink-0 text-[13px] text-[#6b7280]">担当</dt>
              <dd className="text-sm">
                {akiyaCase.store.name}
                {report.staffName && report.staffName !== akiyaCase.store.name && `（${report.staffName}）`}
              </dd>
            </div>
          </dl>
        </section>

        {/* 管理項目 */}
        <section className="space-y-4">
          <h2 className="text-base font-bold px-1">管理内容</h2>
          {report.items.map((item, idx) => {
            const photos = parsePhotoUrls(item.photoUrls)
            const hasContent = photos.length > 0 || !!item.note?.trim()
            return (
              <article key={item.id} className="bg-white rounded-xl border border-[#e7e5e4] overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[#f3f4f6]">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-[#fef3c7] text-[#b45309] text-xs font-bold grid place-items-center">
                    {idx + 1}
                  </span>
                  <h3 className="text-sm font-semibold">{item.itemName}</h3>
                  {!hasContent && (
                    <span className="ml-auto text-[11px] text-[#9ca3af]">実施済み</span>
                  )}
                </div>

                {hasContent && (
                  <div className="px-5 py-4 space-y-3">
                    {photos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {photos.map((url, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                            <img
                              src={url}
                              alt={`${item.itemName} の写真 ${i + 1}`}
                              loading="lazy"
                              className="w-full aspect-[4/3] object-cover rounded-lg border border-[#e7e5e4] bg-[#f3f4f6]"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    {item.note?.trim() && (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-[#374151]">{item.note}</p>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </section>

        {/* フッター */}
        <footer className="pt-2 pb-8 text-center space-y-1.5">
          <p className="text-[13px] text-[#6b7280]">
            ご不明な点は {akiyaCase.store.name}
            {akiyaCase.store.phone && <> （<a href={`tel:${akiyaCase.store.phone}`} className="text-[#b45309] underline">{akiyaCase.store.phone}</a>）</>}
            {' '}までお問い合わせください。
          </p>
          <p className="text-[11px] text-[#9ca3af]">このページは関係者限定の共有リンクです。取り扱いにご注意ください。</p>
        </footer>
      </div>
    </main>
  )
}
