const mongoose = require("mongoose");
const OutDeliver = require("../../models/delivery/outDelivery"); // عدّل المسار حسب مكان الموديل عندك

/**
 * تقرير النقلات
 * GET /reports/deliveries
 *
 * Query params (اختيارية):
 *  - dateFrom, dateTo : فلترة بفترة تاريخ التسليم (deliveryDate)
 *  - supplierId       : فلترة بتاجر معين
 *  - carName          : بحث باسم السائق/العربية
 *  - page, limit       : ترقيم صفحي (افتراضي 1 / 10)
 *  - sortBy            : deliveryDate | totalAmount | remainingAmount (افتراضي deliveryDate)
 *  - sortOrder         : asc | desc (افتراضي desc)
 */


exports.getDeliveriesReport = async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      supplierId,
      carName,
      page = 1,
      limit = 10,
      sortBy = "deliveryDate",
      sortOrder = "desc",
    } = req.query;

    // ===== بناء الفلاتر =====
    const match = {};

    if (dateFrom || dateTo) {
      match.deliveryDate = {};
      if (dateFrom) match.deliveryDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        match.deliveryDate.$lte = to;
      }
    }

    if (supplierId) {
      match.supplier = new mongoose.Types.ObjectId(supplierId);
    }

    if (carName) {
      match.carName = { $regex: carName, $options: "i" };
    }

    const allowedSortFields = ["deliveryDate", "totalAmount", "remainingAmount"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "deliveryDate";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));

    // ===== قائمة النقلات (مع بيانات التاجر) =====
    const [deliveries, totalCount, summary] = await Promise.all([
      OutDeliver.find(match)
        .populate("supplier", "name phone")
        .populate("receivedBy", "name")
        .sort({ [sortField]: sortDirection })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),

      OutDeliver.countDocuments(match),

      // ===== ملخص إحصائي شامل حسب نفس الفلتر =====
      OutDeliver.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            deliveriesCount: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
            totalPaid: { $sum: "$paidAmount" },
            totalRemaining: { $sum: "$remainingAmount" },
            totalTeaForWorkers: { $sum: "$teaForWorkers" },
            totalCarPayment: { $sum: "$carPayment" },
            avgAmountPerDelivery: { $avg: "$totalAmount" },
          },
        },
        {
          $project: {
            _id: 0,
            deliveriesCount: 1,
            totalAmount: { $round: ["$totalAmount", 2] },
            totalPaid: { $round: ["$totalPaid", 2] },
            totalRemaining: { $round: ["$totalRemaining", 2] },
            totalTeaForWorkers: { $round: ["$totalTeaForWorkers", 2] },
            totalCarPayment: { $round: ["$totalCarPayment", 2] },
            avgAmountPerDelivery: { $round: ["$avgAmountPerDelivery", 2] },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: deliveries,
      summary: summary[0] || {
        deliveriesCount: 0,
        totalAmount: 0,
        totalPaid: 0,
        totalRemaining: 0,
        totalTeaForWorkers: 0,
        totalCarPayment: 0,
        avgAmountPerDelivery: 0,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (err) {
    console.error("getDeliveriesReport error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "حدث خطأ أثناء إعداد تقرير النقلات",
    });
  }
};

/**
 * تقرير النقلات مجمّع حسب التاجر (اختياري - مفيد لو عايز "تفصيل حسب التاجر")
 * GET /reports/deliveries/by-supplier
 */
exports.getDeliveriesBySupplier = async (req, res) => {
  try {
    const { dateFrom, dateTo, sortBy = "totalAmount", sortOrder = "desc" } = req.query;

    const match = {};
    if (dateFrom || dateTo) {
      match.deliveryDate = {};
      if (dateFrom) match.deliveryDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        match.deliveryDate.$lte = to;
      }
    }

    const allowedSortFields = ["totalAmount", "deliveriesCount", "totalRemaining"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "totalAmount";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const result = await OutDeliver.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$supplier",
          deliveriesCount: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          totalRemaining: { $sum: "$remainingAmount" },
        },
      },
      {
        $lookup: {
          from: "customers", // اسم الكولكشن الفعلي بتاع موديل Customer
          localField: "_id",
          foreignField: "_id",
          as: "supplierInfo",
        },
      },
      { $unwind: { path: "$supplierInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          supplierId: "$_id",
          supplierName: { $ifNull: ["$supplierInfo.name", "تاجر محذوف"] },
          supplierPhone: "$supplierInfo.phone",
          deliveriesCount: 1,
          totalAmount: { $round: ["$totalAmount", 2] },
          totalPaid: { $round: ["$totalPaid", 2] },
          totalRemaining: { $round: ["$totalRemaining", 2] },
        },
      },
      { $sort: { [sortField]: sortDirection } },
    ]);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("getDeliveriesBySupplier error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "حدث خطأ أثناء إعداد تقرير النقلات حسب التاجر",
    });
  }
};