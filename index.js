const {json}= require("express")
const express = require("express")
const { router } = require("./Routes")


const app = express()


app.use(json())
app.use("/deliveryAI", router)

const PORT = process.env.PORT || 4000

app.get("/test",(req,res)=>{
    return res.status(200).json({message:"We are Live !"})
})
app.listen(PORT, ()=>{
    console.log("App is Running...");
})