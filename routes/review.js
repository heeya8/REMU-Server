const express = require('express');
const verifyToken = require('../middlewares/verifyToken')
const { addition, updateReview, deleteReview  } = require('../review');

const router = express.Router();

router.use(express.json());

router.post('/addition', verifyToken, addition);
router.put('/:id', verifyToken, updateReview);
router.delete('/:id', verifyToken, deleteReview);

module.exports = router;