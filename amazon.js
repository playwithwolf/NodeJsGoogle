const express = require('express');
const axios = require('axios');
const https = require('https');
const router = express.Router();
 
function deepClone(obj, hash = new WeakMap()) {
    if (typeof obj !== 'object' || obj === null) return obj;
  
    if (hash.has(obj)) return hash.get(obj);
  
    const result = Array.isArray(obj) ? [] : {};
    hash.set(obj, result);
  
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = deepClone(obj[key], hash);
      }
    }
  
    return result;
  }
router.post('/amazonAuth',  async (req, res) => {
    console.log(req.body);
    console.log(req.body.t3token);
    console.log(req.body.t3userid);
    console.log(req.body.amazonappid);
    
    const url = `https://api.amazon.com/auth/o2/tokeninfo?access_token=${req.body.t3token}`;

    try {
        const response = await axios.get(url);
        //console.log(response);
        console.log("---------------1------------");
        console.log(response.data);
        console.log("---------------2------------");
        console.log("app_id:"+response.data.app_id);
        console.log("req.body.amazonappid:"+ req.body.amazonappid);
        console.log("req.body.t3userid:"+ req.body.t3userid);
        console.log("response.data.user_id:"+ response.data.user_id);
        if(response.data.app_id == req.body.amazonappid && req.body.t3userid == response.data.user_id ){
            console.log("---------------ok------------");
            try{

                const headers = {
                    'Authorization': `bearer ${req.body.t3token}`
                  };
              
                  // 使用 Axios 发送 GET 请求
                  const response = await axios.get('https://api.amazon.com/user/profile', { headers });
                 // console.log("response = "+response.data);
                 // const dataMap = deepClone(response.data);

                  console.log("email = "+response.get("email"));
                  // 返回响应数据
                  //res.json(response);

            }catch(error){
                console.error('profile Error:', error);
            }
        }
         
    } catch (error) {
        console.error('Error fetching token info:', error);
        res.status(500).json({ error: 'Failed to fetch token info' });
    }

});

module.exports = router;