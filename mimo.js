const axios = require('axios');
const qs = require('qs');
const crypto = require('crypto');
const express = require('express');
const router = express.Router();

// ✅ 生成 HMAC-SHA1 签名（与 Java 保持一致）
function generateSignature(appId, session, uid, appSecret) {
  const paramStr = `appId=${appId}&session=${session}&uid=${uid}`;
  return crypto.createHmac('sha1', appSecret).update(paramStr, 'utf8').digest('hex');
}

// ✅ 验证用户 session 是否有效
async function validateMiSession(appId, appSecret, session, uid) {
  const signature = generateSignature(appId, session, uid, appSecret);
  console.log("signature = " + signature);

  const url = "https://mis.migc.xiaomi.com/api/biz/service/loginvalidate";
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded", // ✅ 修复拼写错误
  };
  const data = qs.stringify({
    appId,
    session,
    uid,
    signature,
  });

  try {
    const res = await axios.post(url, data, { headers });
    return res.data; // ✅ 返回 data 部分
  } catch (err) {
    console.error('请求失败', err.message);
    throw err; // ✅ 抛出异常让外层处理
  }
}

// ✅ 路由处理 POST 请求
router.post('/mimoSessionVerify', async (req, res) => {
  console.log('Request body:', req.body);

  const { t3token, t3userid, appId, appSecret } = req.body;

  if (!t3token || !t3userid || !appId || !appSecret) {
    return res.status(400).json({ error: '缺少参数：t3token, t3userid, appId, appSecret' });
  }

  try {
    const result = await validateMiSession(appId, appSecret, t3token, t3userid);
    res.json({
      success: true,
      signature: generateSignature(appId, t3token, t3userid, appSecret),
      miResponse: result,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
