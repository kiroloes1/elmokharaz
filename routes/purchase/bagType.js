const express = require('express');
const router = express.Router();
const bagType = require(`${__dirname}/../../controllers/purchase/bagType`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../../middlewares/authMiddleware`); 

// All routes are protecterd
router.use(protected);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
router.use(authorizationMiddleware.role("superadmin","manager")); 

router.post("/", bagType.createBagType);

router.get("/",  bagType.getBagTypes);

router.get("/:id", bagType.getBagTypeById);

router.put("/:id", bagType.updateBagType);

router.delete("/:id", bagType.deleteBagType);

module.exports = router;