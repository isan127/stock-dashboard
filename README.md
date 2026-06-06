# 保有株チェックダッシュボード

個人用の保有株チェック・株ニュース確認用ダッシュボードです。

静的な `data.json` または Google Apps Script などの remote JSON を読み込み、全体サマリーと銘柄別の判断メモを表示します。

## ファイル構成

- `index.html`: 画面の土台
- `style.css`: デザイン
- `script.js`: データ読み込み、タブ切り替え、画面描画
- `config.js`: local / remote データの切り替え設定
- `data.json`: ローカル表示用サンプルデータ
- `apps-script/Code.gs`: GoogleスプレッドシートをJSON API化するApps Script雛形
- `README.md`: 説明

## セキュリティ方針

GitHub側や返却JSONには以下を含めないでください。

- 保有株数
- 平均取得単価
- 評価損益
- 証券会社
- 口座区分
- GoogleスプレッドシートURL
- APIキー
- 個人情報
- 個人的な売買メモ

## remote JSON 切り替え

`config.js` で読み込むデータ元を切り替えます。

```js
window.STOCK_DASHBOARD_CONFIG = {
  USE_REMOTE_DATA: false,
  REMOTE_DATA_URL: ""
};
```

- `USE_REMOTE_DATA=false` の場合は `data.json` を使用します。
- `USE_REMOTE_DATA=true` かつ `REMOTE_DATA_URL` が設定されている場合は、remote JSON の取得を試みます。
- 通常fetchに失敗した場合はJSONP方式で再取得します。
- fetchとJSONPの両方に失敗した場合のみ `data.json` にフォールバックします。
- `REMOTE_DATA_URL` にはGoogle Apps ScriptのWeb App URLを設定します。

## 画面表示

- メインタイトルは常に `保有株チェック` です。
- `HTMLカード` は設定シート上の表示形式であり、画面タイトルやサブタイトルには使いません。
- サブタイトルは曜日または表示種別に応じて変わります。
- 月曜は `月曜チェック / 今週の予想` を表示します。
- 火曜から金曜は `毎朝チェック` を表示します。
- 土曜は `週次レビュー / 予想の答え合わせ` を表示します。
- 日付と銘柄数は画面右上に表示します。

## デバッグ表示

データ取得元の表示は通常画面では非表示です。

URLに `?debug=1` を付けた場合だけ、画面上にデータ取得元を表示します。

例:

```text
https://isan127.github.io/stock-dashboard/?debug=1
```

表示される値の例:

- `Remote JSON`
- `Remote JSONP`
- `Local data.json`
- `Remote失敗 → Local fallback`

通常運用では表示をすっきりさせ、反映確認や原因切り分けの時だけ `?debug=1` を使います。

## Apps Script設置手順

1. Googleスプレッドシートを開く
2. 拡張機能 → Apps Script
3. `apps-script/Code.gs` の内容を貼り付ける
4. プロジェクト設定 → Script Properties に `SPREADSHEET_ID` を追加する
5. `SPREADSHEET_ID` の値に対象スプレッドシートIDを設定する
6. デプロイ → 新しいデプロイ → ウェブアプリ
7. 実行ユーザーを `自分` にする
8. アクセスできるユーザーを必要に応じて設定する
9. 発行されたWeb App URLを `config.js` の `REMOTE_DATA_URL` に入れる
10. `config.js` の `USE_REMOTE_DATA` を `true` に変更する
11. ダッシュボードを開いて表示確認する

## CORS時のJSONP取得

GitHub PagesからGoogle Apps ScriptのWeb App URLを通常の `fetch` で読むと、CORS制限で失敗する場合があります。

このダッシュボードは、まず通常fetchでremote JSONを取得します。fetchが失敗した場合は、同じApps Script URLに `callback` パラメータを付けてJSONP方式で取得します。

Apps Script側は `callback` パラメータがある場合、以下のようなJavaScript形式で返します。

```js
callbackName({...});
```

`callback` がない場合は従来通りJSONを返します。

画面の `データ取得元` が `Remote JSON` または `Remote JSONP` なら、スプレッドシート連携データを読めています。

## 反映されないときの確認

1. GitHub Pagesの `/config.js?v=数字` を直接開き、`USE_REMOTE_DATA=true` になっているか確認する
2. `REMOTE_DATA_URL` にApps ScriptのWeb App URLが入っているか確認する
3. Apps Script URLを直接開き、JSON内の銘柄名が更新されているか確認する
4. Apps Script URLに `?callback=test` を付け、`test({...});` の形式で返るか確認する
5. GitHub Pagesを `?v=数字` 付きで開き直す
6. 必要に応じて `?debug=1` を付け、画面上の `データ取得元` を確認する
7. ブラウザのConsoleで `fetch remote start`、`fetch remote success`、`jsonp remote success`、`loaded local data.json` などのログを確認する

## ローカル確認

`fetch` で `data.json` を読むため、ローカルで `index.html` を直接開くと動かない場合があります。その場合は簡易サーバーで確認します。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開き、全体タブと銘柄別タブが切り替わるか確認してください。
