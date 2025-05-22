const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const port = 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HMAC-SHA1 签名计算，与 Java 保持一致
function getHmacSha1Signature(appId, session, uid, appSecret) {
  const rawStr = `appId=${appId}&session=${session}&uid=${uid}`;
  return crypto.createHmac('sha1', appSecret).update(rawStr, 'utf8').digest('hex');
}

// 小米 session 验证接口
app.post('/xiaomi/verifySession', async (req, res) => {
  const { appId, session, uid, appSecret } = req.body;

  if (!appId || !session || !uid || !appSecret) {
    return res.status(400).json({ error: '缺少参数：appId, session, uid, appSecret' });
  }

  try {
    const signature = getHmacSha1Signature(appId, session, uid, appSecret);

    const params = new URLSearchParams();
    params.append('appId', appId);
    params.append('session', session);
    params.append('uid', uid);
    params.append('signature', signature);

    const response = await axios.post(
      'https://mis.migc.xiaomi.com/api/biz/service/loginvalidate',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    return res.json({
      signature,
      miResponse: response.data,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      responseData: error.response?.data || null,
    });
  }
});

// 启动服务
app.listen(port, () => {
  console.log(`小米 session 验证服务已启动，访问 http://localhost:${port}/xiaomi/verifySession`);
  console.log('示例测试 curl 命令：');
  console.log(`curl -X POST http://localhost:${port}/xiaomi/verifySession -H "Content-Type: application/json" -d '{"appId":"2882303761520417220","session":"oh5iVoaf4b6zJKvl","uid":"2025052109076245","appSecret":"OBIqLzJ1R/kljGCPv6mIEQ=="}'`);
});
