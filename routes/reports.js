const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);
const { role } = require(`${__dirname}/../middlewares/authorization`);

// استيراد متحكمات التقارير
const paymentReport = require(`${__dirname}/../controllers/reports/paymentReport`);
const supplierReport = require(`${__dirname}/../controllers/reports/supplierReport`);
const transactionReport = require(`${__dirname}/../controllers/reports/transactionReport`);
const wirePurchaseReport = require(`${__dirname}/../controllers/reports/wirePurchaseReport`);
const wireTypeReport = require(`${__dirname}/../controllers/reports/wireTypeReport`);
const bagTypeReport = require(`${__dirname}/../controllers/reports/bagTypeReport`);
const maintenanceReport = require(`${__dirname}/../controllers/reports/maintenanceReport`);
const equipmentReport = require(`${__dirname}/../controllers/reports/equipmentReport`);
const equipmentPartReport = require(`${__dirname}/../controllers/reports/equipmentPartReport`);
const equipmentSupplyReport = require(`${__dirname}/../controllers/reports/equipmentSupplyReport`);
const bagReport = require(`${__dirname}/../controllers/reports/bagPurchaseReport`);
const itemReport = require(`${__dirname}/../controllers/reports/itemReport`);
const outDeliveryReport = require(`${__dirname}/../controllers/reports/outDeliveryReport`);
const chequeReport = require(`${__dirname}/../controllers/reports/chequeReport`);
const customerReport = require(`${__dirname}/../controllers/reports/customerReport`);
const expenseReport=require(`${__dirname}/../controllers/reports/expenseReport`)

// Controller التقرير الشامل الجديد
const comprehensiveReportController = require("../controllers/advancedReports/normalreport");
// الحماية والتحقق من الصلاحيات
router.use(authMiddleware.protected);
router.use(role("superadmin", "manager")); // يسمح فقط للـ superadmin و manager

// ========================== GET ROUTES ==========================

// 1. تقارير المدفوعات والتحصيلات
router.get("/payment", paymentReport.Payment );

// ============ التقرير الشامل (صفحة واحدة) ============
router.get("/comprehensive", comprehensiveReportController.getComprehensiveReport);
// 2. تقارير العملاء والتجار
router.get("/customer", customerReport.Customer );
router.get("/supplier", supplierReport.Supplier );

// 3. تقارير المعاملات والخزنة والمصروفات والشيكات
router.get("/transaction", transactionReport.Transaction );
router.get("/expense", expenseReport.getExpenseReport );
router.get("/cheque", chequeReport.Cheque );

// 4. تقارير النقل والأصناف
router.get("/items", itemReport.Item );
router.get("/out-delivery", outDeliveryReport.OutDeliver );

// 5. تقارير المعدات وقطع الغيار والمستلزمات والصيانة
router.get("/equipment", equipmentReport.PurchaseInvoice );
router.get("/equipment-part", equipmentPartReport.EqupimnetPart );
router.get("/equipment-supply", equipmentSupplyReport.EquipmentSupply );
router.get("/maintenance", maintenanceReport.Maintenance);

// 6. تقارير الأسلاك والشكاير
router.get("/wire-purchase", wirePurchaseReport.WirePurchase );
router.get("/wire-type", wireTypeReport.WireType );
router.get("/bag-purchase", bagReport.BagPurchase);
router.get("/bag-type", bagTypeReport.BagType);

// ================================================================

module.exports = router;