import { permanentRedirect } from 'next/navigation'

// 旧URL。「セキュリティ」ページに統合された。
export default function Page() {
  permanentRedirect('/sysadmin/security')
}
