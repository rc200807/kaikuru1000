'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Panel, Empty } from '@/components/sysadmin/ui'

type Resp = {
  announcements: { total: number; new30d: number; reads30d: number }
  videos: { total: number; views30d: number }
  community: { threadsTotal: number; threads30d: number; replies30d: number }
  qa: { total: number; questions30d: number; answers30d: number; unanswered: number }
  releaseNotes: { total: number; reads30d: number }
}

export default function ContentActivityTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sysadmin/activity/content')
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        お知らせ・研修動画・コミュニティ・知恵袋・リリースノートの利用状況
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Panel title="お知らせ">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            <Kpi label="総数" value={`${data.announcements.total} 件`} />
            <Kpi label="新規（30日）" value={`${data.announcements.new30d} 件`} />
            <Kpi label="既読（30日）" value={`${data.announcements.reads30d} 件`} />
          </div>
        </Panel>
        <Panel title="研修動画">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            <Kpi label="総数" value={`${data.videos.total} 本`} />
            <Kpi label="視聴（30日）" value={`${data.videos.views30d} 件`} />
          </div>
        </Panel>
        <Panel title="コミュニティ">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            <Kpi label="スレッド総数" value={`${data.community.threadsTotal} 件`} />
            <Kpi label="新規スレッド（30日）" value={`${data.community.threads30d} 件`} />
            <Kpi label="返信（30日）" value={`${data.community.replies30d} 件`} />
          </div>
        </Panel>
        <Panel title="知恵袋（Q&A）">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            <Kpi label="質問総数" value={`${data.qa.total} 件`} />
            <Kpi label="質問（30日）" value={`${data.qa.questions30d} 件`} />
            <Kpi label="回答（30日）" value={`${data.qa.answers30d} 件`} />
            <Kpi label="未回答" value={`${data.qa.unanswered} 件`} accent={data.qa.unanswered > 0} />
          </div>
        </Panel>
        <Panel title="リリースノート">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            <Kpi label="総数" value={`${data.releaseNotes.total} 件`} />
            <Kpi label="既読（30日）" value={`${data.releaseNotes.reads30d} 件`} />
          </div>
        </Panel>
      </div>
    </div>
  )
}
