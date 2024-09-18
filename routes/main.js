const express = require('express');
const { listPerformances } = require('../main');

const router = express.Router();

router.use(express.json());

router.get('/', listPerformances);

module.exports = router;