const WireType = require(`${__dirname}/../../models/purchase/wire/WireType`);
const mongoose = require("mongoose");
// Create Wire Type
exports.createWireType = async (req, res) => {
    try {
        const { name, notes } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({
                message: "اسم نوع السلك مطلوب"
            });
        }

        const exists = await WireType.findOne({
            name: name.trim()
        });

        if (exists) {
            return res.status(400).json({
                message: "نوع السلك موجود بالفعل"
            });
        }

        const wireType = await WireType.create({
            name: name.trim(),
            notes
        });

        res.status(201).json({
            message: "تم إضافة نوع السلك بنجاح",
            wireType
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
};

exports.getWireTypes = async (req, res) => {
    try {

        const wireTypes = await WireType.find()
            .sort({ createdAt: -1 });

        res.status(200).json({
            count: wireTypes.length,
            wireTypes
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
};

exports.getWireTypeById = async (req, res) => {
    try {

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        const wireType = await WireType.findById(id);

        if (!wireType) {
            return res.status(404).json({
                message: "نوع السلك غير موجود"
            });
        }

        res.status(200).json(wireType);

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
};

exports.updateWireType = async (req, res) => {
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
                message: "اسم نوع السلك مطلوب"
            });
        }

        const exists = await WireType.findOne({
            name: name.trim(),
            _id: { $ne: id }
        });

        if (exists) {
            return res.status(400).json({
                message: "نوع السلك موجود بالفعل"
            });
        }

        const wireType = await WireType.findByIdAndUpdate(
            id,
            {
                name: name.trim(),
                notes
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!wireType) {
            return res.status(404).json({
                message: "نوع السلك غير موجود"
            });
        }

        res.status(200).json({
            message: "تم تعديل نوع السلك بنجاح",
            wireType
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
};

exports.deleteWireType = async (req, res) => {
    try {

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "ID غير صحيح"
            });
        }

        const wireType = await WireType.findByIdAndDelete(id);

        if (!wireType) {
            return res.status(404).json({
                message: "نوع السلك غير موجود"
            });
        }

        res.status(200).json({
            message: "تم حذف نوع السلك بنجاح"
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
};