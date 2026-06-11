// =============================================================
// ブログ下書きジェネレーター サーバー
//
// 仕組み(たった3ステップ):
//   1. ブラウザがフォームの内容を POST /generate に送る
//   2. このサーバーが「claude -p」コマンドを実行する
//   3. Claudeが書いたMarkdownをブラウザに返す
//
// 外部ライブラリ不要。Node.js 18以上があれば動きます。
//   起動: node server.js
// =============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const PORT = 3000;

// Claudeに渡すプロンプトを組み立てる関数
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

// 「claude -p」を実行してMarkdownを受け取る関数
function askClaude(prompt) {
  return new Promise((resolve, reject) => {
    // execFile = シェルを介さず安全にコマンド実行
    execFile(
      "claude",
      ["-p", prompt], // ← ここが claude -p の呼び出し!
      { maxBuffer: 10 * 1024 * 1024, timeout: 180000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

const server = http.createServer(async (req, res) => {
  // --- 画面(index.html)を返す ---
  if (req.method === "GET" && req.url === "/") {
    const html = fs.readFileSync(path.join(__dirname, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // --- 下書き生成API ---
  if (req.method === "POST" && req.url === "/generate") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const input = JSON.parse(body);
        if (!input.theme) throw new Error("テーマを入力してください");

        console.log(`[生成開始] テーマ: ${input.theme}`);
        const markdown = await askClaude(buildPrompt(input));
        console.log("[生成完了]");

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ markdown }));
      } catch (e) {
        console.error("[エラー]", e.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
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
