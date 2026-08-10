
const Payment = require('../../models/money/payment');
const {
  buildDateRangeFilter,
  toObjectId,
  addIfPresent,
  parsePagination,
} = require('../../utils/reportUtils');


exports.Payment= async (req, res) => {
  try {
    const { from, to, moneyFlow, module, paymentMethod, customer, supplier } = req.query;
    const filter = buildDateRangeFilter('transactionDate', from, to);
    addIfPresent(filter, 'moneyFlow', moneyFlow);
    addIfPresent(filter, 'module', module);
    addIfPresent(filter, 'paymentMethod', paymentMethod);
    addIfPresent(filter, 'customer', customer, toObjectId);
    addIfPresent(filter, 'supplier', supplier, toObjectId);
    const { page, limit, skip } = parsePagination(req.query);

    const [detail, total, agg, byMoneyFlow, byMethod, byModule] = await Promise.all([
      Payment.find(filter)
        .sort({ transactionDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customer', 'name phone')
        .populate('supplier', 'name phone')
        .populate('cheque')
        .lean(),

      Payment.countDocuments(filter),

      Payment.aggregate([
        { $match: filter },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),

      Payment.aggregate([
        { $match: filter },
        { $group: { _id: '$moneyFlow', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),

      Payment.aggregate([
        { $match: filter },
        { $group: { _id: '$paymentMethod', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { totalAmount: -1 } },
      ]),

      Payment.aggregate([
        { $match: filter },
        { $group: { _id: '$module', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { totalAmount: -1 } },
      ]),
    ]);

    const summary = {
      totalAmount: agg[0]?.totalAmount || 0,
      count: agg[0]?.count || 0,
      byMoneyFlow,
      byPaymentMethod: byMethod,
      byModule,
    };

    res.json({
      summary,
      detail,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير المدفوعات', error: err.message });
  }
};
