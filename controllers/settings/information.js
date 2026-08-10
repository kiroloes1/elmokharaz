const SystemSettings = require(`${__dirname}/../../models/Settings`);
const bcrypt=require(`bcryptjs`)
const axios=require('axios');
const { createLog } = require('../../services/createLogs');
// get all system info
exports.getSystemSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne().select("-financialPin")
      .populate("updatedBy", "username email role")
      .populate("financialPinUpdatedBy", "username email role");




    if (!settings) {
      settings = await SystemSettings.create({
        factoryName: "اسم المصنع",
        invoiceFactoryName: "اسم المصنع",
        financialPin: "123456", 
      });
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء جلب الإعدادات",
      error: error.message,
    });
  }
};


// update informtion to system  
exports.updateSystemSettings = async (req, res) => {
  try {
    const {
      factoryName,
      invoiceFactoryName,
      systemFont,
      invoiceFont,
      theme,
      
    } = req.body;

    let settings = await SystemSettings.findOne();

    oldSettings=settings
    if (!settings) {
      settings = new SystemSettings();
    }

    if (factoryName !== undefined)
      settings.factoryName = factoryName;

    if (invoiceFactoryName !== undefined)
      settings.invoiceFactoryName = invoiceFactoryName;

    if (systemFont !== undefined)
      settings.systemFont = systemFont;

    if (invoiceFont !== undefined)
      settings.invoiceFont = invoiceFont;

    if (theme) {
      settings.theme = {
        ...settings.theme,
        ...theme,
      };
    }

    // if (financialPin !== undefined) {
      
    //   const financialPinHash =await  bcrypt.hash(financialPin,12)
    //   settings.financialPin = financialPinHash;
     
    // }

    

    settings.updatedBy = req.user.userId;

    await settings.save();

    await createLog({
    section: "الإعدادات",
    action: "تعديل",
    userId: req.user.userId,
    targetId: settings._id,
    title: "إعدادات النظام",
    details: `تم تعديل إعدادات النظام.
اسم المصنع: "${oldSettings.factoryName || "-"}" → "${settings.factoryName}".
اسم المصنع بالفاتورة: "${oldSettings.invoiceFactoryName || "-"}" → "${settings.invoiceFactoryName}".
خط النظام: "${oldSettings.systemFont || "-"}" → "${settings.systemFont}".
خط الفاتورة: "${oldSettings.invoiceFont || "-"}" → "${settings.invoiceFont}".`
});

    res.status(200).json({
      success: true,
      message: "تم تحديث الإعدادات بنجاح",
      data: settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تحديث الإعدادات",
      error: error.message,
    });
  }
};


// update informtion to system  
exports.updateFinancialPin = async (req, res) => {
  try {
    const {
      financialPin
    } = req.body;

    let settings = await SystemSettings.findOne();

    if (!settings) {
      settings = new SystemSettings();
    }



    if (financialPin !== undefined) {
      
         const financialPinHash =await  bcrypt.hash(financialPin,12)
         settings.financialPin = financialPinHash;
         settings.financialPinUpdatedBy = req.user.userId;
         settings.financialPinUpdatedDate=new Date();
    }



    await settings.save();

    await createLog({
    section: "الإعدادات",
    action: "تعديل",
    userId: req.user.userId,
    targetId: settings._id,
    title: "الرقم السري المالي",
    details: `تم تغيير الرقم السري المالي للنظام بتاريخ ${new Date(settings.financialPinUpdatedDate).toLocaleString("ar-EG")}.`
});
    res.status(200).json({
      success: true,
      message: "تم تحديث  رمز الحمايه الماليه بنجاح",
      data: settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تحديث رمز الحمايه الماليه ",
      error: error.message,
    });
  }
};

