const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
{
    section: {
        type: String,
    
    },

    action: {
        type: String,

       
    },

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      
    },

    targetId: {
        type: mongoose.Schema.Types.ObjectId,
    },

    title: {
        type: String,
        default: "",
    },

    details: {
        type: String,
        default: "",
    },
},
{
    timestamps: true,
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);