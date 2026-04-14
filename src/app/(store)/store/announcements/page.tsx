'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'

type AnnouncementCategory = {
  id: string
  name: string
  color: string
  icon: string
}

type Announcement = {
  id: string
  title: string
  content: string
  category: string
  priority: 'normal' | 'high' | 'urgent'
  isRead: boolean
  announcementCategory: AnnouncementCategory | null
  publishedAt: string
  admin: { name: string }
}

const CATEGORIES: Record<string, { label: string; color: string; icon: string }> = {
  general:  { label: '一般',         color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',     icon: '📢' },
  important:{ label: '重要',         color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',         icon: '🔴' },
  system:   { label: 'システム',     color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300', icon: '⚙️' },
  campaign: { label: 'キャンペーン', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',  icon: '🎉' },
}

export default function StoreAnnouncementsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/store/announcements')
        .then(r => r.json())
        .then(setAnnouncements)
        .finally(() => setLoading(false))
    }
  }, [status])

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">
          本部からのお知らせ
        </h1>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
          運営本部からの最新情報をお届けします
        </p>
      </div>

      {announcements.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          }
          title="お知らせはありません"
          description="新しいお知らせが届くとここに表示されます"
        />
      ) : (
        <div className="space-y-3">
          {announcements.map(a => {
            const isNew = Date.now() - new Date(a.publishedAt).getTime() < 3 * 24 * 60 * 60 * 1000 // 3日以内

            // Category display: prefer announcementCategory, fallback to hardcoded
            const catDisplay = a.announcementCategory
              ? {
                  label: a.announcementCategory.name,
                  icon: a.announcementCategory.icon,
                  color: a.announcementCategory.color
                    ? `bg-[${a.announcementCategory.color}]/10 text-[${a.announcementCategory.color}]`
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300',
                }
              : (() => {
                  const fallback = CATEGORIES[a.category] || CATEGORIES.general
                  return { label: fallback.label, icon: fallback.icon, color: fallback.color }
                })()

            // Priority-based styles
            const priorityBorder = ''

            const priorityBg =
              a.priority === 'urgent'
                ? 'bg-red-50/50 dark:bg-red-950/20'
                : !a.isRead
                  ? 'bg-blue-50/30 dark:bg-blue-950/10'
                  : 'bg-[var(--md-sys-color-surface-container-low)]'

            return (
              <Link
                key={a.id}
                href={`/store/announcements/${a.id}`}
                className={`block px-5 py-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors group relative ${priorityBorder} ${priorityBg}`}
              >
                {/* Unread indicator dot */}
                {!a.isRead && (
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                )}

                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {/* Category badge */}
                  {a.announcementCategory ? (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: a.announcementCategory.color
                          ? `${a.announcementCategory.color}20`
                          : undefined,
                        color: a.announcementCategory.color || undefined,
                      }}
                    >
                      {a.announcementCategory.icon} {a.announcementCategory.name}
                    </span>
                  ) : (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${catDisplay.color}`}>
                      {catDisplay.label}
                    </span>
                  )}

                  {/* Priority badge */}
                  {a.priority === 'urgent' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 animate-pulse">
                      緊急
                    </span>
                  )}
                  {a.priority === 'high' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">
                      重要
                    </span>
                  )}

                  {/* NEW badge */}
                  {isNew && (
                    <span className="text-xs font-bold text-red-500 dark:text-red-400 animate-pulse">
                      NEW
                    </span>
                  )}

                  <span className="text-xs text-[var(--md-sys-color-outline)] ml-auto">
                    {format(new Date(a.publishedAt), 'yyyy年M月d日', { locale: ja })}
                  </span>
                </div>

                <h3
                  className={`text-sm group-hover:text-[var(--store-primary)] transition-colors ${
                    !a.isRead || a.priority === 'urgent' || a.priority === 'high'
                      ? 'font-bold text-[var(--md-sys-color-on-surface)]'
                      : 'font-semibold text-[var(--md-sys-color-on-surface)]'
                  }`}
                >
                  {a.title}
                </h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-1">
                  {a.content.replace(/<[^>]*>/g, '')}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
