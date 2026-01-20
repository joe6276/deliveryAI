const {Router} = require("express")
const { getRouteRecommendations } = require("../controllers/routesController")


const routesRouter = Router()

routesRouter.post("", getRouteRecommendations)

module.exports={
    routesRouter
}