const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");
const axios = require("axios");
const ExcelJS = require("exceljs");
const dayjs = require("dayjs");
const monent = require("moment");

//新增訂便當的資料
router.post("/order", async (req, res) => {
  try {
    const { employee_sid, place, bento, order_date } = req.body;
    console.log(employee_sid, place, bento, order_date);
    const [existingOrder] = await db.query(
      "SELECT * FROM bento WHERE employee_sid = ? AND DATE(order_date) = ?",
      [employee_sid, order_date]
    );
    console.log("AA", existingOrder.length);

    if (existingOrder.length > 0) {
      console.log("AAAA");
      return res.status(400).json({ message: "當日已經訂過便當了" });
    }

    const result = await db.query(
      "INSERT INTO bento (employee_sid, place, bento, order_date) VALUES (?, ?, ?, ?)",
      [employee_sid, place, bento, order_date]
    );
    // 如果成功插入資料，返回成功訊息和插入的資料
    res.status(201).json({ message: "訂便當成功" });
  } catch (error) {
    // 如果發生錯誤，回傳錯誤訊息
    res.status(500).json({ message: error.message });
    console.log(error);
  }
});

// 查詢今日便當
router.get("/todayorder", async (req, res) => {
  try {
    const [result] = await db.query(`
  SELECT bento.*, employees.employee_name
  FROM \`bento\`
  JOIN \`employees\` ON bento.employee_sid = employees.employee_sid
  WHERE DATE(bento.\`order_date\`) = CURDATE();
`);
    // console.log(result);
    // 返回查詢結果
    res.json(result);
  } catch (error) {
    // 如果發生錯誤，回傳錯誤訊息
    res.status(500).json({ message: error.message });
    console.log(error);
  }
});

// 查詢指定區間的訂單
router.post("/orderdate", async (req, res) => {
  const { from_date, end_date } = req.body;
  console.log(from_date, end_date);
  try {
    const [result] = await db.query(
      `
      SELECT bento.*, employees.employee_name
      FROM \`bento\`
      JOIN \`employees\` ON bento.employee_sid = employees.employee_sid
      WHERE bento.\`order_date\` BETWEEN ? AND ?;
    `,
      [from_date, end_date]
    );
    const resultWithLocalTime = result.map((item) => {
      item.order_date = monent(item.order_date).format("YYYY-MM-DD");
      return item;
    });
    // console.log(result);

    console.log(resultWithLocalTime);

    // 返回查询结果
    res.json(resultWithLocalTime);
  } catch (error) {
    // 如果發生錯誤，回傳錯誤訊息
    res.status(500).json({ message: error.message });
    console.error(error);
  }
});

// //data轉csv
// function convertJSONToCSV(jsonData) {
//   // 創建一個新的工作簿
//   const workbook = new ExcelJS.Workbook();
//   const worksheet = workbook.addWorksheet("Orders");

//   // 添加表頭
//   worksheet.addRow(["員工姓名", "用餐地點", "便當種類"]);

//   // 將 JSON 資料添加到工作表中
//   jsonData.forEach((order) => {
//     worksheet.addRow([order.employee_name, order.place, order.bento]);
//   });

//   // 返回工作簿
//   return workbook;
// }

// //下載今天的便當
// router.get("/download", async (req, res) => {
//   try {
//     const [todayOrders] = await db.querypool(
//       `SELECT employees.employee_name, bento.place, bento.bento
//       FROM bento
//       JOIN employees ON bento.employee_sid = employees.employee_sid
//       WHERE DATE(order_date) = CURDATE();`
//     );
//     console.log(todayOrders);
//     // 將數據轉換為CSV格式，這裡以JSON轉換為CSV為例
//     const csvData = convertJSONToCSV(todayOrders);

//     // 設置HTTP頭，指定回應的內容類型為CSV
//     res.setHeader("Content-Type", "text/csv");
//     res.setHeader(
//       "Content-Disposition",
//       "attachment; filename=today_bento_orders.csv"
//     );

//     // 將CSV數據發送給客戶端
//     res.send(csvData);
//   } catch (error) {
//     console.error("Error fetching data:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

module.exports = router;
