# GitHub Pages 公開手順（0円構成）

## 前提
GitHubアカウントと公開リポジトリを使用する。GitHub Freeの公開リポジトリでのPages利用を想定（プラン条件・利用制限は変更され得るため公開時に確認）。静的サイトなのでゲームサーバー費用は不要。

## エージェントへの指示
1. `npm run build` で `dist/` を生成する。
2. Vite `base: './'` でアセットを相対参照する。
3. `.github/workflows/deploy.yml` を作成し、mainへのpushでGitHub Pagesへデプロイする。`permissions: contents: read, pages: write, id-token: write` と `concurrency` を設定する。
4. Actionsで `npm ci`、`npm run build`、Pages artifact upload、deployを行う。
5. GitHubのRepository Settings → PagesでSourceをGitHub Actionsに設定する手順をREADMEに記載。
6. READMEに公開URLの形 `https://USERNAME.github.io/REPOSITORY/` を記載（実際のユーザー名/リポジトリ名はデプロイ時に確定）。
7. 外部の有料サービス、秘密鍵、環境変数、CDN必須依存を使わない。npmパッケージはビルド時に取得するが、公開サイトの実行時には外部API不要。

## 費用の注意
ホスティングとOSSを無料枠で使う設計であり、作業工数・電力・ネット接続・独自ドメインは含まない。公開リポジトリではソースが一般公開される。
