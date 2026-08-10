const mongoose = require("mongoose");

const maintenanceSchema = new mongoose.Schema(
{   
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Supplier",
        required: true
    },

    // Invoice Number
    invoiceNumber: {
        type: Number
    },
    equipmentName:{
        type:String
    },

    // Equipment
    equipment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PurchaseInvoice",
    },

    // Maintenance Provider
    maintenanceProvider: {
        type: String,
        required: true,
        trim: true
    },

    // Sent Date
    purchaseDate: {
        type: Date,
        required: true
    },

    // Return Date
    returnDate: {
        type: Date
    },

    // Parts repaired
    items: [
        {
            partName: {
                type: String,
                required: true,
                trim: true
            },

            faultDescription: {
                type: String,
                required: true,
                trim: true
            },

            repairCost: {
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

    // Total Cost
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },

    // Paid Amount
    paidAmount: {
        type: Number,
        default: 0,
        min: 0
    },

    // Remaining Amount
    remainingAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    oldBalance:{
        type: Number,
        default: 0,
    },

    // Payment Status
    paymentStatus: {
        type: String,
        enum: [
            "unpaid",
            "partial",
            "paid"
        ],
        default: "unpaid"
    },

    // Notes
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

maintenanceSchema.index({ equipment: 1 });
maintenanceSchema.index({ maintenanceProvider: 1 });
maintenanceSchema.index({ purchaseDate: -1 });

module.exports = mongoose.model("Maintenance", maintenanceSchema);