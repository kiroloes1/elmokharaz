const mongoose = require("mongoose");

const equipmentSupplySchema = new mongoose.Schema(
{


    invoiceNumber: {
        type: Number,
    },
    // item Name
    equipmentName:{
        type:String,
        required:true,
        trim:true
    },

    // supplier
    supplier:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Supplier",
        required:true
    },
    
    // purchase Date
    purchaseDate:{
        type:Date,
        required:true
    },


    
    items: [{
        itemName: String,
         type: { type: String }, 
        quantity: {
            type: Number,
            default: 1
        },
        unitPrice: Number,
        total: Number,
        notes: String
    }],


    // total Amount 
    totalAmount:{
        type:Number,
        required:true,
        min:0
    },

    // paid Amount
    paidAmount:{
        type:Number,
        default:0
    },

    // remaining Amount
    remainingAmount:{
        type:Number,
        default:0
    },

    // paymentStatus
    paymentStatus:{
        type:String,
        enum:[
            "paid",
            "partial",
            "unpaid"
        ],
        default:"unpaid"
    },

     oldBalance:{
      type:Number,
      default:0
    },

    notes:{
        type:String,
        default:""
    },

    createdBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    updatedBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    }

},{
    timestamps:true
});

module.exports = mongoose.model("EquipmentSupply",equipmentSupplySchema);