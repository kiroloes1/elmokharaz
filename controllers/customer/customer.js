const customerModel=require(`${__dirname}/../../models/peapole/customer`);
const outDeliveryMoedl=require(`${__dirname}/../../models/delivery/outDelivery`)
const Transaction=require(`${__dirname}/../../models/money/TransactionBox`)
const paymentModel =require(`${__dirname}/../../models/money/payment`)
const Cheque =require(`${__dirname}/../../models/money/cheque`)
const mongoose =require('mongoose')
const axios =require(`axios`);
const customer = require('../../models/peapole/customer');
const { createLog } = require('../../services/createLogs');


  const paymentMethodTranslation=(method)=>{
     if(method=="cash"){
      return "نقدي";
     }
     else if(method=="cash"){
        return "نقدي";
     }
          else if(method=="wallet"){
        return "محفظه";
     }
          else if(method=="bank"){
        return "بنك";
     }
          else if(method=="instapay"){
        return "انستا باي";
     }
          else if(method=="mail"){
        return "بريد";
     }
               else if(method=="cheque"){
        return "شيك";
     }
               else if(method=="work"){
        return "شغل";
     }else{
      return method
     }
  }
// ================= GET ALL =================
exports.getAllSuppliers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const total = await customerModel.countDocuments();

    const suppliers = await customerModel
      .find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
     
      

    res.status(200).json({
      message: "Success",
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
      data: suppliers,
    });

  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

exports.getAllSupplierName = async (req, res) => {
  try {
    const suppliers = await customerModel.find({},{_id:1,name:1,balance:1}).sort({ createdAt: -1 });

    res.status(200).json({
      message: "Success",
      data: suppliers,
    });
  } catch (err) {
    res.status(500).json({ message:err.message });
  }
};


// ================= GET BY ID =================
exports.getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;

    const supplier = await customerModel.findById(id);

    if (!supplier)
      return res.status(404).json({ message: "هذا العميل غير موجود" });

    const payments = await paymentModel.find({
      customer: id,
      amount: { $gt: 0 }
    })
      .populate("createdBy", "username email")
      .populate("updatedBy", "username email")
      .populate("cheque")
      .lean();

      

    // حذف الشيكات الملغية والمرتجعة
    const filteredPayments = payments.filter(payment => {
      if (payment.paymentMethod !== "cheque") return true;

      return (
        payment.cheque &&
        !["returned", "cancelled"].includes(payment.cheque.status)
      );
    });

    res.status(200).json({
      message: "Success",
      data: supplier,
      payment: filteredPayments
    });

  } catch (err) {
    res.status(500).json({ message: "حدث خطاء ما في السيرفر", err });
  }
};

// ================= CREATE =================
exports.createNewSupplier = async (req, res) => {
  try {
    const { name, phone, notes , openBalance } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        message: "اسم العميل مطلوب"
      });
    }
    if(!phone){
       return res.status(400).json({
        message: "رقم الهاتف مطلوب"
      });
    }

    const existSupplier = await customerModel.findOne({ name: name.trim() });

    if (existSupplier) {
      return res.status(409).json({
        message:  " اسم العميل موجود بالفعل من فضلك غير اسمه "
      });
    }


    const newSupplier = await customerModel.create({
      name: name.trim(),
      phone: phone?.trim(),
      notes: notes?.trim(),
      openningBalance:Number(openBalance || 0),
      balance:Number(openBalance || 0)
    });

    await createLog({
        section: "عملاء النقلات",
        action: "إنشاء",
        userId: req?.user?.userId,
        targetId: newSupplier._id,
        title: newSupplier.name,
        details: `تم إنشاء المورد ${newSupplier.name}`,
   
      });

    res.status(201).json({
      message: "تم اضافه العميل بنجاح",
      data: newSupplier
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= UPDATE =================
exports.updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;


    const updates = req.body;


    const oldSupplier = await customerModel.findById(id);

    if (!oldSupplier) {
      return res.status(404).json({
        message: "هذا العميل غير موجود",
      });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "من فضلك املاء جميع الحقول"
      });
    }

    
    if (!updates.name || updates.name.trim().length < 2) {
      return res.status(400).json({
        message: "اسم العميل مطلوب"
      });
    }
    if(!updates.phone){
       return res.status(400).json({
        message: "رقم الهاتف مطلوب"
      });
    }


    const supplier = await customerModel.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );


    const changes = [];

  if (oldSupplier.name !== supplier.name) {
    changes.push(`الاسم: "${oldSupplier.name}" ← "${supplier.name}"`);
  }

  if (oldSupplier.phone !== supplier.phone) {
    changes.push(`الهاتف: "${oldSupplier.phone}" ← "${supplier.phone}"`);
  }

  if ((oldSupplier.notes || "") !== (supplier.notes || "")) {
    changes.push(
      `الملاحظات: "${oldSupplier.notes || "لا يوجد"}" ← "${supplier.notes || "لا يوجد"}"`
    );
  }

  if (oldSupplier.balance !== supplier.balance) {
    changes.push(
      `الرصيد: ${oldSupplier.balance} ← ${supplier.balance}`
    );
  }

  await createLog({
    section: "عملاء نقلات",
    action: "تعديل",
    userId: req?.user?.userId,
    targetId: supplier._id,
    title: supplier.name,
    details:
      changes.length > 0
        ? `تم تعديل المورد ${supplier.name}. التغييرات: ${changes.join(" | ")}`
        : `تم فتح شاشة التعديل بدون تغيير أي بيانات.`,

      });


    res.status(200).json({
      message: "تم تحديث بيانات العميل بنجاح",
      data: supplier
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteSupplier = async (req, res) => {
  const { id } = req.params;

  const session = await mongoose.startSession();

  session.startTransaction()
  try {
    const supplier = await customerModel.findById(id);

    if (!supplier) {
      return res.status(404).json({
        message: "هذا المورد غير موجود",
      });
    }

    // حذف معاملات المحفظة أولاً
    const payments = await paymentModel.find({ customer: id });

    for (const payment of payments) {
      if (
        payment.paymentMethod === "wallet" &&
        payment.walletInfo?.transactionReference
      ) {
        await axios.delete(
          `${process.env.WalletUrl}/transaction/V2/${payment.walletInfo.transactionReference}`,
          {
            headers: {
              "x-api-key": process.env.INTERNAL_API_KEY,
            },
          }
        );
      }
    }


    await outDeliveryMoedl.deleteMany(
      { supplier: id },
      { session }
    );

    await paymentModel.deleteMany(
      { customer: id },
      { session }
    );

    await Cheque.deleteMany(
      { customer: id },
      { session }
    );

    await Transaction.deleteMany(
      { customerId: id },
      { session }
    );

    await customerModel.findByIdAndDelete(id, { session });


        await createLog({
        section: "عملاء النقلات",
        action: "حذف",
        userId: req?.user?.userId,
        targetId: supplier._id,
        title: supplier.name,
        details: `تم حذف المورد ${supplier.name}`,
    session,
      });

    
    await session.commitTransaction();

    res.status(200).json({
      message: "تم حذف بيانات المورد بنجاح",
      data: supplier,
    });
  } catch (err) {
    await session.abortTransaction();

    res.status(500).json({
      message: err.message,
    });
  } finally {
    session.endSession();
  }
};

// ================= ADD DEBT ================= 

exports.addDebt = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { amount, note,paymentMethod ,date } = req.body;
    const userId=req?.user?.userId;

    if (!paymentMethod || !["cash" , "wallet" ,"instapay" ,"bank" ,"work","mail" ,"cheque"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "طريقة الدفع غير صحيحة"
      });
    }



    if (!amount || amount <= 0)
      return res.status(400).json({ message: "المبلغ لازم يكون قيمه موجبه" });


    const supplier = await customerModel.findById(id).session(session);

    if (!supplier)
      return res.status(404).json({ message: "العميل غير موجود" });

   
    const oldSupplier=supplier.balance;
    // supplier.balance += amount;
    supplier.balance = parseFloat((supplier.balance - amount).toFixed(2));

    await supplier.save({session});

    if (paymentMethod === "cash"){

       

        await Transaction.create([{
            type: "expense",
            note: note || "دفع فلوس نقدي  العميل " + supplier.name,
            items: [{
                title: " دفع العميل " + supplier.name,
                category: "customer",
                amount: Number(amount)
            }],
           customerId: supplier._id,

           date:date|| new Date()
            
        }], { session });

    }

    const paymentData = {
        customer: id,
        module: "pay",
        amount: Number(amount),
        paymentMethod,
        moneyFlow: "outgoing",
        transactionDate: date || new Date(),
        notes: note || "",
        createdBy: userId,
        updatedBy:null
    };

    if ((paymentMethod === "bank" || paymentMethod === "instapay") && !req.body.bankInfo) {
    throw new Error("بيانات البنك مطلوبة");
}


    if (paymentMethod === "cheque" && !req.body.cheque) {
    throw new Error("بيانات الشيك مطلوبة");
}

    if (paymentMethod === "wallet") {

    if (!req.body.walletInfo) {
        throw new Error("بيانات المحفظة مطلوبة");
    }

    paymentData.walletInfo = {
        provider: req.body.walletInfo.provider,
        senderName: req.body.walletInfo.senderName,
        senderPhone: req.body.walletInfo.senderPhone,
        receiverName: req.body.walletInfo.receiverName,
        receiverPhone: req.body.walletInfo.receiverPhone,
        transactionReference: req.body.walletInfo.transactionReference,
    };

        // walletTransInfo
        // senderName ,receiverName,senderPhone,receiverPhone,notes,amount,walletId
        formData={
                walletId:     req.body.walletInfo.walletId,
                senderName:   req.body.walletInfo?.senderName,
                receiverName: req.body.walletInfo?.receiverName,
                senderPhone:  req.body.walletInfo?.senderPhone,
                receiverPhone:req.body.walletInfo?.receiverPhone,
                type: 'send',
                notes:  `عمليه ارسال اموال الي العميل ${supplier.name} سيستم المخرز`,
                amount: Number(req.body.amount),
                createdAt:date,
        }
    
    
        if(req.body.walletInfo?.linkWallet){
    
            
            try {
       const trans= await axios.post(
            `${process.env.WalletUrl}/transaction/V2`,
            formData,
            {
                headers: {
                    "x-api-key": process.env.INTERNAL_API_KEY,
                    "Content-Type": "application/json",
                }
            }
        );
       
       paymentData.walletInfo.transactionReference =
        trans.data.transaction[0]._id;
    
        paymentData.walletInfo.linkWallet =
        true;
           paymentData.walletInfo.walletId =
        req.body.walletInfo.walletId;
    
    } catch (error) {
    
throw new Error(
    error.response?.data?.message ||
    error.message ||
    JSON.stringify(error.response?.data) ||
    "حدث خطأ غير معروف"
);
    }
    }
}

    if (paymentMethod === "bank" || paymentMethod === "instapay") {
        paymentData.bankInfo = {
            bankName: req.body.bankInfo.bankName,
            transactionReference: req.body.bankInfo.transactionReference,
        };
    }

    if (paymentMethod === "cheque") {

    const cheque = await Cheque.create([{
        customer: id,
        module: "pay",
        amount: Number(amount),
        chequeNumber: req.body.cheque.chequeNumber,
        chequeType: req.body.cheque.chequeType,
        bankName: req.body.cheque.bankName,
        receiveDate: req.body.cheque.receiveDate,
        dueDate: req.body.cheque.dueDate,
        notes: note,
        moneyFlow: "outgoing",
        createdBy: userId
    }], { session });

    paymentData.cheque = cheque[0]._id;
}
await paymentModel.create([paymentData], { session });


await createLog({
  section: "عملاء النقلات",
  action: "دفع للعميل",
  userId: req?.user?.userId,
  targetId: supplier._id,
  title: supplier.name,
details: `تم دفع مبلغ ${Number(amount).toLocaleString()} ج.م إلى العميل "${supplier.name}" عن طريق ${paymentMethodTranslation(paymentMethod)}. تم تحديث رصيد العميل من ${Number(oldSupplier).toLocaleString()} ج.م إلى ${Number(supplier.balance).toLocaleString()} ج.م بتاريخ ${new Date(date || Date.now()).toLocaleDateString("ar-EG")}.`
,session,
});

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "تم اضافه الدين بنجاح",
      balance: supplier.balance
    });

  } catch (err) {
      await session.abortTransaction();
      session.endSession();
    res.status(500).json({ message: "Server error",   error: err.message });
  }
};



// استلام فلوس 
exports.paySupplier = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { amount, note,paymentMethod ,date } = req.body;
    const userId=req?.user?.userId;

    if (!paymentMethod || !["cash" , "wallet" ,"instapay" ,"bank" ,"work","mail" ,"cheque"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "طريقة الدفع غير صحيحة"
      });
    }



    if (!amount || amount <= 0)
      return res.status(400).json({ message: "المبلغ لازم يكون قيمه موجبه" });


    const supplier = await customerModel.findById(id).session(session);

    if (!supplier)
      return res.status(404).json({ message: "العميل غير موجود" });

   
     const oldSupplier=supplier.balance;
    // supplier.balance += amount;
    supplier.balance = parseFloat((supplier.balance + amount).toFixed(2));

    await supplier.save({session});

    
    if (paymentMethod === "cash") {

        

        await Transaction.create([{
            
            type: "income",
            note: note || "استلام فلوس نقدي من العميل " + supplier.name,
            items: [{
                title: "استلام فلوس من العميل  " + supplier.name,
                category: "customer",
                amount: Number(amount)
            }],
            customerId: supplier._id,
            date:date  || new Date()
            
        }], { session });
    }


    const paymentData = {
        customer: id,
        module: "debt",
        amount: Number(amount),
        paymentMethod,
        moneyFlow: "incoming",
        transactionDate: date || new Date(),
        notes: note || "",
        createdBy: userId,
        updatedBy:null
    };
    if (paymentMethod === "wallet") {

    if (!req.body.walletInfo) {
        throw new Error("بيانات المحفظة مطلوبة");
    }

    paymentData.walletInfo = {
        provider: req.body.walletInfo.provider,
        senderName: req.body.walletInfo.senderName,
        senderPhone: req.body.walletInfo.senderPhone,
        receiverName: req.body.walletInfo.receiverName,
        receiverPhone: req.body.walletInfo.receiverPhone,
        transactionReference: req.body.walletInfo.transactionReference,
    };

        // walletTransInfo
        // senderName ,receiverName,senderPhone,receiverPhone,notes,amount,walletId
        formData={
                walletId:       req.body.walletInfo.walletId,
                senderName:     req.body.walletInfo?.senderName,
                receiverName:   req.body.walletInfo?.receiverName,
                senderPhone:    req.body.walletInfo?.senderPhone,
                receiverPhone:  req.body.walletInfo?.receiverPhone,
                type: 'receive',
                notes:  `عمليه استلام اموال من العميل ${supplier.name} سيستم المخرز`,
                amount: Number(req.body.amount),
                createdAt:date,
        }
    
    
        if(req.body.walletInfo?.linkWallet){
    
            
            try {
       const trans= await axios.post(
            `${process.env.WalletUrl}/transaction/V2`,
            formData,
            {
                headers: {
                    "x-api-key": process.env.INTERNAL_API_KEY,
                    "Content-Type": "application/json",
                }
            }
        );
       
       paymentData.walletInfo.transactionReference =
        trans.data.transaction[0]._id;
    
        paymentData.walletInfo.linkWallet =
        true;
           paymentData.walletInfo.walletId =
        req.body.walletInfo.walletId;
    
    } catch (error) {
    
throw new Error(
    error.response?.data?.message ||
    error.message ||
    JSON.stringify(error.response?.data) ||
    "حدث خطأ غير معروف"
);
    }
    }

}
if ((paymentMethod === "bank" || paymentMethod === "instapay") && !req.body.bankInfo) {
    throw new Error("بيانات البنك مطلوبة");
}

    if (paymentMethod === "bank" || paymentMethod === "instapay") {
        paymentData.bankInfo = {
            bankName: req.body.bankInfo.bankName,
            transactionReference: req.body.bankInfo.transactionReference,
        };
    }

    if (paymentMethod === "cheque" && !req.body.cheque) {
    throw new Error("بيانات الشيك مطلوبة");
}
    if (paymentMethod === "cheque") {

    const cheque = await Cheque.create([{
        customer: id,
        module: "debt",
        amount: Number(amount),
        chequeNumber: req.body.cheque.chequeNumber,
        chequeType: req.body.cheque.chequeType,
        bankName: req.body.cheque.bankName,
        receiveDate: req.body.cheque.receiveDate,
        dueDate: req.body.cheque.dueDate,
        notes: note,
        moneyFlow: "incoming",
        createdBy: userId
    }], { session });

    paymentData.cheque = cheque[0]._id;
}
await paymentModel.create([paymentData], { session });


await createLog({
  section: "عملاء النقلات",
  action: "استلام مبلغ من العميل",
  userId: req?.user?.userId,
  targetId: supplier._id,
  title: supplier.name,
  details: `تم استلام مبلغ ${Number(amount).toLocaleString()} ج.م من العميل "${supplier.name}" عن طريق ${paymentMethodTranslation(paymentMethod)}. تغير الرصيد من ${Number(oldSupplier).toLocaleString()} ج.م إلى ${Number(supplier.balance).toLocaleString()} ج.م بتاريخ ${new Date(date || Date.now()).toLocaleString("ar-EG")}.`
,session,
});

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "تم اضافه السداد بنجاح",
      balance: supplier.balance
    });

  } catch (err) {
      await session.abortTransaction();
      session.endSession();
    res.status(500).json({ message: "Server error",   error: err.message });
  }
};


// exports.deletePaymentHistory = async (req, res) => {
//   const session = await mongoose.startSession();
//  session.startTransaction();
//   try {

   

//     const { paymentId, supplierId } = req.params;

//     const supplier = await customerModel.findById(supplierId).session(session);

//     if (!supplier) {
//       await session.abortTransaction();
//       session.endSession();

//       return res.status(404).json({
//         message: "العميل غير موجود"
//       });
//     }

//   const existPaymentHistory = await paymentModel.findById(paymentId).session(session);
//   if (!existPaymentHistory) {
//       await session.abortTransaction();
//       session.endSession();

//       return res.status(404).json({
//           message: "عملية الدفع غير موجودة"
//       });
//   }

//     if (existPaymentHistory.module == "debt") {

//       supplier.balance = parseFloat(
//         (supplier.balance - existPaymentHistory.amount).toFixed(2)
//       );

//     } else {

//       supplier.balance = parseFloat(
//         (supplier.balance + existPaymentHistory.amount).toFixed(2)
//       );
//     }

//     // delete transaction if cash
//     if (existPaymentHistory.paymentMethod === "cash") {

//       await Transaction.findOneAndDelete({
//         customerId: supplier._id,
//         totalAmount: existPaymentHistory.amount,
//         type:
//     existPaymentHistory.module === "debt"
//         ? "income"
//         : "expense"
//       }).session(session);

//     }

//         if (existPaymentHistory.paymentMethod === "wallet" &&
//         existPaymentHistory.walletInfo?.transactionReference &&
//        existPaymentHistory.walletInfo?.linkWallet && !req.query.delete ) {

//      try {
//             await axios.delete(
//                 `${process.env.WalletUrl}/transaction/V2/${existPaymentHistory.walletInfo.transactionReference}`,
//                 {
//                     params:{
//                                 delete:true
//                             },
//                     headers: {
//                         "x-api-key": process.env.INTERNAL_API_KEY,
//                     },
//                 }
//             );
//         } catch (error) {
//             throw new Error(
//                 error.response?.data?.message ||
//                 "حدث خطأ أثناء حذف عملية المحفظة"
//             );
//         }

//     }

//     if (existPaymentHistory.cheque) {
//     await Cheque.findByIdAndDelete(
//         existPaymentHistory.cheque
//     ).session(session);
// }


//    await paymentModel.findByIdAndDelete(paymentId).session(session);
//     await supplier.save({ session });

//     await createLog({
//   section: "عملاء النقلات",
//   action: "حذف",
//   userId: req?.user?.userId,
//   targetId: supplier._id,
//   title: supplier.name,
//   details: `تم حذف عملية ${existPaymentHistory.module === "debt" ? "استلام" : "دفع"} بقيمة ${Number(existPaymentHistory.amount).toLocaleString()} ج.م كانت تمت عن طريق ${existPaymentHistory.paymentMethod}. تغير رصيد العميل من ${Number(
//     existPaymentHistory.module === "debt"
//       ? supplier.balance - existPaymentHistory.amount
//       : supplier.balance + existPaymentHistory.amount
//   ).toLocaleString()} ج.م إلى ${Number(supplier.balance).toLocaleString()} ج.م بتاريخ ${new Date().toLocaleString("ar-EG")}.`
// ,session,
// });
//     await session.commitTransaction();
//     session.endSession();

//     res.status(200).json({
//       message: "تم حذف العملية بنجاح",
//       balance: supplier.balance
//     });

//   } catch (err) {

//     await session.abortTransaction();
//     session.endSession();

//     res.status(500).json({
//       message: err.message ||"Server error",
//       error: err.message
//     });
//   }
// };


exports.deletePaymentHistory = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { paymentId, supplierId } = req.params;

    // =========================================================
    // 1. GET SUPPLIER
    // =========================================================

    const supplier = await customerModel
      .findById(supplierId)
      .session(session);

    if (!supplier) {
      await session.abortTransaction();

      return res.status(404).json({
        message: "التاجر غير موجود",
      });
    }

    // =========================================================
    // 2. GET PAYMENT
    // =========================================================

    let payment = await paymentModel
      .findById(paymentId)
      .session(session);

    /*
      لو الـ paymentId اللي جاي هو ID الشيك
      نبحث عن عملية الدفع المرتبطة بالشيك
    */

    if (!payment) {
      payment = await paymentModel
        .findOne({
          cheque: paymentId,
        })
        .session(session);
    }

    if (!payment) {
      await session.abortTransaction();

      return res.status(404).json({
        message: "عملية الدفع غير موجودة",
      });
    }

    // =========================================================
    // 3. CHECK PAYMENT BELONGS TO SUPPLIER
    // =========================================================

    if (
      payment.supplierId &&
      payment.supplierId.toString() !== supplier._id.toString()
    ) {
      await session.abortTransaction();

      return res.status(403).json({
        message: "عملية الدفع لا تخص هذا التاجر",
      });
    }

    // =========================================================
    // 4. SAVE OLD BALANCE FOR LOG
    // =========================================================

    const oldBalance = Number(supplier.balance || 0);

    const amount = Number(payment.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("قيمة عملية الدفع غير صحيحة");
    }

    // =========================================================
    // 5. REVERSE SUPPLIER BALANCE
    // =========================================================

    /*
      هنا بنعكس تأثير العملية القديمة.

      debt:
        balance - amount

      غير debt:
        balance + amount
    */

    if (payment.module === "debt") {
      supplier.balance = Number(
        (oldBalance - amount).toFixed(2)
      );
    } else {
      supplier.balance = Number(
        (oldBalance + amount).toFixed(2)
      );
    }

    // =========================================================
    // 6. DELETE TRANSACTION IF CASH
    // =========================================================

    if (payment.paymentMethod === "cash") {
      await Transaction.findOneAndDelete({
        supplierId: supplier._id,
        totalAmount: amount,
        type:
          payment.module === "pay"
            ? "expense"
            : "income",
      }).session(session);
    }

    // =========================================================
    // 7. DELETE WALLET TRANSACTION
    // =========================================================

    if (
      payment.paymentMethod === "wallet" &&
      payment.walletInfo?.transactionReference &&
      payment.walletInfo?.linkWallet &&
      !req.query.delete
    ) {
      try {
        await axios.delete(
          `${process.env.WalletUrl}/transaction/V2/${payment.walletInfo.transactionReference}`,
          {
            params: {
              delete: true,
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

    // =========================================================
    // 8. DELETE CHEQUE
    // =========================================================

    if (payment.cheque) {
      await Cheque.findByIdAndDelete(
        payment.cheque
      ).session(session);
    }

    /*
      لو paymentId كان ID الشيك،
      هنا بنحذف payment._id وليس paymentId
    */

    await paymentModel
      .findByIdAndDelete(payment._id)
      .session(session);

    // =========================================================
    // 9. SAVE SUPPLIER
    // =========================================================

    await supplier.save({
      session,
    });

    // =========================================================
    // 10. CREATE LOG
    // =========================================================

    await createLog({
      section: "تجار مشتريات",
      action: "حذف",
      userId: req?.user?.userId,
      targetId: supplier._id,
      title: supplier.name,

      details: `تم حذف عملية ${
        payment.module === "pay"
          ? "دفع"
          : "استلام"
      } بقيمة ${amount.toLocaleString()} ج.م كانت تمت عن طريق ${
        payment.paymentMethod
      }. تغير رصيد التاجر من ${oldBalance.toLocaleString()} ج.م إلى ${Number(
        supplier.balance
      ).toLocaleString()} ج.م بتاريخ ${new Date().toLocaleString(
        "ar-EG"
      )}.`,

      session,
    });

    // =========================================================
    // 11. COMMIT
    // =========================================================

    await session.commitTransaction();

    // =========================================================
    // 12. RESPONSE
    // =========================================================

    return res.status(200).json({
      message: "تم حذف العملية بنجاح",
      balance: supplier.balance,
    });
  } catch (err) {
    // =========================================================
    // ROLLBACK
    // =========================================================

    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error(
      "deletePaymentHistory error:",
      err
    );

    return res.status(500).json({
      message: err.message || "Server error",
      error: err.message,
    });
  } finally {
    // =========================================================
    // END SESSION
    // =========================================================

    await session.endSession();
  }
};


// edit payment history
exports.editPaymentHistory = async (req, res) => {
  const session = await mongoose.startSession();

  try {

    session.startTransaction();

    const { supplierId, paymentId } = req.params;

    const {
      amount,
      paymentMethod,
      type,
      note,
      date
    } = req.body;

    const supplier = await customerModel.findById(supplierId).session(session);

    if (!supplier) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        message: "العميل غير موجود"
      });
    }

  const existPaymentHistory = await paymentModel.findById(paymentId).session(session);
  if (!existPaymentHistory) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
          message: "عملية الدفع غير موجودة"
      });
  }

    // ------------------------
    // رجع تأثير العملية القديمة
    // ------------------------

    if (existPaymentHistory.module == "debt") {

      supplier.balance = parseFloat(
        (supplier.balance - existPaymentHistory.amount).toFixed(2)
      );

    } else {

      supplier.balance = parseFloat(
        (supplier.balance + existPaymentHistory.amount).toFixed(2)
      );
    }

    // delete transaction if cash
    if (existPaymentHistory.paymentMethod === "cash") {

      await Transaction.findOneAndDelete({
        customerId: supplier._id,
        totalAmount: existPaymentHistory.amount,
        type:
    existPaymentHistory.module === "debt"
        ? "income"
        : "expense"
      }).session(session);

    }

     if (existPaymentHistory.paymentMethod === "wallet" &&
        existPaymentHistory.walletInfo?.transactionReference &&
       existPaymentHistory.walletInfo?.linkWallet ) {

     try {
            await axios.delete(
                `${process.env.WalletUrl}/transaction/V2/${existPaymentHistory.walletInfo.transactionReference}`,
                {
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

    if (existPaymentHistory.cheque) {
    await Cheque.findByIdAndDelete(
        existPaymentHistory.cheque
    ).session(session);
}

    // ------------------------
    // تعديل البيانات
    // ------------------------


    existPaymentHistory.walletInfo = undefined;
    existPaymentHistory.bankInfo = undefined;
    existPaymentHistory.cheque = undefined;

    existPaymentHistory.amount = amount;
    existPaymentHistory.paymentMethod = paymentMethod;
    existPaymentHistory.module = type;
    existPaymentHistory.notes = note;
    existPaymentHistory.transactionDate = date;

    // ------------------------
    // طبق تأثير العملية الجديدة
    // ------------------------

    if (existPaymentHistory.module == "debt") {

      supplier.balance += existPaymentHistory.amount;

    } else {

      supplier.balance -= existPaymentHistory.amount;

    }

    supplier.balance = Number(
      supplier.balance.toFixed(2)
    );



    // ------------------------
    // أنشئ Transaction جديدة لو Cash
    // ------------------------

    if (existPaymentHistory.paymentMethod === "cash") {

await Transaction.create([{
    type: existPaymentHistory.module === "debt"
        ? "income"
        : "expense",

    note:
        existPaymentHistory.notes ||
        (existPaymentHistory.module === "debt"
            ? `استلام فلوس نقدي من العميل ${supplier.name}`
            : `دفع فلوس نقدي للعميل ${supplier.name}`),

    items: [{
        title:
            existPaymentHistory.module === "debt"
                ? `استلام فلوس من العميل ${supplier.name}`
                : `دفع فلوس للعميل ${supplier.name}`,
        category: "customer",
        amount: Number(existPaymentHistory.amount)
    }],

    customerId: supplier._id,

    date: existPaymentHistory.transactionDate || new Date()

}], { session });

    }

    if (
    existPaymentHistory.paymentMethod === "wallet" 
) {

    const walletType =
        existPaymentHistory.module === "debt"
            ? "receive"
            : "send";
    if (!req.body.walletInfo) {
    throw new Error("بيانات المحفظة مطلوبة");
}        

    const formData = {
        walletId: req.body.walletInfo.walletId,
        senderName: req.body.walletInfo.senderName,
        receiverName: req.body.walletInfo.receiverName,
        senderPhone: req.body.walletInfo.senderPhone,
        receiverPhone: req.body.walletInfo.receiverPhone,
        type: walletType,
        notes:
            walletType === "receive"
                ? `عملية استلام أموال من العميل ${supplier.name}`
                : `عملية إرسال أموال إلى العميل ${supplier.name}`,
        amount: Number(existPaymentHistory.amount),
        createdAt: existPaymentHistory.transactionDate
    };

    try {
      existPaymentHistory.walletInfo = {
          provider: req.body.walletInfo.provider,
          senderName: req.body.walletInfo.senderName,
          senderPhone: req.body.walletInfo.senderPhone,
          receiverName: req.body.walletInfo.receiverName,
          receiverPhone: req.body.walletInfo.receiverPhone,
          walletId: req.body.walletInfo.walletId,
          transactionReference: null,
          linkWallet: false
      };

       if (req.body.walletInfo.linkWallet) {
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

    existPaymentHistory.walletInfo.transactionReference =
          trans.data.transaction[0]._id;

      existPaymentHistory.walletInfo.linkWallet = true;
              existPaymentHistory.walletInfo.walletId =
        req.body.walletInfo.walletId;
      }

    } catch (error) {

        throw new Error(
            error.response?.data?.message ||
            error.message ||
            "حدث خطأ أثناء إنشاء عملية المحفظة"
        );
    }
}

if (
    paymentMethod === "bank" ||
    paymentMethod === "instapay"
) {

    if (!req.body.bankInfo) {
        throw new Error("بيانات البنك مطلوبة");
    }

    existPaymentHistory.bankInfo = {
        bankName: req.body.bankInfo.bankName,
        transactionReference:
            req.body.bankInfo.transactionReference
    };
}


if (paymentMethod === "cheque") {

    if (!req.body.cheque) {
        throw new Error("بيانات الشيك مطلوبة");
    }

    const cheque = await Cheque.create([{
        customer: supplier._id,
        module: type,
        amount: Number(amount),
        chequeNumber: req.body.cheque.chequeNumber,
        chequeType: req.body.cheque.chequeType,
        bankName: req.body.cheque.bankName,
        receiveDate: req.body.cheque.receiveDate,
        dueDate: req.body.cheque.dueDate,
        notes: note,
        createdBy: req?.user?.userId,
        moneyFlow:existPaymentHistory.module === "debt" ? "incoming"  :"outgoing"
    }], { session });

    existPaymentHistory.cheque = cheque[0]._id;
}

existPaymentHistory.updatedBy = req?.user?.userId;
await existPaymentHistory.save({ session });
    await supplier.save({ session });

    await createLog({
  section: "عملاء النقلات",
  action: "تعديل",
  userId: req?.user?.userId,
  targetId: supplier._id,
  title: supplier.name,
  details: `تم تعديل عملية ${existPaymentHistory.module === "pay" ? "استلام" : "دفع"} للعميل ${supplier.name}. المبلغ الجديد ${Number(existPaymentHistory.amount).toLocaleString()} ج.م، وطريقة الدفع ${existPaymentHistory.paymentMethod}. أصبح رصيد العميل ${Number(supplier.balance).toLocaleString()} ج.م بتاريخ ${new Date().toLocaleString("ar-EG")}.`
,session,
});

    await session.commitTransaction();

    session.endSession();

    res.status(200).json({

      message: "تم تعديل العملية بنجاح",

      payment: existPaymentHistory,

      balance: supplier.balance

    });

  } catch (err) {

    await session.abortTransaction();

    session.endSession();

    res.status(500).json({

      message: "Server error",

      error: err.message

    });

  }

};



// Get all payments for one customer
exports.allPaymentPerCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const payments = await paymentModel
      .find({ customer: id })
      .populate("cheque")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPayments = await paymentModel.countDocuments({
      customer: id,
    });

            const filteredPayments = totalPayments.filter(payment => {
            if (payment.paymentMethod !== "cheque") return true;

            return (
                payment.cheque &&
                !["returned", "cancelled"].includes(payment.cheque.status)
            );
        });

    res.status(200).json({
      message: "تم جلب المدفوعات بنجاح",
      payments:totalPayments,
      totalPayments,
      currentPage: page,
      totalPages: Math.ceil(totalPayments / limit),
    });
  } catch (err) {
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};