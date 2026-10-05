// デモ・テスト用の生成器。外部通信をせず、登録情報だけを差し込んだ定型文を作る。
// 文章品質は AI 生成に及ばないため、画面上で「デモ生成」と明示する。
export const name = 'mock';

export function isConfigured() {
  return true;
}

const SEASON_INTRO = {
  spring: 'やわらかな日差しが心地よい春の日。',
  summer: '日差しがまぶしい夏の日。',
  autumn: '過ごしやすい日が増えてきた秋の日。',
  winter: '空気が澄んでくる冬の日。',
};

const ANGLES = [
  { key: '地域と利用体験', copy: (c) => c.area && c.item ? `${c.area}で楽しむ、${c.item}のひととき` : null },
  { key: '商品名や料理ジャンル', copy: (c) => c.item ? `${c.item}を、${c.store}で` : null },
  { key: '店内で過ごす時間や利用シーン', copy: (c) => c.area ? `${c.area}で囲む、${c.store}の食卓` : null },
];

function firstLine(text) {
  return String(text || '').split(/\n|。/)[0];
}

export async function generate(ctx) {
  const f = ctx.store.facts;
  const p = ctx.post;
  const c = { area: ctx.store.area, item: p.mainItem, store: ctx.store.name };
  const sets = [];
  for (let i = 0; i < ctx.setCount; i += 1) {
    const angle = ANGLES[i % ANGLES.length];
    const catchcopy = angle.copy(c) || `${ctx.store.name}で過ごす時間`;
    const used = [];
    const paras = [];
    paras.push(`＼${catchcopy}／`);
    const intro = ctx.season.use ? SEASON_INTRO[ctx.season.season] : '';
    paras.push(`${intro}${ctx.store.area ? `${ctx.store.area}の` : ''}${ctx.store.name}から、${p.theme || 'お店'}のご案内です✨`);
    const place = [f['施設名・階数'], f['アクセス']].filter(Boolean);
    if (place.length) { paras.push(`お店は${place.join('。')}。`); used.push(...place); }
    if (p.mainItem) {
      const reg = p.mainItemRegistered;
      let s = `今回ご紹介するのは「${p.mainItem}」。`;
      if (reg?.description) { s += `${reg.description}。`; used.push(reg.description); }
      if (p.features) { s += `${p.features}。`; used.push(p.features); }
      if (p.price) { s += `価格は${p.price}です。`; used.push(p.price); }
      if (p.salesPeriod) { s += `販売期間は${p.salesPeriod}。`; used.push(p.salesPeriod); }
      paras.push(s);
    }
    if (f['店舗の雰囲気']) { paras.push(`店内は${firstLine(f['店舗の雰囲気'])}。`); used.push(f['店舗の雰囲気']); }
    if (f['主な利用シーン']) { paras.push(`${firstLine(f['主な利用シーン'])}など、さまざまな場面でご利用いただけます🍽️`); used.push(f['主な利用シーン']); }
    if (f['店舗独自の特徴']) { paras.push(`${firstLine(f['店舗独自の特徴'])}も、${ctx.store.name}ならではの魅力です。`); used.push(f['店舗独自の特徴']); }
    if (f['営業時間']) { paras.push(`営業時間：${f['営業時間']}${f['定休日'] ? `（定休日：${f['定休日']}）` : ''}`); used.push(f['営業時間']); }
    const closing = p.cta?.type === 'BOOK' ? 'ご予約はボタンから承っております。' : '';
    paras.push(`${ctx.store.area ? `${ctx.store.area}で` : ''}${ctx.brand.industry || 'お食事'}のお店をお探しの方は、ぜひお立ち寄りください。${closing}皆さまのご来店をお待ちしております😊`);
    const bodyJa = paras.join('\n\n');

    const en = [];
    en.push(`${ctx.store.name}${ctx.store.area ? ` in ${ctx.store.area}` : ''} — ${p.theme ? `featuring ${p.mainItem || p.theme}` : 'welcome'}.`);
    if (p.price) en.push(`Price: ${p.price}.`);
    if (p.salesPeriod) en.push(`Available: ${p.salesPeriod}.`);
    if (f['営業時間']) en.push(`Hours: ${f['営業時間']}.`);
    en.push(p.cta?.type === 'BOOK' ? 'Reserve using the button below. We look forward to seeing you!' : 'We look forward to seeing you!');
    sets.push({
      catchcopy,
      body_ja: bodyJa,
      body_en: en.join('\n\n'),
      angle: angle.key,
      season_expressions: intro ? [intro] : [],
      used_facts: used,
      reviewer_notes: ['デモ生成（テンプレート）の文章です。公開前に AI 生成または手動で文章を整えてください。'],
    });
  }
  return { sets, model: 'mock-template' };
}
