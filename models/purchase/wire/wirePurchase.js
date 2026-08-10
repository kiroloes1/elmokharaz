const mongoose = require("mongoose");

const wirePurchaseSchema = new mongoose.Schema({

    invoiceNumber: {
        type: Number
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

    items: [
        {
            wireType: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "WireType",
                required: true
            },

            size: {
                type: String,
                required: true,
                trim: true
            },

            quantity: {
                type: Number,
                required: true,
                min: 1
            },

            unitPrice: {
                type: Number,
                required: true,
                min: 0
            },

            total: {
                type: Number,
                required: true,
                min: 0
            },

            notes: {
                type: String,
                default: ""
            }
        }
    ],

    totalAmount: {
        type: Number,
        required: true
    },

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
        enum: ["paid", "partial", "unpaid"],
        default: "unpaid"
    },

    oldBalance: {
        type: Number,
        default: 0
    },

    notes: {
        type: String,
        default: ""
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("WirePurchase", wirePurchaseSchema);