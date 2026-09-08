const router = require('express').Router();
const { body, param, query } = require('express-validator');

const agencyController = require('../controllers/agency.controller');
const validate = require('../middleware/validate');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');

// Every agency endpoint requires an authenticated admin.
router.use(requireAuth);

/** GET /api/v1/agencies?status=pending|active|deactivated|all&search= */
router.get(
  '/',
  requirePermission('agencies', 'view'),
  [query('status').optional().isIn(['all', 'pending', 'active', 'deactivated'])],
  validate,
  agencyController.list
);

/** GET /api/v1/agencies/counts - tab badge counts */
router.get('/counts', requirePermission('agencies', 'view'), agencyController.counts);

/** GET /api/v1/agencies/:id */
router.get(
  '/:id',
  requirePermission('agencies', 'view'),
  [param('id').notEmpty()],
  validate,
  agencyController.getById
);

/** POST /api/v1/agencies - create agency + issue credentials */
router.post(
  '/',
  requirePermission('agencies', 'create'),
  [
    body('name').trim().isLength({ min: 3 }).withMessage('Name must be at least 3 characters.'),
    body('address').trim().isLength({ min: 8 }).withMessage('Please provide the full address.'),
    body('username')
      .trim()
      .matches(/^[a-zA-Z0-9._-]{4,20}$/)
      .withMessage('Username must be 4-20 characters (letters, numbers, . _ -).'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters.')
      .matches(/[A-Z]/)
      .withMessage('Password must include an uppercase letter.')
      .matches(/[0-9]/)
      .withMessage('Password must include a number.'),
  ],
  validate,
  agencyController.create
);

/** PUT /api/v1/agencies/:id */
router.put(
  '/:id',
  requirePermission('agencies', 'edit'),
  [body('name').optional().trim().isLength({ min: 3 }), body('address').optional().trim().isLength({ min: 8 })],
  validate,
  agencyController.update
);

/** PATCH /api/v1/agencies/:id/status - approve / deactivate / reactivate */
router.patch(
  '/:id/status',
  requirePermission('agencies', 'edit'),
  [body('status').isIn(['pending', 'active', 'deactivated']).withMessage('Unknown status.')],
  validate,
  agencyController.updateStatus
);

/** POST /api/v1/agencies/:id/credentials/reset - regenerate the login password */
router.post(
  '/:id/credentials/reset',
  requirePermission('agencies', 'edit'),
  agencyController.resetCredentials
);

/** DELETE /api/v1/agencies/:id */
router.delete('/:id', requirePermission('agencies', 'delete'), agencyController.remove);

module.exports = router;
