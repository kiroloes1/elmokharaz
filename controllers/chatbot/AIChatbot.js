const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");

// استدعاء جميع الموديلات المتاحة بالكامل
const Supplier = require("../../models/peapole/supplier");
const Customer = require("../../models/peapole/customer");
const PurchaseInvoice = require("../../models/purchase/equipment/equipment");
const EquipmentPart = require("../../models/purchase/equipment/equipmentPart");
const Maintenance = require("../../models/purchase/equipment/maintenance");
const BagPurchase = require("../../models/purchase/bag/BagPurchase");
const WirePurchase = require("../../models/purchase/wire/wirePurchase");
const Cheque = require("../../models/money/cheque");
const Payment = require("../../models/money/payment");
const Expense = require("../../models/expense");
const User = require("../../models/users");
const ActivityLog = require("../../models/activationLogs");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const intentResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    category: {
      type: SchemaType.STRING,
      description: "الفئة المطلوبة للبحث والتحليل من النظام",
      enum: [
        "suppliers",
        "customers",
        "equipment",
        "maintenance_and_parts",
        "bags_and_supplies",
        "wire_purchases",
        "cheques",
        "payments",
        "expenses",
        "users_activity",
        "unknown"
      ],
    },
    action: {
      type: SchemaType.STRING,
      description: "طبيعة الاستفسار (تحليل، أعلى، أقل، إجمالي، إلخ)",
    },
    sortBy: {
      type: SchemaType.STRING,
      description: "حقل الترتيب في قاعدة البيانات",
    },
    limit: {
      type: SchemaType.INTEGER,
      description: "عدد السجلات المطلوبة",
    },
  },
  required: ["category", "action", "sortBy", "limit"],
};

exports.processAiReportQuery = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: "يرجى تقديم سؤال أو استفسار للتحليل.",
      });
    }

    // ----------------------------------------------------
    // 1. تحليل النية (Intent Parsing)
    // ----------------------------------------------------
    let intent = { category: "unknown", sortBy: "createdAt", limit: 10 };

    try {
      const intentModel = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: intentResponseSchema,
          temperature: 0.1,
        },
      });

      const intentPrompt = `
        أنت المحرك الذكي لنظام ERP لمصنع/شركة. حلل الاستفسار وحدد القسم المباشر:
        - "suppliers": الموردين والتجار والمديونيات والتوريدات.
        - "customers": العملاء والمبيعات والأرصدة.
        - "equipment": فاتورة شفرات/معدات/ماكينات (PurchaseInvoice).
        - "maintenance_and_parts": الصيانة، الأعطال، قطع الغيار والمصلحين.
        - "bags_and_supplies": مشتريات الأكياس والشكاير.
        - "wire_purchases": مشتريات وتوريدات السلك.
        - "cheques": الشيكات الصادرة والواردة والمستحقة.
        - "payments": الدفعات، المتحصلات، والمقبوضات (Payment).
        - "expenses": المصاريف والمنثورات والأكل والعمالة (Expense).
        - "users_activity": نشاط المستخدمين واللوجز (ActivityLog / User).
      `;

      const intentResult = await intentModel.generateContent([
        intentPrompt,
        `سؤال المستخدم: "${query}"`,
      ]);

      intent = JSON.parse(intentResult.response.text());
    } catch (aiError) {
      console.warn("Gemini Intent Warning (Fallback used):", aiError.message);
      const q = query.toLowerCase();
      if (q.includes("عميل") || q.includes("عملاء") || q.includes("زبون")) intent.category = "customers";
      else if (q.includes("مورد") || q.includes("تاجر") || q.includes("تجار")) intent.category = "suppliers";
      else if (q.includes("صيانة") || q.includes("عطل") || q.includes("قطع غيار") || q.includes("تصليح")) intent.category = "maintenance_and_parts";
      else if (q.includes("سلك")) intent.category = "wire_purchases";
      else if (q.includes("كيس") || q.includes("أكياس") || q.includes("شكاير")) intent.category = "bags_and_supplies";
      else if (q.includes("شيك") || q.includes("شيكات")) intent.category = "cheques";
      else if (q.includes("مصروف") || q.includes("مصاريف") || q.includes("أكل") || q.includes("عيش")) intent.category = "expenses";
      else if (q.includes("دفع") || q.includes("تحصيل") || q.includes("سداد")) intent.category = "payments";
      else if (q.includes("معد") || q.includes("ماكين") || q.includes("شفر")) intent.category = "equipment";
      else if (q.includes("مستخدم") || q.includes("نشاط") || q.includes("لوج")) intent.category = "users_activity";
      else intent.category = "suppliers";
    }

    const queryLimit = intent.limit || 10;

    // ----------------------------------------------------
    // 2. استعلام البيانات الحقيقية ودعم المسميات الصحيحة
    // ----------------------------------------------------
    let fetchedData = [];
    let extraContext = {};
    let dataSummaryTitle = "";

    switch (intent.category) {
      case "suppliers":
        fetchedData = await Supplier.find()
          .sort({ [intent.sortBy || "balance"]: -1 })
          .limit(queryLimit)
          .select("name phone balance notes createdAt")
          .lean();

        // تحويل البيانات لملائمة الفرونت إند
        fetchedData = fetchedData.map((s) => ({
          ...s,
          totalPurchased: s.balance, // تمثيل رصيد المورد كإجمالي تعامل/مديونية
        }));
        dataSummaryTitle = "سجلات الموردين والتجار";
        break;

      case "customers":
        fetchedData = await Customer.find()
          .sort({ [intent.sortBy || "balance"]: -1 })
          .limit(queryLimit)
          .select("name phone balance openningBalance notes createdAt")
          .lean();

        fetchedData = fetchedData.map((c) => ({
          ...c,
          totalSold: c.balance, // تمثيل رصيد العميل
        }));
        dataSummaryTitle = "سجلات العملاء والزبائن";
        break;

      case "equipment":
        // الاستعلام من PurchaseInvoice المخصص للمعدات
        fetchedData = await PurchaseInvoice.find()
          .sort({ purchaseDate: -1 })
          .limit(queryLimit)
          .populate("supplier", "name phone")
          .lean();

        // معالجة أسماء الماكينات من داخل عناصر الفاتورة
        fetchedData = fetchedData.map((inv) => {
          const names = inv.items?.map((i) => i.equipmentName).filter(Boolean).join(" ، ");
          return {
            _id: inv._id,
            equipmentName: names || `فاتورة معدات #${inv.invoiceNumber || ""}`,
            supplierName: inv.supplier?.name || "غير محدد",
            totalCost: inv.totalAmount,
            paidAmount: inv.paidAmount,
            remainingAmount: inv.remainingAmount,
            purchaseDate: inv.purchaseDate,
          };
        });
        dataSummaryTitle = "فواتير شراء المعدات والماكينات";
        break;

      case "maintenance_and_parts":
        fetchedData = await Maintenance.find()
          .sort({ purchaseDate: -1 })
          .limit(queryLimit)
          .populate("supplier", "name")
          .lean();

        // استخراج أجزاء العطل وتنسيقها للفرونت إند
        fetchedData = fetchedData.map((m) => {
          const firstItem = m.items?.[0];
          const partsList = m.items?.map((i) => i.partName).join(" ، ");
          return {
            _id: m._id,
            equipmentName: m.equipmentName || "معدة غير محددة",
            partName: partsList || "صيانة عامة",
            cost: m.totalAmount,
            maintenanceProvider: m.maintenanceProvider,
            faultDescription: firstItem?.faultDescription || m.notes || "لا يوجد وصف",
            purchaseDate: m.purchaseDate,
            supplierName: m.supplier?.name,
          };
        });

        // إحصائية إضافية: أكثر قطع الغيار تكراراً
        const topPartsAgg = await Maintenance.aggregate([
          { $unwind: "$items" },
          { $group: { _id: "$items.partName", quantityUsed: { $sum: 1 }, totalSpent: { $sum: "$items.repairCost" } } },
          { $sort: { quantityUsed: -1 } },
          { $limit: 4 }
        ]);

        extraContext.topParts = topPartsAgg.map((p) => ({
          partName: p._id || "قطع متفرقة",
          quantityUsed: p.quantityUsed,
        }));

        dataSummaryTitle = "سجلات عمليات الصيانة وقطع الغيار";
        break;

      case "bags_and_supplies":
        fetchedData = await BagPurchase.find()
          .sort({ purchaseDate: -1 })
          .limit(queryLimit)
          .populate("supplier", "name phone")
          .populate("items.bagType", "typeName size weight")
          .lean();

        fetchedData = fetchedData.map((b) => {
          const firstBag = b.items?.[0];
          return {
            _id: b._id,
            name: firstBag?.bagType?.typeName ? `أكياس: ${firstBag.bagType.typeName}` : `فاتورة أكياس #${b.invoiceNumber || ""}`,
            typeName: firstBag?.bagType?.typeName,
            supplierName: b.supplier?.name,
            totalCost: b.totalAmount,
            paidAmount: b.paidAmount,
            remainingAmount: b.remainingAmount,
            purchaseDate: b.purchaseDate,
          };
        });
        dataSummaryTitle = "توريدات ومشتريات الأكياس والشكاير";
        break;

      case "wire_purchases":
        fetchedData = await WirePurchase.find()
          .sort({ purchaseDate: -1 })
          .limit(queryLimit)
          .populate("supplier", "name phone")
          .populate("items.wireType", "typeName thickness weight")
          .lean();

        fetchedData = fetchedData.map((w) => {
          const firstWire = w.items?.[0];
          return {
            _id: w._id,
            name: firstWire?.wireType?.typeName ? `سلك: ${firstWire.wireType.typeName}` : `فاتورة سلك #${w.invoiceNumber || ""}`,
            supplierName: w.supplier?.name,
            totalCost: w.totalAmount,
            paidAmount: w.paidAmount,
            remainingAmount: w.remainingAmount,
            purchaseDate: w.purchaseDate,
          };
        });
        dataSummaryTitle = "توريدات ومشتريات السلك";
        break;

      case "cheques":
        fetchedData = await Cheque.find()
          .sort({ dueDate: 1 })
          .limit(queryLimit)
          .populate("customer", "name")
          .populate("supplier", "name")
          .lean();

        fetchedData = fetchedData.map((ch) => ({
          _id: ch._id,
          name: `شيك رقم: ${ch.chequeNumber} (${ch.bankName})`,
          amount: ch.amount,
          ownerName: ch.customer?.name || ch.supplier?.name || "غير محدد",
          dueDate: ch.dueDate,
          status: ch.status,
          moneyFlow: ch.moneyFlow,
        }));
        dataSummaryTitle = "حركة الشيكات والالتزامات المالية";
        break;

      case "payments":
        fetchedData = await Payment.find()
          .sort({ transactionDate: -1 })
          .limit(queryLimit)
          .populate("customer", "name")
          .populate("supplier", "name")
          .lean();

        fetchedData = fetchedData.map((p) => ({
          _id: p._id,
          name: `دفعة ${p.module} (${p.paymentMethod})`,
          amount: p.amount,
          partyName: p.customer?.name || p.supplier?.name || "عام",
          moneyFlow: p.moneyFlow,
          transactionDate: p.transactionDate,
        }));
        dataSummaryTitle = "حركات المقبوضات والدفعات المالية";
        break;

      case "expenses":
        fetchedData = await Expense.find()
          .sort({ expenseDate: -1 })
          .limit(queryLimit)
          .lean();

        fetchedData = fetchedData.map((e) => {
          const itemTitles = e.items?.map((i) => `${i.title} (${i.amount}ج)`).join(" ، ");
          return {
            _id: e._id,
            name: itemTitles || "مصروفات عامة",
            totalCost: e.totalAmount,
            expenseDate: e.expenseDate,
          };
        });
        dataSummaryTitle = "سجلات المصروفات والمنثورات";
        break;

      case "users_activity":
        fetchedData = await ActivityLog.find()
          .sort({ createdAt: -1 })
          .limit(queryLimit)
          .populate("user", "username role")
          .lean();

        fetchedData = fetchedData.map((log) => ({
          _id: log._id,
          username: log.user?.username || "مستخدم غير معروف",
          role: log.user?.role || "User",
          name: `${log.section || "قسم"} - ${log.action || "إجراء"}`,
          details: log.details || log.title,
          createdAt: log.createdAt,
        }));
        dataSummaryTitle = "سجل نشاطات المستخدمين على السيستم";
        break;

      default:
        return res.status(200).json({
          success: true,
          intent,
          message: "لم نتمكن من تحديد القسم المطلوب، يرجى كتابة السؤال بصيغة أوضح.",
          data: [],
        });
    }

    // ----------------------------------------------------
    // 3. صياغة النص النهائي والتحليل الذكي عبر Gemini
    // ----------------------------------------------------
    let aiResponseText = `تم استخراج ${dataSummaryTitle} بنجاح بناءً على طلبك.`;

    try {
      const textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const analysisSample = fetchedData.slice(0, 5);

      const responsePrompt = `
        أنت مساعد ERP ذكي لمصنع/شركة.
        السؤال المطلوبة إجابته: "${query}"
        البيانات المستخرجة من قاعدة البيانات (${dataSummaryTitle}): 
        ${JSON.stringify(analysisSample)}

        المطلوب:
        اكتب ملخصاً تنفذياً واكتفياً في سطرين فقط باللغة العربية المباشرة، يوضح إجابة سؤال المستخدم بالأرقام والأسماء المتاحة في البيانات.
      `;

      const aiAnalysisResult = await textModel.generateContent(responsePrompt);
      aiResponseText = aiAnalysisResult.response.text();
    } catch (textAiError) {
      console.warn("AI Text Generation Limit Reached - Fallback message used:", textAiError.message);
      aiResponseText = `تم جلب ${dataSummaryTitle} (${fetchedData.length} سجلات حقيقية). يمكنك معاينة التفاصيل المباشرة في القائمة أدناه.`;
    }

    // ----------------------------------------------------
    // 4. إرجاع النتيجة للفرونت إند
    // ----------------------------------------------------
    return res.status(200).json({
      success: true,
      intent,
      message: aiResponseText,
      data: fetchedData,
      extraContext,
    });

  } catch (error) {
    console.error("Critical AI Report Controller Error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ غير متوقع أثناء معالجة البيانات.",
      error: error.message,
    });
  }
};