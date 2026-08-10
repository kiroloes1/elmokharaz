const mongoose = require("mongoose");

const Maintenance = require("../../models/purchase/equipment/maintenance");
const EquipmentSupply = require("../../models/purchase/equipment/EquipmentSupply");
const PurchaseInvoice = require("../../models/purchase/equipment/equipment"); // equipment.js -> model "PurchaseInvoice"

const { getPagination, buildDateMatch, paginatedResponse } = require("../../utils/reportHelpers");

/**
 * GET /api/reports/equipment/maintenance
 * اكتر معدة بتعطل (عدد مرات الصيانة) + اجمالي تكلفة الصيانة لكل معدة
 *
 * Query params:
 *  page, limit
 *  sortBy: breakdownsCount | totalCost   (default: breakdownsCount)
 *  sortOrder: asc | desc                 (default: desc)
 *  equipmentId: فلترة بمعدة معينة (Maintenance.equipment)
 *  equipmentName: بحث باسم المعدة
 *  dateFrom, dateTo: فلترة حسب تاريخ الصيانة (purchaseDate = تاريخ الارسال للصيانة)
 */
exports.getMaintenanceReport = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "breakdownsCount",
      sortOrder = "desc",
      equipmentId,
      equipmentName,
      dateFrom,
      dateTo,
    } = req.query;

    const { pageNum, limitNum, skip } = getPagination(page, limit);
    const sortDir = sortOrder === "asc" ? 1 : -1;
    const dateMatch = buildDateMatch(dateFrom, dateTo, "purchaseDate");

    const match = { ...dateMatch };
    if (equipmentId && mongoose.Types.ObjectId.isValid(equipmentId)) {
      match.equipment = new mongoose.Types.ObjectId(equipmentId);
    }
    if (equipmentName && equipmentName.trim() !== "") {
      match.equipmentName = { $regex: equipmentName.trim(), $options: "i" };
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { equipment: "$equipment", equipmentName: "$equipmentName" },
          breakdownsCount: { $sum: 1 },
          totalCost: { $sum: "$totalAmount" },
          totalPartsReplaced: { $sum: { $size: { $ifNull: ["$items", []] } } },
          lastMaintenanceDate: { $max: "$purchaseDate" },
        },
      },
      {
        $lookup: {
          from: PurchaseInvoice.collection.name,
          localField: "_id.equipment",
          foreignField: "_id",
          as: "equipmentInfo",
        },
      },
      {
        $addFields: {
          equipmentId: "$_id.equipment",
          displayName: {
            $ifNull: ["$_id.equipmentName", { $arrayElemAt: ["$equipmentInfo.items.equipmentName", 0] }],
          },
        },
      },
      { $project: { equipmentInfo: 0, _id: 0 } },
      { $sort: { [sortBy]: sortDir } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limitNum }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await Maintenance.aggregate(pipeline);
    const data = result[0].data;
    const totalItems = result[0].totalCount[0] ? result[0].totalCount[0].count : 0;

    return paginatedResponse({ res, pageNum, limitNum, totalItems, data });
  } catch (error) {
    console.error("getMaintenanceReport error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب تقرير الصيانة",
      error: error.message,
    });
  }
};

/**
 * GET /api/reports/equipment/supplies
 * اكتر معدة بتاخد قطع غيار / مستلزمات + اجمالي التكلفة
 *
 * Query params:
 *  page, limit
 *  sortBy: totalCost | ordersCount   (default: totalCost)
 *  sortOrder: asc | desc             (default: desc)
 *  equipmentName: بحث باسم المعدة
 *  dateFrom, dateTo: فلترة حسب تاريخ الشراء (purchaseDate)
 */
exports.getEquipmentSupplyReport = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "totalCost",
      sortOrder = "desc",
      equipmentName,
      dateFrom,
      dateTo,
    } = req.query;

    const { pageNum, limitNum, skip } = getPagination(page, limit);
    const sortDir = sortOrder === "asc" ? 1 : -1;
    const dateMatch = buildDateMatch(dateFrom, dateTo, "purchaseDate");

    const match = { ...dateMatch };
    if (equipmentName && equipmentName.trim() !== "") {
      match.equipmentName = { $regex: equipmentName.trim(), $options: "i" };
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: "$equipmentName",
          ordersCount: { $sum: 1 },
          totalCost: { $sum: "$totalAmount" },
          lastOrderDate: { $max: "$purchaseDate" },
        },
      },
      { $project: { equipmentName: "$_id", ordersCount: 1, totalCost: 1, lastOrderDate: 1, _id: 0 } },
      { $sort: { [sortBy]: sortDir } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limitNum }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await EquipmentSupply.aggregate(pipeline);
    const data = result[0].data;
    const totalItems = result[0].totalCount[0] ? result[0].totalCount[0].count : 0;

    return paginatedResponse({ res, pageNum, limitNum, totalItems, data });
  } catch (error) {
    console.error("getEquipmentSupplyReport error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب تقرير مستلزمات المعدات",
      error: error.message,
    });
  }
};

/**
 * GET /api/reports/equipment/consumption-summary
 * ملخص شامل: كل معدة بتستهلك كام فلوس اجمالي (صيانة + مستلزمات) مجمّعين حسب اسم المعدة
 *
 * Query params:
 *  page, limit, dateFrom, dateTo, equipmentName
 */
exports.getEquipmentConsumptionSummary = async (req, res) => {
  try {
    const { page = 1, limit = 20, dateFrom, dateTo, equipmentName } = req.query;
    const { pageNum, limitNum, skip } = getPagination(page, limit);
    const dateMatch = buildDateMatch(dateFrom, dateTo, "purchaseDate");

    const nameMatch = {};
    if (equipmentName && equipmentName.trim() !== "") {
      nameMatch.equipmentName = { $regex: equipmentName.trim(), $options: "i" };
    }

    const [maintenanceAgg, supplyAgg] = await Promise.all([
      Maintenance.aggregate([
        { $match: { ...dateMatch, ...nameMatch, equipmentName: { $exists: true, $ne: null, $ne: "" } } },
        {
          $group: {
            _id: { $toLower: { $trim: { input: "$equipmentName" } } },
            maintenanceCost: { $sum: "$totalAmount" },
            maintenanceCount: { $sum: 1 },
          },
        },
      ]),
      EquipmentSupply.aggregate([
        { $match: { ...dateMatch, ...nameMatch } },
        {
          $group: {
            _id: { $toLower: { $trim: { input: "$equipmentName" } } },
            suppliesCost: { $sum: "$totalAmount" },
            suppliesCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const map = new Map();
    maintenanceAgg.forEach((m) => {
      map.set(m._id, {
        equipmentName: m._id,
        maintenanceCost: m.maintenanceCost,
        maintenanceCount: m.maintenanceCount,
        suppliesCost: 0,
        suppliesCount: 0,
      });
    });
    supplyAgg.forEach((s) => {
      const existing = map.get(s._id);
      if (existing) {
        existing.suppliesCost = s.suppliesCost;
        existing.suppliesCount = s.suppliesCount;
      } else {
        map.set(s._id, {
          equipmentName: s._id,
          maintenanceCost: 0,
          maintenanceCount: 0,
          suppliesCost: s.suppliesCost,
          suppliesCount: s.suppliesCount,
        });
      }
    });

    let merged = Array.from(map.values()).map((m) => ({
      ...m,
      totalConsumption: m.maintenanceCost + m.suppliesCost,
    }));

    merged.sort((a, b) => b.totalConsumption - a.totalConsumption);

    const totalItems = merged.length;
    const data = merged.slice(skip, skip + limitNum);

    return paginatedResponse({ res, pageNum, limitNum, totalItems, data });
  } catch (error) {
    console.error("getEquipmentConsumptionSummary error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب ملخص استهلاك المعدات",
      error: error.message,
    });
  }
};
