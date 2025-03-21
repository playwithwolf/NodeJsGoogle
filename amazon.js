const express = require('express');
const axios = require('axios');
const https = require('https');
const router = express.Router();
 

router.post('/amazonAuth',  async (req, res) => {
    console.log(req.body);
    console.log(req.body.t3token);
    console.log(req.body.t3userid);

    const url = `https://api.amazon.com/auth/o2/tokeninfo?access_token=${req.body.t3token}`;

    try {
        const response = await axios.get(url);
        console.log(response);
        console.log("---------------1------------");
        console.log(response.data);
        console.log("---------------2------------");
         
    } catch (error) {
        console.error('Error fetching token info:', error);
        res.status(500).json({ error: 'Failed to fetch token info' });
    }

});

module.exports = router;