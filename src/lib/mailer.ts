import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'

/**
 * HTMLエスケープ（メール本文に動的値を差し込む際に使用）
 * 特にパスワードに & が含まれるとエンティティ解釈で値がずれてしまうため必須
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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
                          <code style="background-color:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:6px 12px;font-size:16px;font-weight:700;color:#111827;letter-spacing:0.05em;">${escapeHtml(params.newPassword)}</code>
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
                          <code style="background-color:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:6px 12px;font-size:16px;font-weight:700;color:#111827;letter-spacing:0.05em;">${escapeHtml(params.password)}</code>
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
  // 確認用に表示するご入力内容
  customerFurigana?: string
  customerPhone?: string
  customerEmail?: string | null
  customerPostalCode?: string | null
  customerAddress?: string
  customerDetails?: string | null
  // 店舗連絡先
  storePhone?: string | null
  storeEmail?: string | null
  storeAddress?: string | null
  storePostalCode?: string | null
  // 互換維持（現在は未使用）
  setupUrl?: string
  loginUrl?: string
  itemCount?: number
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

  // ご入力内容セクション（HTML）
  const inputRows: string[] = []
  const row = (label: string, value: string) => `
                <tr>
                  <td style="padding:8px 16px;color:#6b7280;font-size:12px;vertical-align:top;width:36%;border-bottom:1px solid #e5e7eb;">${escapeHtml(label)}</td>
                  <td style="padding:8px 16px;color:#111827;font-size:13px;vertical-align:top;border-bottom:1px solid #e5e7eb;">${escapeHtml(value).replace(/\n/g, '<br>')}</td>
                </tr>`
  inputRows.push(row('お名前', `${params.name}${params.customerFurigana ? `（${params.customerFurigana}）` : ''}`))
  inputRows.push(row('申込内容', typeLabel))
  if (params.customerPhone) inputRows.push(row('電話番号', params.customerPhone))
  if (params.customerEmail) inputRows.push(row('メールアドレス', params.customerEmail))
  if (params.customerPostalCode || params.customerAddress) {
    const addr = `${params.customerPostalCode ? `〒${params.customerPostalCode}\n` : ''}${params.customerAddress ?? ''}`
    inputRows.push(row('ご住所', addr))
  }
  if (params.customerDetails) inputRows.push(row('相談内容', params.customerDetails))

  const inputSection = `
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="background-color:#1f2937;padding:10px 16px;">
                    <p style="margin:0;color:#ffffff;font-size:12px;font-weight:600;">ご入力内容（ご確認）</p>
                  </td>
                </tr>
                ${inputRows.join('')}
              </table>
              <style>
                table tr:last-child td { border-bottom: 0 !important; }
              </style>
  `

  // 店舗連絡先セクション（HTML）
  const contactRows: string[] = []
  if (params.storePhone) contactRows.push(row('電話', params.storePhone))
  if (params.storeEmail) contactRows.push(row('メール', params.storeEmail))
  if (params.storePostalCode || params.storeAddress) {
    const addr = `${params.storePostalCode ? `〒${params.storePostalCode}\n` : ''}${params.storeAddress ?? ''}`
    contactRows.push(row('住所', addr))
  }
  const contactSection = contactRows.length > 0 ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="background-color:#1f2937;padding:10px 16px;">
                    <p style="margin:0;color:#ffffff;font-size:12px;font-weight:600;">${escapeHtml(params.storeName)} 連絡先</p>
                  </td>
                </tr>
                ${contactRows.join('')}
              </table>
  ` : ''

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
              <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">買いクル ${escapeHtml(params.storeName)}</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:600;">お問い合わせありがとうございます</h1>
            </td>
          </tr>

          <!-- 本文 -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
                ${escapeHtml(params.name)} 様<br><br>
                このたびは ${escapeHtml(params.storeName)} へお問い合わせいただき、誠にありがとうございます。<br>
                <strong>「${escapeHtml(typeLabel)}」</strong>のお問い合わせを承りました。<br>
                担当者より改めてご連絡いたしますので、しばらくお待ちください。
              </p>

              ${inputSection}
              ${contactSection}

              <p style="margin:0 0 16px;color:#6b7280;font-size:13px;line-height:1.7;">
                ご不明な点がございましたら、${escapeHtml(params.storeName)}までお気軽にお問い合わせください。
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border-radius:10px;border:1px solid #fcd34d;overflow:hidden;margin-top:8px;">
                <tr>
                  <td style="padding:12px 16px;">
                    <p style="margin:0;color:#92400e;font-size:12px;line-height:1.6;">
                      ⚠ このメールは送信専用アドレスから自動送信されています。<br>
                      このメールに直接ご返信いただいても受付できませんのでご了承ください。
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

  // テキスト版
  const inputLines: string[] = ['■ ご入力内容（ご確認）',
    `お名前: ${params.name}${params.customerFurigana ? `（${params.customerFurigana}）` : ''}`,
    `申込内容: ${typeLabel}`,
  ]
  if (params.customerPhone) inputLines.push(`電話番号: ${params.customerPhone}`)
  if (params.customerEmail) inputLines.push(`メールアドレス: ${params.customerEmail}`)
  if (params.customerPostalCode || params.customerAddress) {
    inputLines.push(`ご住所: ${params.customerPostalCode ? `〒${params.customerPostalCode} ` : ''}${params.customerAddress ?? ''}`)
  }
  if (params.customerDetails) inputLines.push(`相談内容: ${params.customerDetails}`)

  const contactLines: string[] = []
  if (params.storePhone || params.storeEmail || params.storeAddress) {
    contactLines.push('', `■ ${params.storeName} 連絡先`)
    if (params.storePhone) contactLines.push(`電話: ${params.storePhone}`)
    if (params.storeEmail) contactLines.push(`メール: ${params.storeEmail}`)
    if (params.storePostalCode || params.storeAddress) {
      contactLines.push(`住所: ${params.storePostalCode ? `〒${params.storePostalCode} ` : ''}${params.storeAddress ?? ''}`)
    }
  }

  await transporter.sendMail({
    from,
    to: params.to,
    subject: '【買いクル】お問い合わせありがとうございます',
    html,
    text: [
      `${params.name} 様`,
      '',
      `このたびは ${params.storeName} へお問い合わせいただき、誠にありがとうございます。`,
      `「${typeLabel}」のお問い合わせを承りました。`,
      '担当者より改めてご連絡いたしますので、しばらくお待ちください。',
      '',
      ...inputLines,
      ...contactLines,
      '',
      `ご不明な点がございましたら、${params.storeName}までお気軽にお問い合わせください。`,
      '',
      '※ このメールは送信専用アドレスから自動送信されています。直接ご返信いただいても受付できませんのでご了承ください。',
    ].join('\n'),
  })
  return true
}

/**
 * 店舗専用問い合わせフォームから問い合わせが入った時、店舗に通知メールを送信する
 */
export async function sendStoreInquiryNotification(params: {
  storeEmail: string
  storeName: string
  isFallbackRecipient?: boolean  // 店舗にメール未登録のため本部宛に送付された場合 true
  customerName: string
  customerFurigana: string
  customerPhone: string
  customerEmail: string | null
  customerPostalCode: string | null
  customerAddress: string
  inquiryType: string
  details: string | null
  itemCount: number
  inquiryAdminUrl: string  // /store/inquiries への遷移URL
  receivedAt: Date
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

  const dateStr = params.receivedAt.toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>新しいお問い合わせ</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- ヘッダー -->
          <tr>
            <td style="background-color:#991b1b;border-radius:12px 12px 0 0;padding:28px 32px;">
              <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">買いクル ${escape(params.storeName)}</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:600;">新しいお問い合わせが届きました</h1>
            </td>
          </tr>

          <!-- 本文 -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              ${params.isFallbackRecipient ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:10px;border:1px solid #fca5a5;overflow:hidden;margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;color:#991b1b;font-size:13px;font-weight:600;line-height:1.6;">⚠ 本部フォールバック宛</p>
                    <p style="margin:4px 0 0;color:#7f1d1d;font-size:12px;line-height:1.6;">店舗「${escape(params.storeName)}」にメールアドレスが登録されていないため、本部宛に転送されました。店舗側で対応する場合は本部から連絡してください。</p>
                  </td>
                </tr>
              </table>
              ` : ''}
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
                ${params.isFallbackRecipient ? '買いクル本部 様' : `${escape(params.storeName)} 様`}<br><br>
                店舗専用問い合わせフォームから新しいお問い合わせを受信しました。<br>
                内容を確認の上、お客様への対応をお願いいたします。
              </p>

              <!-- 種別 -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border-radius:10px;border:1px solid #fcd34d;overflow:hidden;margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 20px;">
                    <p style="margin:0;color:#92400e;font-size:11px;font-weight:600;letter-spacing:0.05em;">申込内容</p>
                    <p style="margin:4px 0 0;color:#78350f;font-size:15px;font-weight:600;">${escape(typeLabel)}</p>
                  </td>
                </tr>
              </table>

              <!-- お客様情報カード -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="background-color:#1f2937;padding:12px 20px;">
                    <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;">お客様情報</p>
                  </td>
                </tr>
                <tr><td style="padding:12px 20px;border-bottom:1px solid #e5e7eb;"><p style="margin:0;color:#6b7280;font-size:11px;">お名前</p><p style="margin:2px 0 0;color:#111827;font-size:14px;font-weight:600;">${escape(params.customerName)}（${escape(params.customerFurigana)}）</p></td></tr>
                <tr><td style="padding:12px 20px;border-bottom:1px solid #e5e7eb;"><p style="margin:0;color:#6b7280;font-size:11px;">電話番号</p><p style="margin:2px 0 0;color:#111827;font-size:14px;"><a href="tel:${escape(params.customerPhone)}" style="color:#991b1b;text-decoration:none;">${escape(params.customerPhone)}</a></p></td></tr>
                ${params.customerEmail ? `<tr><td style="padding:12px 20px;border-bottom:1px solid #e5e7eb;"><p style="margin:0;color:#6b7280;font-size:11px;">メール</p><p style="margin:2px 0 0;color:#111827;font-size:14px;"><a href="mailto:${escape(params.customerEmail)}" style="color:#991b1b;text-decoration:none;">${escape(params.customerEmail)}</a></p></td></tr>` : ''}
                <tr><td style="padding:12px 20px;${params.itemCount > 0 ? 'border-bottom:1px solid #e5e7eb;' : ''}"><p style="margin:0;color:#6b7280;font-size:11px;">住所</p><p style="margin:2px 0 0;color:#111827;font-size:14px;">${params.customerPostalCode ? `〒${escape(params.customerPostalCode)}<br>` : ''}${escape(params.customerAddress)}</p></td></tr>
                ${params.itemCount > 0 ? `<tr><td style="padding:12px 20px;"><p style="margin:0;color:#6b7280;font-size:11px;">買取品目</p><p style="margin:2px 0 0;color:#111827;font-size:14px;font-weight:600;">${params.itemCount} 点</p></td></tr>` : ''}
              </table>

              ${params.details ? `
              <!-- 相談内容 -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="background-color:#1f2937;padding:12px 20px;">
                    <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;">相談内容</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;">
                    <p style="margin:0;color:#374151;font-size:13px;line-height:1.7;white-space:pre-wrap;">${escape(params.details)}</p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- アクションボタン -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td align="center">
                    <a href="${params.inquiryAdminUrl}" style="display:inline-block;background-color:#991b1b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;">
                      問い合わせ詳細を確認
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.7;text-align:center;">
                受信日時: ${dateStr}
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
    subject: `${params.isFallbackRecipient ? '【買いクル/本部宛】' : '【買いクル】'}新しいお問い合わせ - ${params.customerName} 様（${typeLabel}）${params.isFallbackRecipient ? ` ※ 店舗「${params.storeName}」未登録` : ''}`,
    html,
    text: [
      params.isFallbackRecipient
        ? `買いクル本部 様（※ 店舗「${params.storeName}」にメールアドレスが未登録のため転送）`
        : `${params.storeName} 様`,
      '',
      '店舗専用問い合わせフォームから新しいお問い合わせを受信しました。',
      `受信日時: ${dateStr}`,
      `店舗: ${params.storeName}`,
      '',
      `■ 申込内容: ${typeLabel}`,
      '',
      '■ お客様情報',
      `お名前: ${params.customerName}（${params.customerFurigana}）`,
      `電話: ${params.customerPhone}`,
      ...(params.customerEmail ? [`メール: ${params.customerEmail}`] : []),
      `住所: ${params.customerPostalCode ? `〒${params.customerPostalCode} ` : ''}${params.customerAddress}`,
      ...(params.itemCount > 0 ? [`買取品目: ${params.itemCount}点`] : []),
      '',
      ...(params.details ? ['■ 相談内容', params.details, ''] : []),
      `詳細確認: ${params.inquiryAdminUrl}`,
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

/** 担当店舗割り当て完了通知メールを顧客に送信する */
export async function sendStoreAssignmentNotification(params: {
  to: string
  name: string
  storeName: string
  customerType: string
  loginUrl: string
}): Promise<boolean> {
  const result = await createTransporter()
  if (!result) return false

  const { transporter, from } = result

  const typeLabel = params.customerType === 'delivery' ? '定期宅配' : params.customerType === 'visit' ? '定期訪問' : '通常買取'

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="background-color:#991b1b;border-radius:12px 12px 0 0;padding:28px 32px;">
          <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">買いクル</p>
          <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:600;">担当店舗が決定しました</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
            ${params.name} 様<br><br>
            お待たせいたしました。担当店舗の割り当てが完了しましたのでお知らせいたします。
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;overflow:hidden;margin-bottom:24px;">
            <tr><td style="padding:20px;text-align:center;">
              <p style="margin:0 0 4px;color:#166534;font-size:12px;font-weight:600;">担当店舗</p>
              <p style="margin:0 0 12px;color:#14532d;font-size:18px;font-weight:700;">${params.storeName}</p>
              <p style="margin:0;color:#166534;font-size:12px;">買取方法: <strong>${typeLabel}</strong></p>
            </td></tr>
          </table>

          <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
            マイページからは以下の機能がご利用いただけます：
          </p>
          <ul style="margin:0 0 24px;padding-left:20px;color:#374151;font-size:13px;line-height:2;">
            <li><strong>買取トライ</strong> — 写真からAI簡易査定</li>
            <li><strong>訪問リクエスト</strong> — 希望日時を送信して訪問予約</li>
            <li><strong>身分証明書の登録</strong></li>
            <li><strong>口座情報の登録</strong></li>
          </ul>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.loginUrl}" style="display:inline-block;background-color:#991b1b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;">
                マイページにログイン
              </a>
            </td></tr>
          </table>

          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.7;">
            ご不明な点がございましたら、担当店舗までお気軽にお問い合わせください。
          </p>
        </td></tr>
        <tr><td style="background-color:#f3f4f6;border-radius:0 0 12px 12px;padding:20px 32px;">
          <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
            このメールは買いクル管理システムから自動送信されています
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`

  await transporter.sendMail({
    from,
    to: params.to,
    subject: '【買いクル】担当店舗が決定しました',
    html,
    text: [
      `${params.name} 様`,
      '',
      '担当店舗の割り当てが完了しました。',
      '',
      `担当店舗: ${params.storeName}`,
      `買取方法: ${typeLabel}`,
      '',
      'マイページから身分証明書の登録や買取トライなどをお試しください。',
      `ログインURL: ${params.loginUrl}`,
    ].join('\n'),
  })
  return true
}

/** フォーム送信通知（管理者向け） */
export async function sendFormSubmissionNotification(params: {
  to: string[]
  formTitle: string
  submissionId: string
  submittedAt: Date
  fields: { label: string; value: string }[]
  reviewUrl: string
}): Promise<boolean> {
  if (!params.to || params.to.length === 0) return false
  const result = await createTransporter()
  if (!result) return false
  const { transporter, from } = result

  const dateStr = params.submittedAt.toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const escape = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const rowsHtml = params.fields.map(f => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;width:30%;font-weight:600;">${escape(f.label)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#222;white-space:pre-wrap;">${escape(f.value || '（未入力）')}</td></tr>`).join('')
  const html = `<!DOCTYPE html><html lang="ja"><body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="padding:24px 28px;background:#0a0a0a;color:#fff;"><h1 style="margin:0;font-size:18px;">フォーム回答が届きました</h1><p style="margin:6px 0 0;font-size:13px;color:#bbb;">${escape(params.formTitle)}</p></td></tr><tr><td style="padding:20px 28px;color:#333;font-size:14px;"><p style="margin:0 0 8px;color:#666;">受信日時: ${escape(dateStr)}</p><p style="margin:0 0 16px;color:#666;">回答ID: ${escape(params.submissionId)}</p><table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #eee;font-size:13px;">${rowsHtml}</table><p style="margin:24px 0 0;"><a href="${escape(params.reviewUrl)}" style="display:inline-block;background:#0a0a0a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;">管理画面で確認する</a></p></td></tr></table></td></tr></table></body></html>`

  const text = [
    `フォーム「${params.formTitle}」に回答が届きました`,
    `受信日時: ${dateStr}`,
    `回答ID: ${params.submissionId}`,
    '',
    ...params.fields.map(f => `${f.label}: ${f.value || '（未入力）'}`),
    '',
    `管理画面: ${params.reviewUrl}`,
  ].join('\n')

  await transporter.sendMail({
    from,
    to: params.to.join(','),
    subject: `【買いクル】フォーム回答: ${params.formTitle}`,
    html,
    text,
  })
  return true
}
