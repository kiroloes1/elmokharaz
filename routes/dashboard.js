const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);
const dashboardController = require(`${__dirname}/../controllers/dashboard/dashboardController`);
const {role}= require(`${__dirname}/../middlewares/authorization`) 



// protected routes
router.use(authMiddleware.protected);
router.use(role('superadmin', 'manager')); // only admin and manager can access these routes
// ========================== ROUTES ==========================

// CRUD

// get all 
router.get("/",dashboardController.getDashboard);

router.get("/money",dashboardController.money);


module.exports = router;

