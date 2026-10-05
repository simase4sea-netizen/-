// テスト用：YouTube Data API v3 の応答の形（値はすべて架空）
module.exports = {
  search: { items: [
    { id: { kind: 'youtube#video', videoId: 'v1' }, snippet: { channelId: 'UC_test_takamatsu', title: '【高松】話題のスイーツ店めぐり', description: '香川県高松市のカフェ', channelTitle: '【テスト】高松スイーツ部' } },
    { id: { kind: 'youtube#video', videoId: 'v9' }, snippet: { channelId: 'UC_test_osaka', title: '大阪 ラーメン食べ歩き', description: '', channelTitle: '【テスト】大阪麺' } },
    { id: { kind: 'youtube#video', videoId: 'v2' }, snippet: { channelId: 'UC_test_takamatsu', title: '高松 パフェ', description: '', channelTitle: '【テスト】高松スイーツ部' } },
  ] },
  channels: { items: [
    { id: 'UC_test_takamatsu', snippet: { title: '【テスト】高松スイーツ部', description: '香川・高松のスイーツとカフェを紹介。Instagram: @test_tkm_sweets / TikTok https://www.tiktok.com/@test_tkm_tt', customUrl: '@test_tkm_sweets', country: 'JP' }, statistics: { subscriberCount: '12300', hiddenSubscriberCount: false, videoCount: '120' }, contentDetails: { relatedPlaylists: { uploads: 'UU_test_takamatsu' } } },
    { id: 'UC_test_osaka', snippet: { title: '【テスト】大阪麺', description: '大阪のラーメン', customUrl: '@test_osaka_men' }, statistics: { subscriberCount: '540000', hiddenSubscriberCount: false }, contentDetails: { relatedPlaylists: { uploads: 'UU_test_osaka' } } },
  ] },
  playlist: {
    UU_test_takamatsu: { items: [{ contentDetails: { videoId: 'v1' } }, { contentDetails: { videoId: 'v2' } }, { contentDetails: { videoId: 'v3' } }] },
    UU_test_osaka: { items: [{ contentDetails: { videoId: 'v9' } }, { contentDetails: { videoId: 'v10' } }, { contentDetails: { videoId: 'v11' } }] },
  },
  videos: {
    v1: { id: 'v1', snippet: { title: '【高松】話題のスイーツ店めぐり', description: '#高松スイーツ #香川カフェ', publishedAt: '2026-09-28T10:00:00Z' }, statistics: { viewCount: '8000', likeCount: '300', commentCount: '20' } },
    v2: { id: 'v2', snippet: { title: '高松 パフェ食べ比べ', description: '', publishedAt: '2026-09-21T10:00:00Z' }, statistics: { viewCount: '6000', likeCount: '250', commentCount: '10' } },
    v3: { id: 'v3', snippet: { title: '瓦町のケーキ屋さん', description: '', publishedAt: '2026-09-14T10:00:00Z' }, statistics: { viewCount: '7000', likeCount: '280', commentCount: '15' } },
    v9: { id: 'v9', snippet: { title: '大阪 ラーメン食べ歩き', description: '', publishedAt: '2026-09-30T10:00:00Z' }, statistics: { viewCount: '90000', likeCount: '3000', commentCount: '100' } },
    v10: { id: 'v10', snippet: { title: '梅田 つけ麺', description: '', publishedAt: '2026-09-25T10:00:00Z' }, statistics: { viewCount: '80000', likeCount: '2500', commentCount: '90' } },
    v11: { id: 'v11', snippet: { title: '難波 ラーメン', description: '', publishedAt: '2026-09-20T10:00:00Z' }, statistics: { viewCount: '85000', likeCount: '2600', commentCount: '80' } },
  },
  // Instagram Graph API business_discovery の応答（架空）
  igBusinessDiscovery: {
    test_tkm_sweets: { business_discovery: { username: 'test_tkm_sweets', name: '【テスト】高松スイーツ部', biography: '高松・香川のカフェとスイーツ', followers_count: 8800, media_count: 300, media: { data: [
      { caption: '高松のパフェ #高松スイーツ', like_count: 400, comments_count: 12, media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-09-30T00:00:00+0000' },
      { caption: '瓦町カフェ', like_count: 350, comments_count: 9, media_type: 'IMAGE', timestamp: '2026-09-27T00:00:00+0000' },
      { caption: 'ケーキ', like_count: 380, comments_count: 11, media_type: 'CAROUSEL_ALBUM', timestamp: '2026-09-24T00:00:00+0000' },
    ] }, id: '178' } },
  },
};
