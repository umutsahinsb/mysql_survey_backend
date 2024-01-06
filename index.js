const express = require("express")
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');

const app = express()

require('dotenv').config()


app.use(express.urlencoded({extended : false}))
app.use(express.json())

const authRouter = require("./routes/authRouter")
const postsRouter = require("./routes/postsRouter")

app.use("/api/v1/auth", authRouter)
app.use("/api/v1/posts", postsRouter)

const PORT = process.env.PORT || 3000

app.listen(PORT, () =>  {
    console.log("Server is running...")
})