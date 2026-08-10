const express = require('express');
const router = express.Router();
const equipmnetpart = require(`${__dirname}/../../controllers/purchase/equipment`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../../middlewares/authMiddleware`); 

// All routes are protecterd
router.use(protected);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
router.use(authorizationMiddleware.role("superadmin","manager")); 


router.get("/",equipmnetpart.getEquipmentPart)
router.put("/:id",equipmnetpart.updateEquipmentPart)
router.delete("/:id",equipmnetpart.deleteEquipmentPart)
router.post("/",equipmnetpart.createEquipmentPart)



module.exports = router;