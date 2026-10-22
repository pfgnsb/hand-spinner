# 風車

画面の中央で回す風車です。学校の課題として、要件を決めてから画面とサーバを作りました。利用者は nsb 一人です。

羽根は4枚で、色は赤、青、黄、緑です。中心にピンがあり、下に柄があります。柄は回りません。

向き、回転、倍率は Durable Object に残します。ページを開き直すと、残した状態から続きます。初めて開いたときは、止まって、長さは約4.2cm、向きは真上から左へ15度、倍率は1.0倍です。

## 技術スタック

| 層 | 技術 | 場所 | 役割 |
|---|---|---|---|
| フロントエンド | HTML、CSS、JavaScript | `spinner/frontend/index.html` | 風車を描き、押した操作を API へ送る。回転の描画はブラウザの中で行う |
| バックエンド | Cloudflare Workers | `spinner/backend/worker.js` | `127.0.0.1:8787` で画面を渡し、`/api/state` を Durable Object へ渡す |
| 状態 | Cloudflare Durable Objects（DO） | `spinner/durable-object/pinwheel.js` | 向き、回転、倍率を1行で残す。中のストレージは Durable Object の SQLite |
| 手元の起動 | Wrangler | `spinner/wrangler.toml` | ローカルで Workers と Durable Object を動かす。実行時のアプリ用パッケージは入れない |

PostgreSQL、RDS、ファイルの SQLite は置きません。状態の置き場所は Durable Object です。請求は 0 円です。手元の `wrangler dev` は Cloudflare のアカウントなしで動きます。

## 開き方

Node.js を使います。起動用に Wrangler を入れます。

```powershell
cd spinner
npm install
npx wrangler dev
```

ブラウザで http://127.0.0.1:8787 を開きます。止めるときは、起動した画面で `Ctrl+C` を押します。`index.html` のダブルクリックは、この版の開き方にしません。

## 押したとき

| 操作 | 結果 |
|---|---|
| 風車をクリック | 止まっていれば時計回りに回る。回っていれば止まる |
| ドラッグ | 何も起きない |
| 風車より上 | 1.0倍と2.0倍が入れ替わる。羽根の長さは約4.2cmのまま。回転は止まらない |
| 風車より左 | 逆回転。印は↺。回転は止まらない |
| 風車より右 | 時計回り。印は↻。回転は止まらない |
| それ以外 | 回転が止まる |

操作のたびに、向き、回転、倍率を Durable Object へ書きます。回っているあいだは、向きを短い間隔で更新します。

## 資料

読む順と役割は [ドキュメント一覧](spinner/ドキュメント/README.md) にあります。何を作るかの正は [要件定義書](spinner/ドキュメント/要件定義書.md) です。採用する技術の詳細は [技術スタック](spinner/ドキュメント/技術スタック.md) です。

## 確認用の EC2

東京の EC2 は、2026年10月20日に消してあります。あの EC2 は、以前の Node.js の静的配信です。この版の Durable Object は、そこでは動きません。いま開くときは、上の Wrangler です。作り直す手順は [AWSデプロイガイド](spinner/ドキュメント/AWSデプロイガイド.md) に残しています。

請求は 0 円です。
