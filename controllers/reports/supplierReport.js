
const Supplier = require('../../models/peapole/supplier');
const { addIfPresent, parsePagination } = require('../../utils/reportUtils');

exports.Supplier= async (req, res) => {
  try {
    const { name, minBalance } = req.query;
    const filter = {};
    addIfPresent(filter, 'name', name, (v) => new RegExp(v, 'i'));
    if (minBalance !== undefined && minBalance !== '') {
      filter.balance = { $gte: Number(minBalance) };
    }
    const { page, limit, skip } = parsePagination(req.query);

    const [detail, total, agg, topBalances] = await Promise.all([
      Supplier.find(filter).sort({ balance: -1 }).skip(skip).limit(limit).lean(),

      Supplier.countDocuments(filter),

      Supplier.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalBalance: { $sum: '$balance' },
            totalOpenningBalance: { $sum: '$openningBalance' },
          },
        },
      ]),

      Supplier.find({ ...filter, balance: { $gt: 0 } })
        .sort({ balance: -1 })
        .limit(10)
        .select('name phone balance')
        .lean(),
    ]);

    const summary = {
      count: agg[0]?.count || 0,
      totalBalance: agg[0]?.totalBalance || 0,
      totalOpenningBalance: agg[0]?.totalOpenningBalance || 0,
      topBalances,
    };

    res.json({
      summary,
      detail,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير الموردين', error: err.message });
  }
};

