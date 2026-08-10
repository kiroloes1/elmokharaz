const { createLog } = require("../../services/createLogs");

const chequeModel=require(`${__dirname}/../../models/money/cheque`);
const equipmentSupplyModel=require(`${__dirname}/../../models/purchase/equipment/EquipmentSupply`);
const supplierModel=require(`${__dirname}/../../models/peapole/supplier`);
const paymentModel=require(`${__dirname}/../../models/money/payment`);
const TransactionModel =require(`${__dirname}/../../models/money/TransactionBox`);
const mongoose=require(`mongoose`)
const axios=require("axios")

// create Equipment supply
exports.createEquipmentSupply=async(req,res)=>{
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
         
            equipmentName
      
        } = req.body;

        const userId=req.user?.userId;


        // set time to invoiceNumber
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date();
        tomorrow.setHours(23, 59, 59, 999);


        const payments = Array.isArray(payment) ? payment : [];
      
        if (!Array.isArray(items) || items.length === 0)
                     throw new Error("يجب إضافة مستلزم واحد على الأقل");

        for (const p of payments) {
            if (!p.paymentMethod  || p.paidAmount < 0) {
                throw new Error("بيانات الدفع غير صحيحة");
            }
        }

        for (const item of items) {

                if (item.quantity <= 0)
                    throw new Error("الكمية غير صحيحة");

                if (item.unitPrice < 0)
                    throw new Error("سعر الشراء غير صحيح");

            }

        const supplierExists = await supplierModel.findById(supplier).session(session);
        if (!supplierExists) throw new Error("التاجر غير موجود");


        const lastPurchase= await equipmentSupplyModel
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
              item.total = Number(
                            (item.quantity * item.unitPrice).toFixed(2)
                        );
              totalAmount = Number(
                        (totalAmount + item.total).toFixed(2)
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
        const purchase = await equipmentSupplyModel.create([{
            invoiceNumber:invoiceNumber,
            supplier,
            purchaseDate,
            equipmentName,
            createdBy: userId,
            items,
            totalAmount,
            oldBalance,
            notes,
            paidAmount,
            remainingAmount:netDue,
            paymentStatus,
        }], { session });

        supplierExists.balance = newBalance;

        await supplierExists.save({ session });

        const itemsUpdate=[];

                for (const p of payments){
                    const paymentData = {
                            supplier: supplierExists._id,
                            module: "equipment_supply",
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
                                `دفع نقدي للمورد ${supplierExists.name} مقابل  شراء مستلزمات معدات`,
                                    category: "equipment_supply",
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
                                                    notes:  `عمليه ارسال اموال الي التاجر ${supplierExists.name} سيستم المخرز مقابل مستلزمات معده`,
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
                                        module: "equipment_supply",
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

                    var payment1=    await paymentModel.create([paymentData], { session });



            }

                if(itemsUpdate.length > 0){
  
             await TransactionModel.create([{
            
            type: "expense",
            note: note || "دفع نقدي للتاجر " + supplierExists.name + " مقابل شراء مستلزمات معدات",
            items: itemsUpdate || [],
            supplierId: supplierExists._id,
            purchaseId: purchase[0]._id,
            date: purchaseDate || new Date(),
            ref:payment1[0]?._id
            
        }], { session });

    
    }

        await createLog({
        section: "مستلزمات المعدات",
        action: "إنشاء",
        userId: userId,
        targetId: purchase[0]._id,
            title: `فاتورة شراء مستلزمات معدات رقم ${purchase[0].invoiceNumber}`,

            details: `تم إنشاء فاتورة شراء مستلزمات معدات رقم ${purchase[0].invoiceNumber} للتاجر ${supplierExists.name}
            بتاريخ ${new Date(purchaseDate).toLocaleDateString("ar-EG")}
            بإجمالي ${Number(totalAmount).toLocaleString()}
            ج.م، تم دفع ${Number(paidAmount).toLocaleString()}
            ج.م، والمتبقي ${Number(netDue).toLocaleString()}
            ج.م، وأصبح رصيد التاجر
            ${Number(newBalance).toLocaleString()} ج.م.`
    ,session,
    });

            await session.commitTransaction();
                session.endSession();

                res.status(201).json({
                    message: "تم إنشاء فاتورة شراء مستلزمات المعدات بنجاح",
                    purchaseEquipment: purchase[0]
                });




        
    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
}

// update Equipment Supply 
exports.updateEquipmentSupply = async (req, res) => {
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
            equipmentName
        } = req.body;

        const payments = Array.isArray(payment) ? payment : [];

        if (!Array.isArray(items) || items.length === 0) {
            throw new Error("يجب إضافة مستلزم واحد على الأقل");
        }
        if (!equipmentName?.trim()) {
    throw new Error("اسم المعدة مطلوب");
}

        // Validate payments
        for (const p of payments) {
            if (!p.paymentMethod || p.paidAmount == null || p.paidAmount < 0) {
                throw new Error("بيانات الدفع غير صحيحة");
            }
        }

        // Validate items
        for (const item of items) {
            if (!item.quantity || item.quantity <= 0)
                throw new Error("الكمية غير صحيحة");

            if (item.unitPrice == null || item.unitPrice < 0)
                throw new Error("سعر الشراء غير صحيح");
        }

        // 1. Fetch Existing Record
        const oldPurchaseEquipment = await equipmentSupplyModel.findById(id).session(session);
        if (!oldPurchaseEquipment) throw new Error("فاتورة شراء مستلزمات المعدات غير موجودة");

        // Determine target supplier (either newly selected or old one)
        const targetSupplierId = supplier || oldPurchaseEquipment.supplier;

        const oldSupplier = await supplierModel.findById(oldPurchaseEquipment.supplier).session(session);
        if (!oldSupplier) throw new Error("التاجر القديم غير موجود");

        let newSupplier = oldSupplier;
        if (targetSupplierId.toString() !== oldSupplier._id.toString()) {
            newSupplier = await supplierModel.findById(targetSupplierId).session(session);
            if (!newSupplier) throw new Error("التاجر الجديد غير موجود");
        }

        // 2. ROLLBACK OLD EFFECT
        const oldPaid = oldPurchaseEquipment.paidAmount || 0;
        const oldTotal = oldPurchaseEquipment.totalAmount || 0;
        const oldNet = oldTotal - oldPaid; // صافي المتبقي للتاجر سابقاً

        // إعادة الرصيد للمورد القديم (خصم المبلغ الذي كان متبقياً له)
        oldSupplier.balance = Number((oldSupplier.balance - oldNet).toFixed(2));
        await oldSupplier.save({ session });

        // 3. RECALCULATE ITEMS & PAYMENTS
        let totalAmount = 0;
        for (const item of items) {
            item.total = Number((item.quantity * item.unitPrice).toFixed(2));
            totalAmount = Number((totalAmount + item.total).toFixed(2));
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
        const purchase = await equipmentSupplyModel.findByIdAndUpdate(
            id,
            {
                supplier: newSupplier._id,
                purchaseDate,
                items,
                totalAmount,
                equipmentName,
                notes,
                paidAmount,
                remainingAmount: netDue,
                receivedBy: userId,
                paymentStatus,
                updatedBy: userId,
                oldBalance
            },
            { returnDocument: "after", session }
        );

        // 6. DELETE / REVERT WALLET TRANSACTIONS & RELATED MODELS
        const oldPayments = await paymentModel.find({
            moduleId: id,
            module: "equipment_supply",
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
            module: "equipment_supply",
        }).session(session);

        await chequeModel.deleteMany({
            moduleId: id,
            module: "equipment_supply",
        }).session(session);

        // 7. CREATE NEW PAYMENTS & TRANSACTIONS
        const itemsUpdate = [];

        for (const p of payments) {
            const paymentData = {
                supplier: newSupplier._id,
                module: "equipment_supply",
                moduleId: purchase._id,
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
                    title: `دفع نقدي للمورد ${newSupplier.name} مقابل شراء معدات`,
                    category: "equipment_supply",
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
                    notes: `عملية إرسال أموال إلى التاجر ${newSupplier.name} مقابل شراء مستلزمات معدات`,
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
                    module: "equipment_supply",
                    moduleId: purchase._id,
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

         var payment1=   await paymentModel.create([paymentData], { session });
        }

        if (itemsUpdate.length > 0) {
            await TransactionModel.create([{
                type: "expense",
                note: note || `دفع نقدي للتاجر ${newSupplier.name} مقابل شراء مستلزمات معدات`,
                items: itemsUpdate,
                supplierId: newSupplier._id,
                purchaseId: purchase._id,
                date: purchaseDate || new Date(),
                ref:payment1[0]?._id
            }], { session });
        }

        await createLog({
            section: "مستلزمات المعدات",
            action: "تعديل",
            userId,
            targetId: purchase._id,
            title: `فاتورة شراء مستلزمات معدات رقم ${purchase.invoiceNumber}`,
            details:
                `تم تعديل فاتورة شراء مستلزمات المعدات رقم ${purchase.invoiceNumber}
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
            message: "تم تعديل الفاتوره بنجاح",
            purchaseEquipment: purchase
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
};


// delete Equipment Supply
exports.deleteEquipmentSupply = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("ID غير صحيح");
        }

  
        // 1. GET OLD Equipments
  
        const oldPurchaseEquipment = await equipmentSupplyModel.findById(id).session(session);
        if (!oldPurchaseEquipment) throw new Error("فاتورة شراء مستلزمات المعدات غير موجودة");

        const supplier = await supplierModel.findById(oldPurchaseEquipment.supplier).session(session);
        if (!supplier) throw new Error("التاجر غير موجود");

  
        // 2. ROLLBACK SUPPLIER
  
        const oldPaid = oldPurchaseEquipment.paidAmount || 0;
        const oldNet = (oldPurchaseEquipment.totalAmount || 0) - oldPaid;

        const oldBalance = supplier.balance;

        supplier.balance = Number((supplier.balance - oldNet).toFixed(2));

        const newBalance = supplier.balance;

        await supplier.save({ session });

  
        // 3. DELETE CASH TRANSACTIONS
  
         
        const payments = await paymentModel.find({
                moduleId: id,
                module: "equipment_supply",
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
}
        await TransactionModel.deleteMany({
            
            purchaseId: id,
            type: "expense"
        }).session(session);

       await paymentModel.deleteMany({
             moduleId:id,
             module: "equipment_supply",
        }).session(session);

        await chequeModel .deleteMany({
             moduleId:id,
             module: "equipment_supply",
        }).session(session);



       

                    

        

  
  
    await createLog({
        section: "مستلزمات المعدات",
        action: "حذف",
        userId: req.user.userId,
        targetId: oldPurchaseEquipment._id,
        title:
        `فاتورة شراء مستلزمات  معدات رقم ${oldPurchaseEquipment.invoiceNumber}`,
details: `
تم حذف فاتورة شراء مستلزمات المعدات رقم ${oldPurchaseEquipment.invoiceNumber}
الخاصة بالتاجر ${supplier.name}
بتاريخ ${new Date(oldPurchaseEquipment.purchaseDate).toLocaleDateString("ar-EG")}.

كانت قيمة الفاتورة ${Number(oldPurchaseEquipment.totalAmount).toLocaleString()} ج.م،
وتم دفع ${Number(oldPurchaseEquipment.paidAmount).toLocaleString()} ج.م.

تغير رصيد التاجر من
${Number(oldBalance).toLocaleString()} ج.م
إلى
${Number(newBalance).toLocaleString()} ج.م.
`
        ,session,
    });
        // 4. DELETE Equipments
  
        await equipmentSupplyModel.findByIdAndDelete(id, { session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "تم حذف فاتورة شراء مستلزمات المعدات بنجاح"
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        console.log(err.data)
        res.status(500).json({ message: err.message });
    }
};


// Get All Equipment Supplies
exports.getAllEquipmentsSupply = async (req, res) => {
    try {
        // Pagination
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit) || 10, 1);
        const skip = (page - 1) * limit;

        // Filters
        let { supplier, fromDate, toDate, search } = req.query;

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
                name: { $regex: search, $options: "i" }
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
                    "items.itemName": {
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
        const equipments = await equipmentSupplyModel
            .find(
                filter,
                {
                    _id: 1,
                    invoiceNumber: 1,
                    equipmentName: 1,
                    supplier: 1,
                    purchaseDate: 1,
                    totalAmount: 1,
                    paidAmount: 1,
                    remainingAmount: 1,
                    paymentStatus: 1,
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
        const total = await equipmentSupplyModel.countDocuments(filter);

        const totalPages = Math.ceil(total / limit);

        // Response
        return res.status(200).json({
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            results: equipments.length,
            equipments
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};

// Get Equipment Supply By Id
exports.getEquipmentSupplyById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        const equipment = await equipmentSupplyModel
            .findById(id)
            .populate("supplier", "name balance")
            .populate("createdBy", "username email")
            .populate("updatedBy", "username email")
            .lean();

        if (!equipment) {
            return res.status(404).json({
                message: "فاتورة شراء مستلزمات المعدات غير موجودة"
            });
        }

        const payments = await paymentModel
            .find({
                moduleId: id,
                module: "equipment_supply",
                
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


        equipment.payments = filteredPayments;

        return res.status(200).json({
            message: "تم جلب بيانات فاتورة شراء مستلزمات المعدات",
            equipment
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};


// Print Equipment Supply Invoice
exports.printEquipmentSupply = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        const equipment = await equipmentSupplyModel
            .findById(id)
            .populate("supplier", "name balance")
            .populate("createdBy", "username email")
            .populate("updatedBy", "username email")
            .lean();

        if (!equipment) {
            return res.status(404).json({
                message: "فاتورة شراء مستلزمات المعدات غير موجودة"
            });
        }

        const payments = await paymentModel
            .find({
                moduleId: id,
                module: "equipment_supply"
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

        equipment.payments = filteredPayments;

        return res.status(200).json({
            message: "تم جلب بيانات الطباعة بنجاح",
            equipment
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};


// Get Equipment Supply By Supplier
exports.getEquipmentSupplyBySupplier = async (req, res) => {
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
            paymentMethod
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

        // Remaining Filter
        if (hasRemaining === "true") {
            filter.remainingAmount = { $gt: 0 };
        } else if (hasRemaining === "false") {
            filter.remainingAmount = 0;
        }

        // Count
        const total = await equipmentSupplyModel.countDocuments(filter);

        // Equipment Supplies
        const equipments = await equipmentSupplyModel
            .find(filter)
            .populate("supplier", "name balance")
            .populate("createdBy", "username email")
            .populate("updatedBy", "username email")
            .sort({
                purchaseDate: -1,
                createdAt: -1
            })
            .skip(skip)
            .limit(limit)
            .lean();

        const equipmentIds = equipments.map(e => e._id);

        // Payments
        let paymentFilter = {
            module: "equipment_supply",
            moduleId: { $in: equipmentIds }
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

        equipments.forEach(equipment => {
            equipment.payments = filteredPayments.filter(
                p => p.moduleId.toString() === equipment._id.toString()
            );
        });

        return res.status(200).json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1,
            results: equipments.length,
            equipments
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};
