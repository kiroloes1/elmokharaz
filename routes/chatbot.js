const express = require(`express`);
const router=express.Router();
const authorizationMiddleware = require(`${__dirname}/../middlewares/authorization`);
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);
const {processAiReportQuery} = require(`${__dirname}/../controllers/chatbot/AIChatbot`);

// protected routes
router.use(authMiddleware.protected);

router.use(authorizationMiddleware.role('superadmin', 'manager')); 

// POST /api/v1/ai/parse-intent
router.post("/parse-intent", processAiReportQuery);

module.exports = router;