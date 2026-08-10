const express = require(`express`);
const router=express.Router();
const authorizationMiddleware = require(`${__dirname}/../middlewares/authorization`);
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);
const boxController = require(`${__dirname}/../controllers/moneyBox/moneyBox`);

// protected routes
router.use(authMiddleware.protected);

router.use(authorizationMiddleware.role('superadmin', 'manager')); 



/* Transactions */
router.post("/transactions", boxController.addTransaction);
router.get("/transactions", boxController.getTransactions);
router.get("/transactions2", boxController.getTransactions2);

router.get("/transaction/All", boxController.getAllTransactions);

router.get("/transactions/:id", boxController.getTransactionById);
router.patch("/transactions/:id", boxController.updateTransaction);
router.delete("/transactions/:id", boxController.deleteTransaction);

/* Balance */
router.get("/balance", boxController.getBalance);




module.exports=router;