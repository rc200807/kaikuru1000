# 表示速度・システム負荷の改善プラン

作成日: 2026-08-24 / 対象コミット: `efab61b`

「画面がサクサク動く」状態を作るための改修計画。推測ではなく、実際にコードベースを計測して見つかった事実に基づいて優先度を決めている。

---

## 1. 現状（実測）

| 項目 | 実測値 | 何が起きるか |
|---|---|---|
| ページの構成 | 171ページ中 **161がクライアントコンポーネント** | HTML→JS→セッション確認→データ取得→描画の4往復。最初の1文字が出るまで待つ |
| セッション待ち | 51ページが `status !== 'authenticated'` でfetchをブロック | データ取得が1往復ぶん遅れる |
| セッション確認 | 1ページ表示で `/api/auth/session` が **4回** 発火。パスキーセッションは毎回DB照合 | 無駄なDB往復が積み上がる |
| 店舗ナビ | `NavigationRail` と `BottomNav` が**両方マウント**され、各4本のAPIを叩く | ナビのバッジだけで**8リクエスト/ページ**。さらに30秒ポーリングも二重 |
| JSバンドル | `.next/static/chunks` 合計 **13MB**、最大チャンク 1.3MB（gzip 332KB） | 初回表示が重い。モバイル回線で顕著 |
| three.js | `GlassOrbs3D` が**公開フォーム11ページ**（問い合わせ・LINE登録・会員登録など）に静的同梱 | 一番速くあるべき入口ページが一番重い |
| recharts | 20ファイルで静的import（各ポータルのダッシュボード含む） | ログイン直後の画面が重い |
| DBインデックス | **`User` テーブルにインデックスがゼロ**（`storeId` すら無い）。`VisitSchedule` も `dealId`/`memberId` のみ | 顧客一覧・スケジュール・ダッシュボードが毎回フルスキャン。データが増えるほど線形に悪化 |
| クエリの直列実行 | `await prisma` を4回以上直列で回すAPIが **108本**（店舗ダッシュボードは11本直列・`Promise.all` なし） | 1リクエストでDB往復が11回積み上がる |
| SELECT範囲 | 930クエリ中 **261本が `select`/`include` 無し**（全カラム取得） | base64のPDF列まで巻き込むと1行で数百KB |
| 件数上限 | 409本の `findMany` のうち **293本に `take` が無い** | 将来的に全件取得で詰まる |
| 画像アップロード | **21本のAPIすべてサーバー側の再エンコード無し**（最大10MBの原本をそのまま保存）。クライアント圧縮は20箇所中**2箇所のみ**（しかも1.5MB超のときだけ・JPEG） | iPhone写真4MBがそのまま保存・配信される |
| 画像表示 | `<img>` **133箇所**中 `loading="lazy"` は **1箇所**。`next/image` は0箇所 | 一覧画面で全画像を即時ダウンロード |
| DB内バイナリ | 見積・売買契約書のPDFと署名が **base64でPostgresに4カラム** | 行が肥大化。バックアップ・転送量・メモリすべてに効く |
| 実行リージョン | Vercel関数は **`iad1`（米国東部）** | 日本のユーザーは1往復あたり150〜200msが常時上乗せ |
| 計測基盤 | Speed Insights / Analytics 未導入、Server-Timing なし | 改善の効果を数字で言えない |

### 本番（system.rcinc.jp）を日本から実測した往復時間

| 対象 | TTFB |
|---|---|
| 静的ページ・アセット（CDNエッジ＝東京） | **0.06〜0.08秒** |
| API（`/api/store/customers/[id]` の未認証401。**DBに触らない最短経路**） | **0.22〜0.45秒**（中央値およそ0.30秒） |
| 外部API込みのAPI（`/api/postal-lookup`） | 0.78秒 |
| トップページ `/` | 0.43秒 |

**つまり、DBクエリを1回も投げなくてもAPI1本あたり約0.3秒かかっている。** 現在は1画面で10〜14本叩いているので、待ち時間の大半は「DBが遅い」ではなく **「往復回数×距離」** が原因。ここを削るのが最優先で、DBチューニングやバンドル削減より先に効く。

さらにビルドログから、本番DBは **Neon の `us-east-1`（バージニア）** で、Vercel関数の `iad1` と同一リージョンであることを確認した。
つまり **関数↔DBは近く（速い）／ブラウザ↔関数が遠い（遅い）**。この構成では
「関数だけ東京に移す」と関数↔DBが太平洋を渡ることになり逆効果なので、
リージョン変更を検討する場合は **DBと関数をセットで**動かす必要がある（Phase 6）。

---

## 2. 目標

| 指標 | 現状（推定） | 目標 |
|---|---|---|
| 店舗ダッシュボードのTTFB | 未計測 | 300ms以下 |
| 主要画面のLCP（4G・モバイル） | 未計測 | 1.5秒以下 |
| 画面遷移の体感 | 白画面→スピナー→表示 | 骨組みが即出る（体感500ms以下） |
| 1画面あたりのAPI呼び出し | 10〜14本 | 3本以下 |
| 画像の平均転送量 | 1〜4MB/枚 | 90%削減（サムネは20〜40KB） |
| 初回JS（gzip） | 300KB超 | 半減 |

---

## 3. 実施状況（2026-08-24）

| フェーズ | 状態 | コミット | 効果（ローカル実測） |
|---|---|---|---|
| Phase 0 計測基盤 | ✅ 本番反映 | `0a7d87f` | Speed Insights・Server-Timing・診断API・bundle-analyzer |
| Phase 1 通信削減 | ✅ 本番反映 | `030ef11` `66cd217` | ダッシュボード 14本→6本 / ページ遷移 10本→4本 / 顧客詳細 13本→5本 |
| Phase 2 サーバー高速化 | ✅ 本番反映 | `a427920` | User にインデックス新設（従来ゼロ）・ダッシュボード11本直列→1回・最終訪問日をgroupBy化 |
| Phase 3 画像/ファイル | 未着手 | | |
| Phase 4 バンドル削減 | 未着手 | | |
| Phase 5 レンダリング方式 | 未着手 | | |
| Phase 6 インフラ | 未着手（要計測） | | |

### 実施中に見つかった別件

- **Google Analytics (gtag) が CSP でブロックされている**。`script-src` に
  `googletagmanager.com` が無く、`src/app/layout.tsx` の GA スクリプト2本は
  読み込まれないまま毎回リクエストだけ発生している。**「CSPに追加して有効化」か
  「撤去」かの判断が必要**（アクセス解析は自前の計測基盤もあるため撤去でも困らない）。

---

## 4. フェーズ

効果と安全性の順に並べている。**Phase 0 → 1 → 2 が全体の体感の8割**を占める見込み。

### Phase 0: 計測の土台（0.5日）

推測で直さないための下ごしらえ。

- `@vercel/speed-insights` と `@vercel/analytics` を導入し、実ユーザーのLCP/INP/TTFBをルート別に取得
- 共通ラッパー `withTiming()` を作り、APIレスポンスに `Server-Timing: db;dur=..., total;dur=...` を付与
- 管理者限定の診断エンドポイント `/api/admin/_diag/latency`：`SELECT 1` を10回叩いてDB往復の中央値、`process.env.VERCEL_REGION`、DBホストのリージョンを返す
  → 「ブラウザ→関数」と「関数→DB」のどちらが遅いかを**数字で確定**させる（Phase 6 の判断材料）
- `@next/bundle-analyzer` を devDependency に追加し、`ANALYZE=1 next build` でルート別の重さを可視化

### Phase 1: 通信回数を削る（1〜2日 / 低リスク・体感への効果が最大）

1. **店舗ナビのリクエスト8本→1本**
   `StoreBadgesProvider`（`(store)/layout.tsx` 直下）を新設し、未読3種＋`linked-accounts` を1本化した `/api/store/badges` を**1回だけ**取得。`NavigationRail`/`BottomNav` はコンテキストを読むだけにする。ポーリングは1本・60秒・非表示タブでは停止。管理ポータルの `NavigationDrawer` も同様に `/api/admin/badges` へ集約。
2. **セッション確認の削減**
   `SessionProvider` に `refetchOnWindowFocus={false}` / `refetchInterval={0}` を指定し、ルートレイアウトで `getServerSession()` した値を `session` プロップとして注入 → 初回の `/api/auth/session` 往復自体を消す。
3. **パスキーセッションのDB照合をキャッシュ**
   `validateDeviceSession()` に60秒のインメモリキャッシュを持たせる（`revokeAllDeviceSessions` 実行時は同プロセスのキャッシュを即時クリア）。失効の反映は最大60秒遅れるが、セッション確認ごとのDB往復が消える。
4. **セッション待ちゲートの撤去**
   51ページの `if (status !== 'authenticated') return` を外し、マウント直後に並列でfetchする。認証は middleware（ページ）と `getServerSession`（API）で二重に担保済みなので、UIのゲートは体感を落とすだけ。
5. **画面ごとのfetch集約**
   複数エンドポイントを叩いている画面を1本にまとめる。対象と現状の本数：マイページ4本 / 顧客一覧3本 / 店舗ダッシュボード2本 / 案件一覧3本。ページ専用の集約エンドポイント（`?include=` 方式）を用意する。

### Phase 2: サーバーを速くする（2〜3日 / 低リスク・機械的）

1. **インデックス追加（最重要）**
   ```
   User          (storeId, mergedIntoUserId) / (storeId, createdAt) / (customerType) / (lastVisitedAt)
   VisitSchedule (storeId, visitDate) / (userId, visitDate) / (status, visitDate)
   Deal          (storeId, status) / (storeId, occurredAt)
   Inquiry       (storeId, createdAt)
   PurchaseMemo  (userId, createdAt)
   DeliveryShipment (userId, createdAt)
   ```
   さらに全文検索用に `pg_trgm` 拡張＋GINインデックス（`User.name` / `User.furigana` / `User.phone`）。現在の `contains + mode:'insensitive'`（＝`ILIKE '%…%'`）はインデックスが効かず必ずフルスキャンになるため。
   **注意**: Postgres の `CREATE INDEX` は書き込みロックを取る。行数の多いテーブル（User / VisitSchedule / AccessLog）は `CREATE INDEX CONCURRENTLY` を**マイグレーション外で**手動実行する（Prisma migrate はトランザクション内で回すため CONCURRENTLY が使えない）。小さいテーブルは通常のmigrationで同梱。
2. **直列クエリの並列化**
   `await prisma` が4回以上直列のAPI108本のうち、アクセス頻度の高い上位20本を `Promise.all` 化。特に `src/lib/store-dashboard-data.ts`（11本直列）、`/api/admin/dashboard`、`/api/visit-schedules/[id]/contract`（14本）、`/api/visit-schedules/[id]/estimate`（12本）。
3. **`select` の明示**
   261本の全カラム取得のうち、**base64列を持つモデル（Estimate / SalesContract / Deal.preConsentSignature）に触れているものを最優先**でゼロにする。ここが1件で数百KBのレスポンスを生む温床。
4. **マスタ系APIのキャッシュ**
   `lead-sources` / `purchase-categories` / `visit-statuses` / `store-nav` / `business-hours` などに `Cache-Control: private, max-age=300, stale-while-revalidate=3600` ＋サーバー側60秒メモリキャッシュ。
5. **`take` の上限付与**
   一覧系・関連配列系の `findMany` に上限を入れる（293本中の該当箇所）。上限に達したときは「全件は一覧画面で」の導線を出す（案件セクションで採用した方式と同じ）。

### Phase 3: 画像・ファイル（2〜3日 / 保存容量とDB負荷に直結）

1. **アップロード時にWebPへ正規化（サーバー）**
   `sharp` を導入し、共通の `saveImage()` を作って21本のアップロードAPIをすべてそこに寄せる。
   - EXIF Orientation を反映してから**EXIF（位置情報含む）を除去** ― 個人情報保護の観点でも有効
   - 長辺2000pxに縮小し **WebP q80** で保存（`xxx.webp`）
   - 同時に長辺400pxの**サムネ** `xxx_thumb.webp` を生成
   - 期待値: iPhone写真 3〜5MB → **200〜400KB（約90%削減）**、サムネ 20〜40KB
2. **クライアント側の事前圧縮を全面適用**
   `compressImageIfNeeded()` の出力をWebPに変更し、しきい値を 1.5MB→400KB、長辺 2400→2000 に。`<input type="file" accept="image/*">` の**20箇所すべて**を共通 `uploadImage()` 経由にする（現状は2箇所のみ圧縮）。4G回線でのアップロード待ち時間もそのまま短縮される。
3. **表示側の共通化**
   共通コンポーネント `<AppImage>` を作り、
   - 一覧・グリッドは `_thumb.webp`、詳細・拡大時のみフル解像度
   - `loading="lazy"` `decoding="async"` と `width`/`height`（CLS対策）を既定で付与（現状133箇所中lazyは1箇所）
   - 大きな主画像のみ `next/image` を検討（AVIF/WebP＋srcset）。ただし保存時にWebP化済みなら変換課金を払う価値は薄いので、**サムネ運用を基本線**とする
4. **既存画像の移行**
   管理者用の再開可能バッチ `POST /api/admin/maintenance/optimize-images`（100件ずつ・カーソル方式）。Blob上の既存画像をWebP＋サムネに再エンコードし、DBの該当フィールド（`imageUrls` などJSON配列を含む）を更新。**元ファイルは一定期間残し**、問題がなければ削除する。
5. **base64をDBから追い出す**
   `Estimate.pdfBase64` / `Estimate.invoicePdfBase64` / `SalesContract.pdfBase64` / `SalesContract.invoicePdfBase64`、署名 `signatureData` / `preConsentSignature` をBlobへ移し、URL列を持つ。
   - 互換レイヤ `resolveDocumentPdf()`：URLがあればURL、無ければ既存base64を読む
   - 移行バッチ → 二重保持期間 → 列削除、の3段階
   - 効果: 行サイズが数百KB→数十バイト。`select` 漏れによる巨大レスポンス事故が構造的に起きなくなる。DBサイズ・バックアップ・転送量も下がる

### Phase 4: JSバンドルを削る（1〜2日 / 低リスク）

1. `GlassOrbs3D`（three.js）を `next/dynamic(ssr:false)` 化し、モバイル・低速回線・`prefers-reduced-motion` ではCSSグラデーションにフォールバック。**公開フォーム11ページ**が最も効く
2. recharts を使う20ファイルを動的import化（チャートは折りたたみを開いた時／ビューポートに入った時に読み込む）
3. TipTap（リッチテキスト編集）はモーダルを開くまで読み込まない
4. 未使用依存の削除: `html2canvas`（実際に使うのは `html2canvas-pro` のみ）、`isomorphic-dompurify`（コメント内の言及だけ）、`@auth/prisma-adapter`
5. `next.config.ts` に `experimental.optimizePackageImports: ['recharts', 'date-fns', '@tiptap/react', ...]`
6. 巨大クライアントページの分割: マイページ5419行 / 管理顧客一覧3174行 → タブ・モーダル単位で `dynamic()`

### Phase 5: レンダリング方式（3〜5日 / 中リスク・体感の底上げ）

- アクセス頻度上位の**6画面だけ**サーバーコンポーネント化する。`page.tsx`（server: 認証＋初期データ取得）＋ `XxxView.tsx`（client: 既存UIをそのまま移設）に分割し、初期データをpropsで渡す。
  対象: 店舗ダッシュボード / 店舗案件一覧 / 店舗顧客一覧 / 案件詳細 / 管理ダッシュボード / 管理顧客一覧
- 各ルートに `loading.tsx`（スケルトン）を置く。**遷移直後に骨組みが出るだけで体感は大きく変わる**
- 一覧のページ送りは `useTransition` で前のデータを保持したまま切り替え、白画面を挟まない

### Phase 6: インフラ（要判断・Phase 0 の計測結果で決める）

- **リージョン**: 関数が `iad1`（米国東部）、DBも Neon `us-east-1`（同一リージョン＝関数↔DBは速い）。日本のユーザーからは1往復150〜200msが常時上乗せされる。**関数だけ東京に動かすと関数↔DBが太平洋を渡るため逆効果**。Phase 0 の診断API（`/api/admin/diagnostics/latency`）で「関数→DB」の実測を取り、
  - DBも東京/近傍へ移せる → 関数 `hnd1` ＋ DB東京（最大の効果）
  - DBを動かせない → 関数は現状維持し、リクエスト数削減（Phase 1）で稼ぐ
  のどちらかを選ぶ
- **接続プール**: `DATABASE_URL` はNeonのプール接続（`-pooler`）、`DIRECT_URL` は直結、サーバーレス向けに `connection_limit` を控えめに設定 ― 本番の設定値を確認する
- **静的化**: 公開ページ（トップ・法務表記・フォームの初期表示）に `revalidate` を付けてCDNに載せる

---

## 5. 検証方法

- **数値**: Phase 0 で入れた Speed Insights のルート別 LCP/INP/TTFB を、各フェーズの前後で比較。`Server-Timing` でAPI内訳（db/total）を確認
- **クエリ**: ローカルSQLite＋本番相当のダミーデータ（顧客5,000件・訪問30,000件）で `EXPLAIN ANALYZE` を取り、インデックス追加前後を比較
- **リクエスト数**: ブラウザのネットワークログで「1画面あたりのリクエスト本数」を数える（現状の店舗顧客詳細は12本前後）
- **バンドル**: `ANALYZE=1 next build` のルート別サイズを前後比較
- **画像**: 代表的な写真（iPhone 12MP）で保存前後のバイト数と見た目の劣化を確認。一覧画面の総転送量をネットワークログで比較
- **回帰**: 既存の実機検証フロー（スキーマをSQLiteに切替→ `s001@example.com` でログイン→主要画面を一巡）を各フェーズの最後に実施

---

## 6. リスクと進め方

| リスク | 対策 |
|---|---|
| インデックス作成でテーブルロック | 大きいテーブルは `CREATE INDEX CONCURRENTLY` を手動実行。小さいテーブルのみmigration同梱。実行は利用の少ない時間帯 |
| base64→Blob移行が不可逆 | 互換レイヤ＋二重保持期間を置き、移行完了を確認してから列削除。migrationは3段階に分ける |
| 既存画像の再エンコードで劣化・欠損 | 元ファイルを保持したまま新URLへ切替。バッチは再開可能・冪等に。まず1店舗ぶんで試す |
| セッション照合キャッシュで失効反映が遅れる | TTLは60秒。パスワード変更・端末失効の導線では即時クリアする |
| サーバーコンポーネント化での挙動差 | 6画面に限定し、UI本体はクライアントのまま移設する（描画ロジックを書き換えない） |
| 一度に全部やると原因の切り分けができない | **フェーズごとに独立してデプロイ**し、そのつど数値を記録する |

推奨する着手順は **Phase 0 → 1 → 2 → 3 → 4 → 5 →（計測結果しだいで）6**。Phase 1 と 2 だけでも、1画面あたりのリクエストが10本超→3本、DBのフルスキャンが消えるため、体感は大きく変わる見込み。
