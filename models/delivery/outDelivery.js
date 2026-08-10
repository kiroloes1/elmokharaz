const mongoose = require('mongoose');

// each batch of an item in a delivery
const batchSchema = new mongoose.Schema({
  quantity: { type: Number, required: true , min: 1},   
  weight: { type: Number, required: true , min: 0 },      
});


// each item in a delivery, which can have multiple batches
const deliveryItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true }, 
  batches: [batchSchema], 
  returnWeight: { type: Number, default: 0 }, 
  oldReturnWeight: { type: Number, default: 0 }, 
  pricePerKg: { type: Number, required: true },      
  totalWeight: { type: Number }, // sum( returnWeight + oldReturnWeight  )
  totalPrice: { type: Number } ,
  totalReturnPrice: { type: Number , default: 0} ,
  discount: { type: Number, default: 0 },
});


//  main delivery documents
const deliverSchema = new mongoose.Schema({
delveryNumber: { type: Number },
  carName:{type:String, default : "اسم السائق غير مذكور"},
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  deliveryDate: { type: Date, default: Date.now },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },   
  items: [deliveryItemSchema],                        
  totalAmount: { type: Number, default: 0 },       
  oldBalance: { type: Number, default: 0 }, 
  payment:[{
       paidAmount: { type: Number, default: 0 },           
       paymentMethod:{
        type:String,
        enum:["cash" , "wallet" ,"instapay" ,"bank","mail","work","cheque"]
       }
  }],  
  paidAmount:{type: Number, default: 0 },   
  remainingAmount: { type: Number, default: 0 },     
  teaForWorkers: { type: Number, default: 0 },       // tips
  notes: { type: String },                            //any notes
  carPayment: { type: Number, default: 0 },      // if the supplier has a car and we pay him for it
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false }, // admin who last updated the delivery
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
},{ timestamps: true });


module.exports = mongoose.model('outDeliver', deliverSchema);
