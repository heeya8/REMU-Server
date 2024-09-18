const express = require('express');
const { searchPerformances } = require('../search');

const router = express.Router();

router.use(express.json());

router.get('/', searchPerformances);

module.exports = router;