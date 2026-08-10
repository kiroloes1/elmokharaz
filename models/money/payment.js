const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    // ===========================
    // Customer OR Supplier
    // ===========================
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },

    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },

    // ===========================
    // Related Module
    // ===========================
    module: {
      type: String,
      enum: [
        "delivery",          // نقلة
        "pay",               // دفع عميل
        "debt",              // اضافه مديونيه 
        "equipment_supply", // مستلزمات المعدات
        "maintenance",       // صيانة
        "equipment",         // معدات
        "wire",              // سلك
        "bag",              // شكاير
        "export",            //تصدير
        "import",            //استيراد
        "collection",        // تحصيل
        "purchase",          // شراء
        "other"              // اخرى
      ],
      required: true,
    },

    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // ===========================
    // Payment
    // ===========================
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentMethod: {
      type: String,
      enum: [
        "cash",
        "wallet",
        "bank",
        "instapay",
        "mail",
        "cheque",
        "work"
      ],
      required: true,
    },
    moneyFlow: {
    type: String,
    enum: ["incoming", "outgoing"],
    required: true
},

    // ===========================
    // Wallet Details
    // ===========================
    walletInfo: {


      provider: String,

      senderName: String,
      senderPhone: String,

      receiverName: String,
      receiverPhone: String,

      transactionReference: String,
      linkWallet:Boolean,
      walletId:String

    },

    // ===========================
    // Bank / Instapay
    // ===========================
    bankInfo: {
        bankName: {
            type: String,
            trim: true
        },

        transactionReference: {
            type: String,
            trim: true
        }
    },



    // ===========================
    // Cheque
    // ===========================
    cheque: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cheque",
    },

    // ===========================
    // General
    // ===========================
    transactionDate: {
      type: Date,
      required: true,
    },

    notes: {
      type: String,
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);



// ===========================
// Indexes
// ===========================
paymentSchema.index({ customer: 1 });
paymentSchema.index({ supplier: 1 });
paymentSchema.index({ module: 1 });
paymentSchema.index({ moduleId: 1 });
paymentSchema.index({ paymentMethod: 1 });
paymentSchema.index({ transactionDate: -1 });

module.exports = mongoose.model("Payment", paymentSchema);