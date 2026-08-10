const express = require("express");
const router = express.Router();
const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const itemsController = require(`${__dirname}/../../controllers/delivery/items`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 



// protected routes
router.use(authMiddleware.protected);
router.use(role('superadmin', 'manager')); // only admin and manager can access these routes
// ========================== ROUTES ==========================

// CRUD
router.post("/", itemsController.createFixedCategory);
router.get("/", itemsController.getAllFixedCategories);
router.get("/:id", itemsController.getFixedCategoryById);
router.put("/:id", itemsController.updateFixedCategory);
router.delete("/:id", itemsController.deleteFixedCategory);



module.exports = router;