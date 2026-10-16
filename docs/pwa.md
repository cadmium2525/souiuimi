# PWAとGitHub Pages

公開先は https://cadmium2525.github.io/souiuimi/ 。リポジトリは https://github.com/cadmium2525/souiuimi です。

## ビルドと保存範囲

`public/manifest.webmanifest` がアプリ名、相対的なid/start_url/scope、standalone表示、通常アイコンとmaskableアイコンを定義します。iOS用メタと180pxアイコン、32px faviconを `index.html` から参照します。生成イラストと全プロンプトは [app-icon.md](app-icon.md) に保存しています。

`build/pwa-plugin.mjs` がビルド時に出力資産と必要なpublicファイルを収集し、内容のSHA-256からバージョンを作って `dist/sw.js` を生成します。追加の実行時ライブラリは使いません。生成原本の大きなPNGは事前キャッシュの対象から外します。

HTML、ハッシュ付きJS/CSS、manifest、上司の会話画像、各種起動アイコン、BGMのMP3を保存します。scope配下かつ同一originのGETだけを処理し、外部通信やAPIをキャッシュしません。ナビゲーションでは保存済みの一貫したHTMLを使い、5ケースの連続プレイとリザルトをオフラインでも利用できます。

BGMクレジットは `music-credits.html` を保存します。保存済みのHTMLページを明示したナビゲーションにはそのページを返し、ゲームの起動画面へ置き換えません。タイトルとメニューのリンクを実際にタップして、オフラインでもクレジット本文が開き、元のゲームの状態が保たれることを確認します。

音源は作者の公式MP3を同梱し、全public資産と同じ内容ハッシュに含めます。音楽再生でブラウザーが要求する単一のbyte rangeには、保存済みの全ファイルから206応答を作ります。先頭指定・末尾指定・終端省略と、範囲外の416応答を確認します。BGMのON/OFF設定は端末に保存し、ケースを移っても曲の再生位置を保ちます。

## 更新

`src/pwa.ts` は本番のsecure contextだけでworkerを登録します。開発サーバーと `?qa=1` では新規登録せず、既存のゲームQAがキャッシュの影響を受けないようにします。PWA専用テストはqaパラメーターなしの通常訪問で行います。

初回はファイル保存完了後にworkerが有効になります。更新はwaiting状態で待ち、タイトル画面だけに更新ボタンを表示します。操作したタブだけが一度再読み込みし、他のタブで進行中のゲームは再読み込みしません。

現行版、直前版、開いているタブのJS/CSS資産を含む版を保持します。応答できないタブがある間は削除を保留します。不要になった古い版は後の更新で整理します。保存に失敗した新workerは導入されず、既存のオフライン版を残します。更新設計は [web.devの更新ライフサイクル](https://web.dev/learn/pwa/update) を参照しています。

## 配信

GitHub PagesはAPIでbuild_typeをworkflow、HTTPSを有効に設定しました。`main` へのpushで `.github/workflows/deploy.yml` がunit test→build→Pages artifact→deployを実行します。リポジトリのサブパスに合わせ、Viteのbaseは `./`、manifestとworkerも相対URLです。公開方法は [GitHub公式ドキュメント](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) に従います。

専用の `npm run test:pwa` はlocalhostのsecure contextで `/souiuimi/` を再現し、通常の画面操作でオフラインプレイと更新を確認します。結果、実サイトの確認と端末に関する未確認事項は [acceptance.md](acceptance.md) を参照してください。
