/**
 * office@rcinc.jp の Google OAuth refresh token を取得するワンタイムスクリプト
 *
 * 使い方:
 *   node scripts/get-office-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * 1. 表示されるURLをブラウザで開き、office@rcinc.jp でログイン・承認
 * 2. リダイレクト先のURLから "code=XXXX" の部分をコピー
 * 3. このスクリプトに貼り付けてEnter → refresh_token が表示される
 */

import { createInterface } from 'readline'
import { request } from 'https'

const [,, CLIENT_ID, CLIENT_SECRET] = process.argv

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('使い方: node scripts/get-office-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>')
  process.exit(1)
}

const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', CLIENT_ID)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPE)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')

console.log('\n以下のURLをブラウザで開き、office@rcinc.jp でログイン・承認してください:\n')
console.log(authUrl.toString())
console.log('\n承認後に表示される「認証コード」を貼り付けてください:\n')

const rl = createInterface({ input: process.stdin, output: process.stdout })

rl.question('認証コード: ', async (code) => {
  rl.close()
  code = code.trim()

  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  }).toString()

  const options = {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }

  const result = await new Promise((resolve, reject) => {
    const req = request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { reject(new Error(data)) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })

  if (result.refresh_token) {
    console.log('\n✅ 成功! 以下の値を Vercel の環境変数に登録してください:\n')
    console.log(`OFFICE_GOOGLE_REFRESH_TOKEN=${result.refresh_token}`)
    console.log('\n登録後に再デプロイが必要です（Vercel → Settings → Environment Variables）\n')
  } else {
    console.error('\n❌ エラー:', JSON.stringify(result, null, 2))
  }
})
