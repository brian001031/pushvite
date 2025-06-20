require("dotenv").config();
const express = require("express");
const router = express.Router();
let db = require(__dirname + "/../modules/db_connect.js");
const mysql = require("mysql2");
const multer = require("multer");
const axios = require("axios");
let count = 0;

const mysql_config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
};

const test_token = "3EuY6ByrJAcShp93pLE45u0D4iuLEtvYCqhafEoXybs";

const disconnect_handler = (conn) => {
  console.log("重新回連DB機制啟動!");
  conn = mysql.createConnection(mysql_config);
  conn.connect((err) => {
    err && setTimeout("disconnect_handler()", 2000);
    console.log("2秒後重啟連線DB!");
  });

  conn.on("error", (err) => {
    count++;
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      console.log("err.code 訊息回饋有連線lodss");
      // db error 重新連線
      disconnect_handler(conn);
    } else if (count <= 2) {
      console.log("DB啟動執行!");
      disconnect_handler(conn);
    } else {
      count = 0;
      throw err;
    }
  });
  //exports.conn = conn;
};

// 配置 Multer 用於保存照片
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/factoryuploads");
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    file.originalname = Buffer.from(file.originalname, "latin1").toString(
      "utf-8"
    ); // 將文件名轉換為 URL 安全的格式
    const newFileName = `${timestamp}-${file.originalname}`;
    cb(null, newFileName);
  },
});

const upload = multer({ storage: storage });

// 新增廠區狀況資料
router.post(
  "/repair_question",
  upload.array("photos", 10),
  async (req, res) => {
    try {
      const { name, time, place, machine, machineStatus, question } = req.body;
      let photo_paths = [];
      if (req.files && req.files.length > 0) {
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          photo_paths.push(file.filename);
        }
      }

      const sql =
        "INSERT INTO factory (name, time, place, machine, machine_status, question, photo_path, handled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)";
      await db.query(sql, [
        name,
        time,
        place,
        machine,
        machineStatus,
        question,
        photo_paths.join(", "), // 將圖片路徑陣列轉換成字串，用逗號分隔
        0,
      ]);

      const sql2 = "SELECT * FROM factory ORDER BY `id` DESC LIMIT 1";

      const [editnum] = await db.query(sql2);
      const requestid = editnum[0].id;

      const config_line = {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${process.env.lineToken}`,
          //Authorization: `Bearer ${test_token}`,
        },
      };

      const config_Discord = {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${process.env.discord_botToken}`,
        },
      };

      const message = `
      "廠務"問題回報
      ----------------
      報修人:${name}
      編號: ${requestid}
      區域:${place}
      故障物品:${machine}
      目前狀態：${machineStatus}
      異常狀況：${question}
      `;

      // for (let k = 0; k < 2; k++) {
      //   if (k == 0) {
      //     await axios.post(
      //       "https://notify-api.line.me/api/notify",
      //       `message=${message}`,
      //       config_line
      //     );

      //     console.log("廠務報修已經提交訊息內容委託LINE");
      //   } else if (k == 1) {
      //     const Factory_REQUEST_URL = `${process.env.discord_factoryandrepair_submit}`;
      //     await axios.post(
      //       // "https://notify-api.line.me/api/notify",
      //       Factory_REQUEST_URL,
      //       { content: message },
      //       config_Discord
      //     );
      //     console.log("廠務報修提交內容已經委託DisCord");
      //   }
      // }

   
      const Factory_REQUEST_URL = `${process.env.discord_factoryandrepair_submit}`;
      await axios.post(
        // "https://notify-api.line.me/api/notify",
        Factory_REQUEST_URL,
        { content: message },
        config_Discord
      );
      console.log("廠務報修提交內容已經委託DisCord");

      res.status(201).json({ message: "資料保存成功" });
    } catch (error) {
      console.error("發生錯誤", error);
      res.status(500).json({
        message: "資料保存錯誤",
      });
    }
  }
);

// 列出所有廠區狀況資料
router.get("/repair_list", async (req, res) => {
  try {
    const sql = "SELECT * FROM factory ORDER BY id DESC";
    const [factoryRecords] = await db.query(sql);
    res.status(200).json(factoryRecords);
  } catch (error) {
    // disconnect_handler(db);
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

// 取得特定廠區狀況資料
router.get("/repair_list/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const sql = "SELECT * FROM factory WHERE id = ?";
    const [factoryRecord] = await db.query(sql, [id]);
    if (!factoryRecord) {
      return res.status(404).json({ message: "未找到對應資料" });
    }
    if (!factoryRecord[0].photo_path) {
      factoryRecord[0].photo_path = [];
    } else {
      factoryRecord[0].photo_path = factoryRecord[0].photo_path
        .split(",")
        .map((path) => path.trim());
    }

    if (!factoryRecord[0].repair_photo) {
      factoryRecord[0].repair_photo = []; // 如果沒有照片，設置為空陣列
    } else {
      factoryRecord[0].repair_photo = factoryRecord[0].repair_photo
        .split(",")
        .map((path) => path.trim());
    }

    res.status(200).json(factoryRecord);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({ message: "異常狀況" });
  }
});

// 更新部分資料
router.patch(
  "/repair_list/:id",
  upload.array("photos", 10),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        handled,
        repair_person,
        handling_method,
        confirmation_method,
        reoperation_time,
      } = req.body;

      let photo_paths = [];
      if (req.files && req.files.length > 0) {
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          photo_paths.push(file.filename);
        }
      }

      let sql =
        "UPDATE factory SET handled = ?, repair_person = ?, handling_method = ?, confirmation_method = ?, reoperation_time = ?";
      const sqlParams = [
        handled,
        repair_person,
        handling_method,
        confirmation_method,
        reoperation_time,
      ];

      if (photo_paths.length > 0) {
        sql += ", repair_photo = ?";
        sqlParams.push(photo_paths.join(", "));
      }

      sql += " WHERE id = ?";
      sqlParams.push(id);

      await db.query(sql, sqlParams);

      //開始處理送資料
      const config_line = {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${process.env.lineToken_OK}`,
          //Authorization: `Bearer ${test_token}`,
        },
      };

      const config_Discord = {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${process.env.discord_botToken}`,
        },
      };

      const message = `
----------------
"廠務"處理回報
編號: ${id}
廠務人員: ${repair_person}
處理結果: ${handled === "1" ? "已修復" : handled === "2" ? "觀察中" : "未修復"}
確認方法: ${confirmation_method}
----------------
連結: ${process.env.web_factoryedit}/${id}
`;

      // await axios.post(
      //   "https://notify-api.line.me/api/notify",
      //   `message=${message}`,
      //   config
      // );

      // for (let k = 0; k < 2; k++) {
      //   if (k == 0) {
      //     await axios.post(
      //       "https://notify-api.line.me/api/notify",
      //       `message=${message}`,
      //       config_line
      //     );

      //     console.log("廠務修復已經提交訊息內容委託LINE");
      //   } else if (k == 1) {
      //     const Factory_REQUEST_URL = `${process.env.discord_factoryandrepair_submit}`;
      //     await axios.post(
      //       // "https://notify-api.line.me/api/notify",
      //       Factory_REQUEST_URL,
      //       { content: message },
      //       config_Discord
      //     );
      //     console.log("廠務修復內容已經委託DisCord");
      //   }
      // }


      const Factory_REQUEST_URL = `${process.env.discord_factoryandrepair_submit}`;
      await axios.post(
        // "https://notify-api.line.me/api/notify",
        Factory_REQUEST_URL,
        { content: message },
        config_Discord
      );
      console.log("廠務修復內容已經委託DisCord");
      res.status(200).json({ message: "更新成功" });
    } catch (error) {
      // disconnect_handler(db);
      console.error("更新錯誤:", error);
      res.status(500).json({ message: "更新錯誤" });
    }
  }
);

module.exports = router;
