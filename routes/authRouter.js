const express = require("express")
const bcrypt = require('bcrypt');
const router = express.Router()

const authController = require("../controller/authController")

router.post("/register", authController.register)
router.post("/login", authController.login)
router.post("/poll", authController.template)
router.get("/register", authController.getRegister)
router.get("/approve", authController.registeredUsers)
module.exports = router