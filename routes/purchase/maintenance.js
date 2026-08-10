const express = require('express');
const router = express.Router();
const maintenance = require(`${__dirname}/../../controllers/purchase/maintenance`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../../middlewares/authMiddleware`); 

// All routes are protecterd
router.use(protected);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
router.use(authorizationMiddleware.role("superadmin","manager")); 
// Create a delivery
router.post('/', maintenance.createMaintain);

// Update a delivery
router.put('/:id', maintenance.updateMaintain);


// router.delete('/less/:id', maintenance.deleteDeliveryless);

// Delete a delivery
router.delete('/:id', maintenance.deleteMaintain);


// Get all deliveries
router.get('/', maintenance.getAllMaintains);
// في ملف الـ routes
router.get('/print/:id', maintenance.printMaintain);


// router.get('/getAllDeliveriesless', maintenance.getAllDeliveriesless);

// Get delivery by supplier id
router.get('/getMaintainsBySupplier/:supplierId', maintenance.getMaintainsBySupplier);

// Get delivery by ID
router.get('/:id', maintenance.getMaintainById);


module.exports = router;