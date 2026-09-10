/* Okinawa PWA V4.0.5.6 sync recovery.
 * Keeps the last verified data visible offline and retries automatically when
 * a phone regains its connection.  This file is deliberately loaded last.
 */
(function () {
  var CACHE_KEY = 'okinawa_proxy_last_verified_data_v1';
  var retryTimer = null;
  var retryCount = 0;
  var restoredCache = false;
  var originalApplyData = applyData;

  function saveVerifiedData(response) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: response })); } catch (e) {}
  }
  applyData = function (response) { originalApplyData(response); restoredCache = false; retryCount = 0; saveVerifiedData(response); };

  function showOfflineState() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    setSync(restoredCache ? '☁ 離線中｜顯示上次同步資料' : '☁ 離線中｜等待連線', true);
    showError('');
  }
  function restoreLastVerifiedData() {
    try {
      var saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!saved || !saved.data || saved.data.ok !== true) return false;
      originalApplyData(saved.data); restoredCache = true;
      setSync('☁ 顯示上次同步資料｜等待連線', true); showError(''); return true;
    } catch (e) { return false; }
  }
  function nextDelay() { var delays = [800, 1800, 4000, 8000, 15000]; return delays[Math.min(retryCount, delays.length - 1)]; }
  function queueRecovery(delay) {
    if (retryTimer) clearTimeout(retryTimer);
    if (navigator.onLine === false) { showOfflineState(); return; }
    retryTimer = setTimeout(recoverNow, Math.max(0, Number(delay) || 0));
  }
  function recoverNow() {
    retryTimer = null;
    if (navigator.onLine === false) { showOfflineState(); return; }
    if (apiBusy) { queueRecovery(800); return; }
    setSync('⟳ 網路已恢復，正在同步…', false);
    fetchApi('getData', {}).then(function (response) {
      if (!response || response.ok !== true) throw new Error((response && response.message) || 'API 執行失敗');
      applyData(response); toast('已自動恢復同步');
    }).catch(function () {
      retryCount += 1; setSync('⚠️ 連線恢復中｜將自動重試', true); showError(''); queueRecovery(nextDelay());
    });
  }
  loadData = function (showToast) {
    if (apiBusy) { if (showToast) toast('正在同步目前操作'); return; }
    if (navigator.onLine === false) { showOfflineState(); return; }
    setSync('⟳ 同步中…', false); showError('');
    fetchApi('getData', {}).then(function (response) {
      if (!response || response.ok !== true) throw new Error((response && response.message) || 'API 執行失敗');
      applyData(response); if (showToast) toast('已取得最新資料');
    }).catch(function () {
      retryCount += 1; setSync('⚠️ 連線恢復中｜將自動重試', true); showError(''); queueRecovery(nextDelay());
    });
  };
  window.addEventListener('offline', showOfflineState);
  window.addEventListener('online', function () { retryCount = 0; setSync('⟳ 偵測到網路，正在恢復同步…', false); queueRecovery(250); });
  if (!lastSyncAt) restoreLastVerifiedData();
  if (navigator.onLine === false) showOfflineState(); else queueRecovery(1000);
}());
