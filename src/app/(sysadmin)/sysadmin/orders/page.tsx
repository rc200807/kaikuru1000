import { permanentRedirect } from 'next/navigation'

// 旧URL。「発注・備品」ページに統合された。
export default function Page() {
  permanentRedirect('/sysadmin/supplies')
}
