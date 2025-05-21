const axios = require('axios');
const qs = require('qs');
const crypto = require('crypto');
const express = require('express');
const router = express.Router();

//   生成签名
//   @param {string} appId 
//   @param {string} session 
//   @param {string} uid 
//   @param {string} appSecret 
//   @returns {string}
 
function generateSignature(appId, session, uid, appSecret) {
  //  按 key 字典序拼接
  const paramStr = `appId=${appId}&session=${session}&uid=${uid}`;
  const raw = paramStr + appSecret;

  return crypto.createHash('sha1').update(raw, 'utf8').digest('hex');
}


//   验证用户 session 是否有效
//   @param {string} appId 
//   @param {string} appSecret 
//   @param {string} session 
//   @param {string} uid 
 
async function validateMiSession(appId, appSecret, session, uid) {
  const signature = generateSignature(appId, session, uid, appSecret);
  console.log("signature = "+signature)
  const url = "https://mis.migc.xiaomi.com/api/biz/service/loginvalidate";
  const headers = {
    "Content-Type": "applicationx-www-form-urlencoded",
  };
  const data = qs.stringify({
    appId,
    session,
    uid,
    signature,
  });

  try {
    const res = await axios.post(url, data, { headers });
    return res
    console.log('验证结果', res.data);
  } catch (err) {
    console.error('请求失败', err.message);
  }
}

//  ✅ 示例调用（替换成你自己的信息）
// const appId = '你的AppID';
// const appSecret = '你的AppSecret';
// const session = '用户的session';
// const uid = '用户的uid';

// validateMiSession(appId, appSecret, session, uid);

router.post('/mimoSessionVerify', async (req, res) => {
    console.log('Request body:', req.body);
    
    const { t3token, t3userid, appId, appSecret } = req.body;

    console.log(t3token)
    console.log(t3userid)
    console.log(appId)
    console.log(appSecret)

    return await validateMiSession(appId, appSecret, t3token, t3userid);

});

module.exports = router;
