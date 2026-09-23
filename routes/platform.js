const express     = require('express');
const router      = express.Router();
const requireAuth = require('../middleware/auth');
const { readFeatures } = require('../utils/features');

router.use(requireAuth);

router.get('/features', async (req, res, next) => {
  try {
    res.json(await readFeatures());
  } catch (e) { next(e); }
});

module.exports = router;
