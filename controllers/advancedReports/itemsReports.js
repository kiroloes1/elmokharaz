const mongoose = require("mongoose");
const OutDeliver = require("../../models/delivery/outDelivery"); // عدّل المسار حسب مكان الموديل عندك
const Item = require("../../models/delivery/items");             // عدّل المسار حسب مكان الموديل عندك

/**
 * تقرير الأصناف
 * GET /reports/items
 *
 * Query params (اختيارية):
 *  - dateFrom, dateTo : فلترة بفترة تاريخ التسليم (deliveryDate)
 *  - itemId           : لو عايز تفاصيل صنف واحد بس
 *  - sortBy           : totalWeight | totalQuantity | deliveriesCount | totalPrice (افتراضي totalWeight)
 *  - sortOrder        : asc | desc (افتراضي desc)
 *  - page, limit       : ترقيم صفحي (افتراضي 1 / 20)
 */
exports.getItemsReport = async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      itemId,
      sortBy = "totalWeight",
      sortOrder = "desc",
      page = 1,
      limit = 20,
    } = req.query;

    // ===== بناء فلتر التاريخ على مستوى النقلات =====
    const dateMatch = {};
    if (dateFrom || dateTo) {
      dateMatch.deliveryDate = {};
      if (dateFrom) dateMatch.deliveryDate.$gte = new Date(dateFrom);
      if (dateTo) {
        // نضيف نهاية اليوم عشان الفلتر يغطي اليوم كامل
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        dateMatch.deliveryDate.$lte = to;
      }
    }

    const matchStage = { ...dateMatch };

    const pipeline = [
      { $match: matchStage },
      { $unwind: "$items" },
    ];

    // فلتر صنف معين لو مطلوب
    if (itemId) {
      pipeline.push({
        $match: { "items.item": new mongoose.Types.ObjectId(itemId) },
      });
    }

    pipeline.push(
      {
        $group: {
          _id: "$items.item",
          deliveriesCount: { $sum: 1 }, // عدد مرات ورود الصنف في نقلات مختلفة
          totalQuantity: {
            $sum: {
              $sum: {
                $map: {
                  input: "$items.batches",
                  as: "b",
                  in: "$$b.quantity",
                },
              },
            },
          },
          totalWeight: { $sum: "$items.totalWeight" },
          totalReturnWeight: {
            $sum: { $add: ["$items.returnWeight", "$items.oldReturnWeight"] },
          },
          totalPrice: { $sum: "$items.totalPrice" },
          totalReturnPrice: { $sum: "$items.totalReturnPrice" },
          totalDiscount: { $sum: "$items.discount" },
          avgPricePerKg: { $avg: "$items.pricePerKg" },
        },
      },
      {
        $lookup: {
          from: "items", // اسم الكولكشن الفعلي بتاع موديل Item (افتراضيًا جمع اسم الموديل)
          localField: "_id",
          foreignField: "_id",
          as: "itemInfo",
        },
      },
      { $unwind: { path: "$itemInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          itemId: "$_id",
          itemName: { $ifNull: ["$itemInfo.name", "صنف محذوف"] },
          deliveriesCount: 1,
          totalQuantity: 1,
          totalWeight: { $round: ["$totalWeight", 2] },
          totalReturnWeight: { $round: ["$totalReturnWeight", 2] },
          totalPrice: { $round: ["$totalPrice", 2] },
          totalReturnPrice: { $round: ["$totalReturnPrice", 2] },
          totalDiscount: { $round: ["$totalDiscount", 2] },
          avgPricePerKg: { $round: ["$avgPricePerKg", 2] },
        },
      }
    );

    // ===== الترتيب =====
    const allowedSortFields = [
      "totalWeight",
      "totalQuantity",
      "deliveriesCount",
      "totalPrice",
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "totalWeight";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    pipeline.push({ $sort: { [sortField]: sortDirection } });

    // ===== إجمالي عدد النتائج (قبل الباجينيشن) =====
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await OutDeliver.aggregate(countPipeline);
    const totalItems = countResult[0]?.total || 0;

    // ===== الباجينيشن =====
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    pipeline.push({ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum });

    const data = await OutDeliver.aggregate(pipeline);

    // ===== أكتر صنف جاي (بدون فلتر itemId عشان يمثل الصورة العامة) =====
    let topItem = null;
    if (!itemId) {
      topItem = data.length > 0 ? data[0] : null;
    }

    return res.status(200).json({
      success: true,
      data,
      topItem: sortField === "totalWeight" || sortField === "deliveriesCount" ? topItem : undefined,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalItems,
        totalPages: Math.ceil(totalItems / limitNum),
      },
    });
  } catch (err) {
    console.error("getItemsReport error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "حدث خطأ أثناء إعداد تقرير الأصناف",
    });
  }
};

/**
 * ملخص سريع لأعلى صنف (الأكثر ورودًا/وزنًا) - كارت مستقل لو محتاجه في الواجهة
 * GET /reports/items/top
 */
exports.getTopItem = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    const dateMatch = {};
    if (dateFrom || dateTo) {
      dateMatch.deliveryDate = {};
      if (dateFrom) dateMatch.deliveryDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        dateMatch.deliveryDate.$lte = to;
      }
    }

    const result = await OutDeliver.aggregate([
      { $match: dateMatch },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.item",
          deliveriesCount: { $sum: 1 },
          totalWeight: { $sum: "$items.totalWeight" },
        },
      },
      { $sort: { totalWeight: -1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: "items",
          localField: "_id",
          foreignField: "_id",
          as: "itemInfo",
        },
      },
      { $unwind: { path: "$itemInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          itemId: "$_id",
          itemName: { $ifNull: ["$itemInfo.name", "صنف محذوف"] },
          deliveriesCount: 1,
          totalWeight: { $round: ["$totalWeight", 2] },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: result[0] || null,
    });
  } catch (err) {
    console.error("getTopItem error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "حدث خطأ أثناء جلب أكثر صنف وارد",
    });
  }
};