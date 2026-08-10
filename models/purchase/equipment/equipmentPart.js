const mongoose=require(`mongoose`);

const EqupimnetPartSchema=new mongoose.Schema({
       // item Name
    itemName:{
        type:String,
        required:true,
        trim:true
    },
})

module.exports = mongoose.model("EqupimnetPart",EqupimnetPartSchema);