require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");
const axios = require("axios");
const { Sequelize } = require("sequelize");
const _ = require("lodash");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const csv = require("fast-csv");

const dbcon = mysql.createPool({
  host: "192.168.3.100",
  user: "root",
  password: "Admin0331",
  database: "hr",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  multipleStatements: true,
});

router.get("/getbatch_rollno", async (req, res) => {
  const { search_Caseno } = req.query;

  try {
    //諮詢正負極五金模切站batch之rollno條碼號最新的一筆
    const sql = `SELECT Rollno FROM mes.cutting_bath where Caseno like '${search_Caseno}' ORDER BY id DESC limit 1`;

    // 假設您使用的是您的資料庫查詢函數或 ORM，這裡假設使用 db.query 函數
    const [rollno_last] = await dbmes.query(sql);

    // console.log(
    //   "取得" +
    //     search_Caseno +
    //     "對應條碼生成批號rollno(最新)-> " +
    //     rollno_last[0].Rollno
    // );

    res.status(200).json(rollno_last[0].Rollno);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得條碼批號資料錯誤",
    });
  }
});

module.exports = router;
