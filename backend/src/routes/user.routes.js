const router = require('express').Router();
const { body } = require('express-validator');

const userController = require('../controllers/user.controller');
const validate = require('../middleware/validate');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');

router.use(requireAuth);

/** GET /api/v1/users?role=&status=&search= */
router.get('/', requirePermission('users', 'view'), userController.list);

/** GET /api/v1/users/:id */
router.get('/:id', requirePermission('users', 'view'), userController.getById);

/** POST /api/v1/users */
router.post(
  '/',
  requirePermission('users', 'create'),
  [
    body('name').trim().isLength({ min: 3 }).withMessage('Name is required.'),
    body('email').isEmail().withMessage('A valid email is required.'),
    body('phone').trim().notEmpty().withMessage('Phone number is required.'),
    body('roleSlug').trim().notEmpty().withMessage('Assign a user type.'),
  ],
  validate,
  userController.create
);

/** PUT /api/v1/users/:id */
router.put(
  '/:id',
  requirePermission('users', 'edit'),
  [body('email').optional().isEmail().withMessage('A valid email is required.')],
  validate,
  userController.update
);

/** PATCH /api/v1/users/:id/status */
router.patch(
  '/:id/status',
  requirePermission('users', 'edit'),
  [body('status').isIn(['active', 'pending', 'deactivated'])],
  validate,
  userController.updateStatus
);

/** DELETE /api/v1/users/:id */
router.delete('/:id', requirePermission('users', 'delete'), userController.remove);

module.exports = router;
