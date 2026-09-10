/**
 * 案件の会話録音一覧。
 *
 * 案件詳細GET（`/api/deals/[id]`）が自分のレスポンスに畳み込むためにここへ切り出した。
 * 専用エンドポイント（`/api/deals/[id]/recordings`）は解析中の8秒ポーリングが使い続ける。
 *
 * transcript（数万文字の @db.Text）は返さない。ポーリングのたびに
 * 完了済みの本文を毎回ダウンロードし直すことになるため、
 * 有無だけを返して本文は開いたときに個別APIで取る。
 */
import { prisma } from '@/lib/prisma'

export function serializeRecording(r: any, hasTranscript: boolean) {
  let summary: unknown = null
  if (r.summary) { try { summary = JSON.parse(r.summary) } catch { summary = null } }
  return {
    id: r.id,
    fileName: r.fileName,
    mimeType: r.mimeType,
    fileSize: r.fileSize,
    durationSec: r.durationSec,
    status: r.status,
    // 本文は返さない（数万文字 × ポーリング。開いたときに [recId] の GET で取る）
    hasTranscript,
    summary,
    error: r.error,
    uploadedByName: r.uploadedByName,
    createdAt: r.createdAt,
    processedAt: r.processedAt,
    audioUrl: `/api/deals/${r.dealId}/recordings/${r.id}/audio`,
  }
}


export async function loadDealRecordings(dealId: string) {
  const recordings = await prisma.dealRecording.findMany({
    where: { dealId },
    select: {
      id: true, dealId: true, fileName: true, mimeType: true, fileSize: true, durationSec: true,
      status: true, summary: true, error: true, uploadedByName: true, createdAt: true, processedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  const withTranscript = new Set(
    (await prisma.dealRecording.findMany({
      where: { dealId, NOT: { transcript: null } }, select: { id: true },
    })).map(r => r.id),
  )
  return recordings.map(r => serializeRecording(r, withTranscript.has(r.id)))
}
