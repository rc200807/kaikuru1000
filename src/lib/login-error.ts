/**
 * signIn() の result.error を画面に出す文言に変える。
 *
 * next-auth は authorize が null を返すと 'CredentialsSignin' を、throw した場合はそのメッセージを返す。
 * auth.ts が意図して throw する利用者向けの文言（ブロック中・パスキー必須）だけはそのまま見せ、
 * それ以外（英字コードや Prisma 等の内部エラー文）は各画面の既定文言に置き換える。
 * （ブロック中も一律「パスワードが間違っています」と出していたため、再発行した正しいパスワードでも
 *  入れない理由が分からなかった）
 */
const USER_FACING_PREFIXES = [
  'ログインがブロックされています',
  'このアカウントはパスキーでログインしてください',
]

export function loginErrorMessage(error: string, fallback: string): string {
  return USER_FACING_PREFIXES.some(p => error.startsWith(p)) ? error : fallback
}
