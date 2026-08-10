const mongoose = require("mongoose");

const Customer = require("../../models/peapole/customer");
const OutDeliver = require("../../models/delivery/outDelivery");

const { getPagination, buildDateMatch, paginatedResponse } = require("../../utils/reportHelpers");

/**
 * ملحوظة مهمة: في موديل outDelivery.js حقل "supplier" هو فعليًا بيرجع لـ "Customer"
 * (ref: 'Customer') - يعني ده معرف العميل مش المورد. اتعاملنا معاه على أساس ده هنا.
 */

/**
 * GET /api/reports/customers
 * تقرير العملاء الشامل:
 *  - balance: المديونية الحالية
 *  - totalSold: اجمالي اللي اشتراه العميل مننا (من نقلات outDelivery)
 *  - transactionsCount: عدد النقلات (مقياس "أنشط عميل")
 *
 * Query params:
 *  page, limit
 *  sortBy: balance | totalSold | transactionsCount | name   (default: balance)
 *  sortOrder: asc | desc                                     (default: desc)
 *  name: بحث باسم العميل
 *  dateFrom, dateTo: فلترة حسب تاريخ النقلة (deliveryDate)
 */
exports.getCustomersReport = async (req, res) => {
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
    const dateMatch = buildDateMatch(dateFrom, dateTo, "deliveryDate");

    const salesAgg = await OutDeliver.aggregate([
      { $match: dateMatch },
      {
        $group: {
          _id: "$supplier", // ده في الحقيقة معرف العميل (Customer)
          totalSold: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          totalRemaining: { $sum: "$remainingAmount" },
          transactionsCount: { $sum: 1 },
          lastTransactionDate: { $max: "$deliveryDate" },
        },
      },
    ]);

    const salesMap = new Map(salesAgg.map((s) => [String(s._id), s]));

    const customerFilter = {};
    if (name && name.trim() !== "") {
      customerFilter.name = { $regex: name.trim(), $options: "i" };
    }

    const customers = await Customer.find(customerFilter).lean();

    let merged = customers.map((c) => {
      const stats = salesMap.get(String(c._id));
      return {
        _id: c._id,
        name: c.name,
        phone: c.phone,
        balance: c.balance || 0,
        totalSold: stats ? stats.totalSold : 0,
        totalPaid: stats ? stats.totalPaid : 0,
        totalRemaining: stats ? stats.totalRemaining : 0,
        transactionsCount: stats ? stats.transactionsCount : 0,
        lastTransactionDate: stats ? stats.lastTransactionDate : null,
      };
    });

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
    console.error("getCustomersReport error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب تقرير العملاء",
      error: error.message,
    });
  }
};

/**
 * GET /api/reports/customers/:id/transactions
 * كشف حساب عميل معين (كل النقلات) مع فلترة تاريخ و pagination
 */
exports.getCustomerTransactionsDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, dateFrom, dateTo } = req.query;
    const { pageNum, limitNum, skip } = getPagination(page, limit);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "معرف العميل غير صالح" });
    }

    const dateMatch = buildDateMatch(dateFrom, dateTo, "deliveryDate");
    const match = { supplier: new mongoose.Types.ObjectId(id), ...dateMatch };

    const totalItems = await OutDeliver.countDocuments(match);
    const data = await OutDeliver.find(match)
      .sort({ deliveryDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("receivedBy", "username")
      .lean();

    return paginatedResponse({ res, pageNum, limitNum, totalItems, data });
  } catch (error) {
    console.error("getCustomerTransactionsDetails error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب كشف حساب العميل",
      error: error.message,
    });
  }
};
