const Expense = require('../../models/expense');
const {
  buildDateRangeFilter,
  parsePagination,
} = require('../../utils/reportUtils');

exports.getExpenseReport = async (req, res) => {
  try {
    const { from, to, search } = req.query;

    const filter = buildDateRangeFilter('expenseDate', from, to);

    if (search) {
      filter['items.title'] = {
        $regex: search,
        $options: 'i',
      };
    }

    const { page, limit, skip } = parsePagination(req.query);

    const [detail, total, agg, categories] = await Promise.all([

      Expense.find(filter)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort({ expenseDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Expense.countDocuments(filter),

      Expense.aggregate([
        { $match: filter },
        { $unwind: '$items' },

        ...(search
          ? [
              {
                $match: {
                  'items.title': {
                    $regex: search,
                    $options: 'i',
                  },
                },
              },
            ]
          : []),

        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: '$items.amount' },
          },
        },
      ]),

      Expense.aggregate([
        { $match: filter },
        { $unwind: '$items' },

        ...(search
          ? [
              {
                $match: {
                  'items.title': {
                    $regex: search,
                    $options: 'i',
                  },
                },
              },
            ]
          : []),

        {
          $group: {
            _id: '$items.title',
            totalAmount: {
              $sum: '$items.amount',
            },
            count: {
              $sum: 1,
            },
          },
        },

        {
          $sort: {
            totalAmount: -1,
          },
        },
      ]),
    ]);

    const summary = {
      count: agg[0]?.count || 0,
      totalAmount: agg[0]?.totalAmount || 0,

      byCategory: categories.map((item) => ({
        title: item._id,
        totalAmount: item.totalAmount,
        count: item.count,
      })),
    };

    res.json({
      summary,
      detail,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: 'خطأ في تقرير المصروفات',
      error: err.message,
    });
  }
};