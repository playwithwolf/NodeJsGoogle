const express = require('express');  
const cors = require('cors');
const bodyParser = require('body-parser');

// const myRouter = require('./google.js');
// const myRouter = require('./amazoniap.js');
const myRouter = require('./ton.js');
const myRouter2 = require('./mimo.js');
const myRouter3 = require('./mimoiapcallback.js');
const myRouter4 = require('./xiaomiWebhook.js');
const myRouter5 = require('./vivoverify.js');
const myRouter6 = require('./vivocnPayNotify.js');
const app = express();  
const port = 80;  
app.use(cors());
app.use(bodyParser.json());       // 解析JSON格式的请求体
app.use(bodyParser.urlencoded({ extended: true })); // 解析URL编码的请求体
app.use(myRouter);
app.use(myRouter2);
app.use(myRouter3);
app.use(myRouter4);
app.use(myRouter5);
app.use(myRouter6);
app.listen(port, () => {  
    console.log('baijie Server running');  
});  