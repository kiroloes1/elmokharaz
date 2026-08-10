const OutDeliver = require('../../models/delivery/outDelivery');
const {
  buildDateRangeFilter,
  toObjectId,
  addIfPresent,
  parsePagination,
} = require('../../utils/reportUtils');


exports.OutDeliver= async (req, res) => {
  try {
    const { from, to, supplier } = req.query;
    const filter = buildDateRangeFilter('deliveryDate', from, to);
    addIfPresent(filter, 'supplier', supplier, toObjectId);
    const { page, limit, skip } = parsePagination(req.query);

    const [detail, total, agg, bySupplier] = await Promise.all([
      OutDeliver.find(filter)
        .sort({ deliveryDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('supplier', 'name phone')
        .populate('receivedBy', 'name')
        .lean(),

      OutDeliver.countDocuments(filter),

      OutDeliver.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
            paidAmount: { $sum: '$paidAmount' },
            remainingAmount: { $sum: '$remainingAmount' },
            teaForWorkers: { $sum: '$teaForWorkers' },
            carPayment: { $sum: '$carPayment' },
          },
        },
      ]),

      OutDeliver.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$supplier',
            count: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
            paidAmount: { $sum: '$paidAmount' },
            remainingAmount: { $sum: '$remainingAmount' },
          },
        },
        { $sort: { totalAmount: -1 } },
        {
          $lookup: {
            from: 'customers',
            localField: '_id',
            foreignField: '_id',
            as: 'supplierInfo',
          },
        },
        { $unwind: { path: '$supplierInfo', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            supplierId: '$_id',
            supplierName: '$supplierInfo.name',
            count: 1,
            totalAmount: 1,
            paidAmount: 1,
            remainingAmount: 1,
          },
        },
      ]),
    ]);

    const summary = {
      count: agg[0]?.count || 0,
      totalAmount: agg[0]?.totalAmount || 0,
      paidAmount: agg[0]?.paidAmount || 0,
      remainingAmount: agg[0]?.remainingAmount || 0,
      teaForWorkers: agg[0]?.teaForWorkers || 0,
      carPayment: agg[0]?.carPayment || 0,
      bySupplier,
    };

    res.json({
      summary,
      detail,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير النقلات الصادرة', error: err.message });
  }
};
