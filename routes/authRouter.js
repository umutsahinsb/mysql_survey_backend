const express = require("express")
const bcrypt = require('bcrypt');
const router = express.Router()

const authController = require("../controller/authController")

router.post("/register", authController.register)
router.post("/login", authController.login)
router.post("/poll", authController.template)
router.get("/register", authController.getRegister)
router.get("/approve", authController.unregisteredUsers)
router.post("/approve", authController.registeringUsers)
router.get("/getTaskCreate",authController.getTaskCreate)
router.post("/create-task",authController.taskCreate)
router.get("/getTasks", authController.getTasks)
module.exports = router