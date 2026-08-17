const mongoose = require("mongoose");
const OutDeliver = require("../../models/delivery/outDelivery");
const Cheque = require("../../models/money/cheque");
const Customer = require("../../models/peapole/customer");
const Supplier = require("../../models/peapole/supplier");
const { buildDateMatch } = require("../../utils/reportHelpers");

/**
 * GET /api/v1/advancedReports/comprehensive
 * التقرير الشامل - صفحة واحدة تدمج كافة الإحصائيات (كروت، تحصيلات، أصناف، شيكات، تجار، ملخص نهائي)
 */
exports.getComprehensiveReport = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    // بناء فلتر التاريخ للنقلات والشيكات
    const deliveryDateMatch = buildDateMatch(dateFrom, dateTo, "deliveryDate");
    const chequeDateMatch = buildDateMatch(dateFrom, dateTo, "dueDate");

    // Execution في نفس الوقت لجميع البيانات لسرعة استجابة عالية
    const [deliveriesData, chequesData, customersData, suppliersData] = await Promise.all([
      
      // 1. تجميع بيانات النقلات والأصناف وطرق التحصيل
      OutDeliver.aggregate([
        { $match: deliveryDateMatch },
        {
          $facet: {
            // ملخص النقلات
            summary: [
              {
                $group: {
                  _id: null,
                  deliveriesCount: { $sum: 1 },
                  totalAmount: { $sum: "$totalAmount" },
                  totalPaid: { $sum: "$paidAmount" },
                  totalRemaining: { $sum: "$remainingAmount" },
                  totalTeaForWorkers: { $sum: "$teaForWorkers" },
                  totalCarPayment: { $sum: "$carPayment" },
                },
              },
            ],

            // البضاعة (الأصناف)
            items: [
              { $unwind: "$items" },
              {
                $group: {
                  _id: "$items.item",
                  totalWeight: { $sum: "$items.totalWeight" },
                  totalPrice: { $sum: "$items.totalPrice" },
                },
              },
              {
                $lookup: {
                  from: "items",
                  localField: "_id",
                  foreignField: "_id",
                  as: "itemInfo",
                },
              },
              { $unwind: { path: "$itemInfo", preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  _id: 0,
                  itemId: "$_id",
                  itemName: { $ifNull: ["$itemInfo.name", "صنف غير معروف"] },
                  totalWeight: { $round: ["$totalWeight", 2] },
                  totalPrice: { $round: ["$totalPrice", 2] },
                },
              },
              { $sort: { totalPrice: -1 } },
            ],

            // التحصيلات حسب طريقة الدفع (نقدي، تحويل، شيكات ...الخ)
            paymentsByMethod: [
              {
                $group: {
                  _id: { $ifNull: ["$paymentMethod", "نقدي"] },
                  amount: { $sum: "$paidAmount" },
                },
              },
            ],
          },
        },
      ]),

      // 2. تجميع بيانات الشيكات
      Cheque.aggregate([
        { $match: chequeDateMatch },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]),

      // 3. أربطة وإجمالي أوراق وحسابات العملاء (إجمالي لينا عند التجار)
      Customer.aggregate([
        {
          $group: {
            _id: null,
            totalCustomers: { $sum: 1 },
            totalBalanceDueToUs: { $sum: { $cond: [{ $gt: ["$balance", 0] }, "$balance", 0] } },
            totalBalanceDueToCustomer: { $sum: { $cond: [{ $lt: ["$balance", 0] }, "$balance", 0] } },

          },
        },
      ]),

      // 4. أربطة وإجمالي أوراق وحسابات الموردين (إجمالي علينا للتجار)
      Supplier.aggregate([
        {
          $group: {
            _id: null,
            totalSuppliers: { $sum: 1 },
            totalBalanceDueFromUs: { $sum: { $cond: [{ $gt: ["$balance", 0] }, "$balance", 0] } },
          },
        },
      ]),
    ]);

    // ===== تجهيز الهيكل المخرج للتوافق مع شاشة Dashboard الواحدة =====
    
    // استخراج بيانات النقلات
    const deliveryFacet = deliveriesData[0] || {};
    const summary = deliveryFacet.summary[0] || {
      deliveriesCount: 0,
      totalAmount: 0,
      totalPaid: 0,
      totalRemaining: 0,
      totalTeaForWorkers: 0,
      totalCarPayment: 0,
    };

    const items = deliveryFacet.items || [];

    // حساب نسب طرق التحصيل
    const totalPaidSum = summary.totalPaid || 1; // تجنب القسمة على صفر
    const collections = (deliveryFacet.paymentsByMethod || []).map((p) => ({
      method: p._id,
      amount: p.amount,
      percentage: Number(((p.amount / totalPaidSum) * 100).toFixed(1)),
    }));

    // معالجة كارت ومصفوفة الشيكات
    let collectedCheques = { count: 0, amount: 0 };
    let underCollectionCheques = { count: 0, amount: 0 };
    let returnedCheques = { count: 0, amount: 0 };
    let totalChequesCount = 0;
    let totalChequesAmount = 0;

    chequesData.forEach((c) => {
      totalChequesCount += c.count;
      totalChequesAmount += c.totalAmount;

      if (c._id === "collected") {
        collectedCheques = { count: c.count, amount: c.totalAmount };
      } else if (c._id === "under_collection") {
        underCollectionCheques = { count: c.count, amount: c.totalAmount };
      } else if (c._id === "returned") {
        returnedCheques = { count: c.count, amount: c.totalAmount };
      }
    });

    const chequesBreakdown = [
      { status: "تم تحصيلها", count: collectedCheques.count, totalAmount: collectedCheques.amount },
      { status: "قائمة / تحت التحصيل", count: underCollectionCheques.count, totalAmount: underCollectionCheques.amount },
      { status: "مرجعة", count: returnedCheques.count, totalAmount: returnedCheques.amount },
    ];

    // حسابات التجار
    const customersInfo = customersData[0] || { totalCustomers: 0, totalBalanceDueToUs: 0 ,totalBalanceDueToCustomer:0 };
    const suppliersInfo = suppliersData[0] || { totalSuppliers: 0, totalBalanceDueFromUs: 0 };

    const netTraderPosition = customersInfo.totalBalanceDueToUs - suppliersInfo.totalBalanceDueFromUs;

    // الخزنة والمصاريف (حسابات تقريبية من النقلات والعمالة)
    const totalExpenses = summary.totalTeaForWorkers + summary.totalCarPayment;
    const netProfit = summary.totalPaid - totalExpenses;

    return res.status(200).json({
      success: true,
      data: {
        // 1. كروت الملخص الرئيسي العلوي
        monthlySummary: {
          totalDeliveryValue: summary.totalAmount,
          totalCollectedAmount: summary.totalPaid,
          netRemainingBalance: summary.totalRemaining,
          deliveriesCount: summary.deliveriesCount,
        },

        // 2. جدول التحصيلات (طريقة التحصيل + المبالغ + النسبة)
        collections: {
          list: collections,
          totalCollected: summary.totalPaid,
        },

        // 3. جدول البضاعة والأصناف
        goodsSummary: {
          items: items,
          totalWeight: items.reduce((acc, i) => acc + i.totalWeight, 0),
          totalPrice: items.reduce((acc, i) => acc + i.totalPrice, 0),
        },

        // 4. جدول وحالة الشيكات
        chequesSummary: {
          breakdown: chequesBreakdown,
          totalCount: totalChequesCount,
          totalAmount: totalChequesAmount,
          underCollectionAmount: underCollectionCheques.amount,
          collectedAmount: collectedCheques.amount,
          returnedAmount: returnedCheques.amount,
        },

        // 5. حسابات التجار (إجمالي لينا وعلينا)
        traderAccounts: {
          activeTradersCount: customersInfo.totalCustomers + suppliersInfo.totalSuppliers,
          totalDueToUs: customersInfo.totalBalanceDueToUs,

          totalBalanceDueToCustomer:customersInfo.totalBalanceDueToCustomer,
          totalDueFromUs: suppliersInfo.totalBalanceDueFromUs,
          netPosition: netTraderPosition,
        },

        // 6. الخزنة والمصاريف والنتيجة النهائية
        financials: {
          totalIncome: summary.totalPaid,
          totalExpenses: totalExpenses,
          cashBalance: summary.totalPaid - totalExpenses,
          netPeriodResult: netProfit,
        },
      },
    });
  } catch (error) {
    console.error("getComprehensiveReport error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء جلب التقرير الشامل",
      error: error.message,
    });
  }
};
