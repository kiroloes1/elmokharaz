const EqupimnetPart = require('../../models/purchase/equipment/equipmentPart');
const { addIfPresent } = require('../../utils/reportUtils');


 exports.EqupimnetPart=async(req, res) => {
  try {
    const { itemName } = req.query;
    const filter = {};
    addIfPresent(filter, 'itemName', itemName, (v) => new RegExp(v, 'i'));

    const [detail, count] = await Promise.all([
      EqupimnetPart.find(filter).sort({ itemName: 1 }).lean(),
      EqupimnetPart.countDocuments(filter),
    ]);

    res.json({ summary: { count }, detail });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تقرير قطع الغيار', error: err.message });
  }
};

