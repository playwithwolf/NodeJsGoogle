const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// 小米平台提供的 AppSecret（建议线上使用环境变量）
const appSecret = 'OBIqLzJ1R/kljGCPv6mIEQ==';

/**
 * 生成 HMAC-SHA1 签名
 * @param {Object} params - 通知参数对象
 * @param {string} secret - 应用密钥
 * @returns {string} - 生成的签名字符串
 */
function generateSignature(params, secret) {
  const copied = { ...params };
  delete copied.signature; // 排除 signature 本身

  const sortedKeys = Object.keys(copied).sort(); // 字典序排序
  const signStr = sortedKeys.map(key => `${key}=${copied[key]}`).join('&');

  return crypto
    .createHmac('sha1', secret)
    .update(signStr, 'utf8')
    .digest('hex');
}

/**
 * 小米支付结果通知回调处理
 */
router.post('/mimoiapcallback', express.urlencoded({ extended: false }), (req, res) => {
  const params = req.body;

  console.log('收到小米支付通知:', params);

  const receivedSignature = params.signature;
  const expectedSignature = generateSignature(params, appSecret);

  if (receivedSignature !== expectedSignature) {
    console.error('签名验证失败');
    return res.status(400).send('Invalid signature');
  }

  // 🧾 TODO: 在这里处理订单发货逻辑（例如记录订单、发放道具等）
  console.log('签名验证通过，订单合法');

  // 返回 "success" 告知小米服务器处理成功
  return res.send('success');
});

module.exports = router;
