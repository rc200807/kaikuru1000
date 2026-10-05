import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { enqueueEmail } from '@/lib/email-queue'
import { sumPurchaseItems } from '@/lib/purchase-item-amount'
import { deliveryContractNo, resolveShipmentAccess } from '@/lib/delivery-contract'

/** 商品を受け取ったあとでないと契約書は出せない（査定前の状態） */
const ISSUABLE_STATUSES = ['received', 'appraised', 'transferred']
/** PDF（base64）の上限。訪問の契約書と同程度に抑える */
const MAX_PDF_BASE64 = 12 * 1024 * 1024

/**
 * POST /api/delivery-shipments/[id]/contract
 * 宅配買取の売買契約書を発行する（店舗・管理者。署名なし）。
 * 品目は発行時点で凍結し、PDFは画面で生成したものを保存してお客様へメールで送る。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveShipmentAccess(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  const { shipment } = access

  if (!ISSUABLE_STATUSES.includes(shipment.status)) {
    return NextResponse.json({ error: '荷物の受取後に発行できます' }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  const pdfBase64: string | null = typeof body.pdfBase64 === 'string' && body.pdfBase64 ? body.pdfBase64 : null
  if (pdfBase64 && pdfBase64.length > MAX_PDF_BASE64) {
    return NextResponse.json({ error: 'PDFのサイズが大きすぎます' }, { status: 413 })
  }
  const remarks: string | null = typeof body.remarks === 'string' && body.remarks.trim() ? body.remarks.trim().slice(0, 2000) : null

  const [items, user, store] = await Promise.all([
    prisma.purchaseItem.findMany({
      where: { deliveryShipmentId: id },
      orderBy: { createdAt: 'asc' },
      select: { itemName: true, quantity: true, purchasePrice: true },
    }),
    prisma.user.findUnique({ where: { id: shipment.userId }, select: { name: true, idName: true, email: true } }),
    shipment.user.storeId
      ? prisma.store.findUnique({ where: { id: shipment.user.storeId }, select: { id: true, name: true } })
      : null,
  ])
  if (items.length === 0) {
    return NextResponse.json({ error: '買取品目を1件以上登録してください' }, { status: 400 })
  }
  const purchaseAmount = sumPurchaseItems(items)
  const issuedByName = [sessionUser.name, sessionUser.memberName].filter(Boolean).join(' / ') || null

  let contract
  try {
    contract = await prisma.$transaction(async (tx) => {
      const created = await tx.deliveryContract.create({
        data: {
          shipmentId: id,
          storeId: store?.id ?? null,
          contractNo: deliveryContractNo(shipment.shipmentNumber),
          purchaseAmount,
          remarks,
          pdfBase64,
          customerEmail: user?.email ?? null,
          issuedByName,
        },
        select: { id: true, contractNo: true, agreedAt: true },
      })
      // 査定金額は品目合計に揃え、受取済みなら査定完了に進める（振込済みはそのまま）
      await tx.deliveryShipment.update({
        where: { id },
        data: { purchaseAmount, ...(shipment.status === 'received' ? { status: 'appraised' } : {}) },
      })
      return created
    })
  } catch (e: any) {
    // 二重発行（同時押し等）は一意制約で弾く
    if (e?.code === 'P2002') return NextResponse.json({ error: '売買契約書はすでに発行されています' }, { status: 409 })
    throw e
  }

  let emailQueued = false
  if (user?.email) {
    try {
      await enqueueEmail({
        type: 'deliveryContractEmail',
        params: {
          deliveryContractId: contract.id,
          customerEmail: user.email,
          customerName: user.idName || user.name,
          storeName: store?.name ?? '買いクル',
          shipmentNumber: shipment.shipmentNumber,
          contractNo: contract.contractNo,
          purchaseAmount,
          items: items.map(i => ({ name: i.itemName, quantity: i.quantity, price: i.purchasePrice })),
          remarks,
        },
      })
      emailQueued = true
    } catch (e) {
      console.error('[delivery-contract POST] メールのキュー登録に失敗:', e)
    }
  }

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: `宅配買取の売買契約書を発行（${contract.contractNo}）`, req: request })
  return NextResponse.json({
    success: true,
    contract: { id: contract.id, contractNo: contract.contractNo, agreedAt: contract.agreedAt, purchaseAmount, hasPdf: !!pdfBase64, emailSentAt: null },
    emailQueued,
    emailErrorReason: user?.email ? (emailQueued ? null : 'queue-error') : 'no-email',
  }, { status: 201 })
}

/**
 * GET /api/delivery-shipments/[id]/contract?pdf=1
 * 売買契約書PDFを返す（店舗・管理者・送付したお客様本人）。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (sessionUser.role === 'customer') {
    const own = await prisma.deliveryShipment.findFirst({ where: { id, userId: sessionUser.id }, select: { id: true } })
    if (!own) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } else {
    const access = await resolveShipmentAccess(id, sessionUser)
    if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const contract = await prisma.deliveryContract.findUnique({
    where: { shipmentId: id },
    select: { contractNo: true, pdfBase64: true },
  })
  if (!contract?.pdfBase64) return NextResponse.json({ error: '売買契約書が見つかりません' }, { status: 404 })

  const bytes = Buffer.from(contract.pdfBase64, 'base64')
  const filename = encodeURIComponent(`売買契約書_${contract.contractNo}.pdf`)
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${new URL(request.url).searchParams.get('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${filename}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
