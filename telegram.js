const express = require('express');
const crypto = require('crypto');
const url = require('url');
const router = express.Router();

// Telegram验证函数
function validateTelegramData(initDataStr, botToken) {
    const secretKey = crypto.createHash('sha256').update(botToken).digest();

    // 解码前端传来的 initData，但保留 user 字段不解码（不要对 user 字段解码）
    const decodedStr = decodeURIComponent(initDataStr);
    console.log('Decoded initData:', decodedStr);

    const params = new URLSearchParams(decodedStr);
    const hash = params.get('hash');  // 提取原始提供的 hash 值
    params.delete('hash');  // 删除 hash，避免干扰后面的计算

    // 确保 user 字段的原始字符串不被改变，其他参数继续处理
    const userStr = params.get('user');  // 获取 user 字段值
    params.delete('user');  // 删除 user，防止重复添加

    // 计算dataCheckString，不包括 user，保持其原始状态
    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n' + userStr;  // 将原始的 user 字符串加入计算

    // 计算得到的哈希值
    const computedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    console.log('Computed hash:', computedHash);
    console.log('Provided hash:', hash);

    // 返回计算出的签名是否与传入的 hash 相等
    return computedHash === hash;
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
    const isValid = validateTelegramData(t3token, secret);
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
