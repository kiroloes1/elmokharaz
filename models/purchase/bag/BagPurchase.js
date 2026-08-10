const mongoose = require("mongoose");

const bagPurchaseSchema = new mongoose.Schema(
{
    // Invoice Number
    invoiceNumber: {
        type: Number
    },

    // Supplier
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Supplier",
        required: true
    },

    // Items
    items: [
        {
            // Bag Type
            bagType: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "BagType",
                required: true
            },

            // Size
            size: {
                type: String,
                required: true,
                trim: true
            },

            // Quantity
            quantity: {
                type: Number,
                required: true,
                min: 0
            },

            // Unit Price
            unitPrice: {
                type: Number,
                required: true,
                min: 0
            },

            // Total
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

    // Invoice Total
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },

    // Paid
    paidAmount: {
        type: Number,
        default: 0,
        min: 0
    },

    // Remaining
    remainingAmount: {
        type: Number,
        default: 0,
        min: 0
    },

    oldBalance: {
        type: Number,
        default: 0
    },

    // Payment Status
    paymentStatus: {
        type: String,
        enum: [
            "paid",
            "partial",
            "unpaid"
        ],
        default: "unpaid"
    },

    // Purchase Date
    purchaseDate: {
        type: Date,
        required: true
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

},
{
    timestamps: true
});

bagPurchaseSchema.index({ supplier: 1 });
bagPurchaseSchema.index({ purchaseDate: -1 });

module.exports = mongoose.model("BagPurchase", bagPurchaseSchema);