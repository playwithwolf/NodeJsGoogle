const express = require('express');
const axios = require('axios');
const qs = require('qs');
const crypto = require('crypto');

const router = express.Router();

// Vivo支付查询接口地址
const VIVO_QUERY_URL = 'https://pay.vivo.com.cn/vcoin/queryv2';

// Vivo接口配置（请替换为你自己的）
const config = {
  appId: '105909218',
  cpId: 'eaf85afaa4a380ce7732',
  appKey: 'c81ceaeebcf35a8bffa6ac1089976874', // 用于签名
  version: '1.0.0',
  signMethod: 'MD5',
};

// 生成签名方法
function generateSignature(params, appKey) {
  const sortedKeys = Object.keys(params).sort();
  const paramStr = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  const md5 = crypto.createHash('md5');
  const rawStr = paramStr + '&' + crypto.createHash('md5').update(appKey).digest('hex').toLowerCase();
  return md5.update(rawStr).digest('hex').toLowerCase();
}

router.post('/vivocnPayNotify', async (req, res) => {
  const { cpOrderNumber, orderAmount, orderNumber } = req.body;

  if (!cpOrderNumber || !orderAmount) {
    return res.status(400).send('Missing required parameters: cpOrderNumber or orderAmount');
  }
  console.log(req.body)
  // 构建请求参数
  const params = {
    version: config.version,
    signMethod: config.signMethod,
    appId: config.appId,
    cpId: config.cpId,
    cpOrderNumber,
    orderAmount,
  };

  if (orderNumber) {
    params.orderNumber = orderNumber;
  }

  // 生成签名
  params.signature = generateSignature(params, config.appKey);

  try {
    const response = await axios.post(VIVO_QUERY_URL, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });

    const result = response.data;

    if (result.respCode === '200' && result.tradeStatus === '0000') {
      console.log(`✅ 查询成功：订单已支付`);
      return res.json({ status: 'success', data: result });
    } else {
      console.warn('⚠️ 查询结果异常:', result);
      return res.json({ status: 'fail', data: result });
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    return res.status(500).send('Server error');
  }
});

module.exports = router;
