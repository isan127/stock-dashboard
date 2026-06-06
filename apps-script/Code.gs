const SCRIPT_PROPERTY_SPREADSHEET_ID = "SPREADSHEET_ID";
const SHEET_HOLDINGS = "保有銘柄マスター";
const SHEET_SETTINGS = "設定";
const SHEET_DASHBOARD_DISPLAY = "ダッシュボード表示データ";

const PUBLIC_SETTING_KEYS = [
  "通知時間",
  "対象曜日",
  "月曜テンプレート",
  "火〜金テンプレート",
  "土曜テンプレート",
  "表示形式",
  "タブ表示",
  "ニュース件数",
  "ニュース優先度",
  "参照期間_毎朝",
  "参照期間_月曜",
  "参照期間_土曜",
  "基準通貨",
  "対象市場",
  "通知先",
  "GitHub Pages URL",
  "最終更新日"
];

function doGet(e) {
  const callback = e && e.parameter ? String(e.parameter.callback || "").trim() : "";
  if (callback && !isValidCallbackName_(callback)) {
    return createJsonOutput_({ error: true, message: "callback名が不正です。" });
  }

  try {
    const data = buildDashboardData_();
    return callback ? createJsonpOutput_(callback, data) : createJsonOutput_(data);
  } catch (error) {
    console.error(error);
    const errorData = {
      error: true,
      message: "ダッシュボード用JSONを作成できませんでした。",
      meta: { date: formatDate_(new Date()), target: "保有銘柄" },
      summary: {
        needAction: "確認が必要",
        actionRequired: "確認が必要",
        overallPolicy: "未設定",
        alertStock: "未設定",
        watchStock: "未設定",
        weeklyFocus: "未設定",
        commonCheckpoints: [],
        stockDigest: []
      },
      stocks: [],
      weeklyReview: {}
    };
    return callback ? createJsonpOutput_(callback, errorData) : createJsonOutput_(errorData);
  }
}

function buildDashboardData_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_SPREADSHEET_ID);
  if (!spreadsheetId) throw new Error("Script Properties に SPREADSHEET_ID が設定されていません。");

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const settings = readSettings_(spreadsheet);
  const masterRows = readSheetObjects_(spreadsheet, SHEET_HOLDINGS);
  const dashboardDisplayRows = getDashboardDisplayRowsForCurrentMode_(spreadsheet);
  const dashboardDisplayByCode = buildDashboardDisplayMap_(dashboardDisplayRows);

  const activeRows = masterRows
    .filter((row) => stringValue_(row["有効/無効"]) === "有効")
    .sort((a, b) => toNumber_(a["表示順"], 9999) - toNumber_(b["表示順"], 9999));

  const stocks = activeRows
    .map((row) => applyDashboardDisplayData_(buildStock_(row), dashboardDisplayByCode[stringValue_(row["証券コード"])]))
    .sort((a, b) => toNumber_(a.displayOrder, 9999) - toNumber_(b.displayOrder, 9999));

  const summary = buildSummary_(stocks);
  const displayType = settings["表示形式"] || "月曜チェック＋今週の予想";

  return {
    meta: {
      title: "保有株チェック",
      displayType: displayType,
      type: displayType,
      date: formatDate_(new Date()),
      target: "保有銘柄",
      targetStocks: stocks.map((stock) => stock.name),
      settings: settings
    },
    summary: summary,
    stocks: stocks,
    weeklyReview: {
      weeklyResult: "",
      mondayForecast: "",
      actualRange: "",
      matchLevel: "",
      matchedPoints: "",
      missedPoints: "",
      nextImprovement: "",
      provisionalNextPolicy: ""
    }
  };
}

function getDashboardDisplayRowsForCurrentMode_(spreadsheet) {
  const rows = readOptionalSheetObjects_(spreadsheet, SHEET_DASHBOARD_DISPLAY)
    .filter((row) => stringValue_(row["有効/無効"]) === "有効");
  return rows;
}

function buildDashboardDisplayMap_(rows) {
  const byCode = {};
  rows.forEach((row) => {
    const code = stringValue_(row["証券コード"]);
    if (!code) return;
    const current = byCode[code];
    if (!current || compareDashboardRows_(row, current) > 0) byCode[code] = row;
  });
  return byCode;
}

function compareDashboardRows_(a, b) {
  const dateA = toDateTime_(a["日付"]);
  const dateB = toDateTime_(b["日付"]);
  if (dateA !== dateB) return dateA - dateB;
  return toNumber_(a.__rowNumber, 0) - toNumber_(b.__rowNumber, 0);
}

function buildStock_(row) {
  const name = stringValue_(row["銘柄名"]);
  const code = stringValue_(row["証券コード"]);
  const policy = stringValue_(row["基本方針"]) || "放置";
  const investmentPurpose = stringValue_(row["投資目的"]);
  const priority = stringValue_(row["優先度"]);
  const watchPoints = splitList_(row["見るポイント"]);
  const cautionPoints = splitList_(row["注意点"]);
  const triggers = cautionPoints.length ? cautionPoints : ["方針変更が必要な材料が出たら確認する"];

  return {
    name: name,
    shortName: name,
    code: code,
    conclusion: policy,
    confidence: priorityToConfidence_(priority),
    attentionLevel: priorityToAttentionLevel_(priority),
    needAction: "なし",
    actionRequired: "なし",
    price: null,
    change: null,
    changeRate: null,
    oneLine: investmentPurpose || "スプレッドシート連携の初期データです。",
    summaryComment: "スプレッドシート連携の初期データです。",
    todayJudgement: "基本方針をもとに確認してください。",
    decisionText: "基本方針をもとに確認してください。",
    decisionDetails: [
      { label: "買い増し", value: "今回はしない" },
      { label: "利確", value: "今回はしない" },
      { label: "放置", value: "これでいきましょう" }
    ],
    decisionBreakdown: { buy: "今回はしない", takeProfit: "今回はしない", hold: "これでいきましょう" },
    newsSummary: "ニュースは今後ChatGPT生成データを反映予定です。",
    newsTrend: "ニュースは今後ChatGPT生成データを反映予定です。",
    relatedNews: [],
    news: [],
    forecast: { prediction: "未設定", confidence: "未設定", range: { low: null, high: null }, strongCase: "", weakCase: "", baseCase: "" },
    weeklyForecast: { forecast: "未設定", confidence: "未設定", range: { low: null, high: null }, strongCase: "", weakCase: "", baseCase: "" },
    investmentPurpose: investmentPurpose,
    priority: priority,
    watchPoints: watchPoints,
    cautionPoints: cautionPoints,
    triggers: triggers,
    policyTriggers: triggers,
    shortTermView: "",
    shortOutlook: "",
    displayOrder: toNumber_(row["表示順"], 9999)
  };
}

function applyDashboardDisplayData_(stock, row) {
  if (!row) return stock;

  const name = stringValue_(row["銘柄名"]);
  const code = stringValue_(row["証券コード"]);
  const summaryComment = stringValue_(row["一言"]);
  const decisionText = stringValue_(row["今日時点の判断"]);
  const newsTrend = stringValue_(row["ニュース傾向"]);
  const forecastText = stringValue_(row["今週予想"]);
  const confidence = stringValue_(row["自信度"]);
  const watchPoints = splitList_(row["今後見るポイント"]);
  const triggers = splitList_(row["方針変更トリガー"]);
  const range = { low: nullableNumber_(row["想定レンジ下限"]), high: nullableNumber_(row["想定レンジ上限"]) };
  const weeklyForecast = {
    forecast: forecastText || stock.weeklyForecast.forecast,
    confidence: confidence || stock.weeklyForecast.confidence,
    range: range,
    strongCase: stringValue_(row["強い場合"]),
    weakCase: stringValue_(row["弱い場合"]),
    baseCase: stringValue_(row["基本想定"])
  };
  const news = buildNews_(row);
  const decisionBreakdown = {
    buy: stringValue_(row["買い増し判断"]) || stock.decisionBreakdown.buy,
    takeProfit: stringValue_(row["利確判断"]) || stock.decisionBreakdown.takeProfit,
    hold: stringValue_(row["放置判断"]) || stock.decisionBreakdown.hold
  };

  return Object.assign({}, stock, {
    name: name || stock.name,
    shortName: name || stock.shortName,
    code: code || stock.code,
    price: nullableNumber_(row["株価"]),
    change: nullableNumber_(row["前日比"]),
    changeRate: nullableNumber_(row["前日比率"]),
    conclusion: stringValue_(row["結論"]) || stock.conclusion,
    confidence: confidence || stock.confidence,
    attentionLevel: confidence || stock.attentionLevel,
    needAction: stringValue_(row["今日動く必要"]) || stock.needAction,
    actionRequired: stringValue_(row["今日動く必要"]) || stock.actionRequired,
    oneLine: summaryComment || stock.oneLine,
    summaryComment: summaryComment || stock.summaryComment,
    todayJudgement: decisionText || stock.todayJudgement,
    decisionText: decisionText || stock.decisionText,
    decisionDetails: [
      { label: "買い増し", value: decisionBreakdown.buy },
      { label: "利確", value: decisionBreakdown.takeProfit },
      { label: "放置", value: decisionBreakdown.hold }
    ],
    decisionBreakdown: decisionBreakdown,
    newsSummary: newsTrend || stock.newsSummary,
    newsTrend: newsTrend || stock.newsTrend,
    relatedNews: news,
    news: news,
    forecast: {
      prediction: weeklyForecast.forecast,
      confidence: weeklyForecast.confidence,
      range: weeklyForecast.range,
      strongCase: weeklyForecast.strongCase,
      weakCase: weeklyForecast.weakCase,
      baseCase: weeklyForecast.baseCase
    },
    weeklyForecast: weeklyForecast,
    watchPoints: watchPoints,
    triggers: triggers,
    policyTriggers: triggers,
    shortTermView: stringValue_(row["最短見通し"]),
    shortOutlook: stringValue_(row["最短見通し"]),
    displayOrder: toNumber_(row["表示順"], stock.displayOrder)
  });
}

function buildNews_(row) {
  const news = [];
  for (let index = 1; index <= 3; index += 1) {
    const title = stringValue_(row[`ニュース${index}_見出し`]);
    const content = stringValue_(row[`ニュース${index}_内容`]);
    const impact = stringValue_(row[`ニュース${index}_影響`]);
    const source = stringValue_(row[`ニュース${index}_ソース`]);
    if (!title && !content && !impact && !source) continue;
    news.push({ title: title, content: content, impact: impact, source: source });
  }
  return news;
}

function buildSummary_(stocks) {
  const alertStocks = stocks
    .filter((stock) => stock.conclusion.includes("要注意") || stock.conclusion.includes("方針見直し"))
    .map((stock) => stock.name);
  const actionRequired = stocks.some((stock) => stringValue_(stock.needAction).includes("あり")) ? "あり" : "なし";
  const commonCheckpoints = buildCommonCheckpoints_(stocks);

  return {
    needAction: actionRequired,
    actionRequired: actionRequired,
    overallPolicy: "放置寄り",
    alertStock: alertStocks.length ? alertStocks.join("、") : "未設定",
    watchStock: alertStocks.length ? alertStocks.join("、") : "未設定",
    weeklyFocus: "AI関連・為替・自動車株の地合い",
    commonCheckpoints: commonCheckpoints,
    stockDigest: stocks.map((stock) => ({
      name: stock.name,
      conclusion: stock.conclusion,
      weeklyForecast: stock.weeklyForecast.forecast,
      priority: stock.priority || stock.attentionLevel
    }))
  };
}

function readSheetObjects_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error(sheetName + " シートが見つかりません。");
  return sheetToObjects_(sheet);
}

function readOptionalSheetObjects_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return [];
  return sheetToObjects_(sheet);
}

function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map((header) => String(header || "").trim());
  return values.slice(1).map((row, rowIndex) => {
    const item = { __rowNumber: rowIndex + 2 };
    headers.forEach((header, index) => {
      if (header) item[header] = row[index];
    });
    return item;
  });
}

function readSettings_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_SETTINGS);
  if (!sheet) return {};
  const values = sheet.getDataRange().getValues();
  const settings = {};
  values.forEach((row) => {
    const key = String(row[0] || "").trim();
    if (!PUBLIC_SETTING_KEYS.includes(key)) return;
    if (key === "通知先") {
      settings[key] = row[1] ? "設定済み" : "未設定";
      return;
    }
    settings[key] = normalizeSettingValue_(row[1]);
  });
  return settings;
}

function buildCommonCheckpoints_(stocks) {
  const points = [];
  stocks.forEach((stock) => {
    stock.watchPoints.forEach((point) => {
      if (point && !points.includes(point)) points.push(point);
    });
  });
  return points.slice(0, 8);
}

function createJsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function createJsonpOutput_(callback, data) {
  return ContentService.createTextOutput(callback + "(" + JSON.stringify(data) + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function isValidCallbackName_(callback) {
  return /^[A-Za-z0-9_.]+$/.test(callback);
}

function stringValue_(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function splitList_(value) {
  return stringValue_(value).split(/[\n,、]/).map((item) => item.trim()).filter(Boolean);
}

function nullableNumber_(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toNumber_(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toDateTime_(value) {
  if (value instanceof Date) return value.getTime();
  const text = stringValue_(value);
  if (!text) return 0;
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : 0;
}

function priorityToConfidence_(priority) {
  const value = stringValue_(priority);
  if (["高", "高い", "high", "High"].includes(value)) return "高";
  if (["低", "低い", "low", "Low"].includes(value)) return "低";
  return "中";
}

function priorityToAttentionLevel_(priority) {
  const value = stringValue_(priority);
  if (["高", "高い", "high", "High"].includes(value)) return "高";
  if (["低", "低い", "low", "Low"].includes(value)) return "低";
  return "中";
}

function normalizeSettingValue_(value) {
  if (value instanceof Date) return formatDate_(value);
  if (value === null || value === undefined) return "";
  return value;
}

function formatDate_(date) {
  const timeZone = Session.getScriptTimeZone() || "Asia/Tokyo";
  return Utilities.formatDate(date, timeZone, "yyyy/MM/dd");
}
