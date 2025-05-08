const express = require('express');
const crypto = require('crypto');
const url = require('url');
const router = express.Router();
const querystring = require('querystring');

// Telegram验证函数
function verifyTelegramWebApp(initDataStr, botToken) {
    // Step 1: 解析参数
    const parsed = querystring.parse(initDataStr);
    const receivedHash = parsed.hash;
    delete parsed.hash;
  
    // Step 2: 按 key 排序，构造 data_check_string
    const dataParams = Object.keys(parsed)
      .sort()
      .map(key => `${key}=${parsed[key]}`)
      .join('\n');
  
    // Step 3: 生成 secret key = HMAC_SHA256("WebAppData", bot_token)
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
  
    // Step 4: 使用 secret key 签名 data_check_string，得到最终 hash
    const hmac = crypto.createHmac('sha256', secretKey)
      .update(dataParams)
      .digest('hex');

    // 返回计算出的签名是否与传入的 hash 相等
    return hmac === receivedHash;
}

// Telegram 验证路由
router.post('/telegramVerify', async (req, res) => {
    console.log('Request body:', req.body);
    
    const { t3token, t3userid } = req.body;

    if (!t3token || !t3userid) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Telegram Web App secret key（从 BotFather 获取）
    const secret = '7583464834:AAFfuAopbKS_BQw__irtDfcrwax-byZk24I';

    // 验证 initData 的签名
    const isValid = verifyTelegramWebApp(t3token, secret);
    if (!isValid) {
        return res.status(400).json({ error: 'Invalid initData signature' });
    }

    // 解析 t3token，提取 user 信息
    const searchParams = new URLSearchParams(t3token);
    const userStr = searchParams.get('user');
    const userJson = userStr ? JSON.parse(userStr) : null;

    if (!userJson || !userJson.id) {
        return res.status(400).json({ error: 'User data not found in initData' });
    }

    // 比对前端传过来的 user id
    if (userJson.id.toString() !== t3userid.toString()) {
        return res.status(403).json({ error: 'User ID mismatch' });
    }

    // 验证成功，返回用户信息
    return res.status(200).json({
        message: 'Verification successful',
        userId: userJson.id,
        username: userJson.username || '',
        name: `${userJson.first_name || ''} ${userJson.last_name || ''}`.trim()
    });
});

module.exports = router;
