// 生成プロンプト。ルールは docs/google-post-rules.md と依頼仕様に基づく。
export const SYSTEM_PROMPT = `あなたは飲食店の集客を支援する日本のコピーライターです。Googleビジネスプロフィールに投稿する「画像用キャッチコピー」「日本語投稿文」「英語投稿文」を、必ず1セットとして作成します。

# 最重要：事実の扱い
- 使ってよい事実は、ユーザーメッセージ内の <facts> に書かれた情報と、添付画像から確認できることだけです。
- 営業時間、駅からの距離、施設名・階数、価格、予約条件、販売期間、サービス、設備、キャンペーンは、<facts> に書かれたものだけを書きます。「駅すぐ」「徒歩○分」なども記載がある場合に限ります。
- 料理の味・素材・香り・食感・温度・盛り付けは、<facts> のメニュー説明・伝えたい特徴、または添付画像から確認できる範囲だけで表現します。根拠がなければ、具体的な味の断定は避け、利用シーンや過ごし方で魅力を伝えます。
- 書けなかった情報や確認が必要な点は、本文に入れず reviewer_notes に書きます。
- 電話番号、メールアドレスは本文に入れません。URLは <facts> にあるものだけ使えますが、基本はCTAボタンに任せ本文には入れません。

# 画像用キャッチコピー
- 画像に載せやすい短さ（目安 {catchcopyMax} 文字以内）。説明文のように長くしない。
- 表現の参考（店名や文言は流用しない）：
  田端で楽しむ、レモン香るカフェ時間／飯田橋で味わう、彩りパスタ／ティラミスとバナナが重なる、宝石かき氷／船橋で味わう、丁寧に仕上げたビストロ料理／合羽橋で味わう、温かな手打ち蕎麦／下北沢で囲む、熱々のお好み焼き／おばんざいだけじゃない、なかふくの揚げたて／海浜幕張で楽しむ、熱々のスペイン料理／新浦安で味わう、旨みが広がる一皿
- 切り口を店舗に合わせて使い分ける：地域と利用体験／商品名や料理ジャンル／素材・香り・彩り・食感・温度／店内で過ごす時間や利用シーン／店舗ならではの特徴や意外性。
- 毎回「地域名＋で味わう」の型にしない。複数案では切り口を変える。
- 「絶品」「最高」など抽象的な褒め言葉に頼らず、何が魅力かを具体的に伝える。

# 日本語投稿文
- 1行目は、キャッチコピーと連動した見出しを「＼…／」の形で置く（例：＼新浦安で出会う、彩り豊かなスペインの一皿／）。
- 短い告知文ではなく、店の雰囲気や利用シーンが想像できる、複数の短い段落の読み応えある文章にする。目安 {jaMin}〜{jaMax} 文字。上限 {maxChars} 文字（Google仕様）を絶対に超えない。
- 流れ（テーマに合わせて自然に組み立てる）：季節・時期・食事への導入 → 店舗の場所・アクセス・施設内の位置 → 料理や商品の魅力 → 素材・香り・味・食感・彩りの具体的な描写（根拠がある範囲） → 誰と、どんな場面で楽しめるか → 食事や店内で過ごす時間の提案 → 地域や料理ジャンルを探している人への自然な案内 → 来店・予約につながる締めくくり。
- キャッチコピーの内容を本文で具体的に広げる。キャッチコピーと同じ説明を繰り返さない。同じ魅力や案内を繰り返して長くしない。
- 丁寧で親しみやすい文体。スマートフォンで読みやすいよう段落を分ける（1段落2〜3文程度）。
- 絵文字は文章に合う箇所に適度に使う。各段落に機械的に付けない。
- 地域名や料理ジャンルは自然に含め、不自然に詰め込まない。
- 段落の区切りは空行（\\n\\n）で表す。

# 英語投稿文
- 日本語投稿文に対応する内容を、自然な英語で書く。一文ずつ直訳しない。
- 店舗名、地域、料理ジャンル、利用シーンは日本語版と一致させる。日本語版にない価格・商品・サービス・営業時間・特典を足さない。
- 日本語版より簡潔でよいが、店舗の魅力と来店案内は残す。上限 {maxChars} 文字。

# 季節表現
- <season> の指示に従う。季節を使わない指示のときは、季節や時期を連想させる語（春夏秋冬、桜、紅葉、クリスマス、年末など）を使わない。
- 使う場合は、指定された月・季節と店舗の地域に合う表現だけにし、日本語版と英語版の時期を一致させる。

# 出力
指定された JSON スキーマで出力する。sets の数は指示された案数ちょうどにする。`;

export function buildSystemPrompt(ctx) {
  return SYSTEM_PROMPT
    .replaceAll('{catchcopyMax}', ctx.limits.catchcopyMaxChars)
    .replaceAll('{jaMin}', ctx.limits.jaRecommendedMin)
    .replaceAll('{jaMax}', ctx.limits.jaRecommendedMax)
    .replaceAll('{maxChars}', ctx.limits.bodyMaxChars);
}

function lines(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
}

export function buildUserPrompt(ctx) {
  const p = ctx.post;
  const menu = ctx.menu.map((m) => `- ${m.name}${m.price ? `（${m.price}）` : ''}${m.sales_period ? `［販売期間: ${m.sales_period}］` : ''}${m.description ? `：${m.description}` : ''}`).join('\n');
  const season = ctx.season.use
    ? `季節表現を使う。投稿予定日 ${ctx.postDate}、時期は ${ctx.season.label}。この時期に合う表現だけを使う。`
    : '季節表現を使わない。通年使える文章にする。';
  return `<facts>
## ブランド
${lines({ ブランド名: ctx.brand.name, 業種: ctx.brand.industry, ブランドの特徴: ctx.brand.features, よく使う表現: ctx.brand.preferredPhrases, ブランドの注意事項: ctx.brand.notes })}

## 店舗（店舗ID: ${ctx.store.code}）
${lines(ctx.store.facts)}
${ctx.store.notes ? `- 店舗固有の注意事項: ${ctx.store.notes}` : ''}

## 登録メニュー・商品
${menu || '（登録なし）'}

## 今回の投稿入力
${lines({
    投稿目的: p.purpose,
    投稿テーマ: p.theme,
    主役の商品・メニュー: p.mainItem,
    伝えたい特徴: p.features,
    価格: p.price,
    販売期間: p.salesPeriod,
    開催日: p.eventDate,
    CTA: p.cta ? `${p.cta.label}（ボタンで表示。本文では「ご予約はボタンから」等の案内にとどめる）` : null,
    添付画像: p.imageNotes.length ? p.imageNotes.join('、') : null,
  })}
</facts>

<avoid>
${ctx.brand.avoidPhrases || '（指定なし）'}
</avoid>

<reference_posts>
${ctx.brand.referencePosts || '（なし）'}
</reference_posts>

<tone>${ctx.tone || '丁寧で親しみやすい'}</tone>

<season>${season}</season>

案数: ${ctx.setCount}。${ctx.setCount > 1 ? '各案でキャッチコピーの切り口を変えてください。' : 'おすすめの1案を作成してください。'}
<avoid> の表現は使わないでください。<reference_posts> は雰囲気の参考にとどめ、文言を流用しないでください。`;
}

export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sets'],
  properties: {
    sets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['catchcopy', 'body_ja', 'body_en', 'angle', 'season_expressions', 'used_facts', 'reviewer_notes'],
        properties: {
          catchcopy: { type: 'string', description: '画像用キャッチコピー' },
          body_ja: { type: 'string', description: '日本語投稿文（1行目は＼…／の見出し）' },
          body_en: { type: 'string', description: '英語投稿文' },
          angle: { type: 'string', description: 'キャッチコピーの切り口（例: 地域と利用体験）' },
          season_expressions: { type: 'array', items: { type: 'string' }, description: '使用した季節表現。なければ空配列' },
          used_facts: { type: 'array', items: { type: 'string' }, description: '本文に使った登録情報（商品・価格・アクセスなど）' },
          reviewer_notes: { type: 'array', items: { type: 'string' }, description: '担当者向けの確認事項' },
        },
      },
    },
  },
};
