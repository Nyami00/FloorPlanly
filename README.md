# 間取りシミュレータ FloorPlanly

ブラウザ上で使える、2フロア対応の間取り編集アプリです。  
React + Vite で構成されています。

## 主な機能

- 1F / 2F の切り替え
- 部屋の追加・削除
- 部屋のドラッグ移動
- 部屋サイズ変更（幅・奥行）
- 部屋の回転
- 扉の追加・削除
- 扉タイプ・向き・幅の変更
- `localStorage` 自動保存
- JSON 書き出し / 読み込み

## ローカル実行

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
npm run preview
```

## GitHub Pages 公開手順

このリポジトリには `.github/workflows/deploy.yml` が含まれています。

1. `main` ブランチへ push
2. `Settings > Pages` を開く
3. `Build and deployment` を `GitHub Actions` に設定
4. workflow 成功後、以下URLで公開
   `https://nyami00.github.io/FloorPlanly/`

## データ形式

書き出し JSON の形式:

```json
{
  "version": 1,
  "rooms": { "1": [], "2": [] },
  "doors": { "1": [], "2": [] }
}
```

## ライセンス

このプロジェクトは `Sushi License 1.0` です。  
詳細は `LICENSE` を参照してください。
