require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");
const axios = require("axios");
const { Sequelize } = require("sequelize");
//新增維修擔資料
router.get("/zone", async (req, res) => {
  try {
    // 在這裡補充您的 SQL 查詢語句，以從資料庫中獲取區域資料
    const sql = "SELECT zone_name FROM zones";

    // 假設您使用的是您的資料庫查詢函數或 ORM，這裡假設使用 db.query 函數
    // const [rows] = await db.query(sql);
    const [rows] = await db.query(sql);
    console.log(rows);
    // 從查詢結果中提取所需的資料
    const zoneNames = rows.map((row) => row.zone_name);

    // 將區域名稱回傳給前端
    res.json(zoneNames);
  } catch (error) {
    // 如果發生錯誤，回傳錯誤訊息
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
