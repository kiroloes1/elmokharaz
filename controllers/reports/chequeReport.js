const Cheque = require('../../models/money/cheque');
const {
  buildDateRangeFilter,
  toObjectId,
  addIfPresent,
  parsePagination,
} = require('../../utils/reportUtils');

exports.Cheque= async (req, res) => {
  try {
    const { from, to, status, location, module, moneyFlow, customer, supplier } = req.query;
    const filter = buildDateRangeFilter('dueDate', from, to);
    addIfPresent(filter, 'status', status);
    addIfPresent(filter, 'location', location);
    addIfPresent(filter, 'module', module);
    addIfPresent(filter, 'moneyFlow', moneyFlow);
    addIfPresent(filter, 'customer', customer, toObjectId);
    addIfPresent(filter, 'supplier', supplier, toObjectId);
    const { page, limit, skip } = parsePagination(req.query);

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const [detail, total, agg, byStatus, byMoneyFlow, upcomingDue] = await Promise.all([
      Cheque.find(filter)
        .sort({ dueDate: 1 })
        .skip(skip)
        .limit(limit)
        .populate('customer', 'name phone')
        .populate('supplier', 'name phone')
        .lean(),

      Cheque.countDocuments(filter),

      Cheque.aggregate([
        { $match: filter },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),

      Cheque.aggregate([
        { $match: filter },
        { $group: { _id: '$status', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { totalAmount: -1 } },
      ]),

      Cheque.aggregate([
        { $match: filter },
        { $group: { _id: '$moneyFlow', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),

      Cheque.countDocuments({
        ...filter,
        status: 'under_collection',
        dueDate: { $lte: sevenDaysFromNow },
      }),
    ]);

    const summary = {
      totalAmount: agg[0]?.totalAmount || 0,
      count: agg[0]?.count || 0,
      byStatus,
      byMoneyFlow,
      upcomingDueWithin7Days: upcomingDue,
    };

    res.json({
      summary,
      detail,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير الشيكات', error: err.message });
  }
};

