# Third-party notices

本アプリは以下のオープンソースを使用します。具体的な依存バージョンは `package-lock.json` を正本とします。ゲーム内の3D形状と効果音はコードから生成し、外部配布の3Dモデル・音源・Webフォントは使用していません。

上司のイラスト `public/characters/boss.png` は、このプロジェクトのために内蔵画像生成で制作した、透過背景の同梱静的画像です。制作プロンプトと生成モードは `docs/boss-illustration.md` に記録しています。ゲーム実行時に外部の画像生成APIを呼び出すことはありません。

PWA起動アイコン `public/icons/` も、このプロジェクト用に内蔵画像生成で新規制作しました。通常用とmaskable用の生成原本、各サイズのPNG、プロンプトを含む制作記録 `docs/app-icon.md` を同梱しています。

| 依存関係 | 用途 | ライセンス | 公式ソース |
| --- | --- | --- | --- |
| Three.js | 実行時の3D描画 | MIT | https://github.com/mrdoob/three.js |
| Vite | 開発サーバー・静的ビルド | MIT | https://github.com/vitejs/vite |
| TypeScript | 開発時の型検証 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| @types/three / DefinitelyTyped | Three.jsの型定義 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @playwright/test / Playwright | 開発時のブラウザ操作・画面検証 | Apache-2.0 | https://github.com/microsoft/playwright |

Vite、TypeScript、型定義、Playwrightとビルド用の推移的依存関係は開発用であり、公開サイトからnpmパッケージを取得することはありません。Playwrightはブラウザテスト専用で、ゲームの配信ファイルには含まれません。それぞれの完全なライセンスと追加表記はインストールされたパッケージの `LICENSE`、`LICENSE.md` または `LICENSE.txt` と、Three.js同梱物のライセンスを参照してください。Viteのビルド用同梱物にはBSD-2-Clause、CC0-1.0、ISC、MITのコードがあり、Viteの `LICENSE.md` に個別表記が収録されています。

## Three.js — MIT License

Copyright © 2010-2025 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
