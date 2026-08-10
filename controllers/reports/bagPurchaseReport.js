
const BagPurchase = require('../../models/purchase/bag/BagPurchase');
const {
  buildDateRangeFilter,
  toObjectId,
  addIfPresent,
  parsePagination,
} = require('../../utils/reportUtils');


exports.BagPurchase= async (req, res) => {
  try {
    const { from, to, supplier, paymentStatus } = req.query;
    const filter = buildDateRangeFilter('purchaseDate', from, to);
    addIfPresent(filter, 'supplier', supplier, toObjectId);
    addIfPresent(filter, 'paymentStatus', paymentStatus);
    const { page, limit, skip } = parsePagination(req.query);

    const [detail, total, agg, byStatus, byBagType] = await Promise.all([
      BagPurchase.find(filter)
        .sort({ purchaseDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('supplier', 'name phone')
        .populate('items.bagType', 'name')
        .lean(),

      BagPurchase.countDocuments(filter),

      BagPurchase.aggregate([
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

      BagPurchase.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$paymentStatus',
            totalAmount: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
      ]),

      BagPurchase.aggregate([
        { $match: filter },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.bagType',
            totalQuantity: { $sum: '$items.quantity' },
            totalAmount: { $sum: '$items.total' },
          },
        },
        { $sort: { totalAmount: -1 } },
        {
          $lookup: {
            from: 'bagtypes',
            localField: '_id',
            foreignField: '_id',
            as: 'bagTypeInfo',
          },
        },
        { $unwind: { path: '$bagTypeInfo', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            bagTypeId: '$_id',
            bagTypeName: '$bagTypeInfo.name',
            totalQuantity: 1,
            totalAmount: 1,
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
      byBagType,
    };

    res.json({
      summary,
      detail,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير شراء الشكاير', error: err.message });
  }
};


