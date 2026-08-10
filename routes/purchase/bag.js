const express = require('express');
const router = express.Router();
const bag = require(`${__dirname}/../../controllers/purchase/bag`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../../middlewares/authMiddleware`); 

// All routes are protecterd
router.use(protected);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
router.use(authorizationMiddleware.role("superadmin","manager")); 
// Create a delivery
router.post('/', bag.createBag);

// Update a delivery
router.put('/:id', bag.updateBag);


// router.delete('/less/:id', bag.deleteDeliveryless);

// Delete a delivery
router.delete('/:id', bag.deleteBag);


// Get all deliveries
router.get('/', bag.getAllBag);
// في ملف الـ routes
router.get('/print/:id', bag.printBag);


// router.get('/getAllDeliveriesless', bag.getAllDeliveriesless);

// Get delivery by supplier id
router.get('/getBagBySupplier/:supplierId', bag.getBagBySupplier);

// Get delivery by ID
router.get('/:id', bag.getBagById);


module.exports = router;