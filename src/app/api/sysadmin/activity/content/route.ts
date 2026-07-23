import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { sinceDays } from '@/lib/sysadmin-metrics'

export const runtime = 'nodejs'

export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const d30 = sinceDays(30)

  const [
    annTotal, annNew30d, annReads30d,
    videoTotal, videoViews30d,
    threadsTotal, threads30d, replies30d,
    questionsTotal, questions30d, answers30d, unanswered,
    releaseNotesTotal, releaseNoteReads30d,
  ] = await Promise.all([
    prisma.announcement.count(),
    prisma.announcement.count({ where: { createdAt: { gte: d30 } } }),
    prisma.announcementRead.count({ where: { readAt: { gte: d30 } } }),
    prisma.trainingVideo.count(),
    prisma.trainingVideoView.count({ where: { lastViewedAt: { gte: d30 } } }),
    prisma.communityThread.count(),
    prisma.communityThread.count({ where: { createdAt: { gte: d30 } } }),
    prisma.communityReply.count({ where: { createdAt: { gte: d30 } } }),
    prisma.question.count(),
    prisma.question.count({ where: { createdAt: { gte: d30 } } }),
    prisma.answer.count({ where: { createdAt: { gte: d30 } } }),
    prisma.question.count({ where: { answers: { none: {} } } }),
    prisma.releaseNote.count(),
    prisma.releaseNoteRead.count({ where: { readAt: { gte: d30 } } }),
  ])

  return NextResponse.json({
    announcements: { total: annTotal, new30d: annNew30d, reads30d: annReads30d },
    videos: { total: videoTotal, views30d: videoViews30d },
    community: { threadsTotal, threads30d, replies30d },
    qa: { total: questionsTotal, questions30d, answers30d, unanswered },
    releaseNotes: { total: releaseNotesTotal, reads30d: releaseNoteReads30d },
  })
}
