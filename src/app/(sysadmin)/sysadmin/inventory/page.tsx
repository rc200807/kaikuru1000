import { permanentRedirect } from 'next/navigation'

// 旧URL。「発注・備品」ページに統合された（備品詳細 /sysadmin/inventory/[id] は現役）。
export default function Page() {
  permanentRedirect('/sysadmin/supplies?tab=inventory')
}
