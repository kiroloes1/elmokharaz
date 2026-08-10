const Transaction = require('../../models/money/TransactionBox');
const {
  buildDateRangeFilter,
  addIfPresent,
  parsePagination,
} = require('../../utils/reportUtils');

exports.Transaction=async (req, res) => {
  try {
    const { from, to, type } = req.query;
    const filter = buildDateRangeFilter('date', from, to);
    addIfPresent(filter, 'type', type);
    const { page, limit, skip } = parsePagination(req.query);

    const [detail, total, byType, byCategory] = await Promise.all([
      Transaction.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .populate('supplierId', 'name')
        .populate('customerId', 'name')
        .lean(),

      Transaction.countDocuments(filter),

      Transaction.aggregate([
        { $match: filter },
        { $group: { _id: '$type', totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),

      Transaction.aggregate([
        { $match: filter },
        { $unwind: '$items' },
        {
          $group: {
            _id: { type: '$type', category: '$items.category' },
            totalAmount: { $sum: '$items.amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]),
    ]);

    const totalIncome = byType.find((t) => t._id === 'income')?.totalAmount || 0;
    const totalExpense = byType.find((t) => t._id === 'expense')?.totalAmount || 0;

    const summary = {
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      count: byType.reduce((s, t) => s + t.count, 0),
      byType,
      byCategory,
    };

    res.json({
      summary,
      detail,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير الخزينة (المعاملات)', error: err.message });
  }
};

