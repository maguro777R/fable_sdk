# ✍️ ブログ下書きジェネレーター【Agent SDK 直接利用版】

`claude -p`(コマンド経由)から **Agent SDK 直接利用**へ進級した版です。
見た目は旧版とほぼ同じですが、**文章がリアルタイムで流れてくる**ようになりました。

## 旧版との違い

|  | 旧版(claude -p) | SDK版(今回) |
|---|---|---|
| Claudeの呼び方 | `execFile("claude", ["-p", ...])` | `query({ prompt, options })` |
| 結果の受け取り | 全部終わってから一括 | **書きかけが1かけらずつ届く** |
| 体感 | 30秒無言で待つ | 数秒後から文字が流れ始める |
| セットアップ | claude コマンドがあればOK | `npm install` が必要 |
| 認証 | claudeのログイン情報 | 同じ(コードにAPIキー不要) |

## セットアップと起動

```bash
cd blog-draft-generator-sdk
npm install        # SDKがclaude本体ごと入るので、これだけでOK
node server.js
```

ブラウザで http://localhost:3002 を開く。

## コードの読みどころ(3か所だけ)

### 1. server.js — `query()` の呼び出し

```js
const stream = query({
  prompt: buildPrompt(input),
  options: {
    includePartialMessages: true, // ← ストリーミングの鍵
    allowedTools: [],
    maxTurns: 1,
  },
});
```

`query()` は「メッセージが次々流れてくる蛇口」を返します。
`includePartialMessages: true` を付けると、完成品だけでなく**書きかけの断片**も流れてきます。

### 2. server.js — `for await` ループ

```js
for await (const msg of stream) {
  if (msg.type === "stream_event" && ...) {
    res.write(msg.event.delta.text); // 届いたかけらを即ブラウザへ
  }
}
```

旧版では結果は「1つの文字列」でしたが、SDKでは**種類のあるメッセージの列**で届きます。
`stream_event`(書きかけ)、`assistant`(発言のまとまり)、`result`(完了報告。料金情報つき!)など。

### 3. index.html — 読み取りループ

```js
const reader = res.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  rawMarkdown += decoder.decode(value, { stream: true });
  preview.innerHTML = marked.parse(rawMarkdown); // 届くたびに描き直す
}
```

ChatGPTやClaudeのチャット画面で文字がパラパラ出てくるのと同じ仕組みを、自分で作っています。

## 発展課題

1. **コスト表示** — `result` メッセージの `total_cost_usd` をブラウザに送って「この記事の生成コスト: $0.01」と表示する
2. **会話の継続** — `options.resume` にセッションIDを渡すと「もっと短くして」などの追加指示ができる(チャット化への道)
3. **ツール解禁** — `allowedTools: ["WebSearch"]` にして「最新情報を検索してから書いて」と頼む
4. **メモダッシュボードもSDK化** — 同じ要領で `allowedTools: ["Read", "Glob"]` を渡せば移植できます。「いまどのファイルを読んでいるか」も `assistant` メッセージから取れます
