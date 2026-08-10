const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({


    type: {
        type: String,
        enum: ["income", "expense"],
        required: true
    },

    note: String,

    items: [{
        title: String,
        category: {
            type: String,
            enum: [ "bag",
             "export",
            "import",
            "collection",
            "other",
                "wire","maintenance","equipment_supply" ,"equipment","income","cheque","supplier","customer", "expense", "delivery"  ,"outdelivery","carPayment" ,"teaForWorker","AddHand","workerOut", "advance", "deduction", "food"],
        },
        amount: {
            type: Number,
            required: true
        }
    }],

    
        supplierId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Supplier'
        },
                customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer'
        },
        
         deliverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Deliver'
        },
        expenseId:{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Expense'
        },
        purchaseId:{
         type: mongoose.Schema.Types.ObjectId,
            ref: 'PurchaseInvoice'
        },

        totalAmount: {
            type: Number,
            required: true
        },

      date: {
        type: Date,
        default: Date.now
    },
    ref:{
        type:String
    }

}, { timestamps: true });

TransactionSchema.pre('validate', function (next) {

    this.totalAmount = this.items.reduce((sum, item) => {
        return sum + (item.amount || 0);
    }, 0);

});

module.exports = mongoose.model('Transaction', TransactionSchema);