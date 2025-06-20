require("dotenv").config();
const express = require("express");
const router = express.Router();
let db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const mysql = require("mysql2");
const multer = require("multer");
const axios = require("axios");
const { Sequelize } = require("sequelize");
const xlsx = require("xlsx");
const fs = require("fs");
const prompt = require("prompt-sync")();

let singlemachine = [];
let count = 0;

const test_token = "3EuY6ByrJAcShp93pLE45u0D4iuLEtvYCqhafEoXybs";

const mysql_config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
};

// 配置 Multer 用來保存照片(單一照片寫法)
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     // 將照片保存在 public的 uploads 目錄下
//     cb(null, "public/uploads");
//   },
//   filename: function (req, file, cb) {
//     if (!file.originalname) {
//       // 如果沒有上傳照片，則直接回傳一個預設的檔案名稱
//       cb(null, "no-photo-" + Date.now());
//       return;
//     }
//     // 如果有上傳照片，則使用原始檔案名稱加上時間戳作為檔案名稱
//     const fileName = path.basename(
//       Buffer.from(file.originalname, "latin1").toString("utf-8")
//     );
//     cb(null, Date.now() + "-" + fileName);
//   },
// });

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
  // 將照片保存在 public 的 uploads 目錄下
  destination: (req, file, cb) => {
    cb(null, "public/uploads");
  },
  // 決定文件名稱
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    file.originalname = Buffer.from(file.originalname, "latin1").toString(
      "utf-8"
    ); // 將文件名轉換為 URL 安全的格式
    // 構建新的文件名稱，包含現在時間後加上連續數字
    const newFileName = `${timestamp}-${file.originalname}`;
    cb(null, newFileName);
  },
});

const upload = multer({ storage: storage });

//新增維修擔資料
// router.post("/repair_question", upload.single("photo"), async (req, res) => {
//   try {
//     // 先解開body的資料 並解構出來
//     const { name, time, place, machine, machineStatus, question } = req.body;
//     // console.log(name, time, place, machine, machineStatus, question);
//     console.log("hello");
//     // 檢查是否有上傳照片
//     let photo_path = null;
//     if (req.file) {
//       photo_path = path.basename(req.file.path);
//     }
//     // 將報修紀錄寫入資料庫
//     const sql =
//       "INSERT INTO repairs (name, time, place,machine,machine_status, question, photo_path,handled, created_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)";
//     await db.query(sql, [
//       name,
//       time,
//       place,
//       machine,
//       machineStatus,
//       question,
//       photo_path,
//       0,
//     ]);
//     //開始處理送資料
//     const config = {
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//         Authorization: `Bearer ${process.env.lineToken}`,
//       },
//     };

//     // 處理訊息內容
//     const message = `
//     報修人:${name}
//     機器:${machine}
//     區域:${place}
//     目前狀態：${machineStatus}
//     異常狀況：${question}
//     `;

//     await axios.post(
//       "https://notify-api.line.me/api/notify",
//       `message=${message}`,
//       config
//     );

//     res.status(201).json({ message: "資料保存成功" });
//   } catch (error) {
//     console.error("發生錯誤", error);
//     res.status(500).json({
//       message: "資料保存錯誤",
//     });
//   }
// });

//列出個別機器異常維修單資料
router.get("/machineerrorlist", async (req, res) => {
  const { machinename } = req.query;
  let sql;
  //console.log("machinename = "+ machinename);

  try {
    // 從資料庫中擷取報修紀錄
    // const sql = "SELECT * FROM repairs ORDER BY id DESC";
    // '%入殼機%'

    //這邊搜尋條件多ID欄位判斷(全數字型態)就where (repairs.ID),反之則維持原先搜尋 where (repairs.machine)

    isNaN(Number(machinename, 10))
      ? (repair_columns = "repairs_test.machine")
      : (repair_columns = "repairs_test.id");

    sql = `SELECT * FROM repairs_test WHERE(${repair_columns} LIKE '%${machinename}%' ) ORDER BY id DESC`;

    console.log("搜尋設備sql = " + sql);

      //驗證完畢後記得將db2 改為db
    const [repairsinglemachine] = await db2.query(sql);

    // try {
    //   // singlemachine 是查询單一設備结果的数组 -> 編號 報修日期 報修機台 原因 維修方式 確認方式 維修結果
    //   repairsinglemachine.forEach((row) => {
    //     const id = row.id;
    //     const time = row.time;
    //     const machine = row.machine;
    //     const question = row.question;
    //     const status = (row.handled === 0) ? "未修復": (row.handled === 2)? "觀察中" :"已修復";
    //     const handling_method = row.handling_method;
    //     const confirmation_method = row.confirmation_method;

    //     // 0  未修復
    //     // 2  觀察中
    //     // 1  已修復

    //     singlemachine.push({
    //       id: id,
    //       time: time,
    //       machine: machine,
    //       question: question,
    //       status: status,
    //       handling_method: handling_method,
    //       confirmation_method: confirmation_method,
    //     });
    //   });
    // } catch (error) {
    //   console.error("Error reading record:", error);
    // }

    res.status(200).json(repairsinglemachine); // 將全部及個別機器異常報修紀錄回傳至前端
  } catch (error) {
    // disconnect_handler(db);
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

router.post(
  "/repair_question",
  upload.array("photos", 10),
  async (req, res) => {
    try {
      const { name, time, place, machine, errorcode,machineStatus, question, photoInfo } =
        req.body;
      let photo_paths = [];
      let img_request_illustrate;
      let checkillustrate = false;
      console.log("photoInfo原始接收為 = " +photoInfo);
      console.log("!!!!", req.files);
      if (req.files && req.files.length > 0) {
        // 遍歷上傳的所有圖片，將其保存到資料庫中
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          photo_paths.push(file.filename); // 將檔案路徑保存到 photo_paths 陣列中
        }
      }

      if (
        typeof photoInfo === "undefined" ||
        photoInfo === null 
      ) {
        console.log("photoInfo 為空值");
        const arr = ["Hello", "world", "this", "is", "Node.js"];
        // img_request_illustrate = arr.join(","); // 沒有分隔符
        img_request_illustrate = arr;

        checkillustrate = true;
      }

      // if (
      //   typeof photoInfo === "undefined" ||
      //   photoInfo === null ||
      //   photoInfo === ""
      // )
      // if (checkillustrate === false && img_request_illustrate.length === 0 && photoInfo.length ===0) 
      if (checkillustrate === true ) 
      {
        console.log("有進來photoInfo做事情條整理");
        img_request_illustrate ="";
        //預設無圖文說明
        for (let k = 0; k < 10; k++) {
          if (k < 9) {
            img_request_illustrate += `無圖文說明${k + 1},`;
          } else {
            img_request_illustrate += `無圖文說明${k + 1}`;
          }
        }
      } else {
        //回傳是string長字串
        if (typeof photoInfo === "string") {
          img_request_illustrate = photoInfo.toString();
          console.log("接收photoInfo為string格式字串");

          console.log("photoInfo 不需要整理 = " + img_request_illustrate);
        } //回傳是字串陣列
        else if (Array.isArray(photoInfo)) {
          // const arr = ["NBA", "MLB", "CPBL", "KOA", "NPB"];
          const photoInforesult = photoInfo.reduce(
            (accumulator, currentValue) => accumulator + currentValue,
            ","
          );

          // const resultWithSpace = photoInforesult.join(","); // 使用空格作為分隔符

          img_request_illustrate = photoInforesult.toString();

          console.log("photoInfo重新整理 = " + img_request_illustrate);
        } else {
          console.log("接收photoInfo這不是陣列或字串");
        }
      }

      // 將報修紀錄寫入資料庫
      // const sql =
      //   "INSERT INTO repairs (name, time, place, machine, machine_status, question, photo_path, handled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)";

      //新測試增加圖文說明欄位 imagedescription_rquest
      const sql =
        "INSERT INTO hr.repairs_test (name, time, place, machine, errorcode ,machine_status, question, photo_path, handled, created_at,imagedescription_rquest) VALUES (?, ?, ?, ?, ? ,?, ?, ?, ?, CURRENT_TIMESTAMP,?)";

      //驗證完畢後記得將db2 改為db
      await db2.query(sql, [
        name,
        time,
        place,
        machine,
        errorcode,
        machineStatus,
        question,
        photo_paths.join(", "), // 將圖片路徑陣列轉換成字串，用逗號分隔
        0,
        img_request_illustrate, //等待新增圖文說明字串,等待query參數
      ]);

      //const sql2 = "SELECT id FROM repairs where name =? and time =? and place=?";
      // const sql2 = "SELECT * FROM repairs ORDER BY `id` DESC LIMIT 1";
      const sql2 = "SELECT * FROM hr.repairs_test ORDER BY `id` DESC LIMIT 1";

      //const [editnum] = await db.query(sql2,[name,time,place]);
      const [editnum] = await db2.query(sql2);
      const requestid = editnum[0].id;

      //console.log(` ID: ${requestid}`);

      // 送linetoken

      //開始處理送資料
      const config_line = {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${process.env.lineToken}`,
          // Authorization: `Bearer ${test_token}`,
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
報修人:${name}
編號: ${requestid}
機器:${machine}
區域:${place}
目前狀態：${machineStatus}
異常狀況：${question}
圖文說明:${img_request_illustrate}
`;

      //只先測試DISCORD
      // for (let k = 3; k < 2; k++) {
      //   if (k == 0) {
      //     await axios.post(
      //       "https://notify-api.line.me/api/notify",
      //       `message=${message}`,
      //       config_line
      //     );

      //     console.log("設備報修已經提交訊息內容委託LINE");
      //   } else if (k == 1) {
      //     const RePairMachine_REQUEST_URL = `${process.env.discord_factoryandrepair_submit}`;
      //     await axios.post(
      //       // "https://notify-api.line.me/api/notify",
      //       RePairMachine_REQUEST_URL,
      //       { content: message },
      //       config_Discord
      //     );
      //     console.log("設備報修提交內容已經委託DisCord");
      //   }
      // }

      const RePairMachine_REQUEST_URL = `${process.env.discord_factoryandrepair_submit}`;
          await axios.post(
            // "https://notify-api.line.me/api/notify",
            RePairMachine_REQUEST_URL,
            { content: message },
            config_Discord
          );
          console.log("設備報修提交內容已經委託DisCord");
      res.status(201).json({ message: "資料保存成功" });
    } catch (error) {
      console.error("發生錯誤", error);
      res.status(500).json({
        message: "資料保存錯誤",
      });
    }
  }
);

//列出所有維修單資料
router.get("/repair_list", async (req, res) => {
  try {
    // 從資料庫中擷取報修紀錄
    // const sql = "SELECT * FROM repairs ORDER BY id DESC";

    //測試新表單repairs_test
    const sql = "SELECT * FROM hr.repairs_test ORDER BY id DESC";

    //驗證完畢後記得將db2 改為db
    const [repairRecords] = await db2.query(sql);
    // console.log(repairRecords);
    res.status(200).json(repairRecords); // 將報修紀錄回傳至前端
  } catch (error) {
    // disconnect_handler(db);
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

//取得特定維修單號
router.get("/repair_list/:id", async (req, res) => {
  try {
    const { id } = req.params; // 擷取路由的id
    // 跟資料庫要資料
    // const sql = "SELECT * FROM repairs WHERE id = ?";

    //測試\新表單 hr.repairs_test
    const sql = "SELECT * FROM hr.repairs_test WHERE id = ?";

    //驗證完畢後記得將db2 改為db
    const [repairRecord] = await db2.query(sql, [id]);
    // console.log("????", repairRecord[0]);
    if (!repairRecord) {
      return res.status(404).json({ message: "未找到對應資料" });
    }
    if (!repairRecord[0].photo_path) {
      repairRecord[0].photo_path = []; // 如果沒有照片，設置為空陣列
    } else {
      repairRecord[0].photo_path = repairRecord[0].photo_path
        .split(",")
        .map((path) => path.trim());
    }

    if (!repairRecord[0].repair_photo) {
      repairRecord[0].repair_photo = []; // 如果沒有照片，設置為空陣列
    } else {
      repairRecord[0].repair_photo = repairRecord[0].repair_photo
        .split(",")
        .map((path) => path.trim());
    }

    res.status(200).json(repairRecord);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({ message: "異常狀況" });
  }
});

//更新部分資料
router.patch(
  "/repair_list/:id",
  upload.array("photos", 10),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        handled,
        machine,
        errorcode,        
        repair_person,
        handling_method,
        confirmation_method,
        reoperation_time,
        report_explain,
      } = req.body;

      let img_edit_illustrate;
      let photo_paths = [];
      console.log("report_explain 接收格式為 = " + report_explain);
      console.log("!!!!", req.files);
      if (req.files && req.files.length > 0) {
        // 遍歷上傳的所有圖片，將其保存到資料庫中
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          photo_paths.push(file.filename); // 將檔案路徑保存到 photo_paths 陣列中
        }
      }

      // console.log(
      //   handled,
      //   machine,
      //   errorcode,
      //   repair_person,
      //   handling_method,
      //   confirmation_method,
      //   reoperation_time,        
      // );


      if (typeof report_explain === "string") {
        console.log("接收photoInfo為string格式字串");

        img_edit_illustrate = report_explain.toString() ;


        console.log("report_explain 不需要整理 = " + img_edit_illustrate);
      } //回傳是字串陣列
      else if (Array.isArray(report_explain)) {
        const Photo_edit_explain = report_explain.reduce(
          (accumulator, currentValue) => accumulator + currentValue,
          ","
        );

        // const resultWithSpace = arr2.join(","); // 使用空格作為分隔符
        img_edit_illustrate = Photo_edit_explain.toString();

        console.log("report_explain 重新整理 = " + img_edit_illustrate);
      } else {
        console.log("接收report_explain這不是陣列或字串");
      }

      // 構建更新資料的 SQL 查詢語句
      // let sql =
      //   "UPDATE repairs SET handled = ?, repair_person = ?, handling_method = ?, confirmation_method = ?, reoperation_time = ? ";

      //新驗證表單hr.repairs_test
      let sql =
        "UPDATE hr.repairs_test SET handled = ?, machine = ? , errorcode = ? , repair_person = ?, handling_method = ?, confirmation_method = ?, reoperation_time = ? , imagedescription_edit = ?";
      const sqlParams = [
        handled,
        machine,
        errorcode,
        repair_person,
        handling_method,
        confirmation_method,
        reoperation_time,
        img_edit_illustrate,
      ];

      // 如果有新照片上傳，則包含照片更新部分
      if (photo_paths.length > 0) {
        sql += ", repair_photo = ?";
        sqlParams.push(photo_paths.join(", "));
      }

      sql += " WHERE id = ?";
      sqlParams.push(id);

      // console.log(sql);
      // console.log("這是sqlParams", sqlParams);

      //驗證完畢後記得將db2 改為db
      await db2.query(sql, sqlParams);

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
維修結果回報
編號: ${id}
設備名稱: ${machine}
維修工程師: ${repair_person}
處理方式:${handling_method}
修復確認方式: ${confirmation_method}
處理結果: ${handled === "1" ? "已修復" : handled === "2" ? "觀察中" : "未修復"}
修復結果圖文說明:${img_edit_illustrate}
----------------
`;
// 連結: ${process.env.web}/${id}

      //只先測試DISCORD

          const RepairMachine_REQUEST_URL = `${process.env.discord_factoryandrepair_submit}`;
          await axios.post(
            // "https://notify-api.line.me/api/notify",
            RepairMachine_REQUEST_URL,
            { content: message },
            config_Discord
          );
          console.log("設備修復內容已經提交訊息委託DisCord");


      res.status(200).json({ message: "更新成功" });
    } catch (error) {
      // disconnect_handler(db);
      console.error("更新錯誤:", error);
      res.status(500).json({ message: "更新錯誤" });
    }
  }
);

module.exports = router;
