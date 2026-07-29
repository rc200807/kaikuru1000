import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 | 買いクル',
  description: 'OrderDesignStudio株式会社が提供する「買いクル」各サービスに関する、特定商取引法第11条に基づく表記です。',
  robots: { index: true, follow: true },
}

type Row = { label: string; lines: string[] }

/** 特定商取引法第11条（通信販売の広告）に基づく表示項目 */
const ROWS: Row[] = [
  {
    label: '事業者名（販売業者・役務提供事業者）',
    lines: ['OrderDesignStudio株式会社'],
  },
  {
    label: '運営統括責任者',
    lines: ['ご請求をいただいた場合、遅滞なく電磁的方法または書面にて開示いたします。'],
  },
  {
    label: '所在地',
    lines: ['〒135-0006', '東京都江東区常磐1-9-3 セブン倶楽部常磐1階'],
  },
  {
    label: '電話番号',
    lines: [
      'ご請求をいただいた場合、遅滞なく電磁的方法または書面にて開示いたします。',
      'お問い合わせは、下記のメールアドレスにて承っております。',
    ],
  },
  {
    label: 'メールアドレス',
    lines: ['office@rcinc.jp'],
  },
  {
    label: 'お問い合わせ受付時間',
    lines: [
      '平日 10:00〜18:00（土日・祝日・年末年始を除く）',
      'メールでのお問い合わせは24時間受け付けております。受付時間外にいただいたお問い合わせには、翌営業日以降に順次回答いたします。',
    ],
  },
  {
    label: 'サービス内容',
    lines: [
      '買取・不動産・空き家管理等の事業者向け業務管理システム「買いクル」の提供（クラウドサービスの利用許諾、導入・運用支援、付随する業務代行）',
      '加盟店・提携先向けの備品、販促物その他物品の販売',
    ],
  },
  {
    label: '対価（販売価格・利用料金）',
    lines: [
      'サービスごとに、お申し込み画面、見積書、請求書または個別に締結する契約書に表示する金額とします。',
      '表示価格はすべて消費税を含む金額（税込）です。',
    ],
  },
  {
    label: '対価以外に必要となる費用',
    lines: [
      'インターネット接続に必要な通信料、および通信機器等の費用はお客様のご負担となります。',
      '物品の販売については、送料および代金の支払いに要する振込手数料等をお客様にご負担いただく場合があります。詳細は各お申し込み画面または見積書に表示します。',
    ],
  },
  {
    label: 'お支払い方法',
    lines: [
      'クレジットカード決済（決済代行会社：Stripe, Inc. / Stripe Japan株式会社）',
      '銀行振込（振込手数料はお客様のご負担となります）',
    ],
  },
  {
    label: 'お支払い時期',
    lines: [
      'クレジットカード決済：お申し込み手続きの完了時、または各カード会社が定める引き落とし日にお支払いいただきます。継続利用料金の場合は、契約に定める課金日に自動的に決済いたします。',
      '銀行振込：請求書の発行日から、請求書に記載する支払期限までにお振り込みください（別途契約で定めのある場合は当該定めに従います）。',
    ],
  },
  {
    label: 'サービス・商品の提供時期',
    lines: [
      'システムの利用：お申し込み手続きおよび所定の初期設定の完了後、速やかにご利用いただけます。',
      '物品の販売：ご注文（および前払いの場合は入金）の確認後、7営業日以内に発送いたします。在庫状況その他の事情により発送が遅れる場合は、個別にご連絡いたします。',
    ],
  },
  {
    label: '返品・交換・キャンセルについて',
    lines: [
      'サービス（役務）の性質上、提供開始後のお申し込みの取り消し、および利用料金の返金には応じられません。',
      '継続利用契約の解約をご希望の場合は、契約に定める方法によりお申し出ください。解約のお申し出がない限り、契約は同一条件で更新されます。',
      '物品については、お客様のご都合による返品・交換はお受けできません。ただし、商品に不良・破損がある場合、またはご注文内容と異なる商品が届いた場合は、商品到着後7日以内に上記メールアドレスまでご連絡ください。当社の負担により、代替品との交換または返金の対応をいたします。',
      '本サービスは事業者向けのサービスであり、特定商取引法上のクーリング・オフ制度の適用対象ではありません。',
    ],
  },
  {
    label: '動作環境',
    lines: [
      'インターネットに接続されたパソコン、タブレットまたはスマートフォン。',
      '推奨ブラウザ：Google Chrome、Microsoft Edge、Safari、Firefox の各最新版。JavaScript および Cookie を有効にしてご利用ください。',
    ],
  },
  {
    label: '個人情報の取り扱い',
    lines: [
      'お客様からお預かりした個人情報は、個人情報の保護に関する法律および当社の定めるプライバシーポリシーに従い、サービスの提供および付随するご連絡の目的の範囲内で適切に取り扱います。',
    ],
  },
]

export default function TokushohoPage() {
  return (
    <div
      data-portal="store"
      className="min-h-screen py-10 px-4"
      style={{ background: 'var(--md-sys-color-surface-container-lowest, #ffffff)' }}
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.svg" alt="買いクル" className="h-7 mx-auto" />
          </Link>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-[var(--md-sys-color-on-surface)] mb-2">
          特定商取引法に基づく表記
        </h1>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-8 leading-relaxed">
          OrderDesignStudio株式会社（以下「当社」といいます。）が提供する業務管理システム「買いクル」および関連サービスについて、特定商取引法第11条に基づき以下のとおり表示します。
        </p>

        <dl className="rounded-[var(--md-sys-shape-medium,12px)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden bg-[var(--md-sys-color-surface)]">
          {ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`sm:flex ${i > 0 ? 'border-t border-[var(--md-sys-color-outline-variant)]' : ''}`}
            >
              <dt className="sm:w-64 sm:shrink-0 px-4 py-3 text-sm font-semibold text-[var(--md-sys-color-on-surface)] bg-[var(--md-sys-color-surface-container-low,#f5f5f5)]">
                {row.label}
              </dt>
              <dd className="px-4 py-3 text-sm text-[var(--md-sys-color-on-surface-variant)] leading-relaxed space-y-1.5">
                {row.lines.map((line, j) => (
                  <p key={j}>{line}</p>
                ))}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          最終更新日：2026年7月29日
        </p>

        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link
            href="/store/login"
            className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            店舗ポータル ログイン
          </Link>
          <Link
            href="/admin/login"
            className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            管理者ポータル ログイン
          </Link>
        </div>
      </div>
    </div>
  )
}
