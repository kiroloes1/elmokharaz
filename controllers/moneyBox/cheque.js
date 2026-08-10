const chequeModel = require( `${__dirname}/../../models/money/cheque`);
const paymentModel = require(`${__dirname}/../../models/money/payment`);
const customerModel=require(`${__dirname}/../../models/peapole/customer`)
const supplierModel=require(`${__dirname}/../../models/peapole/supplier`)

const transactionModel=require(`${__dirname}/../../models/money/TransactionBox`);
const deliveryModel=require(`${__dirname}/../../models/delivery/outDelivery`);
const mongoose = require('mongoose');
const { createLog } = require('../../services/createLogs');
// get all cheque

exports.getAllCheque = async (req, res) => {
    try {

        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filter = {};

        if (req.query.customerId) {
            filter.customer = req.query.customerId;
        }

        if (req.query.chequeType) {
            filter.chequeType = req.query.chequeType;
        }

        if (req.query.bankName) {
            filter.bankName = {
                $regex: req.query.bankName.trim(),
                $options: "i"
            };
        }

        if (req.query.status) {
            filter.status = req.query.status;
        }

        if (req.query.location) {
            filter.location = req.query.location;
        }

       if (req.query.moneyFlow) {
            filter.moneyFlow = req.query.moneyFlow;
        }

        if (req.query.chequeNumber) {
            filter.chequeNumber = {
                $regex: req.query.chequeNumber,
                $options: "i"
            };
        }

        // Receive Date
        if (req.query.receiveFrom || req.query.receiveTo) {
            filter.receiveDate = {};

            if (req.query.receiveFrom) {
                filter.receiveDate.$gte = new Date(req.query.receiveFrom);
            }

            if (req.query.receiveTo) {
                filter.receiveDate.$lte = new Date(req.query.receiveTo);
            }
        }

        // Due Date
        if (req.query.dueFrom || req.query.dueTo) {
            filter.dueDate = {};

            if (req.query.dueFrom) {
                filter.dueDate.$gte = new Date(req.query.dueFrom);
            }

            if (req.query.dueTo) {
                filter.dueDate.$lte = new Date(req.query.dueTo);
            }
        }

        const [cheques, totalCheques] = await Promise.all([

        chequeModel.find(filter)
        .populate("supplier", "name")
                .populate("customer", "name")
                

                .sort({ dueDate: 1 })
                .skip(skip)
                .limit(limit),

            chequeModel.countDocuments(filter)

        ]);

        // for(cheque of cheques){

        //     if((cheque.dueDate.getDay() == (new Date()).getDay) ,(cheque.dueDate.getMonth() , (new Date()).getMonth())
        //     && (cheque.dueDate.getFullYear() == (new Date()).getFullYear())){
       
        //         cheque.status="due_today"
        //         await cheque.save()
        //     }
        // }
        
        const Amounts=await chequeModel.find({},{amount:1})
        const totalAmounts=Amounts?.reduce((acc,curr)=>acc+ curr.amount,0)

        res.status(200).json({

            message: "تم جلب جميع الشيكات",

            cheques,

            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCheques / limit),
                totalCheques,
                limit
            }
            ,
            totalAmounts

        });

    } catch (err) {

        res.status(500).json({
            message: "Server error",
            error: err.message
        });

    }
};


// get cheque by id 
exports.getChequeByID=async(req,res)=>{
    try{
        const {id}=req.params;

        const cheque=await chequeModel.findById(id)
        .populate("customer")


        // if((cheque.dueDate.getDay() == (new Date()).getDay) ,(cheque.dueDate.getMonth() , (new Date()).getMonth())
        //     && (cheque.dueDate.getFullYear() == (new Date()).getFullYear())){
       
        //         cheque.status="due_today"
        //         await cheque.save()
        //     }
        

        if (!cheque) {
            return res.status(404).json({
                message: "الشيك غير موجود"
            });
        }
        

        res.status(200).json({
            message:"تم جلب الشيك بنجاح",
            cheque
        })



    }catch(err){
         return res.status(500).json({
            message: "Server error",
            error: err.message 
    })
}
}




// update cheque
exports.updateCheque = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { id } = req.params;
    const { status, location, notes, bankName, chequeType, receiveDate, dueDate } = req.body;

    const cheque = await chequeModel.findById(id).session(session);

    if (!cheque) {
      await session.abortTransaction();
      return res.status(404).json({ message: "الشيك غير موجود" });
    }

    const oldStatus = cheque.status;
    const oldLocation = cheque.location;

    // 1. منع التحديث لنفس الحالة الحالية
    if (status && status === oldStatus && (!bankName || !location || !chequeType || !receiveDate || !dueDate)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "الشيك بالفعل بهذه الحالة" });
    }

    let customer = null;
    let supplier = null;

    if (cheque.customer) {
      customer = await customerModel.findById(cheque.customer).session(session);
    }
    if (cheque.supplier) {
      supplier = await supplierModel.findById(cheque.supplier).session(session);
    }

    if (!customer && !supplier) {
      await session.abortTransaction();
      return res.status(404).json({ message: "العميل أو المورد المرتبط بالشيك غير موجود" });
    }

    // تحديث البيانات الأساسية
    if (location) cheque.location = location;
    if (bankName) cheque.bankName = bankName;
    if (chequeType) cheque.chequeType = chequeType;
    if (receiveDate) cheque.receiveDate = receiveDate;
    if (dueDate) cheque.dueDate = dueDate;
    if (notes !== undefined) cheque.notes = notes;

    // 2. إدارة التغيرات المالية بناءً على الانتقال بين الحالات
    if (status) {
      const inactiveStatuses = ["returned", "cancelled"];
      const isOldInactive = inactiveStatuses.includes(oldStatus);
      const isNewInactive = inactiveStatuses.includes(status);

      // ==========================================
      // أ) تأثير حساب العميل / المورد (الذمة المالية)
      // ==========================================
      if (customer) {
        if (cheque.moneyFlow === "incoming") {
          if (!isOldInactive && isNewInactive) customer.balance -= cheque.amount;
          else if (isOldInactive && !isNewInactive) customer.balance += cheque.amount;
        } else { // outgoing
          if (!isOldInactive && isNewInactive) customer.balance += cheque.amount;
          else if (isOldInactive && !isNewInactive) customer.balance -= cheque.amount;
        }
        await customer.save({ session });
      } else if (supplier) {
        if (cheque.moneyFlow === "outgoing") {
          if (!isOldInactive && isNewInactive) supplier.balance += cheque.amount;
          else if (isOldInactive && !isNewInactive) supplier.balance -= cheque.amount;
        } else { // incoming
          if (!isOldInactive && isNewInactive) supplier.balance -= cheque.amount;
          else if (isOldInactive && !isNewInactive) supplier.balance += cheque.amount;
        }
        await supplier.save({ session });
      }

      // ==========================================
      // ب) تأثير الخزنة (جدول المعاملات Transaction) مضبوط بالـ moneyFlow
      // ==========================================
      const owner = customer || supplier;
      const isIncoming = cheque.moneyFlow === "incoming";

      // تجهيز الحقول الخاصة بالـ Transaction بشكل سليم
      const transactionPayload = {
        note: "",
        ...(customer && { customerId: customer._id }),
        ...(supplier && { supplierId: supplier._id }),
        items: []
      };

      // 1. تحول الحالة إلى "تم التحصيل/الصرف" (collected)
      if (status === "collected" && oldStatus !== "collected") {
        transactionPayload.type = isIncoming ? "income" : "expense";
        transactionPayload.note = isIncoming 
          ? `تحصيل شيك وارد رقم ${cheque.chequeNumber} من ${owner.name}`
          : `صرف شيك صادر رقم ${cheque.chequeNumber} لـ ${owner.name}`;
        
        transactionPayload.items.push({
          title: transactionPayload.note,
          category: isIncoming ? "cheque" : "supplier",
          amount: cheque.amount
        });

        await transactionModel.create([transactionPayload], { session });
      }

      // 2. التراجع عن حالة "تم التحصيل/الصرف" (collected) إلى أي حالة أخرى
      if (oldStatus === "collected" && status !== "collected") {
        // عكس الحركة السابقة تماماً
        transactionPayload.type = isIncoming ? "expense" : "income";
        transactionPayload.note = isIncoming
          ? `تراجع عن تحصيل شيك وارد رقم ${cheque.chequeNumber} (تعديل لـ ${status})`
          : `تراجع عن صرف شيك صادر رقم ${cheque.chequeNumber} (تعديل لـ ${status})`;

        transactionPayload.items.push({
          title: transactionPayload.note,
          category: isIncoming ? "expense" : "income",
          amount: cheque.amount
        });

        await transactionModel.create([transactionPayload], { session });
      }

      cheque.status = status;
    }

    cheque.updatedBy = req.user.userId;
    await cheque.save({ session });

    const ownerForLog = customer || supplier;

    await createLog({
      section: "الشيكات",
      action: "تعديل",
      userId: req.user.userId,
      targetId: cheque._id,
      title: `شيك رقم ${cheque.chequeNumber}`,
      details: `تم تعديل الشيك رقم ${cheque.chequeNumber} لـ ${ownerForLog.name}.
        الحالة: ${oldStatus} → ${cheque.status}.
        الاتجاه: ${cheque.moneyFlow === "incoming" ? "وارد" : "صادر"}.
        الموقع: ${oldLocation || "-"} → ${cheque.location || "-"}.
        البنك: ${cheque.bankName}.
        قيمة الشيك: ${Number(cheque.amount).toLocaleString()} ج.م.`,
      session
    });

    await session.commitTransaction();

    return res.status(200).json({
      message: "تم تحديث الشيك والتأثيرات المالية بنجاح",
      cheque,
      changes: {
        oldStatus,
        newStatus: cheque.status,
        oldLocation,
        newLocation: cheque.location
      }
    });

  } catch (err) {
    await session.abortTransaction();
    return res.status(500).json({
      message: "خطأ في السيرفر",
      error: err.message
    });
  } finally {
    session.endSession();
  }
};


exports.notification = async (req, res) => {
    try {

        const today = new Date();

        // بداية اليوم
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);

        // نهاية اليوم
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        // بعد 3 أيام
        const nextThreeDays = new Date(today);
        nextThreeDays.setDate(nextThreeDays.getDate() + 3);
        nextThreeDays.setHours(23, 59, 59, 999);

        const [dueToday, lateCheques, upcoming] = await Promise.all([

            // مستحقة اليوم
            chequeModel.find({
                dueDate: {
                    $gte: startOfDay,
                    $lte: endOfDay
                },
                status: {
                    $nin: ["collected", "returned", "cancelled"]
                }
            }).populate("customer", "name")
            .populate("supplier", "name"),

            // متأخرة
            chequeModel.find({
                dueDate: {
                    $lt: startOfDay
                },
                status: {
                    $nin: ["collected", "returned", "cancelled"]
                }
            }).populate("customer", "name")
            .populate("supplier", "name"),

            // خلال 3 أيام
            chequeModel.find({
                dueDate: {
                    $gt: endOfDay,
                    $lte: nextThreeDays
                },
                status: {
                    $nin: ["collected", "returned", "cancelled"]
                }
            }).populate("customer", "name")
            .populate("supplier", "name")

        ]);

        res.status(200).json({

            message: "تم جلب التنبيهات بنجاح",

            summary: {
                dueToday: dueToday.length,
                late: lateCheques.length,
                upcoming: upcoming.length
            },

            notifications: {
                dueToday,
                lateCheques,
                upcoming
            }

        });

    } catch (err) {

        res.status(500).json({
            message: "Server error",
            error: err.message
        });

    }
};