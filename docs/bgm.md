# BGM

## 曲と音の方向

Kevin MacLeod の **Bossa Antigua** を使用する。ギター、ベース、ドラムによる70 BPMの落ち着いたボサノバで、読んで推理する時間に合わせ、録音を小さめの音量（0.24）で流す。ブラウザーの発振器で旋律を合成せず、全編の音源を同梱する。会話・調査・行動・ケースの切り替えで曲を再起動しない。

- 公式作品ページ: https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1700069
- 公式MP3: https://incompetech.com/music/royalty-free/mp3-royaltyfree/Bossa%20Antigua.mp3
- 公式表示の演奏時間: 4分43秒
- 楽器: Guitar, Bass, Drums
- ISRC: USUAN1700069
- 同梱先: `public/audio/bossa-antigua.mp3`
- ダウンロード原本: 9,069,455 bytes（約8.65 MiB）。音質を維持するため編集・再エンコードなし。
- 原本のSHA-256: `322103dd6ac5fae4872122f91d32cccd4d964b86d300585a5a0cdfaf7048af5d`

## ライセンスと表示

2026年10月16日に作者の公式作品ページで **Creative Commons Attribution 4.0 International** のクレジット指定を確認した。配布・ゲーム組み込み・音量変更は同ライセンスの条件に従う。ゲーム内のクレジットから、同梱の `music-credits.html` を開ける。`THIRD_PARTY_NOTICES.md#music` にも同じ表記を維持する。

> "Bossa Antigua" Kevin MacLeod (incompetech.com)
> Licensed under Creative Commons: By Attribution 4.0 License
> https://creativecommons.org/licenses/by/4.0/

曲の原本には手を加えず、プレイヤーの音量と全曲ループだけを変更する。ゲームから作者のサーバー、YouTube、外部音楽サービスへ再生リクエストを送らない。公開するMP3にも、この作品ページ・作者・ライセンス・変更内容の表記を併せて配布する。

## 再生の責務

`src/game/music.ts` の `Music` が1個の `HTMLAudioElement` を保持する。保存されたON/OFFの設定とUIの表示はゲーム側が担当する。

- `setEnabled(boolean)`: OFFですぐ停止し、現在位置を保持する。
- `unlock()`: クリック・タップの同期ハンドラーから呼び、ユーザー操作後に初めて再生する。
- `setSuspended(boolean)`: ページを隠した時やWebGLが利用できない時に停止し、復帰後は同じ場所から再開する。
- `diagnostics()`: ON/OFF、再生位置、読み込み状態、音量、ループ、エラーを返す。
- 読み込み前は `preload="none"`。ONが初期設定でも、ページ表示だけで音を鳴らさない。
- OFF後やページ非表示後に遅れて再生要求が解決した場合も、音を止める。
- 自動再生の拒否や通信・デコードエラーは捕捉し、ゲームの進行を妨げない。次の操作から再試行できる。

PWAのビルド処理は `public/` の音源も配信対象に含める。音源のキャッシュ・オフラインでの再生は、公開前にブラウザーで実際に確認する。

## 単体でのブラウザー確認

2026年10月16日、インストール済みChromeで実際の `Music` と同梱MP3を使い、次の7項目を確認した。結果はローカルの `artifacts/music-controller-results.json` に記録した。

1. 操作前は未再生、再生位置0、`readyState: 0`。
2. クリックから実音源をループ再生し、音量0.24。
3. OFFですぐ停止し、再生位置が進まない。
4. ONで停止位置から再開する。
5. 一時停止・復帰で曲を再起動しない。
6. ON/OFFを20回続けた後、OFFの状態で音が残らない。
7. 録音全体のデコードが成功する。実長283.2857秒・2チャンネル、RMS 0.068、非無音サンプル約97%。ブラウザーのエラーは0件。

これは音源ファイルと再生制御の確認である。ゲームの設定保存・画面内スイッチ・PWAオフライン再生の結合確認は、それぞれの検証記録を参照する。
