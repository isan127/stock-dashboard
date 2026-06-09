const SCRIPT_PROPERTY_SPREADSHEET_ID = "SPREADSHEET_ID";

const SHEET_HOLDINGS = "保有銘柄マスター";
const SHEET_DAILY_DISPLAY = "日次表示データ";
const SHEET_WEEKLY_REVIEW_DISPLAY = "週次レビュー表示データ";
const SHEET_MONTHLY_REVIEW_DISPLAY = "月次レビュー表示データ";

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
      meta: {
        date: formatDate_(new Date()),
        target: "保有銘柄",
        dataSources: dataSourceMeta_()
      },
      summary: {
        needAction: "確認が必要",
        actionRequired: "確認が必要",
        overallPolicy: "未設定",
        alertStock: "未設定",
        watchStock: "未設定",
        commonCheckpoints: [],
        stockDigest: []
      },
      stocks: [],
      dailyDisplayData: [],
      weeklyReviews: [],
      monthlyReviews: []
    };
    return callback ? createJsonpOutput_(callback, errorData) : createJsonOutput_(errorData);
  }
}

function buildDashboardData_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_SPREADSHEET_ID);
  if (!spreadsheetId) throw new Error("Script Properties に SPREADSHEET_ID が設定されていません。");

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const masterRows = readSheetObjects_(spreadsheet, SHEET_HOLDINGS);
  const dailyRows = readDailyDisplayRows_(spreadsheet);
  const weeklyReviews = readWeeklyReviews_(spreadsheet);
  const monthlyReviews = readMonthlyReviews_(spreadsheet);

  const activeMasterRows = masterRows
    .filter((row) => stringValue_(row["有効/無効"]) === "有効")
    .sort((a, b) => toNumber_(a["表示順"], 9999) - toNumber_(b["表示順"], 9999));
  const activeCodes = activeMasterRows.map((row) => stringValue_(row["証券コード"])).filter(Boolean);
  const dailyByCode = buildLatestRowMap_(dailyRows, "日付");

  const stocks = activeMasterRows
    .map((row) => applyDailyDisplayData_(buildStockFromMaster_(row), dailyByCode[stringValue_(row["証券コード"])]))
    .sort((a, b) => toNumber_(a.displayOrder, 9999) - toNumber_(b.displayOrder, 9999));

  const visibleWeeklyReviews = filterReviewsByActiveCodes_(weeklyReviews, activeCodes);
  const visibleMonthlyReviews = filterReviewsByActiveCodes_(monthlyReviews, activeCodes);
  const updatedAt = latestUpdatedAt_([dailyRows, visibleWeeklyReviews, visibleMonthlyReviews]);

  return {
    meta: {
      title: "StockScope",
      appsScriptVersion: "new-display-sheets-v1",
      displayType: displayTypeForToday_(),
      type: displayTypeForToday_(),
      date: formatDate_(new Date()),
      updatedAt: updatedAt,
      lastUpdated: updatedAt,
      target: "保有銘柄",
      targetStocks: stocks.map((stock) => stock.name),
      dataSources: dataSourceMeta_()
    },
    summary: buildSummary_(stocks, visibleWeeklyReviews, visibleMonthlyReviews),
    stocks: stocks,
    dailyDisplayData: dailyRows.map(toPublicDailyRow_),
    weeklyReviews: visibleWeeklyReviews,
    monthlyReviews: visibleMonthlyReviews
  };
}

function dataSourceMeta_() {
  return {
    daily: SHEET_DAILY_DISPLAY,
    weekly: SHEET_WEEKLY_REVIEW_DISPLAY,
    monthly: SHEET_MONTHLY_REVIEW_DISPLAY,
    master: SHEET_HOLDINGS
  };
}

function readDailyDisplayRows_(spreadsheet) {
  return readOptionalSheetObjects_(spreadsheet, SHEET_DAILY_DISPLAY)
    .filter((row) => stringValue_(row["有効/無効"]) === "有効")
    .sort(compareDisplayRows_("日付"));
}

function readWeeklyReviews_(spreadsheet) {
  const rows = readOptionalSheetObjects_(spreadsheet, SHEET_WEEKLY_REVIEW_DISPLAY)
    .filter(hasWeeklyReviewValue_)
    .sort(compareDisplayRows_("週"));

  return latestRowsByCode_(rows, "週").map((row) => ({
    period: "weekly",
    week: cleanReferenceText_(row["週"]),
    name: cleanReferenceText_(row["銘柄名"]),
    stockName: cleanReferenceText_(row["銘柄名"]),
    code: stringValue_(row["証券コード"]),
    actionRequired: cleanReferenceText_(row["対応の必要性"]),
    needAction: cleanReferenceText_(row["対応の必要性"]),
    conclusion: cleanReferenceText_(row["現在の結論"]),
    weeklyForecast: cleanReferenceText_(row["今週の予想"]),
    forecastRangeLow: displayText_(row["想定レンジ下限"]),
    forecastRangeHigh: displayText_(row["想定レンジ上限"]),
    forecastRange: formatRangeText_(row["想定レンジ下限"], row["想定レンジ上限"]),
    actualMove: cleanReferenceText_(row["実際の値動き"]),
    actualRangeLow: displayText_(row["実際レンジ下限"]),
    actualRangeHigh: displayText_(row["実際レンジ上限"]),
    actualRange: formatRangeText_(row["実際レンジ下限"], row["実際レンジ上限"]),
    matchLevel: cleanReferenceText_(row["一致度"]),
    matchedPoints: cleanReferenceText_(row["当たった点"]),
    missedPoints: cleanReferenceText_(row["外れた点"]),
    nextImprovement: cleanReferenceText_(row["次回に活かす点"]),
    mainReasons: splitList_(row["主な理由"]),
    watchPoints: splitList_(row["見るポイント"]),
    policyTriggers: splitList_(row["方針変更トリガー"]),
    nextWeekPolicy: cleanReferenceText_(row["来週方針"]),
    displayOrder: toNumber_(row["表示順"], 9999),
    updatedAt: normalizeDisplayDate_(row["更新日時"]),
    lastUpdated: normalizeDisplayDate_(row["更新日時"])
  }));
}

function readMonthlyReviews_(spreadsheet) {
  const rows = readOptionalSheetObjects_(spreadsheet, SHEET_MONTHLY_REVIEW_DISPLAY)
    .filter(hasMonthlyReviewValue_)
    .sort(compareDisplayRows_("月"));

  return latestRowsByCode_(rows, "月").map((row) => ({
    period: "monthly",
    month: cleanReferenceText_(row["月"]),
    targetMonth: cleanReferenceText_(row["月"]),
    name: cleanReferenceText_(row["銘柄名"]),
    stockName: cleanReferenceText_(row["銘柄名"]),
    code: stringValue_(row["証券コード"]),
    actionRequired: cleanReferenceText_(row["対応の必要性"]),
    needAction: cleanReferenceText_(row["対応の必要性"]),
    conclusion: cleanReferenceText_(row["現在の結論"]),
    monthlyForecast: cleanReferenceText_(row["今月の見立て"]),
    monthlyView: cleanReferenceText_(row["今月の見立て"]),
    forecastRangeLow: displayText_(row["想定レンジ下限"]),
    forecastRangeHigh: displayText_(row["想定レンジ上限"]),
    forecastRange: formatRangeText_(row["想定レンジ下限"], row["想定レンジ上限"]),
    actualMove: cleanReferenceText_(row["実際の値動き"]),
    actualRangeLow: displayText_(row["実際レンジ下限"]),
    actualRangeHigh: displayText_(row["実際レンジ上限"]),
    actualRange: formatRangeText_(row["実際レンジ下限"], row["実際レンジ上限"]),
    matchLevel: cleanReferenceText_(row["一致度"]),
    matchedPoints: cleanReferenceText_(row["当たった点"]),
    missedPoints: cleanReferenceText_(row["外れた点"]),
    nextImprovement: cleanReferenceText_(row["次回に活かす点"]),
    monthlySummary: cleanReferenceText_(row["月間サマリー"]),
    mainReasons: splitList_(row["主な理由"]),
    strongWeakMaterials: splitList_(row["強弱材料"]),
    watchPoints: splitList_(row["見るポイント"]),
    policyTriggers: splitList_(row["方針変更トリガー"]),
    nextMonthPolicy: cleanReferenceText_(row["来月方針"]),
    displayOrder: toNumber_(row["表示順"], 9999),
    updatedAt: normalizeDisplayDate_(row["更新日時"]),
    lastUpdated: normalizeDisplayDate_(row["更新日時"])
  }));
}

function buildStockFromMaster_(row) {
  const name = cleanReferenceText_(row["銘柄名"]);
  const code = stringValue_(row["証券コード"]);
  const policy = cleanReferenceText_(row["基本方針"]) || "放置";
  const investmentPurpose = cleanReferenceText_(row["投資目的"]);
  const priority = cleanReferenceText_(row["優先度"]);

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
    oneLine: investmentPurpose || "日次表示データは未入力です。",
    summaryComment: investmentPurpose || "日次表示データは未入力です。",
    todayJudgement: "日次表示データを確認してください。",
    decisionText: "日次表示データを確認してください。",
    mainReasons: [],
    decisionDetails: [],
    newsSummary: "",
    newsTrend: "",
    relatedNews: [],
    news: [],
    investmentPurpose: investmentPurpose,
    priority: priority,
    watchPoints: [],
    triggers: [],
    policyTriggers: [],
    shortTermView: "",
    shortOutlook: "",
    displayOrder: toNumber_(row["表示順"], 9999),
    updatedAt: normalizeDisplayDate_(row["最終更新日"]),
    lastUpdated: normalizeDisplayDate_(row["最終更新日"])
  };
}

function applyDailyDisplayData_(stock, row) {
  if (!row) return stock;

  const name = cleanReferenceText_(row["銘柄名"]);
  const code = stringValue_(row["証券コード"]);
  const reasons = splitList_(row["主な理由"]);
  const watchPoints = splitList_(row["今後見るポイント"]);
  const triggers = splitList_(row["方針変更トリガー"]);
  const summaryComment = cleanReferenceText_(row["一言"]);
  const judgement = cleanReferenceText_(row["今日の見立て"]);
  const updatedAt = normalizeDisplayDate_(row["更新日時"]);

  return Object.assign({}, stock, {
    name: name || stock.name,
    shortName: name || stock.shortName,
    code: code || stock.code,
    price: displayText_(row["株価"]),
    change: displayText_(row["前日比"]),
    changeRate: displayText_(row["前日比率"]),
    actionRequired: cleanReferenceText_(row["対応の必要性"]) || stock.actionRequired,
    needAction: cleanReferenceText_(row["対応の必要性"]) || stock.needAction,
    conclusion: cleanReferenceText_(row["現在の結論"]) || stock.conclusion,
    confidence: cleanReferenceText_(row["自信度"]) || stock.confidence,
    attentionLevel: cleanReferenceText_(row["自信度"]) || stock.attentionLevel,
    oneLine: summaryComment || stock.oneLine,
    summaryComment: summaryComment || stock.summaryComment,
    todayJudgement: judgement || stock.todayJudgement,
    decisionText: judgement || stock.decisionText,
    priceSummary: cleanReferenceText_(row["株価サマリー"]),
    mainReasons: reasons,
    decisionDetails: reasons.map((reason) => ({ label: "理由", value: reason })),
    newsSummary: cleanReferenceText_(row["ニュース傾向"]),
    newsTrend: cleanReferenceText_(row["ニュース傾向"]),
    relatedNews: buildNews_(row),
    news: buildNews_(row),
    watchPoints: watchPoints,
    triggers: triggers,
    policyTriggers: triggers,
    shortTermView: cleanReferenceText_(row["最短見通し"]),
    shortOutlook: cleanReferenceText_(row["最短見通し"]),
    displayOrder: toNumber_(row["表示順"], stock.displayOrder),
    updatedAt: updatedAt || stock.updatedAt,
    lastUpdated: updatedAt || stock.lastUpdated
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

function toPublicDailyRow_(row) {
  return {
    "日付": normalizeDisplayDate_(row["日付"]),
    "種別": cleanReferenceText_(row["種別"]),
    "銘柄名": cleanReferenceText_(row["銘柄名"]),
    "証券コード": stringValue_(row["証券コード"]),
    "株価": displayText_(row["株価"]),
    "前日比": displayText_(row["前日比"]),
    "前日比率": displayText_(row["前日比率"]),
    "対応の必要性": cleanReferenceText_(row["対応の必要性"]),
    "現在の結論": cleanReferenceText_(row["現在の結論"]),
    "一言": cleanReferenceText_(row["一言"]),
    "今日の見立て": cleanReferenceText_(row["今日の見立て"]),
    "表示順": toNumber_(row["表示順"], 9999),
    "更新日時": normalizeDisplayDate_(row["更新日時"])
  };
}

function buildSummary_(stocks, weeklyReviews, monthlyReviews) {
  const alertStocks = stocks
    .filter((stock) => stock.conclusion.includes("要注意") || stock.conclusion.includes("方針見直し"))
    .map((stock) => stock.name);
  const actionRequired = stocks.some((stock) => stringValue_(stock.needAction).includes("あり")) ? "あり" : "なし";
  const commonCheckpoints = buildCommonCheckpoints_(stocks);

  return {
    needAction: actionRequired,
    actionRequired: actionRequired,
    overallPolicy: stocks.map((stock) => stock.conclusion).filter(Boolean).join(" / ") || "未設定",
    alertStock: alertStocks.length ? alertStocks.join("、") : "未設定",
    watchStock: alertStocks.length ? alertStocks.join("、") : "未設定",
    commonCheckpoints: commonCheckpoints,
    stockDigest: stocks.map((stock) => ({
      name: stock.name,
      conclusion: stock.conclusion,
      priority: stock.priority || stock.attentionLevel
    })),
    weeklyCount: weeklyReviews.length,
    monthlyCount: monthlyReviews.length
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

function buildLatestRowMap_(rows, dateKey) {
  const byCode = {};
  latestRowsByCode_(rows, dateKey).forEach((row) => {
    const code = stringValue_(row["証券コード"]);
    if (code) byCode[code] = row;
  });
  return byCode;
}

function latestRowsByCode_(rows, dateKey) {
  const byCode = {};
  rows.forEach((row) => {
    const code = stringValue_(row["証券コード"]);
    if (!code) return;
    const current = byCode[code];
    if (!current || compareRowsByPeriod_(row, current, dateKey) > 0) byCode[code] = row;
  });
  return Object.keys(byCode)
    .map((code) => byCode[code])
    .sort((a, b) => toNumber_(a["表示順"], 9999) - toNumber_(b["表示順"], 9999));
}

function compareDisplayRows_(dateKey) {
  return function(a, b) {
    const period = compareRowsByPeriod_(a, b, dateKey);
    if (period !== 0) return period;
    return toNumber_(a["表示順"], 9999) - toNumber_(b["表示順"], 9999);
  };
}

function compareRowsByPeriod_(a, b, dateKey) {
  const dateA = toDateTime_(a[dateKey]) || toDateTime_(a["更新日時"]);
  const dateB = toDateTime_(b[dateKey]) || toDateTime_(b["更新日時"]);
  if (dateA !== dateB) return dateA - dateB;
  return toNumber_(a.__rowNumber, 0) - toNumber_(b.__rowNumber, 0);
}

function filterReviewsByActiveCodes_(reviews, activeCodes) {
  const activeCodeSet = {};
  activeCodes.forEach((code) => {
    activeCodeSet[code] = true;
  });
  return reviews
    .filter((review) => activeCodeSet[String(review.code)])
    .sort((a, b) => toNumber_(a.displayOrder, 9999) - toNumber_(b.displayOrder, 9999));
}

function latestUpdatedAt_(rowGroups) {
  let latestText = "";
  let latestTime = 0;
  rowGroups.forEach((rows) => {
    rows.forEach((row) => {
      const value = row.updatedAt || row.lastUpdated || row["更新日時"] || row["最終更新日"] || "";
      const time = toDateTime_(value);
      if (time >= latestTime && value) {
        latestTime = time;
        latestText = normalizeDisplayDate_(value);
      }
    });
  });
  return latestText || formatDate_(new Date());
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

function hasWeeklyReviewValue_(row) {
  return Boolean(
    cleanReferenceText_(row["今週の予想"]) ||
    cleanReferenceText_(row["実際の値動き"]) ||
    cleanReferenceText_(row["一致度"]) ||
    cleanReferenceText_(row["来週方針"]) ||
    cleanReferenceText_(row["当たった点"]) ||
    cleanReferenceText_(row["外れた点"]) ||
    cleanReferenceText_(row["次回に活かす点"])
  );
}

function hasMonthlyReviewValue_(row) {
  return Boolean(
    cleanReferenceText_(row["今月の見立て"]) ||
    cleanReferenceText_(row["実際の値動き"]) ||
    cleanReferenceText_(row["一致度"]) ||
    cleanReferenceText_(row["月間サマリー"]) ||
    cleanReferenceText_(row["来月方針"]) ||
    cleanReferenceText_(row["当たった点"]) ||
    cleanReferenceText_(row["外れた点"]) ||
    cleanReferenceText_(row["次回に活かす点"])
  );
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

function normalizeDisplayDate_(value) {
  return cleanReferenceText_(value).replace(/-/g, "/");
}

function toDateTime_(value) {
  if (value instanceof Date) return value.getTime();
  const text = stringValue_(value);
  if (!text) return 0;
  const normalized = text.replace(/\//g, "-");
  const time = Date.parse(normalized);
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
