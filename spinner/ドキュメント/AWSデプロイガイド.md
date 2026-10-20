# AWSデプロイガイド

| 項目 | 内容 |
|---|---|
| 文書名 | AWSデプロイガイド |
| 対象システム | 風車 |
| 版 | 1.1 |
| 作成日 | 2026年10月20日 |
| 作成者 | nsb |
| 関連資料 | 要件定義書、非機能要件、技術スタック、操作手順書 |
| 目的 | 東京の EC2 1台に、風車の画面を載せる手順を示す |

言葉の意味は「用語定義書」に従う。手元のパソコンで `node server.js` を起動する手順は、この資料の対象外である。その開き方は「操作手順書」と「技術スタック」である。

この資料のデプロイは、課題管理ボードと同じく、東京リージョンの EC2 にいま動いている形を載せることである。ログインはない。利用者はこの PC だけを想定する。RDS は作らない。回した状態は残さない。

AWS は無料プランの範囲で使う。無料プランのままなら、クレジットカードへの請求は来ない。起動中の EC2 は、無料プランのクレジットを消費する。

---

## 1. 何を置くか

画面と、それを渡す Node.js は、同じ EC2 に置く。入口は nginx の 80 番だけにする。Node.js は `127.0.0.1` の 3000 番のまま、EC2 の中から渡す。

```text
この PC のブラウザ
  └─ http://EC2の公開アドレス/     nginx（80）
        └─ spinner/server.js       Node.js（127.0.0.1:3000）
              └─ spinner/index.html
```

| 役割 | 置き場所 | 版の目安 |
|---|---|---|
| 画面 | EC2 の `/opt/kazaguruma/index.html` | HTML、CSS、JavaScript。ビルドはしない |
| バックエンド | EC2 の `/opt/kazaguruma/server.js` | Node.js。`node:http`。npm のパッケージは入れない |
| 入口 | EC2 の nginx | 80 番で受け、`127.0.0.1:3000` へ渡す |
| 土台 | `infra/` の Terraform | リージョンは `ap-northeast-1`。既定の VPC |

EC2 のインスタンス型は `t4g.small` である。課題管理ボードと同じ型である。データベースは置かない。

---

## 2. 接続を許す範囲

Terraform のセキュリティグループが正である。値の置き場所は `infra/terraform.tfvars` の `allowed_cidr` で、この PC の公開アドレスを `/32` で書く。このファイルは Git に入れない。

| ポート | 許可する相手 | 用途 |
|---|---|---|
| 22 | この PC だけ | SSH。ユーザーは `ec2-user` |
| 80 | この PC だけ | nginx。ブラウザの入口 |

外から入れる接続に `0.0.0.0/0` は書かない。3000 番は EC2 の外へ開けない。

回線のアドレスが変わったら、`allowed_cidr` を直して `terraform apply` する。直すまで、ブラウザも SSH も届かない。

---

## 3. 事前に要るもの

| もの | 置き場所 | Git |
|---|---|---|
| AWS CLI の認証 | この PC。リージョンは `ap-northeast-1` | 入れない |
| Terraform | `infra/` | 定義は入れる。状態ファイルは入れない |
| Node.js | 手元の確認と、EC2 の中 | npm のパッケージは入れない |
| SSH の秘密鍵 | `infra/keys/kazaguruma` | 入れない |

`infra/terraform.tfvars` の例は次である。アドレスの実値はここに書かない。

```text
allowed_cidr = "このPCの公開アドレス/32"
```

公開鍵は `infra/keys/kazaguruma.pub` である。秘密鍵と公開鍵のフォルダは Git に入れない。

---

## 4. AWS の土台を作る

`infra` で次を実行する。

```powershell
terraform init
terraform apply
```

できるものは EC2、そのセキュリティグループ、SSH の公開鍵である。

終わったら、次で公開アドレスを見る。

```powershell
terraform output public_ip
```

公開アドレスは、インスタンスを止めて起動し直すと変わる。

---

## 5. Node.js と nginx を載せる

SSH の秘密鍵は `infra/keys/kazaguruma` である。

```powershell
ssh -i infra\keys\kazaguruma ec2-user@公開アドレス
```

EC2 の中で、次を実行する。

```bash
sudo dnf install -y nodejs nginx
node -v
```

手元から、画面のファイルと設定をコピーする。ディレクトリの所有者は `ec2-user` にする。

```powershell
scp -i infra\keys\kazaguruma spinner\index.html spinner\server.js ec2-user@公開アドレス:/opt/kazaguruma/
scp -i infra\keys\kazaguruma infra\ec2\kazaguruma.service ec2-user@公開アドレス:/tmp/kazaguruma.service
scp -i infra\keys\kazaguruma infra\ec2\nginx.conf ec2-user@公開アドレス:/tmp/nginx.conf
```

`/opt/kazaguruma` は、コピーの前に EC2 の中で作る。

```bash
sudo mkdir -p /opt/kazaguruma
sudo chown ec2-user:ec2-user /opt/kazaguruma
sudo mv /tmp/kazaguruma.service /etc/systemd/system/kazaguruma.service
sudo mv /tmp/nginx.conf /etc/nginx/nginx.conf
sudo systemctl daemon-reload
sudo systemctl enable --now kazaguruma
sudo nginx -t
sudo systemctl enable --now nginx
```

確認は次である。EC2 の中と、この PC の両方で、風車の HTML が返ればよい。

```bash
curl -s http://127.0.0.1:3000/ | head
```

```powershell
curl.exe -s http://公開アドレス/ 
```

---

## 6. 確認

この PC のブラウザで `http://公開アドレス/` を開く。

次を見れば、載ったと判断する。

1. 画面の真ん中に、赤、青、黄、緑の羽根が4枚ある
2. 中心にピンがあり、下に柄がある
3. 羽根を押すと時計回りに回り、もう一度押すと止まる

nginx の初期画面「Welcome to nginx!」のままなら、`nginx.conf` のコピーと、Node.js の起動を見直す。

---

## 7. 止める、消す、作り直す

チャットや SSH を閉じても、EC2 は止まらない。

| 操作 | その後 |
|---|---|
| EC2 を停止する | サーバ代と公開アドレスの消費は止まる。ディスクは残る。公開アドレスは、次に起動すると変わる |
| EC2 を起動する | `terraform apply` のあと、この PC のアドレスが変わっていれば `allowed_cidr` を直す |
| `terraform destroy` | EC2 のディスクも消える。その後、この構成で減り続けるクレジットはない |

作り直すときは、第4章の `terraform apply` のあと、第5章をもう一度行う。Terraform が作り直すのは EC2 までである。Node.js、nginx、画面のファイル、systemd のユニットは、EC2 の中で入れ直す。

消さずに残しておくものは、`infra/keys/kazaguruma` と `infra/terraform.tfvars` である。この2つが無いと、同じ鍵では戻れない。

---

## 8. いまの状態

2026年10月20日に、`infra` で `terraform destroy` を実行した。消したものは、EC2、セキュリティグループ、SSH の公開鍵の登録、IAM の役割とインスタンスプロファイルである。ディスクも消えた。公開アドレス `35.78.193.54` は、もう開かない。

残しているものは、`infra/` の定義、`infra/keys/kazaguruma`、`infra/terraform.tfvars` である。作り直すときは、第4章の `terraform apply` のあと、第5章で Node.js、nginx、画面のファイルを入れ直す。公開アドレスは、新しいものになる。この PC のアドレスが変わっていれば、`allowed_cidr` を直してから `terraform apply` する。

消したあと、この構成で減り続けるクレジットはない。いま開くときは、手元で `node server.js` を実行し、`http://127.0.0.1:3000` を開く。

---

## 9. 改訂履歴

| 版 | 日付 | 内容 |
|---|---|---|
| 1.0 | 2026年10月20日 | 初版。東京の EC2 1台に、nginx から Node.js へ渡す形で風車を載せる。RDS は作らない |
| 1.1 | 2026年10月20日 | `terraform destroy` で EC2 一式を消した。定義と秘密鍵は残し、作り直しは第4章と第5章とした |
