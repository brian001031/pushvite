const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");

// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbcon = require(__dirname + "/../modules/mysql_connect.js");  // hr 資料庫

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
