/**
 * 公開フォーム（LINE友だち登録・電話問い合わせ）からの顧客突合・作成
 * - メールアドレス → 電話番号 の順で既存顧客を突合し、無ければ新規作成する
 * - 既存顧客の情報は上書きしない。未設定の項目（担当店舗・住所・郵便番号）だけを補完する
 * - 住所は郵便番号から自動解決した値（番地なし）を格納する
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildUserNameData } from '@/lib/name-utils'
import { lookupPostalAddress, normalizePostalCode } from '@/lib/postal'

export type PublicCustomerInput = {
  name?: string
  furigana?: string
  lastName?: string
  firstName?: string
  lastNameKana?: string
  firstNameKana?: string
  phone: string
  email?: string | null
  postalCode?: string | null
  /** クライアント側で解決済みの住所（未指定ならサーバー側で郵便番号から解決する） */
  address?: string | null
  storeId: string
  leadSource: string
}

export type PublicCustomerResult = {
  userId: string
  isNew: boolean
  /** 実際に保存された住所（解決できなければ空文字） */
  address: string
}

/** 電話番号を正規化（ハイフン・空白を除去。既存フォームと同じ流儀） */
export function normalizePhone(phone: string): string {
  return String(phone).replace(/[-ー－\s]/g, '')
}

export async function resolveOrCreateCustomer(
  input: PublicCustomerInput
): Promise<PublicCustomerResult> {
  const nameData = buildUserNameData({
    name: input.name,
    furigana: input.furigana,
    lastName: input.lastName,
    firstName: input.firstName,
    lastNameKana: input.lastNameKana,
    firstNameKana: input.firstNameKana,
  })
  const phone = normalizePhone(input.phone)
  const email = input.email || null
  const postalCode = normalizePostalCode(input.postalCode)

  // 住所: クライアント解決値を優先し、無ければサーバー側で郵便番号から解決する
  let address = (input.address ?? '').trim()
  if (!address && postalCode) {
    const resolved = await lookupPostalAddress(postalCode)
    address = resolved?.address ?? ''
  }

  // --- 既存顧客の突合 ---
  let userId: string | null = null
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) userId = existing.id
  }
  if (!userId) {
    const byPhone = await prisma.user.findFirst({
      where: { phone, isActive: true, mergedIntoUserId: null },
      orderBy: { createdAt: 'asc' },
    })
    if (byPhone) userId = byPhone.id
  }

  // --- 既存顧客: 未設定の項目のみ補完（既存の値は上書きしない） ---
  if (userId) {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { storeId: true, address: true, postalCode: true },
    })
    const patch: Prisma.UserUpdateInput = {}
    if (!current?.storeId) patch.store = { connect: { id: input.storeId } }
    if (!current?.address && address) patch.address = address
    if (!current?.postalCode && postalCode) patch.postalCode = postalCode
    if (Object.keys(patch).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: patch })
    }
    return { userId, isNew: false, address: current?.address || address }
  }

  // --- 新規作成（パスワード未設定。後から店舗・管理側で補完する運用） ---
  try {
    const created = await prisma.user.create({
      data: {
        ...nameData,
        phone,
        email,
        postalCode,
        address,
        password: '',
        customerType: 'regular',
        customerTypes: JSON.stringify(['regular']),
        storeId: input.storeId,
        leadSource: input.leadSource,
      },
    })
    return { userId: created.id, isNew: true, address }
  } catch (e) {
    // 同一メールの同時送信（P2002）は既存顧客として扱う
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && email) {
      const concurrent = await prisma.user.findUnique({ where: { email } })
      if (concurrent) {
        return { userId: concurrent.id, isNew: false, address: concurrent.address || address }
      }
    }
    throw e
  }
}
