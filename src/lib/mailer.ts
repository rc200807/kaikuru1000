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
                ご確認の上、定期訪問の日程調整をお願いいたします。
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
      'ご確認の上、定期訪問の日程調整をお願いいたします。',
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

/** 売買契約書PDFを顧客にメール送信する。送信成功なら true、設定未構成なら false を返す */
export async function sendContractEmail(params: {
  customerEmail: string
  customerName: string
  storeName: string
  visitDate: Date
  pdfBase64: string
}): Promise<boolean> {
  const result = await createTransporter()
  if (!result) return false

  const { transporter, from } = result

  const visitDateStr = params.visitDate.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const pdfBuffer = Buffer.from(params.pdfBase64, 'base64')

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>売買契約書のご送付</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- ヘッダー -->
          <tr>
            <td style="background-color:#991b1b;border-radius:12px 12px 0 0;padding:28px 32px;">
              <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">買いクル 定期訪問</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:600;">売買契約書のご送付</h1>
            </td>
          </tr>

          <!-- 本文 -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
                ${params.customerName} 様<br><br>
                このたびは${params.storeName}の定期訪問サービスをご利用いただき、誠にありがとうございます。<br>
                ${visitDateStr}の訪問にかかる売買契約書を添付ファイルにてお送りいたします。
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:10px;border:1px solid #fca5a5;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px;color:#991b1b;font-size:13px;font-weight:600;">クーリングオフについて</p>
                    <p style="margin:0;color:#7f1d1d;font-size:12px;line-height:1.7;">
                      本契約書面の受領日から<strong>8日以内</strong>であれば、書面によるクーリングオフ（契約解除）が可能です。<br>
                      ご不明点は消費生活センター（局番なし <strong>188</strong>）にご相談ください。
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7;">
                添付のPDFファイルを大切に保管してください。<br>
                ご不明な点がございましたら、${params.storeName}までお問い合わせください。
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
    to: params.customerEmail,
    subject: `【買いクル】売買契約書（${visitDateStr}）`,
    html,
    text: [
      `${params.customerName} 様`,
      '',
      `${params.storeName}の定期訪問サービスをご利用いただき、ありがとうございます。`,
      `${visitDateStr}の訪問にかかる売買契約書を添付ファイルにてお送りいたします。`,
      '',
      '■ クーリングオフについて',
      '本契約書面の受領日から8日以内であれば、書面によるクーリングオフが可能です。',
      'ご不明点は消費生活センター（局番なし 188）にご相談ください。',
      '',
      '添付のPDFファイルを大切に保管してください。',
    ].join('\n'),
    attachments: [
      {
        filename: `売買契約書_${visitDateStr}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  })

  return true
}

/** パスワードリセットメールを送信する。送信成功なら true、設定未構成なら false を返す */
export async function sendPasswordResetEmail(params: {
  to: string
  name: string
  resetUrl: string
  userType: 'store' | 'customer' | 'admin'
}): Promise<boolean> {
  const result = await createTransporter()
  if (!result) return false

  const { transporter, from } = result

  const portalLabel = params.userType === 'admin' ? '管理ポータル' : params.userType === 'store' ? '店舗ポータル' : '顧客マイページ'

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>パスワードリセットのご案内</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- ヘッダー -->
          <tr>
            <td style="background-color:#991b1b;border-radius:12px 12px 0 0;padding:28px 32px;">
              <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">買いクル ${portalLabel}</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:600;">パスワードリセットのご案内</h1>
            </td>
          </tr>

          <!-- 本文 -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
                ${params.name} 様<br><br>
                パスワードリセットのリクエストを受け付けました。<br>
                下記のボタンをクリックして、新しいパスワードを設定してください。
              </p>

              <!-- リセットボタン -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${params.resetUrl}" style="display:inline-block;background-color:#991b1b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;">
                      パスワードをリセット
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px;color:#6b7280;font-size:13px;line-height:1.7;">
                ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください：
              </p>
              <p style="margin:0 0 24px;word-break:break-all;">
                <a href="${params.resetUrl}" style="color:#991b1b;font-size:12px;">${params.resetUrl}</a>
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border-radius:10px;border:1px solid #fcd34d;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#92400e;font-size:12px;line-height:1.7;">
                      このリンクは<strong>1時間</strong>で有効期限が切れます。<br>
                      このメールに心当たりのない場合は、無視していただいて問題ありません。
                    </p>
                  </td>
                </tr>
              </table>
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
    to: params.to,
    subject: '【買いクル】パスワードリセットのご案内',
    html,
    text: [
      `${params.name} 様`,
      '',
      'パスワードリセットのリクエストを受け付けました。',
      '下記のURLから新しいパスワードを設定してください。',
      '',
      `リセットURL: ${params.resetUrl}`,
      '',
      'このリンクは1時間で有効期限が切れます。',
      'このメールに心当たりのない場合は、無視していただいて問題ありません。',
    ].join('\n'),
  })
  return true
}

/** アカウント情報お知らせメール（メール登録時にパスワードを通知） */
export async function sendWelcomeWithPasswordEmail(params: {
  to: string
  name: string
  email: string
  password: string
  loginUrl: string
}): Promise<boolean> {
  const result = await createTransporter()
  if (!result) return false

  const { transporter, from } = result

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>アカウント情報のお知らせ</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- ヘッダー -->
          <tr>
            <td style="background-color:#991b1b;border-radius:12px 12px 0 0;padding:28px 32px;">
              <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">買いクル</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:600;">アカウント情報のお知らせ</h1>
            </td>
          </tr>

          <!-- 本文 -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
                ${params.name} 様<br><br>
                買いクルのアカウントが作成されました。<br>
                下記のログイン情報でマイページにアクセスできます。
              </p>

              <!-- ログイン情報カード -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="background-color:#1f2937;padding:12px 20px;">
                    <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;">ログイン情報</p>
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
                        <td style="padding:6px 0;color:#6b7280;font-size:12px;vertical-align:top;">メールアドレス</td>
                        <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:500;vertical-align:top;">${params.email}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:12px;vertical-align:top;">パスワード</td>
                        <td style="padding:6px 0;vertical-align:top;">
                          <code style="background-color:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:6px 12px;font-size:16px;font-weight:700;color:#111827;letter-spacing:0.05em;">${params.password}</code>
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
                ご不明な点がございましたら、担当店舗までお問い合わせください。
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
    to: params.to,
    subject: '【買いクル】アカウント情報のお知らせ',
    html,
    text: [
      `${params.name} 様`,
      '',
      '買いクルのアカウントが作成されました。',
      '下記のログイン情報でマイページにアクセスできます。',
      '',
      '■ ログイン情報',
      `ログインURL: ${params.loginUrl}`,
      `メールアドレス: ${params.email}`,
      `パスワード: ${params.password}`,
      '',
      'ログイン後は、セキュリティのためパスワードを変更することをお勧めします。',
      'ご不明な点がございましたら、担当店舗までお問い合わせください。',
    ].join('\n'),
  })
  return true
}

/** お問い合わせ自動返信メールを送信する */
export async function sendInquiryAutoReply(params: {
  to: string
  name: string
  storeName: string
  inquiryType: string
  isExisting: boolean
  setupUrl?: string  // 新規ユーザー用
  loginUrl?: string  // 既存ユーザー用
}): Promise<boolean> {
  const result = await createTransporter()
  if (!result) return false

  const { transporter, from } = result

  const inquiryTypeLabels: Record<string, string> = {
    assessment: '査定のお申込み',
    purchase: '買取のお申込み',
    estate: '遺品整理のご相談',
    other: 'その他のお問い合わせ',
  }
  const typeLabel = inquiryTypeLabels[params.inquiryType] || params.inquiryType

  const actionSection = params.isExisting
    ? `
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
                すでにマイページがございます。<br>
                ログインして買取トライやお取引状況をご確認ください。
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${params.loginUrl}" style="display:inline-block;background-color:#991b1b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;">
                      マイページにログイン
                    </a>
                  </td>
                </tr>
              </table>`
    : `
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
                マイページが発行されました。<br>
                下記のボタンからパスワードを設定してご利用ください。<br>
                <strong>買取トライでAI簡易査定もできます。</strong>
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${params.setupUrl}" style="display:inline-block;background-color:#991b1b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;">
                      パスワードを設定する
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;color:#6b7280;font-size:13px;line-height:1.7;">
                ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください：
              </p>
              <p style="margin:0 0 24px;word-break:break-all;">
                <a href="${params.setupUrl}" style="color:#991b1b;font-size:12px;">${params.setupUrl}</a>
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border-radius:10px;border:1px solid #fcd34d;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#92400e;font-size:12px;line-height:1.7;">
                      このリンクは<strong>7日間</strong>有効です。
                    </p>
                  </td>
                </tr>
              </table>`

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>お問い合わせありがとうございます</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- ヘッダー -->
          <tr>
            <td style="background-color:#991b1b;border-radius:12px 12px 0 0;padding:28px 32px;">
              <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">買いクル ${params.storeName}</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:600;">お問い合わせありがとうございます</h1>
            </td>
          </tr>

          <!-- 本文 -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
                ${params.name} 様<br><br>
                このたびは ${params.storeName} へお問い合わせいただき、誠にありがとうございます。<br>
                <strong>「${typeLabel}」</strong>のご依頼を承りました。<br>
                担当者より改めてご連絡いたしますので、しばらくお待ちください。
              </p>

              ${actionSection}

              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7;">
                ご不明な点がございましたら、${params.storeName}までお気軽にお問い合わせください。
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

  const actionText = params.isExisting
    ? [
        'すでにマイページがございます。',
        `ログインURL: ${params.loginUrl}`,
      ]
    : [
        'マイページが発行されました。',
        `パスワード設定URL: ${params.setupUrl}`,
        '（7日間有効）',
        '',
        '買取トライでAI簡易査定もできます。',
      ]

  await transporter.sendMail({
    from,
    to: params.to,
    subject: '【買いクル】お問い合わせありがとうございます',
    html,
    text: [
      `${params.name} 様`,
      '',
      `${params.storeName}へお問い合わせいただきありがとうございます。`,
      `「${typeLabel}」のご依頼を承りました。`,
      '担当者より改めてご連絡いたします。',
      '',
      ...actionText,
      '',
      `ご不明な点は${params.storeName}までお問い合わせください。`,
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
