const express = require('express');
const router = express.Router();
const wire = require(`${__dirname}/../../controllers/purchase/wire`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../../middlewares/authMiddleware`); 

// All routes are protecterd
router.use(protected);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
router.use(authorizationMiddleware.role("superadmin","manager")); 
// Create a delivery
router.post('/', wire.createWire);

// Update a delivery
router.put('/:id', wire.updateWire);


// router.delete('/less/:id', wire.deleteDeliveryless);

// Delete a delivery
router.delete('/:id', wire.deleteWire);


// Get all deliveries
router.get('/', wire.getAllWire);
// في ملف الـ routes
router.get('/print/:id', wire.printWire);


// router.get('/getAllDeliveriesless', wire.getAllDeliveriesless);

// Get delivery by supplier id
router.get('/getWireBySupplier/:supplierId', wire.getWireBySupplier);

// Get delivery by ID
router.get('/:id', wire.getWireById);


module.exports = router;