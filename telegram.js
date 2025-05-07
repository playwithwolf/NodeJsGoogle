const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');
const router = express.Router();


// Telegram验证函数
function validateTelegramData(initDataStr, botToken) {
    const secretKey = crypto.createHash('sha256').update(botToken).digest();

    const params = new URLSearchParams(initDataStr);
    const hash = params.get('hash');
    params.delete('hash');

    const sortedParams = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const computedHash = crypto
        .createHmac('sha256', secretKey)
        .update(sortedParams)
        .digest('hex');

    return computedHash === hash;
}


// Telegram 验证路由
router.post('/telegramVerify', async (req, res) => {
    console.log('Request body:', req.body);
    
    const { t3token, t3userid } = req.body;

    if ( !t3token || !t3userid) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Telegram Web App secret key (you可以从BotFather获取)
    const secret = '7583464834:AAFfuAopbKS_BQw__irtDfcrwax-byZk24I';

    // 验证 initData 的签名
    const isValid = validateTelegramData(t3token, secret);
    if (!isValid) {
        return res.status(400).json({ error: 'Invalid initData signature' });
    }

     // 解析 t3token，提取 user 信息
     const data = querystring.parse(t3token);
     const userJson = data.user ? JSON.parse(data.user) : null;
 
     if (!userJson || !userJson.id) {
         return res.status(400).json({ error: 'User data not found in initData' });
     }

     // 比对前端传过来的 user id
    if (user.id.toString() !== t3userid.toString()) {
        return res.status(403).json({ error: 'User ID mismatch' });
    }

    // 验证成功
    return res.status(200).json({
        message: 'Verification successful',
        userId: user.id,
        username: user.username || '',
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim()
    });
 
});

module.exports = router;
