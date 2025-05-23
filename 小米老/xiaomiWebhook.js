const express = require('express');
const router = express.Router();

const receivedTokens = new Set();

/**
 * 小米 Webhook 接口（POST）
 * Content-Type: application/json
 */
router.post('/xiaomiwebhook', (req, res) => {
  const { message } = req.body;

  if (!message || !message.data) {
    console.error('❌ 无效通知：缺少 message.data');
    return res.status(400).send('Invalid message');
  }

  try {
    const decodedJson = Buffer.from(message.data, 'base64').toString('utf-8');
    const data = JSON.parse(decodedJson);

    console.log('✅ 收到小米 Webhook 通知:');
    console.log(JSON.stringify(data, null, 2));

    const token = data?.oneTimeProductNotification?.purchaseToken || data?.subscriptionNotification?.purchaseToken;
    if (!token) {
      console.warn('⚠️ 未包含 purchaseToken，忽略此通知');
      return res.send('success');
    }

    if (receivedTokens.has(token)) {
      console.log(`⚠️ 重复通知，已忽略 token: ${token}`);
      return res.send('success');
    }

    // 记录已处理的 token（模拟幂等，正式环境请用数据库或 Redis）
    receivedTokens.add(token);

    // 区分处理通知类型
    if (data.oneTimeProductNotification) {
      const { notificationType, sku } = data.oneTimeProductNotification;
      console.log(`🛒 一次性商品通知 - SKU: ${sku}, 类型: ${notificationType}`);
      // TODO: 发放商品
    }

    if (data.subscriptionNotification) {
      const { notificationType, subscriptionId } = data.subscriptionNotification;
      console.log(`📅 订阅通知 - ID: ${subscriptionId}, 类型: ${notificationType}`);
      // TODO: 订阅续费/取消处理
    }

    return res.send('success');
  } catch (err) {
    console.error('❌ Webhook 解析异常:', err.message);
    return res.status(500).send('Webhook Error');
  }
});

module.exports = router;
