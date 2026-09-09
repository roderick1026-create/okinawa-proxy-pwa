const APP_VERSION = '1.7.1';

// V3.2 外部 PWA 專用平衡模式。
// 原本 V1.6.5 的 api() 維持既有行為；apiFast_() 會避免完整重畫儀表板，
// 並在寫入成功後以精簡方式更新「即時損益」數值。
var V3_FAST_MODE_ = false;
var V3_FAST_DASHBOARD_WRITE_ = false;

const SHEETS = {
  ORDERS: '訂單',
  PURCHASES: '採買紀錄',
  PAYMENTS: '收款紀錄',
  HISTORY: '異動紀錄',
  ALLOCATIONS: '採買分配',
  SETTINGS: '設定',
  DASHBOARD: '即時損益'
};

const ORDER_HEADERS_NEW = [
  '訂單ID','建立時間','建單人','顧客','商品','數量',
  '日幣售價/件','代購台幣售價/件','訂單售價TWD總額',
  '收款狀態','訂單狀態','最後修改人','最後修改時間','商品照片URL'
];

const ORDER_HEADERS_V15 = [
  '訂單ID','建立時間','建單人','顧客','商品','數量',
  '日幣售價/件','代購台幣售價/件','訂單售價TWD總額',
  '收款狀態','訂單狀態','最後修改人','最後修改時間'
];

const ORDER_HEADERS_V14 = [
  '訂單ID','建立時間','建單人','顧客','商品','數量',
  '日幣參考價/件','客人售價TWD/件','訂單售價TWD總額',
  '收款狀態','訂單狀態','最後修改人','最後修改時間'
];

const ORDER_HEADERS_V13 = [
  '訂單ID','建立時間','建單人','顧客','商品','數量',
  '日幣售價/件','訂單日幣總額','收款狀態','訂單狀態','最後修改人','最後修改時間'
];

const ORDER_HEADERS_OLD = [
  '訂單ID',
  '建立時間',
  '顧客',
  '商品',
  '數量',
  '日幣售價/件',
  '訂單日幣總額',
  '收款狀態',
  '訂單狀態',
  '建單人',
  '最後修改人',
  '最後修改時間'
];


/**
 * V1.6.1 Google Drive 授權入口
 *
 * 使用方式：
 * 1. 在 Apps Script 上方函式下拉選單選「authorizeDriveAccess」
 * 2. 按「執行」
 * 3. 完成 Google 帳號授權
 *
 * 若此專案綁定 Google 試算表，也可以重新整理試算表後，
 * 從上方選單「沖繩代購」→「🔐 授權 Google Drive」執行。
 */
function authorizeDriveAccess() {
  // 這一行會明確觸發 Google Drive OAuth 權限要求。
  DriveApp.getRootFolder();

  var folderName = '沖繩代購_商品照片';
  var folders = DriveApp.getFoldersByName(folderName);
  var folder;

  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
  }

  try {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // 部分 Google Workspace 會禁止公開連結，這不影響完成 Drive 授權。
  }

  try {
    SpreadsheetApp.getUi().alert(
      '✅ Google Drive 授權完成',
      '已取得 Drive 權限，並確認「' + folderName + '」資料夾可使用。\n\n現在可以回到沖繩代購 APP 測試商品照片上傳。',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e2) {
    // 從 Apps Script 編輯器執行時，不一定有可用 UI，忽略即可。
  }

  return 'Drive authorization OK';
}

/**
 * 開啟綁定的 Google 試算表時，加入方便授權的自訂選單。
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('沖繩代購')
      .addItem('🔐 授權 Google Drive', 'authorizeDriveAccess')
      .addToUi();
  } catch (e) {}
}

function doGet() {
  setupSheets_();
  migrateOrderSheetIfNeeded_();

  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('沖繩代購')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function api(action, payload) {
  setupSheets_();
  migrateOrderSheetIfNeeded_();
  payload = payload || {};

  try {
  switch (action) {
    case 'getData':
      return getData_();
    case 'createOrder':
      return withLock_(function () { return createOrder_(payload); });
    case 'updateOrder':
      return withLock_(function () { return updateOrder_(payload); });
    case 'toggleCancel':
      return withLock_(function () { return toggleCancel_(payload); });
    case 'setOrderCancelled':
      return withLock_(function () { return setOrderCancelled_(payload); });
    case 'recordPurchase':
      return withLock_(function () { return recordPurchase_(payload); });
    case 'updatePurchase':
      return withLock_(function () { return updatePurchase_(payload); });
    case 'deletePurchase':
      return withLock_(function () { return deletePurchase_(payload); });
    case 'togglePayment':
      return withLock_(function () { return togglePayment_(payload); });
    case 'setPayment':
      return withLock_(function () { return setPayment_(payload); });
    case 'setRate':
      return withLock_(function () { return setRate_(payload); });
    default:
      throw new Error('未知操作：' + action);
  }
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);

    if (
      msg.indexOf('DriveApp') >= 0 ||
      msg.indexOf('drive.readonly') >= 0 ||
      msg.indexOf('auth/drive') >= 0 ||
      msg.indexOf('Authorization') >= 0 ||
      msg.indexOf('權限') >= 0
    ) {
      throw new Error(
        'Google Drive 尚未完成授權。請回到 Apps Script，執行 authorizeDriveAccess() 完成一次授權後，再回 APP 重試。'
      );
    }

    throw err;
  }
}

/**
 * V3.2 外部 PWA 專用入口。
 * APP 所需的 summary 仍由 getData_() 即時計算。
 * 寫入成功後，只更新「即時損益」的內容，不重複套用版面格式。
 * 使用 try/finally，確保任何錯誤後都會恢復 V1.6.5 原本模式。
 */
function apiFast_(action, payload) {
  var previousMode = V3_FAST_MODE_;
  var previousDashboardMode = V3_FAST_DASHBOARD_WRITE_;
  var writeActions = {
    createOrder: true,
    updateOrder: true,
    toggleCancel: true,
    setOrderCancelled: true,
    recordPurchase: true,
    updatePurchase: true,
    deletePurchase: true,
    togglePayment: true,
    setPayment: true,
    setRate: true
  };
  V3_FAST_MODE_ = true;
  V3_FAST_DASHBOARD_WRITE_ = !!writeActions[action];
  try {
    return api(action, payload);
  } finally {
    V3_FAST_MODE_ = previousMode;
    V3_FAST_DASHBOARD_WRITE_ = previousDashboardMode;
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function setupSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheet_(ss, SHEETS.ORDERS, ORDER_HEADERS_NEW);

  ensureSheet_(ss, SHEETS.PURCHASES, [
    '採買ID','採買時間','商品','採買人','採買數量','實際日幣總成本',
    '店家/備註','採買狀態','最後修改人','最後修改時間','支付方式','對應喊單日幣售價'
  ]);

  ensureSheet_(ss, SHEETS.PAYMENTS, [
    '收款ID','時間','訂單ID','顧客','狀態','操作人'
  ]);

  ensureSheet_(ss, SHEETS.ALLOCATIONS, [
    '分配ID','採買ID','訂單ID','顧客','商品','分配數量','最後修改人','最後修改時間'
  ]);

  ensureSheet_(ss, SHEETS.HISTORY, [
    '時間','操作人','類型','對象ID','內容'
  ]);

  ensureSheet_(ss, SHEETS.SETTINGS, [
    '項目','值'
  ]);

  ensureSheet_(ss, SHEETS.DASHBOARD, [
    '項目','數值','備註'
  ]);

  var settingRows = rows_(SHEETS.SETTINGS);
  var exists = settingRows.some(function (x) {
    return String(x.values[0]) === 'JPY_TWD_RATE';
  });

  if (!exists) {
    ss.getSheetByName(SHEETS.SETTINGS).appendRow(['JPY_TWD_RATE', 0.210]);
  }

  ensureLegacyAllocations_();
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
}

function headerRow_(sheetName) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh || sh.getLastColumn() === 0) return [];
  return sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(v){
    return String(v || '').trim();
  });
}

function sameArray_(a,b) {
  if (a.length !== b.length) return false;
  for (var i=0;i<a.length;i++) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}

function migrateOrderSheetIfNeeded_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEETS.ORDERS);
  if (!sh) return;

  migratePurchaseSheetIfNeeded_();

  var headers = headerRow_(SHEETS.ORDERS);
  if (sameArray_(headers, ORDER_HEADERS_NEW)) return;

  var rows = [];
  if (sh.getLastRow() >= 2) {
    rows = sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();
  }

  var migrated = null;

  // V1.5.x -> V1.6：只新增商品照片URL欄，既有資料完全保留。
  if (sameArray_(headers, ORDER_HEADERS_V15)) {
    sh.getRange(1,14).setValue('商品照片URL');
    log_('系統','欄位新增','訂單','V1.6：新增商品照片URL');
    SpreadsheetApp.flush();
    return;
  }

  // V1.4.x -> V1.5：只改欄位名稱，不改任何既有數值。
  // 日幣售價與代購台幣售價是兩個獨立欄位。
  if (sameArray_(headers, ORDER_HEADERS_V14)) {
    sh.getRange(1,1,1,ORDER_HEADERS_NEW.length).setValues([ORDER_HEADERS_NEW]);
    log_('系統','欄位名稱更新','訂單','V1.5：日幣售價與代購台幣售價改為獨立欄位');
    SpreadsheetApp.flush();
    return;
  }

  // V1.3 -> V1.4
  if (sameArray_(headers, ORDER_HEADERS_V13)) {
    var rate = rate_();
    migrated = rows.map(function(r){
      var jpyUnit = Number(r[6]) || 0;
      var qty = Number(r[5]) || 0;
      var twdUnit = Math.round(jpyUnit * rate);
      return [r[0],r[1],r[2],r[3],r[4],qty,jpyUnit,twdUnit,twdUnit*qty,r[8],r[9],r[10],r[11]];
    });
  }

  // V1.2 -> V1.4
  if (sameArray_(headers, ORDER_HEADERS_OLD)) {
    var rate2 = rate_();
    migrated = rows.map(function(r){
      var jpyUnit = Number(r[5]) || 0;
      var qty = Number(r[4]) || 0;
      var twdUnit = Math.round(jpyUnit * rate2);
      return [r[0],r[1],r[9],r[2],r[3],qty,jpyUnit,twdUnit,twdUnit*qty,r[7],r[8],r[10],r[11]];
    });
  }

  if (migrated !== null) {
    sh.clearContents();
    sh.getRange(1,1,1,ORDER_HEADERS_NEW.length).setValues([ORDER_HEADERS_NEW]);
    if (migrated.length) sh.getRange(2,1,migrated.length,ORDER_HEADERS_NEW.length).setValues(migrated);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,ORDER_HEADERS_NEW.length).setFontWeight('bold');
    log_('系統','欄位遷移','訂單','V1.4：新增客人台幣售價與台幣訂單總額');
    SpreadsheetApp.flush();
  }

  // 採買紀錄 V1.3 -> V1.4：在「店家/備註」後插入採買狀態
  var psh = ss.getSheetByName(SHEETS.PURCHASES);
  if (psh) {
    var ph = headerRow_(SHEETS.PURCHASES);
    if (ph.length === 9 && ph[6] === '店家/備註' && ph[7] === '最後修改人') {
      psh.insertColumnAfter(7);
      psh.getRange(1,8).setValue('採買狀態');
      if (psh.getLastRow() >= 2) psh.getRange(2,8,psh.getLastRow()-1,1).setValue('已購');
    }
    ph = headerRow_(SHEETS.PURCHASES);
    if (ph.length === 10 && ph[9] === '最後修改時間') {
      psh.getRange(1,11).setValue('支付方式');
      if (psh.getLastRow() >= 2) psh.getRange(2,11,psh.getLastRow()-1,1).setValue('現金');
    }
  }
}

function rows_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];

  var vals = sh.getRange(
    2, 1,
    sh.getLastRow() - 1,
    sh.getLastColumn()
  ).getValues();

  return vals.map(function (r, i) {
    return { row: i + 2, values: r };
  });
}

function dateText_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd HH:mm:ss'
    );
  }

  return String(value);
}

function getData_() {
  var orders = rows_(SHEETS.ORDERS)
    .filter(function (x) { return x.values[0] !== ''; })
    .map(function (x) {
      return {
        id:String(x.values[0]||''), created:dateText_(x.values[1]),
        creator:String(x.values[2]||''), customer:String(x.values[3]||''),
        product:String(x.values[4]||''), qty:Number(x.values[5])||0,
        price:Number(x.values[6])||0,
        twdPrice:Number(x.values[7])||0,
        twdTotal:Number(x.values[8])||0,
        total:(Number(x.values[6])||0)*(Number(x.values[5])||0),
        paid:String(x.values[9])==='已收款',
        cancelled:String(x.values[10])==='已取消',
        last:String(x.values[11]||''), modified:dateText_(x.values[12]),
        photoUrl:String(x.values[13]||'')
      };
    });

  var purchases = rows_(SHEETS.PURCHASES)
    .filter(function (x) { return x.values[0] !== ''; })
    .map(function (x) {
      return {
        id:String(x.values[0]||''), time:dateText_(x.values[1]),
        product:String(x.values[2]||''), buyer:String(x.values[3]||''),
        qty:Number(x.values[4])||0, cost:Number(x.values[5])||0,
        note:String(x.values[6]||''), status:String(x.values[7]||'已購'),
        last:String(x.values[8]||''), modified:dateText_(x.values[9]),
        paymentMethod:String(x.values[10]||'現金'), orderPrice:Number(x.values[11])||0
      };
    });

  var allocations = rows_(SHEETS.ALLOCATIONS)
    .filter(function (x) { return x.values[0] !== ''; })
    .map(function (x) {
      return {
        id:String(x.values[0]||''), purchaseId:String(x.values[1]||''),
        orderId:String(x.values[2]||''), customer:String(x.values[3]||''),
        product:String(x.values[4]||''), qty:Number(x.values[5])||0,
        last:String(x.values[6]||''), modified:dateText_(x.values[7])
      };
    });

  var allocationsByPurchase = {};
  allocations.forEach(function(a){
    if (!allocationsByPurchase[a.purchaseId]) allocationsByPurchase[a.purchaseId] = [];
    allocationsByPurchase[a.purchaseId].push(a);
  });
  purchases.forEach(function(p){
    p.allocations = allocationsByPurchase[p.id] || [];
    p.allocatedQty = p.allocations.reduce(function(sum,a){return sum+(Number(a.qty)||0);},0);
  });

  var history = rows_(SHEETS.HISTORY)
    .filter(function(x){return x.values[0]!=='';})
    .map(function(x){return {time:dateText_(x.values[0]),who:String(x.values[1]||''),type:String(x.values[2]||''),target:String(x.values[3]||''),text:String(x.values[4]||'')};})
    .reverse().slice(0,200);

  var activeOrders = orders.filter(function(o){return !o.cancelled;});
  var revenue = activeOrders.reduce(function(s,o){return s+o.twdTotal;},0);

  var activePurchases = purchases.filter(function(p){return p.status!=='缺貨';});
  var costJpy = activePurchases.reduce(function(s,p){return s+p.cost;},0);
  var currentRate = rate_();
  var costTwd = Math.round(costJpy * currentRate);
  var grossProfitTwd = revenue - costTwd;
  var margin = revenue > 0 ? grossProfitTwd / revenue : 0;

  var advances = {};
  activePurchases.forEach(function(p){
    advances[p.buyer] = (advances[p.buyer]||0) + p.cost;
  });

  // 依顧客訂單的採買分配，把實際成本歸到該訂單的建單人。
  // 若有舊資料或超買造成未分配成本，再按同商品有效需求比例補分攤。
  var ownerRevenue = {};
  var ownerAllocatedCostJpy = {};
  var ownerAllocatedCostTwd = {};
  var ownerGrossProfitTwd = {};

  activeOrders.forEach(function(o){
    var owner = String(o.creator || '未指定');
    ownerRevenue[owner] = (ownerRevenue[owner] || 0) + (Number(o.twdTotal) || 0);
  });

  var activeOrderById = {}, productOrdersForFallback = {};
  activeOrders.forEach(function(o){
    activeOrderById[String(o.id)] = o;
    var product=String(o.product||'');
    if(!productOrdersForFallback[product])productOrdersForFallback[product]=[];
    productOrdersForFallback[product].push(o);
  });

  activePurchases.forEach(function(p){
    var qty=Number(p.qty)||0,cost=Number(p.cost)||0,unit=qty>0?cost/qty:0,assignedCost=0;
    purchaseAllocationsForServer_(p).forEach(function(a){
      var order=activeOrderById[String(a.orderId)];
      if(!order)return;
      var part=(Number(a.qty)||0)*unit,owner=String(order.creator||'未指定');
      ownerAllocatedCostJpy[owner]=(ownerAllocatedCostJpy[owner]||0)+part;
      assignedCost+=part;
    });
    var leftover=Math.max(0,cost-assignedCost),fallback=productOrdersForFallback[String(p.product||'')]||[];
    var fallbackQty=fallback.reduce(function(sum,o){return sum+(Number(o.qty)||0);},0);
    if(leftover>0&&fallbackQty>0)fallback.forEach(function(o){
      var owner=String(o.creator||'未指定'),part=leftover*(Number(o.qty)||0)/fallbackQty;
      ownerAllocatedCostJpy[owner]=(ownerAllocatedCostJpy[owner]||0)+part;
    });
  });

  Object.keys(ownerRevenue).forEach(function(owner){
    var allocatedJpy = Number(ownerAllocatedCostJpy[owner]) || 0;
    var allocatedTwd = Math.round(allocatedJpy * currentRate);
    ownerAllocatedCostTwd[owner] = allocatedTwd;
    ownerGrossProfitTwd[owner] =
      (Number(ownerRevenue[owner]) || 0) - allocatedTwd;
  });

  var summary = {
    revenueTwd: revenue,
    costJpy: costJpy,
    costTwd: costTwd,
    grossProfitTwd: grossProfitTwd,
    margin: margin,
    advances: advances,
    ownerRevenue: ownerRevenue,
    ownerAllocatedCostJpy: ownerAllocatedCostJpy,
    ownerAllocatedCostTwd: ownerAllocatedCostTwd,
    ownerGrossProfitTwd: ownerGrossProfitTwd
  };

  // V1.6.5 原本流程仍會更新工作表儀表板。
  // GitHub PWA 走 apiFast_() 時略過此耗時寫入，但回傳給 APP 的 summary 完全保留。
  if (!V3_FAST_MODE_) {
    refreshDashboard_(orders, purchases, summary, currentRate);
  } else if (V3_FAST_DASHBOARD_WRITE_) {
    refreshDashboardFast_(orders, purchases, summary, currentRate);
  }

  return {
    ok:true, version:APP_VERSION, orders:orders, purchases:purchases, allocations:allocations, history:history,
    rate:currentRate, syncedAt:dateText_(new Date()),
    summary:summary
  };
}

function refreshDashboard_(orders, purchases, summary, currentRate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEETS.DASHBOARD);
  if (!sh) {
    sh = ss.insertSheet(SHEETS.DASHBOARD);
  }

  var activeOrders = orders.filter(function(o){ return !o.cancelled; });
  var paidOrders = activeOrders.filter(function(o){ return o.paid; });
  var unpaidOrders = activeOrders.filter(function(o){ return !o.paid; });

  var paidRevenue = paidOrders.reduce(function(s,o){ return s + (Number(o.twdTotal)||0); },0);
  var unpaidRevenue = unpaidOrders.reduce(function(s,o){ return s + (Number(o.twdTotal)||0); },0);

  var rows = [
    ['📊 即時損益總覽','',''],
    ['最後更新時間', new Date(), 'APP 每次同步時自動更新'],
    ['目前匯率', currentRate, '1 JPY = TWD'],
    ['有效訂單數', activeOrders.length, '已取消訂單不計'],
    ['已收款訂單數', paidOrders.length, ''],
    ['未收款訂單數', unpaidOrders.length, ''],
    ['預計收入 TWD', summary.revenueTwd, '依代購台幣售價計算'],
    ['已收款金額 TWD', paidRevenue, ''],
    ['未收款金額 TWD', unpaidRevenue, ''],
    ['採買成本 JPY', summary.costJpy, '缺貨紀錄不計'],
    ['採買成本 TWD', summary.costTwd, '依目前匯率換算'],
    ['總毛利 TWD', summary.grossProfitTwd, '預計收入 - 採買成本TWD'],
    ['總毛利率', summary.margin, '總毛利 ÷ 預計收入'],
    ['','',''],
    ['👥 個人毛利（依建單人歸屬）','','']
  ];

  var owners = {};
  Object.keys(summary.ownerRevenue || {}).forEach(function(name){ owners[name] = true; });
  Object.keys(summary.ownerGrossProfitTwd || {}).forEach(function(name){ owners[name] = true; });

  Object.keys(owners).sort().forEach(function(name){
    rows.push([name + '｜營收 TWD', Number(summary.ownerRevenue[name]) || 0, '依建單人歸屬']);
    rows.push([name + '｜分攤成本 JPY', Number(summary.ownerAllocatedCostJpy[name]) || 0, '依同商品訂單數量比例分攤']);
    rows.push([name + '｜分攤成本 TWD', Number(summary.ownerAllocatedCostTwd[name]) || 0, '依目前匯率換算']);
    rows.push([name + '｜毛利 TWD', Number(summary.ownerGrossProfitTwd[name]) || 0, '個人營收 - 個人分攤成本']);
  });

  rows.push(['','','']);
  rows.push(['💳 採買人墊款','','']);

  Object.keys(summary.advances || {}).sort().forEach(function(name){
    var jpy = Number(summary.advances[name]) || 0;
    rows.push([name + ' 墊款 JPY', jpy, '約 NT$' + Math.round(jpy * currentRate).toLocaleString()]);
  });

  sh.clearContents();
  sh.getRange(1,1,rows.length,3).setValues(rows);

  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 180);
  sh.setColumnWidth(2, 150);
  sh.setColumnWidth(3, 240);

  sh.getRange(1,1,1,3)
    .merge()
    .setValue('📊 即時損益總覽')
    .setFontWeight('bold')
    .setFontSize(16)
    .setHorizontalAlignment('center');

  sh.getRange(2,1,rows.length-1,1).setFontWeight('bold');

  // Number formats
  sh.getRange(2,2).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sh.getRange(3,2).setNumberFormat('0.000');

  // 數值欄預設千分位；總毛利率單獨用百分比。
  if (rows.length >= 7) {
    sh.getRange(7,2,rows.length-6,1).setNumberFormat('#,##0');
  }
  sh.getRange(13,2).setNumberFormat('0.0%');
}

/**
 * V3.2 PWA 寫入後的精簡儀表板更新。
 * 只改內容與必要的數字格式，不清空整張工作表、不重設欄寬與標題樣式。
 */
function refreshDashboardFast_(orders, purchases, summary, currentRate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEETS.DASHBOARD);

  // 若工作表尚未完成初始化，先沿用原本完整流程建立一次。
  if (!sh || sh.getLastRow() < 2) {
    refreshDashboard_(orders, purchases, summary, currentRate);
    return;
  }

  var activeOrders = orders.filter(function(o){ return !o.cancelled; });
  var paidOrders = activeOrders.filter(function(o){ return o.paid; });
  var unpaidOrders = activeOrders.filter(function(o){ return !o.paid; });
  var paidRevenue = paidOrders.reduce(function(s,o){ return s + (Number(o.twdTotal)||0); },0);
  var unpaidRevenue = unpaidOrders.reduce(function(s,o){ return s + (Number(o.twdTotal)||0); },0);

  var rows = [
    ['最後更新時間', new Date(), '手機寫入後自動更新'],
    ['目前匯率', currentRate, '1 JPY = TWD'],
    ['有效訂單數', activeOrders.length, '已取消訂單不計'],
    ['已收款訂單數', paidOrders.length, ''],
    ['未收款訂單數', unpaidOrders.length, ''],
    ['預計收入 TWD', summary.revenueTwd, '依代購台幣售價計算'],
    ['已收款金額 TWD', paidRevenue, ''],
    ['未收款金額 TWD', unpaidRevenue, ''],
    ['採買成本 JPY', summary.costJpy, '缺貨紀錄不計'],
    ['採買成本 TWD', summary.costTwd, '依目前匯率換算'],
    ['總毛利 TWD', summary.grossProfitTwd, '預計收入 - 採買成本TWD'],
    ['總毛利率', summary.margin, '總毛利 ÷ 預計收入'],
    ['','',''],
    ['👥 個人毛利（依建單人歸屬）','','']
  ];

  var owners = {};
  Object.keys(summary.ownerRevenue || {}).forEach(function(name){ owners[name] = true; });
  Object.keys(summary.ownerGrossProfitTwd || {}).forEach(function(name){ owners[name] = true; });

  Object.keys(owners).sort().forEach(function(name){
    rows.push([name + '｜營收 TWD', Number(summary.ownerRevenue[name]) || 0, '依建單人歸屬']);
    rows.push([name + '｜分攤成本 JPY', Number(summary.ownerAllocatedCostJpy[name]) || 0, '依同商品訂單數量比例分攤']);
    rows.push([name + '｜分攤成本 TWD', Number(summary.ownerAllocatedCostTwd[name]) || 0, '依目前匯率換算']);
    rows.push([name + '｜毛利 TWD', Number(summary.ownerGrossProfitTwd[name]) || 0, '個人營收 - 個人分攤成本']);
  });

  rows.push(['','','']);
  rows.push(['💳 採買人墊款','','']);

  Object.keys(summary.advances || {}).sort().forEach(function(name){
    var jpy = Number(summary.advances[name]) || 0;
    rows.push([name + ' 墊款 JPY', jpy, '約 NT$' + Math.round(jpy * currentRate).toLocaleString()]);
  });

  var previousDataRows = Math.max(0, sh.getLastRow() - 1);
  var writeRows = Math.max(previousDataRows, rows.length);
  while (rows.length < writeRows) rows.push(['','','']);

  // A1:C1 是合併標題，因此從第 2 列開始一次寫入全部資料。
  if (writeRows > 0) {
    sh.getRange(2,1,writeRows,3).setValues(rows);
  }

  sh.getRange(2,2).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sh.getRange(3,2).setNumberFormat('0.000');
  sh.getRange(13,2).setNumberFormat('0.0%');
}

function nextId_(sheetName, prefix) {
  var ids = rows_(sheetName).map(function (x) {
    return String(x.values[0] || '');
  });

  var maxNumber = 0;

  ids.forEach(function (id) {
    var m = id.match(new RegExp('^' + prefix + '(\\d+)$'));
    if (m) {
      var n = Number(m[1]);
      if (!isNaN(n)) maxNumber = Math.max(maxNumber, n);
    }
  });

  return prefix + Utilities.formatString('%04d', maxNumber + 1);
}

function rate_() {
  var item = rows_(SHEETS.SETTINGS).find(function (x) {
    return String(x.values[0]) === 'JPY_TWD_RATE';
  });

  if (!item) return 0.210;

  var r = Number(item.values[1]);
  return r > 0 ? r : 0.210;
}

function photoFolder_() {
  var folderName = '沖繩代購_商品照片';
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();

  var folder = DriveApp.createFolder(folderName);
  try {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}
  return folder;
}

function safeFileName_(text) {
  return String(text || '商品')
    .replace(/[\\\/:*?"<>|#%{}~&]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 60);
}

function savePhoto_(dataUrl, product, orderId) {
  if (!dataUrl) return '';

  var m = String(dataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error('照片格式不支援，請使用 JPG、PNG 或 WebP');

  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 6 * 1024 * 1024) {
    throw new Error('照片太大，請重新拍攝或選擇較小的照片');
  }

  var mimeType = m[1];
  var ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var fileName = safeFileName_(orderId + '_' + product + '_' + stamp) + '.' + ext;
  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var file = photoFolder_().createFile(blob);

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}

  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
}

function allocationSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ALLOCATIONS);
}

function purchaseAllocationsForServer_(purchase) {
  var purchaseId=String(purchase&&purchase.id||'');
  return rows_(SHEETS.ALLOCATIONS)
    .filter(function(item){return String(item.values[1]||'')===purchaseId;})
    .map(function(item){return {orderId:String(item.values[2]||''),qty:Number(item.values[5])||0};});
}

function deleteAllocationsWhere_(predicate) {
  var sh = allocationSheet_();
  var list = rows_(SHEETS.ALLOCATIONS).filter(predicate);
  list.sort(function(a,b){return b.row-a.row;}).forEach(function(item){sh.deleteRow(item.row);});
}

function appendAllocation_(purchaseId, order, product, qty, user) {
  if (!qty || qty <= 0) return;
  allocationSheet_().appendRow([
    nextId_(SHEETS.ALLOCATIONS,'A'), purchaseId, String(order.values[0]||''),
    String(order.values[3]||''), product, qty, user || '系統', new Date()
  ]);
}

function rebuildProductAllocations_(product, user) {
  product = String(product||'').trim();
  if (!product) return;
  deleteAllocationsWhere_(function(item){return String(item.values[4]||'')===product;});
  var purchaseRows = rows_(SHEETS.PURCHASES).filter(function(item){
    return String(item.values[2]||'')===product && String(item.values[7]||'已購')!=='缺貨' && (Number(item.values[4])||0)>0;
  });
  var used = {};
  purchaseRows.forEach(function(purchase){
    var groupPrice=Number(purchase.values[11])||0;
    var orderRows = rows_(SHEETS.ORDERS).filter(function(item){
      return String(item.values[4]||'')===product && String(item.values[10]||'')!=='已取消' && (Number(item.values[5])||0)>0 && (!groupPrice || Number(item.values[6])===groupPrice);
    });
    var left = Number(purchase.values[4])||0;
    orderRows.forEach(function(order){
      if (left<=0) return;
      var orderId=String(order.values[0]||''),capacity=Number(order.values[5])||0;
      var available=Math.max(0,capacity-(used[orderId]||0));
      var qty=Math.min(left,available);
      if(qty>0){appendAllocation_(String(purchase.values[0]||''),order,product,qty,user);used[orderId]=(used[orderId]||0)+qty;left-=qty;}
    });
  });
}

function ensureLegacyAllocations_() {
  var settings = rows_(SHEETS.SETTINGS);
  var flag = settings.find(function(item){return String(item.values[0]||'')==='PURCHASE_ALLOCATION_SCHEMA';});
  if (flag && String(flag.values[1]||'') === '1') return;
  var products = {};
  rows_(SHEETS.PURCHASES).forEach(function(item){
    var product=String(item.values[2]||'').trim();if(product)products[product]=true;
  });
  Object.keys(products).forEach(function(product){rebuildProductAllocations_(product,'系統');});
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SETTINGS);
  if(flag)sh.getRange(flag.row,2).setValue('1');else sh.appendRow(['PURCHASE_ALLOCATION_SCHEMA','1']);
  if(Object.keys(products).length)log_('系統','建立採買分配','採買分配','既有採買已依喊單順序完成初始分配');
}

function replacePurchaseAllocations_(purchaseId, product, orderPrice, purchaseQty, allocations, user) {
  if (!Array.isArray(allocations)) throw new Error('缺少顧客分配資料');
  var orderRows=rows_(SHEETS.ORDERS),orderMap={};
  orderRows.forEach(function(item){orderMap[String(item.values[0]||'')]=item;});
  var used={};
  rows_(SHEETS.ALLOCATIONS).forEach(function(item){
    if(String(item.values[1]||'')===String(purchaseId))return;
    var orderId=String(item.values[2]||'');used[orderId]=(used[orderId]||0)+(Number(item.values[5])||0);
  });
  var normalized=[],seen={},total=0;
  allocations.forEach(function(a){
    var orderId=String(a&&a.orderId||'').trim(),qty=Number(a&&a.qty);
    if(!orderId||!Number.isInteger(qty)||qty<=0||seen[orderId])throw new Error('顧客分配資料格式不正確');
    var order=orderMap[orderId];
    if(!order||String(order.values[10]||'')==='已取消'||String(order.values[4]||'')!==product||(Number(orderPrice)>0&&Number(order.values[6])!==Number(orderPrice)))throw new Error('分配的訂單已取消、商品或喊單價格不符');
    var available=Math.max(0,(Number(order.values[5])||0)-(used[orderId]||0));
    if(qty>available)throw new Error(String(order.values[3]||'顧客')+' 的分配數量超過尚缺需求');
    normalized.push({order:order,qty:qty});seen[orderId]=true;total+=qty;
  });
  if(total!==Number(purchaseQty))throw new Error('顧客分配總數必須等於採買數量');
  deleteAllocationsWhere_(function(item){return String(item.values[1]||'')===String(purchaseId);});
  normalized.forEach(function(a){appendAllocation_(purchaseId,a.order,product,a.qty,user);});
}

function createOrder_(p) {
  var customer=String(p.customer||'').trim(), product=String(p.product||'').trim();
  var qty=Number(p.qty), jpyPrice=Number(p.price), twdPrice=Number(p.twdPrice);
  var user=String(p.user||'');
  var requestId=String(p.requestId||'').trim(), cache=CacheService.getScriptCache();
  if(requestId&&cache.get('order:'+requestId)) return getData_();
  if(!customer) throw new Error('請輸入顧客名稱');
  if(!product) throw new Error('請輸入商品名稱');
  if(!qty||qty<=0) throw new Error('數量必須大於 0');
  if(isNaN(jpyPrice)||jpyPrice<0) jpyPrice=0;
  if(isNaN(twdPrice)||twdPrice<0) twdPrice=0;

  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ORDERS);
  var id=nextId_(SHEETS.ORDERS,'O'), now=new Date();
  var photoUrl = p.photoDataUrl ? savePhoto_(String(p.photoDataUrl), product, id) : '';
  sh.appendRow([id,now,user,customer,product,qty,jpyPrice,twdPrice,qty*twdPrice,'未收款','有效',user,now,photoUrl]);
  log_(user,'建立訂單',id,customer+'｜'+product+' ×'+qty+'｜NT$'+(qty*twdPrice)+(photoUrl?'｜含商品照片':''));
  if(requestId) cache.put('order:'+requestId,id,21600);
  SpreadsheetApp.flush(); return getData_();
}

function updateOrder_(p) {
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ORDERS);
  var item=rows_(SHEETS.ORDERS).find(function(x){return String(x.values[0])===String(p.id);});
  if(!item) throw new Error('找不到訂單');
  var old=item.values, customer=String(p.customer||'').trim(), product=String(p.product||'').trim();
  var qty=Number(p.qty), jpyPrice=Number(p.price), twdPrice=Number(p.twdPrice), user=String(p.user||''), now=new Date();
  if(!customer||!product) throw new Error('顧客與商品不可空白');
  if(!qty||qty<=0) throw new Error('數量必須大於 0');
  if(p.expectedModified&&dateText_(old[12])!==String(p.expectedModified)) throw new Error('訂單已被另一支手機修改，請按「更新」取得最新資料');
  if(isNaN(jpyPrice)||jpyPrice<0) jpyPrice=0;
  if(isNaN(twdPrice)||twdPrice<0) twdPrice=0;
  if(p.expectedModified&&dateText_(old[12])!==String(p.expectedModified)){
    var same=String(old[3])===customer&&String(old[4])===product&&Number(old[5])===qty&&Number(old[6])===jpyPrice&&Number(old[7])===twdPrice;
    if(!same) throw new Error('訂單已被另一支手機修改，請按「更新」取得最新資料');
    return getData_();
  }
  sh.getRange(item.row,4,1,10).setValues([[customer,product,qty,jpyPrice,twdPrice,qty*twdPrice,old[9],old[10],user,now]]);
  rebuildProductAllocations_(String(old[4]||''),user);
  if(String(old[4]||'')!==product)rebuildProductAllocations_(product,user);
  log_(user,'更正訂單',p.id,customer+'｜'+product+' ×'+qty+'｜NT$'+(qty*twdPrice));
  SpreadsheetApp.flush(); return getData_();
}

function toggleCancel_(p) {
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ORDERS);
  var item=rows_(SHEETS.ORDERS).find(function(x){return String(x.values[0])===String(p.id);});
  if(!item) throw new Error('找不到訂單');
  var cancelled=String(item.values[10])==='已取消', newState=cancelled?'有效':'已取消', user=String(p.user||'');
  sh.getRange(item.row,11).setValue(newState);
  sh.getRange(item.row,12,1,2).setValues([[user,new Date()]]);
  rebuildProductAllocations_(String(item.values[4]||''),user);
  log_(user,cancelled?'恢復訂單':'取消訂單',p.id,newState);
  SpreadsheetApp.flush(); return getData_();
}

function recordPurchase_(p) {
  var product=String(p.product||'').trim(), qty=Number(p.qty), cost=Number(p.cost), user=String(p.user||''), orderPrice=Number(p.orderPrice)||0;
  var status=String(p.status||'已購'), note=String(p.note||'');
  var paymentMethod=validPaymentMethod_(p.paymentMethod);
  var requestId=String(p.requestId||'').trim(), cache=CacheService.getScriptCache();
  if(requestId&&cache.get('purchase:'+requestId)) return getData_();
  if(!product) throw new Error('缺少商品名稱');
  if(status!=='缺貨' && (!qty||qty<=0)) throw new Error('採買數量必須大於 0');
  if(status==='缺貨'){ qty=0; cost=0; }
  if(isNaN(cost)||cost<0) throw new Error('採買成本格式錯誤');
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PURCHASES);
  var id=nextId_(SHEETS.PURCHASES,'B'), now=new Date();
  sh.appendRow([id,now,product,user,qty,cost,note,status,user,now,paymentMethod,orderPrice]);
  try {
    if(status!=='缺貨'&&Array.isArray(p.allocations))replacePurchaseAllocations_(id,product,orderPrice,qty,p.allocations,user);
    else if(status!=='缺貨')rebuildProductAllocations_(product,user);
  } catch(allocationError) {
    var added=rows_(SHEETS.PURCHASES).find(function(x){return String(x.values[0])===id;});
    if(added)sh.deleteRow(added.row);
    throw allocationError;
  }
  log_(user,status==='缺貨'?'標記缺貨':'新增採買',id,product+' ×'+qty+'｜¥'+cost+'｜'+paymentMethod+'｜'+status+'｜'+note+(requestId?'｜請求 '+requestId:''));
  if(requestId) cache.put('purchase:'+requestId,id,21600);
  SpreadsheetApp.flush(); return getData_();
}

function updatePurchase_(p) {
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PURCHASES);
  var item=rows_(SHEETS.PURCHASES).find(function(x){return String(x.values[0])===String(p.id);});
  if(!item) throw new Error('找不到採買紀錄');
  var buyer=String(p.buyer||'').trim(), qty=Number(p.qty), cost=Number(p.cost), user=String(p.user||''), now=new Date();
  var status=String(p.status||item.values[7]||'已購');
  var paymentMethod=validPaymentMethod_(p.paymentMethod||item.values[10]||'現金');
  if(!buyer) throw new Error('採買人不可空白');
  if(status==='缺貨'){qty=0;cost=0;}
  else if(!qty||qty<=0) throw new Error('採買數量必須大於 0');
  if(p.expectedModified&&dateText_(item.values[9])!==String(p.expectedModified)){
    var same=String(item.values[3])===buyer&&Number(item.values[4])===qty&&Number(item.values[5])===cost&&String(item.values[6]||'')===String(p.note||'')&&String(item.values[7]||'已購')===status&&String(item.values[10]||'現金')===paymentMethod;
    if(!same) throw new Error('採買紀錄已被另一支手機修改，請按「更新」取得最新資料');
    return getData_();
  }
  var orderPrice=Number(p.orderPrice)||Number(item.values[11])||0;
  if(status!=='缺貨'&&Array.isArray(p.allocations))replacePurchaseAllocations_(String(p.id),String(item.values[2]||''),orderPrice,qty,p.allocations,user);
  else if(status!=='缺貨')rebuildProductAllocations_(String(item.values[2]||''),user);
  else deleteAllocationsWhere_(function(a){return String(a.values[1]||'')===String(p.id);});
  sh.getRange(item.row,3,1,10).setValues([[item.values[2],buyer,qty,cost,String(p.note||''),status,user,now,paymentMethod,orderPrice]]);
  log_(user,'更正採買',p.id,buyer+' '+qty+'件 ¥'+cost+'｜'+paymentMethod+'｜'+status);
  SpreadsheetApp.flush(); return getData_();
}

function migratePurchaseSheetIfNeeded_() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var psh=ss.getSheetByName(SHEETS.PURCHASES);
  if(!psh) return;
  var ph=headerRow_(SHEETS.PURCHASES);
  if(ph.length===9&&ph[6]==='店家/備註'&&ph[7]==='最後修改人') {
    psh.insertColumnAfter(7);
    psh.getRange(1,8).setValue('採買狀態');
    if(psh.getLastRow()>=2) psh.getRange(2,8,psh.getLastRow()-1,1).setValue('已購');
    ph=headerRow_(SHEETS.PURCHASES);
  }
  if(ph.length===10&&ph[9]==='最後修改時間') {
    psh.getRange(1,11).setValue('支付方式');
    if(psh.getLastRow()>=2) psh.getRange(2,11,psh.getLastRow()-1,1).setValue('現金');
  }
  ph=headerRow_(SHEETS.PURCHASES);
  if(ph.length===11&&ph[10]==='支付方式') {
    psh.getRange(1,12).setValue('對應喊單日幣售價');
  }
}

function deletePurchase_(p) {
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PURCHASES);
  var requestId=String(p.requestId||'').trim(),cache=CacheService.getScriptCache();
  if(requestId&&cache.get('deletePurchase:'+requestId)) return getData_();
  var item=rows_(SHEETS.PURCHASES).find(function(x){return String(x.values[0])===String(p.id);});
  if(!item) throw new Error('找不到採買紀錄，可能已被刪除');
  if(p.expectedModified&&dateText_(item.values[9])!==String(p.expectedModified)) {
    throw new Error('採買紀錄已被另一支手機修改，請按「更新」取得最新資料');
  }
  var user=String(p.user||''),id=String(item.values[0]||''),product=String(item.values[2]||''),detail=product+' ×'+(Number(item.values[4])||0)+'｜¥'+(Number(item.values[5])||0);
  sh.deleteRow(item.row);
  deleteAllocationsWhere_(function(a){return String(a.values[1]||'')===id;});
  rebuildProductAllocations_(product,user);
  log_(user,'刪除採買',id,detail+(requestId?'｜請求 '+requestId:''));
  if(requestId) cache.put('deletePurchase:'+requestId,id,21600);
  SpreadsheetApp.flush(); return getData_();
}

function validPaymentMethod_(value) {
  var method=String(value||'現金').trim();
  if(method!=='現金'&&method!=='信用卡'&&method!=='全支付') throw new Error('支付方式不正確');
  return method;
}

function togglePayment_(p) {
  var ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ss.getSheetByName(SHEETS.ORDERS);
  var item=rows_(SHEETS.ORDERS).find(function(x){return String(x.values[0])===String(p.id);});
  if(!item) throw new Error('找不到訂單');
  var paid=String(item.values[9])==='已收款', newState=paid?'未收款':'已收款', user=String(p.user||'');
  sh.getRange(item.row,10).setValue(newState);
  sh.getRange(item.row,12,1,2).setValues([[user,new Date()]]);
  ss.getSheetByName(SHEETS.PAYMENTS).appendRow([nextId_(SHEETS.PAYMENTS,'P'),new Date(),p.id,item.values[3],newState,user]);
  log_(user,'收款狀態',p.id,newState);
  SpreadsheetApp.flush(); return getData_();
}

function setOrderCancelled_(p) {
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ORDERS);
  var item=rows_(SHEETS.ORDERS).find(function(x){return String(x.values[0])===String(p.id);});
  if(!item) throw new Error('找不到訂單');
  if(typeof p.cancelled!=='boolean') throw new Error('訂單狀態格式不正確');
  var current=String(item.values[10])==='已取消', desired=p.cancelled===true;
  if(current===desired) return getData_();
  if(typeof p.expectedCancelled==='boolean'&&current!==p.expectedCancelled){
    throw new Error('訂單狀態已被另一支手機更新，請按「更新」取得最新資料');
  }
  var state=desired?'已取消':'有效',user=String(p.user||''),now=new Date();
  sh.getRange(item.row,11,1,3).setValues([[state,user,now]]);
  rebuildProductAllocations_(String(item.values[4]||''),user);
  log_(user,desired?'取消訂單':'恢復訂單',p.id,state+'｜請求 '+String(p.requestId||''));
  SpreadsheetApp.flush();return getData_();
}

/**
 * V3.3 安全快速收款。
 * 明確指定目標狀態，不使用反向切換，因此同一請求重送也不會把狀態切回去。
 * 僅回傳前端需要的確認資料，避免每次收款都重新下載完整訂單。
 */
function setPayment_(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEETS.ORDERS);
  var orderRows = rows_(SHEETS.ORDERS);
  var item = orderRows.find(function(x){ return String(x.values[0]) === String(p.id); });

  if (!item) throw new Error('找不到訂單');
  if (typeof p.paid !== 'boolean') throw new Error('收款狀態格式不正確');

  var currentPaid = String(item.values[9]) === '已收款';
  var desiredPaid = p.paid === true;
  var requestId = String(p.requestId || '').trim();
  var user = String(p.user || '');
  var now = new Date();

  // 同一目標狀態重送時直接確認成功，不重複新增收款與異動紀錄。
  if (currentPaid === desiredPaid) {
    return {
      ok: true,
      version: APP_VERSION,
      id: String(p.id),
      paid: desiredPaid,
      state: desiredPaid ? '已收款' : '未收款',
      requestId: requestId,
      alreadyApplied: true,
      syncedAt: dateText_(now)
    };
  }

  // 若另一支手機已先改變狀態，不用舊畫面覆蓋新資料。
  if (typeof p.expectedPaid === 'boolean' && currentPaid !== p.expectedPaid) {
    throw new Error('收款狀態已被另一支手機更新，請按「更新」取得最新資料');
  }

  var newState = desiredPaid ? '已收款' : '未收款';

  // 一次寫入收款狀態、保留訂單狀態，並更新最後修改人與時間。
  sh.getRange(item.row,10,1,4).setValues([[
    newState,
    item.values[10],
    user,
    now
  ]]);

  ss.getSheetByName(SHEETS.PAYMENTS).appendRow([
    nextId_(SHEETS.PAYMENTS,'P'),
    now,
    p.id,
    item.values[3],
    newState,
    user
  ]);

  log_(user,'收款狀態',p.id,newState + (requestId ? '｜請求 ' + requestId : ''));

  // 更新記憶體中的訂單狀態，用同一批資料快速重算試算表的收款統計。
  item.values[9] = newState;
  item.values[11] = user;
  item.values[12] = now;
  refreshPaymentDashboardFast_(orderRows, now);
  SpreadsheetApp.flush();

  return {
    ok: true,
    version: APP_VERSION,
    id: String(p.id),
    paid: desiredPaid,
    state: newState,
    requestId: requestId,
    alreadyApplied: false,
    syncedAt: dateText_(now)
  };
}

/** 只更新「即時損益」中會受到收款狀態影響的欄位。 */
function refreshPaymentDashboardFast_(orderRows, now) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DASHBOARD);
  if (!sh || sh.getLastRow() < 9) return;

  var active = orderRows.filter(function(item){
    return String(item.values[10]) !== '已取消';
  });
  var paid = active.filter(function(item){
    return String(item.values[9]) === '已收款';
  });
  var unpaid = active.filter(function(item){
    return String(item.values[9]) !== '已收款';
  });
  function revenue(items) {
    return items.reduce(function(sum,item){
      return sum + (Number(item.values[8]) || 0);
    },0);
  }

  sh.getRange(2,2).setValue(now);
  sh.getRange(5,2,5,1).setValues([
    [paid.length],
    [unpaid.length],
    [revenue(active)],
    [revenue(paid)],
    [revenue(unpaid)]
  ]);
}

function setRate_(p) {
  var newRate = Number(p.rate);
  var user = String(p.user || '');

  if (!newRate || newRate <= 0) throw new Error('匯率格式錯誤');

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SETTINGS);
  var item = rows_(SHEETS.SETTINGS).find(function (x) {
    return String(x.values[0]) === 'JPY_TWD_RATE';
  });

  if (item) {
    sh.getRange(item.row, 2).setValue(newRate);
  } else {
    sh.appendRow(['JPY_TWD_RATE', newRate]);
  }

  log_(user, '修改匯率', 'SETTING', '1 JPY = ' + newRate + ' TWD');

  SpreadsheetApp.flush();
  return getData_();
}

function log_(who, type, target, text) {
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEETS.HISTORY)
    .appendRow([
      new Date(),
      who || '',
      type || '',
      target || '',
      text || ''
    ]);
}
