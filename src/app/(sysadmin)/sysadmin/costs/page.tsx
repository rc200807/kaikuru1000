import { permanentRedirect } from 'next/navigation'

// 旧URL。「売上・コスト」ページに統合された。
export default function Page() {
  permanentRedirect('/sysadmin/finance?tab=costs')
}
