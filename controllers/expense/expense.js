const Expense =require(`${__dirname}/../../models/expense`);
const Transaction = require(`${__dirname}/../../models/money/TransactionBox`);
const mongoose =require('mongoose');
const { createLog } = require('../../services/createLogs');


// create Expense
exports.createExpense = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.userId;
    const { items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        message: "يجب إدخال مصروف واحد على الأقل"
      });
    }

    // إنشاء Expense جديد
    const expense = await Expense.create([{
      items,
      createdBy: userId,
      updatedBy: userId
    }], { session });

    const createdExpense = expense[0];



    // إنشاء Transaction مرتبطة بهذا الـ Expense فقط
    const transaction = await Transaction.create([{
      type: "expense",
      items: items.map(item => ({
        title: `${item.title}${item.note ? " | " + item.note : ""}`,
        category: "expense",
        amount: item.amount
      })),
      expenseId: createdExpense._id,
      note: "مصروفات خارجه من الخزنه"
    }], { session });

    await createLog({
    section: "المصاريف",
    action: "إنشاء",
    userId,
    targetId: createdExpense._id,
    title: "مصروف",
    details: `تم إنشاء مصروف بإجمالي ${Number(createdExpense.totalAmount).toLocaleString()} ج.م يحتوي على ${createdExpense.items.length} بند بتاريخ ${new Date(createdExpense.expenseDate).toLocaleDateString("ar-EG")}.`,
    session
});

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Expense created successfully",
      expense: createdExpense,
      transaction: transaction[0]
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      error: err.message
    });
  }
};

exports.deleteExpense = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const expense = await Expense.findById(req.params.id).session(session);

    if (!expense) {
      return res.status(404).json({
        message: "Expense not found"
      });
    }

    await Transaction.deleteMany({
      expenseId: expense._id
    }).session(session);

    await expense.deleteOne({ session });

    await createLog({
    section: "المصاريف",
    action: "حذف",
    userId: req.user.userId,
    targetId: expense._id,
    title: "مصروف",
    details: `تم حذف مصروف بإجمالي ${Number(expense.totalAmount).toLocaleString()} ج.م بتاريخ ${new Date(expense.expenseDate).toLocaleDateString("ar-EG")}.`,
    session
});
    await session.commitTransaction();

    res.status(200).json({
      message: "Expense deleted successfully"
    });

  } catch (err) {
    await session.abortTransaction();

    res.status(500).json({
      error: err.message
    });

  } finally {
    session.endSession();
  }
};



exports.updateExpense = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.userId;
    const { items, expenseDate } = req.body;

  
    const expense = await Expense.findById(req.params.id).session(session);

    if (!expense) {
      await session.abortTransaction();
      return res.status(404).json({
        message: "Expense not found"
      });
    }

   
    if (expenseDate) {
      expense.expenseDate = new Date(expenseDate);
    }

  
    if (items && items.length > 0) {
      expense.items = items.map((item) => ({
        title: item.title,
        amount: item.amount,
        note: item.note || ""
      }));
    }

    expense.updatedBy = userId;

        const oldExpense = expense.toObject();

    await expense.save({ session });

   
    const transactionItems = expense.items.map((item) => ({
      title: item.note
        ? `${item.title} | ${item.note}`
        : item.title,
      category: "expense",
      amount: item.amount
    }));

  
    const transaction = await Transaction.findOneAndUpdate(
      { expenseId: expense._id },
      {
        items: transactionItems,
        totalAmount: expense.totalAmount,
        note: "مصروفات خارجه من الخزنه",
        date: expense.expenseDate 
      },
      {
        new: true,
        session
      }
    );

    if (!transaction) {
      throw new Error("Transaction not found");
    }


    await createLog({
        section: "المصاريف",
        action: "تعديل",
        userId,
        targetId: expense._id,
        title: "مصروف",
        details:
    `تم تعديل المصروف.
    عدد البنود: ${oldExpense.items.length} → ${expense.items.length}.
    الإجمالي: ${Number(oldExpense.totalAmount).toLocaleString()} ج.م → ${Number(expense.totalAmount).toLocaleString()} ج.م.
    التاريخ: ${new Date(oldExpense.expenseDate).toLocaleDateString("ar-EG")} → ${new Date(expense.expenseDate).toLocaleDateString("ar-EG")}.`,
        session
    });

    await session.commitTransaction();

    res.status(200).json({
      message: "Expense updated successfully",
      expense,
      transaction
    });

  } catch (err) {
    await session.abortTransaction();

    res.status(500).json({
      error: err.message
    });

  } finally {
    session.endSession();
  }
};

// getAllExpenses
// getAllExpenses
exports.getAllExpenses = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", fromDate, toDate } = req.query;

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    // بحث باسم البند جوه array الـ items
    if (search) {
      filter["items.title"] = { $regex: search, $options: "i" };
    }

    // فلترة بالتاريخ من / إلى
    if (fromDate || toDate) {
      filter.expenseDate = {};

      if (fromDate) {
        filter.expenseDate.$gte = new Date(fromDate);
      }

      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        filter.expenseDate.$lte = end;
      }
    }

    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .skip(skip)
        .limit(limitNum)
        .lean()
        .populate("createdBy", "username")
        .populate("updatedBy", "username")
        .sort({ expenseDate: -1 }),
      Expense.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      success: true,
      count: expenses.length,
      expenses,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
// getExpenseById
exports.getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate("createdBy", "username")
      .populate("updatedBy", "username");

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found"
      });
    }

    res.status(200).json({
      success: true,
      expense
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


// get current Expenses
exports.getCurrentExpenses = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const expenses = await Expense.find({
      expenseDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .populate("createdBy", "username")
      .populate("updatedBy", "username")
      .sort({ expenseDate: -1 });

    res.status(200).json(expenses);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};