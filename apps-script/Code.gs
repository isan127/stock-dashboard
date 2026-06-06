const SCRIPT_PROPERTY_SPREADSHEET_ID = "SPREADSHEET_ID";
const SHEET_HOLDINGS = "保有銘柄マスター";
const SHEET_SETTINGS = "設定";

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
    return createJsonOutput_({
      error: true,
      message: "callback名が不正です。"
    });
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
        commonCheckpoints: []
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
  const activeRows = masterRows
    .filter((row) => String(row["有効/無効"] || "").trim() === "有効")
    .sort((a, b) => toNumber_(a["表示順"], 9999) - toNumber_(b["表示順"], 9999));

  const stocks = activeRows.map((row) => buildStock_(row));
  const alertStock = stocks.find((stock) => stock.attentionLevel === "高") || stocks[0] || null;
  const commonCheckpoints = buildCommonCheckpoints_(stocks);
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
    summary: {
      needAction: "なし",
      actionRequired: "なし",
      overallPolicy: "放置寄り",
      alertStock: alertStock ? alertStock.name : "未設定",
      watchStock: alertStock ? alertStock.name : "未設定",
      weeklyFocus: "AI関連・為替・自動車株の地合い",
      commonCheckpoints: commonCheckpoints
    },
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
    forecast: { prediction: "未設定", confidence: "未設定", range: "未設定", strongCase: "", weakCase: "", baseCase: "" },
    weeklyForecast: { forecast: "未設定", confidence: "未設定", range: { low: null, high: null }, strongCase: "", weakCase: "", baseCase: "" },
    investmentPurpose: investmentPurpose,
    priority: priority,
    watchPoints: watchPoints,
    cautionPoints: cautionPoints,
    triggers: triggers,
    policyTriggers: triggers,
    shortTermView: "",
    shortOutlook: ""
  };
}

function readSheetObjects_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error(sheetName + " シートが見つかりません。");
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map((header) => String(header || "").trim());
  return values.slice(1).map((row) => {
    const item = {};
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

function toNumber_(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
