
const WirePurchase = require('../../models/purchase/wire/wirePurchase');
const {
  buildDateRangeFilter,
  toObjectId,
  addIfPresent,
  parsePagination,
} = require('../../utils/reportUtils');


exports.WirePurchase=async (req, res) => {
  try {
    const { from, to, supplier, paymentStatus } = req.query;
    const filter = buildDateRangeFilter('purchaseDate', from, to);
    addIfPresent(filter, 'supplier', supplier, toObjectId);
    addIfPresent(filter, 'paymentStatus', paymentStatus);
    const { page, limit, skip } = parsePagination(req.query);

    const [detail, total, agg, byStatus, byWireType] = await Promise.all([
      WirePurchase.find(filter)
        .sort({ purchaseDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('supplier', 'name phone')
        .populate('items.wireType', 'name')
        .lean(),

      WirePurchase.countDocuments(filter),

      WirePurchase.aggregate([
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

      WirePurchase.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$paymentStatus',
            totalAmount: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
      ]),

      WirePurchase.aggregate([
        { $match: filter },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.wireType',
            totalQuantity: { $sum: '$items.quantity' },
            totalAmount: { $sum: '$items.total' },
          },
        },
        { $sort: { totalAmount: -1 } },
        {
          $lookup: {
            from: 'wiretypes',
            localField: '_id',
            foreignField: '_id',
            as: 'wireTypeInfo',
          },
        },
        { $unwind: { path: '$wireTypeInfo', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            wireTypeId: '$_id',
            wireTypeName: '$wireTypeInfo.name',
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
      byWireType,
    };

    res.json({
      summary,
      detail,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير شراء السلك', error: err.message });
  }
};
