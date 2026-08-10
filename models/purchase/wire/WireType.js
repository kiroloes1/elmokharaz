const mongoose = require("mongoose");

const wireTypeSchema = new mongoose.Schema(
{
    name:{
        type:String,
        required:true,
        trim:true
    },

    notes:{
        type:String,
        default:""
    }

},{
    timestamps:true
});

module.exports = mongoose.model("WireType",wireTypeSchema);