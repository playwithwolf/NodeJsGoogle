const express = require('express');
const axios = require('axios');
const https = require('https');
const router = express.Router();
  //https://developer.amazon.com/zh/docs/in-app-purchasing/iap-rvs-setup-prod.html 文档
  //响应字段 https://developer.amazon.com/zh/docs/in-app-purchasing/iap-rvs-for-android-apps.html#rvs-response-fields-for-successful-transactions
  // {
  //   autoRenewing: false,
  //   baseReceipts: null,
  //   betaProduct: false,
  //   cancelDate: null,
  //   cancelReason: null,
  //   deferredDate: null,
  //   deferredSku: null,
  //   freeTrialEndDate: null,
  //   gracePeriodEndDate: null,
  //   parentProductId: null,
  //   productId: 'Amazon_100',
  //   productType: 'CONSUMABLE',
  //   promotions: null,
  //   purchaseDate: 1743411656809,
  //   purchaseMetadataMap: null,
  //   quantity: 1,
  //   receiptId: 'q1YqVbJSyjH28DGPKChw9c0o8nd3ySststQtzSkrzM8tCk43K6z0d_HOTcwwN8vxCrVV0lEqBmpxzE2sys-LNzQwAAqUKFkZ6CilAIUNzU2MTQwNzUzNLAwsgTKJSlZpiTnFqTpK6XBWGpRVCwA',
  //   renewalDate: null,
  //   term: null,
  //   termSku: null,
  //   testTransaction: true
  // }
router.post('/amazoniapverify',  async (req, res) => {
    console.log(req.body);
    console.log(req.body.sharedSecret);
    //https://developer.amazon.com/sdk/shared-key.html  sharedSecret 生成办法
    const SharedSecret = req.body.sharedSecret ;
    console.log(req.body.userId);
    const userId = req.body.userId;
    console.log(req.body.receiptId);
    const receiptId = req.body.receiptId;
    console.log(req.body.productId);
    const productId = req.body.productId;
    
   // const url = `https://api.amazon.com/auth/o2/tokeninfo?access_token=${req.body.t3token}`;
   const urlheadersandbox = 'https://appstore-sdk.amazon.com/sandbox'
   const urlheaderproduce = 'https://appstore-sdk.amazon.com'

   const url = `${urlheadersandbox}/version/1.0/verifyReceiptId/developer/${SharedSecret}/user/${userId}/receiptId/${receiptId}`;

    try {
        const response = await axios.get(url);
        //console.log(response);
        console.log("---------------1------------");
        console.log(response.data);
        
        console.log("---------------2------------");
       
        if(response.data.testTransaction){
          console.log("--------- 这是测试购买----------");
        } 

        console.log("---------------response.data.cancelReason------------" + response.data.cancelReason);
        console.log("---------------response.data.produceId------------" + response.data.productId);
        console.log("---------------produceId------------" + productId);
        console.log("---------------response.data.receiptId------------" + response.data.receiptId);
        console.log("---------------receiptId------------" + receiptId);

        if(response.data.productId == productId && response.data.receiptId == receiptId && response.data.cancelReason==null){
          console.log("--------- 购买成功 ----------");
        }
         
    } catch (error) {
        console.error('Error fetching token info:', error);
        res.status(500).json({ error: 'Failed to fetch token info' });
    }

});

module.exports = router;