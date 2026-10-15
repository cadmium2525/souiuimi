# そういう意味じゃない！

[ブラウザで遊ぶ・ホーム画面に追加](https://cadmium2525.github.io/souiuimi/) ／ [ソース](https://github.com/cadmium2525/souiuimi)

上司の曖昧なひとことから始まる、3Dコメディ探索ゲームです。株式会社よしなにのオフィス、駅前広場、社内購買コーナー、催事準備室、資料準備室を調べ、各120秒で指示の意味を推理します。調査では物の状態や記載内容だけを示し、主人公の感想や先行ヒントを加えず、解釈はプレイヤーに任せます。どの選択でも固有のオチまで遊べます。

スマートフォンの縦持ちを想定した、5つの舞台で依頼が変わるプロトタイプです。v9でCASE 05、v10でPWA・生成アイコンに対応し、v11で手がかりを会話と仕事の文脈から読める形に改修しました。CASE 01〜03・05はA/B/C、CASE 04はA/Bのいずれもその回の意図と一致します。Vite + TypeScript + Three.js、HTML/CSS UIで構成しています。3Dモデルと効果音はプログラムで生成し、上司のイラストは同梱の静的画像を使用します。出題は作者のテンプレートとルールで作り、実行時の外部AI・API、CDN、アカウント、課金は不要です。

| 業務 | 舞台・指示 | 調査時間 | 解釈後のアニメーション |
| --- | --- | --- | --- |
| CASE 01 | オフィス：「適当に片付けといて」 | 120秒 | A：主人公が床と机を掃除する10秒／B：片付けの終盤から残った荷物を運ぶ16秒／C：オフィスごと収納する8秒 |
| CASE 02 | 駅前広場：「T時10分前集合」。同じ上司との過去のやりとりを読む | 120秒 | 同期した時計で3通りの解釈から選ぶ8秒。時間どおりの合流・早着・遅刻乗車・乗り遅れに分岐 |
| CASE 03 | 社内購買コーナー：「お釣りはいいよ」 | 120秒 | A：会社経理へ返却／B：自分の財布へ／C：店の募金箱へ。主人公が残金を運び、各10秒で処理 |
| CASE 04 | 催事準備室：「1万円弱でお願い」 | 120秒 | A：1万円未満／B：1万円を少し超える。主人公が封筒を用意して届け、各10秒。意図との一致・不足・多めの返金に分岐 |
| CASE 05 | 資料準備室：「資料、まとめといて」 | 120秒 | A：要点を1枚に要約10秒／B：参加者分の配布セット12秒／C：巨大な資料束にクリップを留め台車で搬出14秒 |

タイトルで舞台を選び、「出勤する」と新しい依頼が確定します。結果の「次の依頼を受ける」は舞台もランダムに選んで新しい出題を作ります。「同じ依頼をやり直す」は同じinstance・seed・事実を保持し、時間・証拠・位置・選択を初期化します。タイトルへ戻った後の開始も新しい依頼です。正解がA/B/Cの順に巡る規則はありません。

手がかりは、当日の仕事に関係する会話や予定、物の状態です。管理番号や担当表をたどる必要はありません。上司のひとことは同じでも、目的や相手の事情によって意図が変わります。

オフィスでは、翌日の部屋の使い道、家具の扱い、土地の予定から、掃除・家具搬出・部屋ごとの移設を判断します。コンテナやクレーンは毎回あり、設備が見えただけで正解が確定する構成にはしていません。

駅前では、同じ上司が以前「○時10分前」と言ったとき、実際に何時に合流したかを読み取ります。候補は「その時刻の10分前」「10分過ぎの5分前」「10分過ぎのすぐ前」。時計は同じ時刻に合わせてあり、時差換算はありません。結末は今回の上司の意図との一致を扱い、特定の解釈を一般に正しい・普通とは断定しません。

購買コーナーでは、誰が何のためにお金を出し、買い物前にどんな約束をしたかが手がかりになります。「お釣りはいいよ」が、上司本人には返さず会社で精算すること、自分へのお礼、事前に合意した募金のどれを指すかを考えます。残金処理は、その回に示す合意に基づくゲーム内の設定です。

催事準備室は「1万円未満」「1万円を少し超える」の2択です。部長本人の過去の会話と実際の金額から、今回の意図を予測します。辞書上の「弱」は基準より少し少ない意味のままです。Bが一致する回では部長が言葉を取り違えており、結果で自身がそれを認めます。[語義と設計の根拠](docs/amount-language-notes.md) も記録しています。5舞台で3+3+3+2+3、計14の正解系統です。

資料準備室は「要点を1枚に要約」「参加者分の配布セット」「原本を全量集めて搬出」の3択です。使う目的、受取相手の伝言、原本の扱いから判断します。資料名やページ数を暗記しても意図は決まりません。Cの巨大な紙の束・クリップは、現物を集める仕事の漫画的な誇張です。[ケース5の設計](docs/document-case-notes.md) を参照してください。

## 起動

Node.js 22.18以降、または24系とnpmが必要です。CIはNode.js 24を使用します。

```sh
npm ci
npm run dev
```

ターミナルに表示されるローカルURLをブラウザで開きます。スマートフォンから同じWi-Fiで接続する場合は、`npm run dev -- --host 0.0.0.0` を実行し、PCのLAN IPアドレスと表示されたポートを開いてください。

```sh
npm test
npm run build
npm run preview
```

Windowsで依存を再導入する際は、先に開発サーバーを停止してください。起動中はesbuildの実行ファイルが使用中になり、`npm ci` が失敗する場合があります。

`npm test` は状態遷移と出題生成を検証します。5舞台各3,000seed、計15,000出題の唯一解・会話履歴・金額計算・本文と結果の一致・凍結・再挑戦を含みます。表示に謎の管理コードが戻らないこと、名前・日付・金額だけで正解が固定されないこと、CASE 04の辞書語義が両結果で変わらないこと、利用できないC選択を状態ロジックが拒否することも確認します。`npm run build` はTypeScript検証後に `dist/` を生成し、`npm run preview` はその公開用ビルドを配信します。ファイルを直接ダブルクリックせず、HTTPサーバーから開いてください。

ブラウザテストは、PCにインストールされたGoogle ChromeをPlaywrightから起動します。`npm run dev` を起動した状態で、別のターミナルから実行してください。

```sh
npm run test:browser
```

オフィスと駅前の通常の生成出題は、`npm run preview -- --port 4173` を起動し、別のターミナルから `npm run test:random` で検証します。既定の接続先は `http://127.0.0.1:4173/`。両舞台のA/B/C正解、早着・遅刻乗車・乗り遅れ、本文と結末、同じ依頼の再挑戦、新依頼、縦画面を確認します。

`npm run test:money` は同じ配信用ビルドに接続し、CASE 03の生成出題と金額・精算演出・再挑戦・縦画面UIを確認する専用ブラウザテストです。`npm run test:amount` はCASE 04の両意図×2行動、依頼と履歴、封筒の金額・受付の結果、2択とCの拒否、再挑戦・新依頼、縦画面UIを確認します。`npm run test:document` はCASE 05の3意図×3行動、7記録への到達、3D小物・固定カメラ、再挑戦・縦画面・時間切れを確認します。実行結果は [docs/acceptance.md](docs/acceptance.md) に記録します。

`test:browser`・`test:scenarios`・`test:visual`・`test:stages` は、`fixture=original` で元台本を再現する回帰テストです。固定C/A正解と元の時刻は診断用に残しています。テストが使う `?qa=1&seed=...` は診断・再現専用で、通常プレイはパラメーターを付けずに開きます。

公開用ビルドのサブパス対応とWebGL代替表示は、`npm run build` の後に `npm run test:deployment` で確認できます。

`npm run preview -- --port 4173` を起動した状態で `npm run test:scenarios` を実行すると、2件の証拠からBへ進む流れ、移動を保持したまま別の指で調査する操作、画質切替、連続タップ、reduced-motion設定を確認できます。

`npm run test:visual` は開発サーバーに接続し、場所マーカーがないこと、人物の待機・歩行、クレーン演出、動きを抑える設定を検証します。確認用画像と診断値は `artifacts/` に保存します。こちらも `GAME_URL` で接続先を変更できます。

`npm run test:stages` は開発サーバーに接続し、上司画像の読み込み、掃除・順次搬出の演出、2業務の選択と切り替え、各分岐と再初期化、320×568の画面配置を検証します。接続先は `GAME_URL` で変更でき、確認用画像を `artifacts/` に保存します。

開発サーバー向けテストの既定接続先は `http://127.0.0.1:5173/`、`test:scenarios`・`test:random`・`test:money`・`test:amount`・`test:document` は `http://127.0.0.1:4173/` です。別の接続先は `GAME_URL` 環境変数で指定します。画面サイズ360×800・390×844・320×568とタッチ入力をエミュレーションし、結果と画像を `artifacts/` に保存します。実機スマートフォンの性能やSafari固有の挙動は未確認です。

## 操作

| 操作 | スマートフォン | PC |
| --- | --- | --- |
| 移動 | 左下のスティック | WASD / 矢印キー |
| 視点 | 右側の空き領域をドラッグ | マウスドラッグ |
| 調査 | 対象の近くで「調べる」 | E / 「調べる」 |
| 手がかり確認 | 手がかり帳 | 手がかり帳 |
| 決断 | 「判断する」 | 「判断する」 |
| 閉じる | 「閉じる」 | Esc / 「閉じる」 |

調査・メニュー・手がかり帳・非表示タブでは時間が止まります。手がかりの数による選択肢の制限はありません。時間切れになると判断画面へ進みます。CASE 01〜03・05は3択、CASE 04は2択です。音は初期OFFで、メニューから変更できます。描画が重い場合は画質を軽量にしてください。

遠くから調査場所を知らせるマーカーはありません。物に近づくと「調べる」が表示され、調査した内容だけがノートに記録されます。未発見の手がかりはノートに表示しません。制限時間・調査位置・演出時間と元台本は各ステージ定義、生成本文・選択肢・結末は `src/data/cases.ts`・`src/data/moneyCases.ts`・`src/data/amountCases.ts`・`src/data/documentCases.ts` で管理します。添付の `devpack/` は初期仕様の保存版です。制限時間と手がかり表示は、その後のユーザー指示に合わせて変更しています。

## GitHub Pagesに公開する

公開先は [cadmium2525/souiuimi](https://github.com/cadmium2525/souiuimi)、ゲームは [https://cadmium2525.github.io/souiuimi/](https://cadmium2525.github.io/souiuimi/) です。Pagesの公開元はGitHub Actions、HTTPSを有効にしています。

`main` へpushすると **Deploy game to GitHub Pages** が実行されます。手動で再公開する場合は **Actions → Deploy game to GitHub Pages → Run workflow** を使います。ビルドやテストが失敗した回は公開しません。

ワークフローは `npm ci → npm test → npm run build → Pages artifact upload → deploy` の順に実行します。`vite.config.ts` の `base: './'` により、リポジトリ名を含むサブパスでも同梱アセットを相対参照します。秘密鍵や独自の環境変数は必要ありません。GitHub Pagesの公開条件と利用制限は、公開する時点のGitHubの案内を確認してください。

Actionsのタグは2026-10-15に公式リポジトリで再確認し、バージョンを固定しています: [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)、[setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0)、[configure-pages v6.0.0](https://github.com/actions/configure-pages/releases/tag/v6.0.0)、[upload-pages-artifact v5.0.0](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0)、[deploy-pages v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1)。公開設定は[GitHub公式のカスタムワークフロー手順](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)に沿っています。

## PWAとして使う

初回は通信できる状態でゲームを開いてください。Chromeなどではタイトル画面の「アプリを入れる」かブラウザのインストールメニュー、iPhone/iPadでは共有メニューの「ホーム画面に追加」から起動アイコンを作れます。

必要なファイルの保存が完了すると、通信なしでも全5ケースを遊べます。新しいバージョンはタイトル画面の「更新して再読み込み」で適用します。探索中・演出中に自動で再読み込みしません。外部APIや通知の許可は不要です。

上司の新規イラストをホーム画面用アイコンとして内蔵画像生成で制作しました。通常アイコンとAndroidのmaskable用は別構図で、192/512px、iOS用180px、favicon用32pxを同梱しています。[生成記録とプロンプト](docs/app-icon.md)、[PWAの仕組みと検証](docs/pwa.md) を参照してください。

`npm run test:pwa` は配信用ビルドを `/souiuimi/` で配信し、manifest・アイコン、全5ケースのオフライン起動、ケース5の結末、複数タブの更新保護、旧キャッシュの整理を検証します。ローカルの検証画像・結果とZIPは `artifacts/` に保存し、Gitには含めません。過去の検証記録からの `artifacts/` リンクはローカルの保存物を指します。

`npm run test:pwa:live` は公開HTTPSサイトを専用の一時Chromeプロファイルで開き、インストール条件と実際の案内、スマホ表示、オフラインのケース5完走を確認します。既定接続先は上の公開URL、別の配信先は `PWA_LIVE_URL` で指定できます。端末へのアプリ追加は実行しません。

## 実装の見取り図

| ファイル | 役割 |
| --- | --- |
| `src/main.ts` / `src/game/Game.ts` | 起動、状態・3D描画・入力・UI・音の接続とフレーム更新 |
| `src/pwa.ts` / `src/serviceWorker.js` / `build/pwa-plugin.mjs` | PWA登録、タイトルだけの導入・更新操作、版ごとのオフライン資産生成と保持 |
| `public/manifest.webmanifest` / `public/icons/` | ホーム画面用の定義と生成イラスト、通常・maskable・Apple・favicon各サイズ |
| `src/game/world.ts` | プリミティブのオフィス、近接判定、衝突、三人称カメラ、オチの演出 |
| `src/game/stationWorld.ts` | `StationWorld`：駅前広場、シャトル、集合時刻ごとの演出 |
| `src/game/moneyWorld.ts` | `MoneyWorld`：社内購買コーナー、封筒・財布・募金箱、主人公の残金処理 |
| `src/game/amountWorld.ts` | `AmountWorld`：催事準備室、2通の封筒、現金の用意と受取窓口への手渡し、金額に応じた受付結果 |
| `src/game/documentWorld.ts` | `DocumentWorld`：資料準備室、要約・配布セット・巨大な資料束と台車、上司への受渡し |
| `src/game/dispose.ts` | 業務切り替え時に前の3D描画のジオメトリ・マテリアル・テクスチャを解放 |
| `src/game/controls.ts` | スティック、ドラッグ、キーボード入力 |
| `src/game/interactions.ts` | 移動可能範囲、家具との衝突、調査対象の近接判定 |
| `src/game/sound.ts` | 音をONにしたときの自作効果音 |
| `src/game/state.ts` | 舞台選択、出題の生成・保持・破棄、タイマー、発見数、決断、再挑戦と不正な遷移の防止 |
| `src/game/types.ts` | コンポーネント間の共通型 |
| `src/data/stage01.ts` | オフィス業務の7つの手がかり、セリフ、3つの結末と演出時間 |
| `src/data/stage02.ts` | 集合業務の7つの手がかり、時刻の選択肢、3つの結末と演出時間 |
| `src/data/stage03.ts` | 精算業務の7つの手がかり、返却・受取・寄付の選択肢と10秒の演出時間 |
| `src/data/stage04.ts` | 立替金業務の7つの手がかり、1万円未満／少し超えるの2択と各10秒の演出時間 |
| `src/data/stage05.ts` | 資料業務の7つの手がかり、要約・配布・回収の3択と10・12・14秒の演出時間 |
| `src/data/stages.ts` | 5業務の登録とステージ定義の取得 |
| `src/data/cases.ts` | seed付き出題、翌日の用途・話者の言い方、可変本文・選択肢・結末、整合性検証 |
| `src/data/moneyCases.ts` | お金の出所と買い物前の合意を生成し、釣銭・本文・結末の一致を検証 |
| `src/data/amountCases.ts` | 部長本人の過去会話と金額を生成し、意図・候補金額・固定の辞書語義と結末を検証 |
| `src/data/documentCases.ts` | 資料を使う目的・受取相手・原本の扱いを生成し、本文と結果の一致を検証 |
| `src/ui/ui.ts` / `src/ui/style.css` | 業務選択、上司との会話、調査カード、選択画面、結果、縦画面UI |
| `public/characters/boss.png` / `docs/boss-illustration.md` | 同梱の上司イラストと、制作プロンプト・生成モードの記録 |
| `tests/state.test.ts` | 時間停止、時間切れ、各選択、二重操作、業務切り替えと再初期化の検証 |
| `tests/cases.test.ts` / `tests/random-cases-check.mjs` | 6,000出題と通常の生成出題のブラウザ検証 |
| `tests/money-cases.test.ts` / `tests/money-check.mjs` | 金銭の3,000出題と、CASE 03の生成出題・金額・演出・縦画面のブラウザ検証。後者は `npm run test:money` で実行 |
| `tests/amount-cases.test.ts` / `tests/amount-check.mjs` | 金額の3,000出題と、CASE 04の両意図×2行動・金額・演出・2択・縦画面のブラウザ検証。後者は `npm run test:amount` で実行 |
| `tests/document-cases.test.ts` / `tests/document-check.mjs` | 資料の3,000出題と全9結果、7記録、3D小物・固定カメラ、再挑戦・スマホ幅・時間切れ。後者は `npm run test:document` で実行 |
| `tests/document-ui-check.mjs` | 5サイズで5ケースの選択と開始、ケース5のカード・3択・結末・固定台本レビューを確認。`npm run test:document-ui` で実行 |
| `docs/amount-language-notes.md` | 作者向けの語義の出典、担当者の意図を予測する設計と金額の扱い |
| `tests/playtest.mjs` | Chromeでの縦画面・入力・手がかり・分岐の検証と画面保存 |
| `tests/visual-check.mjs` | 3D描画、人物の関節、マーカー撤去、動き軽減設定の検証 |
| `tests/stages-check.mjs` / `npm run test:stages` | 上司画像、掃除・搬出、2業務の分岐・切り替え、320×568の画面配置の検証 |
| `devpack/` | 添付された企画書・正本のステージ仕様・設計図 |

状態は `TITLE → INTRO → EXPLORE` から進み、調査・メニュー・手がかり帳を挟んで `DECISION → CINEMATIC → ENDING` に到達します。状態ロジックはレンダラーから独立しており、UIはコピーされたスナップショットを受け取ります。

上司の画像 `public/characters/boss.png` は、このプロジェクトのために内蔵画像生成で制作した、透過背景の静的画像です。会話開始時と結末で読み込みます。制作プロンプトと生成モードは [docs/boss-illustration.md](docs/boss-illustration.md) に記録してあり、プレイ中に画像生成APIを呼び出すことはありません。

## 検証と制約

受け入れテスト、スクリーンショット、検証環境、未確認項目は [docs/acceptance.md](docs/acceptance.md) に記録します。実機スマートフォンでの操作、性能とブラウザ差分、GitHub Pages上の実際の公開については、その記録で確認状況を参照してください。

現在は5舞台ともランダム出題です。開始時に事実と正解を確定し、内部まで凍結した同じ出題をUI・3Dが参照します。本文・選択肢・結末は `src/data/cases.ts`・`src/data/moneyCases.ts`・`src/data/amountCases.ts`・`src/data/documentCases.ts`、調査位置・演出時間と診断用の元台本は各ステージ定義で管理します。実装範囲と今後の案は [docs/replayable-cases-design.md](docs/replayable-cases-design.md) で区別しています。

これは5ステージのプロトタイプです。映像は軽量な図形とアニメーションによる表現で、自由な物理破壊や動画書き出しは含みません。WebGL対応ブラウザが必要です。依存関係とライセンスは [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
