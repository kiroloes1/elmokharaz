const { createLog } = require("../../services/createLogs");

const chequeModel=require(`${__dirname}/../../models/money/cheque`);
const bagModel=require(`${__dirname}/../../models/purchase/bag/BagPurchase`);
const bagTypeModel=require(`${__dirname}/../../models/purchase/bag/BagType`);
const supplierModel=require(`${__dirname}/../../models/peapole/supplier`);
const paymentModel=require(`${__dirname}/../../models/money/payment`);
const TransactionModel =require(`${__dirname}/../../models/money/TransactionBox`);
const mongoose=require(`mongoose`)
const axios=require("axios")
const equipmentModel=require(`${__dirname}/../../models/purchase/equipment/equipment`)


// create Bag Purchase
exports.createBag=async(req,res)=>{
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


        if (!purchaseDate)
            throw new Error("تاريخ الفاتوره مطلوب");
        for (const p of payments) {
            if (!p.paymentMethod  || p.paidAmount < 0) {
                throw new Error("بيانات الدفع غير صحيحة");
            }
        }



        for (const item of items) {
            if (!item.bagType)
                throw new Error("نوع الشكارة مطلوب");

            if (!item.size?.trim())
                throw new Error("مقاس الشكارة مطلوب");

            if (item.unitPrice == null || item.unitPrice < 0)
                throw new Error("سعر الوحدة غير صحيح");
            if (item.quantity == null || item.quantity <= 0)
                throw new Error("الكمية غير صحيحة");
      
            const bagTypeExists = await bagTypeModel
                .findById(item.bagType)
                .session(session);

            if (!bagTypeExists)
                throw new Error("نوع الشكاير غير موجود");

      
        }



        const supplierExists = await supplierModel.findById(supplier).session(session);
        if (!supplierExists) throw new Error("التاجر غير موجود");


        const lastPurchase= await bagModel
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
            item.total = Number((item.quantity * item.unitPrice).toFixed(2));
           totalAmount = Number((totalAmount + item.total).toFixed(2));
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
        const purchase = await bagModel.create([{
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
        }], { session });

        supplierExists.balance = newBalance;

        await supplierExists.save({ session });

        const itemsUpdate=[];

                for (const p of payments){
                    const paymentData = {
                            supplier: supplierExists._id,
                            module: "bag",
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
`دفع نقدي للتاجر ${supplierExists.name} مقابل شراء شكاير `,
                                    category: "bag",
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
                                                    notes:  `عمليه ارسال اموال الي التاجر ${supplierExists.name} مقابل شراء شكاير سيستم المخرز`,
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
                                        module: "bag",
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

                       var payment1= await paymentModel.create([paymentData], { session });



            }

                if(itemsUpdate.length > 0){
  
             await TransactionModel.create([{
            
            type: "expense",
            note: note || "دفع نقدي للتاجر " + supplierExists.name + " مقابل شراء شكاير ",
            items: itemsUpdate || [],
            supplierId: supplierExists._id,
            purchaseId: purchase[0]._id,
            date: purchaseDate || new Date(),
            ref:payment1[0]._id
            
        }], { session });

    
    }

await createLog({
    section: "الشكاير",
    action: "إنشاء",
    userId,
    targetId: purchase[0]._id,
    title: `فاتورة شراء شكاير رقم ${purchase.invoiceNumber}`,
details: `
تم تعديل فاتورة شراء شكاير رقم ${purchase.invoiceNumber}
للتاجر ${supplierExists.name}
بقيمة ${Number(totalAmount).toLocaleString()} ج.م،
تم دفع ${Number(paidAmount).toLocaleString()} ج.م،
والمتبقي ${Number(netDue).toLocaleString()} ج.م،
وأصبح رصيد التاجر ${Number(supplierExists.balance).toLocaleString()} ج.م.
`,
    session
});

            await session.commitTransaction();
                session.endSession();

                res.status(201).json({
                    message: "تم إنشاء فاتورة شراء الشكاير بنجاح",
                    bagPurchase: purchase[0]
                });




        
    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
}


// update Bag Purchase
exports.updateBag = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("ID غير صحيح");
        }

        const {
            supplier, 
            purchaseDate,
            items, // array {name , quantity , unitPrice , total , notes }
            notes,
            note, // to payment
            payment, // is an array 
        } = req.body;

        const payments = Array.isArray(payment) ? payment : [];

        if (!Array.isArray(items) || items.length === 0) {
            throw new Error("يجب إضافة مستلزم واحد على الأقل");
        }

        if (!purchaseDate)
            throw new Error("تاريخ الفاتوره مطلوب");

        // Validate payments
        for (const p of payments) {
            if (!p.paymentMethod || p.paidAmount == null || p.paidAmount < 0) {
                throw new Error("بيانات الدفع غير صحيحة");
            }
        }


        for (const item of items) {
            if (!item.bagType)
                throw new Error("نوع الشكارة مطلوب");

            if (!item.size?.trim())
                throw new Error("مقاس الشكارة مطلوب");

            if (item.unitPrice == null || item.unitPrice < 0)
                throw new Error("سعر الوحدة غير صحيح");
            if (item.quantity == null || item.quantity <= 0)
                throw new Error("الكمية غير صحيحة");

                    const bagTypeExists = await bagTypeModel
                .findById(item.bagType)
                .session(session);

            if (!bagTypeExists)
                throw new Error("نوع الشكارة غير موجود");
                    


        // 1. Fetch Existing Record
        const oldbagPurchase = await bagModel.findById(id).session(session);
        if (!oldbagPurchase) throw new Error("فاتورة شراء الشكاير غير موجودة");

        // Determine target supplier (either newly selected or old one)
        const targetSupplierId = supplier || oldbagPurchase.supplier;

        const oldSupplier = await supplierModel.findById(oldbagPurchase.supplier).session(session);
        if (!oldSupplier) throw new Error("التاجر القديم غير موجود");

        let newSupplier = oldSupplier;
        if (targetSupplierId.toString() !== oldSupplier._id.toString()) {
            newSupplier = await supplierModel.findById(targetSupplierId).session(session);
            if (!newSupplier) throw new Error("التاجر الجديد غير موجود");
        }

        // 2. ROLLBACK OLD EFFECT
        const oldPaid = oldbagPurchase.paidAmount || 0;
        const oldTotal = oldbagPurchase.totalAmount || 0;
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
        const purchase = await bagModel.findByIdAndUpdate(
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
                oldBalance
            },
            { returnDocument: "after", session }
        );

        // 6. DELETE / REVERT WALLET TRANSACTIONS & RELATED MODELS
        const oldPayments = await paymentModel.find({
            moduleId: id,
            module: "bag",
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
            module: "bag",
        }).session(session);

        await chequeModel.deleteMany({
            moduleId: id,
            module: "bag",
        }).session(session);

        // 7. CREATE NEW PAYMENTS & TRANSACTIONS
        const itemsUpdate = [];

        for (const p of payments) {
            const paymentData = {
                supplier: newSupplier._id,
                module: "bag",
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
                    title: `دفع نقدي للمورد ${newSupplier.name} مقابل شراء شكاير`,
                    category: "bag",
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
                    notes: `عملية إرسال أموال إلى التاجر ${newSupplier.name} مقابل شراء شكاير`,
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
                    module: "bag",
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
                note: note || `دفع نقدي للتاجر ${newSupplier.name} مقابل شراء شكاير`,
                items: itemsUpdate,
                supplierId: newSupplier._id,
                purchaseId: purchase._id,
                date: purchaseDate || new Date(),
                ref:payment1[0]._id
            }], { session });
        }

        await createLog({
            section: "الشكاير",
            action: "تعديل",
            userId,
            targetId: purchase._id,
            title: `فاتورة شراء شكاير رقم ${purchase.invoiceNumber}`,
            details:
                `تم تعديل فاتورة شراء الشكاير رقم ${purchase.invoiceNumber}
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
            bagPurchase: purchase
        });

    }} catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
};


// Delete Bag Purchase
exports.deleteBag = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("ID غير صحيح");
        }

        // Get Invoice
        const oldbagPurchase = await bagModel.findById(id).session(session);
        if (!oldbagPurchase)
            throw new Error("فاتورة شراء الشكاير غير موجودة");

        // Supplier
        const supplier = await supplierModel
            .findById(oldbagPurchase.supplier)
            .session(session);

        if (!supplier)
            throw new Error("التاجر غير موجود");

        // Rollback Supplier Balance
        const oldPaid = oldbagPurchase.paidAmount || 0;
        const oldNet = (oldbagPurchase.totalAmount || 0) - oldPaid;

        const oldBalance = supplier.balance;

        supplier.balance = Number(
            (supplier.balance - oldNet).toFixed(2)
        );

        const newBalance = supplier.balance;

        await supplier.save({ session });

        // Delete Wallet Transactions
        const payments = await paymentModel.find({
            moduleId: id,
            module: "bag"
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

        // Delete Cash Transactions
        await TransactionModel.deleteMany({
            
            purchaseId: id,
            type: "expense"
        }).session(session);

        // Delete Payments
        await paymentModel.deleteMany({
            moduleId: id,
            module: "bag"
        }).session(session);

        // Delete Cheques
        await chequeModel.deleteMany({
            moduleId: id,
            module: "bag"
        }).session(session);

await createLog({
    section: "الشكاير",
    action: "حذف",
    userId: req.user.userId,
    targetId: oldbagPurchase._id,
    title: `فاتورة شراء شكاير رقم ${oldbagPurchase.invoiceNumber}`,
    details: `
تم حذف فاتورة شراء الشكاير رقم ${oldbagPurchase.invoiceNumber}
الخاصة بالتاجر ${supplier.name}
بتاريخ ${new Date(oldbagPurchase.purchaseDate).toLocaleDateString("ar-EG")}.

كانت قيمة الفاتورة ${Number(oldbagPurchase.totalAmount).toLocaleString()} ج.م،
وتم دفع ${Number(oldbagPurchase.paidAmount).toLocaleString()} ج.م.

تغير رصيد التاجر من
${Number(oldBalance).toLocaleString()} ج.م
إلى
${Number(newBalance).toLocaleString()} ج.م.
`,
    session,
});

        // Delete Invoice
        await bagModel.findByIdAndDelete(id, { session });

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            message: "تم حذف فاتورة شراء الشكاير بنجاح"
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        return res.status(500).json({
            message: err.message
        });
    }
};


// Get All Bag Purchases
exports.getAllBag = async (req, res) => {
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
            bagType
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

        // Bag Type
        if (bagType) {
            if (!mongoose.Types.ObjectId.isValid(bagType)) {
                return res.status(400).json({
                    message: "معرف نوع الشكارة غير صحيح"
                });
            }

            filter["items.bagType"] = bagType;
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

            const bagTypes = await bagTypeModel.find({
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
                    "items.bagType": {
                        $in: bagTypes.map(b => b._id)
                    }
                },
                {
                    "items.size": {
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
        const bags = await bagModel
            .find(
                filter,
                {
                    _id: 1,
                    invoiceNumber: 1,
                    supplier: 1,
                    purchaseDate: 1,
                    totalAmount: 1,
                    paidAmount: 1,
                    remainingAmount: 1,
                    paymentStatus: 1,
                    items: 1
                }
            )
            .populate("supplier", "name balance")
            .populate("items.bagType", "name")
            .sort({
                purchaseDate: -1,
                createdAt: -1
            })
            .skip(skip)
            .limit(limit)
            .lean();

        // Count
        const total = await bagModel.countDocuments(filter);
        const totalPages = Math.ceil(total / limit);

        return res.status(200).json({
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            results: bags.length,
            bags
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};


// Get Bag Purchase By Id
exports.getBagById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        const bag = await bagModel
            .findById(id)
            .populate("supplier", "name balance")
            .populate("items.bagType", "name")
            .populate("createdBy", "username email")
            .populate("updatedBy", "username email")
            .lean();

        if (!bag) {
            return res.status(404).json({
                message: "فاتورة شراء الشكاير غير موجودة"
            });
        }

        const payments = await paymentModel
            .find({
                moduleId: id,
                module: "bag",
                
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

            

        bag.payments = filteredPayments;

        return res.status(200).json({
            message: "تم جلب بيانات فاتورة شراء الشكاير",
            bag
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};


// Print Bag Invoice
exports.printBag = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        const bag = await bagModel
            .findById(id)
            .populate("supplier", "name balance")
            .populate("items.bagType", "name")
            .populate("createdBy", "username email")
            .populate("updatedBy", "username email")
            .lean();

        if (!bag) {
            return res.status(404).json({
                message: "فاتورة شراء الشكاير غير موجودة"
            });
        }

        const payments = await paymentModel
            .find({
                moduleId: id,
                module: "bag"
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

        bag.payments = filteredPayments;

        return res.status(200).json({
            message: "تم جلب بيانات طباعة فاتورة شراء الشكاير بنجاح",
            bag
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};


// Get Bag Purchases By Supplier
exports.getBagBySupplier = async (req, res) => {
    try {
        const { supplierId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(supplierId)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        // Pagination
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit) || 1000, 1);
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
            bagType
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

        // Bag Type
        if (bagType) {
            if (!mongoose.Types.ObjectId.isValid(bagType)) {
                return res.status(400).json({
                    message: "معرف نوع الشكارة غير صحيح"
                });
            }

            filter["items.bagType"] = bagType;
        }

        // Count
        const total = await bagModel.countDocuments(filter);

        // Bag Purchases
        const bags = await bagModel
            .find(filter)
            .populate("supplier", "name balance")
            .populate("items.bagType", "name")
            .populate("createdBy", "username email")
            .populate("updatedBy", "username email")
            .sort({
                purchaseDate: -1,
                createdAt: -1
            })
            .skip(skip)
            .limit(limit)
            .lean();

        const bagIds = bags.map(b => b._id);

        // Payments
        const paymentFilter = {
            module: "bag",
            moduleId: { $in: bagIds }
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

        bags.forEach(bag => {
            bag.payments = filteredPayments.filter(
                p => p.moduleId.toString() === bag._id.toString()
            );
        });

        return res.status(200).json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1,
            results: bags.length,
            bags
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};