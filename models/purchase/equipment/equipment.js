const mongoose = require("mongoose");

const purchaseInvoiceSchema = new mongoose.Schema({

    invoiceNumber: {
        type: Number,
    },

    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Supplier",
        required: true
    },

    purchaseDate: {
        type: Date,
        required: true
    },

    items: [{
        equipmentName: String,
         type: { type: String }, 
        quantity: {
            type: Number,
            default: 1
        },
        unitPrice: Number,
        total: Number,
        notes: String
    }],

    totalAmount: Number,

    paidAmount: {
        type: Number,
        default: 0
    },

    remainingAmount: {
        type: Number,
        default: 0
    },

    paymentStatus: {
        type: String,
        enum: ["paid","partial","unpaid"],
        default: "unpaid"
    },
    oldBalance:{
      type:Number,
      default:0
    },

    notes: String,

    createdBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    updatedBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },
    receivedBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    }

},{
    timestamps:true
});

module.exports = mongoose.model("PurchaseInvoice",purchaseInvoiceSchema);