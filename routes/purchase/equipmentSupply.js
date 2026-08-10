const express = require('express');
const router = express.Router();
const equipmnetSuply = require(`${__dirname}/../../controllers/purchase/equipmentSupply`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../../middlewares/authMiddleware`); 

// All routes are protecterd
router.use(protected);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
router.use(authorizationMiddleware.role("superadmin","manager")); 
// Create a delivery
router.post('/', equipmnetSuply.createEquipmentSupply);

// Update a delivery
router.put('/:id', equipmnetSuply.updateEquipmentSupply);


// router.delete('/less/:id', equipmnetSuply.deleteDeliveryless);

// Delete a delivery
router.delete('/:id', equipmnetSuply.deleteEquipmentSupply);


// Get all deliveries
router.get('/', equipmnetSuply.getAllEquipmentsSupply);
// في ملف الـ routes
router.get('/print/:id', equipmnetSuply.printEquipmentSupply);


// router.get('/getAllDeliveriesless', equipmnetSuply.getAllDeliveriesless);

// Get delivery by supplier id
router.get('/getEquipmentSupplyBySupplier/:supplierId', equipmnetSuply.getEquipmentSupplyBySupplier);

// Get delivery by ID
router.get('/:id', equipmnetSuply.getEquipmentSupplyById);


module.exports = router;