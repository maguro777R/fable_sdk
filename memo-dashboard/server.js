// =============================================================
// メモ・日記の自動要約ダッシュボード
//
// 前回(ブログ下書き)との違い = レベルアップポイント:
//   前回: claude -p "プロンプト"          ← Claudeは文章を書くだけ
//   今回: claude -p "..." --allowedTools  ← Claudeが自分でファイルを読む!
//
// --allowedTools "Read,Glob" を付けると、Claudeは
//   Glob: フォルダ内のファイル一覧を探す
//   Read: ファイルの中身を読む
// という「道具」を使えるようになります。これがエージェントの第一歩。
//
//   起動: node server.js                  → サンプルメモで動かす
//   起動: node server.js ~/my-notes      → 自分のメモフォルダで動かす
// =============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const PORT = 3001;

// 対象のメモフォルダ(引数で指定がなければ同梱のsample-notes)
const MEMO_DIR = path.resolve(process.argv[2] || path.join(__dirname, "sample-notes"));

// 直近7日以内に更新された .md ファイルの一覧を作る
function listRecentNotes() {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return fs
    .readdirSync(MEMO_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(MEMO_DIR, f)).mtime,
    }))
    .filter((f) => f.mtime.getTime() >= oneWeekAgo)
    .sort((a, b) => a.mtime - b.mtime);
}

// Claudeに渡すプロンプト
function buildPrompt(files) {
  const fileList = files
    .map((f) => `- ${f.name}(更新日: ${f.mtime.toLocaleDateString("ja-JP")})`)
    .join("\n");

  return `あなたは私の専属アシスタントです。
このフォルダにある以下のメモファイルを、Readツールで1つずつ読んでください。

${fileList}

読み終えたら、次のJSON形式「だけ」を出力してください(前後の説明文・コードフェンスは不要):

{
  "summary": "今週のまとめ。何があったか・何を考えていたかを3〜5文で",
  "todos": ["メモ内に書かれていて、まだ完了していなさそうなタスク"],
  "highlights": ["今週の良かったこと・印象的だった出来事を最大3つ"]
}`;
}

// claude -p をツール許可つきで実行する
function askClaude(prompt) {
  return new Promise((resolve, reject) => {
    execFile(
      "claude",
      [
        "-p", prompt,
        "--allowedTools", "Read,Glob", // ← レベルアップポイント! ツールの使用を許可
        "--add-dir", MEMO_DIR,         // ← このフォルダへのアクセスを許可
      ],
      { cwd: MEMO_DIR, maxBuffer: 10 * 1024 * 1024, timeout: 300000 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve(stdout);
      }
    );
  });
}

// Claudeの出力からJSONを取り出す(```json フェンスが付いていても外す)
function parseResult(text) {
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSONが見つかりません");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(path.join(__dirname, "index.html")));
    return;
  }

  // --- 分析API ---
  if (req.method === "POST" && req.url === "/analyze") {
    try {
      const files = listRecentNotes();
      if (files.length === 0) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `直近7日のメモが ${MEMO_DIR} にありません` }));
        return;
      }

      console.log(`[分析開始] ${files.length}件のメモ: ${files.map((f) => f.name).join(", ")}`);
      const raw = await askClaude(buildPrompt(files));
      console.log("[分析完了]");

      let data;
      try {
        data = parseResult(raw);
      } catch {
        // JSONとして読めなかったら、生テキストをそのまま返す(保険)
        data = { summary: raw, todos: [], highlights: [] };
      }
      data.files = files.map((f) => f.name);
      data.memoDir = MEMO_DIR;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (e) {
      console.error("[エラー]", e.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`✅ 起動しました → http://localhost:${PORT}`);
  console.log(`📁 メモフォルダ: ${MEMO_DIR}`);
});
