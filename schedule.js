require("dotenv").config();
const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto");
const { Sequelize } = require("sequelize");
const jwt = require("jsonwebtoken");
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const axios = require("axios");
const _ = require("lodash");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const mysql = require("mysql2");
const fs = require("fs");
const moment = require("moment");

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

dbcon.once("error", (err) => {
  console.log("Error in connecting to database: ", err);
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

//目前既有的生產領班配置人員姓名
const product_foremanlist = [
  "007|張玉佩",
  "011|鄭坤德",
  "019|張智強",
  "033|陳尚吉",
  "264|張庭瑋",
  "068|洪彰澤",
  "109|黃之奕",
  "150|黃啟明",
  "183|陳又銘",
  "255|林冠達",
  "290|章榮文",
  "349|周柏全",
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

// 轉換 time 格式（'HHMM' -> 'HH:MM:SS'）
const convertTime = (timeStr) => {
  const hours = timeStr.slice(0, 2); // 取小時
  const minutes = timeStr.slice(2, 4); // 取分鐘
  const seconds = timeStr.slice(4, 6); // 取秒數

  if (seconds.toString().includes("")) return `${hours}:${minutes}`; // 返回標準時間格式(無秒)

  return `${hours}:${minutes}:${seconds}`; // 返回標準時間格式
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

async function check_schedulerecord_IsExist(
  scheduleID,
  schedulename,
  sort_start_date,
  sort_end_date
) {
  //重新計算已排班日期查詢量與偵測重複日期
  onoffboard_confirm.length = already_st_ed = 0;

  const sql_check = `select count(*) as result,'startdate_get_exist' as type  from schedule_trackrecord where AssignScheduleID = ${scheduleID}  AND  AssignScheduleName like '${schedulename}' AND  DATE(SortWorkTimeStart) ='${sort_start_date}' and DeleteDateTime like '0000-00-00 00:00:00' \
     UNION ALL select count(*),'enddate_get_exist' from schedule_trackrecord where  AssignScheduleID = ${scheduleID}  AND AssignScheduleName like '${schedulename}'   AND  DATE(SortWorkTimeEnd) ='${sort_end_date}' and DeleteDateTime like '0000-00-00 00:00:00'`;

  console.log("sql_check = " + sql_check);

  const [check_schedule] = await db2.query(sql_check);
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

//註冊排班使用者
router.post("/register", async (req, res) => {
  try {
    const { memberid, email, password } = req.body;

    // console.log(
    //   "reginID接收為 = " +
    //   memberid +
    //     " Email接收為 = " +
    //     email +
    //     " reginPWD接收為 = " +
    //     password
    // );

    //先確認是否有工號存在
    const sql1 = `SELECT * FROM hr_memberinfo WHERE memberID = ?`;
    const sqlschedule = `SELECT * FROM schedule_reginfo WHERE memberID = ?`;

    let params = [],
      isManerger = "NULL",
      adjust_memeID;

    // 確認資料是否正確
    // if (memberid) {
    //   sql1 += " AND memberID = ?";
    //   params.push(memberid);
    // }
    // if (Email) {
    //   sql += "AND passwd = ?";
    //   params.push(Email);
    // }

    //當輸入memberID位元小於3,自動補缺口
    if (getDigitCount(memberid) < 3) {
      console.log("輸入位元結果:" + getDigitCount(parseInt(memberid)));
      adjust_memeID = toThreeDigit(memberid);
    } else {
      adjust_memeID = memberid.toString();
    }

    // console.log("最終調整註冊比對ID為:" + adjust_memeID + "  原先memberid = " + memberid );

    dbcon.query(sql1, [adjust_memeID], async (err, results) => {
      if (err) {
        console.log("輸入例外錯誤 Error in connecting to database:" + err);
        return res.status(500).send("人事資料庫連結錯誤!");
      } else {
        if (results.length === 0) {
          res.status(405).send(`無此工號:${memberid},請確認人事資料表!`);
        } else {
          //這邊有確定有從人事資料表找到工號
          dbcon.query(sqlschedule, [memberid], async (err, results2) => {
            if (err) {
              return res.status(500).send("排班資料庫連結錯誤!");
            } else {
              const reg_schedulename = results[0].memberName;
              const reg_memberID = results[0].memberID;
              const hashedPassword = await bcrypt.hash(password, 10);
              const memEmail =
                Object.keys(email.toString()).length === 0
                  ? ""
                  : isValidEmail(email.toString())
                  ? email.toString()
                  : results[0].memEmail;

              //沒有註冊過,直接接續執行下方流程
              if (results2.length === 0) {
                console.log("搜尋的工號格式:" + reg_memberID);

                //判定是否為生產領班(主管),比對->工號,姓名
                for (
                  let manger = 0;
                  manger < product_foremanlist.length;
                  manger++
                ) {
                  const filter_manger = product_foremanlist[manger]
                    .toString()
                    .split("|");
                  if (
                    filter_manger[0].includes(adjust_memeID) &&
                    filter_manger[1].includes(reg_schedulename)
                  ) {
                    //主管領班註冊
                    isManerger = parseInt("1");
                    break;
                  }
                }

                if (isManerger.toString().includes("NULL")) {
                  //排班員工註冊
                  isManerger = parseInt("0");
                }

                console.log(
                  "即將註冊的為:" +
                    reg_schedulename +
                    " ID工號為:" +
                    adjust_memeID +
                    " isManerger判定為:" +
                    isManerger
                );

                //新增註冊資料
                const sql_signup = `INSERT INTO schedule_reginfo(memberID,reg_schedulename,memEmail,encrypasswd,originalpasswd,isManager) VALUES (?,?,?,?,?,?)`;
                dbcon.query(
                  sql_signup,
                  [
                    reg_memberID,
                    reg_schedulename,
                    memEmail,
                    hashedPassword,
                    password,
                    isManerger,
                  ],
                  (err, result3) => {
                    if (err) {
                      console.log(err.code);
                      if (err.code === "ER_DUP_ENTRY") {
                        res.status(400).send("帳號ID或 Email 已存在");
                      } else {
                        res.status(500).send("運行資料庫INSERT錯誤!");
                      }
                    } else {
                      res.status(200).send({
                        message: "排班註冊成功",
                        isManerger: isManerger,
                      });
                    }
                  }
                );
                // res
                //   .status(405)
                //   .send(`無此工號:${memberID},請確認排班註冊資料表!`);
              } else {
                if (
                  parseInt(results2[0].memberID) === parseInt(memberid) ||
                  results2.length > 0
                ) {
                  res
                    .status(403)
                    .send(
                      ` 工號:${memberid}/姓名:${reg_schedulename}已註冊過排班系統建檔資料庫!`
                    );
                }
              }
            }
          });
        }
      }
    });

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

// 登入排班操作頁面回傳當前需求數據
router.get("/scheduleDataForm", async (req, res) => {
  const {
    schedule_yaer,
    schedule_month,
    memberID,
    reg_schedulename,
    IsManager,
  } = req.query;

  //預先清除空資料
  ScheduleData_GetRespnse.length = 0;
  let idlevel;
  let attendfulldata = [],
    currentmanager = [];

  // console.log(
  //   "提交年月 = " +
  //     schedule_yaer +
  //     "/" +
  //     schedule_month +
  //     " 登入工號/名字 = " +
  //     memberID +
  //     "/" +
  //     reg_schedulename +
  //     " isManerger確認狀態為 = " +
  //     IsManager
  // );

  //(1)找尋之前有(新增或修改或刪除)的排班數據庫
  let sql1 = `select * from schedule_trackrecord `;
  const sql_Manager = `where IsManager like '${IsManager}' and EmployeeID like '${memberID}' and EmployeeName like '${reg_schedulename}'`;
  const sql_Member = `where AssignScheduleID like '${memberID}  and  AssignScheduleName like '${reg_schedulename}'`;
  const sql_public = ` and year(SortWorkTimeStart) = '${schedule_yaer}' AND  month(SortWorkTimeStart) = '${schedule_month}' and DeleteDateTime like '0000-00-00 00:00:00'`;

  /*依照isManerger 判斷 1 或 0 ,回傳需求之數據格式呈現前端介面*/
  //領班主管 = 1
  if (parseInt(IsManager) === 1) {
    idlevel = "主管領班";
    sql1 += sql_Manager;
  } //排班人員 = 0
  else {
    idlevel = "排班人員";
    sql1 += sql_Member;
  }
  sql1 += sql_public;

  // console.log("get sql1 = " + sql1);
  try {
    const [schedule_record] = await db2.query(sql1);

    if (schedule_record.length === 0)
      res
        .status(402)
        .json(`級別:${idlevel} ,目前登入者:${reg_schedulename}無任何紀錄資訊`);

    ScheduleData_GetRespnse.push({ BeforeReserveRecord: schedule_record });

    //(2) 找尋之前有排班人員實際考勤日期(依據排班設定SortWorkTimeStart 和 SortWorkTimeEnd)
    const filter_sched_attend = Object.entries(schedule_record); // Get the entries from schedule_record

    // Use a for...of loop instead of map to handle async/await properly
    for (const [key, row] of filter_sched_attend) {
      // 編排流水號,排班人員工號,排班人員姓名
      const SDT_ID = parseInt(row.id);
      const SDT_memID = parseInt(row.AssignScheduleID);
      const SDT_name = row.AssignScheduleName;
      // 轉換 SortWorkTimeStart 和 SortWorkTimeEnd
      const SDT_start = absentformatDate(row.SortWorkTimeStart);
      const SDT_end = absentformatDate(row.SortWorkTimeEnd);

      //動態儲存考勤資訊list (考勤日期+時間)
      let stroge_startendlist = [];

      //將既有的排班考勤資訊收集存取
      let stroge_attendance = {
        id: SDT_ID,
        memID: SDT_memID,
        name: SDT_name,
      };

      const sql2 = `WITH RankedAttendance AS (
    SELECT 
        memID,
        card_date,
        card_time,
        memName,
        card_ID,
        ROW_NUMBER() OVER (PARTITION BY memid, card_date ORDER BY card_time DESC) AS rn
    FROM hr.hr_myabsent
    WHERE memid in (${SDT_memID})
    AND card_date BETWEEN '${SDT_start}' AND '${SDT_end}'
    AND card_Name LIKE '%考勤%'
    AND (TRIM(card_id) = '026' OR TRIM(card_id) = '014' OR TRIM(card_id) = '007' OR TRIM(card_id) = '039')
  )
  SELECT 
      memID,
      card_date,
      card_time,
      memName,
      card_ID
  FROM RankedAttendance
  WHERE rn = 1
  ORDER BY card_date;`;

      try {
        // console.log("attendance_fix sql =  " +sql2 );

        const [attendance_fix] = await db2.query(sql2);

        // console.log("attendance_fix 長度 = "+attendance_fix.length);
        // console.log("attendance_fix 考勤內容得出 = "+ JSON.stringify( attendance_fix));

        if (attendance_fix.length === 0) {
          // console.log("搜無考勤紀錄");
          stroge_attendance[
            "attendance_onboard"
          ] = `${SDT_start}->查無考勤紀錄`;
          stroge_attendance["attendance_offboard"] = `${SDT_end}->查無考勤紀錄`;

          attendfulldata.push(stroge_attendance); // Push the attendance data into the result array
        } else {
          //擷取目前考勤鎖定between 起始到結束日期實際打卡 (日期+時間)
          for (let times = 0; times < attendance_fix.length; times++) {
            const attendance =
              convertDate(attendance_fix[times].card_date) +
              " " +
              convertTime(attendance_fix[times].card_time);

            stroge_startendlist.push({
              [`AttendSystem_${times + 1}`]: attendance,
            });

            if (times === attendance_fix.length - 1) {
              stroge_attendance[`attendance_record_ALL`] = stroge_startendlist;
            }
          }
          attendfulldata.push(stroge_attendance); // Push the attendance data into the result array
        }
      } catch (error) {
        console.error("Database attendance_fix query failed: ", error);
      }
    }

    // console.log(JSON.stringify(attendfulldata));
    ScheduleData_GetRespnse.push({ AttendanceCheck: attendfulldata });

    //(3) 將目前排班管理員列表回傳前端(只有主管領班需要)
    if (parseInt(IsManager) === 1) {
      product_foremanlist.forEach((item, index) => {
        let [id, name] = item.split("|");
        currentmanager.push({ id: parseInt(id), ManagerName: name });
      });

      ScheduleData_GetRespnse.push({ CurrentManagerList: currentmanager });
    }

    // console.log(JSON.stringify(ScheduleData_GetRespnse));

    res.status(200).send({
      message:
        parseInt(IsManager) === 1
          ? "#查詢全部(排班已寫入紀錄,考勤紀錄,當前排班主管列表)完畢回覆前端#"
          : `#查詢個人(排班已寫入紀錄,考勤紀錄)完畢回覆前端#`,
      ScheduleData_GetRespnse,
    });
  } catch (err) {
    console.log("Error <scheduleDataForm> info & send back error code: ", err);
  }
});

// 排班登入驗證
router.post("/login", async (req, res) => {
  const { memberid, email, password } = req.body;
  // console.log(
  //   "loginID接收為 = " +
  //     memberid +
  //     "Email接收為 = " +
  //     email +
  //     " loginPWD接收為 = " +
  //     password
  // );

  const sql_regschdule = `SELECT * FROM schedule_reginfo WHERE memberID = ?`;
  let encrypasswd;
  try {
    // 先確認id是否存在於排班資料表

    dbcon.query(sql_regschdule, [memberid], async (err, results) => {
      if (err) return res.status(500).send("排班資料庫連線異常!");
      if (results.length === 0)
        return res.status(400).send(`工號:${memberid}未註冊排班資料庫名單`);

      //根據目前輸入ID找尋為領班主管或排班員工
      const isManager = results[0].isManager;
      encrypasswd = results[0].encrypasswd;
      let isPasswordMatch = await bcrypt.compare(password, encrypasswd);
      console.log(
        "isPasswordMatch 密碼比對結果:" + isPasswordMatch,
        "isManager = " + isManager,
        "登入身分為:" + results[0].reg_schedulename
      );

      if (!isPasswordMatch) {
        if (isManager === 0 || isManager === false) {
          //排班員工目前預設多一組萬用密碼提供登入(暫定:G7@t9qZ!5x)
          encrypasswd = "G7@t9qZ!5x";
          isPasswordMatch =
            password.toString().trim("") === encrypasswd ? true : false;
        }

        if (!isPasswordMatch) return res.status(401).send("密碼錯誤");
      }

      // 生成一個 256-bit 的隨機密鑰（32 字元長）
      const secret = crypto.randomBytes(32).toString("hex");
      const token = jwt.sign({ memberID: results[0].memberID }, secret, {
        expiresIn: "24h",
      });

      // console.log("確認登入資料是否正確");
      // res.status(200).json("預計回應帳密驗證成功與否");
      res.status(200).json({
        Message: `工號:${memberid}登入排班系統成功!`,
        Content: results,
      });
    });
  } catch (err) {
    console.log("Error <<Login>> info & send back error code: ", err);
  }
});

// 新增排班紀錄
router.post("/addWorkTime", async (req, res) => {
  try {
    const workTimes = req.body;
    console.log("接收 insert workTime = " + JSON.stringify(workTimes));

    const sqladd = `
    INSERT INTO schedule_trackrecord (
      Random,EmployeeName, EmployeeID, EmployeeEmail, Password, IsManager, AssignScheduleName,
      AssignScheduleID, Position, EmployeeWorkTime, RealOnBoardTime, RealOffBoardTime,
      WeekOnBoardTime, SortWorkTimeStart, SortWorkTimeEnd, SubmitDateTime, EditWorkTimeStart,
      EditWorkTimeEnd, EditManager, EditManagerID, AdjustUpdatetime, DeleteManagerName,
      DeleteManagerID, DeleteDateTime) VALUES ?`;

    const workTimesArray = Array.isArray(workTimes) ? workTimes : [workTimes];
    //取得當前系統日期時間
    const now = moment().format("YYYY-MM-DD HH:mm:ss");

    // 將資料轉換為 SQL 可接受的格式
    const addvalues = workTimesArray.map((item) => [
      item.Random,
      item.reg_schedulename,
      item.EmployeeID,
      item.EmployeeEmail,
      item.Password,
      item.isManager,
      item.assignscheduleName,
      item.assignscheduleID,
      item.Position,
      item.EmployeeWorkTime,
      item.RealOnBoardTime,
      item.RealOffBoardTime,
      item.WeekOnBoardTime,
      item.SortWorkTimeStart,
      item.SortWorkTimeEnd,
      now,
      item.EditWorkTimeStart,
      item.EditWorkTimeEnd,
      item.EditManager,
      item.EditManagerID,
      0,
      item.DeleteManagerName,
      item.DeleteManagerID,
      0,
    ]);

    //先行判斷之前排班人員是否已經預排日期(起始或結束)有重複
    // addvalues.forEach((item) => {
    //   const assignscheduleName = item[5];
    //   const assignscheduleID = item[6];
    //   const Position = item[7];
    //   const EmployeeWorkTime = item[8];
    //   const RealOffBoardTime = item[10];
    //   const WeekOnBoardTime = item[11];
    //   const SortWorkTimeStart = item[12];
    //   const SortWorkTimeEnd = item[13];

    //   if (
    //     check_schedulerecord_IsExist(
    //       assignscheduleName,
    //       SortWorkTimeStart,
    //       SortWorkTimeEnd
    //     )
    //   ) {
    //     console.log("有偵測到之前排班紀錄重複!");
    //     res.status(499).send({
    //       ErrorMessage:
    //         `請勿將排班人員:${assignscheduleName}排班於此-> ` +
    //           already_st_ed ===
    //         3
    //           ? `${SortWorkTimeStart}起始和${SortWorkTimeEnd}結束`
    //           : already_st_ed === 1
    //           ? `${SortWorkTimeStart}起始`
    //           : `${SortWorkTimeEnd}結束` + "時段 , 需要調整其他日期",
    //     });
    //   }
    // });

    console.log("準備insert 總數據addvalues = " + addvalues);

    const [newRecords] = dbcon.query(
      sqladd,
      [addvalues],
      async (err, result) => {
        if (err) {
          console.error("Error addWorkTime data: ", err);
          // return res.status(500).send("Error addWorkTime data");
          res.status(500).json({ error: "Error addWorkTime data" });
          return; // 避免後面程式碼再次發送響應
        }
        console.log("主管排班新增成功");
        res.status(205).json(`主管:${addvalues[0].EditManager}排班新增成功`);
      }
    );
  } catch (err) {
    console.log("Error <<addWorkTime>> info & send back error code: ", err);
  }
});

// 主管排班修改
router.put("/editWorkTime", async (req, res) => {
  const {
    Random,
    Position,
    AssignScheduleID,
    AssignScheduleName,
    EmployeeWorkTime,
    SortWorkTimeStart,
    SortWorkTimeEnd,
  } = req.body;

  try {
    console.log("主管排班修改");
    //取得當前系統日期時間
    const now = moment().format("YYYY-MM-DD HH:mm:ss");

    //更新排班表單 hr.schedule_trackrecord
    let sql =
      "UPDATE hr.schedule_trackrecord SET Position = ?, AssignScheduleID = ? , AssignScheduleName = ? , EmployeeWorkTime = ?, SortWorkTimeStart = ?, SortWorkTimeEnd = ? , AdjustUpdatetime = ? ";
    const sqlParams = [
      Position,
      AssignScheduleID,
      AssignScheduleName,
      EmployeeWorkTime,
      SortWorkTimeStart,
      SortWorkTimeEnd,
      now,
    ];

    //有效的數字格式
    if (!isNaN(Number(Random))) {
      //純數字格式,回報錯誤
      res
        .status(401)
        .send({ message: `請確認Random狀態->:${Random}是否為純數字格式!` });
    } else {
      //目前判定由前端自己定義的Random編號(A~Z三碼+數字五碼)
      sql += " WHERE Random = ?";
      sqlParams.push(Random);
    }

    await db2.query(sql, sqlParams);

    res
      .status(200)
      .json({ message: `排班人員:${AssignScheduleName}修改更新成功` });
  } catch (error) {
    console.log("Error <<editWorkTime>> info & send back error code: ", error);
    res.status(500).json({ message: "排班更新錯誤" });
  }
});

// 主管排班刪除
router.delete("/deletWorkTime", async (req, res) => {
  const { Random } = req.query;
  try {
    console.log("主管排班刪除");

    //取得當前系統日期時間
    const now = moment().format("YYYY-MM-DD HH:mm:ss");

    //指定排班表單 hr.schedule_trackrecord 欄位DeleteDateTime 將當下執行系統日期時間存入,後續Get scheduleDataForm會忽略pass
    let sql =
      "UPDATE hr.schedule_trackrecord SET DeleteDateTime = ? WHERE Random = ? ";
    const sqlParams = [now, Random];

    await db2.query(sql, sqlParams);

    res.status(200).json({
      message: `指定排班編輯號:${Random}刪除系統日期時間已登記,刪除OK`,
    });
  } catch (err) {
    console.log("Error <<deletWorkTime>> info & send back error code: ", err);
  }
});

module.exports = router;
