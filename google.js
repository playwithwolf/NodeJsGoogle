const express = require('express');
const axios = require('axios');
const https = require('https');
const router = express.Router();
const {OAuth2Client} = require('google-auth-library');


router.post('/auth',  async (req, res) => {
    console.log(req.body);
    console.log(req.body.idToken);
     
    const CLIENT_ID = "846278508720-cp11mkt0hrh1nihq1lklaj8qsio9vva9.apps.googleusercontent.com";
    const client = new OAuth2Client(CLIENT_ID); 
    try {  
      const ticket = await client.verifyIdToken({  
        idToken: req.body.idToken,  
        audience: CLIENT_ID  
      });  
      const payload = ticket.getPayload(); // 返回用户信息  
      res.json(payload);
      
    } catch (error) {  
      console.error('Error verifying token:', error);  
      res.status(500).send('Error fetching data');
    }  
 

});

module.exports = router;

//login,auth, googs list, charge, 

//广告 裸包跑起来，聚合 facebook，unity，ironsource
//cocos creator ,js call android native，拉起 admob，callback to cocos js
//充值校验
// 你好外星人 项目，出包 提交googleplay
//建立 完整的 打包流程和环境
//完整的文档 -> 入库



//rustore

//巴扎
//telegram


