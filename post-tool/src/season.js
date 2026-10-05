// 投稿予定日と地域から季節を判定し、季節表現の整合性を確認する。
export const SEASONS = {
  spring: { ja: '春', months: [3, 4, 5] },
  summer: { ja: '夏', months: [6, 7, 8] },
  autumn: { ja: '秋', months: [9, 10, 11] },
  winter: { ja: '冬', months: [12, 1, 2] },
};

// 季節を強く示す語。誤判定を避けるため、ほかの季節でも使われやすい語は入れない。
export const SEASON_WORDS = {
  spring: ['春の', 'この春', '春らしい', '春に', '桜', 'お花見', '花見', '新緑', '新生活', '春爛漫', 'ひなまつり', '入学', '卒業'],
  summer: ['夏の', 'この夏', '夏らしい', '夏に', '猛暑', '暑い日', '暑さ', '夏休み', '花火', '夏祭り', 'お盆', '梅雨', '涼しげ', '涼やか'],
  autumn: ['秋の', 'この秋', '秋らしい', '秋に', '紅葉', '実りの季節', '食欲の秋', '行楽', 'ハロウィン', '月見', '秋風', '新米'],
  winter: ['冬の', 'この冬', '冬らしい', '冬に', '寒い日', '寒さ', '雪景色', '雪の', 'クリスマス', '年末', '忘年会', '新年会', 'お正月', '年始', '凍える'],
};

export const EN_SEASON_WORDS = {
  spring: ['spring', 'cherry blossom', 'sakura'],
  summer: ['summer', 'heat', 'hot days'],
  autumn: ['autumn', 'fall season', 'fall foliage', 'halloween'],
  winter: ['winter', 'christmas', 'snow', 'cold days', 'new year', 'year-end'],
};

export function seasonOf(dateStr) {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const month = Number(m[2]);
  for (const [key, s] of Object.entries(SEASONS)) if (s.months.includes(month)) return key;
  return null;
}

// 季節表現の方針を決める。地域差が大きい地域は担当者確認を促す。
export function seasonPlan({ postDate, useSeason, address }) {
  const notes = [];
  const season = seasonOf(postDate);
  if (!useSeason) return { use: false, season: null, notes };
  if (!season) {
    notes.push('投稿予定日が未入力のため、季節に依存しない文章で作成しました。');
    return { use: false, season: null, notes };
  }
  if (/沖縄|北海道/.test(address || '')) {
    notes.push('店舗所在地は本州と季節感が異なる地域です。季節表現が地域の実感に合うか確認してください。');
  }
  const month = Number(postDate.slice(5, 7));
  return { use: true, season, label: `${month}月（${SEASONS[season].ja}）`, notes };
}

function containsWord(text, word) {
  return text.toLowerCase().includes(word.toLowerCase());
}

// ignore: 店舗名・地域名など、季節語を含みうる固有名詞（例: 秋葉原）は判定から除く。
export function findSeasonWords(text, lang = 'ja', ignore = []) {
  for (const name of ignore) if (name) text = text.split(name).join('');
  const dict = lang === 'en' ? EN_SEASON_WORDS : SEASON_WORDS;
  const hits = [];
  for (const [season, words] of Object.entries(dict)) {
    for (const w of words) if (containsWord(text, w)) hits.push({ season, word: w });
  }
  return hits;
}
