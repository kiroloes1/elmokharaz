const express = require('express');
const router = express.Router();
const wireType = require(`${__dirname}/../../controllers/purchase/wireType`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../../middlewares/authMiddleware`); 

// All routes are protecterd
router.use(protected);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
router.use(authorizationMiddleware.role("superadmin","manager")); 

router.post("/", wireType.createWireType);

router.get("/",  wireType.getWireTypes);

router.get("/:id", wireType.getWireTypeById);

router.put("/:id", wireType.updateWireType);

router.delete("/:id", wireType.deleteWireType);

module.exports = router;