/**
 * 【テスト用プレビュー】身分証OCRで18歳以下と判定され、宅配買取が利用不可になった場合の表示確認用ページ。
 * ログイン不要・本番でも /preview/minor-block で開けます（実データには一切影響しません）。
 * 実際のマイページ（src/app/(customer)/mypage/page.tsx）と同じマークアップを再現しています。
 */
export const metadata = { title: '【プレビュー】未成年・利用不可表示' }

export default function MinorBlockPreviewPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-orange-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* プレビュー注記 */}
        <div className="rounded-xl bg-gray-900 text-white px-4 py-3 text-sm">
          <p className="font-bold">テスト用プレビュー画面</p>
          <p className="text-xs text-gray-300 mt-0.5">
            身分証の読み取り結果が「18歳以下」だった場合の各表示です。実際の顧客マイページの表示を再現しています（このページは確認用で、データには影響しません）。
          </p>
        </div>

        {/* ① TOP の送付登録カード（無効化） */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-gray-700">① マイページTOP：「送付登録」カード（無効化）</h2>
          <div className="flex">
            <div
              className="relative bg-white/70 backdrop-blur-xl rounded-2xl p-5 text-left shadow-sm border border-white/50 transition-all w-full sm:w-fit sm:min-w-[240px] opacity-50 grayscale cursor-not-allowed"
              aria-disabled
            >
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-400 shadow-lg overflow-hidden">
                <div className="absolute inset-0 bg-white/20" />
                <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-white/20 blur-sm" />
                <div className="absolute -bottom-1 -left-1 w-8 h-8 rounded-full bg-white/10" />
                <div className="relative flex items-center justify-center w-full h-full">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              </div>
              <p className="text-sm font-bold text-gray-800 mt-3">送付登録</p>
              <p className="text-xs text-gray-500 mt-0.5">18歳以下の方はご利用いただけません</p>
            </div>
          </div>
        </section>

        {/* ② 送付履歴タブの利用不可バナー */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-gray-700">②「送付履歴」タブを開いたとき</h2>
          <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 p-5 space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>18歳以下の方は宅配買取をご利用いただけません。</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">送付履歴</h3>
              <p className="text-sm text-gray-500">月ごとに段ボールを送付してください（月1回）</p>
            </div>
            {/* 利用不可のため送付登録ボタン（CTA）は非表示になります */}
            <p className="text-xs text-gray-400">※ 利用不可のため、送付登録ボタンは表示されません。</p>
          </div>
        </section>

        {/* ③ 訪問リクエストの同意・同席バナー */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-gray-700">③「訪問リクエスト」画面の注意バナー（参考）</h2>
          <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 p-5 space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>18歳以下の方は、訪問時にご家族の同意・同席が必要です。</span>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              <span className="mt-0.5 shrink-0">ℹ️</span>
              <span>ご希望の日程は、リクエスト送信日から1週間後以降の日程を選択できます。</span>
            </div>
          </div>
        </section>

        <p className="text-[11px] text-gray-400 text-center pt-2">
          ※ 年齢は身分証OCRの生年月日から自動判定されます。判定できない場合（未提出など）は制限はかかりません。
        </p>
      </div>
    </div>
  )
}
