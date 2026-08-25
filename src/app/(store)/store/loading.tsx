import PageSkeleton from '@/components/PageSkeleton'

/** ルート遷移中の骨組み（サーバーでの認証解決を待つ間、画面が固まって見えないようにする） */
export default function Loading() {
  return <PageSkeleton />
}
