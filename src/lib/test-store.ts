/**
 * テスト店舗（Store.isTestStore）の中央定義。
 *
 * テスト店舗は動作確認のために運用する店舗で、買取金額・訪問件数・顧客数などの
 * 「全社統計」には一切加算しない。店舗横断で集計している箇所は必ずこのファイルの
 * where 断片を通すこと。
 *
 * 除外の書き方はモデルごとに変える必要がある:
 *  - storeId が必須のモデル（VisitSchedule / VisitRequest / AkiyaCase / Inquiry など）
 *    → `{ store: { isTestStore: false } }` で素直に絞れる。
 *  - storeId が nullable なモデル（Deal / User）
 *    → `{ store: { isTestStore: false } }` にすると店舗未割当の行まで落ちてしまう。
 *      `NOT: { store: { isTestStore: true } }` を使い、未割当は統計に残す。
 *  - 店舗を直接持たないモデル（DeliveryShipment）
 *    → 顧客の担当店舗を辿って除外する。
 *
 * テスト店舗自身のダッシュボード（単一店舗スコープ）には自分の数字を出す。
 * 除外するのは「横断集計の母数」だけ。
 */
import type { Prisma } from '@prisma/client'

/** テスト店舗を除いた Store の条件 */
export const NON_TEST_STORE: Prisma.StoreWhereInput = { isTestStore: false }

/**
 * 既存の Store 条件にテスト店舗除外を足す。
 * `where: excludeTestStores({ isActive: true })` のように使う。
 */
export function excludeTestStores(extra?: Prisma.StoreWhereInput): Prisma.StoreWhereInput {
  return { ...extra, isTestStore: false }
}

/**
 * storeId が nullable なモデル用（Deal / User）。
 * 店舗未割当の行は統計に残したいので NOT で書く。
 */
export const NON_TEST_STORE_DEAL: Prisma.DealWhereInput = { NOT: { store: { isTestStore: true } } }
export const NON_TEST_STORE_USER: Prisma.UserWhereInput = { NOT: { store: { isTestStore: true } } }

/** storeId が必須のモデル用 */
export const NON_TEST_STORE_VISIT: Prisma.VisitScheduleWhereInput = { store: { isTestStore: false } }
export const NON_TEST_STORE_VISIT_REQUEST: Prisma.VisitRequestWhereInput = { store: { isTestStore: false } }
export const NON_TEST_STORE_AKIYA: Prisma.AkiyaCaseWhereInput = { store: { isTestStore: false } }
export const NON_TEST_STORE_INQUIRY: Prisma.InquiryWhereInput = { store: { isTestStore: false } }

/** 店舗を直接持たないモデル（顧客の担当店舗で判定） */
export const NON_TEST_STORE_SHIPMENT: Prisma.DeliveryShipmentWhereInput = {
  NOT: { user: { store: { isTestStore: true } } },
}

/** 在庫・コミュニティ・問い合わせなど storeId が必須のモデル */
export const NON_TEST_STORE_INVENTORY: Prisma.InventoryItemWhereInput = { store: { isTestStore: false } }
// Question は storeId を持つがリレーションが張られていないので、除外は店舗ID列挙で行う
// （fetchTestStoreIds → questionWhereExcludingTestStores）
export const NON_TEST_STORE_COMMUNITY: Prisma.CommunityThreadWhereInput = { store: { isTestStore: false } }
export const NON_TEST_STORE_BUG_REPORT: Prisma.BugReportWhereInput = { store: { isTestStore: false } }
export const NON_TEST_STORE_TRAINING_VIEW: Prisma.TrainingVideoViewWhereInput = { store: { isTestStore: false } }

/**
 * 買取品目・契約・見積は案件（または旧訪問）経由で店舗を辿る。
 * どちらも nullable なので NOT で書き、店舗未割当は統計に残す。
 */
export const NON_TEST_STORE_PURCHASE_ITEM: Prisma.PurchaseItemWhereInput = {
  NOT: { deal: { store: { isTestStore: true } } },
}
export const NON_TEST_STORE_SALES_CONTRACT: Prisma.SalesContractWhereInput = {
  NOT: { deal: { store: { isTestStore: true } } },
}
export const NON_TEST_STORE_ESTIMATE: Prisma.EstimateWhereInput = {
  NOT: { deal: { store: { isTestStore: true } } },
}

/** LINE 統計（店舗紐付けは任意なので未割当は残す） */
export const NON_TEST_STORE_LINE_CHANNEL: Prisma.LineChannelWhereInput = { NOT: { store: { isTestStore: true } } }
export const NON_TEST_STORE_LINE_USER: Prisma.LineUserWhereInput = { NOT: { store: { isTestStore: true } } }
export const NON_TEST_STORE_LINE_MESSAGE: Prisma.LineMessageWhereInput = {
  NOT: { lineUser: { store: { isTestStore: true } } },
}

/**
 * テスト店舗の ID 一覧。
 * where で辿れない集計（JS 側で店舗別に組み立てている箇所）で使う。
 */
export async function fetchTestStoreIds(
  prisma: { store: { findMany: (args: any) => Promise<{ id: string }[]> } },
): Promise<string[]> {
  const rows = await prisma.store.findMany({ where: { isTestStore: true }, select: { id: true } })
  return rows.map((r) => r.id)
}

/** Question（知恵袋）はリレーションが無いので ID 列挙で除外する */
export function questionWhereExcludingTestStores(testStoreIds: string[]): Prisma.QuestionWhereInput {
  return testStoreIds.length > 0 ? { storeId: { notIn: testStoreIds } } : {}
}

/** ラベル（UI で共通利用） */
export const TEST_STORE_LABEL = 'テスト店舗'
export const TEST_STORE_DESCRIPTION = '統計に加算されない動作確認用の店舗'
