const router = require('express').Router();

const authRoutes = require('./auth.routes');
const agencyRoutes = require('./agency.routes');
const userRoutes = require('./user.routes');
const roleRoutes = require('./role.routes');
const verificationRoutes = require('./verification.routes');
const dashboardRoutes = require('./dashboard.routes');

router.use('/auth', authRoutes);
router.use('/agencies', agencyRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/verification', verificationRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
