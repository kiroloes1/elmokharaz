const { createLog } = require("../../services/createLogs");

const chequeModel=require(`${__dirname}/../../models/money/cheque`);
const maintainModel=require(`${__dirname}/../../models/purchase/equipment/maintenance`);
const supplierModel=require(`${__dirname}/../../models/peapole/supplier`);
const paymentModel=require(`${__dirname}/../../models/money/payment`);
const TransactionModel =require(`${__dirname}/../../models/money/TransactionBox`);
const mongoose=require(`mongoose`)
const axios=require("axios")
const equipmentModel=require(`${__dirname}/../../models/purchase/equipment/equipment`)


// create Equipment Maintain
exports.createMaintain=async(req,res)=>{
        const session = await mongoose.startSession();
        session.startTransaction();
    try{
        const {
            supplier,
            purchaseDate ,
            items, // array {name , quantity , unitPrice , total  , notes }
            notes ,
            note, // to payment
            payment,// is a array
            maintenanceProvider, 
            returnDate,
            equipmentName,
      
        } = req.body;

        const userId=req.user?.userId;


        // set time to invoiceNumber
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date();
        tomorrow.setHours(23, 59, 59, 999);


        const payments = Array.isArray(payment) ? payment : [];
      
        if (!Array.isArray(items) || items.length === 0)
                     throw new Error("يجب إضافة جزء  واحد على الأقل");

        if (!maintenanceProvider?.trim())
            throw new Error("جهة الصيانة مطلوبة");

        if (!purchaseDate)
            throw new Error("تاريخ الإرسال مطلوب");
        for (const p of payments) {
            if (!p.paymentMethod  || p.paidAmount < 0) {
                throw new Error("بيانات الدفع غير صحيحة");
            }
        }


        for (const item of items) {

            if (!item.partName?.trim())
                throw new Error("اسم الجزء مطلوب");

            if (!item.faultDescription?.trim())
                throw new Error("وصف العطل مطلوب");

            if (item.repairCost == null || item.repairCost < 0)
                throw new Error("تكلفة الصيانة غير صحيحة");
        }

        const supplierExists = await supplierModel.findById(supplier).session(session);
        if (!supplierExists) throw new Error("التاجر غير موجود");

        const equipmentExists = await equipmentModel.findOne({"items.equipmentName":equipmentName}).session(session);


        const lastPurchase= await maintainModel
        .findOne({
            purchaseDate: { $gte: today, $lte: tomorrow }
        })
        .sort({ invoiceNumber: -1 })
        .session(session);

        const invoiceNumber = lastPurchase
        ? lastPurchase.invoiceNumber + 1
        : 1;

        let totalAmount = 0;

        for (const item of items) {
                item.repairCost = Number(item.repairCost);

                totalAmount = Number(
                    (totalAmount + item.repairCost).toFixed(2)
                );
        }

        const paidAmount = payments.reduce((acc, curr) => {
            return acc + (curr.paidAmount || 0);
        }, 0);

        const oldBalance = supplierExists.balance || 0;
        const netDue = totalAmount - paidAmount;
        const newBalance = oldBalance + netDue;


        let paymentStatus = "unpaid";

            if (paidAmount === totalAmount)
                paymentStatus = "paid";
            else if (paidAmount > 0)
                paymentStatus = "partial";
        const purchase = await maintainModel.create([{
            invoiceNumber:invoiceNumber,
            supplier,
            purchaseDate,
            items,
            totalAmount,
            oldBalance,
            notes,
            paidAmount,
            remainingAmount:netDue,
            paymentStatus,
            createdBy:userId,
            equipment:equipmentExists?._id || null,
            maintenanceProvider,
            equipmentName,
            returnDate
        }], { session });

        supplierExists.balance = newBalance;

        await supplierExists.save({ session });

        const itemsUpdate=[];

                for (const p of payments){
                    const paymentData = {
                            supplier: supplierExists._id,
                            module: "maintenance",
                            moduleId: purchase[0]._id,
                            amount: Number(p.paidAmount),
                            paymentMethod:p.paymentMethod,
                            moneyFlow: "outgoing",
                            transactionDate: purchaseDate || new Date(),
                            notes: note || "",
                            createdBy: userId,
                            updatedBy:null
                        };

                            if(p.paymentMethod === "cash"){
                                itemsUpdate.push({
                       
title:
`دفع نقدي للتاجر ${supplierExists.name} مقابل صيانة صيانة `,
                                    category: "maintenance",
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

                                 const  formData={
                                                    walletId: p.walletInfo.walletId,
                                                    senderName: p.walletInfo?.senderName,
                                                    receiverName: p.walletInfo?.receiverName,
                                                    senderPhone:  p.walletInfo?.senderPhone,
                                                    receiverPhone:  p.walletInfo?.receiverPhone,
                                                    type: 'send',
                                                    notes:  `عمليه ارسال اموال الي التاجر ${supplierExists.name} صيانة للتاجر سيستم المخرز`,
                                                    amount: Number(p.paidAmount),
                                                    createdAt:purchaseDate,
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
                                        "حدث خطأ أثناء إنشاء عملية المحفظة"
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

                                    const cheque = await chequeModel.create([{
                                        supplier: supplierExists._id,
                                        module: "maintenance",
                                        moduleId: purchase[0]._id,
                                        amount: Number(p.paidAmount),
                                        chequeNumber: p.cheque.chequeNumber,
                                        chequeType: p.cheque.chequeType,
                                        status: p.cheque.status,
                                        bankName: p.cheque.bankName,
                                        receiveDate: p.cheque.receiveDate,
                                        dueDate: p.cheque.dueDate,
                                        notes: note,
                                        createdBy: userId,
                                        moneyFlow:"outgoing"
                                    }], { session });

                                    paymentData.cheque = cheque[0]._id;
                                }

                     var payment1=   await paymentModel.create([paymentData], { session });



            }

                if(itemsUpdate.length > 0){
  
             await TransactionModel.create([{
            
            type: "expense",
            note: note || "دفع نقدي للتاجر " + supplierExists.name + " مقابل صيانة صيانة ",
            items: itemsUpdate || [],
            supplierId: supplierExists._id,
            purchaseId: purchase[0]._id,
            date: purchaseDate || new Date(),
            ref:payment1[0]?._id
            
        }], { session });

    
    }

        await createLog({
        section: "الصيانة",
        action: "إنشاء",
        userId: userId,
        targetId: purchase[0]._id,
            title: `فاتورة صيانة رقم ${purchase[0].invoiceNumber}`,

details: `
تم حذف فاتورة الصيانة رقم ${purchase.invoiceNumber}
الخاصة بالتاجر ${supplier.name}
بتاريخ ${new Date(purchase.purchaseDate).toLocaleDateString("ar-EG")}.

كانت قيمة الفاتورة ${Number(purchase.totalAmount).toLocaleString()} ج.م،
وتم دفع ${Number(purchase.paidAmount).toLocaleString()} ج.م.

تغير رصيد التاجر من
${Number(oldBalance).toLocaleString()} ج.م
إلى
${Number(newBalance).toLocaleString()} ج.م.
`
    ,session,
    });

            await session.commitTransaction();
                session.endSession();

                res.status(201).json({
                    message: "تم إنشاء فاتورة الصيانة بنجاح",
                    purchaseEquipment: purchase[0]
                });




        
    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
}


// update Equipment  Maintain
exports.updateMaintain = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("ID غير صحيح");
        }

        const {
            supplier, // المورد الجديد إن وُجد
            purchaseDate,
            items, // array {name , quantity , unitPrice , total , notes }
            notes,
            note, // to payment
            payment, // is an array 
            maintenanceProvider, 
            returnDate,
            equipmentName,
        } = req.body;

        const payments = Array.isArray(payment) ? payment : [];

        if (!Array.isArray(items) || items.length === 0) {
            throw new Error("يجب إضافة جزء واحد على الأقل");
        }

        
        if (!maintenanceProvider?.trim())
            throw new Error("جهة الصيانة مطلوبة");

        if (!purchaseDate)
            throw new Error("تاريخ الإرسال مطلوب");

        // Validate payments
        for (const p of payments) {
            if (!p.paymentMethod || p.paidAmount == null || p.paidAmount < 0) {
                throw new Error("بيانات الدفع غير صحيحة");
            }
        }


        for (const item of items) {

            if (!item.partName?.trim())
                throw new Error("اسم الجزء مطلوب");

            if (!item.faultDescription?.trim())
                throw new Error("وصف العطل مطلوب");

            if (item.repairCost == null || item.repairCost < 0)
                throw new Error("تكلفة الصيانة غير صحيحة");
        }

        const equipmentExists = await equipmentModel.findOne({"items.equipmentName":equipmentName}).session(session);

        // 1. Fetch Existing Record
        const oldPurchaseMaintain = await maintainModel.findById(id).session(session);
        if (!oldPurchaseMaintain) throw new Error("فاتورة الصيانة غير موجودة");

        // Determine target supplier (either newly selected or old one)
        const targetSupplierId = supplier || oldPurchaseMaintain.supplier;

        const oldSupplier = await supplierModel.findById(oldPurchaseMaintain.supplier).session(session);
        if (!oldSupplier) throw new Error("التاجر القديم غير موجود");

        let newSupplier = oldSupplier;
        if (targetSupplierId.toString() !== oldSupplier._id.toString()) {
            newSupplier = await supplierModel.findById(targetSupplierId).session(session);
            if (!newSupplier) throw new Error("التاجر الجديد غير موجود");
        }

        // 2. ROLLBACK OLD EFFECT
        const oldPaid = oldPurchaseMaintain.paidAmount || 0;
        const oldTotal = oldPurchaseMaintain.totalAmount || 0;
        const oldNet = oldTotal - oldPaid; // صافي المتبقي للتاجر سابقاً

        // إعادة الرصيد للمورد القديم (خصم المبلغ الذي كان متبقياً له)
        oldSupplier.balance = Number((oldSupplier.balance - oldNet).toFixed(2));
        await oldSupplier.save({ session });

        // 3. RECALCULATE ITEMS & PAYMENTS
        let totalAmount = 0;
        for (const item of items) {
                item.repairCost = Number(item.repairCost);

                totalAmount = Number(
                    (totalAmount + item.repairCost).toFixed(2)
                );
        }


        const paidAmount = payments.reduce((acc, p) => acc + (Number(p.paidAmount) || 0), 0);
        const netDue = Number((totalAmount - paidAmount).toFixed(2));

        // 4. APPLY NEW EFFECT
        // تطبيق المتبقي الجديد على المورد (سواء كان القديم نفسه أو الجديد)
        const oldBalance = newSupplier.balance;
        newSupplier.balance = Number((newSupplier.balance + netDue).toFixed(2));
        await newSupplier.save({ session });

        let paymentStatus = "unpaid";
        if (paidAmount >= totalAmount && totalAmount > 0) {
            paymentStatus = "paid";
        } else if (paidAmount > 0) {
            paymentStatus = "partial";
        }

        // 5. UPDATE EQUIPMENT
        const purchase = await maintainModel.findByIdAndUpdate(
            id,
            {
                supplier: newSupplier._id,
                purchaseDate,
                items,
                totalAmount,
                notes,
                paidAmount,
                remainingAmount: netDue,
                paymentStatus,
                updatedBy: userId,
                oldBalance,
                equipment:equipmentExists?._id || null,
                maintenanceProvider,
                equipmentName,
                returnDate
            },
            { returnDocument: "after", session }
        );

        // 6. DELETE / REVERT WALLET TRANSACTIONS & RELATED MODELS
        const oldPayments = await paymentModel.find({
            moduleId: id,
            module: "maintenance",
        }).session(session);

        for (const p of oldPayments) {
            if (p.paymentMethod === "wallet" && p.walletInfo?.transactionReference) {
                try {
                    await axios.delete(
                        `${process.env.WalletUrl}/transaction/V2/${p.walletInfo.transactionReference}`,
                        {
                            params: { delete: true },
                            headers: { "x-api-key": process.env.INTERNAL_API_KEY },
                        }
                    );
                } catch (error) {
                    throw new Error(
                        error.response?.data?.message || "حدث خطأ أثناء حذف عملية المحفظة القديمة"
                    );
                }
            }
        }

        await TransactionModel.deleteMany({
            
            purchaseId: id,
            type: "expense"
        }).session(session);

        await paymentModel.deleteMany({
            moduleId: id,
            module: "maintenance",
        }).session(session);

        await chequeModel.deleteMany({
            moduleId: id,
            module: "maintenance",
        }).session(session);

        // 7. CREATE NEW PAYMENTS & TRANSACTIONS
        const itemsUpdate = [];

        for (const p of payments) {
            const paymentData = {
                supplier: newSupplier._id,
                module: "maintenance",
                moduleId: purchase?._id || id,
                amount: Number(p.paidAmount),
                paymentMethod: p.paymentMethod,
                moneyFlow: "outgoing",
                transactionDate: purchaseDate || new Date(),
                notes: note || "",
                createdBy: userId,
                updatedBy: null
            };

            if (p.paymentMethod === "cash") {
                itemsUpdate.push({
                    title: `دفع نقدي للمورد ${newSupplier.name} مقابل صيانة صيانة `,
                    category: "maintenance",
                    amount: Number(p.paidAmount)
                });
            }

            if ((p.paymentMethod === "bank" || p.paymentMethod === "instapay") && !p.bankInfo) {
                throw new Error("بيانات البنك مطلوبة");
            }

            if (p.paymentMethod === "cheque" && !p.cheque) {
                throw new Error("بيانات الشيك مطلوبة");
            }

            if (p.paymentMethod === "wallet") {
                if (!p.walletInfo) throw new Error("بيانات المحفظة مطلوبة");

                paymentData.walletInfo = {
                    senderName: p.walletInfo?.senderName,
                    senderPhone: p.walletInfo?.senderPhone,
                    receiverName: p.walletInfo?.receiverName,
                    receiverPhone: p.walletInfo?.receiverPhone,
                    transactionReference: p.walletInfo?.transactionReference,
                };

                const formData = {
                    walletId: p.walletInfo.walletId,
                    senderName: p.walletInfo?.senderName,
                    receiverName: p.walletInfo?.receiverName,
                    senderPhone: p.walletInfo?.senderPhone,
                    receiverPhone: p.walletInfo?.receiverPhone,
                    type: 'send',
                    notes: `عملية ارسال اموال الي التاجر ${newSupplier.name} سيستم المخرز`,
                    amount: Number(p.paidAmount),
                    createdAt: purchaseDate,
                    ispay:false
                };

                if (p.walletInfo?.linkWallet) {
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
                        paymentData.walletInfo.walletId = p.walletInfo.walletId;

                    } catch (error) {
                        throw new Error(
                            error.response?.data?.message ||
                            error.message ||
                            "حدث خطأ أثناء إنشاء عملية المحفظة"
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
                const cheque = await chequeModel.create([{
                    supplier: newSupplier._id,
                    module: "maintenance",
                    moduleId: purchase?._id || id,
                    amount: Number(p.paidAmount),
                    chequeNumber: p.cheque.chequeNumber,
                    chequeType: p.cheque.chequeType,
                    status: p.cheque.status,
                    bankName: p.cheque.bankName,
                    receiveDate: p.cheque.receiveDate,
                    dueDate: p.cheque.dueDate,
                    notes: note,
                    createdBy: userId,
                    moneyFlow: "outgoing"
                }], { session });

                paymentData.cheque = cheque[0]._id;
            }

          var payment1=  await paymentModel.create([paymentData], { session });
        }

        if (itemsUpdate.length > 0) {
            await TransactionModel.create([{
                type: "expense",
                note: note || "دفع نقدي للتاجر " + newSupplier.name + " مقابل صيانة صيانة ",
                items: itemsUpdate,
                supplierId: newSupplier._id,
                purchaseId: purchase?._id || id,
                date: purchaseDate || new Date(),
                ref:payment1[0]?._id
            }], { session });
        }

        await createLog({
            section: "الصيانة",
            action: "تعديل",
            userId,
            targetId: purchase?._id || id,
            title: `فاتورة صيانة رقم ${purchase?.invoiceNumber}`,
            details:
                `تم تعديل فاتورة الصيانة رقم ${purchase?.invoiceNumber}
للمورد ${newSupplier.name}
بقيمة ${Number(totalAmount).toLocaleString()} ج.م،
تم دفع ${Number(paidAmount).toLocaleString()} ج.م،
والمتبقي ${Number(netDue).toLocaleString()} ج.م،
وأصبح رصيد التاجر ${Number(newSupplier.balance).toLocaleString()} ج.م.`,
            session
        });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "تم تعديل فاتورة الصيانة بنجاح",
            purchaseEquipment: purchase
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
};

// delete Equipment Maintain
exports.deleteMaintain = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("ID غير صحيح");
        }

  
        // 1. GET OLD Equipments
  
        const oldPurchaseMaintain = await maintainModel.findById(id).session(session);
        if (!oldPurchaseMaintain)  throw new Error("فاتورة الصيانة غير موجودة");

        const supplier = await supplierModel.findById(oldPurchaseMaintain.supplier).session(session);
        if (!supplier) throw new Error("التاجر غير موجود");

  
        // 2. ROLLBACK SUPPLIER
  
        const oldPaid = oldPurchaseMaintain.paidAmount || 0;
        const oldNet = (oldPurchaseMaintain.totalAmount || 0) - oldPaid;

        const oldBalance = supplier.balance;

        supplier.balance = Number((supplier.balance - oldNet).toFixed(2));

        const newBalance = supplier.balance;

        await supplier.save({ session });

  
        // 3. DELETE CASH TRANSACTIONS
  
         
        const payments = await paymentModel.find({
                moduleId: id,
                module: "maintenance",
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
}
        await TransactionModel.deleteMany({
            
            purchaseId: id,
            type: "expense"
        }).session(session);

       await paymentModel.deleteMany({
             moduleId:id,
             module: "maintenance",
        }).session(session);

        await chequeModel .deleteMany({
             moduleId:id,
             module: "maintenance",
        }).session(session);


  
  
    await createLog({
        section: "الصيانة",
        action: "حذف",
        userId: req.user.userId,
        targetId: oldPurchaseMaintain._id,
        title:
        `فاتورة شراء مستلزمات  صيانة  رقم ${oldPurchaseMaintain.invoiceNumber}`,
details: `
تم حذف فاتورة شراء مستلزمات الصيانة  رقم ${oldPurchaseMaintain.invoiceNumber}
الخاصة بالتاجر ${supplier.name}
بتاريخ ${new Date(oldPurchaseMaintain.purchaseDate).toLocaleDateString("ar-EG")}.

كانت قيمة الفاتورة ${Number(oldPurchaseMaintain.totalAmount).toLocaleString()} ج.م،
وتم دفع ${Number(oldPurchaseMaintain.paidAmount).toLocaleString()} ج.م.

تغير رصيد التاجر من
${Number(oldBalance).toLocaleString()} ج.م
إلى
${Number(newBalance).toLocaleString()} ج.م.
`
        ,session,
    });
        // 4. DELETE Equipments
  
        await maintainModel.findByIdAndDelete(id, { session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "تم حذف فاتورة الصيانة بنجاح"
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

       
        res.status(500).json({ message: err.message });
    }
};


// Get All Maintenances
exports.getAllMaintains = async (req, res) => {
    try {
        // Pagination
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit) || 10, 1);
        const skip = (page - 1) * limit;

        // Filters
        let {
            supplier,
            fromDate,
            toDate,
            search,
            paymentStatus,
            maintenanceProvider
        } = req.query;

        const filter = {};

        // Supplier
        if (supplier) {
            if (!mongoose.Types.ObjectId.isValid(supplier)) {
                return res.status(400).json({
                    message: "معرف التاجر غير صحيح"
                });
            }

            filter.supplier = supplier;
        }

        // Payment Status
        if (paymentStatus) {
            filter.paymentStatus = paymentStatus;
        }

        // Maintenance Provider
        if (maintenanceProvider) {
            filter.maintenanceProvider = {
                $regex: maintenanceProvider,
                $options: "i"
            };
        }

        // Purchase Date
        if (fromDate || toDate) {
            filter.purchaseDate = {};

            if (fromDate) {
                const start = new Date(fromDate);
                start.setHours(0, 0, 0, 0);
                filter.purchaseDate.$gte = start;
            }

            if (toDate) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                filter.purchaseDate.$lte = end;
            }
        }

        // Search
        if (search) {
            search = search.trim();

            const suppliers = await supplierModel.find({
                name: {
                    $regex: search,
                    $options: "i"
                }
            }).select("_id");

            const conditions = [
                {
                    supplier: {
                        $in: suppliers.map(s => s._id)
                    }
                },
                {
                    equipmentName: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    maintenanceProvider: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    "items.partName": {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    "items.faultDescription": {
                        $regex: search,
                        $options: "i"
                    }
                }
            ];

            // Search by invoice number
            if (!isNaN(search)) {
                conditions.push({
                    invoiceNumber: Number(search)
                });
            }

            filter.$or = conditions;
        }

        // Query
        const maintenances = await maintainModel
            .find(
                filter,
                {
                    _id: 1,
                    invoiceNumber: 1,
                    equipmentName: 1,
                    supplier: 1,
                    purchaseDate: 1,
                    maintenanceProvider: 1,
                    totalAmount: 1,
                    paidAmount: 1,
                    remainingAmount: 1,
                    paymentStatus: 1,
                    returnDate: 1
                }
            )
            .populate("supplier", "name balance")
            .sort({
                purchaseDate: -1,
                createdAt: -1
            })
            .skip(skip)
            .limit(limit)
            .lean();

        // Count
        const total = await maintainModel.countDocuments(filter);
        const totalPages = Math.ceil(total / limit);

        // Response
        return res.status(200).json({
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            results: maintenances.length,
            maintenances
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};

// Get Maintenance By Id
exports.getMaintainById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        const maintain = await maintainModel
            .findById(id)
            .populate("supplier", "name balance")
            .populate("equipment", "items")
            .populate("createdBy", "username email")
            .populate("updatedBy", "username email")
            .lean();

        if (!maintain) {
            return res.status(404).json({
                message: "فاتورة الصيانة غير موجودة"
            });
        }

        const payments = await paymentModel
            .find({
                moduleId: id,
                module: "maintenance",
                
            })
            .populate("cheque")
            .lean();

            const filteredPayments = payments.filter(payment => {
            if (payment.paymentMethod !== "cheque") return true;

            return (
                payment.cheque &&
                !["returned", "cancelled"].includes(payment.cheque.status)
            );
        });

        maintain.payments = filteredPayments;

        return res.status(200).json({
            message: "تم جلب بيانات فاتورة الصيانة",
            maintain
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};

// Print Maintenance Invoice
exports.printMaintain = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        const maintain = await maintainModel
            .findById(id)
            .populate("supplier", "name balance")
            .populate("equipment", "equipmentName items")
            .populate("createdBy", "username email")
            .populate("updatedBy", "username email")
            .lean();

        if (!maintain) {
            return res.status(404).json({
                message: "فاتورة الصيانة غير موجودة"
            });
        }

        const payments = await paymentModel
            .find({
                moduleId: id,
                module: "maintenance"
            })
            .populate("cheque")
            .lean();
            
            const filteredPayments = payments.filter(payment => {
            if (payment.paymentMethod !== "cheque") return true;

            return (
                payment.cheque &&
                !["returned", "cancelled"].includes(payment.cheque.status)
            );
        });

        maintain.payments = filteredPayments;

        return res.status(200).json({
            message: "تم جلب بيانات طباعة فاتورة الصيانة بنجاح",
            maintain
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};


// Get Maintenances By Supplier
exports.getMaintainsBySupplier = async (req, res) => {
    try {
        const { supplierId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(supplierId)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        // Pagination
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit) || 10000, 1);
        const skip = (page - 1) * limit;

        // Filters
        const {
            fromDate,
            toDate,
            minAmount,
            maxAmount,
            hasRemaining,
            paymentMethod,
            paymentStatus,
            maintenanceProvider
        } = req.query;

        const filter = {
            supplier: supplierId
        };

        // Date Filter
        if (fromDate || toDate) {
            filter.purchaseDate = {};

            if (fromDate) {
                const start = new Date(fromDate);
                start.setHours(0, 0, 0, 0);
                filter.purchaseDate.$gte = start;
            }

            if (toDate) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                filter.purchaseDate.$lte = end;
            }
        }

        // Amount Filter
        if (minAmount || maxAmount) {
            filter.totalAmount = {};

            if (minAmount)
                filter.totalAmount.$gte = Number(minAmount);

            if (maxAmount)
                filter.totalAmount.$lte = Number(maxAmount);
        }

        // Remaining Amount
        if (hasRemaining === "true") {
            filter.remainingAmount = { $gt: 0 };
        } else if (hasRemaining === "false") {
            filter.remainingAmount = 0;
        }

        // Payment Status
        if (paymentStatus) {
            filter.paymentStatus = paymentStatus;
        }

        // Maintenance Provider
        if (maintenanceProvider) {
            filter.maintenanceProvider = {
                $regex: maintenanceProvider,
                $options: "i"
            };
        }

        // Count
        const total = await maintainModel.countDocuments(filter);

        // Maintenances
        const maintains = await maintainModel
            .find(filter)
            .populate("supplier", "name balance")
            .populate("equipment", "equipmentName")
            .populate("createdBy", "username email")
            .populate("updatedBy", "username email")
            .sort({
                purchaseDate: -1,
                createdAt: -1
            })
            .skip(skip)
            .limit(limit)
            .lean();

        const maintainIds = maintains.map(m => m._id);

        // Payments
        let paymentFilter = {
            module: "maintenance",
            moduleId: { $in: maintainIds }
        };

        if (paymentMethod) {
            paymentFilter.paymentMethod = paymentMethod;
        }

        const payments = await paymentModel
            .find(paymentFilter)
            .populate("cheque")
            .lean();

        const filteredPayments = payments.filter(payment => {
            if (payment.paymentMethod !== "cheque") return true;

            return (
                payment.cheque &&
                !["returned", "cancelled"].includes(payment.cheque.status)
            );
        });

        maintains.forEach(maintain => {
            maintain.payments = filteredPayments.filter(
                p => p.moduleId.toString() === maintain._id.toString()
            );
        });

        return res.status(200).json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1,
            results: maintains.length,
            maintains
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};



