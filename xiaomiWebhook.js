const express = require('express');
const router = express.Router();
const receivedTokens = new Set();

const { callXiaomiAPI } = require('./xiaomiClient'); // 使用 ESModule 需用 import；CommonJS 用 require + babel 支持或改为 .mjs

router.post('/xiaomiwebhook', async (req, res) => {
  const { message } = req.body;

  if (!message?.data) {
    console.error('❌ 无效通知：缺少 message.data');
    return res.status(400).send('Invalid message');
  }

  try {
    const decodedJson = Buffer.from(message.data, 'base64').toString('utf-8');
    const data = JSON.parse(decodedJson);
    console.log('✅ 收到小米 Webhook 通知:\n', JSON.stringify(data, null, 2));

    const token = data?.oneTimeProductNotification?.purchaseToken || data?.subscriptionNotification?.purchaseToken;
    const productId = data?.oneTimeProductNotification?.sku;

    if (!token) {
      console.warn('⚠️ 未包含 purchaseToken，忽略');
      return res.send('success');
    }

    if (receivedTokens.has(token)) {
      console.log(`⚠️ 重复通知，已忽略 token: ${token}`);
      return res.send('success');
    }

    receivedTokens.add(token);

    if (!productId) {
      console.warn('⚠️ 缺少 productId');
      return res.send('success');
    }

    // 查询购买信息
    const purchaseInfo = await callXiaomiAPI(
      'GET',
      '/{region}/developer/v1/applications/{packageName}/purchases/products/{productId}/tokens/{token}',
      token,
      productId
    );

    const { purchaseState, acknowledgementState, consumptionState } = purchaseInfo;

    if (purchaseState === 0) {
      if (acknowledgementState === 0) {
        await callXiaomiAPI(
          'POST',
          '/{region}/developer/v1/applications/{packageName}/purchases/products/{productId}/tokens/{token}:acknowledge',
          token,
          productId,
          { developerPayload: '确认来自小米Webhook通知' }
        );
        console.log(`✅ 已确认 token: ${token}`);
      }

      if (consumptionState === 0) {
        await callXiaomiAPI(
          'POST',
          '/{region}/developer/v1/applications/{packageName}/purchases/products/{productId}/tokens/{token}:consume',
          token,
          productId,
          { developerPayload: '消耗来自小米Webhook通知' }
        );
        console.log(`✅ 已消耗 token: ${token}`);
      }
    }

    res.send('success');
  } catch (err) {
    console.error('❌ Webhook 处理异常:', err.message);
    res.status(500).send('Webhook Error');
  }
});

module.exports = router;
