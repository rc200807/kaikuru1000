// アキクル案件のStripe請求書発行ヘルパー
// - 顧客のStripe Customer取得/作成（User.stripeCustomerId に保存）
// - Invoice発行（カード + 銀行振込 jp_bank_transfer）→ finalize
// - 顧客専用バーチャル口座（funding instructions）の取得
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export type AkikuruBankInfo = {
  bankName: string | null
  branchName: string | null
  accountType: string | null
  accountNumber: string | null
  accountHolder: string | null
}

export type AkikuruBillingInfo = {
  akikuruInvoiceId: string
  stripeInvoiceId: string
  hostedInvoiceUrl: string | null
  amount: number
  status: string
  bank: AkikuruBankInfo
}

/** 顧客のStripe Customerを取得（なければ作成してUserに保存） */
export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, stripeCustomerId: true },
  })
  if (!user) throw new Error('顧客が見つかりません')

  if (user.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(user.stripeCustomerId)
      if (!('deleted' in customer) || !customer.deleted) return user.stripeCustomerId
    } catch {
      // retrieve 失敗時は作り直す
    }
  }

  const customer = await stripe.customers.create({
    name: user.name,
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    metadata: { kind: 'akikuru-customer', userId: user.id },
  })
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } })
  return customer.id
}

/** funding instructions（顧客専用バーチャル口座）を取得。同一Customerには常に同じ口座が返る */
export async function getFundingInstructions(customerId: string): Promise<{ raw: unknown; bank: AkikuruBankInfo }> {
  const fi = await stripe.customers.createFundingInstructions(customerId, {
    funding_type: 'bank_transfer',
    currency: 'jpy',
    bank_transfer: { type: 'jp_bank_transfer' },
  })
  const address = fi.bank_transfer?.financial_addresses?.[0] as any
  const zengin = address?.zengin ?? null
  const bank: AkikuruBankInfo = {
    bankName: zengin?.bank_name ?? null,
    branchName: zengin?.branch_name ?? null,
    accountType: zengin?.account_type ?? null,
    accountNumber: zengin?.account_number ?? null,
    accountHolder: zengin?.account_holder_name ?? null,
  }
  return { raw: fi, bank }
}

function toBillingInfo(inv: {
  id: string
  stripeInvoiceId: string
  hostedInvoiceUrl: string | null
  amount: number
  status: string
  bankName: string | null
  bankBranchName: string | null
  bankAccountType: string | null
  bankAccountNumber: string | null
  bankAccountHolder: string | null
}): AkikuruBillingInfo {
  return {
    akikuruInvoiceId: inv.id,
    stripeInvoiceId: inv.stripeInvoiceId,
    hostedInvoiceUrl: inv.hostedInvoiceUrl,
    amount: inv.amount,
    status: inv.status,
    bank: {
      bankName: inv.bankName,
      branchName: inv.bankBranchName,
      accountType: inv.bankAccountType,
      accountNumber: inv.bankAccountNumber,
      accountHolder: inv.bankAccountHolder,
    },
  }
}

/** 保存済みのアキクル請求情報を取得（未発行なら null） */
export async function findAkikuruBilling(dealId: string): Promise<AkikuruBillingInfo | null> {
  const inv = await prisma.akikuruInvoice.findUnique({ where: { dealId } })
  return inv ? toBillingInfo(inv) : null
}

/**
 * アキクル案件のStripe請求書を発行（冪等）。
 * - 既存が paid、または open かつ金額一致 → そのまま返す
 * - 既存が open かつ金額不一致（品目が編集された）→ 旧請求書を void して再発行
 * 支払方法はカード（hosted invoice page）と銀行振込（customer_balance / jp_bank_transfer）の2択。
 */
export async function issueAkikuruInvoice(params: {
  dealId: string
  storeId: string | null
  userId: string
  items: { name: string; unitPrice: number; quantity: number }[]
}): Promise<AkikuruBillingInfo> {
  const { dealId, storeId, userId, items } = params
  const amount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
  if (amount <= 0) throw new Error('請求金額が0円のため請求書を発行できません')

  const existing = await prisma.akikuruInvoice.findUnique({ where: { dealId } })
  if (existing) {
    if (existing.status === 'paid') return toBillingInfo(existing)
    if (existing.status === 'open' && existing.amount === amount) return toBillingInfo(existing)
    if (existing.status === 'open') {
      // 金額が変わった → 旧請求書をvoidして作り直す
      try { await stripe.invoices.voidInvoice(existing.stripeInvoiceId) } catch { /* 既にvoid済み等は無視 */ }
    }
  }

  const customerId = await getOrCreateStripeCustomer(userId)

  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: 30,
    currency: 'jpy',
    auto_advance: false, // 督促・自動送信はしない（自社レイアウトの請求書PDFが正）
    payment_settings: {
      payment_method_types: ['card', 'customer_balance'],
      payment_method_options: {
        customer_balance: {
          funding_type: 'bank_transfer',
          bank_transfer: { type: 'jp_bank_transfer' },
        },
      },
    } as Stripe.InvoiceCreateParams.PaymentSettings,
    metadata: { kind: 'akikuru', dealId, storeId: storeId ?? '' },
  })

  // 品目（数量は単価×数量で畳み込み、表記はdescriptionで補う）
  for (const item of items) {
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      currency: 'jpy',
      amount: item.unitPrice * item.quantity,
      description: item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name,
    })
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!)
  const { raw, bank } = await getFundingInstructions(customerId)

  const saved = await prisma.akikuruInvoice.upsert({
    where: { dealId },
    create: {
      dealId,
      storeId,
      stripeInvoiceId: finalized.id!,
      stripeCustomerId: customerId,
      hostedInvoiceUrl: finalized.hosted_invoice_url ?? null,
      stripeInvoicePdfUrl: finalized.invoice_pdf ?? null,
      amount,
      status: 'open',
      fundingInstructions: JSON.stringify(raw),
      bankName: bank.bankName,
      bankBranchName: bank.branchName,
      bankAccountType: bank.accountType,
      bankAccountNumber: bank.accountNumber,
      bankAccountHolder: bank.accountHolder,
    },
    update: {
      storeId,
      stripeInvoiceId: finalized.id!,
      stripeCustomerId: customerId,
      hostedInvoiceUrl: finalized.hosted_invoice_url ?? null,
      stripeInvoicePdfUrl: finalized.invoice_pdf ?? null,
      amount,
      status: 'open',
      paymentMethod: null,
      paidAt: null,
      distributionStatus: 'pending',
      distributionError: null,
      fundingInstructions: JSON.stringify(raw),
      bankName: bank.bankName,
      bankBranchName: bank.branchName,
      bankAccountType: bank.accountType,
      bankAccountNumber: bank.accountNumber,
      bankAccountHolder: bank.accountHolder,
    },
  })

  return toBillingInfo(saved)
}
