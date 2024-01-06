const express = require("express")
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');

const router = express.Router();

const postsController = require("../controller/postsController")

router.get("/", postsController.getAll)
router.get("/:sira", postsController.getByID)
router.post("/", postsController.create)
router.copy("/",postsController.getCopy) 

module.exports = router