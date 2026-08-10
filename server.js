const express = require('express');
require('dotenv').config()
const app = express();
const path = require("path");
const cookieParser = require('cookie-parser');
app.use(cookieParser());
app.set('trust proxy', true);
const cors =require('cors')
const bodyParser = require('body-parser');
app.use(cors({
  origin: true,
  credentials: true
}));

const mongoose = require("mongoose");
const config=require(`${__dirname}/config/configDB`);



config.connectDB(process.env.DATABASE);

const userRoute=require(`${__dirname}/routes/users/Auth`);
const settings=require(`${__dirname}/routes/settings/information`);
const adminRoute=require(`${__dirname}/routes/users/admin`);
const test=require(`./routes/test`);
const customers=require(`${__dirname}/routes/peapole/customer`);
const suppliers=require(`${__dirname}/routes/peapole/supplier`);
const itemRoute=require(`${__dirname}/routes/delivery/items`);
const outDeliveryRoutes =require(`${__dirname}/routes/delivery/delivery`);
const expenceRoute=require(`${__dirname}/routes/expense`)
const BoxRoute=require(`${__dirname}/routes/box`);
const activation=require(`${__dirname}/routes/activationLogs`);
const cheque =require(`${__dirname}/routes/cheque`);
const payment=require(`${__dirname}/routes/payment`)
const equipmnet=require(`${__dirname}/routes/purchase/equipment`)
const equipmnetpart=require(`${__dirname}/routes/purchase/equipmentPart`)
const equipmnetSupply=require(`${__dirname}/routes/purchase/equipmentSupply`)
const maintenance=require(`${__dirname}/routes/purchase/maintenance`)
const wire=require(`${__dirname}/routes/purchase/wire`)
const bag=require(`${__dirname}/routes/purchase/bag`)
const wiretype=require(`${__dirname}/routes/purchase/wireType`)
const bagtype=require(`${__dirname}/routes/purchase/bagType`)
const reports=require(`${__dirname}/routes/reports`)
const dashboard=require(`${__dirname}/routes/dashboard`)
const advancedReportsRoutes =require(`${__dirname}/routes/advancedReportsRoutes`)
const backupRoutes=require(`${__dirname}/backups/backup`)
const chatbot =require(`${__dirname}/routes/chatbot`)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



app.use('/v1/users',userRoute);
app.use("/v1/settings",settings)
app.use('/v1/admins',adminRoute);
app.use("/v1/test",test)
app.use('/v1/customers',customers);
app.use('/v1/suppliers',suppliers);
app.use('/v1/item',itemRoute);
app.use("/v1/delivery", outDeliveryRoutes);
app.use("/v1/equipmnet", equipmnet);
app.use("/v1/equipmentSupply", equipmnetSupply);
app.use("/v1/maintenance", maintenance);
app.use("/v1/wire", wire);
app.use("/v1/bag", bag);
app.use("/v1/wiretype", wiretype);
app.use("/v1/bagtype", bagtype);
app.use('/v1/expense',expenceRoute);
app.use('/v1/box',BoxRoute);
app.use('/v1/activationLog',activation);
app.use('/v1/cheque',cheque);
app.use("/v1/payment",payment);
app.use("/v1/equipmnetpart",equipmnetpart);
app.use("/v1/reports",reports);
app.use("/v1/dashboard",dashboard);
app.use("/v1/advancedReports",advancedReportsRoutes);
app.use("/v1/chatbot",chatbot);

app.use("/v1/", backupRoutes);










const PORT=process.env.PORT || 5000;
app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
})
