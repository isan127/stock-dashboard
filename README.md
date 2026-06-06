# 保有株チェックダッシュボード

## 1. このリポジトリの目的

個人用の保有株チェック・株ニュース確認用ダッシュボードです。

スマホで見やすいカード型UIで、静的な `data.json` または remote JSON を読み込んで、全体サマリーと銘柄別の判断メモを表示します。

## 2. ファイル構成

- `index.html`: 画面の土台
- `style.css`: デザイン
- `script.js`: `data.json` または remote JSON の読み込みとタブ切り替え
- `config.js`: remote JSON と local `data.json` の切り替え設定
- `data.json`: 表示用サンプルデータ
- `apps-script/Code.gs`: GoogleスプレッドシートをJSON API化するためのApps Script雛形
- `README.md`: 説明

## 3. 現在の仕様

- `config.js` の設定に応じて、静的な `data.json` または remote JSON を読み込んで表示
- スマホ向けカード型UI
- 全体タブと銘柄別タブ
- 外部ライブラリなし
- npmなし
- HTML / CSS / JavaScript のみ
- Google Apps Script本体は手動デプロイ前提

## 4. セキュリティ方針

GitHub側には以下を入れないこと。

- 保有株数
- 平均取得単価
- 評価損益
- GoogleスプレッドシートURL
- APIキー
- 個人情報
- 個人的な売買メモ

Apps Scriptの返却JSONにも以下を含めないこと。

- 保有株数
- 平均取得単価
- 評価損益
- 証券会社
- 口座区分
- GoogleスプレッドシートURL
- APIキー
- 個人メモ

GitHub側で扱ってよい情報は、銘柄名、証券コード、株価、前日比、結論、信頼度、ニュース要約、関連ニュース、今週予想、想定レンジ、今後見るポイント、方針変更トリガー、週次レビュー用の要約です。

## 5. 今後の予定

- Googleスプレッドシート連携
- ChatGPT生成データの反映
- 月曜版 / 火〜金版 / 週末版の切り替え
- 予想ログとの連携
- 通知連携
- GitHub Pages公開

## 使い方

`data.json` の `stocks` 配列に銘柄を追加すると、タブも自動で増えます。

ローカルで `index.html` を直接開いた場合、ブラウザの制限で `data.json` が読めないことがあります。GitHub Pages やローカルサーバーで開くと、`data.json` の内容が反映されます。

## remote JSON 切り替え設定

`config.js` は、将来的なGoogleスプレッドシート連携に向けて、読み込むデータ元を切り替えるための設定ファイルです。

```js
window.STOCK_DASHBOARD_CONFIG = {
  USE_REMOTE_DATA: false,
  REMOTE_DATA_URL: ""
};
```

- `USE_REMOTE_DATA=false` の場合は、これまで通り `data.json` を使用します。
- `USE_REMOTE_DATA=true` かつ `REMOTE_DATA_URL` が設定されている場合は、`REMOTE_DATA_URL` からJSON取得を試みます。
- remote取得に失敗した場合は、`data.json` にフォールバックします。
- `USE_REMOTE_DATA=true` でも `REMOTE_DATA_URL` が空の場合は、`data.json` を使用します。
- `REMOTE_DATA_URL` には、将来的にGoogle Apps ScriptのWeb App URLを入れる予定です。

GitHub側にスプレッドシートURL、APIキー、保有株数、平均取得単価、評価損益、個人情報、個人的な売買メモは入れないでください。

## Apps Script連携準備

`apps-script/Code.gs` は、Googleスプレッドシートの内容をダッシュボード用JSONとして返すGoogle Apps Script雛形です。

このコードは `SpreadsheetApp.openById()` を使いますが、スプレッドシートIDはコードに直書きしません。Apps Scriptの Script Properties に `SPREADSHEET_ID` として設定します。

対象シートは以下です。

- `保有銘柄マスター`
- `予想ログ`
- `設定`

現時点の雛形では、`保有銘柄マスター` と `設定` を読み取ります。`予想ログ` は今後の週次レビューや予想履歴連携用の拡張先です。

`保有銘柄マスター` では1行目をヘッダーとして読み取り、`有効/無効` が `有効` の銘柄だけを返します。表示順は `表示順` 列の昇順です。

返却JSONには、銘柄名、証券コード、基本方針、投資目的、優先度、見るポイント、注意点など、公開して問題ないダッシュボード表示用項目だけを含めます。株価、ニュース、予想データは初期実装では仮データです。

`設定` シートはA列を項目、B列を値として読み取ります。`通知先` は個人情報になりやすいため、返却JSONには実値ではなく `設定済み` または `未設定` として返します。スプレッドシートURLそのものは返しません。

## Apps Script設置手順

1. Googleスプレッドシートを開く
2. 拡張機能 → Apps Script
3. `apps-script/Code.gs` の内容を貼り付ける
4. プロジェクト設定 → Script Properties に `SPREADSHEET_ID` を追加する
5. `SPREADSHEET_ID` の値に対象スプレッドシートIDを設定する
6. デプロイ → 新しいデプロイ → ウェブアプリ
7. 実行ユーザーを `自分` にする
8. アクセスできるユーザーを `自分`、または必要に応じて `リンクを知っている全員` にする
9. 発行されたWeb App URLを `config.js` の `REMOTE_DATA_URL` に入れる
10. `config.js` の `USE_REMOTE_DATA` を `true` に変更する
11. ダッシュボードを開いて表示確認する

Web App URLをGitHubに置く場合は、そのURLから秘密情報が返らないことを必ず確認してください。APIキー、GoogleスプレッドシートURL、保有株数、平均取得単価、評価損益、証券会社、口座区分、個人メモはGitHubにも返却JSONにも含めないでください。

## 手動確認方法

1. GitHubで `index.html` を開く
2. 可能であればローカルにcloneしてブラウザで開く
3. ただし `fetch` で `data.json` を読むため、ローカル直開きでは動かない場合がある
4. その場合は簡易サーバーで確認する

```bash
python3 -m http.server 8000
```

5. ブラウザで `http://localhost:8000` を開く
6. 全体 / 村田製作所 / ソフトバンクG / トヨタ のタブが切り替わるか確認する
