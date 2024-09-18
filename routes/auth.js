const express = require('express');
const verifyToken = require('../middlewares/verifyToken')
const { join, login, logout, password, account } = require('../auth');

const router = express.Router();

router.use(express.json());

router.post('/join', join);
router.post('/login', login);
router.post('/logout', verifyToken, logout);
router.patch('/password',verifyToken, password);
router.delete('/account', verifyToken, account);

module.exports = router;
