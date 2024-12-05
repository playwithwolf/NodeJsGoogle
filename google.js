const express = require('express');

const router = express.Router();



router.post('/auth',  async (req, res) => {
    console.log(req.body);
    console.log(req.body.idToken);
    const data = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com'
      };
    res.json(data);
});

module.exports = router;