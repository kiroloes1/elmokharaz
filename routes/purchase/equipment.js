const express = require('express');
const router = express.Router();
const equipmnet = require(`${__dirname}/../../controllers/purchase/equipment`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../../middlewares/authMiddleware`); 

// All routes are protecterd
router.use(protected);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
router.use(authorizationMiddleware.role("superadmin","manager")); 
// Create a delivery
router.post('/', equipmnet.createEquipment);

// Update a delivery
router.put('/:id', equipmnet.updateEquipment);


// router.delete('/less/:id', equipmnet.deleteDeliveryless);

// Delete a delivery
router.delete('/:id', equipmnet.deleteEquipment);


// Get all deliveries
router.get('/', equipmnet.getAllEquipments);
// في ملف الـ routes
router.get('/print/:id', equipmnet.printEquipment);


// router.get('/getAllDeliveriesless', equipmnet.getAllDeliveriesless);

// Get delivery by supplier id
router.get('/getEquipmentBySupplier/:supplierId', equipmnet.getEquipmentBySupplier);

// Get delivery by ID
router.get('/:id', equipmnet.getEquipmentById);


module.exports = router;