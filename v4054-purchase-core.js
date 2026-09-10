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
      detail.innerHTML = (draft.photoUrl ? '<img src="' + esc(draft.photoUrl) + '" style="width:42px;height:42px;object-fit:cover;border-radius:8px;border:1px solid var(--line)" alt="商品草稿縮圖">' : '') + '<span>💾 實際：' + esc(title) + (draft.note ? '<br><span style="font-weight:400">' + esc(draft.note) + '</span>' : '') + '</span>';
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
  window.OkinawaPwaV4054 = { version: '4.0.5.12', purchase: { open: openPurchase, save: savePurchase, saveDraft: saveDraft, edit: editPurchase, saveEdit: savePurchaseEdit } };
}());
