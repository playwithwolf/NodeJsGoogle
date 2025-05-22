const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// 小米平台提供的 AppSecret（建议线上使用环境变量）
const appSecret = 'OBIqLzJ1R/kljGCPv6mIEQ==';

/**
 * 生成 HMAC-SHA1 签名
 * @param {Object} params - 通知参数对象（应为已 URL 解码）
 * @param {string} secret - 应用密钥
 * @returns {string} - 生成的签名字符串（小写 hex）
 */
function generateSignature(params, secret) {
  const copied = { ...params };
  delete copied.signature;

  const sortedKeys = Object.keys(copied).sort();
  const signStr = sortedKeys.map(key => `${key}=${copied[key]}`).join('&');

  return crypto
    .createHmac('sha1', secret)
    .update(signStr, 'utf8')
    .digest('hex');
}

/**
 * 小米支付回调处理（GET 请求 + 参数 URL 解码）
 */
router.get('/mimoiapcallback', (req, res) => {
  const rawParams = req.query;

  // 对所有参数进行 URL 解码（如 %E9%93%B6%E5%AD%90 => 银子）
  const decodedParams = {};
  for (const key in rawParams) {
    decodedParams[key] = decodeURIComponent(rawParams[key]);
  }

  console.log('收到小米支付通知（已解码）:', decodedParams);

  const receivedSignature = decodedParams.signature;
  const expectedSignature = generateSignature(decodedParams, appSecret);

  if (receivedSignature !== expectedSignature) {
    console.error('签名验证失败');
    return res.status(400).send('Invalid signature');
  }

  // ✅ 签名验证成功，可以处理业务逻辑
  console.log('签名验证通过，订单合法，订单ID:', decodedParams.orderId);

  // TODO: 处理订单，例如根据 cpOrderId 发放商品

  return res.send('success');
});

module.exports = router;
