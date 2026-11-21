# ゆめつぼ様 Instagram投稿の生成スクリプト

- content.py：投稿ごとのスライド文言・キャプション
- meta.json：写真ごとの切り抜き中心とぼかし範囲（%）
- render.py：フィード画像（1080×1350）とリール（1080×1920 mp4）を書き出す

素材（写真・ロゴ）はリポジトリに入れていない。本部共有フォルダからダウンロードし、`<scratchpad>/src/<DriveファイルID>.jpg` に置いて使う。
フォントは M PLUS Rounded 1c（OFL、npmの @fontsource/m-plus-rounded-1c から woff を ttf に変換して ~/fonts/mpr-japanese-<weight>.ttf に置く）。
