/**
 * 振込先口座の入力チェック（クライアント・サーバー共用の純ロジック）。
 *
 * ここでできるのは「形式として成立しているか」までで、**その口座が実在するかは判定できない**。
 * 口座の実在・名義一致まで確認するには金融機関の口座名義照会API（受取人名照会）との契約が必要で、
 * アプリ側だけでは全銀システムに問い合わせる手段がないため。
 * 金融機関・支店の実在だけは全銀データ（zengin-server.ts）と突き合わせて確認している。
 *
 * 注意: 'use client' を付けないこと（サーバーからも import する）
 */

export const BANK_ACCOUNT_TYPES = ['普通', '当座'] as const
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number]

export type BankAccountInput = {
  bankName?: string | null
  branchName?: string | null
  accountType?: string | null
  accountNumber?: string | null
  accountHolder?: string | null
}

export type BankAccountField = 'bankName' | 'branchName' | 'accountType' | 'accountNumber' | 'accountHolder'
export type BankAccountErrors = Partial<Record<BankAccountField, string>>

/** 口座番号の桁数（全銀フォーマット。これより短い口座は先頭をゼロ埋めして扱う） */
export const ACCOUNT_NUMBER_LENGTH = 7

const HALF_KANA_MAP: Record<string, string> = {
  'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
  'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
  'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
  'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
  'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
  'ｳﾞ': 'ヴ',
  'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
  'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
  'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
  'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
  'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
  'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
  'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
  'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
  'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
  'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
  'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
  'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ', 'ｯ': 'ッ',
  'ｰ': 'ー', '｡': '。', '､': '、', '｢': '「', '｣': '」', '･': '・',
}

/** 全角英数字・記号を半角にする */
function toHalfWidthAlnum(value: string): string {
  return value.replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
}

/** 半角カナ（濁点つきを含む）を全角カナにする */
function toFullWidthKana(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const pair = value.slice(i, i + 2)
    if (HALF_KANA_MAP[pair]) { out += HALF_KANA_MAP[pair]; i++; continue }
    out += HALF_KANA_MAP[value[i]] ?? value[i]
  }
  return out
}

/**
 * 口座番号の正規化。全角数字・ハイフン・空白を吸収して数字だけにする。
 * （桁数が足りない古い口座は振込時に先頭ゼロ埋めするので、保存時もゼロ埋めして揃える）
 */
export function normalizeAccountNumber(value: string | null | undefined): string {
  if (!value) return ''
  return toHalfWidthAlnum(String(value)).replace(/[-ー－\s]/g, '').trim()
}

/** 形式が正しい口座番号を、保存する形（7桁ゼロ埋め）に整える */
export function padAccountNumber(value: string): string {
  const digits = normalizeAccountNumber(value)
  if (!digits || !/^\d+$/.test(digits) || digits.length > ACCOUNT_NUMBER_LENGTH) return digits
  return digits.padStart(ACCOUNT_NUMBER_LENGTH, '0')
}

/**
 * 口座名義の正規化。銀行に届け出る形（全角カタカナ）に寄せる。
 * ひらがな・半角カナで入れてもそのまま通るようにするため、弾く前に変換する。
 */
export function normalizeAccountHolder(value: string | null | undefined): string {
  if (!value) return ''
  let v = toFullWidthKana(String(value))
  v = toHalfWidthAlnum(v)
  // ひらがな → カタカナ
  v = v.replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
  v = v.replace(/[a-z]/g, ch => ch.toUpperCase())
  // 全角スペースは半角に寄せ、連続スペースは1つにまとめる
  return v.replace(/[　\s]+/g, ' ').trim()
}

/** 口座名義に使える文字（カタカナ・英数字・銀行で認められる記号） */
const ACCOUNT_HOLDER_RE = /^[ァ-ヶー0-9A-Z()（）「」./\\\-  ]+$/

/** ゆうちょ銀行かどうか（記号・番号の入力間違いが多いので案内を出し分ける） */
export function isYuchoBank(bankName: string | null | undefined): boolean {
  return !!bankName && (bankName.includes('ゆうちょ') || bankName.includes('郵便貯金'))
}

/** ゆうちょ銀行の口座を入力するときの案内文 */
export const YUCHO_HINT =
  'ゆうちょ銀行は、通帳の「記号・番号」ではなく他行から振り込むときの店名・口座番号を入力してください。' +
  '（記号の2〜3桁目に「8」を付けた3桁が店名、番号の末尾1桁を除いた7桁が口座番号です。例: 記号12345・番号12345671 → 二三八(238)店・1234567）'

/**
 * 振込先口座の形式チェック。
 * 5項目すべて空のときは「未登録」として許可し、1つでも入っていれば全項目を必須にする。
 * 返り値は項目名 → エラーメッセージ（空オブジェクトなら問題なし）。
 */
export function validateBankAccount(input: BankAccountInput): BankAccountErrors {
  const bankName = (input.bankName ?? '').trim()
  const branchName = (input.branchName ?? '').trim()
  const accountType = (input.accountType ?? '').trim()
  const accountNumber = normalizeAccountNumber(input.accountNumber)
  const accountHolder = normalizeAccountHolder(input.accountHolder)

  // すべて空＝未登録（登録の取り消し）なのでエラーにしない
  if (!bankName && !branchName && !accountType && !accountNumber && !accountHolder) return {}

  const errors: BankAccountErrors = {}

  if (!bankName) errors.bankName = '銀行名を検索して選択してください'
  if (!branchName) errors.branchName = '支店名を検索して選択してください'

  if (!accountType) errors.accountType = '口座種別を選択してください'
  else if (!BANK_ACCOUNT_TYPES.includes(accountType as BankAccountType)) errors.accountType = '口座種別は普通または当座を選択してください'

  if (!accountNumber) {
    errors.accountNumber = '口座番号を入力してください'
  } else if (!/^\d+$/.test(accountNumber)) {
    errors.accountNumber = '口座番号は半角数字で入力してください（ハイフンなし）'
  } else if (accountNumber.length > ACCOUNT_NUMBER_LENGTH) {
    errors.accountNumber = isYuchoBank(bankName)
      ? `口座番号は${ACCOUNT_NUMBER_LENGTH}桁です。通帳の「番号」ではなく、他行振込用の口座番号を入力してください`
      : `口座番号は${ACCOUNT_NUMBER_LENGTH}桁以内で入力してください`
  }

  if (!accountHolder) {
    errors.accountHolder = '口座名義を入力してください'
  } else if (!ACCOUNT_HOLDER_RE.test(accountHolder)) {
    errors.accountHolder = '口座名義はカタカナで入力してください（漢字・記号の一部は使えません）'
  }

  return errors
}

/** エラーの1件目を文章にする（APIのエラーメッセージ用） */
export function firstBankAccountError(errors: BankAccountErrors): string | null {
  const order: BankAccountField[] = ['bankName', 'branchName', 'accountType', 'accountNumber', 'accountHolder']
  for (const key of order) if (errors[key]) return errors[key]!
  return null
}
