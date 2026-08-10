const PurchaseInvoice = require('../../models/purchase/equipment/equipment');
const {
  buildDateRangeFilter,
  toObjectId,
  addIfPresent,
  parsePagination,
} = require('../../utils/reportUtils');


exports.PurchaseInvoice= async (req, res) => {
  try {
    const { from, to, supplier, paymentStatus } = req.query;
    const filter = buildDateRangeFilter('purchaseDate', from, to);
    addIfPresent(filter, 'supplier', supplier, toObjectId);
    addIfPresent(filter, 'paymentStatus', paymentStatus);
    const { page, limit, skip } = parsePagination(req.query);

    const [detail, total, agg, byStatus] = await Promise.all([
      PurchaseInvoice.find(filter)
        .sort({ purchaseDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('supplier', 'name phone')
        .populate('receivedBy', 'name')
        .lean(),

      PurchaseInvoice.countDocuments(filter),

      PurchaseInvoice.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
            paidAmount: { $sum: '$paidAmount' },
            remainingAmount: { $sum: '$remainingAmount' },
          },
        },
      ]),

      PurchaseInvoice.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$paymentStatus',
            totalAmount: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const summary = {
      count: agg[0]?.count || 0,
      totalAmount: agg[0]?.totalAmount || 0,
      paidAmount: agg[0]?.paidAmount || 0,
      remainingAmount: agg[0]?.remainingAmount || 0,
      byPaymentStatus: byStatus,
    };

    res.json({
      summary,
      detail,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير شراء المعدات', error: err.message });
  }
};
