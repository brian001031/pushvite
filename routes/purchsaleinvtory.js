const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const { json } = require("body-parser");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbcon = require(__dirname + "/../modules/mysql_connect.js"); // hr 資料庫
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js"); // mes 資料庫


// Promise wrapper for convenience
const dbconP = dbcon;

let dbpsi_run;
let targetPath;
let viewdata_combine = [];


// 獲取當前日期
let now = new Date();

// 取得當前年份、月份和日期
let nowyear = now.getFullYear();
let nowMonth = (now.getMonth() + 1).toString().padStart(2, "0"); // 月份從0開始，所以要加1
let nowdate = new Date(nowyear, nowMonth, 0)
  .getDate()
  .toString()
  .padStart(2, "0");

let Formatted_Full_NowDate =
  `${nowyear}-` +
  `${nowMonth}-` +
  `${nowdate} ` +
  `23:59:59`;


const select_DB_connect = async (dbname) => {
  // Use the shared pool from modules/mysql_connect.js for all DB selections.
  // Ensure dbpsi_run is set so psiPromise() returns a usable pool.

  switch (dbname) {
    case "mes":
      dbpsi_run = dbmes;
      break;
    case "hr":
      dbpsi_run = dbcon;
      break;
    default:
      null;
      break;
  }

  console.log(`Selected DB connection for: ${dbname}`);
  return dbpsi_run;
};


// 配置 Multer 用於保存上傳檔案,直接執行寫入
const storage = multer.diskStorage({
  // 將分配異常參照檔案保存在 Z:/Allocat_NG_Data
  destination: (req, file, cb) => {
    const dateFolder = `${nowyear}`;

    targetPath = path.join(process.env.AllOCAT_NGFILE, dateFolder);

    // 確保目錄存在，若不存在則建立
    fs.mkdirSync(targetPath, { recursive: true });
    cb(null, targetPath);
  },
  // 將文件名稱以binary
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const converted = Buffer.from(file.originalname, "latin1").toString(
      "utf-8"
    ); // 將文件名轉換為 URL 安全的格式

    // 構建新的文件名稱，包含現在時間後加上連續數字
    // const newFileName = `${timestamp}-${file.originalname}`;

    // 彙整文件名稱
    const newFileName =
      converted === file.originalname ? `${file.originalname}`:converted;
    cb(null, newFileName);
  },
});

// 使用 memoryStorage 暫存檔案在 RAM 中，避免自動寫入硬碟
const upload = multer({ storage: multer.memoryStorage() });

// 登入驗證
router.get("/login", async (req, res) => {
  const { userID, userPWD } = req.query;
  const sql = "SELECT * FROM pursainv_reginfo WHERE memberID = ?";
  try {
    const [results] = await dbconP.query(sql, [userID]);
    if (results.length === 0)
      return res.status(400).send(`工號:${userID}未註冊紀錄`);

    const psipasswd = results[0].psipasswd;
    const isPasswordMatch = await bcrypt.compare(userPWD, psipasswd);

    if (!isPasswordMatch) return res.status(401).send("密碼錯誤");

    const token = jwt.sign(
      { memberID: results[0].memberID },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    return res.status(200).json({ token });
  } catch (err) {
    console.error(err);
    return res.status(500).send("資料庫連結錯誤!");
  }
});

// 註冊使用者
router.post("/register", async (req, res) => {
  const { userId, password, email, confirm_vrifycode, emailpwd } = req.body;
  //   console.log("全收到數據為: " + userId, password, email, confirm_vrifycode);
  //   const domain = email.split("@")[1];
  //   if (domain !== "指定的domain.com") {
  //     return res.status(400).send("Email 必須是指定的 domain");
  //   }

  //先確認是否有工號存在
  const sql1 = `SELECT * FROM hr_memberinfo WHERE memberID = ?`;
  const sqlpuch = `SELECT * FROM pursainv_reginfo WHERE memberID = ?`;

  try {
    const [result] = await dbconP.query(sql1, [userId]);
    if (result.length === 0) {
      return res.status(405).send(`無此工號:${userId},請確認人事資料表!`);
    }

    const [result2] = await dbconP.query(sqlpuch, [userId]);
    if (result2.length === 0) {
      console.log("沒有註冊此工號,請往下註冊!");
      const hashedPassword = await bcrypt.hash(password, 10);
      const sql_signup =
        "INSERT INTO pursainv_reginfo (memberID, psipasswd, memEmail, verifycode,memEmailpwd) VALUES (?,?,?,?,?)";
      try {
        await dbconP.query(sql_signup, [
          userId,
          hashedPassword,
          email,
          confirm_vrifycode,
          emailpwd,
        ]);
        return res.status(200).send({ message: "註冊成功" });
      } catch (err) {
        console.log(err.code);
        if (err.code === "ER_DUP_ENTRY")
          return res.status(400).send("帳號ID或 Email 已存在");
        return res.status(500).send("運行伺服器錯誤!");
      }
    } else {
      if (
        parseInt(result2[0].memberID) === parseInt(userId) ||
        result2.length > 0
      )
        return res.status(403).send(`工號:${userId}已註冊過!`);
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send("輸入例外錯誤");
  }
});

// 忘記密碼,重發驗證碼
router.get("/sendverifycode", async (req, res) => {
  const { userId, inputVerifymethod } = req.query;
  let register_phonenumber, sqlreg, sql_verifyup;

  // console.log("userId = " + userId + " - 驗證方法為:" + inputVerifymethod);

  //若選擇手機驗證這邊先行確認是否有手機號碼
  if (inputVerifymethod.indexOf("個人手機電話") !== -1) {
    const sqlphonenum =
      "select member_phone from hr_memberinfo where memberID =?";

    try {
      const [result] = await dbconP.query(sqlphonenum, [userId]);
      if (result.length === 0) {
        return res.status(400).send(`此工號:${userId}未註冊過mobile電話號碼!`);
      }
      register_phonenumber = result[0].member_phone;
      console.log(`工號:${userId}->驗證之手機號碼為:${register_phonenumber}`);
    } catch (err) {
      console.log(`目前無此工號:${userId}手機號,空值` + err);
      return res
        .status(401)
        .send(`目前無此工號:${userId}手機號(空值),發送驗證失敗!`);
    }
  }

  //先從hr.pursainv_reginfo 資料庫table 找出該對應的email
  sqlreg =
    "select memEmail,memEmailpwd from pursainv_reginfo where memberID =?";

  try {
    const [result] = await dbconP.query(sqlreg, [userId]);
    if (result.length === 0)
      return res.status(400).send(`此工號:${userId}未註冊過紀錄!`);

    sql_verifyup =
      "UPDATE pursainv_reginfo SET verifycode = ? where memberID =?";
    const reg_confirm_mail = result[0].memEmail;
    const reg_confirm_mailpwd = result[0].memEmailpwd;
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    try {
      await dbconP.query(sql_verifyup, [verificationCode, userId]);
    } catch (err) {
      console.log(err.code);
      return res.status(401).send("驗證碼發送有錯誤!");
    }

    if (inputVerifymethod.indexOf("個人手機電話") !== -1) {
      try {
        const accountSid = process.env.twilio_accountSid;
        const authToken = process.env.twilio_authToken;
        const client = require("twilio")(accountSid, authToken);
        const adjust_phonenumber = register_phonenumber.toString().slice(1);
        console.log("調整後手機號碼為:" + adjust_phonenumber);

        //傳送簡訊驗證碼
        client.messages
          .create({
            body: `進銷存系統接收您的驗證碼是：${verificationCode}`,
            from: `${process.env.twilio_virtual_phone_number}`,
            to: `+886${adjust_phonenumber}`,
          })
          .then((message) => console.log(message.sid))
          .catch((err) => console.error(err));

        return res
          .status(200)
          .json(`驗證碼發送成功於手機號碼:${register_phonenumber}`);
      } catch (err) {
        console.error("Error member_phone input :", err);
        return res.status(404).send(`此碼:${verificationCode}驗證錯誤`);
      }
    } else {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: `${reg_confirm_mail}`, pass: `${reg_confirm_mailpwd}` },
      });

      const mailOptions = {
        from: `${reg_confirm_mail}`,
        to: `${reg_confirm_mail}`,
        subject: "更新進銷存系統密碼",
        text: `您的驗證碼是：${verificationCode}`,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("郵件發送失敗", error);
          return res.status(404).send("郵件發送失敗!");
        } else {
          console.log("郵件發送成功", info.response);
          return res
            .status(200)
            .json(`驗證碼發送成功於信箱:${reg_confirm_mail}`);
        }
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send("輸入例外錯誤");
  }
});

// 重設密碼
router.post("/reset-password", async (req, res) => {
  const { userId, newpassword, verificationCode } = req.body;

  //先從hr.pursainv_reginfo 資料庫table 找出該對應的驗證碼
  const sqlcompare_verifi =
    "select verifycode from pursainv_reginfo where memberID =?";

  try {
    const [result] = await dbconP.query(sqlcompare_verifi, [userId]);
    const reg_confirm_verifycode = result[0].verifycode;
    if (reg_confirm_verifycode !== verificationCode) {
      return res.status(404).send(`此碼:${verificationCode}驗證錯誤`);
    }

    const hashedPassword = await bcrypt.hash(newpassword, 10);
    let sql_uppsipwd =
      "UPDATE pursainv_reginfo SET psipasswd = ? where memberID =?";
    try {
      await dbconP.query(sql_uppsipwd, [hashedPassword, userId]);
      return res.status(210).json("密碼已重設成功!");
    } catch (err) {
      console.log(err.code);
      return res.status(500).send("資料庫伺服器錯誤");
    }
  } catch (err) {
    console.error("Error ID input :", err);
    return res.status(444).send(`此碼:${verificationCode}驗證錯誤`);
  }
});

//索引指定FileName
router.get("/query_FileName", async (req, res) => {
  const { RadioValue, Rawtable, FileName_titleKey } = req.query;
  const FileKey = FileName_titleKey.queryfile;

  const dbp = await select_DB_connect(RadioValue);
  const sql_FileNameKey = `SELECT DISTINCT FileName FROM ${Rawtable} where FileName LIKE '%${FileKey}%'`;

  // console.log("sql_FileNameKey = " + sql_FileNameKey);

  try {
    if (!dbp) return res.status(500).json({ error: "DB pool not initialized" });
    const [results] = await dbp.query(sql_FileNameKey);
    return res.status(200).json(results);
  } catch (err) {
    console.error("FileKey query issue error :", err);
    return res
      .status(400)
      .json({ error: `FileKey query issue '%${FileKey}%'` });
  }
});

//索引FileName對應的搜尋資料
router.get("/view_FileName_raw", async (req, res) => {
  const { FormRawtable, RadioValue, File } = req.query;
  // console.log("FormRawtable =", FormRawtable);
  // console.log("RadioValue =", RadioValue);
  // console.log("File =", File);

  const dbp = await select_DB_connect(RadioValue);

  const sql_FileName_rawcount = `SELECT count(*) FROM ${FormRawtable} where FileName IN ${File} order by id`;

  try {
    if (!dbp) return res.status(500).json({ error: "DB pool not initialized" });

    const [countRes] = await dbp.query(sql_FileName_rawcount);
    let row_view_number = countRes[0]["count(*)"];
    console.log("sql_FileName_rawcount 取得數量 = " + row_view_number);

    const sql_FileName_raw = `SELECT * FROM ${FormRawtable} where FileName IN ${File} order by id`;
    const [results2] = await dbp.query(sql_FileName_raw);

    const sql3 = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${FormRawtable}' AND TABLE_SCHEMA = '${RadioValue}' ORDER BY ORDINAL_POSITION;`;
    const [results3] = await dbp.query(sql3);

    res
      .status(200)
      .json({ count: row_view_number, rawdata: results2, colname: results3 });
  } catch (err) {
    console.error("Error fetching FileName raw data:", err);
    return res
      .status(500)
      .json({ error: `Database error query RAW data IN ${File}` });
  }
});

//索引ID範圍內的搜尋資料
router.get("/view_rangeID_raw", async (req, res) => {
  const { FormRawtable, RadioValue, Start_ID, End_ID, ColViewID } = req.query;
  // console.log("req.query =", req.query);

  const dbp = await select_DB_connect(RadioValue);

  const sql_IDrange_count = `SELECT count(*) FROM ${FormRawtable} where ${ColViewID} between ${parseInt(
    Start_ID
  )} and ${parseInt(End_ID)};`;

  // console.log("query 測試: " + sql);
  // res.status(200).json({ message: "參數已收到" });
  try {
    if (!dbp) return res.status(500).json({ error: "DB pool not initialized" });

    const [countRes] = await dbp.query(sql_IDrange_count);
    let row_view_number = countRes[0]["count(*)"];
    console.log("sql_IDrange_count 取得數量 = " + row_view_number);

    const sql_IDrange = `SELECT * FROM ${FormRawtable} where ${ColViewID} between ${parseInt(
      Start_ID
    )} and ${parseInt(End_ID)};`;
    const [results2] = await dbp.query(sql_IDrange);

    const sql3 = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${FormRawtable}' AND TABLE_SCHEMA = '${RadioValue}' ORDER BY ORDINAL_POSITION;`;
    const [results3] = await dbp.query(sql3);

    res
      .status(200)
      .json({ count: row_view_number, rawdata: results2, colname: results3 });
  } catch (err) {
    console.error("Error fetching ID range data:", err);
    return res.status(500).json({
      error: `Database error query RAW data ${parseInt(
        Start_ID
      )} and ${parseInt(End_ID)}`,
    });
  }
});

// 查詢資料庫指定表單資料
router.get("/view_schematicraw", async (req, res) => {
  const { FormRawtable, RadioValue } = req.query;

  console.log("FormRawtable = " + FormRawtable);
  let sql2;

  const dbp = await select_DB_connect(RadioValue);

  const sql = `SELECT FLOOR(count(*)/1) as viewcount,'test' as type FROM ${FormRawtable}`;

  try {
    if (!dbp) return res.status(500).json({ error: "DB pool not initialized" });
    const [countRes] = await dbp.query(sql);
    let row_view_number = countRes[0]["viewcount"];
    if (row_view_number > 150000) row_view_number = 150000;
    sql2 = `SELECT * FROM ${FormRawtable} limit ${row_view_number}`;
    console.log("row_view_number = " + row_view_number);

    const [results2] = await dbp.query(sql2);
    const sql3 = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${FormRawtable}' AND TABLE_SCHEMA = '${RadioValue}' ORDER BY ORDINAL_POSITION;`;
    const [results3] = await dbp.query(sql3);
    return res
      .status(200)
      .json({ count: row_view_number, rawdata: results2, colname: results3 });
  } catch (err) {
    console.error("Error fetching schematic raw data:", err);
    return res
      .status(500)
      .json({ error: `Database error query row_view limit` });
  }
});
// 查詢資料庫中的所有表名
router.get("/search_psi_tables", async (req, res) => {
  const { RadioValue } = req.query;

  const dbp = await select_DB_connect(RadioValue);

  const sqlall_tables = `SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = '${RadioValue}'
`;

  try {
    if (!dbp) return res.status(500).json({ error: "DB pool not initialized" });
    const [results] = await dbp.query(sqlall_tables);
    const tableNames = results.map((row) => row.TABLE_NAME);
    return res
      .status(210)
      .json({ count: tableNames.length, tables: tableNames });
  } catch (err) {
    console.error("Error fetching table names:", err);
    return res.status(500).json({ error: "Database query error" });
  }
});


//取當前物料紀錄存取item ,spec, vender
router.get("/purchase_online_wavehouse_item", async (req, res) => {

  const {prefix_charactor} = req.query;

  // console.log("目前收到物料需求提示字元為:"+ prefix_charactor);

   try {
    if (!prefix_charactor) return res.status(402).json({ error: ` 目前接收->${prefix_charactor} 提示字元目前異常或空` });
    
    const sql_getquality = `
                            select distinct itemCode as it_type , itemName , specification , Vendor 
                            from mes.qualityassurancelist  
                            WHERE itemCode REGEXP '^${prefix_charactor}';
                          `;

    const [results] = await dbmes.query(sql_getquality);

    // console.log("目前搜尋到所有物料編碼資訊為:"+ JSON.stringify(results,null,2));

    return res.status(200).json({ msg: '收到物料需求回應前端!OK', rowdatas: results });
  } catch (err) {
    console.error("Error fetching table names:", err);
    return res.status(500).json({ error: "purchase_online_wavehouse_item Database query error" });
  }
  
});


//取得採購物料清單(回傳-> 1. 已經入庫等待分配料件 2. 尚未入庫待確認)
router.get("/getPurchase_LastnewData", async (req, res) => {
   
  // 針對前端提交分頁參數
  const mode = req.query.mode || "ALL";
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 2;
  const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC'; // 預設 DESC
  const start_date = req.query.stDate || '';
  const endDate = req.query.edDate || '';

  const purchase_content_sql = `
                                SELECT
                                    d.source,
                                    COALESCE(r.total, 0) AS total,
                                    r.latest_created_at,
                                    COALESCE(r.form_ids, '') AS form_ids    
                                FROM (
                                    SELECT 'purchase_OK' AS source
                                    UNION ALL
                                    SELECT 'purchase_Wait'
                                ) d
                                LEFT JOIN (
                                    SELECT
                                        source,
                                        COUNT(DISTINCT form_id) AS total ,
                                        MAX(created_at) AS latest_created_at,
                                    GROUP_CONCAT(
                                          DISTINCT form_id
                                          ORDER BY created_at DESC, form_id DESC
                                          SEPARATOR ','
                                        ) AS form_ids
                                    FROM (
                                        SELECT
                                            form_id,
                                            product_name,
                                            specification,
                                            item_code,
                                            created_at,
                                            'purchase_OK' AS source
                                        FROM hr.purchase_request_item
                                        WHERE delivery_status = '1'
                                        UNION ALL
                                        SELECT
                                            form_id,
                                            product_name,
                                            specification,
                                            item_code,
                                            created_at,
                                            'purchase_Wait' AS source
                                        FROM hr.purchase_request_item
                                        WHERE delivery_status = '0'
                                    ) t
                                    WHERE DATE(created_at) BETWEEN '${start_date}' AND '${endDate}'
                                    GROUP BY source
                                ) r                            
                                ON d.source = r.source
                                ORDER BY r.latest_created_at DESC;
                                `; 
  
  // console.log("purchase_content_sql query 原式為: "+ purchase_content_sql);

  try{

    const [results] = await dbconP.query(purchase_content_sql);

    // console.log("取出purchase 物料領取狀態為:" + JSON.stringify(results, null, 2));
    
    res.status(200).json({meg:"成功擷取purchase_request_item 最新收發料組態!" , pickpurchase_info:results});

  } catch (err) {
    console.error("Error fetching Purchase itemnames:", err);
    return res.status(500).json({ error: "getPurchase_LastnewData Database query error" });
  }

});

//取採購單號當前選擇的明細
router.get("/Purchase_Index_Detail", async (req, res) => {

  const {form_order , check_status} = req.query; 

//   console.log("check_status =", check_status);
// console.log("type =", typeof check_status);

  const purchase_detail_sql = `
                                select * from hr.purchase_request_item 
                                where form_id = ? 
                                and delivery_status = ?;
                              `;
   try{

    const [results] = await dbconP.query(purchase_detail_sql,[form_order,Number(check_status)]);

    // console.log(`取出purchase  採購字串:${form_order} 狀態:${Number(check_status)} 物料領取狀態為: ` + JSON.stringify(results, null, 2));
    
    res.status(200).json({ get_info: results});

  } catch (err) {
    console.error("Error fetching Purchase detial:", err);
    return res.status(500).json({ error: "Purchase_index_detial Database query error" });
  }

});

//分配料編碼批次 chunk 
router.post("/allocation_mulitrow", upload.array("files") ,async (req, res) => {
   const convert_json_formData = req.body.allocateData;
   const chunkIndex = Number(req.body.chunkIndex);

   let photo_paths = [];
   const BATCH_SIZE = 100; //目前預設100筆批次一次INSERT工作量

   console.log("有收到ISSUE檔案名稱:"+req.files);

   if( Object.values(convert_json_formData).length === 0){    
      res.status(400).json({ result: false , msg: `包裝分配數量為:${Object.values(convert_json_formData).length},有錯誤請確認提交狀況!` });
   }   
  
    const dateFolder = `${nowyear}`;
    targetPath = path.join(process.env.AllOCAT_NGFILE, dateFolder);

    // 確保目錄存在，若不存在則建立
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    //有提交附加檔案則先處理
    if (req.files && req.files.length > 0) {
      // 遍歷上傳的所有圖片，將其保存到資料庫中
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const filename = file.originalname;
        const converted = Buffer.from(filename, "latin1").toString("utf-8"); // 將文件名轉換為 URL 安全的格式

        // 彙整文件名稱
        const FilterFileName = converted !== filename ? converted : filename;

        //支持所有漢字字符以及數字和字母 以下為其中種type 規範 (e.g. '20250721-cool')
        const match = FilterFileName.match(
          /^(\d{8}-[\p{Script=Han}\w_-]+)-\d+\.[^.]+$/u
        );

        // if (!match || !match[1]) {
        //   return res
        //     .status(400)
        //     .send(
        //       `檔名格式 ${FilterFileName}錯誤，應為 YYYYMMDD-title-序號.ext`
        //     );
        // }

         // 將新檔案寫入磁碟
        const filePath = path.join(targetPath, FilterFileName);
        
        if (chunkIndex === 0) {
            // 第一批才存檔
            console.log(`目前批次為:${chunkIndex}, 是第一批開始存檔`);
            fs.writeFileSync(filePath, file.buffer);
        }else{
          //  console.log(`目前批次為:${chunkIndex}, 不執行存檔`);
        }        
        photo_paths.push(filePath); // 將檔案路徑保存到 photo_paths 陣列中            
     }
    }

    console.log("路徑包含檔案名:"+photo_paths);

    // Array 重整內部
    const insertData_prv = JSON.parse(convert_json_formData);

    // const final_InsertData = convert_json_formData.map((row) => {
    //     const row_val = Object.values(row);
    //     row_val[row_val.length-1] = photo_paths.length > 0? photo_paths.join(","):"";      
    //     return row_val;
    // });

    

    //Object 重整內部 
    // const insertData_prv =  Object.values(convert_json_formData);

    //將每筆Ng_file_info 重新取代(包含路徑\\)
    const final_InsertData = insertData_prv.map(row => {

      const newRow = [...row];

      // 最後一欄改成圖片
      newRow[newRow.length - 1] =
          photo_paths.length > 0
              ? photo_paths.join(",")
              : "";

      return [
        ...newRow,
        '',                   // picking_dept
        '',                   // picking_name
        '',                   // picking_memberid
        null,                 // picking_datetime
        Number(0),            // iscostover
        '',                   // stocktransfer_info
        null                  // stocktransfer_datetime
      ];
    });

    // console.log("final_InsertData 重整整體結構為以下:\r\n");
    // final_InsertData.forEach((item, index) => {
    //     console.log(`第 ${index + 1} 筆資料`);
    //     console.log(JSON.stringify(item, null, 2));
    // });


    const allocation_sql = `
                INSERT INTO mes.erp_allocatematerials
                (
                  assign_datetime,
                  form_id,
                  pur_pk_number,
                  product_itemcode,                  
                  product_name,                  
                  specification,
                  vender_name,
                  allocate_barcode_text,
                  total_measure_val,
                  row_measure_val,
                  row_unit,
                  issue_total_val,
                  issue_unit,
                  issue_description,
                  assign_name,
                  assign_memberid,
                  assign_dept,
                  warehousetype,
                  stack_position,
                  opmode,
                  ng_material_photo,
                  picking_dept,
                  picking_name,
                  picking_memberid,
                  picking_datetime,
                  iscostover,
                  stocktransfer_info,
                  stocktransfer_datetime
                )
                VALUES ?
                ON DUPLICATE KEY UPDATE    
                  total_measure_val = VALUES(total_measure_val),
                  row_measure_val = VALUES(row_measure_val),
                  warehousetype = VALUES(warehousetype),
                  stack_position = VALUES(stack_position),
                  issue_total_val = VALUES(issue_total_val),
                  issue_unit = VALUES(issue_unit),
                  issue_description = VALUES(issue_description),
                  opmode = VALUES(opmode),
                  ng_material_photo = VALUES(ng_material_photo),
                  assign_datetime = CURRENT_TIMESTAMP 
                `;

  const conn = await dbmes.getConnection();

   try {        

        await conn.beginTransaction();

         for (let i = 0; i < final_InsertData.length; i += BATCH_SIZE) {
            const chunk = final_InsertData.slice(i, i + BATCH_SIZE);
            await conn.query(allocation_sql, [chunk]);
         }

        await conn.commit();

       res.status(200).json({ msg: `成功分配erp物料表單OK`, tip_content:  `已經insert筆數:${final_InsertData.length}`});

    } catch (error) {
      console.error("分配料編碼批次chunk運行失敗! :", error);
      await conn.rollback();    
      res.status(500).json({ success: false, error: error.message });
       
    }finally {
       conn.release();
    }
});

//索引allocate_barcode_text 是否已經建立分配入倉碼
router.get("/check_erp_allocate_barcode", async (req, res) => {
  const { purch_orderform,  pk_number} = req.query;
  
  const sql_find_allocate = `
                            select count(distinct allocate_barcode_text) as allocate_count from mes.erp_allocatematerials 
                            where form_id like '${purch_orderform}' and  
                            pur_pk_number like '${pk_number}' 
                            order by id desc;
                            `;

  try {
 
    const [res_count] = await dbmes.query(sql_find_allocate);

    const get_count = Number(res_count[0]["allocate_count"]) || 0;

    // console.log("索引allocate_barcode_text 建立分配入倉數量為-> "+get_count);
   
    res.status(200).send({ get_allocate_num: get_count });

  } catch (err) {
    console.error("FileKey query issue error :", err);
    return res
      .status(400)
      .json({ error: `check_erp_allocate_barcode query issue`});
  }
});


//取得目前線上倉庫(位)列表名稱
router.get("/store_nowList", async (req, res) => {
   
  const store_sql = `WITH store AS (
                        SELECT
                            ROW_NUMBER() OVER (ORDER BY id) AS rn,
                            id,
                            storeName
                        FROM (
                            SELECT DISTINCT
                                MIN(id) AS id,
                                storeName
                            FROM mes.storeList
                            WHERE storeName IS NOT NULL
                              AND TRIM(storeName) <> ''
                        GROUP BY storeName
                        ) s
                ),
                locat AS (
                        SELECT
                            ROW_NUMBER() OVER (ORDER BY id) AS rn,
                            id,
                            location
                        FROM (
                            SELECT DISTINCT
                                MIN(id) AS id,
                                location
                            FROM mes.storeList
                            WHERE location IS NOT NULL
                              AND TRIM(location) <> ''
                        GROUP BY location
                        ) l
                )
                SELECT
                        s.id,
                        s.storeName AS store_list,
                        l.location AS location_list
                FROM store s
                LEFT JOIN locat l
                    ON s.rn = l.rn
                ORDER BY id DESC;
                `;

  try {
    
    const [store_raw] = await dbmes.query(store_sql);

    const filter_result = {
        store_allname: store_raw
            .filter(r => r.store_list)
            .map(r => ({
                id: r.id,
                name: r.store_list
            })),

        location_allname: store_raw
            .filter(r => r.location_list)
            .map(r => ({
                id: r.id,
                name: r.location_list
            }))
    };

    res.status(200).json(filter_result);
  } catch (error) {
    // disconnect_handler(db);
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得物料倉庫位資料錯誤",
    });
  }
});



module.exports = router;
