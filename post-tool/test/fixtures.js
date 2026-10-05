// テスト用の架空データ。実在の店舗・施設とは関係ありません。
import { insertRow } from '../src/db.js';

export function seedSampleData(db, user = 'テスト担当') {
  const c1 = insertRow(db, 'clients', { name: 'サンプル飲食グループ（架空）', contact_person: '山田 花子', notes: '月2回投稿' }, user);
  const b1 = insertRow(db, 'brands', {
    client_id: c1.id,
    name: 'バル・ソレイユ（架空）',
    industry: 'スペイン料理',
    features: '鉄板で仕上げるパエリアと、タパスを気軽に楽しめるスペインバル',
    tone: '明るく親しみやすい',
    preferred_phrases: 'タパス、シェアして楽しむ',
    avoid_phrases: '激安\n日本一',
    notes: '価格は税込表記',
  }, user);
  const s1 = insertRow(db, 'stores', {
    brand_id: b1.id,
    name: 'バル・ソレイユ 新浦安店',
    area: '新浦安',
    address: '千葉県浦安市テスト町1-1 テストモール新浦安 3階',
    google_maps_url: 'https://maps.example.com/soleil-shinurayasu',
    business_hours: '11:00〜22:00（L.O. 21:00）',
    regular_holidays: '施設の休館日に準ずる',
    reservation_method: 'Web予約',
    reservation_url: 'https://reserve.example.com/soleil-shinurayasu',
    atmosphere: 'テラコッタ調の明るい店内で、ベビーカーでも入りやすい広めの通路',
    use_scenes: 'お買い物途中のランチ、家族での食事、友人との女子会',
    target: 'ファミリー、近隣の買い物客',
    features: 'ランチタイムはパエリアのハーフサイズを用意',
    facilities: 'キッズチェアあり',
    access: 'JR新浦安駅から徒歩5分',
    floor_info: 'テストモール新浦安 3階',
    cta_options: JSON.stringify([{ type: 'BOOK', url: 'https://reserve.example.com/soleil-shinurayasu' }, { type: 'LEARN_MORE', url: 'https://soleil.example.com/shinurayasu' }]),
    verified_at: '2026-09-20',
    verified_source: '店長へのヒアリング',
    verified_by: '山田 花子',
  }, user);
  insertRow(db, 'menu_items', { store_id: s1.id, name: '魚介のパエリア', description: 'エビやムール貝をたっぷり使い、鉄鍋で炊き上げるパエリア', price: '1,980円', sales_period: '通年' }, user);
  insertRow(db, 'menu_items', { store_id: s1.id, name: '秋のきのこアヒージョ', description: '数種類のきのこをオリーブオイルとにんにくで煮込んだアヒージョ', price: '880円', sales_period: '2026年9月1日〜11月30日' }, user);

  const s2 = insertRow(db, 'stores', {
    brand_id: b1.id,
    name: 'バル・ソレイユ 海浜幕張店',
    area: '海浜幕張',
    address: '千葉県千葉市美浜区テスト2-2 テストプラザ幕張 1階',
    business_hours: '17:00〜23:00',
    regular_holidays: '月曜日',
    reservation_method: '電話またはWeb予約',
    reservation_url: 'https://reserve.example.com/soleil-makuhari',
    atmosphere: 'カウンター中心の落ち着いたバル空間',
    use_scenes: '仕事帰りの一杯、少人数での飲み会',
    access: 'JR海浜幕張駅南口から徒歩3分',
    floor_info: 'テストプラザ幕張 1階',
    cta_options: JSON.stringify([{ type: 'BOOK', url: 'https://reserve.example.com/soleil-makuhari' }]),
    verified_at: '2026-04-01',
    verified_source: '公式サイト',
    verified_by: '山田 花子',
  }, user);
  insertRow(db, 'menu_items', { store_id: s2.id, name: 'イベリコ豚の鉄板焼き', description: '香ばしく焼き上げたイベリコ豚', price: '2,480円', sales_period: '通年' }, user);

  const c2 = insertRow(db, 'clients', { name: '和食テスト株式会社（架空）', contact_person: '佐藤 一郎' }, user);
  const b2 = insertRow(db, 'brands', { client_id: c2.id, name: '蕎麦処 テスト庵（架空）', industry: '蕎麦・和食', tone: '落ち着いた丁寧な文体' }, user);
  const s3 = insertRow(db, 'stores', {
    brand_id: b2.id,
    name: '蕎麦処 テスト庵 合羽橋店',
    area: '合羽橋',
    address: '東京都台東区テスト3-3',
    business_hours: '11:30〜15:00',
    atmosphere: '木のぬくもりを感じる小さな店',
  }, user);
  insertRow(db, 'menu_items', { store_id: s3.id, name: '手打ちせいろ', description: '毎朝店内で打つ二八蕎麦', price: '950円' }, user);

  return { c1, b1, s1, s2, c2, b2, s3 };
}
