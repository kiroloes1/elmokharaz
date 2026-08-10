const mongoose = require("mongoose");

const chequeSchema = new mongoose.Schema(
{
    //  cheque owner 
    customer:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Customer",
        
    },
    supplier:{
          type:mongoose.Schema.Types.ObjectId,
        ref:"Supplier",
    },

 
    module:{
        type:String,
        enum:[
            "delivery",
            "collection",
            "purchase",
            "pay",
            "debt",
            "maintenance",
            "wire",
            "bag",
            "other",
            "equipment",
            "equipment_supply",
            "export",
            "import",
            "collection",
            "other"
        ],
        required:true
    },

    moduleId:{
        type:mongoose.Schema.Types.ObjectId
    },

    chequeNumber:{
        type:String,
        required:true,
        trim:true
    },

    chequeType:{
        type:String,
        enum:[
            "normal",
            "clearing"
        ],
        required:true
    },

    bankName:{
        type:String,
        required:true,
        trim:true
    },

    amount:{
        type:Number,
        required:true,
        min:0
    },

    receiveDate:{
        type:Date,
        required:true
    },

    dueDate:{
        type:Date,
        required:true
    },

    status:{
        type:String,
        enum:[
            "under_collection",
            "due_today",
            "collected",
            "returned",
            "cancelled"
        ],
        default:"under_collection"
    },

    location:{
        type:String,
        enum:[
            "with_me",
            "bank",
            "collector",
            "delivered",
            "archived"
        ],
        default:"with_me"
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
    },
    moneyFlow: {
    type: String,
    enum: ["incoming", "outgoing"],
    
},

},{
    timestamps:true
});

module.exports = mongoose.model("Cheque",chequeSchema);