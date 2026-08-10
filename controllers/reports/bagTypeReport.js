
const BagType = require('../../models/purchase/bag/BagType');
const { addIfPresent } = require('../../utils/reportUtils');


exports.BagType= async (req, res) => {
  try {
    const { name } = req.query;
    const filter = {};
    addIfPresent(filter, 'name', name, (v) => new RegExp(v, 'i'));

    const [detail, count, usage] = await Promise.all([
      BagType.find(filter).sort({ name: 1 }).lean(),

      BagType.countDocuments(filter),

      BagType.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: 'bagpurchases',
            let: { bagTypeId: '$_id' },
            pipeline: [
              { $unwind: '$items' },
              { $match: { $expr: { $eq: ['$items.bagType', '$$bagTypeId'] } } },
              {
                $group: {
                  _id: null,
                  totalQuantity: { $sum: '$items.quantity' },
                  totalAmount: { $sum: '$items.total' },
                  purchaseCount: { $sum: 1 },
                },
              },
            ],
            as: 'usage',
          },
        },
        { $unwind: { path: '$usage', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name: 1,
            totalQuantityPurchased: { $ifNull: ['$usage.totalQuantity', 0] },
            totalAmountPurchased: { $ifNull: ['$usage.totalAmount', 0] },
            purchaseCount: { $ifNull: ['$usage.purchaseCount', 0] },
          },
        },
        { $sort: { totalAmountPurchased: -1 } },
      ]),
    ]);

    const summary = { count, usage };

    res.json({ summary, detail });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير أنواع الشكاير', error: err.message });
  }
};
