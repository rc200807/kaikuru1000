'use client'

// 複数店舗を同時表示しているときに「どの店舗のデータか」を示す共通バッジ。
// 色は store-identity.ts の中央定義（並び順 = 店舗の登録順で固定）なので、
// 同じ店舗はどの画面でも必ず同じ色・同じ頭文字になる。
//
// 単一店舗表示のときは何も描画しない（呼び出し側で isMulti を書かなくてよい）。
// 単一でも必ず出したい場所だけ always を付ける。
import { useMemo } from 'react'
import { useStoreScope } from './StoreScopeContext'
import {
  commonStoreNamePrefix, storeColorAt, storeColorFromKey, storeInitial,
} from '@/lib/store-identity'

export type StoreIdentity = {
  id: string | null
  name: string
  initial: string
  color: string
  /** ログイン中の店舗か（書き込みができる店舗か） */
  isSelf: boolean
}

/**
 * storeId か店舗名から色・頭文字を解決する関数を返すフック。
 * ダッシュボードやハイライトのAPIは storeName しか返さないので名前からも引けるようにしてある。
 */
export function useStoreIdentity() {
  const { availableStores, sessionStoreId } = useStoreScope()
  return useMemo(() => {
    const prefix = commonStoreNamePrefix(availableStores.map(s => s.name))
    const indexById = new Map(availableStores.map((s, i) => [s.id, i]))
    const indexByName = new Map(availableStores.map((s, i) => [s.name, i]))

    return (storeId?: string | null, storeName?: string | null): StoreIdentity | null => {
      let index: number | undefined
      if (storeId) index = indexById.get(storeId)
      if (index === undefined && storeName) index = indexByName.get(storeName)

      if (index !== undefined) {
        const store = availableStores[index]
        return {
          id: store.id,
          name: store.name,
          initial: storeInitial(store.name, prefix),
          color: storeColorAt(index),
          isSelf: store.id === sessionStoreId,
        }
      }
      // 運営者配下の一覧に無い店舗（移管済みなど）。名前ハッシュで色を安定させる
      const name = storeName ?? ''
      if (!name && !storeId) return null
      return {
        id: storeId ?? null,
        name: name || '未割当',
        initial: name ? storeInitial(name) : '?',
        color: storeColorFromKey(storeId || name),
        isSelf: !!storeId && storeId === sessionStoreId,
      }
    }
  }, [availableStores, sessionStoreId])
}

type Variant = 'full' | 'initial' | 'dot'
type Size = 'xs' | 'sm'

const DOT_SIZE: Record<Size, number> = { xs: 14, sm: 18 }
const DOT_FONT: Record<Size, string> = { xs: 'text-[9px]', sm: 'text-[10px]' }
const LABEL_FONT: Record<Size, string> = { xs: 'text-[10px]', sm: 'text-[11px]' }

export default function StoreChip({
  storeId, storeName, variant = 'full', size = 'xs', always = false, className = '',
}: {
  storeId?: string | null
  storeName?: string | null
  /** full: 丸＋店舗名 / initial: 丸のみ（頭文字入り） / dot: 小さい色ドットのみ */
  variant?: Variant
  size?: Size
  /** 単一店舗表示のときも描画する */
  always?: boolean
  className?: string
}) {
  const { isMulti } = useStoreScope()
  const resolve = useStoreIdentity()

  if (!isMulti && !always) return null
  const store = resolve(storeId, storeName)
  if (!store) return null

  if (variant === 'dot') {
    return (
      <span
        title={store.name}
        aria-label={store.name}
        className={`inline-block rounded-full flex-shrink-0 align-middle ${className}`}
        style={{ width: 7, height: 7, backgroundColor: store.color }}
      />
    )
  }

  const px = DOT_SIZE[size]
  const dot = (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0 ${DOT_FONT[size]}`}
      style={{ width: px, height: px, backgroundColor: store.color }}
      aria-hidden="true"
    >
      {store.initial}
    </span>
  )

  if (variant === 'initial') {
    return <span title={store.name} aria-label={store.name} className={`inline-flex align-middle ${className}`}>{dot}</span>
  }

  return (
    <span
      title={store.name}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full max-w-[160px] align-middle bg-[var(--md-sys-color-surface-container-high)] ${LABEL_FONT[size]} font-medium text-[var(--md-sys-color-on-surface-variant)] ${className}`}
    >
      {dot}
      <span className="truncate">{store.name}</span>
    </span>
  )
}
