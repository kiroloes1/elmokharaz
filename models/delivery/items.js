const mongoose = require('mongoose');

const fixedCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    pricePerWeight:{
      type:Number,
      
    }
}, { timestamps: true });

module.exports = mongoose.model('Item', fixedCategorySchema);