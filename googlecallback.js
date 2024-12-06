const express = require('express');
const axios = require('axios');
const routercallback = express.Router();



routercallback.post('/callback',  async (req, res) => {
    console.log(req.body);
    
    

});

module.exports = routercallback;