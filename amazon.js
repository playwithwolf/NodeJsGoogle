const express = require('express');
const axios = require('axios');
const https = require('https');
const router = express.Router();
 

router.post('/amazonAuth',  async (req, res) => {
    console.log(req.body);
    console.log(req.body.t3token);
    console.log(req.body.t3userid);
});

module.exports = router;