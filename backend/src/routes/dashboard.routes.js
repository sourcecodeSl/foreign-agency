const router = require('express').Router();
const dashboardController = require('../controllers/dashboard.controller');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

/** GET /api/v1/dashboard/stats - counters for the overview cards */
router.get('/stats', dashboardController.stats);

/** GET /api/v1/dashboard/activity - recent audit trail */
router.get('/activity', dashboardController.activity);

module.exports = router;
