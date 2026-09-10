/* Okinawa PWA V4.0.5.4 canonical purchase flow.
 * This file is loaded after the legacy bundle and is the only purchase-flow
 * implementation to edit going forward. It deliberately keeps the current UI
 * and all visible fields: cost, note, photo, and allocations.
 */
(function () {
  var activeDraftPhotoUrl = '';
  function purchaseKeyInfo(key) {
    return priceGroupInfo(key);
  }

  function purchaseDraft(key) {
    return ((data.drafts || []).find(function (item) { return item.key === key; })) || {};
  }

  function openPurchase(key) {
    var info = purchaseKeyInfo(key);
    var limit = purchaseLimit(key);
    if (limit <= 0) {
      toast('此價格組合已買齊');
      return;
    }
    var draft = purchaseDraft(key);
    purchasePhotoDataUrl = '';
    activeDraftPhotoUrl = draft.photoUrl || '';
    openM(
      '<h3>🛒 記錄採買｜' + esc(info.product) + '</h3>' +
      '<div class="small">喊單日幣售價：' + yen(info.price) + '／件｜採買人：' + esc(user) + '</div>' +
      '<label>數量（最多 ' + limit + ' 件）</label>' +
      '<input id="mq" type="number" min="1" max="' + limit + '" step="1" value="' + limit + '" oninput="resetAllocationFromInput(\'mq\')">' +
      '<label>實際採買單價 ¥／件</label>' +
      '<input id="mcost" type="number" min="0" value="' + info.price + '">' +
      '<label>實際購入商品／規格（選填）</label>' +
      '<input id="mactual" value="' + esc(draft.actualProduct || '') + '" placeholder="未填則使用：' + esc(info.product) + '">' +
      '<label>商品照片（從相簿選擇）</label>' +
      '<input id="purchasePhotoInput" type="file" accept="image/*" onchange="selectPurchasePhoto(this)">' +
      '<img id="purchasePhotoPreview" class="photoThumb" style="' + (activeDraftPhotoUrl ? 'display:block' : 'display:none') + ';margin-top:8px" src="' + esc(activeDraftPhotoUrl) + '" alt="商品照片預覽">' +
      '<label>店家／備註</label><input id="mnote" value="' + esc(draft.note || '') + '">' +
      '<div id="allocationEditor"></div>' +
      '<div class="small" style="margin-top:8px;color:#52606d">現場只能買部分數量時，先在顧客分配選擇實際買到的件數；儲存時會依已分配數量記錄，剩下的會繼續保留在待採買。</div>' +
      '<button id="saveDraftBtn" class="btn ghost" style="margin-top:12px" onclick="savePurchaseDraft(\'' + jsq(key) + '\')">💾 儲存商品資訊</button>' +
      '<button class="btn primary" style="margin-top:12px" onclick="saveBuy(\'' + jsq(key) + '\')">已採買</button>'
    );
    beginAllocation(key, 'mq', '', []);
  }

  function savePurchase(key) {
    var info = purchaseKeyInfo(key);
    var qty = Number(el('mq').value);
    var unit = Number(el('mcost').value);
    var limit = purchaseLimit(key);
    var allocations = allocationPayload();
    var allocatedQty = allocationTotal();
    // Store staff often find only part of the requested quantity.  The manual
    // allocation is the clearest expression of what was actually obtained.
    if (allocatedQty > 0 && allocatedQty < qty) {
      qty = allocatedQty;
      el('mq').value = qty;
    }
    var cost = qty * unit;
    if (!Number.isInteger(qty) || qty < 1 || qty > limit || allocationTotal() !== qty || !isFinite(unit) || unit < 0) {
      alert('請確認採買數量、顧客分配與成本');
      return;
    }
    var note = el('mnote').value;
    var actualProduct = String(el('mactual').value || '').trim() || info.product;
    var method = '現金';
    var temporaryId = 'TEMP-' + Date.now();
    var photo = purchasePhotoDataUrl;
    var request = payload({
      product: info.product,
      orderPrice: info.price,
      qty: qty,
      cost: cost,
      note: note,
      actualProduct: actualProduct,
      paymentMethod: method,
      photoDataUrl: photo,
      draftPhotoUrl: photo ? '' : activeDraftPhotoUrl,
      allocations: allocations,
      requestId: paymentRequestId()
    });
    closeM();
    optimisticAction('recordPurchase', request, function () {
      data.purchases.push({
        id: temporaryId, product: info.product, orderPrice: info.price,
        buyer: user, qty: qty, cost: cost, note: note, actualProduct: actualProduct, paymentMethod: method,
        status: '已購', photoUrl: photo, allocations: allocations
      });
    }, function () {
      data.purchases = data.purchases.filter(function (item) { return item.id !== temporaryId; });
    }, function () {
      toast('採買已同步｜' + qty + ' 件｜總成本 ' + yen(cost));
    });
  }

  async function saveDraft(key) {
    var info = purchaseKeyInfo(key);
    var actualProduct = String(el('mactual').value || '').trim();
    var note = String(el('mnote').value || '').trim();
    if (!actualProduct && !note && !purchasePhotoDataUrl && !activeDraftPhotoUrl) {
      alert('請至少填寫實際購入商品／規格、備註或選擇照片');
      return;
    }
    if (apiBusy) { toast('上一個操作還在同步，請稍候'); return; }
    var button = el('saveDraftBtn');
    if (button) { button.disabled = true; button.textContent = '⏳ 儲存中…'; }
    apiBusy = true;
    setSync('⟳ 正在儲存商品資訊…', false);
    showError('');
    try {
      var latest = await fetchApi('savePurchaseDraft', payload({
        key: key, product: info.product, orderPrice: info.price,
        actualProduct: actualProduct, note: note, photoDataUrl: purchasePhotoDataUrl,
        requestId: paymentRequestId()
      }));
      if (!latest || latest.ok !== true) throw new Error((latest && latest.message) || '商品資訊儲存失敗');
      applyData(latest);
      var saved = ((latest && latest.drafts) || []).find(function (item) { return item.key === key; }) || {};
      activeDraftPhotoUrl = saved.photoUrl || activeDraftPhotoUrl;
      purchasePhotoDataUrl = '';
      if (button) { button.textContent = '✅ 已儲存'; button.disabled = false; }
      toast('商品資訊已儲存，尚未標記採買');
    } catch (error) {
      if (button) { button.textContent = '💾 儲存商品資訊'; button.disabled = false; }
      failure(error);
    } finally {
      apiBusy = false;
    }
  }

  function showDraftsInBuyList() {
    var drafts = data.drafts || [];
    Array.prototype.forEach.call(document.querySelectorAll('.quickBuyRow,[data-buy-key]'), function (card) {
      var key = card.getAttribute('data-buy-key') || '';
      var text = String(card.textContent || '');
      var draft = drafts.find(function (item) {
        return item.key === key || text.indexOf(priceGroupLabel(item.key)) >= 0;
      });
      if (!draft || card.querySelector('.purchaseDraftInfo')) return;
      var detail = document.createElement('div');
      detail.className = 'purchaseDraftInfo small';
      detail.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0 2px;color:#52606d;font-weight:700';
      var title = draft.actualProduct || draft.product || '已儲存商品資訊';
      detail.innerHTML = (draft.photoUrl ? '<img src="' + esc(draft.photoUrl) + '" style="width:42px;height:42px;object-fit:cover;border-radius:8px;border:1px solid var(--line);cursor:pointer" alt="商品草稿縮圖，點擊查看原圖" title="點擊查看原圖" onclick="showPhoto(\'' + jsq(draft.photoUrl) + '\',\'' + jsq(draft.product || title) + '\')">' : '') + '<span>💾 實際購入商品／規格：' + esc(title) + (draft.note ? '<br><span style="font-weight:400">' + esc(draft.note) + '</span>' : '') + '</span>';
      var row = card.querySelector('.row');
      if (row) row.insertAdjacentElement('afterend', detail);
      else card.insertAdjacentElement('afterend', detail);
    });
  }

  function editPurchase(id) {
    var purchase = data.purchases.find(function (item) { return item.id === id; });
    if (!purchase) return;
    var key = purchaseGroupKey(purchase);
    var limit = purchaseLimit(key, id);
    openM(
      '<h3>✏️ 更正採買 ' + esc(id) + '</h3>' +
      '<label>採買人</label><input id="ebu" value="' + esc(purchase.buyer) + '">' +
      '<label>數量（最多 ' + limit + ' 件）</label>' +
      '<input id="ebq" type="number" min="1" max="' + limit + '" step="1" value="' + esc(purchase.qty) + '" oninput="resetAllocationFromInput(\'ebq\')">' +
      '<label>總成本 ¥</label><input id="ebc" type="number" min="0" value="' + esc(purchase.cost) + '">' +
      '<label>實際購入商品／規格（選填）</label><input id="ebactual" value="' + esc(purchase.actualProduct && purchase.actualProduct !== purchase.product ? purchase.actualProduct : '') + '" placeholder="未填則使用：' + esc(purchase.product) + '">' +
      '<label>備註</label><input id="ebn" value="' + esc(purchase.note || '') + '">' +
      '<div id="allocationEditor"></div>' +
      '<button class="btn primary" style="margin-top:12px" onclick="saveEB(\'' + jsq(id) + '\')">儲存更正</button>'
    );
    beginAllocation(key, 'ebq', id, purchaseAllocations(purchase));
  }

  function savePurchaseEdit(id) {
    var purchase = data.purchases.find(function (item) { return item.id === id; });
    if (!purchase) return;
    var qty = Number(el('ebq').value);
    var cost = Number(el('ebc').value);
    var key = purchaseGroupKey(purchase);
    var allocations = allocationPayload();
    var limit = purchaseLimit(key, id);
    if (!Number.isInteger(qty) || qty < 1 || qty > limit || allocationTotal() !== qty || !isFinite(cost) || cost < 0) {
      alert('請確認採買數量、顧客分配與成本');
      return;
    }
    var method = purchase.paymentMethod || '現金';
    var actualProduct = String(el('ebactual').value || '').trim() || purchase.product;
    var before = { buyer: purchase.buyer, qty: purchase.qty, cost: purchase.cost, note: purchase.note, actualProduct: purchase.actualProduct, paymentMethod: purchase.paymentMethod, allocations: purchase.allocations };
    var next = { buyer: el('ebu').value, qty: qty, cost: cost, note: el('ebn').value, actualProduct: actualProduct, paymentMethod: method, allocations: allocations };
    closeM();
    optimisticAction('updatePurchase', payload({
      id: id, buyer: next.buyer, qty: qty, cost: cost, note: next.note,
      paymentMethod: method, orderPrice: Number(purchase.orderPrice) || 0,
      actualProduct: actualProduct,
      allocations: allocations, expectedModified: purchase.modified || '', requestId: paymentRequestId()
    }), function () {
      Object.assign(purchase, next);
    }, function () {
      Object.assign(purchase, before);
    }, function () {
      toast('採買與顧客分配已更正');
    });
  }

  // One canonical set of global handlers. The older inline implementations
  // remain only as compatibility code until the next full source split.
  window.buy = openPurchase;
  window.saveBuy = savePurchase;
  window.editBuy = editPurchase;
  window.saveEB = savePurchaseEdit;
  window.savePurchaseDraft = saveDraft;
  WRITE_ACTIONS.savePurchaseDraft = 1;
  var renderBuyWithDrafts = renderBuy;
  renderBuy = function () { renderBuyWithDrafts(); showDraftsInBuyList(); };
  // 收款頁依喊單人分開檢視；篩選後的合計與批次收款只處理該喊單人的訂單。
  var paymentOwnerFilter = '';
  function paymentOwnerOrders() {
    return data.orders.filter(function (order) {
      return !order.cancelled && (!paymentOwnerFilter || order.creator === paymentOwnerFilter);
    });
  }
  function ensurePaymentOwnerFilters() {
    if (el('payOwnerFilters')) return;
    el('payCount').insertAdjacentHTML('beforebegin',
      '<div class="actions" id="payOwnerFilters" style="margin-top:10px">' +
      '<button class="mini ghost" onclick="setPaymentOwnerFilter(\'\')">全部喊單</button>' +
      '<button class="mini ghost" onclick="setPaymentOwnerFilter(\'孟欣\')">👩 孟欣</button>' +
      '<button class="mini ghost" onclick="setPaymentOwnerFilter(\'秉謙\')">👨 秉謙</button>' +
      '</div>');
  }
  function setPaymentOwnerFilter(owner) {
    paymentOwnerFilter = owner || '';
    renderPay();
  }
  setCustomerPaymentStatus = async function (customer, paid) {
    if (apiBusy || paymentBatchPending[customer]) { toast('上一個操作還在同步，請稍候'); return; }
    var orders = paymentOwnerOrders().filter(function (order) { return order.customer === customer && !!order.paid !== paid; });
    if (!orders.length) { toast('這位顧客在目前喊單人篩選下沒有可變更的收款項目'); return; }
    if (!confirm((paid ? '確認全部標記為已收款嗎？' : '確認全部改回未收款嗎？') + (paymentOwnerFilter ? '\n只會處理「' + paymentOwnerFilter + '」建立的訂單。' : ''))) return;
    paymentBatchPending[customer] = { done: 0, total: orders.length };
    apiBusy = true;
    var current = null;
    try {
      for (var i = 0; i < orders.length; i++) {
        current = orders[i];
        var result = await fetchApi('setPayment', payload({ id: current.id, paid: paid, expectedPaid: !!current.paid, requestId: paymentRequestId() }));
        if (!result || result.ok !== true) throw new Error('訂單 ' + current.id + ' 未完成');
        current.paid = paid;
        paymentBatchPending[customer].done = i + 1;
        renderPay();
      }
      await refreshLinkedData();
      toast('已完成 ' + orders.length + ' 筆收款更新');
    } catch (error) {
      await refreshLinkedData().catch(function () {});
      failure(error);
    } finally {
      delete paymentBatchPending[customer];
      apiBusy = false;
      renderPay();
    }
  };
  renderPay = function () {
    ensurePaymentOwnerFilters();
    var query = (el('paySearch').value || '').trim().toLowerCase();
    var active = paymentOwnerOrders();
    var unpaid = active.filter(function (order) { return !order.paid; });
    var groups = {};
    active.forEach(function (order) { (groups[order.customer || '未填顧客'] || (groups[order.customer || '未填顧客'] = [])).push(order); });
    Array.prototype.forEach.call(el('payOwnerFilters').querySelectorAll('button'), function (button) {
      var owner = button.textContent.indexOf('孟欣') >= 0 ? '孟欣' : (button.textContent.indexOf('秉謙') >= 0 ? '秉謙' : '');
      button.className = 'mini ' + (owner === paymentOwnerFilter ? 'primary' : 'ghost');
    });
    var list = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'zh-Hant'); }).map(function (customer) {
      var orders = groups[customer], open = orders.filter(function (order) { return !order.paid; });
      var text = (customer + ' ' + orders.map(function (order) { return order.product + ' ' + order.id; }).join(' ')).toLowerCase();
      return { customer: customer, orders: orders, open: open, matches: !query || text.indexOf(query) >= 0 };
    }).filter(function (group) { return group.matches && (payFilter === 'all' || (payFilter === 'unpaid' ? group.open.length : !group.open.length)); });
    var scope = paymentOwnerFilter ? '｜' + paymentOwnerFilter + '喊單' : '｜全部喊單';
    el('payCount').textContent = '未收 ' + unpaid.length + ' 筆｜已收 ' + (active.length - unpaid.length) + ' 筆｜有效訂單 ' + active.length + ' 筆' + scope;
    paintFilter('pf', payFilter);
    el('payList').innerHTML = list.length ? list.map(function (group) {
      var allPaid = !group.open.length, amount = group.open.reduce(function (sum, order) { return sum + orderTwd(order); }, 0), batch = paymentBatchPending[group.customer];
      var header = batch ? '處理中 ' + batch.done + '／' + batch.total : (allPaid ? '✓ 已收款' : '全部標記已收');
      var details = group.orders.map(function (order) {
        return '<div class="small" style="padding:8px 0;border-top:1px solid var(--line)">' + esc(order.product) + ' ×' + esc(order.qty) + '｜NT$' + Math.round(orderTwd(order)).toLocaleString() + ' <button class="mini ' + (order.paid ? 'paid' : 'primary') + '" style="float:right;max-width:76px;padding:5px" ' + (apiBusy ? 'disabled' : '') + ' onclick="setPaymentFast(\'' + jsq(order.id) + '\')">' + (order.paid ? '已收' : '未收') + '</button></div>';
      }).join('');
      return '<div class="card"><div class="row"><div><div class="name">' + esc(group.customer) + '</div><div class="small">未收 ' + group.open.length + ' 筆' + (group.open.length ? '｜NT$' + Math.round(amount).toLocaleString() : '｜已全部收款') + '</div></div><button class="badge ' + (allPaid ? 'paid' : 'unpaid') + '" ' + (apiBusy ? 'disabled' : '') + ' onclick="setCustomerPaymentStatus(\'' + jsq(group.customer) + '\',' + (allPaid ? 'false' : 'true') + ')">' + header + '</button></div><details class="customerPaymentDetail"><summary>查看 ' + group.orders.length + ' 筆訂單明細</summary>' + details + '</details></div>';
    }).join('') : '<div class="empty">目前篩選條件下沒有符合的收款項目。</div>';
    el('payTotal').innerHTML = unpaid.length ? '待收款 ' + unpaid.length + ' 筆｜合計 NT$' + Math.round(unpaid.reduce(function (sum, order) { return sum + orderTwd(order); }, 0)).toLocaleString() + '<small>此總額只包含目前喊單人篩選下的未收款有效訂單</small>' : '✅ 目前篩選條件下沒有待收款項目';
  };
  window.setPaymentOwnerFilter = setPaymentOwnerFilter;
  window.OkinawaPwaV4054 = { version: '4.0.5.14', purchase: { open: openPurchase, save: savePurchase, saveDraft: saveDraft, edit: editPurchase, saveEdit: savePurchaseEdit } };
}());
