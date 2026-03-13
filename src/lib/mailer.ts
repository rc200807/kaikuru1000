import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'

/** DBからメール設定を読み込んでトランスポーターを生成する */
async function createTransporter() {
  const config = await prisma.emailConfig.findFirst()
  if (!config || !config.enabled || !config.smtpHost || !config.smtpUser) {
    return null
  }

  return {
    transporter: nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465, // 465はSSL、それ以外はTLS/STARTTLS
      auth: {
        user: config.smtpUser,
        pass: decrypt(config.smtpPass ?? ''), // AES-256-GCM暗号化済みを復号
      },
    }),
    from: `"${config.fromName}" <${config.fromAddress || config.smtpUser}>`,
  }
}

/** 顧客割り当て通知メールを店舗に送信する */
export async function sendAssignmentNotification(params: {
  storeEmail: string
  storeName: string
  customerName: string
  customerFurigana: string
  customerEmail: string
  customerPhone: string
  customerAddress: string
  registeredAt: Date
}) {
  const result = await createTransporter()
  if (!result) return // メール設定が未構成の場合はスキップ

  const { transporter, from } = result

  const dateStr = params.registeredAt.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>担当顧客のお知らせ</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- ヘッダー -->
          <tr>
            <td style="background-color:#991b1b;border-radius:12px 12px 0 0;padding:28px 32px;">
              <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">買いクル 本部</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:600;">担当顧客のご案内</h1>
            </td>
          </tr>

          <!-- 本文 -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
                ${params.storeName} 様<br><br>
                本部より担当顧客を割り当てましたのでご案内いたします。
                ご確認の上、出張買取の日程調整をお願いいたします。
              </p>

              <!-- 顧客情報カード -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="background-color:#1f2937;padding:12px 20px;">
                    <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;">顧客情報</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${[
                        { label: 'お名前', value: `${params.customerName}（${params.customerFurigana}）` },
                        { label: 'メールアドレス', value: params.customerEmail },
                        { label: '電話番号', value: params.customerPhone },
                        { label: '訪問先住所', value: params.customerAddress },
                        { label: '登録日', value: dateStr },
                      ].map(({ label, value }) => `
                        <tr>
                          <td style="padding:6px 0;color:#6b7280;font-size:12px;width:120px;vertical-align:top;">${label}</td>
                          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:500;vertical-align:top;">${value}</td>
                        </tr>
                      `).join('')}
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7;">
                ご不明な点がございましたら、本部までお問い合わせください。
              </p>
            </td>
          </tr>

          <!-- フッター -->
          <tr>
            <td style="background-color:#f3f4f6;border-radius:0 0 12px 12px;padding:20px 32px;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                このメールは買いクル管理システムから自動送信されています
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  await transporter.sendMail({
    from,
    to: params.storeEmail,
    subject: `【買いクル】担当顧客のご案内 - ${params.customerName} 様`,
    html,
    text: [
      `${params.storeName} 様`,
      '',
      '本部より担当顧客を割り当てましたのでご案内いたします。',
      '',
      '■ 顧客情報',
      `お名前: ${params.customerName}（${params.customerFurigana}）`,
      `メール: ${params.customerEmail}`,
      `電話: ${params.customerPhone}`,
      `住所: ${params.customerAddress}`,
      `登録日: ${dateStr}`,
      '',
      'ご確認の上、出張買取の日程調整をお願いいたします。',
    ].join('\n'),
  })
}

/** 店舗パスワード再発行通知メールを送信する。送信成功なら true、設定未構成なら false を返す */
export async function sendStorePasswordResetNotification(params: {
  storeEmail: string
  storeName: string
  newPassword: string
  loginUrl: string
}): Promise<boolean> {
  const result = await createTransporter()
  if (!result) return false // メール設定が未構成

  const { transporter, from } = result

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>パスワード再発行のお知らせ</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- ヘッダー -->
          <tr>
            <td style="background-color:#991b1b;border-radius:12px 12px 0 0;padding:28px 32px;">
              <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">買いクル 本部</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:600;">パスワード再発行のお知らせ</h1>
            </td>
          </tr>

          <!-- 本文 -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
                ${params.storeName} 様<br><br>
                管理者によりログインパスワードが再発行されました。<br>
                下記の新しいパスワードでログインしてください。
              </p>

              <!-- 新パスワードカード -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="background-color:#1f2937;padding:12px 20px;">
                    <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;">新しいログイン情報</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:12px;width:120px;vertical-align:top;">ログインURL</td>
                        <td style="padding:6px 0;vertical-align:top;">
                          <a href="${params.loginUrl}" style="color:#991b1b;font-size:13px;word-break:break-all;">${params.loginUrl}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:12px;vertical-align:top;">新しいパスワード</td>
                        <td style="padding:6px 0;vertical-align:top;">
                          <code style="background-color:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:6px 12px;font-size:16px;font-weight:700;color:#111827;letter-spacing:0.05em;">${params.newPassword}</code>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px;color:#374151;font-size:13px;line-height:1.7;">
                ログイン後は、セキュリティのためパスワードを変更することをお勧めします。
              </p>
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7;">
                このメールに心当たりのない場合は、買いクル本部までご連絡ください。
              </p>
            </td>
          </tr>

          <!-- フッター -->
          <tr>
            <td style="background-color:#f3f4f6;border-radius:0 0 12px 12px;padding:20px 32px;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                このメールは買いクル管理システムから自動送信されています
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  await transporter.sendMail({
    from,
    to: params.storeEmail,
    subject: '【買いクル】パスワード再発行のお知らせ',
    html,
    text: [
      `${params.storeName} 様`,
      '',
      '管理者によりログインパスワードが再発行されました。',
      '下記の新しいパスワードでログインしてください。',
      '',
      '■ 新しいログイン情報',
      `ログインURL: ${params.loginUrl}`,
      `新しいパスワード: ${params.newPassword}`,
      '',
      'ログイン後は、セキュリティのためパスワードを変更することをお勧めします。',
      'このメールに心当たりのない場合は、買いクル本部までご連絡ください。',
    ].join('\n'),
  })
  return true
}

/** テストメールを送信する */
export async function sendTestEmail(toEmail: string) {
  const result = await createTransporter()
  if (!result) throw new Error('メール設定が未構成または無効です')

  const { transporter, from } = result

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: '【買いクル】メール送信テスト',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
        <h2 style="color:#991b1b;margin-top:0;">テスト送信成功</h2>
        <p style="color:#374151;">買いクル管理システムのメール送信設定が正常に完了しています。</p>
        <p style="color:#6b7280;font-size:13px;">送信日時: ${new Date().toLocaleString('ja-JP')}</p>
      </div>
    `,
    text: '買いクル管理システムのメール送信テストです。この受信を確認できれば設定は完了しています。',
  })
}
