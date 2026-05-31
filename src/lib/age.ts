/**
 * 身分証OCRの生年月日（idBirthDate）から年齢を扱うユーティリティ。
 * idBirthDate は原則 "YYYY-MM-DD"（和暦は西暦変換済み）だが、
 * "YYYY/MM/DD" や "YYYY年M月D日" 等のゆらぎ・和暦テキストもありうる。
 * 解析できない場合は null（＝年齢不明）を返し、呼び出し側で「判明した場合のみ」制御する。
 */

/** 満年齢を算出。解析不可・不正値は null。 */
export function calcAge(birth: string | null | undefined, now: Date = new Date()): number | null {
  if (!birth) return null
  const m = String(birth).match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/)
  if (!m) return null
  const y = +m[1], mo = +m[2], d = +m[3]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  let age = now.getFullYear() - y
  if ((now.getMonth() + 1) * 100 + now.getDate() < mo * 100 + d) age--
  return age >= 0 && age <= 120 ? age : null
}

/** 訪問時にご家族の同意・同席が必要な年齢か（65歳以上 または 18歳以下）。年齢不明は false。 */
export function needsFamilyConsent(age: number | null): boolean {
  return age != null && (age >= 65 || age <= 18)
}

/** 18歳以下＝宅配買取を利用不可とすべきか。年齢不明は false（判明時のみブロック）。 */
export function isMinorBlockedFromDelivery(age: number | null): boolean {
  return age != null && age <= 18
}
