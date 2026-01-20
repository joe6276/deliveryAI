const {Router}= require("express")
const { riderMerchantController } = require("../controllers/indexControllers")

const router = Router()

router.post("/", riderMerchantController)


module.exports={router}