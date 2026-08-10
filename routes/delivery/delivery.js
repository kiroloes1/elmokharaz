const express = require('express');
const router = express.Router();
const deliveryController = require(`${__dirname}/../../controllers/delivery/outDelivery`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../../middlewares/authMiddleware`); 

// All routes are protecterd
router.use(protected);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
router.use(authorizationMiddleware.role("superadmin","manager")); 
// Create a delivery
router.post('/', deliveryController.createDelivery);

// Update a delivery
router.put('/:id', deliveryController.updateDelivery);


// router.delete('/less/:id', deliveryController.deleteDeliveryless);

// Delete a delivery
router.delete('/:id', deliveryController.deleteDelivery);


// Get all deliveries
router.get('/', deliveryController.getAllDeliveries);


// router.get('/getAllDeliveriesless', deliveryController.getAllDeliveriesless);

// Get delivery by supplier id
router.get('/getDeliveryByCustomer/:supplierId', deliveryController.getDeliveryBySupplier);

// Get delivery by ID
router.get('/:id', deliveryController.getDeliveryById);


module.exports = router;