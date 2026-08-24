'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import LoadingSpinner from '@/components/LoadingSpinner'
import ReactionBar from '@/components/store/ReactionBar'
import CommentSection, { type Comment } from '@/components/store/CommentSection'
import { ANNOUNCEMENT_EMOJIS } from '@/lib/chiebukuro'
import { AnnouncementCategoryIcon } from '@/components/announcement/categoryIcons'
import { announcementTargetLabel, parseAnnouncementTargets } from '@/lib/announcement-target'

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
  announcementCategory: AnnouncementCategory | null
  publishedAt: string
  admin: { name: string }
  /** 配信対象の対応サービス（JSON配列文字列）。"[]" = 全店舗 */
  targetServices?: string | null
  reactions: { emoji: string; count: number; reacted: boolean }[]
  comments: Comment[]
}

const CATEGORIES: Record<string, { label: string; color: string }> = {
  general:  { label: '一般',         color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  important:{ label: '重要',         color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  system:   { label: 'システム',     color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  campaign: { label: 'キャンペーン', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
}

export default function StoreAnnouncementDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const markedReadRef = useRef(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated' && params.id) {
      fetch(`/api/store/announcements/${params.id}`)
        .then(r => {
          if (!r.ok) { setNotFound(true); return null }
          return r.json()
        })
        .then(data => { if (data) setAnnouncement(data) })
        .finally(() => setLoading(false))
    }
  }, [status, params.id])

  // Auto-mark as read on page load
  useEffect(() => {
    if (status === 'authenticated' && params.id && !markedReadRef.current) {
      markedReadRef.current = true
      fetch(`/api/store/announcements/${params.id}/read`, { method: 'POST' }).catch(() => {})
    }
  }, [status, params.id])

  const refreshDetail = async () => {
    const r = await fetch(`/api/store/announcements/${params.id}`)
    if (r.ok) setAnnouncement(await r.json())
  }

  const toggleReaction = async (emoji: string) => {
    await fetch(`/api/store/announcements/${params.id}/reactions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }),
    })
    refreshDetail()
  }

  const addComment = async (body: string) => {
    const r = await fetch(`/api/store/announcements/${params.id}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    })
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || '送信に失敗しました') }
    refreshDetail()
  }

  const deleteComment = async (commentId: string) => {
    await fetch(`/api/store/announcements/${params.id}/comments/${commentId}`, { method: 'DELETE' })
    refreshDetail()
  }

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  if (notFound || !announcement) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 text-center">
        <p className="text-[var(--md-sys-color-on-surface-variant)] mb-4">お知らせが見つかりません</p>
        <Link href="/store/announcements" className="text-sm text-[var(--store-primary)] hover:underline">
          一覧に戻る
        </Link>
      </div>
    )
  }

  const cat = CATEGORIES[announcement.category] || CATEGORIES.general

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* 戻るリンク */}
      <Link
        href="/store/announcements"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--store-primary)] transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        お知らせ一覧
      </Link>

      {/* 記事ヘッダー */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {/* Category badge */}
          {announcement.announcementCategory ? (
            <span
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: announcement.announcementCategory.color
                  ? `${announcement.announcementCategory.color}20`
                  : undefined,
                color: announcement.announcementCategory.color || undefined,
              }}
            >
              <AnnouncementCategoryIcon iconKey={announcement.announcementCategory.icon} className="w-3.5 h-3.5" /> {announcement.announcementCategory.name}
            </span>
          ) : (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cat.color}`}>
              {cat.label}
            </span>
          )}

          {/* Priority badge */}
          {announcement.priority === 'urgent' && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 animate-pulse">
              緊急
            </span>
          )}
          {announcement.priority === 'high' && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">
              重要
            </span>
          )}

          {/* サービス限定配信のときだけ対象を明示 */}
          {parseAnnouncementTargets(announcement.targetServices).length > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              {announcementTargetLabel(announcement.targetServices)}向け
            </span>
          )}
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--md-sys-color-on-surface)] leading-tight">
          {announcement.title}
        </h1>
        <div className="flex items-center gap-3 mt-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          <span>
            {format(new Date(announcement.publishedAt), 'yyyy年M月d日 HH:mm', { locale: ja })}
          </span>
          <span>投稿者: {announcement.admin.name}</span>
        </div>
      </div>

      {/* 区切り線 */}
      <hr className="border-[var(--md-sys-color-outline-variant)] mb-6" />

      {/* 記事本文 */}
      <article
        className="prose prose-sm dark:prose-invert max-w-none text-[var(--md-sys-color-on-surface)] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: announcement.content }}
      />

      {/* リアクション */}
      <div className="mt-8">
        <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-2">リアクション</p>
        <ReactionBar reactions={announcement.reactions} emojiSet={ANNOUNCEMENT_EMOJIS} onToggle={toggleReaction} />
      </div>

      {/* コメント */}
      <div className="mt-8 pt-6 border-t border-[var(--md-sys-color-outline-variant)]">
        <CommentSection
          comments={announcement.comments}
          onAdd={addComment}
          onDelete={deleteComment}
          placeholder="このお知らせへのコメントを入力…"
        />
      </div>

      {/* フッター */}
      <div className="mt-10 pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
        <Link
          href="/store/announcements"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--store-primary)] hover:underline"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          お知らせ一覧に戻る
        </Link>
      </div>
    </div>
  )
}
