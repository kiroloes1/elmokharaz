const express = require("express");
const router = express.Router();

// عدّل الميدل وير حسب الأوث بتاعك (تحقق تسجيل الدخول / الصلاحيات)
// const { protect, allowRoles } = require("../middleware/auth");

const supplierReportController = require("../controllers/advancedReports/supplierReportController");
const customerReportController = require("../controllers/advancedReports/customerReportController");
const equipmentReportController = require("../controllers/advancedReports/equipmentReportController");
const chequeReportController = require("../controllers/advancedReports/chequeReportController");
const userActivityReportController = require("../controllers/advancedReports/userActivityReportController");
const itemsReportController =require("../controllers/advancedReports/itemsReports")
const deliveriesReportController =require("../controllers/advancedReports/deliveryreport")



const {role}= require(`${__dirname}/../middlewares/authorization`) 
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`); 
const authorizationMiddleware = require(`${__dirname}/../middlewares/authorization`);

// الحماية والتحقق من الصلاحيات
router.use(authMiddleware.protected);
router.use(role("superadmin", "manager")); // يسمح فقط للـ superadmin و manager

// ============ الموردين (التجار) ============
router.get("/suppliers", supplierReportController.getSuppliersReport);
router.get("/suppliers/:id/transactions", supplierReportController.getSupplierTransactionsDetails);

// ============ العملاء ============
router.get("/customers", customerReportController.getCustomersReport);
router.get("/customers/:id/transactions", customerReportController.getCustomerTransactionsDetails);

// ============ المعدات ============
router.get("/equipment/maintenance", equipmentReportController.getMaintenanceReport);
router.get("/equipment/supplies", equipmentReportController.getEquipmentSupplyReport);
router.get("/equipment/consumption-summary", equipmentReportController.getEquipmentConsumptionSummary);

// ============ الشيكات ============
router.get("/cheques", chequeReportController.getChequesList);
router.get("/cheques/by-bank", chequeReportController.getChequesByBankReport);
router.get("/cheques/by-trader", chequeReportController.getChequesByTraderReport);

// ============ نشاط المستخدمين ============
router.get("/users/most-active", userActivityReportController.getMostActiveUsersReport);
router.get("/users/:id/activity", userActivityReportController.getUserActivityDetails);


router.get("/items", itemsReportController.getItemsReport);
router.get("/items/top", itemsReportController.getTopItem);
router.get("/deliveries", deliveriesReportController.getDeliveriesReport);
router.get("/deliveries/by-supplier", deliveriesReportController.getDeliveriesBySupplier);

module.exports = router;
