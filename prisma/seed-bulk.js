/**
 * ダミーデータ追加スクリプト
 * 店舗50件・顧客50件（既存データはスキップ）
 * 実行: node prisma/seed-bulk.js
 */

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

// ─── 店舗データ（45件追加 → 既存5件と合わせて50件） ────────────────────────
const STORES = [
  { code: 'S006', name: '買いクル横浜店',    prefecture: '神奈川県', address: '神奈川県横浜市西区みなとみらい2-2-1',     phone: '045-111-2222', email: 'yokohama@kaikuru.jp' },
  { code: 'S007', name: '買いクル川崎店',    prefecture: '神奈川県', address: '神奈川県川崎市川崎区駅前本町1-1',         phone: '044-111-2222', email: 'kawasaki@kaikuru.jp' },
  { code: 'S008', name: '買いクル京都店',    prefecture: '京都府',   address: '京都府京都市下京区四条通烏丸1-1',         phone: '075-111-2222', email: 'kyoto@kaikuru.jp' },
  { code: 'S009', name: '買いクル神戸店',    prefecture: '兵庫県',   address: '兵庫県神戸市中央区元町通1-1-1',           phone: '078-111-2222', email: 'kobe@kaikuru.jp' },
  { code: 'S010', name: '買いクル仙台店',    prefecture: '宮城県',   address: '宮城県仙台市青葉区中央1-1-1',             phone: '022-111-2222', email: 'sendai@kaikuru.jp' },
  { code: 'S011', name: '買いクル広島店',    prefecture: '広島県',   address: '広島県広島市中区基町1-1-1',               phone: '082-111-2222', email: 'hiroshima@kaikuru.jp' },
  { code: 'S012', name: '買いクル千葉店',    prefecture: '千葉県',   address: '千葉県千葉市中央区富士見2-1-1',           phone: '043-111-2222', email: 'chiba@kaikuru.jp' },
  { code: 'S013', name: '買いクルさいたま店', prefecture: '埼玉県',  address: '埼玉県さいたま市大宮区桜木町1-1',         phone: '048-111-2222', email: 'saitama@kaikuru.jp' },
  { code: 'S014', name: '買いクル新潟店',    prefecture: '新潟県',   address: '新潟県新潟市中央区東大通1-1-1',           phone: '025-111-2222', email: 'niigata@kaikuru.jp' },
  { code: 'S015', name: '買いクル浜松店',    prefecture: '静岡県',   address: '静岡県浜松市中区板屋町111',               phone: '053-111-2222', email: 'hamamatsu@kaikuru.jp' },
  { code: 'S016', name: '買いクル静岡店',    prefecture: '静岡県',   address: '静岡県静岡市葵区御幸町1-1',               phone: '054-111-2222', email: 'shizuoka@kaikuru.jp' },
  { code: 'S017', name: '買いクル岡山店',    prefecture: '岡山県',   address: '岡山県岡山市北区本町6-36',                phone: '086-111-2222', email: 'okayama@kaikuru.jp' },
  { code: 'S018', name: '買いクル熊本店',    prefecture: '熊本県',   address: '熊本県熊本市中央区手取本町1-1',           phone: '096-111-2222', email: 'kumamoto@kaikuru.jp' },
  { code: 'S019', name: '買いクル鹿児島店',  prefecture: '鹿児島県', address: '鹿児島県鹿児島市山之口町1-1',             phone: '099-111-2222', email: 'kagoshima@kaikuru.jp' },
  { code: 'S020', name: '買いクル那覇店',    prefecture: '沖縄県',   address: '沖縄県那覇市久茂地1-1-1',                 phone: '098-111-2222', email: 'naha@kaikuru.jp' },
  { code: 'S021', name: '買いクル金沢店',    prefecture: '石川県',   address: '石川県金沢市南町4-55',                    phone: '076-111-2222', email: 'kanazawa@kaikuru.jp' },
  { code: 'S022', name: '買いクル富山店',    prefecture: '富山県',   address: '富山県富山市桜町1-1-36',                  phone: '076-911-2222', email: 'toyama@kaikuru.jp' },
  { code: 'S023', name: '買いクル松山店',    prefecture: '愛媛県',   address: '愛媛県松山市一番町3-1-1',                 phone: '089-111-2222', email: 'matsuyama@kaikuru.jp' },
  { code: 'S024', name: '買いクル高松店',    prefecture: '香川県',   address: '香川県高松市兵庫町1-1',                   phone: '087-111-2222', email: 'takamatsu@kaikuru.jp' },
  { code: 'S025', name: '買いクル長崎店',    prefecture: '長崎県',   address: '長崎県長崎市尾上町1-1',                   phone: '095-111-2222', email: 'nagasaki@kaikuru.jp' },
  { code: 'S026', name: '買いクル秋田店',    prefecture: '秋田県',   address: '秋田県秋田市中通2-3-8',                   phone: '018-111-2222', email: 'akita@kaikuru.jp' },
  { code: 'S027', name: '買いクル青森店',    prefecture: '青森県',   address: '青森県青森市新町1-1-1',                   phone: '017-111-2222', email: 'aomori@kaikuru.jp' },
  { code: 'S028', name: '買いクル盛岡店',    prefecture: '岩手県',   address: '岩手県盛岡市内丸1-1',                     phone: '019-111-2222', email: 'morioka@kaikuru.jp' },
  { code: 'S029', name: '買いクル山形店',    prefecture: '山形県',   address: '山形県山形市香澄町3-2-1',                 phone: '023-111-2222', email: 'yamagata@kaikuru.jp' },
  { code: 'S030', name: '買いクル福島店',    prefecture: '福島県',   address: '福島県福島市栄町11-1',                    phone: '024-111-2222', email: 'fukushima@kaikuru.jp' },
  { code: 'S031', name: '買いクル宇都宮店',  prefecture: '栃木県',   address: '栃木県宇都宮市馬場通り1-1-1',             phone: '028-111-2222', email: 'utsunomiya@kaikuru.jp' },
  { code: 'S032', name: '買いクル前橋店',    prefecture: '群馬県',   address: '群馬県前橋市大手町2-1-1',                 phone: '027-111-2222', email: 'maebashi@kaikuru.jp' },
  { code: 'S033', name: '買いクル水戸店',    prefecture: '茨城県',   address: '茨城県水戸市三の丸1-1-38',               phone: '029-111-2222', email: 'mito@kaikuru.jp' },
  { code: 'S034', name: '買いクル甲府店',    prefecture: '山梨県',   address: '山梨県甲府市丸の内1-1-18',               phone: '055-111-2222', email: 'kofu@kaikuru.jp' },
  { code: 'S035', name: '買いクル長野店',    prefecture: '長野県',   address: '長野県長野市大字南長野幅下692-2',         phone: '026-111-2222', email: 'nagano@kaikuru.jp' },
  { code: 'S036', name: '買いクル岐阜店',    prefecture: '岐阜県',   address: '岐阜県岐阜市今沢町18',                    phone: '058-111-2222', email: 'gifu@kaikuru.jp' },
  { code: 'S037', name: '買いクル津店',      prefecture: '三重県',   address: '三重県津市西丸之内23-1',                  phone: '059-111-2222', email: 'tsu@kaikuru.jp' },
  { code: 'S038', name: '買いクル大津店',    prefecture: '滋賀県',   address: '滋賀県大津市京町4-1-1',                   phone: '077-111-2222', email: 'otsu@kaikuru.jp' },
  { code: 'S039', name: '買いクル奈良店',    prefecture: '奈良県',   address: '奈良県奈良市登大路町30',                  phone: '0742-111-222', email: 'nara@kaikuru.jp' },
  { code: 'S040', name: '買いクル和歌山店',  prefecture: '和歌山県', address: '和歌山県和歌山市小松原通1-1',             phone: '073-111-2222', email: 'wakayama@kaikuru.jp' },
  { code: 'S041', name: '買いクル鳥取店',    prefecture: '鳥取県',   address: '鳥取県鳥取市東町1-271',                   phone: '0857-111-222', email: 'tottori@kaikuru.jp' },
  { code: 'S042', name: '買いクル松江店',    prefecture: '島根県',   address: '島根県松江市殿町1',                       phone: '0852-111-222', email: 'matsue@kaikuru.jp' },
  { code: 'S043', name: '買いクル山口店',    prefecture: '山口県',   address: '山口県山口市滝町1-1',                     phone: '083-111-2222', email: 'yamaguchi@kaikuru.jp' },
  { code: 'S044', name: '買いクル徳島店',    prefecture: '徳島県',   address: '徳島県徳島市万代町1-1',                   phone: '088-111-2222', email: 'tokushima@kaikuru.jp' },
  { code: 'S045', name: '買いクル高知店',    prefecture: '高知県',   address: '高知県高知市丸ノ内1-2-20',               phone: '088-811-2222', email: 'kochi@kaikuru.jp' },
  { code: 'S046', name: '買いクル大分店',    prefecture: '大分県',   address: '大分県大分市大手町3-1-1',                 phone: '097-111-2222', email: 'oita@kaikuru.jp' },
  { code: 'S047', name: '買いクル宮崎店',    prefecture: '宮崎県',   address: '宮崎県宮崎市橘通東1-9-10',               phone: '0985-111-222', email: 'miyazaki@kaikuru.jp' },
  { code: 'S048', name: '買いクル佐賀店',    prefecture: '佐賀県',   address: '佐賀県佐賀市城内1-1-59',                  phone: '0952-111-222', email: 'saga@kaikuru.jp' },
  { code: 'S049', name: '買いクル姫路店',    prefecture: '兵庫県',   address: '兵庫県姫路市安田4-1',                     phone: '079-111-2222', email: 'himeji@kaikuru.jp' },
  { code: 'S050', name: '買いクル相模原店',  prefecture: '神奈川県', address: '神奈川県相模原市中央区中央2-11-15',       phone: '042-111-2222', email: 'sagamihara@kaikuru.jp' },
]

// ─── 顧客データ（48件追加 → 既存2件と合わせて50件） ─────────────────────────
const CUSTOMERS = [
  { name: '佐藤健一',   furigana: 'さとうけんいち',   email: 'sato.kenichi@example.com',    phone: '090-0001-0001', address: '東京都墨田区押上1-1-2',            storeCode: 'S001' },
  { name: '鈴木美咲',   furigana: 'すずきみさき',     email: 'suzuki.misaki@example.com',   phone: '090-0001-0002', address: '東京都台東区浅草2-3-4',            storeCode: 'S001' },
  { name: '高橋誠',     furigana: 'たかはしまこと',   email: 'takahashi.makoto@example.com',phone: '090-0001-0003', address: '東京都世田谷区三軒茶屋1-5-6',     storeCode: 'S001' },
  { name: '渡辺陽菜',   furigana: 'わたなべひな',     email: 'watanabe.hina@example.com',   phone: '090-0001-0004', address: '東京都練馬区豊玉北2-13-1',         storeCode: 'S001' },
  { name: '伊藤翔',     furigana: 'いとうしょう',     email: 'ito.sho@example.com',         phone: '090-0001-0005', address: '東京都杉並区高円寺南3-44-18',      storeCode: 'S001' },
  { name: '中村幸子',   furigana: 'なかむらゆきこ',   email: 'nakamura.yukiko@example.com', phone: '090-0001-0006', address: '神奈川県横浜市港北区新横浜3-7-1',  storeCode: 'S006' },
  { name: '山本大輝',   furigana: 'やまもとだいき',   email: 'yamamoto.daiki@example.com',  phone: '090-0001-0007', address: '神奈川県横浜市西区南幸1-1-1',      storeCode: 'S006' },
  { name: '小林愛',     furigana: 'こばやしあい',     email: 'kobayashi.ai@example.com',    phone: '090-0001-0008', address: '神奈川県川崎市幸区大宮町1-5',      storeCode: 'S007' },
  { name: '加藤直樹',   furigana: 'かとうなおき',     email: 'kato.naoki@example.com',      phone: '090-0001-0009', address: '神奈川県川崎市中原区木月1-28-1',   storeCode: 'S007' },
  { name: '吉田さくら', furigana: 'よしださくら',     email: 'yoshida.sakura@example.com',  phone: '090-0001-0010', address: '大阪府大阪市浪速区難波中2-10-70',  storeCode: 'S002' },
  { name: '山口博',     furigana: 'やまぐちひろし',   email: 'yamaguchi.hiroshi@example.com',phone: '090-0001-0011', address: '大阪府大阪市天王寺区四天王寺1-1',  storeCode: 'S002' },
  { name: '松本莉子',   furigana: 'まつもとりこ',     email: 'matsumoto.riko@example.com',  phone: '090-0001-0012', address: '大阪府堺市堺区南瓦町3-1',          storeCode: 'S002' },
  { name: '井上雄大',   furigana: 'いのうえゆうた',   email: 'inoue.yuta@example.com',      phone: '090-0001-0013', address: '京都府京都市左京区岡崎円勝寺町1',  storeCode: 'S008' },
  { name: '木村麻衣',   furigana: 'きむらまい',       email: 'kimura.mai@example.com',      phone: '090-0001-0014', address: '京都府京都市伏見区桃山町泰長老',    storeCode: 'S008' },
  { name: '林拓也',     furigana: 'はやしたくや',     email: 'hayashi.takuya@example.com',  phone: '090-0001-0015', address: '兵庫県神戸市灘区六甲台町1',        storeCode: 'S009' },
  { name: '斎藤未来',   furigana: 'さいとうみく',     email: 'saito.miku@example.com',      phone: '090-0001-0016', address: '兵庫県神戸市中央区加納町4-2-1',    storeCode: 'S009' },
  { name: '清水一郎',   furigana: 'しみずいちろう',   email: 'shimizu.ichiro@example.com',  phone: '090-0001-0017', address: '愛知県名古屋市千種区四谷通1-11',   storeCode: 'S003' },
  { name: '山崎千代',   furigana: 'やまざきちよ',     email: 'yamazaki.chiyo@example.com',  phone: '090-0001-0018', address: '愛知県名古屋市熱田区神宮3-1-1',    storeCode: 'S003' },
  { name: '中島健太',   furigana: 'なかしまけんた',   email: 'nakajima.kenta@example.com',  phone: '090-0001-0019', address: '愛知県豊田市元城町4-45',           storeCode: 'S003' },
  { name: '池田花奈',   furigana: 'いけだかな',       email: 'ikeda.kana@example.com',      phone: '090-0001-0020', address: '福岡県福岡市中央区天神1-1-1',      storeCode: 'S004' },
  { name: '阿部純',     furigana: 'あべじゅん',       email: 'abe.jun@example.com',         phone: '090-0001-0021', address: '福岡県福岡市博多区比恵町6-1',      storeCode: 'S004' },
  { name: '橋本咲',     furigana: 'はしもとさき',     email: 'hashimoto.saki@example.com',  phone: '090-0001-0022', address: '福岡県北九州市小倉北区城内1-1',    storeCode: 'S004' },
  { name: '石川翼',     furigana: 'いしかわつばさ',   email: 'ishikawa.tsubasa@example.com',phone: '090-0001-0023', address: '北海道札幌市豊平区平岸3-3-8',      storeCode: 'S005' },
  { name: '前田奈々',   furigana: 'まえだなな',       email: 'maeda.nana@example.com',      phone: '090-0001-0024', address: '北海道函館市元町12-18',            storeCode: 'S005' },
  { name: '藤田修平',   furigana: 'ふじたしゅうへい', email: 'fujita.shuhei@example.com',   phone: '090-0001-0025', address: '宮城県仙台市宮城野区五輪1-3-15',   storeCode: 'S010' },
  { name: '後藤彩香',   furigana: 'ごとうあやか',     email: 'goto.ayaka@example.com',      phone: '090-0001-0026', address: '宮城県仙台市若林区若林3-16-1',     storeCode: 'S010' },
  { name: '小川竜也',   furigana: 'おがわたつや',     email: 'ogawa.tatsuya@example.com',   phone: '090-0001-0027', address: '広島県広島市安佐南区祇園3-26-1',   storeCode: 'S011' },
  { name: '岡田理沙',   furigana: 'おかだりさ',       email: 'okada.risa@example.com',      phone: '090-0001-0028', address: '広島県福山市三吉町1-1-1',          storeCode: 'S011' },
  { name: '長谷川浩',   furigana: 'はせがわひろし',   email: 'hasegawa.hiroshi@example.com',phone: '090-0001-0029', address: '千葉県千葉市花見川区作新台1-1',     storeCode: 'S012' },
  { name: '村上紗耶',   furigana: 'むらかみさや',     email: 'murakami.saya@example.com',   phone: '090-0001-0030', address: '千葉県松戸市二十世紀が丘美野里町1', storeCode: 'S012' },
  { name: '近藤光',     furigana: 'こんどうひかる',   email: 'kondo.hikaru@example.com',    phone: '090-0001-0031', address: '埼玉県さいたま市浦和区常盤9-30-1',  storeCode: 'S013' },
  { name: '石田由美',   furigana: 'いしだゆみ',       email: 'ishida.yumi@example.com',     phone: '090-0001-0032', address: '埼玉県川越市郭町2-25-1',           storeCode: 'S013' },
  { name: '坂本陸',     furigana: 'さかもとりく',     email: 'sakamoto.riku@example.com',   phone: '090-0001-0033', address: '新潟県新潟市東区紫竹山6-6-1',      storeCode: 'S014' },
  { name: '遠藤玲奈',   furigana: 'えんどうれな',     email: 'endo.rena@example.com',       phone: '090-0001-0034', address: '静岡県浜松市北区初生町1484',        storeCode: 'S015' },
  { name: '青木凌',     furigana: 'あおきりょう',     email: 'aoki.ryo@example.com',        phone: '090-0001-0035', address: '静岡県静岡市駿河区南安倍2-1-1',    storeCode: 'S016' },
  { name: '藤井桃子',   furigana: 'ふじいももこ',     email: 'fujii.momoko@example.com',    phone: '090-0001-0036', address: '岡山県岡山市南区妹尾3-14-1',       storeCode: 'S017' },
  { name: '西村勇輝',   furigana: 'にしむらゆうき',   email: 'nishimura.yuki@example.com',  phone: '090-0001-0037', address: '熊本県熊本市東区長嶺南2-5-1',      storeCode: 'S018' },
  { name: '福田あかり', furigana: 'ふくだあかり',     email: 'fukuda.akari@example.com',    phone: '090-0001-0038', address: '鹿児島県鹿児島市武岡3-28-1',       storeCode: 'S019' },
  { name: '太田蓮',     furigana: 'おおたれん',       email: 'ota.ren@example.com',         phone: '090-0001-0039', address: '沖縄県那覇市古島1-3-1',            storeCode: 'S020' },
  { name: '三浦柚希',   furigana: 'みうらゆうき',     email: 'miura.yuki@example.com',      phone: '090-0001-0040', address: '石川県金沢市泉野出町3-13-1',       storeCode: 'S021' },
  { name: '岡本悠人',   furigana: 'おかもとゆうと',   email: 'okamoto.yuto@example.com',    phone: '090-0001-0041', address: '富山県富山市婦中町砂子田1',        storeCode: 'S022' },
  { name: '松田萌',     furigana: 'まつだもえ',       email: 'matsuda.moe@example.com',     phone: '090-0001-0042', address: '愛媛県松山市三番町3-7-2',          storeCode: 'S023' },
  { name: '中川蒼',     furigana: 'なかがわあお',     email: 'nakagawa.ao@example.com',     phone: '090-0001-0043', address: '香川県高松市番町1-10-35',          storeCode: 'S024' },
  { name: '中野朱里',   furigana: 'なかのあかり',     email: 'nakano.akari@example.com',    phone: '090-0001-0044', address: '長崎県長崎市江戸町2-13',           storeCode: 'S025' },
  { name: '原田剛',     furigana: 'はらだつよし',     email: 'harada.tsuyoshi@example.com', phone: '090-0001-0045', address: '秋田県秋田市山王3-1-1',            storeCode: 'S026' },
  { name: '小野杏奈',   furigana: 'おのあんな',       email: 'ono.anna@example.com',        phone: '090-0001-0046', address: '青森県青森市長島1-1-1',            storeCode: 'S027' },
  { name: '田村颯',     furigana: 'たむらそう',       email: 'tamura.so@example.com',       phone: '090-0001-0047', address: '岩手県盛岡市内丸10-1',            storeCode: 'S028' },
  { name: '桜井七海',   furigana: 'さくらいななみ',   email: 'sakurai.nanami@example.com',  phone: '090-0001-0048', address: '山形県山形市旅篭町2-3-25',         storeCode: 'S029' },
]

async function main() {
  console.log('ダミーデータ追加スクリプト開始...\n')

  const storePassword = await bcrypt.hash('store1234', 10)
  const userPassword  = await bcrypt.hash('user1234', 10)

  // ─── 店舗を追加 ───────────────────────────────────────────────────────────
  let storeCreated = 0
  let storeSkipped = 0

  for (const store of STORES) {
    const existing = await prisma.store.findUnique({ where: { code: store.code } })
    if (existing) { storeSkipped++; continue }
    await prisma.store.create({ data: { ...store, password: storePassword } })
    storeCreated++
  }
  console.log(`✓ 店舗: ${storeCreated}件追加 / ${storeSkipped}件スキップ（既存）`)

  // ─── ライセンスキーを生成して顧客を追加 ──────────────────────────────────
  let userCreated = 0
  let userSkipped = 0

  for (let i = 0; i < CUSTOMERS.length; i++) {
    const c = CUSTOMERS[i]
    const existing = await prisma.user.findUnique({ where: { email: c.email } })
    if (existing) { userSkipped++; continue }

    // ライセンスキーを作成（未使用・ユニーク）
    const keyStr = `KK-BULK-${String(i + 1).padStart(4, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const licKey = await prisma.licenseKey.create({ data: { key: keyStr, isUsed: true } })

    // 担当店舗を取得
    const store = await prisma.store.findUnique({ where: { code: c.storeCode } })

    await prisma.user.create({
      data: {
        name:         c.name,
        furigana:     c.furigana,
        email:        c.email,
        phone:        c.phone,
        address:      c.address,
        password:     userPassword,
        licenseKeyId: licKey.id,
        storeId:      store?.id ?? null,
        // 登録日をばらつかせる（過去30〜365日）
        createdAt: new Date(Date.now() - (Math.floor(Math.random() * 335) + 30) * 86400000),
      },
    })
    userCreated++
  }
  console.log(`✓ 顧客: ${userCreated}件追加 / ${userSkipped}件スキップ（既存）`)

  // ─── 訪問スケジュールをランダムに追加 ────────────────────────────────────
  const allUsers  = await prisma.user.findMany({ where: { storeId: { not: null } }, select: { id: true, storeId: true } })
  const statuses  = ['scheduled', 'completed', 'completed', 'cancelled']

  let scheduleCreated = 0
  for (const user of allUsers) {
    // ランダムで0〜2件のスケジュールを追加（既存ユーザーへの重複追加は許容）
    const count = Math.floor(Math.random() * 3)
    for (let k = 0; k < count; k++) {
      const daysOffset = Math.floor(Math.random() * 120) - 60 // -60〜+60日
      const visitDate  = new Date(Date.now() + daysOffset * 86400000)
      const status     = daysOffset < 0
        ? statuses[Math.floor(Math.random() * 3) + 1]  // 過去 → completed or cancelled
        : 'scheduled'

      await prisma.visitSchedule.create({
        data: { userId: user.id, storeId: user.storeId, visitDate, status },
      })
      scheduleCreated++
    }
  }
  console.log(`✓ 訪問スケジュール: ${scheduleCreated}件追加`)

  // ─── 集計 ────────────────────────────────────────────────────────────────
  const totalStores    = await prisma.store.count()
  const totalUsers     = await prisma.user.count()
  const totalSchedules = await prisma.visitSchedule.count()

  console.log('\n=== 最終データ件数 ===')
  console.log(`店舗: ${totalStores}件`)
  console.log(`顧客: ${totalUsers}件`)
  console.log(`訪問スケジュール: ${totalSchedules}件`)
  console.log('\nダミーデータ追加完了！')
}

main().catch(console.error).finally(() => prisma.$disconnect())
