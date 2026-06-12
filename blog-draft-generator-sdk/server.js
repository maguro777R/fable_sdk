// =============================================================
// ブログ下書きジェネレーター【Agent SDK 直接利用版】
//
// 進級ポイント:
//   旧版: execFile("claude", ["-p", prompt])
//         → 終わるまで待って、結果を一括で受け取る
//   今回: query({ prompt, options })
//         → Claudeが書いている途中の文章が1かけらずつ届く!
//
// セットアップ:
//   npm install        (SDKが claude 本体ごと入るので、これだけでOK)
//   node server.js
//
// 認証はこれまでと同じく claude のログイン情報を自動で使います。
// コードにAPIキーは登場しません。
// =============================================================

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "@anthropic-ai/claude-agent-sdk"; // ← 今回の主役

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3002;

function buildPrompt({ theme, audience, tone, length }) {
  return `あなたはプロのブログライターです。以下の条件でブログ記事の下書きをMarkdown形式で書いてください。

テーマ: ${theme}
想定読者: ${audience || "一般読者"}
トーン: ${tone || "親しみやすい"}
長さ: ${length || "800字程度"}

条件:
- 見出し(#, ##)を使って構成する
- 導入・本文・まとめの構成にする
- Markdownの本文だけを出力する(前置きや説明は不要)`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(path.join(__dirname, "index.html")));
    return;
  }

  if (req.method === "POST" && req.url === "/generate") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const input = JSON.parse(body);
        if (!input.theme) throw new Error("テーマを入力してください");

        // ここから「少しずつ送る」レスポンス。
        // 全部できあがるのを待たず、届いたそばからブラウザへ流す。
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        });

        console.log(`[生成開始] テーマ: ${input.theme}`);

        // ===== ここが Agent SDK =====
        // query() は「メッセージが次々流れてくる蛇口」を返す。
        // for await で、届いた順に1つずつ取り出せる。
        const stream = query({
          prompt: buildPrompt(input),
          options: {
            includePartialMessages: true, // ← 書きかけの状態も受け取る(ストリーミングの鍵)
            allowedTools: [],             // 文章を書くだけなのでツールは不要
            maxTurns: 1,
          },
        });

        for await (const msg of stream) {
          // stream_event = 「いまこの瞬間に書かれた文字のかけら」
          if (
            msg.type === "stream_event" &&
            msg.event.type === "content_block_delta" &&
            msg.event.delta?.type === "text_delta"
          ) {
            res.write(msg.event.delta.text); // 届いたかけらを即ブラウザへ
          }
          // result = 「全部書き終わったよ」の合図
          if (msg.type === "result") {
            console.log(`[生成完了] コスト: $${msg.total_cost_usd?.toFixed(4) ?? "?"}`);
          }
        }
        // ===========================

        res.end();
      } catch (e) {
        console.error("[エラー]", e.message);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        }
        res.end("\n\n[エラー] " + e.message);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`✅ 起動しました → http://localhost:${PORT}`);
});
