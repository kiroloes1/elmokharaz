const mongoose = require("mongoose");

const ActivityLog = require("../../models/activationLogs");

const { getPagination, buildDateMatch, paginatedResponse } = require("../../utils/reportHelpers");

/**
 * GET /api/reports/users/most-active
 * اكتر يوزر نشط على السيستم (حسب عدد العمليات المسجلة في ActivityLog)
 *
 * Query params:
 *  page, limit
 *  sortBy: actionsCount | lastActionDate   (default: actionsCount)
 *  sortOrder: asc | desc                   (default: desc)
 *  section: فلترة بقسم معين (زي "customers", "cheques"...)
 *  action: فلترة بنوع العملية (create, update, delete...)
 *  dateFrom, dateTo: فلترة حسب تاريخ العملية (createdAt)
 */
exports.getMostActiveUsersReport = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "actionsCount",
      sortOrder = "desc",
      section,
      action,
      dateFrom,
      dateTo,
    } = req.query;

    const { pageNum, limitNum, skip } = getPagination(page, limit);
    const sortDir = sortOrder === "asc" ? 1 : -1;
    const dateMatch = buildDateMatch(dateFrom, dateTo, "createdAt");

    const match = { ...dateMatch };
    if (section) match.section = section;
    if (action) match.action = action;

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: "$user",
          actionsCount: { $sum: 1 },
          lastActionDate: { $max: "$createdAt" },
          sectionsTouched: { $addToSet: "$section" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          username: "$userInfo.username",
          role: "$userInfo.role",
          actionsCount: 1,
          lastActionDate: 1,
          sectionsTouched: 1,
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

    const result = await ActivityLog.aggregate(pipeline);
    const data = result[0].data;
    const totalItems = result[0].totalCount[0] ? result[0].totalCount[0].count : 0;

    return paginatedResponse({ res, pageNum, limitNum, totalItems, data });
  } catch (error) {
    console.error("getMostActiveUsersReport error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب تقرير نشاط المستخدمين",
      error: error.message,
    });
  }
};

/**
 * GET /api/reports/users/:id/activity
 * سجل نشاط يوزر معين بالتفصيل مع فلترة و pagination
 *
 * Query params:
 *  page, limit, section, action, dateFrom, dateTo
 */
exports.getUserActivityDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 30, section, action, dateFrom, dateTo } = req.query;
    const { pageNum, limitNum, skip } = getPagination(page, limit);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "معرف المستخدم غير صالح" });
    }

    const dateMatch = buildDateMatch(dateFrom, dateTo, "createdAt");
    const match = { user: new mongoose.Types.ObjectId(id), ...dateMatch };
    if (section) match.section = section;
    if (action) match.action = action;

    const totalItems = await ActivityLog.countDocuments(match);
    const data = await ActivityLog.find(match).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean();

    return paginatedResponse({ res, pageNum, limitNum, totalItems, data });
  } catch (error) {
    console.error("getUserActivityDetails error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ اثناء جلب نشاط المستخدم",
      error: error.message,
    });
  }
};
