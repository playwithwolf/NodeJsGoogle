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
 * 生成 vivo 查询接口签名
 * @param {Object} params 需要签名的参数（不包含 signMethod 和 signature）
 * @param {string} appKey 合作密钥
 * @returns {string} MD5 签名（小写）
 */
function generateVivoSignature(params, appKey) {
  // 1. 过滤空值
  const filtered = {};
  for (const key in params) {
    const value = params[key];
    if (value !== '' && value !== null && value !== undefined) {
      filtered[key] = value;
    }
  }

  // 2. 按 key 升序排序
  const sortedKeys = Object.keys(filtered).sort();
  const paramStr = sortedKeys.map(key => `${key}=${filtered[key]}`).join('&');

  // 3. 对 appKey 做 MD5 并转小写
  const appKeyMd5 = crypto.createHash('md5').update(appKey).digest('hex').toLowerCase();

  // 4. 拼接签名字符串
  const signString = `${paramStr}&${appKeyMd5}`;

  // 5. 对拼接字符串做 MD5 签名
  return crypto.createHash('md5').update(signString, 'utf-8').digest('hex').toLowerCase();
}



router.post('/vivocnPayNotify', async (req, res) => {
  const { cpOrderNumber, orderAmount, orderNumber } = req.body;

  if (!cpOrderNumber || !orderAmount) {
    return res.status(400).send('Missing required parameters: cpOrderNumber or orderAmount');
  }
 // console.log(req.body)
 
   // 构建签名参数（仅包含用于签名的字段）
  const signParams = {
    version: config.version,
    appId: config.appId,
    cpId: config.cpId,
    cpOrderNumber,
    orderAmount,
  };
  if (orderNumber) {
    signParams.orderNumber = orderNumber;
  }
  // 生成签名
  console.log(" signParams = "+signParams);
  const signature = generateVivoSignature(signParams, config.appKey);
  console.log(" signature = "+signature);

  // 最终请求参数（添加 signature 和 signMethod）
  const requestParams = {
    ...signParams,
    signature,
    signMethod: config.signMethod,
  };



  // if (orderNumber) {
  //   params.orderNumber = orderNumber;
  // }

  // 生成签名
 
  try {
    const response = await axios.post(VIVO_QUERY_URL, qs.stringify(requestParams), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });

    const result = response.data;

    if (result.respCode === '200' && result.tradeStatus === '0000') {
      console.log(`✅ 查询成功：订单已支付`);
      return res.status(200).send('success');
    } else {
      console.warn('⚠️ 查询结果异常:', result);
      return res.status(200).send('fail');
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    return res.status(200).send('fail');
  }
});

module.exports = router;
