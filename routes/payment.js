const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);
const payment = require(`${__dirname}/../controllers/moneyBox/payment`);
const {role}= require(`${__dirname}/../middlewares/authorization`) 
const verifyFinancialToken = require(`${__dirname}/../middlewares/verifyFinancialToken`);


// protected routes
router.use(authMiddleware.protected);

router.use(role('superadmin', 'manager')); // only admin and manager can access these routes

// GET all suppliers
router.get("/getPayment", payment.getPayment);


// login with financial pin to access financial routes
router.post("/financialLogin", payment.financialLogin);

router.delete("/deletePayment/:paymentId", payment.deletePayment);
router.use(verifyFinancialToken.protected); // only admin and manager can access these routes
// ========================== ROUTES ==========================

// transfer money between accounts
router.post("/financial/transfer", payment.transferMoney);

// get statistics for payments incoming and outgoing for today, this month, this year and custom range
router.get("/PaymentFilters", payment.getPaymentFilters);

// get statistics for payments incoming and outgoing for today, this month, this year and custom range
router.get("/statistics", payment.statistics);


// get statistics for payments incoming and outgoing for today, this month, this year and custom range
router.get("/dashboardStats", payment.dashboardStats);


// get all payments with filters and pagination
router.get("/getPayments", payment.getPayments);


// get payment by id
router.get("/:id", payment.getPaymentById);



module.exports = router;

