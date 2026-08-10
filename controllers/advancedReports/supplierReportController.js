const mongoose = require("mongoose");

// عدّل المسارات دي حسب مكان الموديلز عندك فعليًا
const Supplier = require("../../models/peapole/supplier");
const BagPurchase = require("../../models/purchase/bag/BagPurchase");
const PurchaseInvoice = require("../../models/purchase/equipment/equipment"); // equipment.js -> model "PurchaseInvoice"
const EquipmentSupply = require("../../models/purchase/equipment/EquipmentSupply");
const Maintenance = require("../../models/purchase/equipment/maintenance");
const WirePurchase = require("../../models/purchase/wire/wirePurchase");

const { getPagination, buildDateMatch, paginatedResponse } = require("../../utils/reportHelpers");

/**
 * GET /api/reports/suppliers
 * تقرير الموردين (التجار) الشامل:
 *  - balance: المديونية الحالية (من موديل Supplier نفسه)
 *  - totalPurchased: اجمالي المشتريات منه (من كل الموديولز: شكاير - معدات - مستلزمات - صيانة - سلك)
 *  - transactionsCount: عدد العمليات (مقياس "أنشط تاجر")
 *
 * Query params:
 *  page, limit
 *  sortBy: balance | totalPurchased | transactionsCount | name   (default: balance)
 *  sortOrder: asc | desc                                          (default: desc)
 *  name: بحث باسم المورد
 *  dateFrom, dateTo: فلترة المشتريات حسب تاريخ الشراء (purchaseDate)
 */
exports.getSuppliersReport = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "balance",
      sortOrder = "desc",
      name = "",
      dateFrom,
      dateTo,
    } = req.query;

    const { pageNum, limitNum, skip } = getPagination(page, limit);
    const sortDir = sortOrder === "asc" ? 1 : -1;
    const dateMatch = buildDateMatch(dateFrom, dateTo, "purchaseDate");

    const project = { supplier: 1, totalAmount: 1, purchaseDate: 1, _id: 0 };

    // تجميع كل المشتريات من كل الموديولز اللي فيها supplier + totalAmount
    const purchasesAgg = await BagPurchase.aggregate([
      { $match: dateMatch },
      { $project: project },
      {
        $unionWith: {
          coll: PurchaseInvoice.collection.name,
          pipeline: [{ $match: dateMatch }, { $project: project }],
        },
      },
      {
        $unionWith: {
          coll: EquipmentSupply.collection.name,
          pipeline: [{ $match: dateMatch }, { $project: project }],
        },
      },
      {
        $unionWith: {
          coll: Maintenance.collection.name,
          pipeline: [{ $match: dateMatch }, { $project: project }],
        },
      },
      {
        $unionWith: {
          coll: WirePurchase.collection.name,
          pipeline: [{ $match: dateMatch }, { $project: project }],
        },
      },
      {
        $group: {
          _id: "$supplier",
          totalPurchased: { $sum: "$totalAmount" },
          transactionsCount: { $sum: 1 },
          lastTransactionDate: { $max: "$purchaseDate" },
        },
      },
    ]);

    const purchaseMap = new Map(purchasesAgg.map((p) => [String(p._id), p]));

    const supplierFilter = {};
    if (name && name.trim() !== "") {
      supplierFilter.name = { $regex: name.trim(), $options: "i" };
    }

    const suppliers = await Supplier.find(supplierFilter).lean();

    let merged = suppliers.map((s) => {
      const stats = purchaseMap.get(String(s._id));
      return {
        _id: s._id,
        name: s.name,
        phone: s.phone,
        balance: s.balance || 0,
        totalPurchased: stats ? stats.totalPurchased : 0,
        transactionsCount: stats ? stats.transactionsCount : 0,
        lastTransactionDate: stats ? stats.lastTransactionDate : null,
      };
    });

    // لو فيه فلترة تاريخ، اعرض بس اللي عندهم عمليات في المدة دي
    if (dateFrom || dateTo) {
      merged = merged.filter((m) => m.transactionsCount > 0);
    }

    merged.sort((a, b) => {
      if (sortBy === "name") {
        return sortDir === 1
          ? a.name.localeCompare(b.name, "ar")
          : b.name.localeCompare(a.name, "ar");
      }
      return sortDir === 1 ? (a[sortBy] || 0) - (b[sortBy] || 0) : (b[sortBy] || 0) - (a[sortBy] || 0);
    });

    const totalItems = merged.length;
    const data = merged.slice(skip, skip + limitNum);

    return paginatedResponse({ res, pageNum, limitNum, totalItems, data });
  } catch (error) {
    console.error("getSuppliersReport error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب تقرير الموردين",
      error: error.message,
    });
  }
};

/**
 * GET /api/reports/suppliers/:id/transactions
 * كشف حساب مورد معين: كل فواتيره من كل الموديولز مجمّعة، مع فلترة تاريخ و pagination
 */
exports.getSupplierTransactionsDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, dateFrom, dateTo } = req.query;
    const { pageNum, limitNum, skip } = getPagination(page, limit);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "معرف المورد غير صالح" });
    }

    const supplierId = new mongoose.Types.ObjectId(id);
    const dateMatch = buildDateMatch(dateFrom, dateTo, "purchaseDate");
    const match = { supplier: supplierId, ...dateMatch };

    const project = {
      supplier: 1,
      totalAmount: 1,
      paidAmount: 1,
      remainingAmount: 1,
      purchaseDate: 1,
      invoiceNumber: 1,
      paymentStatus: 1,
    };

    const result = await BagPurchase.aggregate([
      { $match: match },
      { $project: { ...project, module: { $literal: "bag" } } },
      {
        $unionWith: {
          coll: PurchaseInvoice.collection.name,
          pipeline: [{ $match: match }, { $project: { ...project, module: { $literal: "equipment" } } }],
        },
      },
      {
        $unionWith: {
          coll: EquipmentSupply.collection.name,
          pipeline: [{ $match: match }, { $project: { ...project, module: { $literal: "equipment_supply" } } }],
        },
      },
      {
        $unionWith: {
          coll: Maintenance.collection.name,
          pipeline: [{ $match: match }, { $project: { ...project, module: { $literal: "maintenance" } } }],
        },
      },
      {
        $unionWith: {
          coll: WirePurchase.collection.name,
          pipeline: [{ $match: match }, { $project: { ...project, module: { $literal: "wire" } } }],
        },
      },
      { $sort: { purchaseDate: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limitNum }],
          totalCount: [{ $count: "count" }],
        },
      },
    ]);

    const data = result[0].data;
    const totalItems = result[0].totalCount[0] ? result[0].totalCount[0].count : 0;

    return paginatedResponse({ res, pageNum, limitNum, totalItems, data });
  } catch (error) {
    console.error("getSupplierTransactionsDetails error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب كشف حساب المورد",
      error: error.message,
    });
  }
};
