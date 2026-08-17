const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);
const chequeController = require(`${__dirname}/../controllers/moneyBox/cheque`);
const {role}= require(`${__dirname}/../middlewares/authorization`) 



// protected routes
router.use(authMiddleware.protected);
router.use(role('superadmin', 'manager')); // only admin and manager can access these routes
// ========================== ROUTES ==========================

// CRUD

// get all 
router.get("/",chequeController.getAllCheque);


router.get("/getChequesByCardType",chequeController.getChequesByCardType);

// get notification
router.get("/notification",chequeController.notification);

// get cheque 
router.get("/:id",chequeController.getChequeByID);

// update Cheque
router.put("/:id",chequeController.updateCheque);


module.exports = router;