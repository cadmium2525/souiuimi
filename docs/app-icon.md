# PWA アプリアイコン

2026-10-15 に、内蔵 `image_gen` を使って新規イラストを生成。CLI/API フォールバックは使用していません。

## 参照と構図

- キャラクター・画風の参照: `public/characters/boss.png`。既存イラストの置き換えではありません。
- クリーム色を背景に、深緑の丸眼鏡・ジャケット、橙のネクタイの上司と、白い吹き出しの橙 `!?` を描いた 3D イラスト。
- 通常アイコンは顔が大きい構図。maskable 版は、同じ人物とポーズのまま引いた構図を内蔵ツールで別途生成し、髪・顔・眼鏡・吹き出しを中央直径 80% の円内に配置。
- 背景は全面不透明。外枠、角丸の事前加工、タイトル文字はありません。

## プロジェクト内のファイル

| ファイル | ピクセル | 用途 |
| --- | --- | --- |
| `public/icons/icon-original.png` | 1254 × 1254 | 通常版の生成原本 |
| `public/icons/maskable-original.png` | 1254 × 1254 | 安全余白のある生成原本 |
| `public/icons/icon-192.png` | 192 × 192 | manifest の通常アイコン |
| `public/icons/icon-512.png` | 512 × 512 | manifest の通常アイコン |
| `public/icons/maskable-512.png` | 512 × 512 | manifest の maskable アイコン |
| `public/icons/apple-touch-180.png` | 180 × 180 | iOS ホーム画面 |
| `public/icons/favicon-32.png` | 32 × 32 | ブラウザー favicon |

内蔵ツールの生成画像を上記プロジェクト内の原本2枚へコピーし、Pillow 12.3.0 の LANCZOS による等比リサンプルのみで各サイズを出力。生成原本は変更せず保持しています。すべて正方形の RGB PNG で透明チャンネルなし。フルサイズと 32 ピクセルの表示を目視確認し、丸眼鏡の顔と橙の記号が判別できることを確認しました。maskable 版も確認し、主な情報が中央安全円内にある構図を採用しました。

## 最終プロンプト

通常版（参照画像: `public/characters/boss.png`）:

```text
Use case: stylized-concept
Asset type: app icon illustration for a Japanese office comedy puzzle game, square 1024 by 1024 pixels.
Primary request: Create an entirely new polished 3D app icon illustration inspired by the supplied boss character reference. The character is a friendly middle-aged Japanese office boss with rounded dark green glasses, neatly swept dark brown hair with a few subtle gray strands, thick eyebrows, warm expressive eyes, a forest-green suit jacket, cream shirt and burnt-orange tie. Preserve this recognizable character identity and soft 3D toy-like visual language.
Input image: the supplied boss portrait is character and art-style reference only. Generate a new close-up composition, do not place the portrait as a flat cutout.
Scene/backdrop: warm cream opaque full-bleed background, very subtle warm studio gradient.
Subject: large simple head-and-shoulders boss portrait, a cheerful slightly puzzled smile and one eyebrow raised. A single compact white speech bubble beside his face contains only a bold burnt-orange !? symbol, expressing an amusing ambiguous instruction.
Composition/framing: one simple iconic focal grouping. Face and bubble easy to recognize at tiny smartphone launcher size. All important content, including hair, glasses, expression, speech bubble and its !? symbol, must fit comfortably within the central 80 percent diameter circle of the square canvas. Leave generous cream background in every corner and around the outside edge for Android maskable safe-area cropping. Shoulders may gently extend below the safe circle. Front three-quarter head angle, centered overall balance.
Lighting/mood: premium friendly soft 3D game illustration, gently rounded forms, warm diffuse studio illumination, crisp clean silhouette. Playful office misunderstanding comedy.
Color palette: cream, deep forest green, warm orange, natural warm skin tone.
Text (verbatim): !?
Constraints: opaque square image, no alpha, no icon frame, no rounded-corner mask, no thick external border, no extra people or props, no office background, no title text or Japanese text, no logos, no watermarks. Render the speech bubble and !? as clean bold simple readable shapes.
```

maskable 版（参照画像: 通常版の生成原本）:

```text
Use case: stylized-concept
Asset type: app icon illustration for a Japanese office comedy puzzle game, square 1024 by 1024 pixels.
Primary request: Create an entirely new polished 3D app icon illustration inspired by the supplied boss character reference. The character is a friendly middle-aged Japanese office boss with rounded dark green glasses, neatly swept dark brown hair with a few subtle gray strands, thick eyebrows, warm expressive eyes, a forest-green suit jacket, cream shirt and burnt-orange tie. Preserve this recognizable character identity and soft 3D toy-like visual language.
Input image: the supplied boss portrait is character and art-style reference only. Generate a new close-up composition, do not place the portrait as a flat cutout.
Scene/backdrop: warm cream opaque full-bleed background, very subtle warm studio gradient.
Subject: large simple head-and-shoulders boss portrait, a cheerful slightly puzzled smile and one eyebrow raised. A single compact white speech bubble beside his face contains only a bold burnt-orange !? symbol, expressing an amusing ambiguous instruction.
Composition/framing: one simple iconic focal grouping. Face and bubble easy to recognize at tiny smartphone launcher size. All important content, including hair, glasses, expression, speech bubble and its !? symbol, must fit comfortably within the central 80 percent diameter circle of the square canvas. Leave generous cream background in every corner and around the outside edge for Android maskable safe-area cropping. Shoulders may gently extend below the safe circle. Front three-quarter head angle, centered overall balance.
Lighting/mood: premium friendly soft 3D game illustration, gently rounded forms, warm diffuse studio illumination, crisp clean silhouette. Playful office misunderstanding comedy.
Color palette: cream, deep forest green, warm orange, natural warm skin tone.
Text (verbatim): !?
Constraints: opaque square image, no alpha, no icon frame, no rounded-corner mask, no thick external border, no extra people or props, no office background, no title text or Japanese text, no logos, no watermarks. Render the speech bubble and !? as clean bold simple readable shapes.
Composition correction for the attached generated icon: preserve its same boss identity, friendly thinking pose, materials, cream colors and single white speech bubble with orange !?. Pull the camera much farther back. Make the ENTIRE head and speech bubble together a compact grouping in the middle, with at least 20 percent canvas width of cream empty space on the left AND right and at least 20 percent empty space above the hair. The grouping should be only about 60 percent of the canvas width, with the head-and-bubble both entirely inside the central circle of diameter 80 percent of the canvas, including the top of the hair and right edge of the bubble. All important details must be safe when the square is cropped to an inset circle. It is essential to reduce the character size substantially; do not produce another edge-to-edge closeup. Full-bleed opaque cream backdrop. Shoulders may fade into the bottom center of the cream but must not touch left or right sides. Keep the icon beautiful, uncluttered, with visible generous negative space.
```

