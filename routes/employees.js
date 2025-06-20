require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { Sequelize } = require("sequelize");
const mysql = require("mysql2");

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

const mysql_config = {
  host: "192.168.3.100",
  user: "root",
  password: "Admin0331",
  database: "hr",
  multipleStatements: true,
};

dbcon.once("error", (err) => {
  console.error("Database connection error:", err);
});

// 确保只添加一次错误监听器
if (!dbcon.__errorListenerAdded) {
  dbcon.on("error", (err) => {
    console.error("Database connection error:", err);
  });
  dbcon.__errorListenerAdded = true; // 标记监听器已添加

  //確認連線狀況是否正常
  dbcon.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting connection:", err);
      return err;
    }
  });
  dbcon.promise();
}

//尋找公司員工列表
router.get("/getmemberinfo", async (req, res) => {
  try {
    const { query } = req.query;
    console.log(query);
    //let sql = "SELECT * FROM employees";
    let sql = "SELECT * FROM hr_memberinfo";
    // 如果有搜尋關鍵字，則將其添加到 SQL 查詢中
    if (query) {
      // 假設你的 query 字串可能是工號或者姓名
      //sql += ` WHERE (employee_sid LIKE '${query}%' OR employee_name LIKE '%${query}%') AND employee_status = '在職'`;
      sql += ` WHERE (memberID LIKE '${query}%' OR memberName LIKE '%${query}%')`;
    }

    const [result] = dbcon.query(sql);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/showAllEmployees", async (req, res) => {
  try {
    const query = "SELECT * FROM employees";
    const [result] = await db.query(query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/showActiveEmployees", async (req, res) => {
  try {
    const query = "SELECT * FROM employees where employee_status = '在職' ";
    const [result] = await db.query(query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/getEmployeesByIDOrName", async (req, res) => {
  try {
    const { query } = req.query;
    console.log(query);
    let sql = "SELECT * FROM employees";
    // 如果有搜尋關鍵字，則將其添加到 SQL 查詢中
    if (query) {
      // 假設你的 query 字串可能是工號或者姓名
      sql += ` WHERE (employee_sid LIKE '${query}%' OR employee_name LIKE '%${query}%') AND employee_status = '在職'`;
    }

    const [result] = await db.query(sql);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;
