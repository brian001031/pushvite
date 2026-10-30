const express = require("express");
const router = express.Router();
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");
const dbcon = require(__dirname + "/../modules/mysql_connect.js");  // hr 資料庫


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
