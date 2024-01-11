const pool = require("../database/index")
const ExcelJS = require('exceljs');
const bcrypt = require('bcrypt');

const postsController = {

    getAll: async (req,res) => {
        try{
            const [rows, fields] = await pool.query(
                "SELECT * FROM `kullanicilar`")
            res.json({
                data: rows
            })
        }
        catch (error){
            console.log(error.message +"Error occured");
            res.json({
                status: "error"
            })
        }
    },
    getByID: async(req, res) =>{
        try{
            const{sira} = req.params
            const [rows, fields] = await pool.query(
                "SELECT * FROM `kullanicilar` where kullanici_id=?", [kullanici_id])
                if(rows.length === 0){
                    res.status(404).json({
                        status: "error",
                        message: "No record found with the provided ID"
                    })
                } else {
                    res.json({
                        data: rows
                    })
                }
         }
                catch(error){
                    console.error(error.message);
                    res.status(500).json({
                        status: "error",
                        message: "An error occurred while processing your request"
                    })
                }
        }   
        
    ,
    create: async(req, res) =>{
        try{
            const{sira,mahalle,sokak} = req.body
            const checkSql = "SELECT * FROM `kullanicilar` where Sıra=?"
            const [checkRows, checkFields] = await pool.query(checkSql, [sira])
            if(checkRows.length > 0){
                res.status(400).json({
                    status: "error",
                    message: "The provided ID already exists"
                })
            } else {
                const sql = "insert into kullanicilar (Sıra, Mahalle, Sokak) values (?,?,?)"
                const [rows, fields] = await pool.query(sql, [sira, mahalle,sokak])
                res.json({
                    data: rows
                })
            }
        }
        catch(error){
            console.error(error.message);
            res.status(500).json({
                status: "error",
                message: "An error occurred while processing your request"
            })
        }
    },
      
}

module.exports = postsController