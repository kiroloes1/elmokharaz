const mongoose = require("mongoose");
const { getPeriodRange, startOfDay, endOfDay } = require("../../utils/getPeriodRange");

const User = require("../../models/users");
const outDeliver = require("../../models/delivery/outDelivery");
const Cheque = require("../../models/money/cheque");
const Payment = require("../../models/money/payment");
const Customer = require("../../models/peapole/customer");
const Supplier = require("../../models/peapole/supplier");
const Maintenance = require("../../models/purchase/equipment/maintenance");
const Bag = require("../../models/purchase/bag/BagPurchase");
const Wire = require("../../models/purchase/wire/wirePurchase");
const Equipment = require("../../models/purchase/equipment/equipment");
const EquipmentSupply = require("../../models/purchase/equipment/EquipmentSupply");

const ACTIVE_CHEQUE_STATUSES = ["under_collection", "due_today"];
const UNPAID_STATUSES = ["unpaid", "partial"];

// موديلات المشتريات اللي هنجمّع منها إحصائيات بنفس الشكل
// (كلهم فيهم: purchaseDate, totalAmount, remainingAmount, paymentStatus, supplier)
const PURCHASE_MODULES = [
  { key: "equipment", label: "معدات", Model: Equipment },
  { key: "equipmentSupply", label: "مستلزمات معدات", Model: EquipmentSupply },
  { key: "wire", label: "سلك", Model: Wire },
  { key: "bag", label: "شكاير", Model: Bag },
];

/**
 * GET /api/dashboard?period=today|week|month|custom&from=&to=
 */
exports.getDashboard=async(req, res)=> {
  try {
    const { period = "today", from, to } = req.query;
    const { start, end } = getPeriodRange({ period, from, to });

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const [
      deliveriesInPeriod,
      paymentsInPeriod,
      chequesDueInPeriod,
      chequesDueToday,
      chequesOverdue,
      maintenanceInProgress,
      purchaseStatsPerModule,
      unpaidInvoicesPerModule,
    ] = await Promise.all([
      // كل النقلات خلال الفترة (بنحتاجها للعدّ + معرفة العملاء اللي اتعامل معاهم)
      outDeliver
        .find({ deliveryDate: { $gte: start, $lte: end } })
        .select("supplier deliveryDate totalAmount")
        .lean(),

      // كل عمليات الدفع/التحصيل خلال الفترة
      Payment
        .find({ transactionDate: { $gte: start, $lte: end } })
        .select("customer supplier moneyFlow amount transactionDate module")
        .lean(),

      // شيكات مستحقة خلال الفترة المختارة (لسه ما اتحصلتش)
      Cheque.countDocuments({
        dueDate: { $gte: start, $lte: end },
        status: { $in: ACTIVE_CHEQUE_STATUSES },
      }),

      // شيكات مستحقة اليوم بالظبط (للتنبيهات - دايمًا "اليوم" بغض النظر عن الفترة المختارة)
      Cheque.find({
        dueDate: { $gte: todayStart, $lte: todayEnd },
        status: { $in: ACTIVE_CHEQUE_STATUSES },
      })
        .populate("customer supplier", "name")
        .lean(),

      // شيكات متأخرة (تاريخ استحقاقها فات ولسه معلّقة) - برضو مستقلة عن الفترة
      Cheque.find({
        dueDate: { $lt: todayStart },
        status: { $in: ACTIVE_CHEQUE_STATUSES },
      })
        .populate("customer supplier", "name")
        .lean(),

      // معدات/أجزاء تحت الصيانة حاليًا (لسه ما رجعتش)
      Maintenance.find({ returnDate: { $exists: false } })
        .populate("supplier", "name")
        .select("equipmentName maintenanceProvider purchaseDate supplier")
        .lean(),

      // إحصائيات كل نوع مشتريات (معدات - مستلزمات - سلك - شكاير) خلال الفترة
      Promise.all(
        PURCHASE_MODULES.map(({ key, Model }) =>
          getPurchaseStats(Model, start, end).then((stats) => ({ key, ...stats }))
        )
      ),

      // فواتير مش متسددة أو مسددة جزئيًا (مستقلة عن الفترة - دين قائم دلوقتي)
      Promise.all(
        PURCHASE_MODULES.map(({ key, label, Model }) =>
          getUnpaidInvoices(Model, key, label)
        )
      ),
    ]);

    // ===== عدد النقلات =====
    const deliveriesCount = deliveriesInPeriod.length;

    // ===== عدد التحصيلات (المبالغ الداخلة فقط) =====
    const collectionsInPeriod = paymentsInPeriod.filter(
      (p) => p.moneyFlow === "incoming"
    );
    const collectionsCount = collectionsInPeriod.length;

        // ===== عدد التحصيلات (المبالغ الخارجه فقط) =====
    const collectionsOutPeriod = paymentsInPeriod.filter(
      (p) => p.moneyFlow === "outgoing"
    );
    const collectionsOutCount = collectionsOutPeriod.length;


    // ===== العملاء اللي اتعامل معاهم خلال الفترة (نقلات + دفعات) =====
    const dealtWithIds = new Set();
    deliveriesInPeriod.forEach((d) => {
      if (d.supplier) dealtWithIds.add(String(d.supplier));
    });
    paymentsInPeriod.forEach((p) => {
      if (p.customer) dealtWithIds.add(String(p.customer));
      if (p.supplier) dealtWithIds.add(String(p.supplier));
    });
    const customersDealtWithCount = dealtWithIds.size;

    // ===== إحصائيات المشتريات لكل نوع (معدات - مستلزمات - سلك - شكاير) =====
    const purchases = {};
    purchaseStatsPerModule.forEach(({ key, count, totalAmount, remainingAmount }) => {
      purchases[key] = { count, totalAmount, remainingAmount };
    });

    // ===== كروت لوحة التحكم =====
    const cards = {
      customersDealtWith: customersDealtWithCount,
      deliveries: deliveriesCount,
      collections: collectionsCount,
      collectionsOut: collectionsOutCount,

      
      chequesDue: chequesDueInPeriod,
      chequesOverdue: chequesOverdue.length,
      purchases, // { equipment: {...}, equipmentSupply: {...}, wire: {...}, bag: {...} }
    };

    // ===== سطر الملخص السريع =====
    const summaryLine = buildSummaryLine({
      period,
      deliveriesCount,
      collectionsCount,
      collectionsOutCount,
      chequesDueCount: chequesDueInPeriod,
    });

    // ===== التنبيهات =====
    const notifications = {
      chequesDueToday: chequesDueToday.map(mapChequeAlert),
      chequesOverdue: chequesOverdue.map(mapChequeAlert),
      maintenanceInProgress: maintenanceInProgress.map((m) => ({
        id: m._id,
        equipmentName: m.equipmentName,
        maintenanceProvider: m.maintenanceProvider,
        supplierName: m.supplier?.name || null,
        sentDate: m.purchaseDate,
      })),
      // فواتير مشتريات (معدات/مستلزمات/سلك/شكاير) لسه فيها مبلغ متبقي
      unpaidInvoices: unpaidInvoicesPerModule
        .flat()
        .sort((a, b) => b.remainingAmount - a.remainingAmount),

      // مكان مفتوح لأي تنبيه تاني تحب تضيفه بعدين
      other: [],
    };

    return res.status(200).json({
      success: true,
      period: { type: period, start, end },
      greeting: buildGreeting(req.user?.username),
      summaryLine,
      cards,
      notifications,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "حصل خطأ أثناء تحميل لوحة التحكم",
    });
  }
}

exports.money = async (req, res) => {
  try {
    // Customers
    const customers = await Customer.find({}, "balance");

    const customerTotal = customers.length;

    const customersHaveMoney = customers.filter(c => c.balance > 0);
    const customerDebtMoney = customers.filter(c => c.balance < 0);

    const customersHaveMoneyAmount = customersHaveMoney.reduce(
      (sum, c) => sum + c.balance,
      0
    );

    const customerDebtMoneyAmount = customerDebtMoney.reduce(
      (sum, c) => sum + Math.abs(c.balance),
      0
    );

    // Suppliers
    const suppliers = await Supplier.find({}, "balance");

    const supplierTotal = suppliers.length;

    const suppliersHaveMoney = suppliers.filter(s => s.balance > 0);
    const supplierDebtMoney = suppliers.filter(s => s.balance < 0);

    const suppliersHaveMoneyAmount = suppliersHaveMoney.reduce(
      (sum, s) => sum + s.balance,
      0
    );

    const supplierDebtMoneyAmount = supplierDebtMoney.reduce(
      (sum, s) => sum + Math.abs(s.balance),
      0
    );

    return res.status(200).json({
      success: true,
      data: {
        customers: {
          total: customerTotal,
          haveMoneyCount: customersHaveMoney.length,
          debtCount: customerDebtMoney.length,
          haveMoneyAmount: customersHaveMoneyAmount,
          debtAmount: customerDebtMoneyAmount,
        },
        suppliers: {
          total: supplierTotal,
          haveMoneyCount: suppliersHaveMoney.length,
          debtCount: supplierDebtMoney.length,
          haveMoneyAmount: suppliersHaveMoneyAmount,
          debtAmount: supplierDebtMoneyAmount,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * إحصائيات نوع مشتريات واحد خلال الفترة: عدد الفواتير + إجمالي المبلغ + إجمالي المتبقي
 */
async function getPurchaseStats(Model, start, end) {
  const [result] = await Model.aggregate([
    { $match: { purchaseDate: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" },
        remainingAmount: { $sum: "$remainingAmount" },
      },
    },
  ]);

  return {
    count: result?.count || 0,
    totalAmount: result?.totalAmount || 0,
    remainingAmount: result?.remainingAmount || 0,
  };
}

async function getUnpaidInvoices(Model, moduleKey, moduleLabel) {
  const invoices = await Model.find({ paymentStatus: { $in: UNPAID_STATUSES } })
    .populate("supplier", "name")
    .select("invoiceNumber equipmentName totalAmount remainingAmount paymentStatus purchaseDate supplier")
    .sort({ remainingAmount: -1 })
    .limit(10)
    .lean();

  return invoices.map((inv) => ({
    module: moduleKey,
    moduleLabel,
    id: inv._id,
    invoiceNumber: inv.invoiceNumber,
    equipmentName: inv.equipmentName || null,
    supplierName: inv.supplier?.name || null,
    totalAmount: inv.totalAmount,
    remainingAmount: inv.remainingAmount,
    paymentStatus: inv.paymentStatus,
    purchaseDate: inv.purchaseDate,
  }));
}

function mapChequeAlert(c) {
  return {
    id: c._id,
    chequeNumber: c.chequeNumber,
    amount: c.amount,
    dueDate: c.dueDate,
    bankName: c.bankName,
    ownerName: c.customer?.name || c.supplier?.name || null,
    moneyFlow: c.moneyFlow,
  };
}

function buildGreeting(username) {
  const hour = new Date().getHours();
  const name = username ? `أستاذ ${username}` : "أستاذ";
  if (hour < 12) return `صباح الخير، ${name} 💡 نتمنى لك يوم عمل موفق`;
  return `مساء الخير، ${name} 💡 نتمنى لك يوم عمل موفق`;
}

function buildSummaryLine({ period, deliveriesCount, collectionsCount, chequesDueCount ,collectionsOutCount}) {
  const periodLabel =
    { today: "اليوم", week: "الأسبوع", month: "الشهر", custom: "خلال الفترة" }[period] ||
    "خلال الفترة";

  return `${periodLabel} تم تسجيل ${deliveriesCount} نقلة و ${collectionsCount} عملية تحصيل، ويوجد ${chequesDueCount} شيكات مستحقة`;
}

