const express = require('express');
const router = express.Router();
const activation = require(`${__dirname}/../controllers/activationLogs`);
const {role}= require(`${__dirname}/../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../middlewares/authMiddleware`); 
const authorizationMiddleware = require(`${__dirname}/../middlewares/authorization`);
// All routes are protecterd
router.use(protected);

router.use(authorizationMiddleware.role("superadmin","manager")); 

router.get("/",activation.getActivityLogs)
router.get("/actions",activation.getActions )

router.get("/getActivityLogsToExcelSheets",activation.getActivityLogsToExcelSheets)


router.delete("/deleteAll",activation.deleteAll )

router.delete("/deleteWithinRange",activation.deleteWithinRange )


module.exports = router;