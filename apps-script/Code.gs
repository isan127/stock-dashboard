const SCRIPT_PROPERTY_SPREADSHEET_ID = "SPREADSHEET_ID";
const SHEET_HOLDINGS = "保有銘柄マスター";
const SHEET_DASHBOARD_DISPLAY = "ダッシュボード表示データ";
const SHEET_WEEKLY_REVIEW_DISPLAY = "週次レビュー表示データ";

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
        commonCheckpoints: [],
        stockDigest: []
      },
      stocks: [],
      dashboard: [],
      weeklyReviews: [],
      weeklyReview: null
    };
    return callback ? createJsonpOutput_(callback, errorData) : createJsonOutput_(errorData);
  }
}

function buildDashboardData_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_SPREADSHEET_ID);
  if (!spreadsheetId) throw new Error("Script Properties に SPREADSHEET_ID が設定されていません。");

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const masterRows = readSheetObjects_(spreadsheet, SHEET_HOLDINGS);
  const dashboardRows = readDashboardDisplayRows_(spreadsheet);
  const dashboardByCode = buildDashboardDisplayMap_(dashboardRows);
  const weeklyReviews = readWeeklyReviews_(spreadsheet);

  const activeMasterRows = masterRows
    .filter((row) => stringValue_(row["有効/無効"]) === "有効")
    .sort((a, b) => toNumber_(a["表示順"], 9999) - toNumber_(b["表示順"], 9999));

  const stocks = activeMasterRows
    .map((row) => applyDashboardDisplayData_(buildStockFromMaster_(row), dashboardByCode[stringValue_(row["証券コード"])]))
    .sort((a, b) => toNumber_(a.displayOrder, 9999) - toNumber_(b.displayOrder, 9999));

  return {
    meta: {
      title: "保有株チェック",
      appsScriptVersion: "display-values-v2",
      displayType: displayTypeForToday_(),
      type: displayTypeForToday_(),
      date: formatDate_(new Date()),
      target: "保有銘柄",
      targetStocks: stocks.map((stock) => stock.name)
    },
    summary: buildSummary_(stocks),
    stocks: stocks,
    dashboard: dashboardRows.map(toPublicDashboardRow_),
    weeklyReviews: weeklyReviews,
    weeklyReview: weeklyReviews[0] || null
  };
}

function readDashboardDisplayRows_(spreadsheet) {
  return readOptionalSheetObjects_(spreadsheet, SHEET_DASHBOARD_DISPLAY)
    .filter((row) => stringValue_(row["有効/無効"]) === "有効")
    .sort((a, b) => toNumber_(a["表示順"], 9999) - toNumber_(b["表示順"], 9999));
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

function buildStockFromMaster_(row) {
  const name = cleanReferenceText_(row["銘柄名"]);
  const code = stringValue_(row["証券コード"]);
  const policy = cleanReferenceText_(row["基本方針"]) || "放置";
  const investmentPurpose = cleanReferenceText_(row["投資目的"]);
  const priority = cleanReferenceText_(row["優先度"]);
  const watchPoints = splitList_(row["見るポイント"]);
  const cautionPoints = splitList_(row["注意点"]);
  const triggers = cautionPoints.length ? cautionPoints : [];

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
    oneLine: investmentPurpose || "ダッシュボード表示データは未入力です。",
    summaryComment: investmentPurpose || "ダッシュボード表示データは未入力です。",
    todayJudgement: "基本方針をもとに確認してください。",
    decisionText: "基本方針をもとに確認してください。",
    decisionDetails: [
      { label: "買い増し", value: "未入力" },
      { label: "利確", value: "未入力" },
      { label: "放置", value: "未入力" }
    ],
    decisionBreakdown: { buy: "未入力", takeProfit: "未入力", hold: "未入力" },
    newsSummary: "",
    newsTrend: "",
    relatedNews: [],
    news: [],
    forecast: { prediction: "未入力", confidence: "未入力", range: { low: null, high: null }, strongCase: "", weakCase: "", baseCase: "" },
    weeklyForecast: { forecast: "未入力", confidence: "未入力", range: { low: null, high: null }, strongCase: "", weakCase: "", baseCase: "" },
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

  const name = cleanReferenceText_(row["銘柄名"]);
  const code = stringValue_(row["証券コード"]);
  const summaryComment = cleanReferenceText_(row["一言"]);
  const decisionText = cleanReferenceText_(row["今日時点の判断"]);
  const newsTrend = cleanReferenceText_(row["ニュース傾向"]);
  const forecastText = cleanReferenceText_(row["今週予想"]);
  const confidence = cleanReferenceText_(row["自信度"]);
  const watchPoints = splitList_(row["今後見るポイント"]);
  const triggers = splitList_(row["方針変更トリガー"]);
  const range = {
    low: displayText_(row["想定レンジ下限"]),
    high: displayText_(row["想定レンジ上限"])
  };
  const weeklyForecast = {
    forecast: forecastText || stock.weeklyForecast.forecast,
    confidence: confidence || stock.weeklyForecast.confidence,
    range: range,
    strongCase: cleanReferenceText_(row["強い場合"]),
    weakCase: cleanReferenceText_(row["弱い場合"]),
    baseCase: cleanReferenceText_(row["基本想定"])
  };
  const news = buildNews_(row);
  const decisionBreakdown = {
    buy: cleanReferenceText_(row["買い増し判断"]) || stock.decisionBreakdown.buy,
    takeProfit: cleanReferenceText_(row["利確判断"]) || stock.decisionBreakdown.takeProfit,
    hold: cleanReferenceText_(row["放置判断"]) || stock.decisionBreakdown.hold
  };

  return Object.assign({}, stock, {
    name: name || stock.name,
    shortName: name || stock.shortName,
    code: code || stock.code,
    price: displayText_(row["株価"]),
    change: displayText_(row["前日比"]),
    changeRate: displayText_(row["前日比率"]),
    conclusion: cleanReferenceText_(row["結論"]) || stock.conclusion,
    confidence: confidence || stock.confidence,
    attentionLevel: confidence || stock.attentionLevel,
    needAction: cleanReferenceText_(row["今日動く必要"]) || stock.needAction,
    actionRequired: cleanReferenceText_(row["今日動く必要"]) || stock.actionRequired,
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
    watchPoints: watchPoints.length ? watchPoints : stock.watchPoints,
    triggers: triggers.length ? triggers : stock.triggers,
    policyTriggers: triggers.length ? triggers : stock.policyTriggers,
    shortTermView: cleanReferenceText_(row["最短見通し"]),
    shortOutlook: cleanReferenceText_(row["最短見通し"]),
    displayOrder: toNumber_(row["表示順"], stock.displayOrder)
  });
}

function buildNews_(row) {
  const news = [];
  for (let index = 1; index <= 3; index += 1) {
    const title = cleanReferenceText_(row[`ニュース${index}_見出し`]);
    const content = cleanReferenceText_(row[`ニュース${index}_内容`]);
    const impact = cleanReferenceText_(row[`ニュース${index}_影響`]);
    const source = cleanReferenceText_(row[`ニュース${index}_ソース`]);
    if (!title && !content && !impact && !source) continue;
    news.push({ title: title, content: content, impact: impact, source: source });
  }
  return news;
}

function readWeeklyReviews_(spreadsheet) {
  return readOptionalSheetObjects_(spreadsheet, SHEET_WEEKLY_REVIEW_DISPLAY)
    .filter((row) => hasWeeklyReviewValue_(row))
    .sort((a, b) => toNumber_(a["表示順"], 9999) - toNumber_(b["表示順"], 9999))
    .map((row) => ({
      week: cleanReferenceText_(row["週"]),
      name: cleanReferenceText_(row["銘柄名"]),
      stockName: cleanReferenceText_(row["銘柄名"]),
      code: stringValue_(row["証券コード"]),
      weeklyForecast: cleanReferenceText_(row["月曜予想"]),
      mondayForecast: cleanReferenceText_(row["月曜予想"]),
      forecastRangeLow: displayText_(row["想定レンジ下限"]),
      forecastRangeHigh: displayText_(row["想定レンジ上限"]),
      forecastRange: formatRangeText_(row["想定レンジ下限"], row["想定レンジ上限"]),
      mondayPolicy: cleanReferenceText_(row["月曜時点の方針"]),
      weeklyResult: cleanReferenceText_(row["実際の値動き"]),
      actualMove: cleanReferenceText_(row["実際の値動き"]),
      actualRangeLow: displayText_(row["実際レンジ下限"]),
      actualRangeHigh: displayText_(row["実際レンジ上限"]),
      actualRange: formatRangeText_(row["実際レンジ下限"], row["実際レンジ上限"]),
      matchLevel: cleanReferenceText_(row["一致度"]),
      matchedPoints: cleanReferenceText_(row["当たった点"]),
      missedPoints: cleanReferenceText_(row["外れた点"]),
      nextImprovement: cleanReferenceText_(row["次回に活かす点"]),
      provisionalNextPolicy: cleanReferenceText_(row["来週に向けた暫定方針"]),
      displayOrder: toNumber_(row["表示順"], 9999)
    }));
}

function toPublicDashboardRow_(row) {
  return {
    "日付": normalizeSettingValue_(row["日付"]),
    "種別": cleanReferenceText_(row["種別"]),
    "銘柄名": cleanReferenceText_(row["銘柄名"]),
    "証券コード": stringValue_(row["証券コード"]),
    "株価": displayText_(row["株価"]),
    "前日比": displayText_(row["前日比"]),
    "前日比率": displayText_(row["前日比率"]),
    "結論": cleanReferenceText_(row["結論"]),
    "自信度": cleanReferenceText_(row["自信度"]),
    "今日動く必要": cleanReferenceText_(row["今日動く必要"]),
    "一言": cleanReferenceText_(row["一言"]),
    "表示順": toNumber_(row["表示順"], 9999)
  };
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
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map((header) => normalizeKey_(header));
  return values.slice(1).map((row, rowIndex) => {
    const item = { __rowNumber: rowIndex + 2 };
    headers.forEach((header, index) => {
      if (header) item[header] = row[index];
    });
    return item;
  });
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

function displayText_(value) {
  const text = stringValue_(value);
  return text ? cleanReferenceText_(text) : null;
}

function cleanReferenceText_(value) {
  return stringValue_(value)
    .replace(/\{?\s*"?(?:xcontentReference|contentReference)"?\s*:[^}\n]+}?\s*/gi, "")
    .replace(/\{?\s*"?sourceReference"?\s*:[^}\n]+}?\s*/gi, "")
    .replace(/\b(?:xcontentReference|contentReference|sourceReference|turn|cite|index)\s*[:=]\s*[\w.-]+/gi, "")
    .replace(/【[^】]*(?:xcontentReference|contentReference|sourceReference|turn|cite|index)[^】]*】/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitList_(value) {
  return cleanReferenceText_(value)
    .split(/[\n｜|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber_(value, fallback) {
  const text = normalizeNumericText_(value);
  if (!text) return fallback;
  const number = Number(text);
  return Number.isFinite(number) ? number : fallback;
}

function hasWeeklyReviewValue_(row) {
  return Boolean(
    cleanReferenceText_(row["実際の値動き"]) ||
    cleanReferenceText_(row["一致度"]) ||
    cleanReferenceText_(row["来週に向けた暫定方針"]) ||
    cleanReferenceText_(row["月曜予想"]) ||
    cleanReferenceText_(row["当たった点"]) ||
    cleanReferenceText_(row["外れた点"]) ||
    cleanReferenceText_(row["次回に活かす点"])
  );
}

function normalizeKey_(value) {
  return String(value || "")
    .replace(/[\ufeff\u200b\u200c\u200d]/g, "")
    .replace(/[\u00a0\u3000]/g, " ")
    .trim();
}

function normalizeNumericText_(value) {
  const text = String(value || "")
    .replace(/[,\u00a0\u3000\s円￥%]/g, "")
    .replace(/[＋]/g, "+")
    .replace(/[－ー―]/g, "-")
    .trim();
  if (!text || /^#(?:ERROR|N\/A|VALUE|REF|DIV\/0)!?$/i.test(text)) return "";
  return text;
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

function formatRangeText_(lowValue, highValue) {
  const low = displayText_(lowValue);
  const high = displayText_(highValue);
  if (!low && !high) return "";
  if (low && high) return `${low} 〜 ${high}`;
  return low || high || "";
}

function displayTypeForToday_() {
  const day = new Date().getDay();
  if (day === 1) return "月曜チェック";
  if (day === 6) return "週次レビュー";
  return "毎朝チェック";
}

function formatDate_(date) {
  const timeZone = Session.getScriptTimeZone() || "Asia/Tokyo";
  return Utilities.formatDate(date, timeZone, "yyyy/MM/dd");
}
