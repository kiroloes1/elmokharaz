const supplier = require("../../models/peapole/supplier");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const paymentModel=require(`${__dirname}/../../models/money/payment`);
const  settings=require(`${__dirname}/../../models/Settings`);
const supplierModel=require(`${__dirname}/../../models/peapole/supplier`);
const customerModel=require(`${__dirname}/../../models/peapole/customer`);
const chequeModel=require(`${__dirname}/../../models/money/cheque`);
const mongoose=require("mongoose");
const axios=require("axios");
const { createLog } = require(`${__dirname}/../../services/createLogs`);
const transaction = require(`${__dirname}/../../models/money/TransactionBox`);

// get payment by transaction reference
exports.getPayment=async(req,res)=>{
    try{
        const transactionReference =req.query.transactionReference;


        if(!transactionReference){
            return res.status(400).json({
                message:"المرجع مطلوب"
            })
        }
     
        const payment =await paymentModel.findOne({
  "walletInfo.transactionReference": transactionReference,
        },{_id:1, customer:1, supplier:1,transactionReference:1})

        res.status(200).json({
            message:"تم جلب البيانات بنجاح",
            payment
        })

    }catch(err){
         return res.status(500).json({
            message: err.message,
            err
        });
    }

}


// financial login
exports.financialLogin=async(req,res)=>{
    try{
        const {financialPin}=req.body;


        if(!financialPin){
            return res.status(400).json({
                message:"الرقم السري المالي مطلوب"
            })
        }
        
        const systemSettings = await settings.findOne()

        const isPinValid = await bcrypt.compare(financialPin, systemSettings.financialPin);

        if (!isPinValid) {
            return res.status(401).json({
                message: "الرقم السري المالي غير صحيح",
            });
        }

        const token = jwt.sign(
            { financialPin },
            process.env.ACCESS_JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.status(200).json({
            message: "تم تسجيل الدخول بنجاح",
            token
        });

    }catch(err){
        return res.status(500).json({
            message: err.message,
            err
        });
    }
}

// get all  category
exports.getPaymentFilters = async (req, res) => {
    try {

        const [paymentMethods, modules, moneyFlows] = await Promise.all([
            paymentModel.distinct("paymentMethod"),
            paymentModel.distinct("module"),
            paymentModel.distinct("moneyFlow")
        ]);

        const paymentLabels = {
            cash: "نقدي",
            wallet: "محفظة",
            bank: "بنك",
            instapay: "إنستا باي",
            mail: "بريد",
            cheque: "شيك",
            work: "شغل"
        };

        const moduleLabels = {
            delivery: "نقلة",
            pay: "دفع",
            debt: "مديونية",
            equipment_supply: "مستلزمات معدات",
            maintenance: "صيانة",
            equipment: "معدات",
            wire: "سلك",
            bag: "شكاير",
            export: "تصدير",
            import: "استيراد",
            collection: "تحصيل",
            purchase: "شراء",
            other: "أخرى"
        };

        const moneyFlowLabels = {
            incoming: "استلام",
            outgoing: "ارسال"
        };

        return res.status(200).json({
            success: true,
            message: "تم جلب الفلاتر بنجاح",

            data: {

                paymentMethods: paymentMethods
                    .sort()
                    .map(item => ({
                        value: item,
                        label: paymentLabels[item] || item
                    })),

                modules: modules
                    .sort()
                    .map(item => ({
                        value: item,
                        label: moduleLabels[item] || item
                    })),

                moneyFlows: moneyFlows
                    .sort()
                    .map(item => ({
                        value: item,
                        label: moneyFlowLabels[item] || item
                    }))

            }

        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};


// get payment by id
exports.getPaymentById=async(req,res)=>{
    try{
        const paymentId=req.params.paymentId;

        const payment=await paymentModel.findById(paymentId);

        if(!payment){
            return res.status(404).json({
                message:"الدفع غير موجود"
            })
        }           

        res.status(200).json({
            message:"تم جلب الدفع بنجاح",
            payment
        })
    }catch(err){
        return res.status(500).json({
            message: err.message,
            err
        });
    }
}



// panigation for payments and filter by payment method and date range and search by transaction reference

exports.getPayments = async (req, res) => {
    try {

        let {
            page = 1,
            limit = 10,
            paymentMethod,
            startDate,
            endDate,
            search,
            moneyFlow,
            module,
            sort = "-transactionDate"
        } = req.query;

        page = Math.max(parseInt(page) || 1, 1);
        limit = Math.max(parseInt(limit) || 10, 1);

        const filter = {};
        const andConditions = [];

        // ===================================
        // Payment Method
        // ===================================
        if (paymentMethod) {
            filter.paymentMethod = paymentMethod;
        }

        // ===================================
        // Money Flow
        // ===================================
        if (moneyFlow) {
            filter.moneyFlow = moneyFlow;
        }

        // ===================================
        // Module
        // ===================================
        if (module) {
            filter.module = module;
        }

        // ===================================
        // Date Range
        // ===================================
        if (startDate || endDate) {

            filter.transactionDate = {};

            if (startDate) {
                filter.transactionDate.$gte = new Date(startDate);
            }

            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.transactionDate.$lte = end;
            }

        }

        // ===================================
        // Search
        // ===================================
        if (search) {

            const regex = new RegExp(search, "i");

            const [customers, suppliers] = await Promise.all([

                customerModel.find({
                    name: regex
                }).select("_id"),

                supplierModel.find({
                    name: regex
                }).select("_id")

            ]);

            andConditions.push({

                $or: [

                    {
                        customer: {
                            $in: customers.map(c => c._id)
                        }
                    },

                    {
                        supplier: {
                            $in: suppliers.map(s => s._id)
                        }
                    },

                    {
                        "walletInfo.transactionReference": regex
                    },

                    {
                        "bankInfo.transactionReference": regex
                    },

                    {
                        notes: regex
                    }

                ]

            });

        }

        if (andConditions.length) {
            filter.$and = andConditions;
        }

        // ===================================
        // Count
        // ===================================
        const total = await paymentModel.countDocuments(filter);

        // ===================================
        // Data
        // ===================================
        const payments = await paymentModel.find(filter)
            .populate("customer", "name")
            .populate("supplier", "name")
            .populate("createdBy", "name")
            .populate("updatedBy", "name")
            .populate("cheque")
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        return res.status(200).json({

            success: true,

            pagination: {

                total,

                page,

                limit,

                totalPages: Math.ceil(total / limit),

                hasNext: page < Math.ceil(total / limit),

                hasPrev: page > 1

            },

            filters: {

                paymentMethod,

                moneyFlow,

                module,

                startDate,

                endDate,

                search

            },

            data: payments

        });

    } catch (err) {

        console.error(err);

        return res.status(500).json({

            success: false,

            message: err.message

        });

    }
};


/** 
 * لعميل طالب لوحة فيها
المحافظ
البنك
البريد
الشيكات
الداخل
الخارج
 * 
 * **/


exports.dashboardStats = async (req, res) => {
    try {

        // ==========================================
        // Payments Summary
        // ==========================================
        const paymentStats = await paymentModel.aggregate([
            {
                $group: {
                    _id: null,

                    incoming: {
                        $sum: {
                            $cond: [
                                { $eq: ["$moneyFlow", "incoming"] },
                                "$amount",
                                0
                            ]
                        }
                    },

                    outgoing: {
                        $sum: {
                            $cond: [
                                { $eq: ["$moneyFlow", "outgoing"] },
                                "$amount",
                                0
                            ]
                        }
                    },

                    wallet: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$paymentMethod", "wallet"] },
                                        { $eq: ["$moneyFlow", "incoming"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    walletOut: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$paymentMethod", "wallet"] },
                                        { $eq: ["$moneyFlow", "outgoing"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    bank: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        {
                                            $in: [
                                                "$paymentMethod",
                                                ["bank", "instapay"]
                                            ]
                                        },
                                        { $eq: ["$moneyFlow", "incoming"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    bankOut: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        {
                                            $in: [
                                                "$paymentMethod",
                                                ["bank", "instapay"]
                                            ]
                                        },
                                        { $eq: ["$moneyFlow", "outgoing"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    mail: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$paymentMethod", "mail"] },
                                        { $eq: ["$moneyFlow", "incoming"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    mailOut: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$paymentMethod", "mail"] },
                                        { $eq: ["$moneyFlow", "outgoing"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    cash: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$paymentMethod", "cash"] },
                                        { $eq: ["$moneyFlow", "incoming"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    
                    cheque: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$paymentMethod", "cheque"] },
                                        { $eq: ["$moneyFlow", "incoming"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    chequeOut: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$paymentMethod", "cheque"] },
                                        { $eq: ["$moneyFlow", "outgoing"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    cashOut: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$paymentMethod", "cash"] },
                                        { $eq: ["$moneyFlow", "outgoing"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    }
                    ,
                    
                      instapay: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$paymentMethod", "instapay"] },
                                        { $eq: ["$moneyFlow", "incoming"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    instapayOut: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$paymentMethod", "instapay"] },
                                        { $eq: ["$moneyFlow", "outgoing"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                }
            }
        ]);

        // ==========================================
        // Cheques Summary
        // ==========================================
        const chequeStats = await chequeModel.aggregate([
            {
                $group: {

                    _id: "$status",

                    total: {
                        $sum: "$amount"
                    },

                    count: {
                        $sum: 1
                    }

                }
            }
        ]);

        const chequeSummary = {
            under_collection: 0,
            collected: 0,
            returned: 0,
            due_today: 0,
            cancelled: 0
        };

        chequeStats.forEach(item => {
            chequeSummary[item._id] = item.total;
        });

        const payment = paymentStats[0] || {};

        return res.status(200).json({

            success: true,

            data: {

                incoming: payment.incoming || 0,

                outgoing: payment.outgoing || 0,

                currentBalance:
                    (payment.incoming || 0) -
                    (payment.outgoing || 0),

                wallets: {
                    balance:
                        (payment.wallet || 0) -
                        (payment.walletOut || 0),

                    incoming: payment.wallet || 0,

                    outgoing: payment.walletOut || 0
                },

                banks: {
                    balance:
                        (payment.bank || 0) -
                        (payment.bankOut || 0),

                    incoming: payment.bank || 0,

                    outgoing: payment.bankOut || 0
                },

                mail: {
                    balance:
                        (payment.mail || 0) -
                        (payment.mailOut || 0),

                    incoming: payment.mail || 0,

                    outgoing: payment.mailOut || 0
                },

                cash: {
                    balance:
                        (payment.cash || 0) -
                        (payment.cashOut || 0),

                    incoming: payment.cash || 0,

                    outgoing: payment.cashOut || 0
                },


                
                instapay: {
                    balance:
                        (payment.instapay || 0) -
                        (payment.instapayOut || 0),

                    incoming: payment.instapay || 0,

                    outgoing: payment.instapayOut || 0
                },

                
                cheque: {
                    balance:
                        (payment.cheque || 0) -
                        (payment.chequeOut || 0),

                    incoming: payment.cheque || 0,

                    outgoing: payment.chequeOut || 0
                },

                cheques: {

                    underCollection:
                        chequeSummary.under_collection,

                    collected:
                        chequeSummary.collected,

                    returned:
                        chequeSummary.returned,

                    dueToday:
                        chequeSummary.due_today,

                    cancelled:
                        chequeSummary.cancelled

                }

            }

        });

    } catch (err) {

        return res.status(500).json({

            success: false,

            message: err.message

        });

    }
};


// get statistics for payments incoming and outgoing for today, this month, this year and custom range
exports.statistics = async (req, res) => {
    try {

        const { startDate, endDate } = req.query;

        const now = new Date();

        // ==========================
        // Today
        // ==========================
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        // ==========================
        // Month
        // ==========================
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);

        // ==========================
        // Year
        // ==========================
        const yearStart = new Date(now.getFullYear(), 0, 1);

        const yearEnd = new Date(now.getFullYear(), 11, 31);
        yearEnd.setHours(23, 59, 59, 999);

        // ==========================
        // Custom Range
        // ==========================
        let customStart = null;
        let customEnd = null;

        if (startDate && endDate) {

            customStart = new Date(startDate);

            customEnd = new Date(endDate);
            customEnd.setHours(23, 59, 59, 999);

        }

        const statistics = await paymentModel.aggregate([
            {
                $group: {

                    _id: null,

                    // اليوم
                    todayIncoming: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$moneyFlow", "incoming"] },
                                        { $gte: ["$transactionDate", todayStart] },
                                        { $lte: ["$transactionDate", todayEnd] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    todayOutgoing: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$moneyFlow", "outgoing"] },
                                        { $gte: ["$transactionDate", todayStart] },
                                        { $lte: ["$transactionDate", todayEnd] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    // الشهر
                    thisMonthIncoming: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$moneyFlow", "incoming"] },
                                        { $gte: ["$transactionDate", monthStart] },
                                        { $lte: ["$transactionDate", monthEnd] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    thisMonthOutgoing: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$moneyFlow", "outgoing"] },
                                        { $gte: ["$transactionDate", monthStart] },
                                        { $lte: ["$transactionDate", monthEnd] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    // السنة
                    thisYearIncoming: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$moneyFlow", "incoming"] },
                                        { $gte: ["$transactionDate", yearStart] },
                                        { $lte: ["$transactionDate", yearEnd] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    thisYearOutgoing: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$moneyFlow", "outgoing"] },
                                        { $gte: ["$transactionDate", yearStart] },
                                        { $lte: ["$transactionDate", yearEnd] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    // الفترة المحددة
                    customIncoming: {
                        $sum: {
                            $cond: [
                                {
                                    $and: customStart && customEnd ? [
                                        { $eq: ["$moneyFlow", "incoming"] },
                                        { $gte: ["$transactionDate", customStart] },
                                        { $lte: ["$transactionDate", customEnd] }
                                    ] : [{ $eq: [1, 0] }]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    customOutgoing: {
                        $sum: {
                            $cond: [
                                {
                                    $and: customStart && customEnd ? [
                                        { $eq: ["$moneyFlow", "outgoing"] },
                                        { $gte: ["$transactionDate", customStart] },
                                        { $lte: ["$transactionDate", customEnd] }
                                    ] : [{ $eq: [1, 0] }]
                                },
                                "$amount",
                                0
                            ]
                        }
                    }

                }
            }
        ]);

        return res.status(200).json({
            success: true,
            data: statistics[0] || {
                todayIncoming: 0,
                todayOutgoing: 0,
                thisMonthIncoming: 0,
                thisMonthOutgoing: 0,
                thisYearIncoming: 0,
                thisYearOutgoing: 0,
                customIncoming: 0,
                customOutgoing: 0
            }
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};


exports.transferMoney = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const {
            type,                   // import | export
            amount,
            paymentMethod,
            transactionDate,
            notes,

            walletInfo,
            bankInfo,
            cheque

        } = req.body;

        const userId = req?.user?.userId;

        // ===================================
        // Validation
        // ===================================

        if (!type || !["import", "export"].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "نوع العملية غير صحيح"
            });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "قيمة المبلغ غير صحيحة"
            });
        }

        if (!paymentMethod || !["cash", "wallet", "instapay", "bank", "cheque"].includes(paymentMethod)) {
            return res.status(400).json({
                success: false,
                message: "طريقة الدفع غير صحيحة"
            });
        }

        // ===================================
        // التحقق من البيانات المطلوبة لكل طريقة دفع
        // ===================================

        if ((paymentMethod === "bank" || paymentMethod === "instapay") && !bankInfo) {
            return res.status(400).json({
                success: false,
                message: "بيانات البنك مطلوبة"
            });
        }

        if (paymentMethod === "cheque" && !cheque) {
            return res.status(400).json({
                success: false,
                message: "بيانات الشيك مطلوبة"
            });
        }

        if (paymentMethod === "wallet") {
            if (!walletInfo) {
                return res.status(400).json({
                    success: false,
                    message: "بيانات المحفظة مطلوبة"
                });
            }

            if (!walletInfo.provider) {
                return res.status(400).json({
                    success: false,
                    message: "مزود المحفظة مطلوب"
                });
            }
        }



        // ===================================
        // إنشاء الدفعة
        // ===================================

        const paymentData = {
            module: type,
            amount: Number(amount),
            paymentMethod,
            moneyFlow: type === "import" ? "incoming" : "outgoing",
            transactionDate: transactionDate || new Date(),
            notes: notes || "",
            createdBy: userId,
            updatedBy: null
        };

        // ===================================
        // التعامل مع المحفظة
        // ===================================

        if (paymentMethod === "wallet") {
            paymentData.walletInfo = {
                provider: walletInfo.provider,
                senderName: walletInfo.senderName,
                senderPhone: walletInfo.senderPhone,
                receiverName: walletInfo.receiverName,
                receiverPhone: walletInfo.receiverPhone,
                transactionReference: walletInfo.transactionReference,
                walletId: walletInfo.walletId
            };

            // إذا كان هناك رابط للمحفظة الخارجية
            if (walletInfo.linkWallet) {
                const formData = {
                    walletId: walletInfo.walletId,
                    senderName: walletInfo?.senderName,
                    receiverName: walletInfo?.receiverName,
                    senderPhone: walletInfo?.senderPhone,
                    receiverPhone: walletInfo?.receiverPhone,
                    type: type === "import" ? 'send' :'receive'  ,
                    notes: notes || `${type === "import" ? "ارسال أموال" : "استلام أموال"} سيستم المخرز`,
                    amount: Number(amount),
                    createdAt: transactionDate || new Date(),
                };

                try {
                    const trans = await axios.post(
                        `${process.env.WalletUrl}/transaction/V2`,
                        formData,
                        {
                            headers: {
                                "x-api-key": process.env.INTERNAL_API_KEY,
                                "Content-Type": "application/json",
                            }
                        }
                    );

                    paymentData.walletInfo.transactionReference = trans.data.transaction[0]._id;
                    paymentData.walletInfo.linkWallet = true;
                    paymentData.walletInfo.walletId = walletInfo.walletId;

                } catch (error) {
                    throw new Error(
                        error.response?.data?.message ||
                        error.message ||
                        JSON.stringify(error.response?.data) ||
                        "حدث خطأ في ربط المحفظة"
                    );
                }
            }
        }

        // ===================================
        // التعامل مع البنك و Instapay
        // ===================================

        if (paymentMethod === "bank" || paymentMethod === "instapay") {
            paymentData.bankInfo = {
                bankName: bankInfo.bankName,
                transactionReference: bankInfo.transactionReference,
                accountNumber: bankInfo.accountNumber,
                accountHolder: bankInfo.accountHolder
            };
        }

        // ===================================
        // التعامل مع الشيك
        // ===================================

        if (paymentMethod === "cheque") {
            const chequeDoc = await Cheque.create([{
                module: type,
                amount: Number(amount),
                chequeNumber: cheque.chequeNumber,
                chequeType: cheque.chequeType,
                bankName: cheque.bankName,
                receiveDate: cheque.receiveDate,
                dueDate: cheque.dueDate,
                notes: notes || "",
                createdBy: userId,
                status: "pending"
            }], { session });

            paymentData.cheque = chequeDoc[0]._id;
        }

        // ===================================
        // إنشاء الدفعة في قاعدة البيانات
        // ===================================

        const payment = await paymentModel.create([paymentData], { session });


                // ===================================
        // التعامل مع النقدي (cash)
        // ===================================

        if (paymentMethod === "cash") {
            // إنشاء معاملة نقدية
            await transaction.create([{
                type: type === "import" ? "income" : "expense",
                note: notes || `${type === "import" ? "استلام نقدي" : "صرف نقدي"} - تحويل أموال`,
                items: [{
                    title: type === "import" ? "إيراد نقدي" : "مصروف نقدي",
                    category: type === "import" ? "import" : "export",
                    amount: Number(amount)
                }],
                date: transactionDate || new Date(),
                createdBy: userId,
                ref:payment[0]._id
            }], { session });
        }
        // ===================================
        // تسجيل السجل (Log)
        // ===================================

        await createLog({
            section: type === "import" ? "إيرادات" : "مصروفات",
            action: type === "import" ? "استلام أموال" : "صرف أموال",
            userId: userId,
            targetId: payment[0]._id,
            title: `${type === "import" ? "إيراد" : "صرف"} - ${paymentMethodTranslation(paymentMethod)}`,
            details: `تم ${type === "import" ? "استلام" : "صرف"} مبلغ ${Number(amount).toLocaleString()} ج.م عن طريق ${paymentMethodTranslation(paymentMethod)}${notes ? ` - ملاحظات: ${notes}` : ''} بتاريخ ${new Date(transactionDate || Date.now()).toLocaleDateString("ar-EG")}.`,
            session,
        });

        // ===================================
        // إنهاء المعاملة
        // ===================================

        await session.commitTransaction();
        session.endSession();

        return res.status(201).json({
            success: true,
            message: type === "import" 
                ? "تم إضافة الإيراد بنجاح" 
                : "تم تسجيل خروج الأموال بنجاح",
            data: payment[0]
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// delete payment 
exports.deletePayment = async (req, res) => {
    const {paymentId} = req.params;
      const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const payment = await paymentModel.findByIdAndDelete(paymentId).session(session);
        if(!payment){
            return res.status(404).json({
                success: false,
                message: "الدفع غير موجود"
            });
        }

               if (payment.paymentMethod === "cash") {
            // إنشاء معاملة نقدية
            await transaction.deleteOne({
                ref:paymentId
        
               }, { session });
        }

                if (payment.paymentMethod === "wallet" &&
                payment.walletInfo?.transactionReference &&
               payment.walletInfo?.linkWallet && req.query.remove ) {
        
             try {
                    await axios.delete(
                        `${process.env.WalletUrl}/transaction/V2/${payment.walletInfo.transactionReference}`,
                        {
                            params:{
                                        delete:true
                                    },
                            headers: {
                                "x-api-key": process.env.INTERNAL_API_KEY,
                            },
                        }
                    );
                } catch (error) {
                    throw new Error(
                        error.response?.data?.message ||
                        "حدث خطأ أثناء حذف عملية المحفظة"
                    );
                }
        
            }

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: "تم حذف الدفع بنجاح"
        });
    }catch(err){
       await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
}




function paymentMethodTranslation(method) {
    const translations = {
        'cash': 'نقدي',
        'wallet': 'محفظة إلكترونية',
        'bank': 'تحويل بنكي',
        'instapay': 'إنستا باي',
        'cheque': 'شيك'
    };
    return translations[method] || method;
}

