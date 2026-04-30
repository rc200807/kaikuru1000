/** パスワードポリシー: 大文字・小文字・数字を含む8文字以上 */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
export const PASSWORD_RULE = '大文字・小文字・数字を含む8文字以上'
export const PASSWORD_ERROR = 'パスワードは大文字・小文字・数字をそれぞれ1文字以上含む、8文字以上で設定してください'

export function validatePassword(password: string): string | null {
  if (!PASSWORD_REGEX.test(password)) return PASSWORD_ERROR
  return null
}
