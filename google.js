const express = require('express');
const axios = require('axios');
const https = require('https');
const router = express.Router();
const {OAuth2Client} = require('google-auth-library');


router.post('/auth',  async (req, res) => {
    console.log(req.body);
    console.log(req.body.idToken);
    // const data = {
    //     name: 'John Doe',
    //     age: 30,
    //     email: 'john@example.com'
    //   };
    // res.json(data);
    // try {
    //   // const response = await axios.get('https://api.example.com/data', {
    //   //   // 你可以在这里添加任何需要的请求配置，例如headers、params、data等
    //   // });
    //   const options = {
    //     hostname: 'example.com',
    //     path: `/path?${queryString}`,
    //     method: 'GET'
    //   };


    //   res.json(response.data);
    // } catch (error) {
    //   // 处理请求错误
    //   res.status(500).send('Error fetching data');
    // }
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


    const url = 'https://accounts.google.com/o/oauth2/auth/oauthchooseaccount?scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fandroidpublisher&response_type=code&access_type=offline&redirect_uri=https%3A%2F%2Fnodejsgoogle.onrender.com%2Fcallback&client_id=846278508720-cp11mkt0hrh1nihq1lklaj8qsio9vva9.apps.googleusercontent.com&flowName=GeneralOAuthFlow';  // 构造带有参数的URL  

    https.get(url, (response) => {  
      let data = '';  
      response.on('data', (chunk) => {  
        data += chunk;  
      });  
      response.on('end', () => {  
        console.log(data);  
      });  
    }).on('error', (error) => {  
      console.error('Error:', error);  
    });  


});

module.exports = router;