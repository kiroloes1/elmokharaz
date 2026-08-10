const mongoose = require("mongoose");
const BagType = require(`${__dirname}/../../models/purchase/bag/BagType`);


// ======================
// Create Bag Type
// ======================
exports.createBagType = async (req, res) => {
    try {
        const { name, notes } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({
                message: "اسم نوع الشنطة مطلوب"
            });
        }

        const exists = await BagType.findOne({
            name: name.trim()
        });

        if (exists) {
            return res.status(400).json({
                message: "نوع الشنطة موجود بالفعل"
            });
        }

        const bagType = await BagType.create({
            name: name.trim(),
            notes: notes || ""
        });

        res.status(201).json({
            message: "تم إضافة نوع الشنطة بنجاح",
            bagType
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
};


// ======================
// Get All Bag Types
// ======================
exports.getBagTypes = async (req, res) => {
    try {

        const bagTypes = await BagType.find()
            .sort({ createdAt: -1 });

        res.status(200).json({
            count: bagTypes.length,
            bagTypes
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
};


// ======================
// Get Bag Type By Id
// ======================
exports.getBagTypeById = async (req, res) => {
    try {

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        const bagType = await BagType.findById(id);

        if (!bagType) {
            return res.status(404).json({
                message: "نوع الشنطة غير موجود"
            });
        }

        res.status(200).json(bagType);

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
};


// ======================
// Update Bag Type
// ======================
exports.updateBagType = async (req, res) => {
    try {

        const { id } = req.params;
        const { name, notes } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        if (!name?.trim()) {
            return res.status(400).json({
                message: "اسم نوع الشنطة مطلوب"
            });
        }

        const exists = await BagType.findOne({
            name: name.trim(),
            _id: { $ne: id }
        });

        if (exists) {
            return res.status(400).json({
                message: "نوع الشنطة موجود بالفعل"
            });
        }

        const bagType = await BagType.findByIdAndUpdate(
            id,
            {
                name: name.trim(),
                notes: notes || ""
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!bagType) {
            return res.status(404).json({
                message: "نوع الشنطة غير موجود"
            });
        }

        res.status(200).json({
            message: "تم تعديل نوع الشنطة بنجاح",
            bagType
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
};


// ======================
// Delete Bag Type
// ======================
exports.deleteBagType = async (req, res) => {
    try {

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        const bagType = await BagType.findByIdAndDelete(id);

        if (!bagType) {
            return res.status(404).json({
                message: "نوع الشنطة غير موجود"
            });
        }

        res.status(200).json({
            message: "تم حذف نوع الشنطة بنجاح"
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
};