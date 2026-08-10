
const Maintenance = require('../../models/purchase/equipment/maintenance');
const {
  buildDateRangeFilter,
  toObjectId,
  addIfPresent,
  parsePagination,
} = require('../../utils/reportUtils');


exports.Maintenance=async (req, res) => {
  try {
    const { from, to, supplier, paymentStatus, maintenanceProvider } = req.query;
    const filter = buildDateRangeFilter('purchaseDate', from, to);
    addIfPresent(filter, 'supplier', supplier, toObjectId);
    addIfPresent(filter, 'paymentStatus', paymentStatus);
    addIfPresent(filter, 'maintenanceProvider', maintenanceProvider, (v) => new RegExp(v, 'i'));
    const { page, limit, skip } = parsePagination(req.query);

    const [detail, total, agg, byStatus, byProvider] = await Promise.all([
      Maintenance.find(filter)
        .sort({ purchaseDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('supplier', 'name phone')
        .populate('equipment', 'invoiceNumber')
        .lean(),

      Maintenance.countDocuments(filter),

      Maintenance.aggregate([
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

      Maintenance.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$paymentStatus',
            totalAmount: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
      ]),

      Maintenance.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$maintenanceProvider',
            totalAmount: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]),
    ]);

    const summary = {
      count: agg[0]?.count || 0,
      totalAmount: agg[0]?.totalAmount || 0,
      paidAmount: agg[0]?.paidAmount || 0,
      remainingAmount: agg[0]?.remainingAmount || 0,
      byPaymentStatus: byStatus,
      byProvider,
    };

    res.json({
      summary,
      detail,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير الصيانة', error: err.message });
  }
};

