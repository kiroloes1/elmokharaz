const Item = require('../../models/delivery/items');
const { addIfPresent } = require('../../utils/reportUtils');

exports.Item= async (req, res) => {
  try {
    const { name } = req.query;
    const filter = {};
    addIfPresent(filter, 'name', name, (v) => new RegExp(v, 'i'));

    const [detail, agg] = await Promise.all([
      Item.find(filter).sort({ name: 1 }).lean(),

      Item.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgPricePerWeight: { $avg: '$pricePerWeight' },
            minPricePerWeight: { $min: '$pricePerWeight' },
            maxPricePerWeight: { $max: '$pricePerWeight' },
          },
        },
      ]),
    ]);

    const summary = {
      count: agg[0]?.count || 0,
      avgPricePerWeight: agg[0]?.avgPricePerWeight || 0,
      minPricePerWeight: agg[0]?.minPricePerWeight || 0,
      maxPricePerWeight: agg[0]?.maxPricePerWeight || 0,
    };

    res.json({ summary, detail });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير الأصناف', error: err.message });
  }
};
