const express = require('express');

const router = express.Router();



router.post('/auth',  async (req, res) => {
    console.log(req.body);
    console.log(req.body.idToken);
   // res.send('get users');





});

module.exports = router;