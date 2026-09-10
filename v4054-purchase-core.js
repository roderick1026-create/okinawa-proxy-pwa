/* Okinawa PWA V4.0.5.4 canonical purchase flow.
 * This file is loaded after the legacy bundle and is the only purchase-flow
 * implementation to edit going forward. It deliberately keeps the current UI
 * and all visible fields: cost, note, photo, and allocations.
 */
(function () {
  function purchaseKeyInfo(key) {
    return priceGroupInfo(key);
  }

  function openPurchase(key) {
    var info = purchaseKeyInfo(key);
    var limit = purchaseLimit(key);
    if (limit <= 0) {
      toast('此價格組合已買齊');
      return;
    }
    purchasePhotoDataUrl = '';
    openM(
      '<h3>🛒 記錄採買｜' + esc(info.product) + '</h3>' +
      '<div class="small">喊單日幣售價：' + yen(info.price) + '／件｜採買人：' + esc(user) + '</div>' +
      '<label>數量（最多 ' + limit + ' 件）</label>' +
      '<input id="mq" type="number" min="1" max="' + limit + '" step="1" value="' + limit + '" oninput="resetAllocationFromInput(\'mq\')">' +
      '<label>實際採買單價 ¥／件</label>' +
      '<input id="mcost" type="number" min="0" value="' + info.price + '">' +
      '<label>商品照片（可補上傳）</label>' +
      '<input id="purchasePhotoInput" type="file" accept="image/*" capture="environment" onchange="selectPurchasePhoto(this)">' +
      '<img id="purchasePhotoPreview" class="photoThumb" style="display:none;margin-top:8px" alt="商品照片預覽">' +
      '<label>店家／備註</label><input id="mnote">' +
      '<div id="allocationEditor"></div>' +
      '<div class="small" style="margin-top:8px;color:#52606d">現場只能買部分數量時，先在顧客分配選擇實際買到的件數；儲存時會依已分配數量記錄，剩下的會繼續保留在待採買。</div>' +
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
    var method = '現金';
    var temporaryId = 'TEMP-' + Date.now();
    var photo = purchasePhotoDataUrl;
    var request = payload({
      product: info.product,
      orderPrice: info.price,
      qty: qty,
      cost: cost,
      note: note,
      paymentMethod: method,
      photoDataUrl: photo,
      allocations: allocations,
      requestId: paymentRequestId()
    });
    closeM();
    optimisticAction('recordPurchase', request, function () {
      data.purchases.push({
        id: temporaryId, product: info.product, orderPrice: info.price,
        buyer: user, qty: qty, cost: cost, note: note, paymentMethod: method,
        status: '已購', photoUrl: photo, allocations: allocations
      });
    }, function () {
      data.purchases = data.purchases.filter(function (item) { return item.id !== temporaryId; });
    }, function () {
      toast('採買已同步｜' + qty + ' 件｜總成本 ' + yen(cost));
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
    var before = { buyer: purchase.buyer, qty: purchase.qty, cost: purchase.cost, note: purchase.note, paymentMethod: purchase.paymentMethod, allocations: purchase.allocations };
    var next = { buyer: el('ebu').value, qty: qty, cost: cost, note: el('ebn').value, paymentMethod: method, allocations: allocations };
    closeM();
    optimisticAction('updatePurchase', payload({
      id: id, buyer: next.buyer, qty: qty, cost: cost, note: next.note,
      paymentMethod: method, orderPrice: Number(purchase.orderPrice) || 0,
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
  window.OkinawaPwaV4054 = { version: '4.0.5.7', purchase: { open: openPurchase, save: savePurchase, edit: editPurchase, saveEdit: savePurchaseEdit } };
}());
