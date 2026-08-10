const derliveryModel = require(`${__dirname}/../../models/delivery/outDelivery`);
const Supplier = require(`${__dirname}/../../models/peapole/customer`);
const Admin = require(`${__dirname}/../../models/users`);
const Item = require(`${__dirname}/../../models/delivery/items`);
const TransactionModel=require(`${__dirname}/../../models/money/TransactionBox`);
const paymentModel =require(`${__dirname}/../../models/money/payment`)
const Cheque =require(`${__dirname}/../../models/money/cheque`)
const mongoose = require('mongoose');
const axios =require(`axios`);
const { createLog } = require('../../services/createLogs');


// create delivery
exports.createDeliveryV1 = async (req, res) => {
    const adminId = req.user.userId; 
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date();
        tomorrow.setHours(23, 59, 59, 999);
        const {
            supplier,
            deliveryDate,
            
            items,
            teaForWorkers = 0,
            carPayment = 0,
            notes,
            note,  // to money box
            carName,
           payment 
        } = req.body;

       

        const payments = Array.isArray(payment) ? payment : [];
      
        for (const p of payments) {
            if (!p.paymentMethod  || p.paidAmount < 0) {
                throw new Error("بيانات الدفع غير صحيحة");
            }
        }

        if (!supplier || !items || items.length === 0) {
            throw new Error("المورد والصنف مطلوبين");
        }

        const supplierExists = await Supplier.findById(supplier).session(session);
        if (!supplierExists) throw new Error("المورد غير موجود");

        const adminExists = await Admin.findById(adminId).session(session);
        if (!adminExists) throw new Error("المستلم غير موجود");

        const lastDelivery = await derliveryModel
        .findOne({
            deliveryDate: { $gte: today, $lte: tomorrow }
        })
        .sort({ delveryNumber: -1 })
        .session(session);

        const deliveryNumber = lastDelivery
        ? lastDelivery.delveryNumber + 1
        : 1;
        let totalAmount = 0;

        for (const item of items) {

            const itemExists = await Item.findById(item.item).session(session);
            if (!itemExists) throw new Error("الصنف غير موجود");

           
            let itemTotalWeight = 0;

            for (const batch of item.batches) {
                if (batch.weight < 0 || batch.quantity <= 0) {
                    throw new Error("Invalid batch data");
                }
                itemTotalWeight += batch.weight * batch.quantity;
            }

        
               const returnWeight =
                Number(item.returnWeight || 0) +
                Number(item.oldReturnWeight || 0);

  

            
            const netWeight = itemTotalWeight - returnWeight;

           
            const grossPrice = netWeight * item.pricePerKg;

         
            const discountAmount = grossPrice * (item.discount || 0) / 100;

          
            const finalItemPrice = grossPrice - discountAmount;

            
            const returnAmount = returnWeight * item.pricePerKg;

       
            item.totalWeight = itemTotalWeight;
            item.netWeight = netWeight;
            item.totalPrice = finalItemPrice;
            item.totalReturnPrice = returnAmount;

            totalAmount += finalItemPrice;
        }

        
        // totalAmount -= teaForWorkers;
        // totalAmount += carPayment;

     

        const paidAmount = payments.reduce((acc, curr) => {
            return acc + (curr.paidAmount || 0);
        }, 0);

        const oldBalance = supplierExists.balance || 0;
        const netDue = totalAmount - paidAmount;
        const newBalance = oldBalance - netDue;

        
        const delivery = await derliveryModel.create([{
            delveryNumber:deliveryNumber,
            supplier,
            deliveryDate,
            receivedBy: adminId,
            items,
            payment,
            totalAmount,
            oldBalance,
            teaForWorkers,
            carPayment,
            notes,  // to delivery
            paidAmount,
            remainingAmount: totalAmount - paidAmount
        }], { session });

       
        supplierExists.balance = newBalance;

      

        await supplierExists.save({ session });


 
        const itemsUpdate=[]



        for (const p of payments){
             const paymentData = {
                    customer: supplierExists._id,
                    module: "delivery",
                    moduleId: delivery[0]._id,
                    amount: Number(p.paidAmount),
                    paymentMethod:p.paymentMethod,
                    moneyFlow: "incoming",
                    transactionDate: deliveryDate || new Date(),
                    notes: note || "",
                    createdBy: adminId,
                    updatedBy:null
                };
            if(p.paymentMethod === "cash"){
             itemsUpdate.push({
                title:   " استلام فلوس نقدي من التاجر " + "  "+ supplierExists.name +" " +" كعمليه بيع نقله",
                category: "outdelivery",
                amount: Number(p.paidAmount)
            },)   
            }

            if ((p.paymentMethod === "bank" || p.paymentMethod === "instapay") && !p.bankInfo) {
                throw new Error("بيانات البنك مطلوبة");
            }


            if (p.paymentMethod === "cheque" && !p.cheque) {
            throw new Error("بيانات الشيك مطلوبة");
        }

            if (p.paymentMethod === "wallet") {

            if (!p.walletInfo) {
                throw new Error("بيانات المحفظة مطلوبة");
            }

    paymentData.walletInfo = {
        // senderName: p.walletInfo.senderName,
        senderPhone: p.walletInfo.senderPhone,
        // receiverName: p.walletInfo.receiverName,
        receiverPhone: p.walletInfo.receiverPhone,
        transactionReference: p.walletInfo?.transactionReference,
    };
}

    if (p.paymentMethod === "bank" || p.paymentMethod === "instapay") {
        paymentData.bankInfo = {
            bankName: p.bankInfo.bankName,
            transactionReference: p.bankInfo.transactionReference,
        };
    }

    if (p.paymentMethod === "cheque") {

    const cheque = await Cheque.create([{
        customer: supplierExists._id,
        module: "delivery",
        moduleId: delivery[0]._id,
        amount: Number(p.paidAmount),
        chequeNumber: p.cheque.chequeNumber,
        chequeType: p.cheque.chequeType,
        status: p.cheque.status,
        bankName: p.cheque.bankName,
        receiveDate: p.cheque.receiveDate,
        dueDate: p.cheque.dueDate,
        notes: note,
        createdBy: adminId
    }], { session });

    paymentData.cheque = cheque[0]._id;
}
var payment1 =await paymentModel.create([paymentData], { session });


        }



        if(itemsUpdate.length > 0){
  
          await TransactionModel.create([{
            
            type: "income",
            note: note || " استلام فلوس نقدي من التاجر " + "  "+ supplierExists.name +" " +" كعمليه بيع نقله",
            items: itemsUpdate || [],
            customerId: supplierExists._id,
            deliverId: delivery[0]._id,
            date: deliveryDate || new Date(),
            ref:payment1[0]._id
            
        }], { session });

    }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: "تم إنشاء النقلة بنجاح",
            delivery: delivery[0]
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
};



exports.createDelivery = async (req, res) => {
    const adminId = req.user.userId; 
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date();
        tomorrow.setHours(23, 59, 59, 999);
        const {
            supplier,
            deliveryDate,
            items,
            teaForWorkers = 0,
            carPayment = 0,
            notes,
            note,  // to money box
            carName,
           payment ,
      
        } = req.body;



        const payments = Array.isArray(payment) ? payment : [];
      
        for (const p of payments) {
            if (!p.paymentMethod  || p.paidAmount < 0) {
                throw new Error("بيانات الدفع غير صحيحة");
            }
        }

        if (!supplier || !items || items.length === 0) {
            throw new Error("المورد والصنف مطلوبين");
        }

        const supplierExists = await Supplier.findById(supplier).session(session);
        if (!supplierExists) throw new Error("المورد غير موجود");

        const adminExists = await Admin.findById(adminId).session(session);
        if (!adminExists) throw new Error("المستلم غير موجود");

        const lastDelivery = await derliveryModel
        .findOne({
            deliveryDate: { $gte: today, $lte: tomorrow }
        })
        .sort({ delveryNumber: -1 })
        .session(session);

        const deliveryNumber = lastDelivery
        ? lastDelivery.delveryNumber + 1
        : 1;
        let totalAmount = 0;

        for (const item of items) {

            const itemExists = await Item.findById(item.item).session(session);
            if (!itemExists) throw new Error("الصنف غير موجود");

           
            let itemTotalWeight = 0;

            for (const batch of item.batches) {
                if (batch.weight < 0 || batch.quantity <= 0) {
                    throw new Error("Invalid batch data");
                }
                itemTotalWeight += batch.weight * batch.quantity;
            }

        
               const returnWeight =
                Number(item.returnWeight || 0) +
                Number(item.oldReturnWeight || 0);

  

            
            const netWeight = itemTotalWeight - returnWeight;

           
            const grossPrice = netWeight * item.pricePerKg;

         
            const discountAmount = grossPrice * (item.discount || 0) / 100;

          
            const finalItemPrice = grossPrice - discountAmount;

            
            const returnAmount = returnWeight * item.pricePerKg;

       
            item.totalWeight = itemTotalWeight;
            item.netWeight = netWeight;
            item.totalPrice = finalItemPrice;
            item.totalReturnPrice = returnAmount;

            totalAmount += finalItemPrice;
        }

        
        // totalAmount -= teaForWorkers;
        // totalAmount += carPayment;

     

        const paidAmount = payments.reduce((acc, curr) => {
            return acc + (curr.paidAmount || 0);
        }, 0);

        const oldBalance = supplierExists.balance || 0;
        const netDue = totalAmount - paidAmount;
        const newBalance = oldBalance - netDue;

        
        const delivery = await derliveryModel.create([{
            delveryNumber:deliveryNumber,
            supplier,
            deliveryDate,
            receivedBy: adminId,
            items,
            payment,
            totalAmount,
            oldBalance,
            teaForWorkers,
            carPayment,
            notes,  // to delivery
            paidAmount,
            remainingAmount: totalAmount - paidAmount,
            carName
        }], { session });

       
        supplierExists.balance = newBalance;

      

        await supplierExists.save({ session });


 
        const itemsUpdate=[]



        for (const p of payments){
             const paymentData = {
                    customer: supplierExists._id,
                    module: "delivery",
                    moduleId: delivery[0]._id,
                    amount: Number(p.paidAmount),
                    paymentMethod:p.paymentMethod,
                    moneyFlow: "incoming",
                    transactionDate: deliveryDate || new Date(),
                    notes: note || "",
                    createdBy: adminId,
                    updatedBy:null
                };
            if(p.paymentMethod === "cash"){
             itemsUpdate.push({
                title:   " استلام فلوس نقدي من التاجر " + "  "+ supplierExists.name +" " +" كعمليه بيع نقله",
                category: "outdelivery",
                amount: Number(p.paidAmount)
            },)   
            }

            if ((p.paymentMethod === "bank" || p.paymentMethod === "instapay") && !p.bankInfo) {
                throw new Error("بيانات البنك مطلوبة");
            }


            if (p.paymentMethod === "cheque" && !p.cheque) {
            throw new Error("بيانات الشيك مطلوبة");
        }

            if (p.paymentMethod === "wallet") {

            if (!p.walletInfo) {
                throw new Error("بيانات المحفظة مطلوبة");
            }

    paymentData.walletInfo = {
        senderName: p.walletInfo?.senderName,
        senderPhone: p.walletInfo?.senderPhone,
        receiverName: p.walletInfo?.receiverName,
        receiverPhone: p.walletInfo?.receiverPhone,
        transactionReference: p.walletInfo?.transactionReference,
    };

    
    // walletTransInfo
    // senderName ,receiverName,senderPhone,receiverPhone,notes,amount,walletId
    formData={
            walletId: p.walletInfo.walletId,
            senderName: p.walletInfo?.senderName,
            receiverName: p.walletInfo?.receiverName,
            senderPhone:  p.walletInfo?.senderPhone,
            receiverPhone:  p.walletInfo?.receiverPhone,
            type: 'receive',
            notes:  `عمليه استلام اموال من التاجر ${supplierExists.name} سيستم المخرز`,
            amount: Number(p.paidAmount),
            createdAt:deliveryDate,
              ispay:false
    }


    if(p.walletInfo?.linkWallet){

        
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
    p.walletInfo.walletId;

} catch (error) {
  console.error("Wallet API ERROR:", {
    message: error.message,
    status: error.response?.status,
    data: error.response?.data,
    url: error.config?.url,
  });

  throw new Error(
    error.response?.data?.message ||
    error.response?.data?.error ||
    error.message
  );
}
}
    }
    


    if (p.paymentMethod === "bank" || p.paymentMethod === "instapay") {
        paymentData.bankInfo = {
            bankName: p.bankInfo.bankName,
            transactionReference: p.bankInfo.transactionReference,
        };
    }

    if (p.paymentMethod === "cheque") {

    const cheque = await Cheque.create([{
        customer: supplierExists._id,
        module: "delivery",
        moduleId: delivery[0]._id,
        amount: Number(p.paidAmount),
        chequeNumber: p.cheque.chequeNumber,
        chequeType: p.cheque.chequeType,
        status: p.cheque.status,
        bankName: p.cheque.bankName,
        receiveDate: p.cheque.receiveDate,
        dueDate: p.cheque.dueDate,
        notes: note,
        createdBy: adminId,
        moneyFlow: "incoming",
    }], { session });

    paymentData.cheque = cheque[0]._id;
}
var payment1=await paymentModel.create([paymentData], { session });


        }



        if(itemsUpdate.length > 0){
  
          await TransactionModel.create([{
            
            type: "income",
            note: note || " استلام فلوس نقدي من التاجر " + "  "+ supplierExists.name +" " +" كعمليه بيع نقله",
            items: itemsUpdate || [],
            customerId: supplierExists._id,
            deliverId: delivery[0]._id,
            date: deliveryDate || new Date(),
            ref:payment1[0]?._id
            
        }], { session });

    }


    await createLog({
    section: "النقلات",
    action: "إنشاء",
    userId: adminId,
    targetId: delivery[0]._id,
    title: `النقلة رقم ${delivery[0].delveryNumber}`,
    details: `تم إنشاء النقلة رقم ${delivery[0].delveryNumber} للتاجر ${supplierExists.name} بتاريخ ${new Date(deliveryDate).toLocaleDateString("ar-EG")} بإجمالي ${Number(totalAmount).toLocaleString()} ج.م. تم تحصيل ${Number(paidAmount).toLocaleString()} ج.م، والمتبقي ${Number(totalAmount - paidAmount).toLocaleString()} ج.م. تغير رصيد التاجر من ${Number(oldBalance).toLocaleString()} ج.م إلى ${Number(newBalance).toLocaleString()} ج.م.`
,session,
});

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: "تم إنشاء النقلة بنجاح",
            delivery: delivery[0]
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
};







// update delivery
exports.updateDelivery = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const adminId = req.user.userId;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("ID غير صحيح");
        }

        const {
            supplier,
            deliveryDate,
            items,
            teaForWorkers = 0,
            carPayment = 0,
            payment = [],
            notes,
            note,
            carName
        } = req.body;

        const payments = Array.isArray(payment) ? payment : [];

        // validate payments (same as create)
        for (const p of payments) {
            if (!p.paymentMethod || p.paidAmount == null || p.paidAmount < 0) {
                throw new Error("بيانات الدفع غير صحيحة");
            }
        }

        const oldDelivery = await derliveryModel.findById(id).session(session);
        if (!oldDelivery) throw new Error("النقلة غير موجودة");

        const supplierDoc = await Supplier.findById(oldDelivery.supplier).session(session);
        if (!supplierDoc) throw new Error("المورد غير موجود");


        // 1. ROLLBACK OLD EFFECT
  
        const oldPaid = oldDelivery.paidAmount || 0;
        const oldNet = (oldDelivery.totalAmount || 0) - oldPaid;

        supplierDoc.balance += oldNet;


  
        // 2. RECALCULATE ITEMS (same as create)
  
        let totalAmount = 0;

        for (const item of items) {

            const itemExists = await Item.findById(item.item).session(session);
            if (!itemExists) throw new Error("الصنف غير موجود");

            let itemTotalWeight = 0;

            for (const batch of item.batches) {
                if (batch.weight < 0 || batch.quantity <= 0) {
                    throw new Error("Invalid batch data");
                }
                itemTotalWeight += batch.weight * batch.quantity;
            }

               const returnWeight =
                Number(item.returnWeight || 0) +
                Number(item.oldReturnWeight || 0);
        //  if (returnWeight > itemTotalWeight) {
        //         throw new Error("المرتجع أكبر من الوزن");
        //     }
   

            const netWeight = itemTotalWeight - returnWeight;
            const grossPrice = netWeight * item.pricePerKg;
            const discountAmount = grossPrice * (item.discount || 0) / 100;
            const finalPrice = grossPrice - discountAmount;

            item.totalWeight = itemTotalWeight;
            item.netWeight = netWeight;
            item.totalPrice = finalPrice;
            item.totalReturnPrice = returnWeight * item.pricePerKg;

            totalAmount += finalPrice;
        }

        // totalAmount -= teaForWorkers;
        // totalAmount += carPayment;

  
        // 3. PAYMENT CALCULATION
  
        const paidAmount = payments.reduce((acc, p) => {
            return acc + (p.paidAmount || 0);
        }, 0);

        const netDue = totalAmount - paidAmount;

  
        // 4. APPLY NEW EFFECT
  
        const newBalance = supplierDoc.balance - netDue;

        supplierDoc.balance = newBalance;


        await supplierDoc.save({ session });

  
        // 5. UPDATE DELIVERY
  
        const updated = await derliveryModel.findByIdAndUpdate(
            id,
            {
                supplier: oldDelivery.supplier,
                deliveryDate,
                items,
                payment: payments,
                totalAmount,
                teaForWorkers,
                carPayment,
                notes,
                paidAmount,
                remainingAmount: netDue,
                receivedBy: adminId,
                carName
            },
            { returnDocument: "after", session }
        );

  const payments2 = await paymentModel.find({
    moduleId: id,
    module: "delivery",
}).session(session);



for (const payment of payments2) {
    if (
        payment.paymentMethod === "wallet" &&
        payment.walletInfo?.transactionReference
    ) {
        try {
            console.log(payment.walletInfo.transactionReference)
            await axios.delete(
                `${process.env.WalletUrl}/transaction/V2/${payment.walletInfo.transactionReference}`,
                {
                    headers: {
                        "x-api-key": process.env.INTERNAL_API_KEY,
                    },
                     params:{
                        delete:true
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
}
        await TransactionModel.deleteMany({
            deliverId: id,
            type: "income"
        }).session(session);

        await paymentModel.deleteMany({
             moduleId:id,
             module: "delivery",
        }).session(session);

        await Cheque.deleteMany({
             moduleId:id,
             module: "delivery",
        }).session(session);


        
        const itemsUpdate=[]

        for (const p of payments){
              const paymentData = {
                    customer: supplierDoc._id,
                    module: "delivery",
                    moduleId: updated._id,
                    amount: Number(p.paidAmount),
                    paymentMethod:p.paymentMethod,
                    moneyFlow: "incoming",
                    transactionDate: deliveryDate || new Date(),
                    notes: note || "",
                    createdBy: adminId,
                    updatedBy:null
                };
            if(p.paymentMethod === "cash"){

             itemsUpdate.push(            {
                title:   " استلام فلوس نقدي من التاجر " + "  "+ supplierDoc.name +" " +" كعمليه بيع نقله",
                category: "outdelivery",
                amount: Number(p.paidAmount)
            },)   


            }

            
            if ((p.paymentMethod === "bank" || p.paymentMethod === "instapay") && !p.bankInfo) {
                throw new Error("بيانات البنك مطلوبة");
            }


            if (p.paymentMethod === "cheque" && !p.cheque) {
            throw new Error("بيانات الشيك مطلوبة");
        }

            if (p.paymentMethod === "wallet") {

            if (!p.walletInfo) {
                throw new Error("بيانات المحفظة مطلوبة");
            }

    paymentData.walletInfo = {
        provider: p.walletInfo.provider,
        senderName: p.walletInfo.senderName,
        senderPhone: p.walletInfo.senderPhone,
        receiverName: p.walletInfo.receiverName,
        receiverPhone: p.walletInfo.receiverPhone,
        transactionReference: p.walletInfo.transactionReference,
    };

        // walletTransInfo
    // senderName ,receiverName,senderPhone,receiverPhone,notes,amount,walletId
    formData={
            walletId: p.walletInfo.walletId,
            senderName: p.walletInfo?.senderName,
            receiverName: p.walletInfo?.receiverName,
            senderPhone:  p.walletInfo?.senderPhone,
            receiverPhone:  p.walletInfo?.receiverPhone,
            type: 'receive',
            notes:  `عمليه استلام اموال من التاجر ${supplierDoc.name} سيستم المخرز`,
            amount: Number(p.paidAmount),
            createdAt:deliveryDate,
            ispay:false
    }


    if(p.walletInfo?.linkWallet){

        
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
    p.walletInfo.walletId;

} catch (error) {


    throw new Error(
        error.response?.data?.message ||
        error.message ||
        "حدث خطأ أثناء الاتصال بخدمة المحفظة"
    );
}
}
}

    if (p.paymentMethod === "bank" || p.paymentMethod === "instapay") {
        paymentData.bankInfo = {
            bankName: p.bankInfo.bankName,
            transactionReference: p.bankInfo.transactionReference,
        };
    }

    if (p.paymentMethod === "cheque") {

    const cheque = await Cheque.create([{
        customer: supplierDoc._id,
        module: "delivery",
        moduleId: updated._id,
        amount: Number(p.paidAmount),
        chequeNumber: p.cheque.chequeNumber,
        chequeType: p.cheque.chequeType,
        bankName: p.cheque.bankName,
        receiveDate: p.cheque.receiveDate,
        dueDate: p.cheque.dueDate,
        notes: note,
        createdBy: adminId,
        moneyFlow: "incoming",
    }], { session });

    paymentData.cheque = cheque[0]._id;
}
var payment1=await paymentModel.create([paymentData], { session });

        }


         if(itemsUpdate.length > 0){
          await TransactionModel.create([{
            
            type: "income",
            note: note || " استلام فلوس نقدي من التاجر " + "  "+ supplierDoc.name +" " +" كعمليه بيع نقله",
            items: itemsUpdate || [],
           customerId: supplierDoc._id,
           deliverId: updated._id,
             date: deliveryDate || new Date(),
             ref:payment1[0]?._id
            
        }], { session });
    }

       const oldTotal = oldDelivery.totalAmount;
        const oldPaidAmount = oldDelivery.paidAmount;
        const oldBalance = oldDelivery.oldBalance;
        const balanceBeforeEdit = supplierDoc.balance - netDue;
        

        await createLog({
        section: "النقلات",
        action: "تعديل",
        userId: adminId,
        targetId: updated._id,
        title: `النقلة رقم ${updated.delveryNumber}`,
        details: `تم تعديل النقلة رقم ${updated.delveryNumber}. تغير إجمالي النقلة من ${Number(oldTotal).toLocaleString()} ج.م إلى ${Number(totalAmount).toLocaleString()} ج.م، والمبلغ المحصل من ${Number(oldPaidAmount).toLocaleString()} ج.م إلى ${Number(paidAmount).toLocaleString()} ج.م. تغير رصيد التاجر من ${Number(balanceBeforeEdit).toLocaleString()} ج.م إلى ${Number(supplierDoc.balance).toLocaleString()} ج.م.`
    ,session,
    });
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "تم تعديل النقلة بنجاح",
            delivery: updated
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
};









// delete delivery
exports.deleteDelivery = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("ID غير صحيح");
        }

  
        // 1. GET OLD DELIVERY
  
        const oldDelivery = await derliveryModel.findById(id).session(session);
        if (!oldDelivery) throw new Error("النقلة غير موجودة");

        const supplier = await Supplier.findById(oldDelivery.supplier).session(session);
        if (!supplier) throw new Error("المورد غير موجود");

  
        // 2. ROLLBACK SUPPLIER
  
        const oldPaid = oldDelivery.paidAmount || 0;
        const oldNet = (oldDelivery.totalAmount || 0) - oldPaid;

        supplier.balance += oldNet;



        await supplier.save({ session });

  
        // 3. DELETE CASH TRANSACTIONS
  
         
        const payments = await paymentModel.find({
    moduleId: id,
    module: "delivery",
}).session(session);

for (const payment of payments) {
    if (
        payment.paymentMethod === "wallet" &&
        payment.walletInfo?.transactionReference
    ) {
        try {
            await axios.delete(
                `${process.env.WalletUrl}/transaction/V2/${payment.walletInfo.transactionReference}`,
                {
                    params:{
                     delete:true,
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

    if(payment.paymentMethod=="cash"){
          await TransactionModel.deleteMany({
            ref:payment._id,
            deliverId: id,
            type: "income"
        }).session(session);
    }
}


       await paymentModel.deleteMany({
             moduleId:id,
             module: "delivery",
        }).session(session);

        await Cheque.deleteMany({
             moduleId:id,
             module: "delivery",
        }).session(session);



       

                    

        

  

    await createLog({
        section: "النقلات",
        action: "حذف",
        userId: req.user.userId,
        targetId: oldDelivery._id,
        title: `النقلة رقم ${oldDelivery.delveryNumber}`,
        details: `تم حذف النقلة رقم ${oldDelivery.delveryNumber} الخاصة بالتاجر ${supplier.name} بتاريخ ${new Date(oldDelivery.deliveryDate).toLocaleDateString("ar-EG")}. كانت قيمة النقلة ${Number(oldDelivery.totalAmount).toLocaleString()} ج.م، والمحصل ${Number(oldDelivery.paidAmount).toLocaleString()} ج.م. تغير رصيد التاجر من ${Number(supplier.balance).toLocaleString()} ج.م إلى ${Number(supplier.balance).toLocaleString()} ج.م.`
        ,session,
    });
        // 4. DELETE DELIVERY
  
        await derliveryModel.findByIdAndDelete(id, { session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "تم حذف النقلة بنجاح"
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        console.log(err.data)
        res.status(500).json({ message: err.message });
    }
};








// Get All Deliveries

exports.getAllDeliveries = async (req, res) => {
    try {
        // Pagination
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit) || 10, 1);
        const skip = (page - 1) * limit;

        
        // Filters
        const { supplier, fromDate, toDate } = req.query;

        const filter = {};

        // Supplier
        if (supplier) {
            if (!mongoose.Types.ObjectId.isValid(supplier)) {
                return res.status(400).json({
                    message: "معرف المورد غير صحيح"
                });
            }

            filter.supplier = supplier;
        }

        // Date
        if (fromDate || toDate) {
            filter.deliveryDate = {};

            if (fromDate) {
                const start = new Date(fromDate);
                start.setHours(0, 0, 0, 0);
                filter.deliveryDate.$gte = start;
            }

            if (toDate) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                filter.deliveryDate.$lte = end;
            }
        }

        
        // Query
        
        const deliveries = await derliveryModel
            .find(
                filter,
                {
                    _id: 1,
                    delveryNumber: 1,
                    supplier: 1,
                    deliveryDate: 1,
                    totalAmount: 1,
                }
            )
            .populate("supplier", "balance name")
            .sort({
                deliveryDate: -1,
                createdAt: -1
            })
            .skip(skip)
            .limit(limit)
            .lean();

        
        // Count
        
        const total = await derliveryModel.countDocuments(filter);

        const totalPages = Math.ceil(total / limit);

        
        // Response
        
        return res.status(200).json({
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            results: deliveries.length,
            deliveries
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};



//get Delivery By Id 
// get Delivery By Id 
exports.getDeliveryById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        const delivery = await derliveryModel.findById(id)
            .populate("supplier", "name balance")
            .populate("receivedBy", "username email")
            .populate("items.item", "name")
            .lean();

        if (!delivery) {
            return res.status(404).json({
                message: "النقلة غير موجودة"
            });
        }

        const payments = await paymentModel
            .find({
                moduleId: id,
                module: "delivery"
            })
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

        delivery.Payments = filteredPayments;

        // إعادة إنشاء payment من المدفوعات الحقيقية بعد الاستبعاد
        delivery.payment = filteredPayments.map(p => ({
            paymentMethod: p.paymentMethod,
            paidAmount: p.amount,
        }));

        delivery.paidAmount = delivery.payment.reduce(
            (sum, p) => sum + (p.paidAmount || 0),
            0
        );

        delivery.remainingAmount = Math.max(
            0,
            (delivery.totalAmount || 0) - delivery.paidAmount
        );

        return res.status(200).json({
            message: "تم جلب البيانات ",
            delivery
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};


exports.getDeliveryBySupplier = async (req, res) => {
    try {
        const { supplierId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(supplierId)) {
            return res.status(400).json({ message: "ID غير صحيح" });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 100000, 50);
        const skip = (page - 1) * limit;

        const {
            fromDate,
            toDate,
            minAmount,
            maxAmount,
            hasRemaining,
            paymentMethod
        } = req.query;

        let filter = { supplier: supplierId };

        if (fromDate || toDate) {
            filter.deliveryDate = {};
            if (fromDate) filter.deliveryDate.$gte = new Date(fromDate);
            if (toDate) filter.deliveryDate.$lte = new Date(toDate);
        }

        if (minAmount || maxAmount) {
            filter.totalAmount = {};
            if (minAmount) filter.totalAmount.$gte = Number(minAmount);
            if (maxAmount) filter.totalAmount.$lte = Number(maxAmount);
        }

        // ملحوظة: شيلنا فلتر hasRemaining من هنا لأنه لازم يتطبق بعد إعادة الحساب

        if (paymentMethod) {
            filter["payment.paymentMethod"] = paymentMethod;
        }

        // نجيب كل النقلات المطابقة (من غير limit/skip الأول عشان الفلتر بعدين هيغيّر العدد)
        let deliveries = await derliveryModel.find(filter)
            .populate("supplier", "name balance")
            .populate("receivedBy", "username email")
            .populate("items.item", "name")
            .sort({ deliveryDate: -1 })
            .lean();

        const deliveryIds = deliveries.map(d => d._id);

        const payments = await paymentModel
            .find({
                module: "delivery",
                moduleId: { $in: deliveryIds },
            })
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

        // ربط المدفوعات بكل نقلة وإعادة بناء بيانات الدفع
        deliveries.forEach((delivery) => {
            const deliveryPayments = filteredPayments.filter(
                p => p.moduleId.toString() === delivery._id.toString()
            );

            delivery.Payments = deliveryPayments;

            delivery.payment = deliveryPayments.map(p => ({
                paymentMethod: p.paymentMethod,
                paidAmount: p.amount,
            }));

            delivery.paidAmount = delivery.payment.reduce(
                (sum, p) => sum + (p.paidAmount || 0),
                0
            );

            delivery.remainingAmount = Math.max(
                0,
                (delivery.totalAmount || 0) - delivery.paidAmount
            );
        });

        // تطبيق فلتر hasRemaining بعد إعادة الحساب الصح
        if (hasRemaining === "true") {
            deliveries = deliveries.filter(d => d.remainingAmount > 0);
        } else if (hasRemaining === "false") {
            deliveries = deliveries.filter(d => d.remainingAmount === 0);
        }

        const total = deliveries.length;
        const totalPages = Math.ceil(total / limit);

        // الـ pagination بعد الفلترة النهائية
        const paginatedDeliveries = deliveries.slice(skip, skip + limit);

        res.status(200).json({
            page,
            results: paginatedDeliveries.length,
            total,
            totalPages,
            deliveries: paginatedDeliveries
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
