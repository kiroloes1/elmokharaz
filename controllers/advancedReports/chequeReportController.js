const mongoose = require("mongoose");

const Cheque = require("../../models/money/cheque");

const { getPagination, buildDateMatch, paginatedResponse } = require("../../utils/reportHelpers");

/**
 * GET /api/reports/cheques/by-bank
 * تقرير حسب البنك: عدد الشيكات وقيمتها، ونسبة/عدد اللي رجع (status = returned)
 *
 * Query params:
 *  page, limit
 *  sortBy: totalAmount | count | returnedCount   (default: totalAmount)
 *  sortOrder: asc | desc                          (default: desc)
 *  status: فلترة اضافية بحالة معينة
 *  dateFrom, dateTo: فلترة حسب تاريخ الاستحقاق (dueDate)
 */
exports.getChequesByBankReport = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "totalAmount",
      sortOrder = "desc",
      status,
      dateFrom,
      dateTo,
    } = req.query;

    const { pageNum, limitNum, skip } = getPagination(page, limit);
    const sortDir = sortOrder === "asc" ? 1 : -1;
    const dateMatch = buildDateMatch(dateFrom, dateTo, "dueDate");

    const match = { ...dateMatch };
    if (status) match.status = status;

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: "$bankName",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          returnedCount: { $sum: { $cond: [{ $eq: ["$status", "returned"] }, 1, 0] } },
          returnedAmount: { $sum: { $cond: [{ $eq: ["$status", "returned"] }, "$amount", 0] } },
          collectedCount: { $sum: { $cond: [{ $eq: ["$status", "collected"] }, 1, 0] } },
          underCollectionCount: { $sum: { $cond: [{ $eq: ["$status", "under_collection"] }, 1, 0] } },
        },
      },
      {
        $project: {
          bankName: "$_id",
          _id: 0,
          count: 1,
          totalAmount: 1,
          returnedCount: 1,
          returnedAmount: 1,
          collectedCount: 1,
          underCollectionCount: 1,
          returnRate: {
            $cond: [{ $eq: ["$count", 0] }, 0, { $multiply: [{ $divide: ["$returnedCount", "$count"] }, 100] }],
          },
        },
      },
      { $sort: { [sortBy]: sortDir } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limitNum }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await Cheque.aggregate(pipeline);
    const data = result[0].data;
    const totalItems = result[0].totalCount[0] ? result[0].totalCount[0].count : 0;

    return paginatedResponse({ res, pageNum, limitNum, totalItems, data });
  } catch (error) {
    console.error("getChequesByBankReport error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب تقرير الشيكات حسب البنك",
      error: error.message,
    });
  }
};

/**
 * GET /api/reports/cheques/by-trader
 * تقرير حسب التاجر (عميل/مورد): مين بيجيب شيكات اكتر وبقيمة اكبر
 *
 * Query params:
 *  page, limit
 *  sortBy: totalAmount | count   (default: totalAmount)
 *  sortOrder: asc | desc         (default: desc)
 *  moneyFlow: incoming | outgoing
 *  module: نفس enum الموجود في موديل Cheque
 *  status
 *  dateFrom, dateTo: فلترة حسب تاريخ الاستلام (receiveDate)
 */
exports.getChequesByTraderReport = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "totalAmount",
      sortOrder = "desc",
      moneyFlow,
      module: moduleFilter,
      status,
      dateFrom,
      dateTo,
    } = req.query;

    const { pageNum, limitNum, skip } = getPagination(page, limit);
    const sortDir = sortOrder === "asc" ? 1 : -1;
    const dateMatch = buildDateMatch(dateFrom, dateTo, "receiveDate");

    const match = { ...dateMatch };
    if (moneyFlow) match.moneyFlow = moneyFlow;
    if (moduleFilter) match.module = moduleFilter;
    if (status) match.status = status;

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          traderId: { $ifNull: ["$customer", "$supplier"] },
          traderType: { $cond: [{ $ifNull: ["$customer", false] }, "customer", "supplier"] },
        },
      },
      {
        $group: {
          _id: { traderId: "$traderId", traderType: "$traderType" },
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          returnedCount: { $sum: { $cond: [{ $eq: ["$status", "returned"] }, 1, 0] } },
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "_id.traderId",
          foreignField: "_id",
          as: "customerInfo",
        },
      },
      {
        $lookup: {
          from: "suppliers",
          localField: "_id.traderId",
          foreignField: "_id",
          as: "supplierInfo",
        },
      },
      {
        $addFields: {
          traderId: "$_id.traderId",
          traderType: "$_id.traderType",
          traderName: {
            $ifNull: [{ $arrayElemAt: ["$customerInfo.name", 0] }, { $arrayElemAt: ["$supplierInfo.name", 0] }],
          },
        },
      },
      { $project: { customerInfo: 0, supplierInfo: 0, _id: 0 } },
      { $sort: { [sortBy]: sortDir } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limitNum }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await Cheque.aggregate(pipeline);
    const data = result[0].data;
    const totalItems = result[0].totalCount[0] ? result[0].totalCount[0].count : 0;

    return paginatedResponse({ res, pageNum, limitNum, totalItems, data });
  } catch (error) {
    console.error("getChequesByTraderReport error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب تقرير الشيكات حسب التاجر",
      error: error.message,
    });
  }
};

/**
 * GET /api/reports/cheques
 * لستة الشيكات بكل الفلاتر (بنك - حالة - تاجر - موديول - تاريخ) مع pagination
 *
 * Query params:
 *  page, limit
 *  bankName, status, module, moneyFlow, customerId, supplierId
 *  dateFrom, dateTo: فلترة حسب dueDate
 */
exports.getChequesList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      bankName,
      status,
      module: moduleFilter,
      moneyFlow,
      customerId,
      supplierId,
      dateFrom,
      dateTo,
    } = req.query;

    const { pageNum, limitNum, skip } = getPagination(page, limit);
    const dateMatch = buildDateMatch(dateFrom, dateTo, "dueDate");

    const match = { ...dateMatch };
    if (bankName) match.bankName = { $regex: bankName, $options: "i" };
    if (status) match.status = status;
    if (moduleFilter) match.module = moduleFilter;
    if (moneyFlow) match.moneyFlow = moneyFlow;
    if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
      match.customer = new mongoose.Types.ObjectId(customerId);
    }
    if (supplierId && mongoose.Types.ObjectId.isValid(supplierId)) {
      match.supplier = new mongoose.Types.ObjectId(supplierId);
    }

    const totalItems = await Cheque.countDocuments(match);
    const data = await Cheque.find(match)
      .populate("customer", "name phone")
      .populate("supplier", "name phone")
      .sort({ dueDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    return paginatedResponse({ res, pageNum, limitNum, totalItems, data });
  } catch (error) {
    console.error("getChequesList error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب قائمة الشيكات",
      error: error.message,
    });
  }
};
