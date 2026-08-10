const ActivityLog = require(`${__dirname}/../models/activationLogs`);



exports.getActivityLogs = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      section = "",
      action = "",
      fromDate,
      toDate,
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    const filter = {};

    if (section) filter.section = section;
    if (action) filter.action = action;

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (search) {
      filter.$or = [
        { section: { $regex: search, $options: "i" } },
        { action: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { details: { $regex: search, $options: "i" } },
      ];
    }

    const total = await ActivityLog.countDocuments(filter);

    const logs = await ActivityLog.find(filter)
      .populate("user", "username email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


exports.getActions = async (req, res) => {
  try {
    const actions = await ActivityLog.distinct("action");

    res.json({
      success: true,
      actions: actions.sort((a, b) => a.localeCompare(b, "ar"))
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.deleteAll = async (req, res) => {
  try {
    const result = await ActivityLog.deleteMany({});

    res.status(200).json({
      success: true,
      message: "تم حذف جميع السجلات بنجاح",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.deleteWithinRange = async (req, res) => {
  try {
    const { range = 2 } = req.body; 

    const date = new Date();
    date.setDate(date.getDate() - Number(range));

    const result = await ActivityLog.deleteMany({
      createdAt: {
        $lt: date,
      },
    });

    res.status(200).json({
      success: true,
      message: `تم حذف جميع السجلات الأقدم من ${range} يوم`,
      deletedCount: result.deletedCount,
      keepFrom: date,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// to excel sheet

exports.getActivityLogsToExcelSheets = async (req, res) => {
  try {


    const logs = await ActivityLog.find()
      .populate("user", "username email")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      logs,

    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

