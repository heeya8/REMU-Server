const express = require('express');
const { getDetailAndReviews } = require('../detail');

const router = express.Router();

router.use(express.json());

router.get('/', getDetailAndReviews);

module.exports = router;
