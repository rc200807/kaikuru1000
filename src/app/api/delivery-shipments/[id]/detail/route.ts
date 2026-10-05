import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { toClientShipment } from '@/lib/delivery-shipment'
import { shapePurchaseItem, PURCHASE_ITEM_SHAPE_SELECT } from '@/lib/purchase-item-shape'


/**
 * GET /api/delivery-shipments/[id]/detail
 * 店舗・管理者向け: 送付詳細（顧客・店舗情報付き）を取得。
 * 宅配の買取品目と売買契約書（PDF本文は除く）、契約書の記載に必要な顧客・店舗の項目も返す。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'store' && !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const shipment = await prisma.deliveryShipment.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          furigana: true,
          phone: true,
          email: true,
          address: true,
          // 売買契約書の記載用（身分証の記載を優先する）
          idName: true, idAddress: true, idBackAddress: true,
          birthDate: true, idBirthDate: true, occupation: true, idDocumentType: true,
          store: {
            select: {
              id: true, name: true, address: true, phone: true, antiquePermitNumber: true,
              operator: { select: { antiquePermitNumber: true } },
            },
          },
        },
      },
      purchaseItems: { orderBy: { createdAt: 'asc' }, select: PURCHASE_ITEM_SHAPE_SELECT },
      // PDF本文（数MB）は引かない。有無だけ別途判定する
      contract: {
        select: { id: true, contractNo: true, agreedAt: true, purchaseAmount: true, remarks: true, emailSentAt: true, customerEmail: true, issuedByName: true },
      },
    },
  })

  if (!shipment) {
    return NextResponse.json({ error: '送付記録が見つかりません' }, { status: 404 })
  }

  // Store: verify customer belongs to this store
  if (sessionUser.role === 'store' && shipment.user?.store?.id !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const hasPdf = shipment.contract
    ? (await prisma.deliveryContract.count({ where: { id: shipment.contract.id, NOT: { pdfBase64: null } } })) > 0
    : false
  const { purchaseItems, contract, ...rest } = shipment
  return NextResponse.json({
    ...toClientShipment(rest),
    purchaseItems: purchaseItems.map(shapePurchaseItem),
    contract: contract ? { ...contract, hasPdf } : null,
  })
}
