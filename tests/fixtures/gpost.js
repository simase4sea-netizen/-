// Google投稿作成のテスト用データ（架空。実在の店舗・施設とは関係ありません）
const GP = require('../../app/js/core/gpost.js');
const SPEC = require('../../app/config/google-spec.default.js');

function state() {
  const brand = Object.assign(GP.emptyBrand(), { id: 'brand_soleil', name: 'バル・ソレイユ（架空）', industry: 'スペイン料理', features: '鉄板で仕上げるパエリアと、タパスを気軽に楽しめるスペインバル', tone: '明るく親しみやすい', avoidPhrases: '激安\n日本一', notes: '価格は税込表記' });
  const s1 = {
    id: 'store_s1', name: 'バル・ソレイユ 新浦安店', kind: 'client', aliases: [],
    gpost: Object.assign(GP.emptyStoreInfo(), {
      brandId: brand.id, area: '新浦安', address: '千葉県浦安市テスト町1-1 テストモール新浦安 3階', mapsUrl: 'https://maps.example.com/soleil-shinurayasu',
      access: 'JR新浦安駅から徒歩5分', floorInfo: 'テストモール新浦安 3階', hours: '11:00〜22:00（L.O. 21:00）', holidays: '施設の休館日に準ずる',
      reserveMethod: 'Web予約', reserveUrl: 'https://reserve.example.com/soleil-shinurayasu', atmosphere: 'テラコッタ調の明るい店内',
      scenes: 'お買い物途中のランチ、家族での食事', features: 'ランチタイムはパエリアのハーフサイズを用意',
      ctaOptions: [{ type: 'BOOK', url: 'https://reserve.example.com/soleil-shinurayasu' }], verifiedAt: '2026-09-20', verifiedSource: '店長', verifiedBy: '嶋野',
      menu: [
        { id: 'm1', name: '魚介のパエリア', description: 'エビやムール貝をたっぷり使い、鉄鍋で炊き上げるパエリア', price: '1,980円', period: '通年' },
        { id: 'm2', name: '秋のきのこアヒージョ', description: 'きのこのアヒージョ', price: '880円', period: '2026年9月1日〜11月30日' },
      ],
    }),
  };
  const s2 = {
    id: 'store_s2', name: 'バル・ソレイユ 海浜幕張店', kind: 'client', aliases: [],
    gpost: Object.assign(GP.emptyStoreInfo(), {
      brandId: brand.id, area: '海浜幕張', address: '千葉県千葉市美浜区テスト2-2 テストプラザ幕張 1階', access: 'JR海浜幕張駅南口から徒歩3分', floorInfo: 'テストプラザ幕張 1階',
      hours: '17:00〜23:00', holidays: '月曜日', reserveUrl: 'https://reserve.example.com/soleil-makuhari', atmosphere: 'カウンター中心の落ち着いたバル空間',
      scenes: '仕事帰りの一杯', ctaOptions: [{ type: 'BOOK', url: 'https://reserve.example.com/soleil-makuhari' }], verifiedAt: '2026-04-01',
      menu: [{ id: 'm3', name: 'イベリコ豚の鉄板焼き', description: '香ばしく焼き上げたイベリコ豚', price: '2,480円', period: '通年' }],
    }),
  };
  // 登録情報がほとんど無い店舗（未登録情報を補わないことの確認用）
  const s3 = { id: 'store_s3', name: '蕎麦処 テスト庵', kind: 'client', aliases: [], gpost: Object.assign(GP.emptyStoreInfo(), { address: '東京都台東区テスト3-3', menu: [{ id: 'm4', name: '手打ちせいろ', price: '950円' }] }) };
  const own = { id: 'store_own_3', name: '出世魚', kind: 'own', aliases: [], memo: '' };
  return { stores: [own, s1, s2, s3], gpost: { brands: [brand], posts: [], spec: JSON.parse(JSON.stringify(SPEC)), specHistory: [] } };
}

module.exports = { GP, SPEC, state };
