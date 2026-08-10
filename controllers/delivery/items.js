const FixedCategory = require(`${__dirname}/../../models/delivery/items`);

// CREATE
exports.createFixedCategory = async (req, res) => {
  try {
    const { name, pricePerWeight } = req.body;
    const adminId = req.user.userId;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: "اسم التصنيف مطلوب" });
    }

    const exists = await FixedCategory.findOne({ name: name.trim() });

    if (exists) {
      return res.status(409).json({ message: "التصنيف موجود بالفعل" });
    }

    const category = await FixedCategory.create({
      name: name.trim(),
      pricePerWeight,
      createdBy: adminId
    });

    res.status(201).json({
      message: "تم إنشاء التصنيف بنجاح",
      category
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// get all categories
exports.getAllFixedCategories = async (req, res) => {
  try {
    const categories = await FixedCategory.find()
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: categories.length,
      categories
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// get category by id
exports.getFixedCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await FixedCategory.findById(id);

    if (!category) {
      return res.status(404).json({ message: "Not found" });
    }

    res.status(200).json({ category });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// delete category by id
exports.deleteFixedCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await FixedCategory.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Not found" });
    }

    res.status(200).json({
      message: "تم الحذف بنجاح"
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// update category by id
exports.updateFixedCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, pricePerWeight } = req.body;

    const category = await FixedCategory.findById(id);

    if (!category) {
      return res.status(404).json({ message: "Not found" });
    }

    if (name) category.name = name.trim();
    if (pricePerWeight != null) category.pricePerWeight = pricePerWeight;

    await category.save();

    res.status(200).json({
      message: "تم التعديل بنجاح",
      category
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
