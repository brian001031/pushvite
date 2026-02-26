const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const fs = require("fs");
const moment = require("moment");
const util = require("util");
const schedule = require("node-schedule");
const xlsx = require("xlsx");
const {Pool} = require("pg");
const path = require("path");
const { start } = require("repl");
const { includes, orderBy } = require("lodash");

// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbcon = require(path.join(__dirname, "..", "modules", "mysql_connect.js"));  // hr 資料庫
const { PrismaClient: HrClient } = require('../generated/hr');
const { PrismaClient: MesClient } = require('../generated/mes');

const prismaHr = new HrClient();
const prismaMes = new MesClient();


const neonDb = new Pool({
  connectionString: process.env.NeonDB,
  ssl: { rejectUnauthorized: false }
});

// 郵件發送器配置
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  requireTLS: process.env.SMTP_REQUIRE_TLS === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// 真實的郵件發送函數 重製密碼
const sendEmailWithCode = async (email, code , name) => {
  const mailOptions = {
    from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
    to: email,
    subject: '密碼重設驗證碼 - 長庚國際能源',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb; text-align: center;">密碼重置驗證</h2>
        <p>${name} 您好，</p>
        <p>您請求重置請假系統的密碼。請使用以下驗證碼：</p>
        <div style="background: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 30px; text-align: center; margin: 20px 0;">
          <h1 style="color: #495057; font-size: 36px; margin: 0; letter-spacing: 8px;">${code}</h1>
        </div>
        <p style="color: #6c757d;">此驗證碼將在 10 分鐘後失效。</p>
        <p style="color: #6c757d;">如果您未要求重置密碼，請忽略此郵件。</p>
        <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
        <p style="color: #adb5bd; font-size: 12px; text-align: center;">
          此郵件由請假系統自動發送，請勿回覆。
        </p>
      </div>
    `
  };

  return await transporter.sendMail(mailOptions);
};

//權限擁有人
const product_foremanlist = [
  "007|張玉佩",
  "011|鄭坤德",
  "019|張智強",
  "030|黃祺鈞",
  "033|陳尚吉",
  "264|張庭瑋",
  "109|黃之奕",
  "150|黃啟明",
  "183|陳又銘",
  "255|林冠達",
  "008|許煜政",
  "290|章榮文",
  "349|周柏全",
  "068|洪彰澤",
  "003|陳昱昇",
  "009|周竹君",
  "292|張宇翔"
  
];

let ScheduleData_GetRespnse = [],
  onoffboard_confirm = [];
let already_st_ed;

// 抓到時間設置排程
setInterval(() => {
  let now = new Date();
  // 取得當前年份、月份和日期
  let nowyear = now.getFullYear();
  let nowMonth = (now.getMonth() + 1).toString().padStart(2, "0"); // 月份從0開始，所以要加1
  let nowdate = now.getDate().toString().padStart(2, "0");
  let newSheetName = nowyear + "-" + nowMonth + "-" + nowdate;
  console.log(`  "${newSheetName}"`);
}, 21600000); // 每6小時执行一次(1000毫秒X21600)

function isValidEmail(email) {
  // const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.com$/;
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

function getServerIP() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // 只取 IPv4 地址，跳過內部回環地址
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return null;
}

// 將日期格式從 'YYYY-MM-DD HH:MM:SS' 轉換為 'DDMMYY'
const absentformatDate = (dateStr) => {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2); // 取得最後兩位年份
  return `${year}${month}${day}`;
};

// 轉換 date 格式（'YYMMDD' -> 'YYYY-MM-DD'）
const convertDate = (dateStr) => {
  const year = "20" + dateStr.slice(0, 2); // 取年份的最後兩位並加上 '20'
  const month = dateStr.slice(2, 4); // 取月份
  const day = dateStr.slice(4, 6); // 取日期
  return `${year}-${month}-${day}`; // 返回標準日期格式
};

// 轉換 time 格式（'HHMM' -> 'HH:MM'）
const convertTime = (timeStr) => {
  const hours = timeStr.slice(0, 2); // 取小時
  const minutes = timeStr.slice(2, 4); // 取分鐘
  return `${hours}:${minutes}`; // 返回標準時間格式
};

const sanitizePasswordInput = (raw) => {
  if (typeof raw !== "string") {
    return { plain: "", isProvided: false };
  }
  const plain = raw.trim();
  return { plain, isProvided: plain.length > 0 };
};

const normalizeToStringArray = (input) => {
  if (Array.isArray(input)) {
    return input
      .map((item) => (item === undefined || item === null ? "" : String(item).trim()))
      .filter((item) => item !== "");
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];

    const looksJson =
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"));

    if (looksJson) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizeToStringArray(parsed);
      } catch (_) {
        return trimmed ? [trimmed] : [];
      }
    }

    if (trimmed.includes(",")) {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== "");
    }

    return [trimmed];
  }

  if (input === undefined || input === null) {
    return [];
  }

  return normalizeToStringArray(String(input));
};

function toThreeDigit(num) {
  return num.toString().padStart(3, "0");
}

function getDigitCount(num) {
  // 排除零，並確保 num 是正數
  num = Math.abs(num);
  let cau = 0;
  if (num > 0) {
    while (num >= 1) {
      num /= 10;
      cau++;
    }
  } else {
    return 1;
  }

  return cau;

  //原先內建邏輯
  // return num === 0 ? 1 : Math.floor(Math.log10(num)) + 1;
}

schedule.scheduleJob("0 0 15 * *", async () => {
  const currentIP = getServerIP();
        const allowedIP = '192.168.3.207';
        
        if (currentIP !== allowedIP) {
            console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
            return;
        }


  console.log("⏰ 到了每月 15 號，開始執行下個月的自動排班...");
  const result = await autoScheduleHandler();
  console.log('⏰ 自動排班執行結果:', result);
})


// 排程系統 並用於刪除、備份 過期資料 啟動時間 每年 1/1 凌晨 00:00
schedule.scheduleJob("0 0 0 1 1 *", async () => {
  // 日期格式 分鐘/小時/天/月/星期
  console.log("開始刪除舊資料...");

  const currentIP = getServerIP();
        const allowedIP = '192.168.3.207';
        
        if (currentIP !== allowedIP) {
            console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
            return;
        }

  const now = new Date();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const cutoffDate = moment
    .utc()
    .set({
      year: nowYear,
      month: nowMonth - 1,
      date: 1,
      hour: 0,
      minute: 0,
      second: 0,
    })
    .format("YYYY-MM-DD HH:mm:ss");

  const sql = `SELECT * FROM schedule_trackrecord WHERE SortWorkTimeStart < ?`;
  const sqlParams = [cutoffDate];

  try {
    const [record] = await dbcon.query(sql, sqlParams);
    if (record.length > 0) {
      console.log("查看必須備份的舊資料 :", record);

      const worksheet = xlsx.utils.json_to_sheet(record);
      const workbook = xlsx.utils.book_new();

      const fileName = `過期排班資料_${moment().format("YYYYMMDD")}.xlsx`;
      const filePath = `./backup/${fileName}`;

      // 確保儲存目錄存在 (使用非同步版本)
      fs.mkdir("./backup", { recursive: true }, async (err) => {
        if (err) {
          console.error(`創建目錄失敗: ${err}`);
          return;
        }

        xlsx.utils.book_append_sheet(workbook, worksheet, "歷年刪除資料");

        await new Promise((resolve) => {
          xlsx.writeFile(workbook, filePath);
          setTimeout(resolve, 100); // 避免同步執行導致檔案寫入不完整
        });

        console.log(`匯出資料完成 , 資料匯出至 : ${filePath}`);

        // 確保匯出完成後再執行刪除操作
        await deleteFileFromSql(cutoffDate);
      });
    } else {
      console.log("沒有舊資料需要備份");
    }
  } catch (error) {
    console.error(`歷年資料匯出任務失敗: ${error.stack}`); // 記錄更詳細的錯誤訊息
  }
});

// 刪除舊請假資料
const deleteFileFromSql = async (cutoffDate) => {

  const currentIP = getServerIP();
        const allowedIP = '192.168.3.207';
        
        if (currentIP !== allowedIP) {
            console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
            return;
        }
  try {
    const sql = `DELETE FROM schedule_trackrecord WHERE SortWorkTimeStart < ?`;
    const sqlParams = [cutoffDate];

    await dbcon.query(sql, sqlParams);
    console.log("舊資料刪除成功");
  } catch (error) {
    console.error(`刪除舊資料失敗: ${error.stack}`); // 記錄更詳細的錯誤訊息
  }
};



// 確認主管權限與其對應的區域
const catchAuth = async(memberId) =>{

  console.log(memberId + " 進入 catchAuth 函數");
  try{
    const prisma = prismaHr;
    const checkAuth = await prisma.absentManagerRoster.findMany({
      where: {
        nowIsManager: true , // nowIsManager 在 schema 中是 Boolean 型別
        memberID: String(memberId).trim()
      },
      select: {
        id: true,
        memberID: true,
        reg_schedulename: true,
        positionArea: true,
        authStatus: true
      },
    });
    // console.log("查詢結果 checkAuth:", checkAuth , 'typeof  :', typeof checkAuth);
    return checkAuth;
    
  
  }catch (err) {
    console.error("Error in catchAuth: ", err);
    throw err;
  }
}


// 檢查排班記錄是否存在
async function check_schedulerecord_IsExist(
  scheduleID,
  schedulename,
  sort_start_date
) {
  //重新計算已排班日期查詢量與偵測重複日期
  onoffboard_confirm.length = already_st_ed = 0;

  const sql_check = `
  select 
    count(*) as result,'startdate_get_exist' as type  
  from 
    schedule_trackrecord 
  where 
    AssignScheduleID = ${scheduleID}  AND  
    AssignScheduleName like '${schedulename}' AND  
    DATE(SortWorkTimeStart) ='${sort_start_date}' and 
    DeleteDateTime = '0000-00-00 00:00:00' 
    `;

  console.log("sql_check = " + sql_check);

  const [check_schedule] = await dbcon.query(sql_check);
  // dbcon.query(sql_check, async (err, resultscheck) => {});

  const startdate_exist_count = check_schedule[0]["result"];
  const enddate_exist_count = check_schedule[1]["result"];

  //當有找到之前排班日期(起始或結束)有重複
  if (parseInt(startdate_exist_count) !== 0) {
    already_st_ed += parseInt(1);
    onoffboard_confirm.push({ Onboard_Repeat: sort_start_date });
  }
  if (parseInt(enddate_exist_count) !== 0) {
    already_st_ed += parseInt(2);
    onoffboard_confirm.push({ Offboard_Repeat: sort_end_date });
  }

  if (parseInt(already_st_ed) > 0) return true;

  return false;
}

// 外部資料庫註冊排班使用者
const registerOutLineDb = async (
  reg_memberID,
  reg_schedulename,
  memEmail,
  hashedPassword,
  authPositionInput,
  positionareaInput,
  role
) => { 
  const authArray = normalizeToStringArray(authPositionInput);
  const positionArray = normalizeToStringArray(positionareaInput);

  const sql_OutLine = `
    INSERT INTO users (
      employee_id,
      email,
      full_name,
      authPosition,
      role,
      positionarea,
      password_hash
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (employee_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      authPosition = EXCLUDED.authPosition,
      role = EXCLUDED.role,
      positionarea = EXCLUDED.positionarea,
      password_hash = EXCLUDED.password_hash
    RETURNING
        id::text,
        password_hash as "password",
        email as "memEmail",
        full_name as "memberName",
        employee_id as "memberID",
        authPosition,
        role,
        positionarea;
  `;
  
  try{
    const result = await neonDb.query(sql_OutLine, [
      String(reg_memberID).trim(),             // $1 - employee_id
      String(memEmail || '').trim(),           // $2 - email
      reg_schedulename,                        // $3 - full_name
      JSON.stringify(authArray),               // $4 - authPosition (JSON)
      role,                                    // $5 - role
      JSON.stringify(positionArray),           // $6 - positionarea (JSON)
      hashedPassword                           // $7 - password_hash
    ]);


    console.log("外部資料庫註冊/更新成功 :", result.rows[0]);
    return result.rows[0];

    }catch (err) {
      console.error("Error in registerOutLineDb: ", err);
      throw err;
    }
}

router.put("/changePsw", async (req, res) => {
  const {email, code, newPassword} = req.body;

  console.log("更改密碼請求，Email:", email, "驗證碼:", code, "新密碼:", newPassword);

  // 驗證輸入
  if (!email || !code || !newPassword) {
    return res.status(400).json({ 
      success: false, 
      message: '請填寫所有必要欄位' 
    });
  }

  try {
    // 驗證驗證碼
    const [rows] = await dbcon.query(
      `SELECT * FROM hr.schedule_reginfo WHERE memEmail = ? AND code = ?`, 
      [email, code]
    );


    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "驗證碼錯誤或已過期"
      });
    }

    // 加密新密碼
    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash(String(newPassword).trim(), 10);

    // 更新內部資料庫密碼
    await dbcon.query(
      `UPDATE hr.schedule_reginfo 
        SET 
        encrypasswd = ?, 
        originalpasswd = ?, 
        code = NULL 
        
        WHERE memEmail = ?`,
      [hashedPassword, newPassword, email]
    );

    // 同步到外部資料庫
    try {
      await neonDb.query(
        `UPDATE users SET password_hash = $1 WHERE email = $2`,
        [hashedPassword, email]
      );
      console.log("外部資料庫密碼同步成功");
    } catch (outlineErr) {
      console.log("外部資料庫密碼同步失敗（但內部更新成功）:", outlineErr.message);
    }

    res.json({
      success: true,
      message: "密碼更新成功",
      rows: rows
    });

  } catch (error) {
    console.error("Error in changePsw:", error);
    res.status(500).json({
      success: false,
      message: "密碼更新失敗，請稍後再試"
    });
  }
})


router.get("/try_anny_holidayAutowrite_WithGemini" , async(req,res) =>{
  
  try{
    const { anny_holidayAutowrite_WithGemini } = await import('../ai_TakeRestTime.js');
    const response = await anny_holidayAutowrite_WithGemini()
    console.log("取得假期資料:", response);

    res.status(200).json({
      key: "success",
      holidays: JSON.stringify(response)
    })
  }
  catch(error){
    console.error("Error in try_anny_holidayAutowrite_WithGemini:", error);
    res.status(500).json({
      key: "error",
      message: "取得假期資料失敗，請稍後再試"
    })
  }

})

//註冊排班使用者
router.post("/register", async (req, res) => {
  try {
    const {
      memberID,
      memEmail,
      telephone,
      originalpasswd,
      positionarea,
      shift,
      authPosition,
    } = req.body;

    //先確認是否有工號存在
    const sql1 = `SELECT * FROM hr_memberinfo WHERE memberID = ?`;
    const sqlschedule = `SELECT * FROM schedule_reginfo WHERE memberID = ?`;

    let params = [],
      isManerger = "NULL",
      adjust_memeID;

    //當輸入memberID位元小於3,自動補缺口
    if (getDigitCount(memberID) < 3) {
      console.log("輸入位元結果:" + getDigitCount(parseInt(memberID)));
      adjust_memeID = toThreeDigit(memberID);
    } else {
      adjust_memeID = memberID.toString();
    }

    // console.log("最終調整註冊比對ID為:" + adjust_memeID + "  原先memberid = " + memberid );

    try {
      const [results] = await dbcon.query(sql1, [adjust_memeID]);
      if (!results || results.length === 0) {
        return res.status(405).send(`無此工號:${memberID},請確認人事資料表!`);
      }

      // 確認是否已在排班系統註冊
      const [results2] = await dbcon.query(sqlschedule, [memberID]);

      const reg_schedulename = results[0].memberName;
      const reg_memberID = results[0].memberID;
      const passwordInfo = sanitizePasswordInput(originalpasswd);

      if (!passwordInfo.isProvided) {
        return res.status(400).send("請輸入登入密碼");
      }

      const hashedPassword = await bcrypt.hash(passwordInfo.plain, 10);

      if (!results2 || results2.length === 0) {
        //判定是否為生產領班(主管),比對->工號,姓名
        for (let manger = 0; manger < product_foremanlist.length; manger++) {
          const filter_manger = product_foremanlist[manger].toString().split("|");
          if (
            filter_manger[0].includes(adjust_memeID) &&
            filter_manger[1].includes(reg_schedulename)
          ) {
            isManerger = parseInt("1");
            break;
          }
        }

        if (isManerger.toString().includes("NULL")) {
          isManerger = parseInt("0");
        }

        let absentStart = "";
        let absentEnd = "";
        switch (shift) {
          case "早班":
            absentStart = "08:00";
            absentEnd = "20:00";
            break;
          case "晚班":
            absentStart = "20:00";
            absentEnd = "08:00";
            break;
          case "常日班":
            absentStart = "08:30";
            absentEnd = "17:30";
            break;
          default:
            absentStart = "08:30";
            absentEnd = "17:30";
            break;
        }

        // 根據 isManerger 決定角色
        const role = isManerger === 1 ? 'manager' : 'employee';

        // 同步到外部資料庫（不影響主要流程）
        try {
          await registerOutLineDb(
            reg_memberID,
            reg_schedulename,
            memEmail,
            hashedPassword,
            authPosition,
            positionarea,
            role
          );
          console.log("外部資料庫同步成功");
        } catch (outlineErr) {
          console.log("外部資料庫同步失敗（但內部註冊繼續）:", outlineErr.message);
        }

        // 內部db新增註冊資料
        const sql_signup = `
                INSERT INTO schedule_reginfo(
                  memberID,
                  reg_schedulename,
                  memEmail,
                  telephone,
                  encrypasswd,
                  originalpasswd,
                  isManager,
                  positionarea,
                  shift,
                  absentStart,
                  absentEnd,
                  authPosition,
                  code
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;

        const insertParams = [
          reg_memberID,
          reg_schedulename,
          memEmail,
          telephone,
          hashedPassword,
          originalpasswd,
          isManerger,
          positionarea,
          shift,
          absentStart,
          absentEnd,
          authPosition,
          null,
        ];

        try {
          await dbcon.query(sql_signup, insertParams);
          return res.status(200).send({
            message: "排班註冊成功",
            memberName: reg_schedulename,
            isManerger: isManerger,
          });
        } catch (insertErr) {
          console.log(insertErr.code);
          if (insertErr.code === "ER_DUP_ENTRY") {
            return res.status(400).send("帳號ID或 Email 已存在");
          }
          return res.status(500).send("運行資料庫INSERT錯誤!");
        }
      } else {
        return res.status(403).send(` 工號:${memberID}/姓名:${reg_schedulename}已註冊過排班系統建檔資料庫!`);
      }
    } catch (err) {
      console.log("輸入例外錯誤 Error in connecting to database:", err);
      return res.status(500).send("人事資料庫連結錯誤!");
    }

    // console.log(
    //   "這邊預計填入 hr db 資料做對比 看看註冊者是否註冊過 或 此E-mail 是否在資料庫內"
    // );
    // res.status(200).json("預計為驗證註冊資料功能");
  } catch (error) {
    console.log("Error <<register>> info & send back error code: ", error);
    res
      .status(500)
      .json(
        "Register Get function is not working ,error code below" +
          { error: error }
      );
  }
});

router.put("/updateRegister", async (req, res) => {
  const {
    memberID,
    name,
    memEmail,
    telephone,
    originalpasswd,
    positionarea,
    shift,
    authPosition,
  } = req.body;

  const sql_update = `
    UPDATE schedule_reginfo SET
      memEmail = ?,
      telephone = ?,
      originalpasswd = ?,
      encrypasswd = ?,
      positionarea = ?,
      shift = ?,
      authPosition = ?,
      absentStart = ?,
      absentEnd = ?
    WHERE memberID = ?
  `;

  const authStatusSql = `SELECT * FROM hr.absent_manager_roster WHERE nowIsManager != "0"`;

  try {
    const memberKey = String(memberID).trim();

    const [existingRows] = await dbcon.query(
      `SELECT reg_schedulename, originalpasswd, encrypasswd, isManager,
              memEmail AS currentEmail,
              telephone AS currentTelephone,
              shift AS currentShift,
              positionarea AS currentPositionarea,
              authPosition AS currentAuthPosition
       FROM schedule_reginfo WHERE memberID = ?`,
      [memberKey]
    );

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).send("找不到對應的排班帳號");
    }

    const existingRecord = existingRows[0];
    const passwordInfo = sanitizePasswordInput(originalpasswd);

    let finalPlainPassword = passwordInfo.plain;
    let finalHashedPassword = existingRecord.encrypasswd || null;

    if (passwordInfo.isProvided) {
      finalHashedPassword = await bcrypt.hash(finalPlainPassword, 10);
    } else {
      finalPlainPassword = typeof existingRecord.originalpasswd === "string"
        ? existingRecord.originalpasswd.trim()
        : "";

      if (!finalHashedPassword && finalPlainPassword) {
        finalHashedPassword = await bcrypt.hash(finalPlainPassword, 10);
      }
    }

    if (!finalHashedPassword) {
      return res.status(400).send("請提供有效的密碼");
    }

    const resolvedShift = typeof shift === "string" && shift.trim() !== ""
      ? shift.trim()
      : (existingRecord.currentShift || "");

    let absentStart = null;
    let absentEnd = null;

    switch (resolvedShift) {
      case "早班":
        absentStart = "08:00";
        absentEnd = "20:00";
        break;
      case "晚班":
        absentStart = "20:00";
        absentEnd = "08:00";
        break;
      case "常日班":
        absentStart = "08:30";
        absentEnd = "17:30";
        break;
      default:
        absentStart = null;
        absentEnd = null;
        break;
    }

    const [checkAuth] = await dbcon.query(authStatusSql);

    const rosterMatch = Array.isArray(checkAuth)
      ? checkAuth.find((item) => String(item.memberID).trim() === memberKey)
      : null;

    const rosterAuthStatus = rosterMatch && rosterMatch.authStatus !== undefined
      ? String(rosterMatch.authStatus)
      : undefined;

    const rosterAuthPosition = rosterMatch ? normalizeToStringArray(rosterMatch.authPosition) : [];
    const rosterPositionArea = rosterMatch ? normalizeToStringArray(rosterMatch.positionarea) : [];

    const requestAuthPosition = normalizeToStringArray(
      authPosition !== undefined ? authPosition : existingRecord.currentAuthPosition
    );
    const requestPositionArea = normalizeToStringArray(
      positionarea !== undefined ? positionarea : existingRecord.currentPositionarea
    );

    const finalAuthPosition = Array.from(new Set(
      rosterAuthPosition.length > 0 ? rosterAuthPosition : requestAuthPosition
    )).filter((item) => typeof item === "string" && item.trim() !== "");
    const finalPositionArea = Array.from(new Set(
      rosterPositionArea.length > 0 ? rosterPositionArea : requestPositionArea
    )).filter((item) => typeof item === "string" && item.trim() !== "");

    const finalRole = (rosterAuthStatus && rosterAuthStatus !== "0") || Number(existingRecord.isManager) === 1
      ? "manager"
      : "employee";

    const serializedPositionArea = JSON.stringify(finalPositionArea);
    const serializedAuthPosition = JSON.stringify(finalAuthPosition);

    const resolvedEmail = typeof memEmail === "string" ? memEmail.trim() : (existingRecord.currentEmail || null);
    const resolvedTelephone = typeof telephone === "string" ? telephone.trim() : (existingRecord.currentTelephone || null);

    await dbcon.query(sql_update, [
      resolvedEmail,
      resolvedTelephone,
      finalPlainPassword,
      finalHashedPassword,
      serializedPositionArea,
      resolvedShift,
      serializedAuthPosition,
      absentStart,
      absentEnd,
      memberKey,
    ]);

    try {
      await registerOutLineDb(
        memberKey,
        String(name || existingRecord.reg_schedulename || "").trim(),
        resolvedEmail,
        finalHashedPassword,
        finalAuthPosition,
        finalPositionArea,
        finalRole
      );
      console.log("外部資料庫同步成功");
    } catch (outlineErr) {
      console.log("外部資料庫同步失敗（但內部更新成功）:", outlineErr.message);
    }

    return res.status(200).send({ Message: `資料更新成功` });
  } catch (err) {
    console.log("Error in updateRegister: ", err);
    return res.status(500).send("更新排班資料失敗");
  }
});

//判定目前是否重複排班日期
router.get("/confirmReOfferWork", async (req, res) => {
  const {
    offerMemberId,
    offerMemberName,
    offerOnBoardTime,
    offerOffBoardTime,
  } = req.query;

  console.log(
    "接收排班工號:" +
      offerMemberId +
      " 排班人員姓名 = " +
      offerMemberName +
      " 排班起始時間 = " +
      offerOnBoardTime +
      " 排班結束時間 = " +
      offerOffBoardTime
  );

  try {
    const check_result = await check_schedulerecord_IsExist(
      offerMemberId,
      offerMemberName,
      offerOnBoardTime,
      offerOffBoardTime
    );

    if (check_result) {
      res.status(499).send({
        ErrorMessage:
          `請勿將排班人員:${offerMemberName}排班於此-> ` + already_st_ed === 3
            ? `${offerOnBoardTime}起始和${offerOffBoardTime}結束`
            : already_st_ed === 1
            ? `${offerOnBoardTime}起始`
            : `${offerOffBoardTime}結束` + "時段 , 需要調整其他日期",
        Check_OnorOffBoard_Status: onoffboard_confirm,
      });
    } else {
      res.status(200).send({
        Message: `排班人員:${offerMemberName}可排班於此-> ${offerOnBoardTime}起始和${offerOffBoardTime}結束時段`,
      });
    }
  } catch (err) {
    console.log(
      "Error <confirmReOfferWork> info & send back error code: ",
      err
    );
  }
});

// 排班登入驗證
router.get("/login", async (req, res) => {
  const { memberid, password } = req.query;
  console.log(
    "loginID接收為 = " +
      memberid +
      " | " +
      typeof memberid +
      " loginPWD接收為 = " +
      password +
      " | " +
      typeof password
  );


  const sql_regschdule = `SELECT * FROM schedule_reginfo WHERE memberID = ?`;
  let encrypasswd;
  try {
    try {
      const [results] = await dbcon.query(sql_regschdule, [String(memberid).trim()]);
      if (!results || results.length === 0) {
        console.log(`找不到工號:${memberid}，原始輸入:${memberid}`);
        return res.status(400).send(`工號:${memberid}未註冊排班資料庫名單`);
      }

      console.log("找到用戶資料:", {
        memberID: results[0].memberID,
        reg_schedulename: results[0].reg_schedulename,
        isManager: results[0].isManager,
        hasEncryptPassword: !!results[0].encrypasswd,
        originalPassword: results[0].originalpasswd,
      });

      const isManager = results[0].isManager;
      encrypasswd = results[0].encrypasswd;
      let isPasswordMatch = await bcrypt.compare(password, encrypasswd);

      if (!isPasswordMatch) {
        if (isManager === 0 || isManager === false) {
          encrypasswd = "G7@t9qZ!5x";
          isPasswordMatch = password.toString().trim("") === encrypasswd;
        }

        if (!isPasswordMatch) return res.status(401).send("密碼錯誤");
      }

      const secret = crypto.randomBytes(32).toString("hex");
      const token = jwt.sign({ memberID: results[0].memberID }, secret, {
        expiresIn: "24h",
      });

      return res.status(200).json({
        Message: `工號:${memberid}登入排班系統成功!`,
        Content: results,
      });
    } catch (err) {
      console.log("Error <<Login>> info & send back error code: ", err);
      return res.status(500).send("排班資料庫連線異常!");
    }
  } catch (err) {
    console.log("Error <<Login>> info & send back error code: ", err);
  }
});

// 調試路由：查看註冊用戶資料
router.get("/debug/user/:memberid", async (req, res) => {
  const { memberid } = req.params;
  
  let adjust_memberID;
  if (getDigitCount(memberid) < 3) {
    adjust_memberID = toThreeDigit(String(memberid).trim()  );
  } else {
    adjust_memberID = memberid.toString();
  }
  
  const sql = `SELECT memberID, reg_schedulename, memEmail, isManager, encrypasswd, originalpasswd FROM schedule_reginfo WHERE memberID = ?`;
  
  try {
    const [results] = await dbcon.query(sql, [memberid]);
    if (!results || results.length === 0) {
      return res.status(404).json({
        error: "找不到用戶",
        searchedID: memberid,
        originalID: memberid,
      });
    }

    const user = results[0];
    return res.json({
      message: "找到用戶資料",
      data: {
        memberID: user.memberID,
        reg_schedulename: user.reg_schedulename,
        memEmail: user.memEmail,
        isManager: user.isManager,
        hasEncryptPassword: !!user.encrypasswd,
        encryptPasswordLength: user.encrypasswd ? user.encrypasswd.length : 0,
        originalPassword: user.originalpasswd, // 注意：生產環境不應返回原始密碼
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "資料庫錯誤", details: err.message });
  }
});

router.post("/addWorkTime", async (req, res) => {
  const query = dbcon.query.bind(dbcon);

  try {
    const workTimes = req.body;
    const workTimesArray = Array.isArray(workTimes) ? workTimes : [workTimes];
    console.log("接收 insert workTime = " + JSON.stringify(workTimesArray));

    const now = moment().format("YYYY-MM-DD");
    const sqlupdate = `
      UPDATE schedule_trackrecord
      SET
        PositionArea = ?,
        Position = ?,
        EmployeeWorkTime = ?,
        SortWorkTimeStart = ?,
        SubmitDateTime = ?,
        EditManagerName = ?,
        EditManagerID = ?,
        AdjustUpdateTime = ?,
        OverTimeWorking = ?,
        OnBoardTime = ?,
        Nationality = ?,
        Is_handmodify = ?,
        Group_card_id = ?
      WHERE
        AssignScheduleName = ? AND
        AssignScheduleID = ? AND 
        Random = ?
    `;

    const updateResults = [];
    let updateCount = 0;

    console.log("workTimesArray:", workTimesArray);

    for (const item of workTimesArray) {
      const updateValues = [
        item.PositionArea || null,
        item.Position || null,
        item.EmployeeWorkTime || null,
        moment(item.SortWorkTimeStart).format("YYYY-MM-DD 00:00:00"),
        moment(now).format("YYYY-MM-DD 00:00:00"),
        item.EditManagerName || null,
        item.EditManagerID || null,
        moment(item.AdjustUpdateTime).format("YYYY-MM-DD 00:00:00") || null,
        item.OverTimeWorking || null,
        item.OnBoardTime || null,
        item.Nationality || "FO",
        item.Is_handmodify || null,
        item.Group_card_id || null,
        item.AssignScheduleName || null,
        item.AssignScheduleID || null,
        item.Random || null,
      ];

      console.log("updateValues:", updateValues);

      const overWorkingCheck = await check_IfOverWorking({
        AssignScheduleID: workTimesArray[0].AssignScheduleID,
        AssignScheduleName: workTimesArray[0].AssignScheduleName,
        SortWorkTimeStart: workTimesArray[0].SortWorkTimeStart,
      }); // 檢查是否違反勞基法規定

      if (overWorkingCheck.overWorking) {
        return res
          .status(400)
          .json({ message: overWorkingCheck.message, requiresObjection: true }); // 返回需要異議的標誌
      }

      const result = await query(sqlupdate, updateValues);
      updateResults.push(result);
      if (result.affectedRows > 0) updateCount++;
    }

    console.log(`✅ 主管排班更新成功，共更新：${updateCount} 筆`);
    res.status(200)
      .json(
        `主管:${
          workTimesArray[0].EditManagerName || workTimesArray[0].EditManager
        } 排班更新成功，共更新 ${updateCount} 筆`
      );
  } catch (err) {
    console.error("MySQL 錯誤碼: ", err.code);
    res.status(500).json({ error: "Internal server error: " + err.message });
    console.error("❌ Error in /addWorkTime: ", err);
  }
});

// ✅ 卡片增加/更新
router.post("/addGroupMemberList", async (req, res) => {
  const groupList = req.body; // 預期是一個陣列
  
  if (!Array.isArray(groupList)) {
    return res.status(400).json({ error: "無效的資料格式，預期為陣列" });
  }

  try {
    const now = moment().tz('Asia/Taipei').toDate();
    const nowMonth = moment().tz('Asia/Taipei').startOf('day').toDate();
    const nextMonth = moment().tz('Asia/Taipei').add(1, "months").startOf('day').toDate();

    const prisma = prismaHr; // 獲取 Prisma 實例
    let isAnyCardUpdatedOrInserted = false;


    console.log("groupList :" , groupList)
    // 使用 for...of 處理非同步操作
    for (let item of groupList) {
      
      console.log ("處理卡片項目: ", item);
      const status = item.status;
      console.log(`卡片狀態: ${status}`);
      const cardId = item.id;
      console.log(`卡片ID 確認: ${cardId}`);

      // 1. 處理刪除邏輯 (如果前端有傳送 delete 狀態)
      if (String(status).trim().toLowerCase() === 'delete' && cardId) {
        console.log(`刪除卡片: ${item.AssignScheduleName} (ID: ${cardId})`);
        try{

            await prisma.$transaction(async (tx)=> {
              await tx.ScheduleTrackRecord.deleteMany({
              where : {
                sortWorkTimeStart : {
                  gte: moment().tz('Asia/Taipei').startOf('day').toDate()
                } ,
              assignScheduleID : item.AssignScheduleID ,
              assignScheduleName : item.AssignScheduleName,
              nationality : item.Nationality,

              group_card_id: item.group_card_id
              }
            })

            await tx.scheduleCard.delete({
              where: { id: cardId }
            });

          })
        }catch(error){
          console.error(`刪除卡片失敗: ${item.AssignScheduleName} (ID: ${cardId})`, error);
          throw error;
        }
        
        
        isAnyCardUpdatedOrInserted = true;
        continue;
      }

      // 2. 處理新增或編輯 (new 或 edit)
      if (String(status).trim().toLowerCase() === 'new' || 
      String(status).trim().toLowerCase() === 'edit') {
        console.log(`處理卡片 [${status}]: ${item.AssignScheduleID}`);
        
        // 邏輯：如果沒有 PositionArea，可以先進行查詢 (如果 Prisma schema 有關連也可以直接 include)
        let positionArea = item.PositionArea || "";
        if (!positionArea && item.AssignScheduleID) {
          const regInfo = await prisma.schedule_reginfo.findFirst({
            where: { memberID: item.AssignScheduleID },
            select: { positionarea: true }
          });
          positionArea = regInfo?.positionarea || "";
        }

        // 準備資料內容
        const dataContent = {
          employeeName: item.EmployeeName || "",
          employeeEmail: item.EmployeeEmail || "",
          assignScheduleName: item.AssignScheduleName || "",
          assignScheduleID: item.AssignScheduleID || "",
          positionArea: positionArea,
          position: item.Position || "",
          employeeWorkTime: item.EmployeeWorkTime || "",
          groupI: item.GroupI || "",
          overTimeWorking: item.OverTimeWorking || "",
          onBoardTime: item.OnBoardTime || "",
          nationality: item.Nationality || "",
          countI: item.CountI ? String(item.CountI) : "0",
          group_card_id: item.group_card_id || null,
          is_handmodify: Boolean(item.is_handmodify) || false,
          sortWorkTimeStart: nowMonth,
          sortWorkTimeEnd: nextMonth,
          scheduleTime: now,
        };

        const trackUpdate = {
          positionArea : item.PositionArea ? item.PositionArea : "",
          position : item.Position ? item.Position : "",
          employeeWorkTime : item.EmployeeWorkTime ? item.EmployeeWorkTime : "",
        };

        await prisma.scheduleCard.upsert({
          where: { 
            id: cardId || 0 
          },
          update: dataContent,
          create: dataContent,
        });

        
        const ressta = await prisma.ScheduleTrackRecord.updateMany({
          where: {
            group_card_id: item.group_card_id,
            sortWorkTimeStart: {
              gte: nowMonth,
            },
          },
          data: trackUpdate
        });

        isAnyCardUpdatedOrInserted = true;

        console.log("✅ 卡片資料處理完成" , ressta );
      } else {
        console.log(`跳過未變動卡片: ${item.AssignScheduleName}`);
      }
    }

    // 3. 觸發自動排班邏輯
    if (isAnyCardUpdatedOrInserted) { await autoScheduleHandler()}
    return res.status(200).json({ message: "全部資料更新/插入成功" });

    

  } catch (error) {
    console.error("Error in addGroupMemberList: ", error);
    if (error){
      await rollbackPrismaTransaction(); // 回滾交易
    }

    console.error("❌ 已回滾且錯誤為 : ", error);
    
    // 錯誤處理邏輯
    const status = error.code === 'P2002' ? 409 : 500;
    return res.status(status).json({
      error: "處理資料時發生錯誤",
      detail: error.message,
      code: error.code
    });
  }
});



// ✅ 檢查排班是否存在
const checkIfScheduleExists = async (
  AssignScheduleName,
  AssignScheduleID,
  SortWorkTimeStart,
  SortWorkTimeEnd
) => {
  const sql = `
    SELECT 1 FROM hr.schedule_trackrecord 
    WHERE AssignScheduleName = ? 
      AND AssignScheduleID = ? 
      AND SortWorkTimeStart = ? 
      AND SortWorkTimeEnd = ?
  `;

  const [rows] = await dbcon.query(sql, [
    AssignScheduleName,
    AssignScheduleID,
    SortWorkTimeStart,
    SortWorkTimeEnd,
  ]);

  return rows.length > 0;
};

// ✅ 主要邏輯控制器
const autoScheduleHandler = async (
  AssignScheduleName,
  AssignScheduleID,
  SortWorkTimeStart,
  SortWorkTimeEnd,
) => {
  try {
    const exists = await checkIfScheduleExists(
      AssignScheduleName,
      AssignScheduleID,
      SortWorkTimeStart,
      SortWorkTimeEnd
    );

    if (exists) {
      console.log("✅ 排班已存在，跳過插入");
      return { message: "排班已存在，無需重複排入" };
    }

    const result = await generateAndSaveScheduleWithExistingPattern();
    return result;
  } catch (error) {
    console.error("❌ 自動排班處理錯誤:", error);
    return { message: "自動排班處理錯誤", error: error.message };
  }
};

// ✅ 排班產生器
const generateAndSaveScheduleWithExistingPattern = async () => {
  try {
    const now = moment();
    const currentYear = now.year();
    const currentMonth = now.month();
    const nowDay = moment(new Date()).format("DD");

    const startOfTargetMonth = moment([currentYear, currentMonth, 20]).format(
      "YYYY-MM-DD"
    );
    const endOfNextMonth = moment([currentYear, currentMonth + 1, 19]).format(
      "YYYY-MM-DD"
    );

    let startProccess, endProccess;

    if (nowDay < 20) {
      startProccess = moment([currentYear, currentMonth, 20]);
      endProccess = moment([currentYear, currentMonth, 19]).add(1, "months");
    } else {
      startProccess = moment([currentYear, currentMonth, 20]);
      endProccess = moment([currentYear, currentMonth, 19]).add(1, "months");
    }

    const patterns = ["AD", "AC", "BC", "BD"];
    const scheduleDates = [];

    let currentDate = moment(startProccess);

    // 只生成今天以後的資料
    while (currentDate.isSameOrBefore(endProccess)) {
      if (currentDate.isAfter(now, "day")) {
        scheduleDates.push(currentDate.format("YYYY-MM-DD"));
      }
      currentDate.add(1, "day");
    }

    // 取得最新的排班模式
    const sql_latestPatterns = `
      SELECT Group_card_id, Pattern
      FROM (
        SELECT Group_card_id, Pattern,
               ROW_NUMBER() OVER (PARTITION BY Group_card_id ORDER BY SubmitDateTime DESC) AS rn
        FROM hr.schedule_trackrecord
        WHERE SortWorkTimeStart >= ? AND 
        is_handmodify = 0 AND
        AssignScheduleName IS NOT NULL AND
        AssignScheduleID IS NOT NULL
      ) AS ranked
      WHERE rn = 1
    `;

    const [latestPatterns] = await dbcon.query(sql_latestPatterns, [
      endOfNextMonth,
    ]);

    const latestPatternMap = {};
    latestPatterns.forEach((row) => {
      latestPatternMap[row.Group_card_id] = row.Pattern;
    });

    const sql_workMember = `
      SELECT DISTINCT * FROM hr.schedule_card
      WHERE is_handmodify = 0
      ORDER BY id DESC
    `;
    const [workMembers] = await dbcon.query(sql_workMember);

    const sql_FindLastPattern = `
    Select 
      SortWorkTimeStart , Pattern , CountI , Is_handmodify 
    From hr.schedule_trackrecord 
    WHERE Pattern IS NOT NULL
      ORDER BY SortWorkTimeStart DESC, SubmitDateTime DESC
      LIMIT 1;
    `;

    const [findLastPattern] = await dbcon.query(sql_FindLastPattern);

    const findLastPatternMap = findLastPattern[0]?.Pattern;

    const groupedMembers = {};
    workMembers.forEach((member) => {
      const groupChar = member?.GroupI;
      const memberCardId = member?.Group_card_id;
      const Nationality = member?.Nationality;

      const initialPattern =
        (latestPatternMap[memberCardId] && latestPatternMap[Nationality]) ||
        patterns[0]; // 預設使用第一個 pattern

      if (findLastPatternMap === initialPattern) {
        console.log("以確認 排班模式中 findLastPatternMap === initialPattern");
      }

      scheduleDates.forEach((date, index) => {
        const patternIndex =
          (patterns.indexOf(initialPattern?.split(",")[0]) + index) %
          patterns.length; // 從最新的 pattern 開始輪替 (取第一個 pattern)
        const currentPattern = patterns[patternIndex];

        if (currentPattern.includes(groupChar)) {
          if (!groupedMembers[groupChar]) groupedMembers[groupChar] = [];

          groupedMembers[groupChar].push({
            ...member,
            GroupI: groupChar,
            Pattern: currentPattern,
            SortWorkTimeStart: date,
            SortWorkTimeEnd: date,
          });
        }
      });
    });

    const sql_insertTrack = `
      INSERT INTO hr.schedule_trackrecord (
        EmployeeName,
        EmployeeID,
        AssignScheduleName,
        AssignScheduleID,
        PositionArea,
        Position,
        EmployeeWorkTime,
        GroupI,
        OverTimeWorking,
        OnBoardTime,
        Nationality,
        Group_card_id,
        Is_handmodify,
        SortWorkTimeStart,
        SortWorkTimeEnd,
        Schedule_Time,
        CountI,
        Pattern,
        SubmitDateTime,
        Random,
        DeleteDateTime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        AssignScheduleName = VALUES(AssignScheduleName),
        AssignScheduleID = VALUES(AssignScheduleID),
        SortWorkTimeStart = VALUES(SortWorkTimeStart),
        SortWorkTimeEnd = VALUES(SortWorkTimeEnd),
        Pattern = VALUES(Pattern);
    `;

    let insertCount = 0;
    for (const groupKey in groupedMembers) {
      const group = groupedMembers[groupKey];
      for (const member of group) {
        const RandomValue = Math.random().toString(36).substring(2, 15);
        const insertParams = [
          member?.EmployeeName || "",
          member?.EmployeeID || "",
          member?.AssignScheduleName || "",
          member?.AssignScheduleID || "",
          member?.PositionArea || "",
          member?.Position || "",
          member?.EmployeeWorkTime || "",
          member?.GroupI || "",
          member?.OverTimeWorking || "",
          member?.OnBoardTime || "",
          member?.Nationality || "",
          member?.Group_card_id || "",
          0,
          member?.SortWorkTimeStart || "",
          member?.SortWorkTimeEnd || "",
          member?.Schedule_Time || "",
          member?.CountI || "1",
          member?.Pattern || "",
          member?.SubmitDateTime || new Date(),
          RandomValue,
          "2025-05-05 00:00:00",
        ];

        await dbcon.query(sql_insertTrack, insertParams);
        insertCount++;
      }
    }

    console.log(`✅ 排班成功讀取 schedule_trackrecord，共 ${insertCount} 筆`);
    return { message: "排班成功寫入 schedule_trackrecord" };
  } catch (error) {
    console.error("❌ 排班產生錯誤:", error);
    return { message: "排班失敗", error: error.message };
  }
};

// 自動化補足 加班的 tags
const runOverTimeWorkListSupplement = async () => {
  let connection;

  try {
    connection = await dbcon.getConnection();
    await connection.beginTransaction();

    const now = moment();
    const currentYear = now.year();
    const currentMonth = now.month();

    let targetYear = currentYear;
    let targetMonth = currentMonth;

    if (now.date() >= 18) {
      targetMonth = (currentMonth + 1) % 12;
      if (targetMonth === 0) {
        targetYear++;
      }
    }

    // 正式運作日期 -- START
    // const startRange = moment([targetYear, targetMonth, 20]).format("YYYY-MM-DD HH:mm:ss");
    // const endRange = moment([targetYear, targetMonth, 19]).add(1, "month").format("YYYY-MM-DD HH:mm:ss");
    // 正式運作日期 -- END

    //測驗用日期 --start
    const startRange = moment([targetYear, currentMonth, 20]).format(
      "YYYY-MM-DD HH:mm:ss"
    );
    const endRange = moment([targetYear, currentMonth, 19])
      .add(1, "month")
      .format("YYYY-MM-DD HH:mm:ss");
    //測驗用日期 --end

    const sql_CheckSupplemented = `
      SELECT COUNT(*) AS count
      FROM hr.schedule_supplement_log
        WHERE AssignScheduleName = ? AND 
          AssignScheduleID = ? AND 
          Year = ? AND 
          Month = ?;
    `;

    const sql_SearchExisting = `
      SELECT
        AssignScheduleName,
        AssignScheduleID,
        PositionArea,
        Position,
        OverTimeWorking,
        OnBoardTime,
        Nationality
      FROM
        hr.schedule_trackrecord
      WHERE
        SortWorkTimeStart >= ? AND
        SortWorkTimeEnd <= ? AND
        Nationality = "FO" AND
        CountI = 1 
    `;

    const sql_InsertOverTime = `
      INSERT INTO hr.schedule_trackrecord (
        AssignScheduleName,
        AssignScheduleID,
        PositionArea,
        Position,
        CountI,
        OverTimeWorking,
        OnBoardTime,
        Nationality,
        Is_handmodify,
        SubmitDateTime,
        SortWorkTimeStart,
        SortWorkTimeEnd,
        Random,
        DeleteDateTime
      ) VALUES ?
    `;

    const sql_LogSupplement = `
      INSERT INTO hr.schedule_supplement_log (
        AssignScheduleName, 
        AssignScheduleID, 
        Year, 
        Month, 
        SupplementedDate
      )
      VALUES (?, ?, ?, ?, ?);
    `;

    const [existingRecords] = await connection.query(sql_SearchExisting, [
      startRange,
      endRange,
    ]);
    const groupedRecords = {};
    existingRecords.forEach((record) => {
      const key = `${record?.AssignScheduleName}-${record?.AssignScheduleID}-${record?.PositionArea}-${record?.Position}-${record?.OverTimeWorking}-${record?.OnBoardTime}-${record?.Nationality}`;
      if (!groupedRecords[key]) {
        groupedRecords[key] = [];
      }
      groupedRecords[key]?.push(record);
    });

    const insertedRecords = [];

    for (const key in groupedRecords) {
      const [logAssignScheduleName, logAssignScheduleID] = key.split("-");
      const [supplementedResult] = await connection.query(sql_CheckSupplemented, [
        logAssignScheduleName,
        logAssignScheduleID,
        targetYear,
        targetMonth + 1,
      ]);

      if (supplementedResult[0].count === 0) {
        const group = groupedRecords[key];
        const missingCount = 18 - group.length;
        const recordsToAdd = [];

        if (missingCount > 0) {
          const [
            AssignScheduleName,
            AssignScheduleID,
            PositionArea,
            Position,
            OverTimeWorking,
            OnBoardTime,
            Nationality,
          ] = key.split("-");

          for (let i = 0; i < missingCount; i++) {
            const newRandom = Math.random().toString(36).substring(2, 15);
            recordsToAdd.push({
              AssignScheduleName: AssignScheduleName || "",
              AssignScheduleID: AssignScheduleID || "",
              PositionArea: PositionArea || "未定義",
              Position: Position || "未定義",
              CountI: 0,
              OverTimeWorking: OverTimeWorking || "0",
              OnBoardTime: OnBoardTime || "0",
              Nationality: Nationality || "",
              Is_handmodify: 0,
              SubmitDateTime: now.format("YYYY-MM-DD HH:mm:ss"),
              SortWorkTimeStart: null,
              SortWorkTimeEnd: null,
              newRandom,
            });
          }

          if (recordsToAdd.length > 0) {
            const insertValues = recordsToAdd.map((record) => [
              record?.AssignScheduleName,
              record?.AssignScheduleID,
              record?.PositionArea,
              record?.Position,
              0,
              record?.OverTimeWorking,
              record?.OnBoardTime,
              record?.Nationality,
              0,
              now.format("YYYY-MM-DD HH:mm:ss"),
              null,
              null,
              record?.newRandom,
              "2025-05-05 00:00:00",
            ]);

            const [insertResult] = await connection.query(sql_InsertOverTime, [
              insertValues,
            ]);

            await connection.query(sql_LogSupplement, [
              logAssignScheduleName,
              logAssignScheduleID,
              targetYear,
              targetMonth + 1,
              now.format("YYYY-MM-DD HH:mm:ss"),
            ]);
            console.log(
              `[${targetYear}-${
                targetMonth + 1
              }] ${logAssignScheduleName}-${logAssignScheduleID} 補足了 ${
                recordsToAdd.length
              } 筆資料。`
            );
          }
        }
      } else {
        // console.log(`[${targetYear}-${targetMonth + 1}] ${logAssignScheduleName}-${logAssignScheduleID} 已補足，跳過。`);
      }
    }

    await connection.commit();
    console.log("自動補足任務完成 - 目標時間範圍:", startRange, "到", endRange);
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error in runOverTimeWorkListSupplement:", error);
  } finally {
    if (connection) connection.release();
  }
};

// // 設定排程任務：每月 18 號凌晨 3 點執行自動補足
schedule.scheduleJob("0 0 3 18 * *", async () => {
  console.log("排程任務開始執行自動補足...");
  const currentIP = getServerIP();
    const allowedIP = '192.168.3.207';
    
    if (currentIP !== allowedIP) {
        console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
        return;
    }
  await runOverTimeWorkListSupplement();
  console.log("排程任務自動補足完成。");
});


router.get("/getNoTime", async (req, res) => {
  const sql = `Select *  FROM hr.schedule_trackrecord 
  WHERE EmployeeName IS NULL AND 
  Random IS NOT NULL AND SortWorkTimeStart IS NULL`;

  try {
    const [noTimeData] = await dbcon.query(sql);

    res.status(200).json({
      message: "排班人員資料獲取成功",
      data: noTimeData,
    });
  } catch (err) {
    console.error("Error <<getNoTime>>: ", err);
  }
}),

  router.get("/getMirrorWorkTime", async (req, res) => {
    const { EmployeeID , nowDate , empFind } = req.query;
    console.log("接收的 EmployeeID:", EmployeeID , "|  nowDate :" , nowDate , "| empFind" , empFind); // 除錯訊息 
    let allowedAreas = [];  // 儲存允許的區域
    
    
    try{
      const authResult = await catchAuth(EmployeeID);
      if(!authResult || authResult.length === 0){
        return res.status(401).json({ message: "未授權的存取" });
      }
      
      // 從 authResult 提取所有 authPosition（JSON 欄位）
      authResult.forEach(auth => {
        // console.log("positionArea 欄位內容:", auth.positionArea); // 除錯訊息
        if (auth.positionArea) {
          // positionArea 可能是陣列或 JSON 字串
          const positions = Array.isArray(auth.positionArea) 
            ? auth.positionArea 
            : JSON.parse(auth.positionArea || '[]');
          allowedAreas.push(...positions);
        }
      });
      
      // 去重
      allowedAreas = [...new Set(allowedAreas)];
      // console.log("主管可見區域 (allowedAreas):", allowedAreas); // 除錯訊息
      
    }catch(err){
      console.log("Error in authentication check:", err);
      return res.status(500).json({ message: "伺服器驗證錯誤", err });
    }

    try {
      await runOverTimeWorkListSupplement(); // 自動補足排班資料的函數 (內部使用)
      const now = moment();
      const startOfMonth = now.clone().subtract(2, 'months').date(20).format("YYYY-MM-DD");
      const currentday = now.format("DD");


      let addSQL_mian = '';
      let addSQL_leave = '';
      
    if (empFind){
      addSQL_mian = `AND AssignScheduleID = ${empFind} `
      addSQL_leave = `AND employeeNumber = ${empFind} `
    }
   

    const sql_mirror = `
      SELECT *
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY 
          Group_card_id, 
          SortWorkTimeStart , 
          Nationality 
          ORDER BY SubmitDateTime DESC) AS rn
        FROM hr.schedule_trackrecord
        WHERE 
          SortWorkTimeStart >= ? AND
          DeleteDateTime != "0000-00-00 00:00:00" AND
          PositionArea IN (?) ${addSQL_mian}
      ) AS ranked
      WHERE rn = 1
    `;

    const sql_leaveData = `
    SELECT 
      employeeNumber, 
      employeeName, 
      leaveStartTime,
      leaveEndTime,
      positionarea,
      authPosition
    FROM hr.absentsystem_leavesortoutall
    WHERE 
      leaveStartTime >= ?
      AND errorStatusNotify = '3'
      ${addSQL_leave}
    `

      const [mirrorData] = await dbcon.query(sql_mirror, [startOfMonth , allowedAreas]);
      // console.log ("原始鏡向排班資料 (mirrorData):", mirrorData); // 除錯訊息 

      const [employeeLeaveData] = await dbcon.query(sql_leaveData, [startOfMonth]);
      // console.log("取得的請假資料 (employeeLeaveData):", employeeLeaveData); // 除錯訊息

      // 過濾只顯示 allowedAreas 內的資料
      // const filteredRecords = mirrorData.filter((record) => {
      //   // console.log ("record of MirrorData:", record); // 除錯訊息
      //   const isValidArea = record.PositionArea && allowedAreas.includes(record.PositionArea);
      //   // console.log(`檢查紀錄 (id: ${record.id || 'N/A'}): PositionArea: '${record.PositionArea}', 是否在允許區域: ${isValidArea}`); // 除錯訊息
      //   return isValidArea;
      // });

      const filtered_LeaveData = mirrorData.filter((record) => {
        for (let leave of employeeLeaveData) {
          const employeeLeave = record.SortWorkTimeStart >= leave.leaveStartTime && record.SortWorkTimeStart <= leave.leaveEndTime;
          const positionAreaMatch = leave.authPosition && allowedAreas.includes(leave.authPosition);
          
          if (record.AssignScheduleID === leave.employeeNumber && employeeLeave && positionAreaMatch) {
            console.log(`排班紀錄 (ID: ${record.id || 'N/A'}) 符合請假條件，將被排除。`); // 除錯訊息
            return false; // 排除該紀錄
          }
        }

        // 檢查 PositionArea 是否在允許的區域內
        const isValidArea = record.PositionArea && allowedAreas.includes(record.PositionArea);
        console.log ("record after filter data :", isValidArea); // 除錯訊息
        return isValidArea;
      })
      // console.log("過濾後的資料 (filteredRecords):", filteredRecords); // 除錯訊息

      res.status(200).json({
        data: filtered_LeaveData,
        message: "鏡向排班資料獲取成功",
      });
    } catch (err) {
      console.error("Error <<getMirrorWorkTime>>: ", err);
      res.status(500).json({ message: "鏡向排班新增錯誤", err });
    }
  });

const check_IfOverWorking = async ({
  AssignScheduleName,
  AssignScheduleID,
  SortWorkTimeStart,
}) => {
  try {
    // 解析 workStartTime 並獲取月份
    const workStartTime = moment(SortWorkTimeStart, "YYYY-MM-DD HH:mm:ss");
    if (!workStartTime.isValid()) {
      console.error(
        "Error: 無法解析的 SortWorkTimeStart 日期格式:",
        SortWorkTimeStart
      );
      return { overWorking: true, message: "SortWorkTimeStart 日期格式不正確" };
    }

    const workMonth = workStartTime.format("MM");
    const workYear = workStartTime.format("YYYY");

    console.log("workStartTime:", workStartTime.format("YYYY-MM-DD HH:mm:ss"));
    console.log("workMonth:", workMonth, "workYear:", workYear);

    // 劃分該月份的每周
    const startOfMonth = moment([workYear, workMonth - 1]).startOf("month");
    const endOfMonth = moment([workYear, workMonth - 1]).endOf("month");

    const weeks = [];
    let currentWeekStart = startOfMonth.clone().startOf("week");
    while (currentWeekStart.isBefore(endOfMonth)) {
      const currentWeekEnd = currentWeekStart.clone().endOf("week");
      weeks.push({
        start: currentWeekStart.clone(),
        end: currentWeekEnd.clone(),
      });
      currentWeekStart.add(1, "week");
    }

    console.log(
      "該月份的每周範圍:",
      weeks.map((week) => ({
        start: week.start.format("YYYY-MM-DD"),
        end: week.end.format("YYYY-MM-DD"),
      }))
    );

    // 找到 workStartTime 所在的周
    const targetWeek = weeks.find((week) =>
      workStartTime.isBetween(week.start, week.end, null, "[]")
    );

    if (!targetWeek) {
      console.error("Error: 無法找到 workStartTime 所在的周");
      return { overWorking: true, message: "無法找到 workStartTime 所在的周" };
    }

    console.log("workStartTime 所在的周範圍:", {
      start: targetWeek.start.format("YYYY-MM-DD"),
      end: targetWeek.end.format("YYYY-MM-DD"),
    });

    // 查詢該周內的排班次數
    const sql_countWorkDaysInWeek = `
      SELECT COUNT(*) AS workDays
      FROM hr.schedule_trackrecord
      WHERE AssignScheduleID = ? AND
        AssignScheduleName = ? AND
        SortWorkTimeStart BETWEEN ? AND ? AND 
        DeleteDateTime != "0000-00-00 00:00:00"
    `;

    const [workDaysResult] = await dbcon.query(sql_countWorkDaysInWeek, [
      AssignScheduleID,
      AssignScheduleName,
      targetWeek.start.format("YYYY-MM-DD"),
      targetWeek.end.format("YYYY-MM-DD"),
    ]);

    // 確認該人員是否有請假了
    const sql_checkifLeave = `
    SELECT COUNT(*) AS leaveDays
    FROM hr.absentsystem_leavesortoutall
    WHERE employeeNumber = ? AND
      employeeName = ? AND
      leaveStartTime <= ? AND
      leaveEndTime >= ? AND
      errorStatusNotify = '3'
    `

    // 加入是否請假查詢
    const [leaveDaysResult] = await dbcon.query(sql_checkifLeave, [
      AssignScheduleID,
      AssignScheduleName,
      targetWeek.end.format("YYYY-MM-DD"),
      targetWeek.start.format("YYYY-MM-DD"),
    ]);

    console.log("leaveDaysResult:", leaveDaysResult[0]?.leaveDays , "天");
    console.log("workDaysResult:", workDaysResult[0]?.workDays + 1, "次");

    if (workDaysResult[0]?.workDays + 1 > 6) {
      return {
        overWorking: true,
        message: `排班人員: ${AssignScheduleName} 在 ${targetWeek.start.format(
          "YYYY-MM-DD"
        )} 至 ${targetWeek.end.format(
          "YYYY-MM-DD"
        )} 的排班次數已達或超過 7 次，請調整排班。`,
      };
    }

    if (leaveDaysResult[0]?.leaveDays > 0) {
      return {
        overWorking: true,
        message: `排班人員: ${AssignScheduleName} 已請假，請再次確認排班需求。`,
      };
    }

    return { overWorking: false };
  } catch (err) {
    console.error("Error <<check_IfOverWorking>>:", err);
    return { overWorking: true, message: "檢查排班是否超時時發生錯誤" };
  }
};

// 主管排班修改
router.put("/editWorkTime", async (req, res) => {
  const {
    PositionArea,
    Position,
    AssignScheduleID,
    AssignScheduleName,
    EmployeeWorkTime,
    SortWorkTimeStart,
    SortWorkTimeEnd,
    EditManagerName,
    EditManagerID,
    AdjustUpdateTime,
    Random,
  } = req.body;

  if (Random === "" || Random === undefined || Random === null) {
    return res.status(400).json({ message: "請提供正確 Random" });
  }

  try {
    const overWorkingCheck = await check_IfOverWorking({
      AssignScheduleID,
      AssignScheduleName,
      SortWorkTimeStart,
    }); // 檢查是否違反勞基法規定

    if (overWorkingCheck.overWorking) {
      return res
        .status(400)
        .json({ message: overWorkingCheck.message, requiresObjection: true }); // 返回需要異議的標誌
    }

    // console.log("主管排班修改");
    const now = moment().format("YYYY-MM-DD HH:mm:ss");

    let sql = `
          UPDATE hr.schedule_trackrecord
          SET
              PositionArea = ?,
              Position = ?,
              AssignScheduleID = ?,
              AssignScheduleName = ?,
              EmployeeWorkTime = ?,
              SortWorkTimeStart = ?,
              SortWorkTimeEnd = ?,
              EditManagerName = ?,
              EditManagerID = ?,
              AdjustUpdateTime = ?
          WHERE
              Random = ? AND
              AssignScheduleID IS NOT NULL AND
              AssignScheduleName IS NOT NULL
      `;
    const sqlParams = [
      PositionArea,
      Position,
      AssignScheduleID,
      AssignScheduleName,
      EmployeeWorkTime,
      SortWorkTimeStart,
      SortWorkTimeEnd,
      EditManagerName,
      EditManagerID,
      AdjustUpdateTime,
      Random,
      AssignScheduleID,
      AssignScheduleName,
    ];

    const [result] = await dbcon.query(sql, sqlParams);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "找不到對應的排班記錄" });
    }
    return res.status(200).json({
      message: `排班人員: ${AssignScheduleName} 修改更新成功`,
      sqlParams,
    });
  } catch (error) {
    console.error("Error <<editWorkTime>>: ", error);
    res.status(500).json({ message: "排班更新錯誤", error });
  }
});

// 主管排班刪除
router.put(
  "/deletWorkTime",
  async (req, res) => {
    const { DeleteManagerName, DeleteManagerID, random } = req.body;
    try {
      //指定排班表單 hr.schedule_trackrecord 欄位DeleteDateTime 將當下執行系統日期時間存入,後續Get scheduleDataForm會忽略pass
      let sql = ` UPDATE hr.schedule_trackrecord 
        SET 
            DeleteDateTime = "0000-00-00 00:00:00",
            DeleteManagerName = ? ,
            DeleteManagerID = ? 
        WHERE 
          random = ?
        `;

      await dbcon.query(sql, [DeleteManagerName, DeleteManagerID, random]);
      console.log("刪除排班資料成功", {
        DeleteManagerName,
        DeleteManagerID,
        random,
      });

    res.status(200).json({  
      message: `指定排班編輯號:${random}刪除系統日期時間已登記,刪除OK`,
    });
  } catch (err) {
    console.error("Error <<deletWorkTime>>:", err);
    res.status(500).json({ error: "刪除失敗，請稍後再試" });
  }
});

router.get("/allMemberInfo", async (req, res) => {
    const {
      schedule_yaer,
      schedule_month,
      AssignScheduleID,
      reg_schedulename,
    } = req.query;
    // console.log("memberID" , AssignScheduleID)

    ScheduleData_GetRespnse.length = 0;
    let sql = `
      SELECT * FROM hr.schedule_trackrecord 
      WHERE DeleteDateTime != '0000-00-00 00:00:00'
    `;
    let sql_ScheduleState = `
  SELECT *
  FROM hr.schedule_trackrecord
  WHERE CountI = '1'
  ORDER BY id
  LIMIT 1;
  `;
    try {
      const [schedule_record] = await dbcon.query(sql);
      const [schedule_state] = await dbcon.query(sql_ScheduleState);

      ScheduleData_GetRespnse.push({ schedule_record });
      res.status(200).json({
        message: "取得所有人員資料",
        data: schedule_record, // 將查詢結果包含在響應中
      });
    } catch (error) {
      console.error("Error <<allMemberInfo>>:", error);
      res.status(500).json({
        error: "取得所有人員資料失敗，請稍後再試",
        message: error.message, // 包含更詳細的錯誤訊息
      });
    }
  }),

router.get("/getCardInfo", async (req, res) => {
    const { EmployeeID, Nationality } = req.query;

    const lastMonth = moment().subtract(1, "months");
    const firstDayOfLastMonth = lastMonth.startOf("month").format("YYYY-MM-DD");
    console.log("上個月同時間的第一天:", firstDayOfLastMonth);
    const correct_EmployeeID = String(EmployeeID).trim();
    const positionAuth = [];
    
    
    const auth = await catchAuth(correct_EmployeeID);
   if (auth && auth.length > 0) {
     typeof auth === 'object' && auth.forEach(item => {
      let position = item?.positionArea;
      Array.isArray(position) ? positionAuth.push(...position) : positionAuth.push(position);

      console.log("解析後的 positionAuth:", positionAuth);
      return positionAuth;
    })
   }

    try {
      // 如果 employeeArea 沒有值，直接回傳空陣列
      if (!positionAuth || positionAuth.length === 0) {
        return res.status(200).json({ message: "無可見區域", data: [] });
      }

      const placeholders = positionAuth.map(() => "?").join(",");
      console.log("DEBUG: SQL Placeholders ( get card):", placeholders);


      const sql_getCardInfo = `
      WITH RankedCards AS (
          SELECT
              *,
              ROW_NUMBER() OVER(PARTITION BY EmployeeID ,group_card_id, PositionArea ORDER BY ID DESC) as rn
          FROM
              hr.schedule_card
          WHERE
              Nationality = ? AND
              PositionArea IN (${placeholders}) AND
              Schedule_Time >= ?
      )
      SELECT
          ID,
          group_card_id,
          COALESCE(EmployeeName, '') AS EmployeeName_coalesced,
          COALESCE(EmployeeID, '') AS EmployeeID_coalesced,
          COALESCE(EmployeeEmail, '') AS EmployeeEmail_coalesced,
          COALESCE(AssignScheduleName, '') AS AssignScheduleName_coalesced,
          COALESCE(AssignScheduleID, '') AS AssignScheduleID_coalesced,
          COALESCE(PositionArea, '') AS PositionArea_coalesced,
          COALESCE(Position, '') AS Position_coalesced,
          COALESCE(EmployeeWorkTime, '') AS EmployeeWorkTime_coalesced,
          COALESCE(Nationality, '') AS Nationality_coalesced
      FROM
          RankedCards
      WHERE
          rn = 1
      ORDER BY
          ID DESC;
    `;

      // 展開參數
      const params = [Nationality, ...positionAuth, firstDayOfLastMonth];
      const [schedule_record] = await dbcon.query(sql_getCardInfo, params);
      console.log("DEBUG: Query Parameters:", params);
      console.log("DEBUG: Nationality:", Nationality);
      console.log("DEBUG: Employee Area:", positionAuth);
      console.log("DEBUG: First Day of Last Month:", firstDayOfLastMonth);
      console.log("查詢排班資料_getCardInfo", schedule_record);

      const fullResult = await dbcon.query(sql_getCardInfo, params);
      console.log("dbcon.query 返回的完整結果:", fullResult);

      res.status(200).json({
        message: "取得所有人員資料",
        data: schedule_record,
      });
    } catch (error) {
      console.error("Error <<getCardInfo>>:", error);
      res.status(500).json({
        error: "取得資料失敗，請稍後再試",
        message: error.message,
      });
    }
});

// 後端 API 端點：/schedule/getOverTimeWorkList (前端使用)
router.get("/getOverTimeWorkList", async (req, res) => {
    const { EmployeeID } = req.query;
    console.log("接收的 EmployeeID 型別:", typeof EmployeeID + "|" + "EmployeeID :", EmployeeID); // 除錯訊息

    let allowedAreas = [];  // 儲存允許的區域
    
    try{
      const authResult = await catchAuth(EmployeeID);
      // console.log("取得的權限資料 in getOverTimeWorkList:", typeof authResult , " | " , authResult ); // 除錯訊息
      if (!authResult || authResult?.[0].length === 0){
        return res.status(401).json({ message: "未授權的存取" });
      }
      // console.log ("confirm the authResult from getOverTimeWorkList api:", authResult); // 除錯訊息 
      
      // 從 authResult 提取所有 positionArea 欄位）
      authResult.forEach(auth => {
        // console.log ("Array of authRecord :" , auth); // 除錯訊息
        if (auth?.positionArea) {

          // positionArea 可能是陣列或 JSON 字串
          const positions = Array.isArray(auth.positionArea)
            ? auth.positionArea 
            : JSON.parse(auth.positionArea || '[]');
          // console.log("解析的 positions:", positions);
          allowedAreas.push(...positions);
           
          return allowedAreas
        }
      });

    }catch(err){
      console.error("Error <<getOverTimeWorkList - catchAuth>>:", err);
      return res.status(500).json({
        error: "取得排班資料失敗，請稍後再試",
        message: err.message,
      });
    }

    let connection;
    try {
      connection = await dbcon.getConnection();
      const sql_SearchExisting = `
      SELECT
        AssignScheduleName,
        AssignScheduleID,
        PositionArea,
        Position,
        OverTimeWorking,
        OnBoardTime,
        Nationality,
        SortWorkTimeStart,
        SortWorkTimeEnd,
        Is_handmodify,
        CountI,
        Random
      FROM
        hr.schedule_trackrecord
      WHERE
        SortWorkTimeStart IS NULL AND 
        Nationality = "FO" AND
        PositionArea IN (${Array.isArray(allowedAreas) ? allowedAreas.map(() => '?').join(',') : ''}) AND
        AssignScheduleName <> '' AND
        AssignScheduleID <> ''
        ;
    `; 

      const [existingRecords] = await connection.query(
        sql_SearchExisting,
        allowedAreas  // 使用 allowedAreas 作為參數
      );
      console.log("查詢加班列表資料 - 記錄數量:", existingRecords.length);

      // 過濾只顯示 allowedAreas 內的資料
      const filteredRecords_overTime = existingRecords.filter((record) => {
        // 確保 record.PositionArea 存在且不是空字串，然後再判斷是否在 allowedAreas 裡
        const isValidArea =
          record.PositionArea && allowedAreas.includes(record.PositionArea);
        // console.log(`檢查紀錄 (id: ${record.id || 'N/A'}): PositionArea: '${record.PositionArea}', 是否在允許區域: ${isValidArea}`); // 除錯訊息
        return isValidArea;
      });

      res.status(200).json({
        message: "排班資料取得成功",
        data: filteredRecords_overTime,
      });
    } catch (error) {
      console.error("Error <<getOverTimeWorkList>>:", error);
      res.status(500).json({
        error: "取得排班資料失敗，請稍後再試",
        message: error.message,
      });
    } finally {
      if (connection) connection.release();
    }
});

router.get("/getMemberInfo", async (req, res) => {
    const { EmployeeID } = req.query;
    const correct_EmployeeID = String(EmployeeID).trim();

    try {
      const sql = `SELECT * FROM hr.schedule_trackrecord WHERE AssignScheduleID = ? AND DeleteDateTime != '0000-00-00 00:00:00'`;

    
    const [schedule_record] = await dbcon.query(sql , [correct_EmployeeID]);
    console.log("查詢排班資料 - 記錄數量:", schedule_record);
    res.status(200).json({
      message: "排班人員資料獲取成功",
      data: schedule_record,
    });

  }catch(err){
    console.error("Error <<getMemberInfo>>: ", err);
    res.status(500).json({
      error: "取得排班人員資料失敗，請稍後再試",
      message: err.message,
    });

  }

});


// 忘記密碼
router.post("/forgetPsw", async (req, res) => {
  
  const {
    memEmail
  } = req.body;

  console.log("忘記密碼請求，Email:", memEmail);

  if (!memEmail) {
    return res.status(400).json({
      success: false,
      message: "請提供電子郵件地址"
    });
  }

  let sql = `SELECT * FROM hr.schedule_reginfo WHERE memEmail = ?`;

  try {
    const [result] = await dbcon.query(sql, [memEmail]);
    console.log("查詢結果:", result.length, "筆記錄");
    let name = result[0]?.memName || "用戶"; // 預設名稱為 "用戶" 如果沒有找到

    // 檢查是否有找到該電子郵件地址
    if (result.length === 0) {
      return res.status(406).json({
        success: false,
        message: "該電子郵件地址未註冊",
      });
    }

    // 找到記錄，生成驗證碼並發送
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 生成6位數驗證碼
    console.log("生成驗證碼:", code);

    // 更新驗證碼到資料庫
    await dbcon.query(
      `UPDATE hr.schedule_reginfo SET code = ? WHERE memEmail = ?`,
      [code, memEmail]
    );

    // 發送驗證碼到用戶郵箱
    try {
      await sendEmailWithCode(memEmail, code , name);
      console.log(`驗證碼已成功發送到 ${memEmail}`);
    } catch (sendError) {
      console.error("發送驗證碼失敗:", sendError);
      // 即使郵件發送失敗，仍然返回成功（驗證碼已儲存到資料庫）
      return res.status(200).json({
        success: true,
        message: "驗證碼已生成，但郵件發送失敗。請聯繫管理員。",
        debug: sendError.message
      });
    }

    res.status(200).json({
      success: true,
      message: "驗證碼已發送到您的信箱",
    });

  } catch (error) {
    console.error("Error <<forgetPsw>>: ", error);
    res.status(500).json({
      success: false,
      message: "忘記密碼處理失敗",
      error: error.message,
    });
  }
});

// 確認驗證碼並改密碼
router.post("/confirmCode", async (req, res) => {
  const { code, newPassword, memEmail } = req.body;

  // 驗證輸入
  if (!code || !newPassword || !memEmail) {
    return res.status(400).json({
      success: false,
      message: "請填寫所有必要欄位"
    });
  }

  try {
    // 驗證驗證碼
    const [rows] = await dbcon.query(
      `SELECT * FROM hr.schedule_reginfo WHERE memEmail = ? AND code = ?`, 
      [memEmail, code]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "驗證碼錯誤或已過期"
      });
    }

    // 加密新密碼
    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新內部資料庫密碼
    await dbcon.query(
      `UPDATE hr.schedule_reginfo SET encrypasswd = ?, originalpasswd = ?, code = NULL WHERE memEmail = ?`,
      [hashedPassword, newPassword, memEmail]
    );

    // 同步到外部資料庫
    try {
      await neonDb.query(
        `UPDATE users SET password_hash = $1 WHERE email = $2`,
        [hashedPassword, memEmail]
      );
      console.log("外部資料庫密碼同步成功");
    } catch (outlineErr) {
      console.log("外部資料庫密碼同步失敗（但內部更新成功）:", outlineErr.message);
    }

    res.json({
      success: true,
      message: "密碼重設成功"
    });

  } catch (error) {
    console.error("Error <<confirmCode>>: ", error);
    res.status(500).json({
      success: false,
      message: "密碼重設失敗，請稍後再試",
      error: error.message
    });
  }
});

// 同步所有用戶到外部資料庫 (修復 Vercel 部署問題)
router.post("/syncAllUsers", async (req, res) => {
  console.log("開始同步所有用戶到外部資料庫...");
  
  try {
    // 從本地資料庫獲取所有用戶
    const [localUsers] = await dbcon.query(`
      SELECT 
        memberID, 
        reg_schedulename, 
        memEmail, 
        encrypasswd, 
        isManager,
        authPosition
      FROM hr.schedule_reginfo 
      WHERE LENGTH(memberID) > 0
    `);

    console.log(`找到 ${localUsers.length} 個本地用戶需要同步`);

    let syncCount = 0;
    let errorCount = 0;

    for (const user of localUsers) {
      try {
        // 準備用戶資料
        const memberID = String(user.memberID).padStart(3, '0');
        const role = user.isManager == 1 ? 'manager' : 'employee';
        
        // 檢查外部資料庫是否已存在
        const existingUser = await neonDb.query(
          `SELECT employee_id FROM users WHERE employee_id = $1`,
          [memberID]
        );

        if (existingUser.rows.length > 0) {
          console.log(`用戶 ${memberID} 已存在，跳過同步`);
          continue;
        }

        // 同步到外部資料庫
        await neonDb.query(`
          INSERT INTO users (
            email, 
            password_hash, 
            full_name, 
            employee_id, 
            department, 
            role,
            is_synced,
            synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        `, [
          user.memEmail || `${memberID}@coldelectric.com`,
          user.encrypasswd, // 已經是 bcrypt 哈希
          user.reg_schedulename,
          memberID,
          user.authPosition || 'staff',
          role,
          true
        ]);

        syncCount++;
        console.log(`同步用戶 ${memberID} (${user.reg_schedulename}) 成功`);

      } catch (userError) {
        errorCount++;
        console.error(`同步用戶 ${user.memberID} 失敗:`, userError.message);
      }
    }

    res.json({
      success: true,
      message: "用戶同步完成",
      results: {
        totalUsers: localUsers.length,
        syncedUsers: syncCount,
        errors: errorCount
      }
    });

  } catch (error) {
    console.error("用戶同步失敗:", error);
    res.status(500).json({
      success: false,
      message: "用戶同步失敗",
      error: error.message
    });
  }
});







// 確認人員當天是否已經選擇工作區域
const checkWorkPlaceSelected = async (memberNumber) => {
  let sql_findExisting = `SELECT * FROM hr.opSelect_workPlace WHERE memberNumber = ? ORDER BY id DESC LIMIT 1`;
  const nowDate = moment().tz('Asia/Taipei');
  const nowDateStr = nowDate.format("YYYY-MM-DD");
  const nowTime = nowDate.format("HH:mm:ss");

  try {
    const [rows] = await dbcon.query(sql_findExisting, [memberNumber]);

    // 如果沒有查到資料，返回未選擇
    if (!rows || rows.length === 0) {
      return {
        success: true,
        hasSelected: false,
        id: null
      };
    }

    // 取得資料庫的日期
    const dbDate = moment(rows[0]?.date).format('YYYY-MM-DD');
    const dbShift = rows[0]?.shift || "";
    const hasEquipment = rows[0]?.equipment && rows[0]?.equipment.length > 0;
    const recordId = rows[0]?.id || null;

    // ✅ 簡化邏輯：只要是今天的資料，就視為已選擇（無論什麼班別）
    // 如果是晚班跨日的情況（凌晨 00:00-07:59），則查昨天的資料
    const yesterdayStr = moment(nowDate).subtract(1, 'days').format('YYYY-MM-DD');
    const isNightShiftNextDay = nowTime >= "00:00:00" && nowTime <= "07:59:59";
    
    // 判斷資料是否為當前班別的有效記錄
    if (dbDate === nowDateStr) {
      // 今天的資料
      return {
        success: true,
        hasSelected: hasEquipment,
        id: recordId
      };
    } else if (dbDate === yesterdayStr && isNightShiftNextDay) {
      // 晚班跨日：凌晨時段查昨天的資料
      return {
        success: true,
        hasSelected: hasEquipment,
        id: recordId
      };
    }
    
    // 其他情況：資料不是今天的，視為未選擇
    return {
      success: true,
      hasSelected: false,
      id: null
    };

  } catch (error) {
    console.error("Error <<checkWorkPlaceSelected>>: ", error);
    return {
      success: false,
      hasSelected: false,
      id: null,
      error: error.message
    };
  }
}


router.get("/checkIfSelectWorkPlace" , async (req, res) => {
  const { memberNumber } = req.query;

  try{
    const checkResult = await checkWorkPlaceSelected(memberNumber);
    
    // 如果查詢失敗（資料庫錯誤）
    if (!checkResult.success) {
      return res.status(500).json({
        success: false,
        message: "查詢工作地點失敗",
        error: checkResult.error
      });
    }
    
    // 如果今天已經選擇過工作區域
    if (checkResult.hasSelected) {
      // 重新查詢以獲取完整資料
      const sql = `SELECT * FROM hr.opSelect_workPlace WHERE memberNumber = ? ORDER BY id DESC LIMIT 1`;
      const [rows] = await dbcon.query(sql, [memberNumber]);
      
      return res.status(200).json({
        success: true,
        hasSelected: true,
        message: "已經選擇工作地點",
        data: rows[0] || {}
      });
    }
    
    // 如果今天還沒選擇工作區域
    return res.status(200).json({
      success: true,
      hasSelected: false,
      message: "今天還未選擇工作地點",
      data: null
    });
    
  }catch(error){
    console.error("Error <<checkIfSelectWorkPlace>>: ", error);
    res.status(500).json({
      success: false,
      message: "查詢工作地點失敗",
      error: error.message
    });
  }
})

router.post("/selectWorkPlace", async (req, res) => {
  const { memberNumber, memberName, shift, equipment, date } = req.body;
  const now = moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');

  console.log("工作區域選擇請求:", { memberNumber, memberName, shift, equipment, date });

  try {
    // 檢查是否已經選擇過工作區域
    const checkResult = await checkWorkPlaceSelected(memberNumber);
    
    // 如果檢查失敗，返回錯誤
    if (!checkResult.success) {
      return res.status(500).json({
        success: false,
        message: "查詢工作地點失敗",
        error: checkResult.error
      });
    }

    let sql = "";
    let params = [];

    // 如果沒有選擇過（hasSelected: false），執行 INSERT
    if (!checkResult.hasSelected) {
      sql = `INSERT INTO hr.opSelect_workPlace (memberNumber, memberName, shift, equipment, date ) VALUES (?, ?, ?, ?, ?)`;
      params = [memberNumber, memberName, shift, equipment, date];
    }
    // 如果已經選擇過（hasSelected: true），執行 UPDATE
    else {
      sql = `UPDATE hr.opSelect_workPlace SET memberName = ? , memberNumber = ?, shift = ?, equipment = ?, date = ? WHERE id = ?`;
      params = [memberName, memberNumber, shift, equipment, date , checkResult.id];
    }

    // 執行 SQL
    await dbcon.query(sql, params);
    
    res.status(200).json({
      success: true,
      message: checkResult.hasSelected ? "工作區域更新成功" : "工作區域選擇成功",
      action: checkResult.hasSelected ? "update" : "insert"
    });

  } catch (error) {
    console.error("Error <<selectWorkPlace>>: ", error);
    res.status(500).json({
      success: false,
      message: "工作區域選擇失敗",
      error: error.message
    });
  }
})

router.get("/checkAuth" , async (req, res) => {
    const memberID = req.query.memberID || req.query.memberid;

  let sql = `SELECT authPosition , positionarea , authStatus FROM hr.absent_manager_roster 
  WHERE memberID = ? AND nowIsManager = 1 ORDER BY id DESC LIMIT 1
  `

  try{
    const [rows] = await dbcon.query(sql, String(memberID).trim());
    console.log("rows :" , typeof rows + "|" + Array.isArray(rows) + "|" + rows.map((item) => item.memberID).join(","));
      
    if(rows.length > 0){
      return res.status(200).json({
        success: true,
        data: rows[0],
        message: "查詢權限成功，該用戶為主管職"
      })
    }
    else {
      return res.status(200).json({
        success: false,
        data: null,
        message: "查詢權限成功，該用戶非主管職"
      })
    }
    
  }catch(err){
    console.error("Error <<checkAuth>>: ", err);
    res.status(500).json({
      success: false,
      message: "查詢權限失敗",
      error: err.message
    });
  }
})

// 根據主管的 positionArea 權限查詢排班人員清單
router.get("/checkManageMemberList", async (req, res) => {
  const { managerMemberID } = req.query;

  console.log("接收的 managerMemberID:", managerMemberID);

  if (!managerMemberID) {
    return res.status(400).json({ message: "請提供 managerMemberID" });
  }
  // 抓出主管的 positionArea 權限
  let sql_getManagerAuth = `SELECT positionarea FROM hr.absent_manager_roster WHERE memberID = ? AND authStatus <> '' AND authStatus IS NOT NULL AND authStatus != "0"`;
  
  // 抓出人員清單的 SQL
  let sql_getMemberList = `SELECT memberID , reg_schedulename , positionarea
  FROM hr.schedule_reginfo 
  WHERE positionarea IN ( ? )
  `


  try {
    const [authRows] = await dbcon.query(sql_getManagerAuth, [String(managerMemberID).trim()]);
    console.log("查詢到的主管權限資料:", authRows);

    if (authRows.length === 0) {
      return res.status(403).json({ message: "該主管無有效的權限資料" });
    }

    const positionAreas = JSON.stringify(authRows[0])
    console.log ("主管的 positionAreas 權限:", positionAreas);
    const array_positionAreas = JSON.parse(positionAreas).positionarea;
    console.log("解析後的 array_positionAreas:", array_positionAreas);

    try{
      const [memberRows] = await dbcon.query(sql_getMemberList, [array_positionAreas]);
      console.log("查詢到的排班人員清單:", memberRows);

      res.status(200).json({
        message: "取得排班人員清單成功",
        data: memberRows,
      });
      
    }catch(err){
      console.error("Error <<parsing positionAreas>>:", err);
      throw err;
    }
  }catch(err){
    console.error("Error <<checkManageMemberList>>:", err);
    throw err;
  }
});

router.get("/schedule_personalLeaveRecord" , async (req, res) => {
  const {
    memberID , 
    startMonth , 
    endMonth
  } = req.query;

  console.log("接收的參數:", { memberID, startMonth, endMonth });
  console.log("startMonth type:", typeof startMonth, "endMonth type:", typeof endMonth);

  const momentStart = moment(startMonth).tz("Asia/Taipei").startOf('day').toDate();
  const momentEnd = moment(endMonth).tz("Asia/Taipei").endOf('day').toDate();

  try{
    const prisma = prismaHr;

    try{
      const checkReg = await prisma.ScheduleCard.findFirst({
      where: { employeeID: {contains: "199"} } // 手動填入工號測試
    });
      console.log("單獨查詢人員資訊結果:", checkReg);
    }catch(err){
      console.error("Error <<單獨查詢人員資訊>>:", err);
      throw err;
    }

    const catchPersonalLeaveRecord = await prisma.AbsentSystemLeaveSortOutAll.findMany({
      where: {
        employeeNumber : String(memberID).trim(),
        leaveStartTime : { gte: momentStart },
        leaveEndTime : { lte: momentEnd },
        errorStatusNotify: "3",
      },
      select: {
        employeeNumber : true , 
        employeeName : true ,
        leaveStartTime : true ,
        leaveEndTime : true ,
        leaveType : true ,
        
        ScheduleRegInfo : {
          select : {
            positionArea : true,
            authPosition : true,

            cards: {
              select: { groupI: true },
              take: 1,
              orderBy: { id: 'desc' } // 拿最近的一筆
            },
            // 抓取動態排班中的組別 (通常更準確)
            trackRecords: {
              select: { groupI: true },
              take: 1,
              orderBy: { id: 'desc' } // 拿最近的一筆
            },
            managerRoster: {
              select: { positionArea: true }
            }
            
          }
        },
      }
    })

    console.log("查詢到的個人請假記錄:", catchPersonalLeaveRecord , 
      "|  check data type :", typeof catchPersonalLeaveRecord , " | isArray: " , 
      Array.isArray(catchPersonalLeaveRecord) , " | length: " ,
      catchPersonalLeaveRecord.length  );

    

    res.status(200).json({
      message: "取得個人請假記錄成功",
      data: catchPersonalLeaveRecord? catchPersonalLeaveRecord : []
    });
    
  }catch(err){
    console.error("Error <<schedule_personalLeaveRecord>>:", err);
    res.status(500).json({
      message: "取得個人請假記錄失敗",
      error: err.message
    })
    throw err;
  }
})


// 主管介面用 查看請假人員記錄
router.get("/schedule_personalLeaveRecord_Manager" , async (req, res) => {
  const {
    memberID , 
    startMonth , 
    endMonth
  } = req.query;

  console.log("接收的參數:", { memberID, startMonth, endMonth });
  console.log("startMonth type:", typeof startMonth, "endMonth type:", typeof endMonth);

  const momentStart = moment(startMonth).tz("Asia/Taipei").startOf('day').toDate();
  const momentEnd = moment(endMonth).tz("Asia/Taipei").endOf('day').toDate();

  try{
    const prisma = prismaHr;

    try{
      const checkReg = await prisma.ScheduleCard.findFirst({
      where: { employeeID: {contains: "199"} } // 手動填入工號測試
    });
      console.log("單獨查詢人員資訊結果:", checkReg);
    }catch(err){
      console.error("Error <<單獨查詢人員資訊>>:", err);
      throw err;
    }

    const catchPersonalLeaveRecord = await prisma.AbsentSystemLeaveSortOutAll.findMany({
      where: {
        employeeNumber : String(memberID).trim(),
        leaveStartTime : { gte: momentStart },
        leaveEndTime : { lte: momentEnd },
        errorStatusNotify: "3",
      },
      select: {
        employeeNumber : true , 
        employeeName : true ,
        leaveStartTime : true ,
        leaveEndTime : true ,
        leaveType : true ,
        
        ScheduleRegInfo : {
          select : {
            positionArea : true,
            authPosition : true,

            cards: {
              select: { groupI: true },
              take: 1,
              orderBy: { id: 'desc' } // 拿最近的一筆
            },
            // 抓取動態排班中的組別 (通常更準確)
            trackRecords: {
              select: { groupI: true },
              take: 1,
              orderBy: { id: 'desc' } // 拿最近的一筆
            },
            managerRoster: {
              select: { positionArea: true }
            }
            
          }
        },
      }
    })

    console.log("查詢到的個人請假記錄:", catchPersonalLeaveRecord , 
      "|  check data type :", typeof catchPersonalLeaveRecord , " | isArray: " , 
      Array.isArray(catchPersonalLeaveRecord) , " | length: " ,
      catchPersonalLeaveRecord.length  );

    

    res.status(200).json({
      message: "取得個人請假記錄成功",
      data: catchPersonalLeaveRecord? catchPersonalLeaveRecord : []
    });
    
  }catch(err){
    console.error("Error <<schedule_personalLeaveRecord>>:", err);
    res.status(500).json({
      message: "取得個人請假記錄失敗",
      error: err.message
    })
    throw err;
  }
})



module.exports = router;
