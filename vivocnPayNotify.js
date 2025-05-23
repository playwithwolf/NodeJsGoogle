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

/**
 * 生成 vivo 接口签名
 * @param {Object} rawParams - 请求参数（不含 signMethod 和 signature）
 * @param {string} appKey - 合作密钥
 * @returns {string} 签名字符串（小写）
 */
function generateVivoSignature(rawParams, appKey) {
  // 1. 移除空值字段（空字符串、null、undefined）
  const filtered = {};
  for (const key in rawParams) {
    if (rawParams[key] !== null && rawParams[key] !== '' && rawParams[key] !== undefined) {
      filtered[key] = rawParams[key];
    }
  }

  // 2. 按 key 升序排序
  const sortedKeys = Object.keys(filtered).sort();

  // 3. 拼接为 key=value&...
  const paramStr = sortedKeys.map(key => `${key}=${filtered[key]}`).join('&');

  // 4. 计算 appKey 的 md5 小写
  const appKeyMd5 = crypto.createHash('md5').update(appKey).digest('hex').toLowerCase();

  // 5. 拼接最终签名字符串
  const fullStr = `${paramStr}&${appKeyMd5}`;

  // 6. 最终 md5 签名
  const signature = crypto.createHash('md5').update(fullStr).digest('hex').toLowerCase();

  return signature;
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
