const express = require('express');  
const cors = require('cors');
const bodyParser = require('body-parser');

//const myRouter = require('./google.js');
const myRouter = require('./amazoniap.js');
const app = express();  
const port = 80;  
app.use(cors());
app.use(bodyParser.json());       // 解析JSON格式的请求体
app.use(bodyParser.urlencoded({ extended: true })); // 解析URL编码的请求体
app.use(myRouter);
app.listen(port, () => {  
    console.log('baijie Server running');  
});  