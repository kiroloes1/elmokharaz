const axios= require('axios')
const getWallets = async (req, res) => {
  try {
    const { data } = await axios.get(
      "http://localhost:4000/v1/wallet",
      {
        headers: {
          "x-api-key": process.env.INTERNAL_API_KEY,
        },
      }
    );

    res.json(data);
  } catch (err) {
    res.status(500).json({
      message: err.message,
          response: err.response?.data,
    });
  }
};

const express = require(`express`);
const router=express.Router();
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);
router.use(authMiddleware.protected);

router.get('/', getWallets);

module.exports=router

