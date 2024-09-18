const express = require('express');
const verifyToken = require('../middlewares/verifyToken');
const { getUserInfo, getUserReviews, patchUserInfo} = require('../user');

const router = express.Router();

router.use(express.json());

router.get('/info', verifyToken, getUserInfo);
router.get('/reviews',verifyToken, getUserReviews);
router.patch('/', verifyToken, patchUserInfo);

module.exports = router;
