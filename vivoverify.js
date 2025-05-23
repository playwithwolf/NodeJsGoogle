const express = require('express');
const axios = require('axios');
const qs = require('qs');

const router = express.Router();

const VIVO_AUTH_URL = 'https://joint-account.vivo.com.cn/cp/user/auth';
const VIVO_AUTH_URL_BACKUP = 'https://joint-account-cp.vivo.com.cn/cp/user/auth';

router.post('/vivoverify', async (req, res) => {
  const { opentoken, openId } = req.body;

  if (!opentoken || !openId) {
    console.error('❌ 参数错误：缺少 opentoken 或 openId');
    return res.status(400).send('Missing opentoken or openId');
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };

  const postData = qs.stringify({ opentoken });

  const checkToken = async (url) => {
    try {
      const response = await axios.post(url, postData, { headers });
      const result = response.data;

      if (result.retcode === 0 && result.data?.openid === openId) {
        console.log(`✅ 验证成功：token 匹配 openId`);
        return true;
      } else {
        console.warn('⚠️ 验证失败:', result);
        return false;
      }
    } catch (err) {
      console.error(`❌ 请求失败（${url}）:`, err.message);
      return null;
    }
  };

  // 先用主接口
  let verified = await checkToken(VIVO_AUTH_URL);

  // 主接口出错时，用备用接口
  if (verified === null) {
    console.log('🔁 使用备用接口重试');
    verified = await checkToken(VIVO_AUTH_URL_BACKUP);
  }

  if (verified) {
    return res.send('valid');
  } else {
    return res.status(401).send('invalid');
  }
});

module.exports = router;
