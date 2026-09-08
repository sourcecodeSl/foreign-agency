const router = require('express').Router();
const { body } = require('express-validator');

const roleController = require('../controllers/role.controller');
const validate = require('../middleware/validate');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');

router.use(requireAuth);

/** GET /api/v1/roles - user types list */
router.get('/', requirePermission('roles', 'view'), roleController.list);

/** POST /api/v1/roles */
router.post(
  '/',
  requirePermission('roles', 'create'),
  [
    body('name').trim().isLength({ min: 3 }).withMessage('Role name must be at least 3 characters.'),
    body('description').trim().notEmpty().withMessage('Describe what this role can do.'),
  ],
  validate,
  roleController.create
);

/** PUT /api/v1/roles/:id */
router.put('/:id', requirePermission('roles', 'edit'), roleController.update);

/** DELETE /api/v1/roles/:id - system roles are protected in the controller */
router.delete('/:id', requirePermission('roles', 'delete'), roleController.remove);

/** GET /api/v1/roles/:slug/permissions - matrix for one role */
router.get('/:slug/permissions', requirePermission('roles', 'view'), roleController.getPermissions);

/** PUT /api/v1/roles/:slug/permissions - save the whole matrix at once */
router.put(
  '/:slug/permissions',
  requirePermission('roles', 'edit'),
  [body('permissions').isObject().withMessage('A permissions object is required.')],
  validate,
  roleController.savePermissions
);

module.exports = router;
