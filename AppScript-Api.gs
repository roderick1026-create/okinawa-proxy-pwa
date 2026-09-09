/**
 * =========================================================
 * 沖繩代購 PWA V3.5 刪除採買與支付方式版
 * 外部 API
 * =========================================================
 *
 * 正式開放：
 * 1. ping
 * 2. getData
 * 3. createOrder
 * 4. recordPurchase
 * 5. updateOrder
 * 6. toggleCancel
 * 7. updatePurchase
 * 8. togglePayment
 * 9. setRate
 * 10. setPayment（指定收款狀態，支援安全重送）
 * 11. deletePurchase（直接刪除單筆採買）
 *
 * 核心資料處理仍交由原本 V1.6.5，外部 PWA 改走 apiFast_()。
 * apiFast_() 保留完整最新資料，並在寫入後精簡更新「即時損益」工作表。
 */

var V3_API_VERSION = '3.7';


function doPost(e) {

  try {

    var request = {};

    if (e && e.postData && e.postData.contents) {
      request = JSON.parse(e.postData.contents);
    }


    // =====================================================
    // 驗證 V2 / V3 PWA 請求
    // =====================================================

    if (request.v2 !== true) {

      return v3Json_({
        ok: false,
        message: '不是有效的 PWA API 請求'
      });

    }


    var action = String(request.action || '').trim();
    var payload = request.payload || {};


    // =====================================================
    // 1. 健康檢查
    // =====================================================

    if (action === 'ping') {

      return v3Json_({
        ok: true,
        api: 'Okinawa Proxy API',
        version: V3_API_VERSION,
        message: 'V3.4 安全即時操作 API 連線成功',
        time: new Date().toISOString()
      });

    }


    // =====================================================
    // 2. 取得最新資料
    // =====================================================

    if (action === 'getData') {

      return v3ReturnData_(
        apiFast_('getData', {}),
        'getData'
      );

    }


    // =====================================================
    // 以下皆為寫入功能
    // =====================================================

    var user = String(payload.user || '').trim();

    if (!v3ValidUser_(user)) {

      return v3Json_({
        ok: false,
        message: '操作人不正確，請重新選擇秉謙或孟欣'
      });

    }


    // =====================================================
    // 3. 建立訂單
    // =====================================================

    if (action === 'createOrder') {

      var customer =
        String(payload.customer || '').trim();

      var product =
        String(payload.product || '').trim();

      var qty =
        Number(payload.qty);

      var price =
        Number(payload.price);

      var twdPrice =
        Number(payload.twdPrice);

      var photoDataUrl =
        String(payload.photoDataUrl || '');


      if (!customer) {

        return v3Json_({
          ok: false,
          message: '請輸入顧客'
        });

      }


      if (!product) {

        return v3Json_({
          ok: false,
          message: '請輸入商品'
        });

      }


      if (!v3PositiveNumber_(qty)) {

        return v3Json_({
          ok: false,
          message: '數量必須大於 0'
        });

      }


      if (!v3NonNegativeNumber_(price)) {

        return v3Json_({
          ok: false,
          message: '日幣售價格式不正確'
        });

      }


      if (!v3NonNegativeNumber_(twdPrice)) {

        return v3Json_({
          ok: false,
          message: '台幣售價格式不正確'
        });

      }


      return v3ReturnData_(

        apiFast_('createOrder', {

          user: user,
          customer: customer,
          product: product,
          qty: qty,
          price: price,
          twdPrice: twdPrice,
          photoDataUrl: photoDataUrl,
          requestId: String(payload.requestId || '').trim()

        }),

        'createOrder'

      );

    }


    // =====================================================
    // 4. 記錄採買
    // =====================================================

    if (action === 'recordPurchase') {

      var purchaseProduct =
        String(payload.product || '').trim();

      var purchaseQty =
        Number(payload.qty);

      var purchaseCost =
        Number(payload.cost);

      var purchaseOrderPrice =
        Number(payload.orderPrice || 0);

      var purchaseNote =
        String(payload.note || '').trim();

      var purchasePaymentMethod =
        String(payload.paymentMethod || '現金').trim();

      var purchaseAllocations =
        v3AllocationPayload_(payload.allocations);


      if (!purchaseProduct) {

        return v3Json_({
          ok: false,
          message: '商品名稱不能空白'
        });

      }


      if (!v3PositiveNumber_(purchaseQty)) {

        return v3Json_({
          ok: false,
          message: '採買數量必須大於 0'
        });

      }


      if (!v3NonNegativeNumber_(purchaseCost)) {

        return v3Json_({
          ok: false,
          message: '實際總成本格式不正確'
        });

      }


      return v3ReturnData_(

        apiFast_('recordPurchase', {

          user: user,
          product: purchaseProduct,
          qty: purchaseQty,
          cost: purchaseCost,
          orderPrice: purchaseOrderPrice,
          note: purchaseNote,
          paymentMethod: purchasePaymentMethod,
          allocations: purchaseAllocations,
          requestId: String(payload.requestId || '').trim()

        }),

        'recordPurchase'

      );

    }


    // =====================================================
    // 5. 修改訂單
    // =====================================================

    if (action === 'updateOrder') {

      var orderId =
        String(payload.id || '').trim();

      var updateCustomer =
        String(payload.customer || '').trim();

      var updateProduct =
        String(payload.product || '').trim();

      var updateQty =
        Number(payload.qty);

      var updatePrice =
        Number(payload.price);

      var updateTwdPrice =
        Number(payload.twdPrice);


      if (!orderId) {

        return v3Json_({
          ok: false,
          message: '找不到訂單編號'
        });

      }


      if (!updateCustomer) {

        return v3Json_({
          ok: false,
          message: '顧客不能空白'
        });

      }


      if (!updateProduct) {

        return v3Json_({
          ok: false,
          message: '商品不能空白'
        });

      }


      if (!v3PositiveNumber_(updateQty)) {

        return v3Json_({
          ok: false,
          message: '數量必須大於 0'
        });

      }


      if (!v3NonNegativeNumber_(updatePrice)) {

        return v3Json_({
          ok: false,
          message: '日幣售價格式不正確'
        });

      }


      if (!v3NonNegativeNumber_(updateTwdPrice)) {

        return v3Json_({
          ok: false,
          message: '台幣售價格式不正確'
        });

      }


      return v3ReturnData_(

        apiFast_('updateOrder', {

          user: user,
          id: orderId,
          customer: updateCustomer,
          product: updateProduct,
          qty: updateQty,
          price: updatePrice,
          twdPrice: updateTwdPrice,
          expectedModified: String(payload.expectedModified || ''),
          requestId: String(payload.requestId || '')

        }),

        'updateOrder'

      );

    }


    // =====================================================
    // 6. 取消 / 恢復訂單
    // =====================================================

    if (action === 'setOrderCancelled') {
      var safeCancelId = String(payload.id || '').trim();
      if (!safeCancelId || typeof payload.cancelled !== 'boolean') {
        return v3Json_({ok:false,message:'訂單狀態資料不完整'});
      }
      return v3ReturnData_(apiFast_('setOrderCancelled', {
        user:user,id:safeCancelId,cancelled:payload.cancelled,
        expectedCancelled:payload.expectedCancelled,
        requestId:String(payload.requestId||'')
      }),'setOrderCancelled');
    }

    if (action === 'toggleCancel') {

      var cancelId =
        String(payload.id || '').trim();


      if (!cancelId) {

        return v3Json_({
          ok: false,
          message: '找不到訂單編號'
        });

      }


      return v3ReturnData_(

        apiFast_('toggleCancel', {

          user: user,
          id: cancelId

        }),

        'toggleCancel'

      );

    }


    // =====================================================
    // 7. 更正採買
    // =====================================================

    if (action === 'updatePurchase') {

      var purchaseId =
        String(payload.id || '').trim();

      var buyer =
        String(payload.buyer || '').trim();

      var editQty =
        Number(payload.qty);

      var editCost =
        Number(payload.cost);

      var editOrderPrice =
        Number(payload.orderPrice || 0);

      var editNote =
        String(payload.note || '').trim();

      var editPaymentMethod =
        String(payload.paymentMethod || '現金').trim();

      var editAllocations =
        v3AllocationPayload_(payload.allocations);


      if (!purchaseId) {

        return v3Json_({
          ok: false,
          message: '找不到採買紀錄'
        });

      }


      if (!v3ValidUser_(buyer)) {

        return v3Json_({
          ok: false,
          message: '採買人必須是秉謙或孟欣'
        });

      }


      if (!v3PositiveNumber_(editQty)) {

        return v3Json_({
          ok: false,
          message: '採買數量必須大於 0'
        });

      }


      if (!v3NonNegativeNumber_(editCost)) {

        return v3Json_({
          ok: false,
          message: '採買成本格式不正確'
        });

      }


      return v3ReturnData_(

        apiFast_('updatePurchase', {

          user: user,
          id: purchaseId,
          buyer: buyer,
          qty: editQty,
          cost: editCost,
          orderPrice: editOrderPrice,
          note: editNote,
          paymentMethod: editPaymentMethod,
          allocations: editAllocations,
          expectedModified: String(payload.expectedModified || ''),
          requestId: String(payload.requestId || '')

        }),

        'updatePurchase'

      );

    }


    // =====================================================
    // 8. 刪除採買
    // =====================================================

    if (action === 'deletePurchase') {
      var deletePurchaseId = String(payload.id || '').trim();
      if (!deletePurchaseId) {
        return v3Json_({ok:false,message:'找不到採買紀錄'});
      }
      return v3ReturnData_(
        apiFast_('deletePurchase', {
          user:user,
          id:deletePurchaseId,
          expectedModified:String(payload.expectedModified || ''),
          requestId:String(payload.requestId || '').trim()
        }),
        'deletePurchase'
      );
    }


    // =====================================================
    // 9. 收款狀態切換
    // =====================================================

    if (action === 'setPayment') {

      var safePaymentId =
        String(payload.id || '').trim();

      if (!safePaymentId) {
        return v3Json_({
          ok: false,
          message: '找不到訂單編號'
        });
      }

      if (typeof payload.paid !== 'boolean') {
        return v3Json_({
          ok: false,
          message: '收款狀態格式不正確'
        });
      }

      return v3ReturnData_(
        apiFast_('setPayment', {
          user: user,
          id: safePaymentId,
          paid: payload.paid,
          expectedPaid: payload.expectedPaid,
          requestId: String(payload.requestId || '').trim()
        }),
        'setPayment'
      );
    }


    // =====================================================
    // 9. 舊版收款狀態切換（保留相容性）
    // =====================================================

    if (action === 'togglePayment') {

      var paymentId =
        String(payload.id || '').trim();


      if (!paymentId) {

        return v3Json_({
          ok: false,
          message: '找不到訂單編號'
        });

      }


      return v3ReturnData_(

        apiFast_('togglePayment', {

          user: user,
          id: paymentId

        }),

        'togglePayment'

      );

    }


    // =====================================================
    // 10. 更新匯率
    // =====================================================

    if (action === 'setRate') {

      var rate =
        Number(payload.rate);


      if (
        !Number.isFinite(rate) ||
        rate <= 0 ||
        rate >= 1
      ) {

        return v3Json_({
          ok: false,
          message: '匯率格式不正確'
        });

      }


      return v3ReturnData_(

        apiFast_('setRate', {

          user: user,
          rate: rate

        }),

        'setRate'

      );

    }


    // =====================================================
    // 未知功能
    // =====================================================

    return v3Json_({

      ok: false,

      message:
        'V3.5 不支援此功能：' + action

    });


  } catch (err) {


    return v3Json_({

      ok: false,

      message: String(
        err && err.message
          ? err.message
          : err
      )

    });


  }

}


/**
 * =========================================================
 * 將 V1.6.5 最新資料回傳給 PWA
 * =========================================================
 */

function v3ReturnData_(result, action) {

  if (!result) {

    return v3Json_({

      ok: false,

      message:
        action + ' 執行後沒有取得最新資料'

    });

  }


  result.v2ApiVersion =
    V3_API_VERSION;

  result.v3ApiVersion =
    V3_API_VERSION;

  result.v2Action =
    action;

  result.v3Action =
    action;


  return v3Json_(result);

}


/**
 * =========================================================
 * 允許的操作人
 * =========================================================
 */

function v3ValidUser_(user) {

  return (
    user === '秉謙' ||
    user === '孟欣'
  );

}


/**
 * =========================================================
 * 大於 0
 * =========================================================
 */

function v3PositiveNumber_(value) {

  return (
    Number.isFinite(value) &&
    value > 0
  );

}


/**
 * =========================================================
 * 大於等於 0
 * =========================================================
 */

function v3NonNegativeNumber_(value) {

  return (
    Number.isFinite(value) &&
    value >= 0
  );

}


function v3AllocationPayload_(value) {

  if (value == null) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error('缺少顧客分配資料');
  }

  return value.map(function(item) {
    return {
      orderId: String(item && item.orderId || '').trim(),
      qty: Number(item && item.qty)
    };
  });

}


/**
 * =========================================================
 * 統一輸出 JSON
 * =========================================================
 */

function v3Json_(data) {

  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );

}
