const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const _ = require("lodash");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const fs = require("fs");
const moment = require("moment");
const schedule = require("node-schedule");
const xlsx = require("xlsx");
const path = require("path");
const { auth } = require("googleapis/build/src/apis/abusiveexperiencereport");
const { diff } = require("util");
const nodemailer = require('nodemailer');

const { PrismaClient: HrClient } = require('../generated/hr');
const { PrismaClient: MesClient } = require('../generated/mes');

const prismaHr = new HrClient();
const prismaMes = new MesClient();


const { sendDailyLeaveNotifications } = require('../modules/leave_notifier.js');


// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbcon = require(__dirname + "/../modules/mysql_connect.js");  // hr 資料庫

const leaveApply_Db = new Pool({
    connectionString: process.env.NeonDB, 
    ssl: { rejectUnauthorized: false }
});


// 獲取伺服器 IP 地址的函數
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

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "Z:/資訊處- 存請假資訊/leaveFileWay"); 
    },
    filename: (req, file, cb) => {
        // 自訂檔案名稱：ID_日期_序號_原檔名
        const memberID = req.body.memberID || 'unknown';
        const currentDate = moment().format('YYYYMMDD-HHmmss');
        const fileExtension = file.originalname.split('.').pop();
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const fileName = `${memberID}_${currentDate}_${timestamp}_${randomSuffix}.${fileExtension}`;

        cb(null, fileName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB 限制
        files: 10 // 最多 10 個檔案
    }
});


const WORK_HOURS_PER_DAY = 8; // 以 8 小時為一個特休天數換算基準
// 午休與班次定義
const DAY_SHIFT_START = '08:00:00';
const DAY_SHIFT_END = '20:00:00';
const NORMAL_SHIFT_START = '08:30:00';
const NORMAL_SHIFT_END = '17:30:00';
const NIGHT_SHIFT_START = '20:00:00';
const NIGHT_SHIFT_END = '08:00:00'; // 翌日
// 午休時段 (早班與常日班不同)
const DAY_LUNCH_START = '12:00:00';
const DAY_LUNCH_END = '13:00:00';
const NORMAL_LUNCH_START = '12:30:00';
const NORMAL_LUNCH_END = '13:30:00';

// 解析『上午 8:00:00 / 下午 1:30:00』為 24 小時制 HH:mm:ss
function parseChineseTime(str) {
    if (!str) return null;
    if (Array.isArray(str)) { // 原程式用 filter/ join 表示可能是陣列
        str = str.join('').trim();
    } else {
        str = String(str).trim();
    }
    const m = str.match(/^(上午|下午)\s*(\d{1,2}):(\d{2}):(\d{2})$/);
    if (m) {
        let h = parseInt(m[2], 10);
        if (m[1] === '上午') {
            if (h === 12) h = 0;
        } else { // 下午
            if (h < 12) h += 12;
        }
        return `${h.toString().padStart(2,'0')}:${m[3]}:${m[4]}`;
    }
    // 若本來就是 HH:mm:ss
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(str)) {
        const [h,mi,se]=str.split(':');
        return `${parseInt(h,10).toString().padStart(2,'0')}:${mi}:${se}`;
    }
    return null;
}

// 建立日期時間 moment (dateStr: YYYY/MM/DD 或 YYYY-MM-DD)
function buildMoment(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    // 允許 YYYY/MM/DD 或 YYYY-MM-DD
    const normalizedDate = dateStr.replace(/\//g,'-');
    const m = moment(`${normalizedDate} ${timeStr}`, 'YYYY-MM-DD HH:mm:ss', true);
    return m.isValid() ? m : null;
}

// 計算兩個 moment 交集(小時) 半開區間 [aStart,aEnd) 與 [bStart,bEnd)
function overlapHours(aStart, aEnd, bStart, bEnd) {
    if (!aStart || !aEnd || !bStart || !bEnd) return 0;
    const start = moment.max(aStart, bStart);
    const end = moment.min(aEnd, bEnd);
    if (!end.isAfter(start)) return 0;
    return end.diff(start,'hours', true); // 浮點數
}

// 判斷此區間主要屬於哪個班次 (簡化規則)
function decideShift(startM, endM) {
    // 有夜間跨越 (含 20:00 以後 或 次日 08:00 之前)
    if (startM.hour() >= 20 || endM.hour() < 8 || endM.diff(startM,'hours') > 12) {
        return 'night';
    }
    // 常日班完全包住
    const normalStart = startM.clone().hour(8).minute(30).second(0);
    const normalEnd = startM.clone().hour(17).minute(30).second(0);
    if (!startM.isBefore(normalStart) && !endM.isAfter(normalEnd)) return 'normal';
    return 'day';
}

// 計算請假總有效工時 (扣除午休與夜班休息) - 逐日切分
function calcEffectiveLeaveHours(startM, endM) {
    if (!startM || !endM || !endM.isAfter(startM)) return { totalHours:0, lunchDeduct:0, nightDeduct:0, shiftType:null };
    let cursor = startM.clone().startOf('day');
    const lastDay = endM.clone().startOf('day');
    let total = 0;
    let lunchDeduct = 0;
    let nightDeduct = 0;
    const shiftType = decideShift(startM, endM); // 粗略分類供摘要

    while (!cursor.isAfter(lastDay)) {
        const dayStart = cursor.clone();
        const dayEnd = dayStart.clone().add(1,'day');
        // 當天與請假交集
        const segStart = moment.max(startM, dayStart);
        const segEnd = moment.min(endM, dayEnd);
        if (!segEnd.isAfter(segStart)) { cursor.add(1,'day'); continue; }

        // 原始當日小時
        let dayHours = segEnd.diff(segStart,'hours', true);

        // 午休扣除 (每一天只扣 1 小時，依班次窗口判定是否覆蓋午休)
        if (shiftType === 'normal' || shiftType === 'day') {
            const lunchStartStr = shiftType === 'normal' ? NORMAL_LUNCH_START : DAY_LUNCH_START;
            const lunchEndStr = shiftType === 'normal' ? NORMAL_LUNCH_END : DAY_LUNCH_END;
            const lunchStart = buildMoment(segStart.format('YYYY-MM-DD'), lunchStartStr);
            const lunchEnd = buildMoment(segStart.format('YYYY-MM-DD'), lunchEndStr);
            const lunchOverlap = overlapHours(segStart, segEnd, lunchStart, lunchEnd);
            if (lunchOverlap >= 0.25) { // 有覆蓋 15 分以上就視為扣一小時
                lunchDeduct += 1;
                dayHours -= 1;
            }
        }

        // 夜班扣除：若此段含夜班區間 (跨 20:00 至次日 08:00) 扣 1 小時 (僅一次/日)
        if (shiftType === 'night') {
            const nightStart = buildMoment(segStart.format('YYYY-MM-DD'), NIGHT_SHIFT_START);
            const nightEnd = nightStart.clone().add(12,'hours'); // 到翌日 08:00
            const nightOverlap = overlapHours(segStart, segEnd, nightStart, nightEnd);
            if (nightOverlap > 0) {
                nightDeduct += 1;
                dayHours = Math.max(0, dayHours - 1);
            }
        }

        total += dayHours;
        cursor.add(1,'day');
    }
    return { totalHours: total, lunchDeduct, nightDeduct, shiftType };
}


// const timeArray = [
//     '00 21 * * *' , 
//     '00 9 * * *'
// ]

// // 每天的 00:30 執行 
// timeArray.forEach(cronTime => {
//     schedule.scheduleJob(cronTime, () => {
//         console.log(`排程啟動: 於 ${cronTime} 執行每日請假彙總通知...`);
//         sendDailyLeaveNotifications();
//     });
// });



// 更新排班紀錄的職位區域
const ScheduleTrackRecord = async (items) =>{
    console.log ("進入 ScheduleTrackRecord :" , items , "check Item's type :" , typeof items);

   if (Array.isArray(items) && items.length === 0){
        console.log("No items to process in ScheduleTrackRecord");
        return;
   }
    
    try{
        const results = [];
        const itemsArray = Array.isArray(items) ? items : [items]; // 確保 items 是陣列

        const oldValues = items.map(i => `'${i.old}'`).join(',');
        const cases = items.map(i => `WHEN '${i.old}' THEN '${i.new}'`).join(' ');

        const sql = ` UPDATE hr.schedule_trackrecord 
                SET PositionArea = CASE PositionArea 
                    ${cases}
                    ELSE PositionArea 
                END
                WHERE PositionArea IN (${oldValues}); `;

        const [result] = await dbcon.query(sql);
        results.push(result);

    }catch(error){
        console.log("Error in ScheduleTrackRecord :" , error);
        throw error;
    }


}

// ------------------------------------------------------------------
// 1. 抓取昨天的請假紀錄 (使用參數化查詢)
// ------------------------------------------------------------------
const original_annualLeave_check = async (connection) => {

    const yesterday = moment().subtract(1, 'days');
    const yesterdayStart = yesterday.clone().startOf('day').format("YYYY/MM/DD") + " 上午 12:00:00";
    const yesterdayEnd = yesterday.clone().endOf('day').format("YYYY/MM/DD") + " 下午 11:59:59";

    // // (google sheet 請假)
    // const sql_dataFrom_originWay = `
    //     SELECT Name, MemID, LeaveSD, LeaveED , LeaveST , LeaveET
    //     FROM hr.leaverecord
    //     WHERE DateTime >= ? AND DateTime <= ? AND
    //     LeaveClass LIKE '%特休%'
    // `;
    // (系統請假)
    const sql_dataInnerOffice = `
    SELECT 
        employeeName,
        employeeNumber,
        leaveStartTime,
        leaveEndTime,
        leaveTotalHour
        From hr.absentsystem_leavesortoutall
        WHERE leaveType LIKE '%特休%' AND
        leaveStartTime >= ? AND leaveEndTime <= ?
    `
    try {
        // 使用傳入的 connection 執行查詢，並將日期作為參數傳入
        const [rows] = await connection.query(sql_dataInnerOffice, [yesterdayStart, yesterdayEnd]);
        // console.log(`Found ${rows.length} leave records from yesterday.` , rows);
        // console.log("Find Time  :", yesterdayStart , ' | ', yesterdayEnd);
        
        return rows;

    } catch (error) {
        console.log('Error in annual leave check:', error);
        throw error;
    }
}


// 協助函式：新增特休
// ...existing code...
const exeAddAnnualLeave = async () => {
  console.log("執行特休新增任務");

  const now = moment();
  const todayMonthDay = now.format("MM-DD");
  const checkDay = now.format("YYYY-MM-DD");

  const sql = `SELECT employeeNumber , employeeName , threeMonth , onBoardDate 
               FROM hr.absent_status 
               WHERE DATE_FORMAT(onBoardDate, '%m-%d') = ? OR threeMonth = ?`;

  const add_annualLeave_sql = `INSERT INTO hr.absent_status 
      (
          employeeNumber, 
          employeeName, 
          annualLeave_Balance, 
          recordTTime
      ) 
      VALUES ( ? , ? , ? , ? )
      ON DUPLICATE KEY UPDATE
      annualLeave_Balance = annualLeave_Balance + VALUES(annualLeave_Balance) , 
      recordTTime = VALUES(recordTTime)`;

  try {
    // 先用 pool.query 做唯讀查詢：pool 會自動取得/釋放連線，避免長時間佔用 connection
    const [originalData] = await dbcon.query(sql, [todayMonthDay, checkDay]);
    console.log("originalData :", originalData);

    if (!originalData || originalData.length === 0) {
      console.log("No employees found who need annual leave added today.");
      return;
    }

    // 只有在確定有需要寫入時才拿 connection 並開始 transaction
    let connection;
    try {
      connection = await dbcon.getConnection();
      await connection.beginTransaction();

      for (const data of originalData) {
        let daysToAdd = 0;

        // 安全地建立 moment 物件，僅在有效時使用
        const onBoardMoment = data.onBoardDate && moment(data.onBoardDate).isValid() ? moment(data.onBoardDate) : null;
        const threeMonthMoment = data.threeMonth && moment(data.threeMonth).isValid() ? moment(data.threeMonth) : null;
        const isTodayThreeMonth = threeMonthMoment && threeMonthMoment.isSame(now, "day");

        if (isTodayThreeMonth) {
          daysToAdd = 3;
          console.log(`[3M] Adding ${daysToAdd} days for ${data.employeeName}.`);
        } else if (onBoardMoment && onBoardMoment.format("MM-DD") === todayMonthDay) {
          const yearsOfService = now.diff(onBoardMoment, "years");
          if (yearsOfService >= 24) {
            daysToAdd = 30;
          } else {
            switch (yearsOfService) {
              case 1:
                daysToAdd = 7;
                break;
              case 2:
                daysToAdd = 10;
                break;
              case 3:
              case 4:
                daysToAdd = 14;
                break;
              case 5:
              case 6:
              case 7:
              case 8:
              case 9:
                daysToAdd = 15;
                break;
              case 10:
                daysToAdd = 16;
                break;
              case 11:
                daysToAdd = 17;
                break;
              case 12:
                daysToAdd = 18;
                break;
              case 13:
                daysToAdd = 19;
                break;
              case 14:
                daysToAdd = 20;
                break;
              case 15:
                daysToAdd = 21;
                break;
              case 16:
                daysToAdd = 22;
                break;
              case 17:
                daysToAdd = 23;
                break;
              case 18:
                daysToAdd = 24;
                break;
              case 19:
                daysToAdd = 25;
                break;
              case 20:
                daysToAdd = 26;
                break;
              case 21:
                daysToAdd = 27;
                break;
              case 22:
                daysToAdd = 28;
                break;
              case 23:
                daysToAdd = 29;
                break;
              default:
                daysToAdd = 0;
                break;
            }
          }
          console.log(`[Anniversary] ${data.employeeName} years: ${yearsOfService}, adding ${daysToAdd} days.`);
        }

        if (daysToAdd > 0) {
          const parameters = [data.employeeNumber, data.employeeName, daysToAdd, now.toDate()];
          await connection.query(add_annualLeave_sql, parameters);
          console.log("Annual leave successfully updated/added for " + data.employeeName);
        }
      }

      await connection.commit();
      console.log("特休新增任務成功完成並提交交易。");
    } catch (err) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rbErr) {
          console.error("Rollback failed:", rbErr);
        }
      }
      console.error("Error in adding annual leave (transaction):", err);
      throw err;
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (relErr) {
          console.error("Connection release failed, destroying connection:", relErr);
          try { connection.destroy(); } catch (_) {}
        }
      }
    }
  } catch (err) {
    // pool.query 或其他早期錯誤
    console.error("Error in adding annual leave:", err);
    throw err;
  }
};

// 計算請假紀錄
const executAnnualLeaveTask = async () => {
    console.log("執行每日下午3點的特休扣除任務");

    let connection;
    
    try {
        // 1. 取得連線並開始交易 (Transaction)
        connection = await dbcon.getConnection();
        await connection.beginTransaction();
        
        // 2. 抓到昨天有請特休的人員名單
        const originalData = await original_annualLeave_check(connection);

        if (!originalData || originalData.length === 0) {
            console.log("No original annual leave data found for yesterday.");
            await connection.commit();
            return;
        }

        // 3. 處理每一筆請假紀錄 
        for (const data of originalData) {
                let leaveTotalTime = 0; // 儲存請假小時數(未依天數減非上班時間用)
                let leaveFinalTime = 0; // 儲存請假小時數(用以存取正確請假小時數)

                // 從系統請假資料抓取，已是 DATETIME 格式，直接轉成 moment
                const startMoment = moment(data.leaveStartTime);
                const endMoment = moment(data.leaveEndTime);
                
                if (!startMoment.isValid() || !endMoment.isValid() || !endMoment.isAfter(startMoment)) {
                    console.log(`起迄時間不合法，跳過: ${data.employeeName} (${data.employeeNumber})`); 
                    continue;
                }

                // 計算有效請假時數 (扣休息) + 午休 / 夜班處理
                const eff = calcEffectiveLeaveHours(startMoment, endMoment);
                leaveFinalTime = eff.totalHours;
                leaveTotalTime = endMoment.diff(startMoment,'hours', true);

                console.log(`員工:${data.employeeName} 原始:${leaveTotalTime.toFixed(2)}h 有效:${leaveFinalTime.toFixed(2)}h 午休扣:${eff.lunchDeduct}h 夜班扣:${eff.nightDeduct}h 班次:${eff.shiftType}`);

                // 轉為特休天數 (以 8 小時為 1 天)
                const daysToDeduct = leaveFinalTime / WORK_HOURS_PER_DAY;
                console.log("daysToDeduct  :" , daysToDeduct)
                const memberNumber = String(data.employeeNumber).replace(/^0+/ , "")

                const [beforeRows] = await connection.query(
                    `SELECT annualLeave_Balance FROM hr.absent_status WHERE employeeName = ? AND employeeNumber = ?`,
                    [data.employeeName, memberNumber]
                );
                const beforeRaw = beforeRows && beforeRows[0] ? beforeRows[0].annualLeave_Balance : null;
                const beforeBalance = beforeRaw == null ? null : parseFloat(beforeRaw);
                // console.log("beforeRows 到底是啥  : " , beforeRows[0].annualLeave_Balance)
                // console.log("memberNumber :" , memberNumber)
                // console.log("beforeBalance  : " , beforeBalance)


                // 抓取目前特休餘額
                // 以原子遞減方式扣除，避免整筆覆蓋錯誤 (僅扣此次計算的 daysToDeduct)
                const [updResult] = await connection.query(
                    `UPDATE hr.absent_status
                     SET annualLeave_Balance = GREATEST(0, CAST(annualLeave_Balance AS DECIMAL(10,4)) - ?)
                     WHERE employeeName = ? AND employeeNumber = ?`,
                    [Number(daysToDeduct.toFixed(4)), data.employeeName, memberNumber]
                );
                // 驗證更新後值
                const [afterRows] = await connection.query(
                    `SELECT annualLeave_Balance FROM hr.absent_status WHERE employeeName = ? AND employeeNumber = ?`,
                    [data.employeeName, memberNumber]
                );
                const afterRaw = afterRows && afterRows[0] ? afterRows[0].annualLeave_Balance : null;
                const afterBalance = afterRaw == null ? null : parseFloat(afterRaw);
                console.log(`更新 ${data.employeeName}(${memberNumber}) 餘額: 前=${beforeBalance} 扣=${daysToDeduct.toFixed(4)} 後=${afterBalance} affectedRows=${updResult && updResult.affectedRows}`);
            }
        
        // 4. 提交交易
        await connection.commit();
        console.log("特休扣除任務成功完成並提交交易。");

    } catch (error) {
        // 5. 失敗則回滾
        if (connection) {
            await connection.rollback();
            console.log("任務失敗，已執行回滾 (Rollback)。所有資料庫變更已撤銷。");
        }
        console.error("執行每日特休扣除任務時發生錯誤：", error);
    } finally {
        // 6. 釋放連線
        if (connection) {
            connection.release();
        }
    }
}



const leaveDataScheduleTimes = [
    '0 8 * * *',    // 08:00
    '30 13 * * *',  // 13:30
    '30 17 * * *',  // 17:30
    '30 20 * * *',  // 20:30
    '30 2 * * *'    // 02:30
];

// 同步請假資料 排程設定
leaveDataScheduleTimes.forEach(cronTime => {
    schedule.scheduleJob(cronTime, async () => {
        console.log(`[排程] leaveData schedule triggered at ${moment().format('YYYY-MM-DD HH:mm:ss')}`);

        const currentIP = getServerIP();
        const allowedIP = '192.168.3.207';
        
        if (currentIP !== allowedIP) {
            console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
            return;
        }
        
        try{
            
            const syncData = await syncUnsyncedLeaveData() // 同步請假資料
            const deleteResult = await deleteData(); // 刪除已同步超過七天的資料
            const renewOutsideDb = await leaveStatusChange() // 更新外部請假資訊
            
            console.log('Leave data sync result:', syncData);
            console.log('Delete old data result:', deleteResult);
            console.log('Renew outside DB result:', renewOutsideDb);

        }catch (error){
            console.error('Error during leave data sync:', error);
            throw error;
        }
    });
});

// 將 google sheet 請假資料同步至內部系統
const schedule_CheckGoogleSheet_LeaveApply = schedule.scheduleJob('0 9 * * *', async () => {
    const currentIP = getServerIP();
    const allowedIP = '192.168.3.207';

    if (currentIP !== allowedIP) {
    console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
    return;
    }

    try{
        const result = await syncedGoogleSheetLeaveIDs_Data(); //抓取 google sheet 請假資料並整理
         console.log('Google Sheet leave data to sync :', result);

        const syncResults = await syncedGoogleSheetLeaveIDs(result); // 同步google sheet請假資料到db
        console.log('Google Sheet leave sync result:', syncResults);

    }catch (error){
        console.error('Error during Google Sheet leave check:', error);
        throw error;
    }
    

})

// 每天中午12:00（台灣時間 UTC+8）執行特休扣除任務
const schedule_For_annualLeave = schedule.scheduleJob('0 12 * * *', async () => {
    const currentIP = getServerIP();
    const allowedIP = '192.168.3.207';
    
    if (currentIP !== allowedIP) {
        console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
        return;
    }
    
    try {
        await executAnnualLeaveTask(); // 執行特休扣除任務
        await exeAddAnnualLeave(); // 同時執行特休新增任務
        console.log('executAnnualLeaveTask 已於每日中午12:00執行');
    } catch (error) {
        console.error('executAnnualLeaveTask 執行失敗:', error);
    }
});

// 同步google sheet 請假資料至內部系統-1
const checkNowPosition = async (employeeNumber) => {

    let sql = `SELECT positionarea , authPosition , memberID FROM hr.schedule_reginfo WHERE memberID IN (?)`;
    let params = [Array.isArray(employeeNumber) ? employeeNumber : [employeeNumber]];
    
    try{
        const [rows] = await dbcon.query(sql, params);
        console.log ('Check Now Position rows :', rows);
        return rows
        
        
    }catch (error){
        console.error('Error during checkNowPosition:', error);
        throw error;
    }
}

// 同步google sheet 請假資料至內部系統-2
const syncedGoogleSheetLeaveIDs_Data = async () => {
    const yesterday = moment().subtract(1, 'days');
    // SQL 比對字串建議統一格式，但最好還是改資料庫型別
    const startStr = yesterday.format('YYYY/MM/DD') + ' 上午 00:00:00';
    let sql = `SELECT * FROM hr.leaverecord WHERE DateTime >= ?`;
    
    try {
        const [rows] = await dbcon.query(sql, [startStr]);
        console.log('Google Sheet leave check rows :', rows.length);

        if (!Array.isArray(rows) || rows.length === 0) return [];

        const totalLeaveDataPromises = rows.map(async (row) => {

            const startStr = `${row.LeaveSD} ${row.LeaveST}`;
            const endStr = `${row.LeaveED} ${row.LeaveET}`;
            const startMoment = moment(startStr, 'YYYY/M/D A h:mm:ss', 'zh-tw');
            const endMoment = moment(endStr, 'YYYY/M/D A h:mm:ss', 'zh-tw');
            const applyTimeMoment = moment(row.DateTime, 'YYYY/M/D A h:mm:ss', 'zh-tw');

            // 檢查是否解析成功
            if (!startMoment.isValid() || !endMoment.isValid()) {
                console.error(`請假時間解析失敗: ${row.MemID}`, startStr, endStr);
                return null;
            }

            // 驗證 applyTime 是否解析成功
            if (!applyTimeMoment.isValid()) {
                console.warn(`申請時間解析失敗: ${row.MemID}, DateTime: ${row.DateTime}`);
            }

            let memberArray = [row.MemID , row.MemID.replace(/^0+/ , "")]
            
            const [memberData] = await checkNowPosition(memberArray);
            console.log('memberData  :' , memberData)

            Array.isArray(memberData) && 
            memberData.length > 0 ? console.log('找到對應職位資料  :', memberData) 
            : console.log('未找到對應職位資料  :', row.MemID)
            
            // 正規化員工編號做比對 (移除前導零)
            const normalizedMemID = row.MemID ? String(row.MemID).replace(/^0+/ , "") : null;
            const normalizedMemberID = memberData?.memberID ? String(memberData.memberID).replace(/^0+/ , "") : null;
            
            // 產生唯一 ID (使用沒有前導零的員工編號+請假開始時間+請假類型)
            const uniqueId = `${normalizedMemID}_${startMoment.format('YYYYMMDDHHmmss')}_${row.LeaveClass}`;

            return {
                employeeNumber: normalizedMemID,
                employeeName: row.Name ? row.Name : null,
                leaveType: row.LeaveClass? row.LeaveClass : null,
                leaveStartTime: startMoment.format('YYYY-MM-DD HH:mm:ss'),
                leaveEndTime: endMoment.format('YYYY-MM-DD HH:mm:ss'),
                leaveTotalHour: endMoment.diff(startMoment, 'hours', true),
                positionarea: normalizedMemID === normalizedMemberID ? memberData.positionarea : null,
                authPosition: normalizedMemID === normalizedMemberID ? memberData.authPosition : null,
                describtion: row.LeaveReason? row.LeaveReason : null,
                applyTime: applyTimeMoment.isValid() ? applyTimeMoment.format('YYYY-MM-DD HH:mm:ss') : null,
                errorStatusNotify: '4',
                randomuniqueid: uniqueId
            };
        });

        // 等待所有 Promise 完成
        const totalLeaveData = (await Promise.all(totalLeaveDataPromises)).filter(item => item !== null);

        console.log('轉換後的資料：', totalLeaveData.length, '筆');
        return totalLeaveData;

    } catch (error) {
        console.error('Error during Google Sheet leave check:', error);
        throw error;
    }
}
// 同步請假資料至內部系統 -3

// 更新讓外部請假系統可以看到7天內請假是否核可資訊
const leaveStatusChange = async () =>{

    let sevenDaysAgo = moment().subtract(7, 'days').tz("Asia/Taipei").format("YYYY-MM-DD HH:mm:ss");

    try{
        const insideLeave_sql = `
            SELECT randomuniqueid, managerSubmitTime, errorStatusNotify, managerName 
            FROM hr.absentsystem_leavesortoutall 
            WHERE randomuniqueid IS NOT NULL 
            AND applyTime >= ?
        `;
        const [insideRows] = await dbcon.query(insideLeave_sql, [sevenDaysAgo]);

        if (insideRows.length === 0) {
            return { success: true, message: '沒有需要同步的資料' };
        }

        let updatedCount = 0;

        for (const insideRow of insideRows) {
            try {
                // 將內部狀態碼轉換為外部狀態文字
                let externalStatus = '待審核';
                switch (insideRow.errorStatusNotify) {
                    case '3': externalStatus = '已核准'; break;
                    case '4': externalStatus = '待審核'; break;
                    case '5': externalStatus = '已拒絕'; break;
                }
                
                // 更新外部資料庫
                const updateSql = `
                    UPDATE leave_applications 
                    SET status = $1, approved_at = $2, approved_by = $3
                    WHERE randomuniqueid = $4
                `;
                
                const result = await leaveApply_Db.query(updateSql, [
                    externalStatus,
                    insideRow.managerSubmitTime,
                    insideRow.managerName || null,
                    insideRow.randomuniqueid
                ]);
                
                if (result.rowCount > 0) {
                    updatedCount++;
                    console.log(`✅ 更新外部狀態: ${insideRow.randomuniqueid} → ${externalStatus}`);
                }
                
            } catch (rowError) {
                console.error(`❌ 更新單筆失敗 ${insideRow.randomuniqueid}:`, rowError.message);
            }
        }
        
        console.log(`🎉 外部請假資訊更新完成！共更新 ${updatedCount} 筆`);
        return { success: true, message: `外部請假資訊更新完成，共 ${updatedCount} 筆`, updatedCount };

    }catch (error){
        console.error('更新外部請假資訊失敗:', error);
        throw error;
    }
}

// 同步google sheet 請假資料至內部系統- 4
const syncedGoogleSheetLeaveIDs = async(dataList) =>{
    
    try{
        if (!Array.isArray(dataList) || dataList.length === 0) {
            return { success: true, message: "沒有可同步的資料", inserted: 0 };
        }

        // 只保留有必要欄位的資料
        const validRows = dataList.filter(row =>
            row.employeeNumber && row.employeeName && row.leaveStartTime
        );

        if (validRows.length === 0) {
            return { success: true, message: "無有效資料", inserted: 0 };
        }

        // 取得現有 randomuniqueid，避免重複插入
        const uniqueIds = validRows.map(r => r.randomuniqueid).filter(Boolean);
        let existSet = new Set();
        
        if (uniqueIds.length > 0) {
            const placeholders = uniqueIds.map(() => '?').join(',');
            const [existingRows] = await dbcon.query(
                `SELECT randomuniqueid FROM absentsystem_leavesortoutall WHERE randomuniqueid IN (${placeholders})`,
                uniqueIds
            );
            existSet = new Set(existingRows.map(r => r.randomuniqueid));
        }

        // 準備批量插入資料
        const now = moment().format("YYYY-MM-DD HH:mm:ss");
        const values = [];
        
        for (const row of validRows) {
            // 跳過已存在的 randomuniqueid
            if (existSet.has(row.randomuniqueid)) {
                console.log(`跳過已存在資料: ${row.randomuniqueid}`);
                continue;
            }

            values.push([
                null, // workType
                row.employeeNumber,
                row.employeeName,
                row.leaveType,
                row.leaveStartTime,
                row.leaveEndTime,
                row.leaveTotalHour || 0,
                row.applyTime || null, // applyTime - 從 Google Sheet 的 DateTime 欄位取得
                null, // managerSubmitTime
                null, // leaveFile
                row.positionarea ? JSON.stringify(row.positionarea) : null,
                row.describtion || null,
                row.errorStatusNotify || "4",
                null, // managerAuth
                null, // isManager
                null, // managerNumber
                null, // managerName
                row.authPosition ? JSON.stringify(row.authPosition) : null,
                null, // apply_folder_link
                1, // is_synced
                now, // synced_at
                row.randomuniqueid
            ]);
        }

        if (values.length === 0) {
            return { success: true, message: "全部資料都已同步過", inserted: 0 };
        }

        // 批量插入 SQL
        const sql = `
            INSERT INTO absentsystem_leavesortoutall (
                workType, employeeNumber, employeeName, leaveType, leaveStartTime, leaveEndTime, leaveTotalHour,
                applyTime, managerSubmitTime, leaveFile, positionarea, describtion, errorStatusNotify, 
                managerAuth, isManager, managerNumber, managerName, authPosition, apply_folder_link, 
                is_synced, synced_at, randomuniqueid
            ) VALUES ?
        `;

        // 分批插入，避免單次過大 (每次最多 200 筆)
        const CHUNK_SIZE = 200;
        let inserted = 0;
        
        for (let i = 0; i < values.length; i += CHUNK_SIZE) {
            const chunk = values.slice(i, i + CHUNK_SIZE);
            const [result] = await dbcon.query(sql, [chunk]);
            inserted += result.affectedRows || chunk.length;
            console.log(`已插入 ${i + chunk.length}/${values.length} 筆`);
        }

        console.log(`✅ 同步完成！新增 ${inserted} 筆，跳過 ${validRows.length - values.length} 筆重複資料`);
        return { success: true, message: `同步完成，新增 ${inserted} 筆`, inserted };
        
    }catch (error){
        console.error('Error during syncedGoogleSheetLeaveIDs:', error);
        throw error;
    }
}

const safeJsonArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

// 共用：轉成乾淨的 string array（給新增/納編用）
const safeStringArray = (v) =>
  safeJsonArray(v)
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

// ======================= 批次改名 / 舊DB更新 / PG同步 helpers =======================

// 只保留有效的 {old, new}，同一個 old 只保留最後一個 new
const dedupeRenames = (arr = []) => {
  const m = new Map();
  for (const r of Array.isArray(arr) ? arr : []) {
    const oldVal = String(r?.old ?? "").trim();
    const newVal = String(r?.new ?? "").trim();
    if (!oldVal || !newVal || oldVal === newVal) continue;
    m.set(oldVal, newVal);
  }
  return Array.from(m.entries()).map(([oldVal, newVal]) => ({
    old: oldVal,
    new: newVal,
  }));
};

// 舊DB(hr.schedule_reginfo)整欄改名：排除「目前是主管」的人（nowIsManager=1）
const applyScheduleReginfoRenames = async (column, renames = []) => {
  if (!["authPosition", "positionarea"].includes(column)) {
    throw new Error("invalid schedule_reginfo column");
  }
  const list = dedupeRenames(renames);
  const results = [];
  for (const r of list) {
    const sql = `
      UPDATE hr.schedule_reginfo s
      SET s.${column} = ?
      WHERE s.${column} = ?
        AND NOT EXISTS (
          SELECT 1
          FROM hr.absent_manager_roster m
          WHERE m.nowIsManager = 1
            AND m.memberID = s.memberID
        )
    `;
    const [ret] = await dbcon.query(sql, [r.new, r.old]);
    results.push({ ...r, affectedRows: ret?.affectedRows ?? 0 });
  }
  return results;
};

// 新DB(hr.absent_manager_roster)整欄改名：把 JSON array 裡等於 old 的值換成 new
const applyRosterRenames = async ({
  deptRenames = [],
  areaRenames = [],
  operator = "",
} = {}) => {
  const dList = dedupeRenames(deptRenames);
  const aList = dedupeRenames(areaRenames);
  if (dList.length === 0 && aList.length === 0) return [];

  const replaceByRules = (arr, rules) => {
    let changed = false;
    const out = (Array.isArray(arr) ? arr : []).map((v) => {
      const s = String(v ?? "");
      const hit = rules.find((r) => r.old === s);
      if (hit) {
        changed = true;
        return hit.new;
      }
      return v;
    });
    return { out, changed };
  };

  const [rows] = await dbcon.query(
    `SELECT memberID, authPosition, positionarea
     FROM hr.absent_manager_roster`
  );

  const changedIDs = [];

  for (const row of rows) {
    const memberID = row.memberID;
    const curDept = safeJsonArray(row.authPosition);
    const curArea = safeJsonArray(row.positionarea);

    const deptRes = dList.length
      ? replaceByRules(curDept, dList)
      : { out: curDept, changed: false };
    const areaRes = aList.length
      ? replaceByRules(curArea, aList)
      : { out: curArea, changed: false };

    if (!deptRes.changed && !areaRes.changed) continue;

    await dbcon.query(
      `UPDATE hr.absent_manager_roster
       SET authPosition = ?, positionarea = ?, updated_by = ?, updated_at = NOW()
       WHERE memberID = ?`,
      [
        JSON.stringify(deptRes.out ?? []),
        JSON.stringify(areaRes.out ?? []),
        operator || "",
        memberID,
      ]
    );

    changedIDs.push(memberID);
  }

  return changedIDs;
};

// 取回 roster 資料，轉成 PG upsert 需要的格式
const getRosterRowsByMemberIDs = async (memberIDs = []) => {
  const ids = (Array.isArray(memberIDs) ? memberIDs : [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await dbcon.query(
    `SELECT memberID, reg_schedulename, shift, positionarea, authPosition, authStatus, nowIsManager,
            created_by, updated_by
     FROM hr.absent_manager_roster
     WHERE memberID IN (${placeholders})`,
    ids
  );

  return rows.map((r) => ({
    memberID: String(r.memberID ?? "").trim(),
    reg_schedulename: r.reg_schedulename ?? null,
    shift: r.shift ?? null,
    positionarea: safeJsonArray(r.positionarea),
    authPosition: safeJsonArray(r.authPosition),
    authStatus: r.authStatus == null ? "" : String(r.authStatus),
    nowIsManager: Number(r.nowIsManager ?? 0),

    // ✅ 新增這兩個
    created_by: r.created_by == null ? null : String(r.created_by),
    updated_by: r.updated_by == null ? null : String(r.updated_by),
  }));
};

// 統計並寄送請假資訊給主管 通知要去審核

const schedule_SortLeaveApply = async() =>{
    
    try{
        const prisma = prismaHr;
        const notCheckedLeaves = await prisma.AbsentManagerRoster.findMany({
            where: {
                nowIsManager: true,
            },
            select: {
                memberID: true,
                reg_schedulename: true,
                
            }
            
        })
        
    }catch (error){
        console.error('Error during schedule_SortLeaveApply:', error);
        throw error;
    }
}


// 當內部請假時寄送 e-mail 通知主管
const sendLeaveNotifyToManager = async (memberID) => {
    console.log("Preparing to send leave notification for memberID:", memberID);

    try {
        if (!memberID) {
            throw new Error('sendLeaveNotifyToManager received an invalid memberID');
        }

        const prisma = prismaHr;

        // 1. 取得申請人基本資訊
        const applicant = await prisma.ScheduleRegInfo.findUnique({
            where: { memberID: memberID },
            select: {
                regScheduleName: true,
                positionArea: true,
                authPosition: true,
            }
        });

        if (!applicant) {
            console.warn(`Could not find applicant info for memberID: ${memberID}. Notification not sent.`);
            return;
        }

        const { regScheduleName, positionArea, authPosition } = applicant;

        // 2. 判斷申請人身分並找出應通知的主管
        const applicantIsManager = await prisma.AbsentManagerRoster.findFirst({
            where: {
                memberID: memberID,
                nowIsManager: true,
            },
        });

        let recipientMemberIDs = new Set();

        if (applicantIsManager) {
            // 申請人是主管，通知更高階主管
            console.log(`Applicant ${regScheduleName} is a manager. Finding their superiors.`);
            const applicantAuths = safeJsonArray(applicantIsManager.authPosition);
            if (applicantAuths.length > 0) {
                const superManagers = await prisma.AbsentManagerRoster.findMany({
                    where: {
                        nowIsManager: true,
                        memberID: { not: memberID }, // 排除自己
                        authStatus: { gte: String(applicantIsManager.authStatus) }, // 權階更高
                        authPosition: {
                            array_contains: applicantAuths,
                        },
                    },
                    select: { 
                        memberID: true ,
                        
                    }
                });
                superManagers.forEach(m => recipientMemberIDs.add(m.memberID));
            }
        } else {
            // 申請人是ㄧ般員工，通知部門主管
            console.log(`Applicant ${regScheduleName} is a general employee. Finding their managers.`);
            const managers = await prisma.AbsentManagerRoster.findMany({
                where: {
                    nowIsManager: true,
                    OR: [
                        { positionarea: { array_contains: [positionArea] } },
                        { authPosition: { array_contains: [authPosition] } }
                    ]
                },
                select: { memberID: true }
            });
            managers.forEach(m => recipientMemberIDs.add(m.memberID));
        }

        if (recipientMemberIDs.size === 0) {
            console.warn(`No managers found for applicant ${regScheduleName} (${memberID}). Notification not sent.`);
            return;
        }

        // 3. 取得所有應通知主管的 Email
        const managerInfos = await prisma.ScheduleRegInfo.findMany({
            where: {
                memberID: { in: Array.from(recipientMemberIDs) }
            },
            select: { memEmail: true }
        });

        const emailList = managerInfos.map(m => m.memEmail).filter(email => email);

        if (emailList.length === 0) {
            console.warn(`Found managers for ${regScheduleName}, but none have email addresses. Notification not sent.`);
            return;
        }

        console.log(`Sending notification to managers:`, emailList);

        // 4. 設定並寄送 Email
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.office365.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });

        const mailOptions = {
            from: `"公司請假系統" <${process.env.SMTP_USER}>`,
            to: emailList.join(', '),
            subject: `[請假申請通知] 員工 ${regScheduleName} 提出了一筆請假申請`,
            html: `
                <h3>您好，</h3>
                <p>員工 <strong>${regScheduleName} (工號: ${memberID})</strong> 提出了一筆請假申請。</p>
                <p>請登入系統查看詳細資訊並進行審核。</p>
                <hr>
                <p>此為系統自動發送的通知信，請勿直接回覆。</p>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Leave notification email sent successfully for ${regScheduleName}.`);

    } catch (error) {
        console.error('Error during sendLeaveNotifyToManager:', error);
        throw error;
    }
}


// MySQL(hr.absent_manager_roster) -> PG(absent_manager_roster) 同步（批量 upsert）
const syncManagerRosterToPG = async (dataList = [], opts = {}) => {
  if (!dataList || !Array.isArray(dataList) || dataList.length === 0) {
    return { success: true, processedCount: 0, message: "no data" };
  }

  const fallbackOperator = opts?.fallbackOperator
    ? String(opts.fallbackOperator).trim()
    : null;

  const normStr = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  const validData = dataList
    .filter((d) => d?.memberID && String(d.memberID).trim() !== "")
    .map((d) => {
      const memberID = String(d.memberID).trim();
      const reg_schedulename = d.reg_schedulename ?? null;
      const shift = d.shift ?? null;

      const positionarea = Array.isArray(d.positionarea)
        ? d.positionarea
        : safeJsonArray(d.positionarea);

      const authPosition = Array.isArray(d.authPosition)
        ? d.authPosition
        : safeJsonArray(d.authPosition);

      const authStatus =
        d.authStatus === undefined || d.authStatus === null
          ? ""
          : String(d.authStatus);

      const nowIsManager = Number(d.nowIsManager ?? 0);

      // 盡量不要送 null，避免把 PG 既有值覆蓋掉
      const created_by =
        normStr(d.created_by) || normStr(d.updated_by) || fallbackOperator;
      const updated_by =
        normStr(d.updated_by) || normStr(d.created_by) || fallbackOperator;

      return {
        memberID,
        reg_schedulename,
        shift,
        positionarea,
        authPosition,
        authStatus,
        nowIsManager,
        created_by,
        updated_by,
      };
    });

  if (validData.length === 0) {
    return { success: false, processedCount: 0, message: "no valid memberID" };
  }

  let client = null;
  let tx = false;

  try {
    client = await leaveApply_Db.connect();
    await client.query("BEGIN");
    tx = true;

    // 用 text[] 送 JSON 字串，SQL 端再 ::jsonb
    const upsertSql = `
      INSERT INTO absent_manager_roster (
        memberid,
        reg_schedulename,
        shift,
        positionarea,
        authposition,
        authstatus,
        nowismanager,
        created_by,
        updated_by,
        updated_at
      )
      SELECT
        unnest($1::text[]),
        unnest($2::text[]),
        unnest($3::text[]),
        unnest($4::text[])::jsonb,
        unnest($5::text[])::jsonb,
        unnest($6::text[]),
        unnest($7::int[]),
        unnest($8::text[]),
        unnest($9::text[]),
        CURRENT_TIMESTAMP
      ON CONFLICT (memberid)
      DO UPDATE SET
        reg_schedulename = EXCLUDED.reg_schedulename,
        shift = EXCLUDED.shift,
        positionarea = EXCLUDED.positionarea,
        authposition = EXCLUDED.authposition,
        authstatus = EXCLUDED.authstatus,
        nowismanager = EXCLUDED.nowismanager,
        updated_by = COALESCE(NULLIF(EXCLUDED.updated_by, ''), absent_manager_roster.updated_by),
        created_by = COALESCE(NULLIF(absent_manager_roster.created_by, ''), EXCLUDED.created_by),
        updated_at = CURRENT_TIMESTAMP;
    `;

    const params = [
      validData.map((d) => d.memberID),
      validData.map((d) => d.reg_schedulename),
      validData.map((d) => d.shift),
      validData.map((d) => JSON.stringify(d.positionarea || [])),
      validData.map((d) => JSON.stringify(d.authPosition || [])),
      validData.map((d) => d.authStatus),
      validData.map((d) => Number(d.nowIsManager || 0)),
      validData.map((d) => d.created_by),
      validData.map((d) => d.updated_by),
    ];

    await client.query(upsertSql, params);

    await client.query("COMMIT");
    tx = false;

    return {
      success: true,
      message: "pg sync ok",
      processedCount: validData.length,
    };
  } catch (err) {
    if (client && tx) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}
    }
    return { success: false, message: err.message, processedCount: 0 };
  } finally {
    if (client) {
      try {
        client.release();
      } catch (_) {}
    }
  }
};

const getOperatorInfo = async (memberID) => {
  if (!memberID) return null;
  const [rows] = await dbcon.query(
    `SELECT memberID, authStatus, authPosition, positionarea, nowIsManager
     FROM hr.absent_manager_roster
     WHERE memberID = ?
     LIMIT 1`,
    [memberID]
  );
  if (!rows.length) return null;
  const u = rows[0];
  u.authStatus = Number(u.authStatus ?? 0);
  u.authPosition = safeJsonArray(u.authPosition);
  u.positionarea = safeJsonArray(u.positionarea);
  return u;
};

/**
 * 取得主管清單
 * @param {Object} query - 查詢條件
 *   query.keyword - 搜尋關鍵字 (memberID 或 reg_schedulename)
 *   query.shift - 班別過濾
 *   query.includeInactive - 是否包含非在職主管 (nowIsManager = 0)
 * @returns {Array} 主管清單
 */
const getManagerList = async (query = {}) => {
  // 基本 SQL
  let sql = `
    SELECT
      id,
      memberID,
      reg_schedulename,
      shift,
      positionarea,
      authPosition,
      authStatus,
      nowIsManager,
      created_at,
      updated_at
    FROM hr.absent_manager_roster
    WHERE 1=1
  `;

  const params = [];

  // 預設只抓在職主管
  if (!query.includeInactive) {
    sql += " AND nowIsManager = 1";
  }

  // 關鍵字搜尋：工號或姓名
  if (query.keyword) {
    sql += " AND (memberID LIKE ? OR reg_schedulename LIKE ?)";
    const keywordPattern = `%${query.keyword}%`;
    params.push(keywordPattern, keywordPattern);
  }

  // 班別搜尋（可選）
  if (query.shift) {
    sql += " AND shift = ?";
    params.push(query.shift);
  }

  // 排序：建立時間由新到舊
  sql += " ORDER BY created_at DESC";

  const [rows] = await dbcon.query(sql, params);

  for (const r of rows) {
    r.authPosition = safeJsonArray(r.authPosition);
    r.positionarea = safeJsonArray(r.positionarea);
  }
  return rows;
};

router.get("/testAPI_FOR_count", async (req, res) => {
  try {
    await executAnnualLeaveTask();
    console.log("executAnnualLeaveTask 已於每日中午12:00執行");
  } catch (error) {
    console.error("executAnnualLeaveTask 執行失敗:", error);
  }
});

router.get("/checkleaveApplyStatus" , async (req, res) => {
    try{

        const response = await sendDailyLeaveNotifications();
        console.log('Daily leave notification result:', response);
        
        res.status(200).send("Daily leave notification process completed.");
        
    }catch(error){
        console.error('Error during checkleaveApplyStatus:', error);
        throw error;
    }
})

// 同步請假資料至內部系統 - Test主
router.get("/TestdataSchedule" , async (req, res) => {
    try{
        const syncData = await syncUnsyncedLeaveData() // 同步請假資料
        const deleteResult = await deleteData(); // 刪除已同步超過七天的資料
        const renewOutsideDb = await leaveStatusChange() // 更新外部請假資訊
        
        console.log('Leave data sync result:', syncData);
        console.log('Delete old data result:', deleteResult);
        console.log('Renew outside DB result:', renewOutsideDb);

    }catch (error){
        console.error('Error during leave data sync:', error);
        throw error;
    }
})

// 同步google sheet 請假資料至內部系統- Test 主
router.get("/test_googleSynced_leave" , async (req, res) => {
    
    try{
        const result = await syncedGoogleSheetLeaveIDs_Data(); //抓取 google sheet 請假資料並整理
         console.log('Google Sheet leave data to sync :', result);

        const syncResults = await syncedGoogleSheetLeaveIDs(result); // 同步google sheet請假資料到db

        console.log('Google Sheet leave sync result:', syncResults);
        res.status(200).send("Google Sheet leave sync test completed.");

    }catch (error){
        console.error('Error during Google Sheet leave check:', error);
        throw error;
    }
})

// 特休扣除測試路由
router.get("/testAPI_FOR_count" , async (req, res) => {

    try {
        await executAnnualLeaveTask();
        console.log('executAnnualLeaveTask 已於每日中午12:00執行');
    } catch (error) {
        console.error('executAnnualLeaveTask 執行失敗:', error);
    }
})

router.get("/exeAddAnnualLeave" , exeAddAnnualLeave)

// 用於減輕資料庫壓力
const deleteData = async () => {
    let sevenDaysAgo = moment().subtract(7, 'days').tz("Asia/Taipei").format("YYYY-MM-DD HH:mm:ss");
    try {
        
        // 過七天後刪除資料
        const sql = `
            DELETE FROM leave_applications 
            WHERE randomuniqueid IS NOT NULL 
              AND is_synced = $1 
              AND synced_at IS NOT NULL
              AND applied_at < $2 
        `;

        const params = [true, sevenDaysAgo];
        const result = await leaveApply_Db.query(sql, params);

        return {
            success: true,
            deletedCount: result.rowCount || 0
        };
    } catch (err) {
        console.error("❌ 刪除資料錯誤:", err);
        throw err;
    }
};


// HTTP 路由版本的刪除功能
router.get("/deleteData", async (req, res) => {
    try {
        const result = await deleteData();
        res.status(200).json({ 
            message: "刪除成功", 
            deletedCount: result.deletedCount
        });
    } catch (err) {
        console.error("❌ HTTP 刪除資料錯誤:", err);
        res.status(500).json({ 
            error: "刪除資料失敗", 
            message: err.message 
        });
    }
});


router.post("/postLeaveApply", upload.any(), async (req, res) => {
    console.log("Received body:", req.body);
    console.log("Received files:", req.files);

    const formData = req.body;
    const rawAuthPosition = formData.authPosition;
    const rawPositionArea = formData.positionarea;

    console.log("Raw authPosition:", rawAuthPosition , "  | type:", typeof rawAuthPosition);
    console.log("Raw positionArea:", rawPositionArea , "  | type:", typeof rawPositionArea);

    const normalizeToList = (value) => {
        if (value === undefined || value === null) {
            return [];
        }

        if (Array.isArray(value)) {
            return value
                .map((item) => (typeof item === "string" ? item.trim() : item))
                .filter((item) => Boolean(item && String(item).trim()))
                .map((item) => (typeof item === "string" ? item.trim() : item));
        }

        if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) {
                return [];
            }

            try {
                const parsed = JSON.parse(trimmed);
                return normalizeToList(parsed);
            } catch (_) {
                return [trimmed];
            }
        }

        try {
            const parsed = JSON.parse(JSON.stringify(value));
            return normalizeToList(parsed);
        } catch (_) {
            return [];
        }
    };

    let authPositionList = [];
    let positionAreaList = [];
    if (Array.isArray(rawAuthPosition)) {
        authPositionList = rawAuthPosition
            .map(item => (typeof item === "string" ? item.trim() : item))
            .filter(item => item !== undefined && item !== null && String(item).trim() !== "")
            .map(item => String(item).trim());
    } else if (typeof rawAuthPosition === "string" && rawAuthPosition.trim() !== "") {
        const candidate = rawAuthPosition.trim();
        try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed)) {
                authPositionList = parsed
                    .map(item => (typeof item === "string" ? item.trim() : item))
                    .filter(item => item !== undefined && item !== null && String(item).trim() !== "")
                    .map(item => String(item).trim());
            } else if (typeof parsed === "string" && parsed.trim() !== "") {
                authPositionList = [parsed.trim()];
            } else {
                authPositionList = [candidate];
            }
        } catch (err) {
            authPositionList = [candidate];
        }
    }

    if (Array.isArray(rawPositionArea)) {
        positionAreaList = rawPositionArea
            .map(item => (typeof item === "string" ? item.trim() : item))
            .filter(item => item !== undefined && item !== null && String(item).trim() !== "")
            .map(item => String(item).trim());
    } else if (typeof rawPositionArea === "string" && rawPositionArea.trim() !== "") {
        const candidate = rawPositionArea.trim();
        try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed)) {
                positionAreaList = parsed
                    .map(item => (typeof item === "string" ? item.trim() : item))
                    .filter(item => item !== undefined && item !== null && String(item).trim() !== "")
                    .map(item => String(item).trim());
            } else if (typeof parsed === "string" && parsed.trim() !== "") {
                positionAreaList = [parsed.trim()];
            } else {
                positionAreaList = [candidate];
            }
        } catch (err) {
            positionAreaList = [candidate];
        }
    }

    try {
        const memberKey = formData.memberID ? String(formData.memberID).trim() : "";
        if (memberKey && (authPositionList.length === 0 || positionAreaList.length === 0)) {
            const [rosterRows] = await dbcon.query(
                `SELECT positionarea, authPosition FROM hr.absent_manager_roster WHERE memberID = ? LIMIT 1`,
                [memberKey]
            );

            if (Array.isArray(rosterRows) && rosterRows.length > 0) {
                const rosterData = rosterRows[0];
                if (authPositionList.length === 0) {
                    authPositionList = normalizeToList(rosterData.authPosition);
                }
                if (positionAreaList.length === 0) {
                    positionAreaList = normalizeToList(rosterData.positionarea);
                }
            }
        }
    } catch (rosterError) {
        console.error("postLeaveApply 取得 roster 權限失敗:", rosterError.message);
    }

    const serializedPositionArea = JSON.stringify(positionAreaList);
    const serializedAuthPosition = JSON.stringify(authPositionList);
    
    // 處理上傳的檔案
    const uploadedFiles = req.files ? req.files.map(file => ({
        fieldName: file.fieldname,  // file0, file1, file2, file3
        originalName: file.originalname,
        fileName: file.filename,
        path: file.path,
        size: file.size
    })) : [];


    let sql = `INSERT INTO hr.absentsystem_leavesortoutall 
        (
            employeeNumber,
            employeeName,
            leaveType,
            leaveStartTime,
            leaveEndTime,
            leaveTotalHour,
            leaveFile,
            describtion,
            positionarea,
            authPosition,
            errorStatusNotify,
            managerAuth,
            apply_folder_link,
            RandomUniqueId
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        const [rows] = await dbcon.query(sql, [
            formData.memberID,
            formData.name,
            formData.leaveType,
            formData.startDate,
            formData.endDate,
            formData.leaveTotalHour,
            JSON.stringify(uploadedFiles),
            formData.describtion,
            serializedPositionArea,
            serializedAuthPosition,
            formData.errorStatusNotify,
            formData.managerAuth,
            formData.apply_folder_link,
            crypto.randomUUID()
        ]);
        
        console.log("新增請假申請成功", rows);
        console.log("上傳的檔案資訊:", uploadedFiles);

        if (rows) {
            const response = await sendLeaveNotifyToManager(formData.memberID);
            console.log("請假通知已發送給主管 回應 response : " , response);
        }

        res.status(200).json({
            message: "新增請假申請成功",
            data: rows,
            uploadedFiles: uploadedFiles
        });
        
    } catch(err) {
        console.error("Error <<postLeaveApply>>:", err);
        res.status(500).json({
            error: "新增請假申請失敗，請稍後再試",
            message: err.message,
        });
    }
});




// 同步 NEON 資料庫中未同步的請假申請到本地資料庫
const syncUnsyncedLeaveData = async () => {
    const now = moment().locale("zh-tw").format("YYYY-MM-DD HH:mm:ss");
    
    try {
        // 1. 從 NEON 資料庫抓取未同步的資料 (is_synced = false 或 NULL)
        const sqlNeon = `
            SELECT * FROM leave_applications 
            WHERE (is_synced = false OR is_synced IS NULL)
            AND Status != '已取消'
            ORDER BY id DESC
        `;
        const neonResult = await leaveApply_Db.query(sqlNeon);
        const unsyncedData = neonResult.rows;
        
        console.log(`🔄 發現 ${unsyncedData.length} 筆未同步的 NEON 資料`);
        
        if (unsyncedData.length === 0) {
            console.log("🔎 NEON 無未同步資料，改檢查本地是否需要推送");
        }
        
        // 2. 從本地資料庫獲取現有的 randomuniqueid 建立對應 Map
        const sqlLocal = `SELECT randomuniqueid FROM hr.absentsystem_leavesortoutall WHERE randomuniqueid IS NOT NULL`;
        const [localResult] = await dbcon.query(sqlLocal);
        const existingIds = new Set(localResult.map(row => row.randomuniqueid));

        // 3. 欄位轉換設定
        const formatToTaipei = (value) => {
            if (!value) {
                return null;
            }

            const candidate = moment(value);
            if (!candidate.isValid()) {
                console.warn("syncUnsyncedLeaveData 無法解析日期:", value);
                return null;
            }

            return candidate.tz("Asia/Taipei").format("YYYY-MM-DD HH:mm:ss");
        };

        const normalizeJsonField = (value) => {
            if (value === null || value === undefined) {
                return null;
            }

            if (typeof value === "string") {
                const trimmed = value.trim();
                if (trimmed === "") {
                    return null;
                }
                return trimmed;
            }

            try {
                return JSON.stringify(value);
            } catch (err) {
                console.warn("syncUnsyncedLeaveData 無法序列化 JSON 欄位:", value, err.message);
                return null;
            }
        };

        const toNormalizedList = (value) => {
            if (!value && value !== 0) {
                return [];
            }

            if (Array.isArray(value)) {
                return value
                    .map((item) => (typeof item === "string" ? item.trim() : item))
                    .filter((item) => typeof item === "string" ? item !== "" : item !== undefined && item !== null)
                    .map((item) => (typeof item === "string" ? item.trim() : item));
            }

            if (typeof value === "string") {
                const candidate = value.trim();
                if (!candidate) {
                    return [];
                }

                try {
                    const parsed = JSON.parse(candidate);
                    return toNormalizedList(parsed);
                } catch (_) {
                    return [candidate];
                }
            }

            try {
                const parsed = JSON.parse(JSON.stringify(value));
                return toNormalizedList(parsed);
            } catch (_) {
                return [];
            }
        };

        const listToJson = (list) => {
            const normalized = toNormalizedList(list);
            return normalized.length > 0 ? JSON.stringify(normalized) : null;
        };

        const resolveMemberAccess = async (memberId) => {
            const memberKey = memberId !== undefined && memberId !== null
                ? String(memberId).trim()
                : "";

            if (!memberKey) {
                return { positionarea: null, authPosition: null };
            }

            try {
                const [scheduleRows] = await dbcon.query(
                    `SELECT positionarea, authPosition FROM schedule_reginfo WHERE memberID = ?`,
                    [memberKey]
                );

                if (Array.isArray(scheduleRows) && scheduleRows.length > 0) {
                    const schedulePosition = listToJson(scheduleRows[0].positionarea);
                    const scheduleAuth = listToJson(scheduleRows[0].authPosition);

                    if (schedulePosition || scheduleAuth) {
                        return {
                            positionarea: schedulePosition,
                            authPosition: scheduleAuth,
                        };
                    }
                }

                const [rosterRows] = await dbcon.query(
                    `SELECT positionarea, authPosition FROM hr.absent_manager_roster WHERE memberID = ?`,
                    [memberKey]
                );

                if (Array.isArray(rosterRows) && rosterRows.length > 0) {
                    return {
                        positionarea: listToJson(rosterRows[0].positionarea),
                        authPosition: listToJson(rosterRows[0].authPosition),
                    };
                }
            } catch (err) {
                console.error(`resolveMemberAccess 發生錯誤 (memberID: ${memberId}):`, err.message);
            }

            return { positionarea: null, authPosition: null };
        };

        const calcLeaveHours = (start, end) => {
            if (!start || !end) {
                return null;
            }

            const startMoment = moment(start, "YYYY-MM-DD HH:mm:ss", true);
            const endMoment = moment(end, "YYYY-MM-DD HH:mm:ss", true);

            if (!startMoment.isValid() || !endMoment.isValid()) {
                return null;
            }

            const diffHours = endMoment.diff(startMoment, "hours", true);
            return Number.isFinite(diffHours) ? diffHours : null;
        };

        const convertNeonToLocal = (neonRow) => ({
            id: neonRow.id,
            employeeNumber: neonRow.employee_id,
            employeeName: neonRow.employee_name,
            leaveType: neonRow.leave_type,
            leaveStartTime: formatToTaipei(neonRow.start_date),
            leaveEndTime: formatToTaipei(neonRow.end_date),
            positionarea: listToJson(neonRow.positionarea) || null,
            authPosition: normalizeJsonField(neonRow.authposition),
            applyTime: formatToTaipei(neonRow.applied_at),
            managerSubmitTime: formatToTaipei(neonRow.approved_at),
            describtion: neonRow.reason,
            managerName: neonRow.approved_by,
            apply_folder_link: normalizeJsonField(neonRow.apply_folder_link) || neonRow.apply_folder_link || null,
            errorStatusNotify: (() => {
                switch (neonRow.status) {
                    case "已核准": return "3";
                    case "待審核": return "4";
                    case "已拒絕": return "5";
                    default: return "4";
                }
            })(),
            randomuniqueid: neonRow.randomuniqueid
        });

        const statusCodeToText = (code) => {
            switch (code) {
                case "3":
                    return "已核准";
                case "5":
                    return "已拒絕";
                case "4":
                default:
                    return "待審核";
            }
        };

        const normalizeLocalDatetime = (value) => {
            if (!value) {
                return null;
            }

            const candidate = moment(value);
            if (!candidate.isValid()) {
                console.warn("syncUnsyncedLeaveData 無法正規化日期時間:", value);
                return null;
            }

            return candidate.format("YYYY-MM-DD HH:mm:ss");
        };

        const ensureRandomuniqueId = (value) => {
            if (typeof value === "string" && value.trim() !== "") {
                return value.trim();
            }
            if (value) {
                return String(value);
            }
            return crypto.randomUUID();
        };

        let syncedCount = 0;
        let skippedCount = 0;

        // 4. 同步未同步的資料
        for (const neonRow of unsyncedData) {
            try {
                // 檢查是否已存在於本地資料庫
                if (existingIds.has(neonRow.randomuniqueid)) {
                    console.log(`⏭️ 跳過已存在的資料 randomuniqueid: ${neonRow.randomuniqueid}`);
                    skippedCount++;
                    continue;
                }

                const localRowData = convertNeonToLocal(neonRow);
                const memberAccess = await resolveMemberAccess(localRowData.employeeNumber);

                const resolvedPositionarea = memberAccess.positionarea
                    || localRowData.positionarea
                    || null;

                const resolvedAuthPosition = memberAccess.authPosition
                    || localRowData.authPosition
                    || null;

                const resolvedLeaveHours = calcLeaveHours(
                    localRowData.leaveStartTime,
                    localRowData.leaveEndTime
                );

                // 插入到本地資料庫
                const insertSql = `
                    INSERT INTO hr.absentsystem_leavesortoutall (
                        employeeNumber,
                        employeeName,
                        leaveType,
                        leaveStartTime,
                        leaveEndTime,
                        positionarea,
                        authPosition,
                        applyTime,
                        managerSubmitTime,
                        describtion,
                        managerName,
                        apply_folder_link,
                        errorStatusNotify,
                        randomuniqueid,
                        is_synced,
                        synced_at,
                        leaveTotalHour
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const insertParams = [
                    localRowData.employeeNumber || null,
                    localRowData.employeeName || null,
                    localRowData.leaveType || null,
                    localRowData.leaveStartTime,
                    localRowData.leaveEndTime,
                    resolvedPositionarea,
                    resolvedAuthPosition,
                    localRowData.applyTime,
                    localRowData.managerSubmitTime,
                    localRowData.describtion || null,
                    localRowData.managerName || null,
                    localRowData.apply_folder_link || null,
                    localRowData.errorStatusNotify || null,
                    localRowData.randomuniqueid || null,
                    true,
                    now,
                    resolvedLeaveHours
                ];

                await dbcon.query(insertSql, insertParams);

                // 更新 NEON 資料庫的同步狀態
                const updateNeonSql = `
                    UPDATE leave_applications
                    SET is_synced = true, 
                    synced_at = NOW()
                    WHERE id = $1
                `;
                await leaveApply_Db.query(updateNeonSql, [neonRow.id]);

                syncedCount++;
                console.log(`✅ 同步完成 ID: ${neonRow.id}, randomuniqueid: ${neonRow.randomuniqueid}`);

            } catch (rowError) {
                console.error(`❌ 同步單筆資料失敗 ID: ${neonRow.id}:`, rowError.message);
            }
        }

        const sevenDaysAgo = moment().tz("Asia/Taipei").subtract(7, "days").format("YYYY-MM-DD HH:mm:ss");
        const nowTaipei = moment().tz("Asia/Taipei").format("YYYY-MM-DD HH:mm:ss");

        const [recentLocalRows] = await dbcon.query(
            `SELECT * FROM hr.absentsystem_leavesortoutall
             WHERE applyTime >= ?
               AND synced_at IS NULL `,
            [sevenDaysAgo]
        );

        let neonInsertedCount = 0;
        let neonUpdatedCount = 0;
        let neonPushSkipped = 0;

        for (const localRow of recentLocalRows) {
            try {
                const randomId = ensureRandomuniqueId(localRow.randomuniqueid);

                const selectExisting = await leaveApply_Db.query(
                    `SELECT id FROM leave_applications WHERE randomuniqueid = $1`,
                    [randomId]
                );

                const positionList = toNormalizedList(localRow.positionarea);
                const authList = toNormalizedList(localRow.authPosition);

                const neonParamsBase = [
                    localRow.employeeNumber || null,
                    localRow.employeeName || null,
                    localRow.leaveType || null,
                    normalizeLocalDatetime(localRow.leaveStartTime),
                    normalizeLocalDatetime(localRow.leaveEndTime),
                    positionList.length > 0 ? JSON.stringify(positionList) : null,
                    authList.length > 0 ? JSON.stringify(authList) : null,
                    normalizeLocalDatetime(localRow.applyTime) || nowTaipei,
                    normalizeLocalDatetime(localRow.managerSubmitTime),
                    localRow.describtion || null,
                    localRow.managerName || null,
                    statusCodeToText(localRow.errorStatusNotify),
                    localRow.apply_folder_link || null,
                    normalizeLocalDatetime(localRow.synced_at) || nowTaipei
                ];

                if (selectExisting.rowCount > 0) {
                    await leaveApply_Db.query(
                        `UPDATE leave_applications
                         SET employee_id = $1,
                             employee_name = $2,
                             leave_type = $3,
                             start_date = $4,
                             end_date = $5,
                             positionarea = $6,
                             authposition = $7,
                             applied_at = $8,
                             approved_at = $9,
                             reason = $10,
                             approved_by = $11,
                             status = $12,
                             apply_folder_link = $13,
                             is_synced = true,
                             synced_at = $14
                         WHERE randomuniqueid = $15`,
                        [...neonParamsBase, randomId]
                    );
                    neonUpdatedCount++;
                } else {
                    await leaveApply_Db.query(
                        `INSERT INTO leave_applications (
                             employee_id,
                             employee_name,
                             leave_type,
                             start_date,
                             end_date,
                             positionarea,
                             authposition,
                             applied_at,
                             approved_at,
                             reason,
                             approved_by,
                             status,
                             apply_folder_link,
                             is_synced,
                             synced_at,
                             randomuniqueid
                         ) VALUES (
                             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14, $15
                         )`,
                        [...neonParamsBase, randomId]
                    );
                    neonInsertedCount++;
                }

                await dbcon.query(
                    `UPDATE hr.absentsystem_leavesortoutall
                     SET randomuniqueid = ?,
                         synced_at = ?,
                         is_synced = 1
                     WHERE id = ?`,
                    [randomId, nowTaipei, localRow.id]
                );

            } catch (localSyncError) {
                neonPushSkipped++;
                console.error(`syncUnsyncedLeaveData 無法推送至 NEON (local id: ${localRow.id}):`, localSyncError.message);
            }
        }

        if (recentLocalRows.length > 0) {
            console.log(`📤 向 NEON 推送 ${neonInsertedCount + neonUpdatedCount} 筆資料 (新增 ${neonInsertedCount} / 更新 ${neonUpdatedCount} / 失敗 ${neonPushSkipped})`);
        }

        console.log(`🎉 同步完成！同步: ${syncedCount} 筆，跳過: ${skippedCount} 筆`);
        
        return {
            success: true,
            message: "同步完成",
            syncedCount,
            skippedCount,
            totalProcessed: unsyncedData.length,
            neonInsertedCount,
            neonUpdatedCount,
            neonPushSkipped
        };

    } catch (err) {
        console.error("❌ 同步過程發生錯誤:", err);
        throw err;
    }
};

router.get("/getLeaveApply", async (req, res) => {
    const { managerAuth, page = 1, pageSize = 20 } = req.query;
    
    console.log("Received query:", req.query);
    
    // 分页参数处理
    const limit = Math.max(1, parseInt(pageSize, 10) || 20);
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (currentPage - 1) * limit;
    
        // 從本地資料庫獲取資料（包含已同步的 NEON 資料）
        let sql = "";
        let params = [];
        let authPosition = []; // 抓到該人員ㄧ切可審核部門
        let sql_checkAuth = `SELECT authPosition FROM hr.absent_manager_roster WHERE memberID = ?`;
        
        try {
            const [authData] = await dbcon.query(sql_checkAuth, [managerAuth]);
            
            console.log("authData:", authData);
            
            if (typeof authData === 'object' && authData.length > 0) {
                authData.forEach(item => {
                    console.log("item.authPosition:", item.authPosition);
                    // 如果 authPosition 是 JSON 字串，需要解析
                    if (typeof item.authPosition === 'string') {
                        try {
                            const parsed = JSON.parse(item.authPosition);
                            if (Array.isArray(parsed)) {
                                authPosition.push(...parsed);
                            } else {
                                authPosition.push(parsed);
                            }
                        } catch (e) {
                            // 如果不是 JSON，直接當作字串處理
                            authPosition.push(item.authPosition);
                        }
                    } else if (Array.isArray(item.authPosition)) {
                        // 如果已經是陣列
                        authPosition.push(...item.authPosition);
                    } else {
                        // 其他情況直接 push
                        authPosition.push(item.authPosition);
                    }
                });
            } else {
                authPosition = [];
            }

        const normalizeAuthValue = (value) => {
            if (value === undefined || value === null) {
                return [];
            }

            if (Array.isArray(value)) {
                return value
                    .map((item) => (typeof item === "string" ? item.trim() : item))
                    .filter((item) => Boolean(item && String(item).trim()))
                    .map((item) => (typeof item === "string" ? item.trim() : item));
            }

            if (typeof value === "string") {
                const trimmed = value.trim();
                if (!trimmed) {
                    return [];
                }

                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        return parsed
                            .map((item) => (typeof item === "string" ? item.trim() : item))
                            .filter((item) => Boolean(item && String(item).trim()))
                            .map((item) => (typeof item === "string" ? item.trim() : item));
                    }
                    if (typeof parsed === "string" && parsed.trim() !== "") {
                        return [parsed.trim()];
                    }
                    return [];
                } catch (_) {
                    return [trimmed];
                }
            }

            try {
                const stringified = JSON.stringify(value);
                return normalizeAuthValue(stringified);
            } catch (_) {
                return [];
            }
        };

        const uniqueAuthPosition = [...new Set(normalizeAuthValue(authPosition))];

        console.log("最終 authPosition:", uniqueAuthPosition);

        if (uniqueAuthPosition.length === 0) {
            res.status(200).json({
                message: "該管理者無審核權限",
                data: [],
                totalCount: 0,
                totalPages: 0,
                page: currentPage,
                pageSize: limit
            });
            return;
        }

        else {

            console.log("確認 現在authPosition 內容 :" , typeof uniqueAuthPosition , " | " , uniqueAuthPosition);
            const jsonFilters = uniqueAuthPosition.map(() => "JSON_CONTAINS(authPosition, ?)");
            sql = `SELECT * FROM hr.absentSystem_leaveSortOutAll 
            WHERE errorStatusNotify NOT IN ("3", "5") 
            AND (${jsonFilters.join(" OR ")})
            ORDER BY id DESC`;

            const queryParams = uniqueAuthPosition.map((item) => JSON.stringify(item));

            try {
                const [LeaveApply] = await dbcon.query(sql, queryParams);

                const managerAuthSet = new Set(
                    uniqueAuthPosition
                        .map((item) => (typeof item === "string" ? item.trim() : item))
                        .filter((item) => Boolean(item && String(item).trim()))
                );

                const filterRowsByAuthCoverage = (rows) => {
                    return rows.filter((row) => {
                        const rowAuthList = normalizeAuthValue(row.authPosition);
                        if (rowAuthList.length === 0 || managerAuthSet.size === 0) {
                            return managerAuthSet.size > 0;
                        }
                        return rowAuthList.every((item) => managerAuthSet.has(item));
                    });
                };

                const filteredRows = filterRowsByAuthCoverage(LeaveApply);

                console.log("查詢語句:", sql);
                console.log("LeaveApply 原始資料筆數 :", LeaveApply.length);
                console.log("LeaveApply 經權限覆蓋篩選後 :", filteredRows.length);

                if (filteredRows.length === 0) {
                    res.status(200).json({
                        message: "沒有符合權限的待審核請假申請",
                        data: [],
                        totalCount: 0,
                        totalPages: 0,
                        page: currentPage,
                        pageSize: limit
                    });
                    return;
                }

                // 计算分页
                const totalCount = filteredRows.length;
                const totalPages = Math.ceil(totalCount / limit);
                
                // 取得当前页的数据
                const pagedRows = filteredRows
                    .slice(offset, offset + limit)
                    .map(row => ({
                        ...row,
                        leaveFile: row.leaveFile ? JSON.parse(row.leaveFile) : [],
                        dataSource: row.randomuniqueid ? "已同步NEON資料" : "本地資料"
                    }));

                return res.status(200).json({
                    message: "取得請假申請成功",
                    data: pagedRows,
                    totalCount,
                    totalPages,
                    page: currentPage,
                    pageSize: limit,
                    summary: {
                        syncedFromNeon: filteredRows.filter(row => row.randomuniqueid).length,
                        localOnly: filteredRows.filter(row => !row.randomuniqueid).length
                    }
                });

            } catch (error) {
                console.error("Error executing JSON filter query:", error);
                return res.status(500).json({ error: "查詢待審核請假資料時發生錯誤" });
            }
        }

    } catch(err) {
        console.error("Error <<getLeaveApply>>:", err);
        res.status(500).json({
            error: "取得請假申請失敗，請稍後再試",
            message: err.message,
        });
    }
})


// 文件下載 API
router.get("/download", (req, res) => {
    const { filename } = req.query;
    
    if (!filename) {
        return res.status(400).json({ error: "文件名稱是必需的" });
    }

    const filePath = path.join("Z:/資訊處- 存請假資訊/leaveFileWay", filename);
    
    // 檢查文件是否存在
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "文件不存在" });
    }

    try {
        // 設置下載標頭
        const originalName = filename.split('_').slice(3).join('_') || filename;
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        // 創建文件流並傳送
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('error', (error) => {
            console.error("文件讀取錯誤:", error);
            res.status(500).json({ error: "文件下載失敗" });
        });
        
    } catch (error) {
        console.error("下載文件錯誤:", error);
        res.status(500).json({ error: "下載文件時發生錯誤" });
    }
});

// 文件查看 API
router.get("/view", (req, res) => {
    const { filename } = req.query;
    
    if (!filename) {
        return res.status(400).json({ error: "文件名稱是必需的" });
    }

    const filePath = path.join("Z:/資訊處- 存請假資訊/leaveFileWay", filename);
    
    // 檢查文件是否存在
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "文件不存在" });
    }

    try {
        // 根據文件副檔名設置適當的 Content-Type
        const fileExtension = path.extname(filename).toLowerCase();
        let contentType = 'application/octet-stream';
        
        switch (fileExtension) {
            case '.pdf':
                contentType = 'application/pdf';
                break;
            case '.jpg':
            case '.jpeg':
                contentType = 'image/jpeg';
                break;
            case '.png':
                contentType = 'image/png';
                break;
            case '.gif':
                contentType = 'image/gif';
                break;
            case '.txt':
                contentType = 'text/plain; charset=utf-8';
                break;
            case '.doc':
                contentType = 'application/msword';
                break;
            case '.docx':
                contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                break;
            case '.xls':
                contentType = 'application/vnd.ms-excel';
                break;
            case '.xlsx':
                contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                break;
        }
        
        // 設置查看標頭
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
        
        // 創建文件流並傳送
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('error', (error) => {
            console.error("文件讀取錯誤:", error);
            res.status(500).json({ error: "文件查看失敗" });
        });
        
    } catch (error) {
        console.error("查看文件錯誤:", error);
        res.status(500).json({ error: "查看文件時發生錯誤" });
    }
});

router.put("/updateLeaveStatus" , async (req, res) => {
    const { id, errorStatusNotify ,  managerName , managerNumber} = req.body;
    console.log("Received body:", req.body);

    if (!id || !errorStatusNotify) {
        return res.status(400).json({ error: "請提供 id 和 errorStatusNotify" });
    }

  let sql = `UPDATE hr.absentSystem_leaveSortOutAll SET errorStatusNotify = ?, managerName = ?, managerNumber = ? WHERE id = ?`;
  let sql_changeNeonDB = `UPDATE leave_applications SET status = $1, approved_by = $2 WHERE randomuniqueid = $3`;

   try{
        // 先取得 randomuniqueid
        const [rows] = await dbcon.query(`SELECT randomuniqueid FROM hr.absentSystem_leaveSortOutAll WHERE id = ?`, [id]);
        if (rows.length === 0 || !rows[0].randomuniqueid) {
            console.log("此請假申請沒有對應的 NEON randomuniqueid，跳過 NEON 狀態更新");
        } else {
            const randomuniqueid = rows[0].randomuniqueid;
            let neonStatus = '待審核';
            switch (errorStatusNotify) {
                case '3': neonStatus = '已核准'; break;
                case '4': neonStatus = '待審核'; break;
                case '5': neonStatus = '已拒絕'; break;
            }
            const neonResult = await leaveApply_Db.query(sql_changeNeonDB, [neonStatus, managerName, randomuniqueid]);
            console.log("更新 NEON 請假申請狀態成功", neonResult);
        }
    
    }catch (error){
        console.error('Error updating NEON leave application status:', error);
        res.status(500).json({
            error: "更新 NEON 請假申請狀態失敗，請稍後再試",
            message: error.message,
        });
        return;
    }
    
    try {
        const [result] = await dbcon.query(sql, [errorStatusNotify, managerName, managerNumber, id]);
        console.log("更新請假申請狀態成功", result);

       
        
        res.status(200).json({
            message: "更新請假申請狀態成功",
            data: result
        });
        
    } catch(err) {
        console.error("Error <<updateLeaveApply>>:", err);
        res.status(500).json({
            error: "更新請假申請狀態失敗，請稍後再試",
            message: err.message,
        });
    }
})

router.get("/LeaveOverallRecord", async (req, res) => {
    const {
        managerAuth,
        authPosition,
        employeeNumber,
        searchInput,
        sortStartDate,
        sortEndDate,
        page = 1,
        pageSize = 10,
        status
    } = req.query;

    const normalizeList = (value) => {
        if (value === undefined || value === null) {
            return [];
        }

        if (Array.isArray(value)) {
            return value
                .map((item) => (typeof item === "string" ? item.trim() : item))
                .filter((item) => Boolean(item && String(item).trim()))
                .map((item) => (typeof item === "string" ? item.trim() : item));
        }

        if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) {
                return [];
            }

            try {
                const parsed = JSON.parse(trimmed);
                return normalizeList(parsed);
            } catch (_) {
                if (trimmed.includes(",")) {
                    return trimmed
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean);
                }
                return [trimmed];
            }
        }

        try {
            const serialized = JSON.stringify(value);
            return normalizeList(serialized);
        } catch (_) {
            return [];
        }
    };

    const toBoundary = (value, endOfDay = false) => {
        if (!value) {
            return null;
        }
        const candidate = moment(value);
        if (!candidate.isValid()) {
            return null;
        }
        const boundaryMoment = endOfDay
            ? candidate.endOf("day")
            : candidate.startOf("day");
        return boundaryMoment.format("YYYY-MM-DD HH:mm:ss");
    };

    const limit = Math.max(1, parseInt(pageSize, 10) || 10);
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (currentPage - 1) * limit;

    console.log("========== LeaveOverallRecord 開始 ==========");
    console.log("Received LeaveOverallRecord query:", req.query);

    try {
        const managerAuthSetBuilder = new Set();
        let enforceAuthFilter = false;

        if (managerAuth && String(managerAuth).trim() !== "") {
            const managerKey = String(managerAuth).trim();
            const [authRows] = await dbcon.query(
                `SELECT authPosition FROM hr.absent_manager_roster WHERE memberID = ?`,
                [managerKey]
            );

            console.log("查詢到的管理者權限資料:", authRows);

            authRows.forEach((row) => {
                normalizeList(row.authPosition).forEach((item) => managerAuthSetBuilder.add(item));
            });

            console.log("解析後的權限集合:", Array.from(managerAuthSetBuilder));

            if (managerAuthSetBuilder.has("所有部門")) {
                managerAuthSetBuilder.clear();
                console.log("管理者擁有「所有部門」權限，清空權限過濾");
            } else if (managerAuthSetBuilder.size === 0) {
                console.log("管理者無任何權限");
                return res.status(200).json({
                    message: "該管理者無審核權限",
                    data: [],
                    totalCount: 0,
                    totalPages: 0,
                    page: currentPage,
                    pageSize: limit
                });
            } else {
                enforceAuthFilter = true;
                console.log("啟用權限過濾，權限清單:", Array.from(managerAuthSetBuilder));
            }
        } else if (authPosition) {
            const normalized = normalizeList(authPosition);
            console.log("使用傳入的 authPosition:", normalized);
            if (normalized.includes("所有部門")) {
                managerAuthSetBuilder.clear();
            } else if (normalized.length > 0) {
                normalized.forEach((item) => managerAuthSetBuilder.add(item));
                enforceAuthFilter = true;
            }
        }

        const statusList = normalizeList(status).map((item) => String(item).trim()).filter(Boolean);
        const startBoundary = toBoundary(sortStartDate, false);
        const endBoundary = toBoundary(sortEndDate, true);
        
        console.log("篩選條件:");
        console.log("  - 狀態過濾:", statusList.length > 0 ? statusList : "無");
        console.log("  - 開始日期:", startBoundary || "無");
        console.log("  - 結束日期:", endBoundary || "無");
        console.log("  - 員工編號:", employeeNumber || "無");
        console.log("  - 搜尋關鍵字:", searchInput || "無");

        let sql = `SELECT * FROM hr.absentSystem_leaveSortOutAll WHERE 1=1`;
        const sqlParams = [];

        if (statusList.length > 0) {
            sql += ` AND errorStatusNotify IN (${statusList.map(() => "?").join(", ")})`;
            sqlParams.push(...statusList);
        }

        if (startBoundary) {
            sql += ` AND leaveStartTime >= ?`;
            sqlParams.push(startBoundary);
        }
        if (endBoundary) {
            sql += ` AND leaveEndTime <= ?`;
            sqlParams.push(endBoundary);
        }

        if (typeof searchInput === "string" && searchInput.trim() !== "") {
            const keyword = searchInput.trim();
            if (/^\d+$/.test(keyword)) {
                sql += ` AND employeeNumber LIKE ?`;
                sqlParams.push(`%${keyword}%`);
            } else {
                sql += ` AND employeeName LIKE ?`;
                sqlParams.push(`%${keyword}%`);
            }
        }

        if (enforceAuthFilter && managerAuthSetBuilder.size > 0) {
            const authFilters = Array.from(managerAuthSetBuilder).map(() => "JSON_CONTAINS(authPosition, ?)");
            sql += ` AND (${authFilters.join(" OR ")})`;
            sqlParams.push(...Array.from(managerAuthSetBuilder).map((item) => JSON.stringify(item)));
        }

        sql += ` ORDER BY applyTime DESC, id DESC`;

        console.log("執行 SQL:", sql);
        console.log("SQL 參數:", sqlParams);

        const [rows] = await dbcon.query(sql, sqlParams);
        
        // console.log(`SQL 查詢結果: ${rows.length} 筆資料`);
        if (rows.length > 0) {
            console.log("前 3 筆資料 ID:", rows.slice(0, 3).map(r => `id:${r.id}, auth:${JSON.stringify(r.authPosition)}`));
        }

        const managerAuthSet = enforceAuthFilter ? new Set(Array.from(managerAuthSetBuilder)) : new Set();

        const filterRowsByAuthCoverage = (records) => {
            if (!enforceAuthFilter || managerAuthSet.size === 0) {
                console.log("跳過權限覆蓋篩選");
                return records;
            }

            // console.log("開始權限覆蓋篩選，管理者權限:", Array.from(managerAuthSet));
            
            return records.filter((row) => {
                const rowAuthList = normalizeList(row.authPosition);
                console.log(`  - 檢查 id:${row.id}, rowAuth:${JSON.stringify(rowAuthList)}`);
                
                // 與 getLeaveApply 邏輯一致：如果沒有 authPosition 且管理者有權限，則保留
                if (rowAuthList.length === 0 || managerAuthSet.size === 0) {
                    const result = managerAuthSet.size > 0;
                    console.log(`    → authPosition 為空，結果: ${result}`);
                    return result;
                }
                
                const result = rowAuthList.every((item) => managerAuthSet.has(item));
                console.log(`    → every 檢查結果: ${result}`);
                return result;
            });
        };

        const filteredRows = filterRowsByAuthCoverage(rows);
        
        // console.log("LeaveOverallRecord 原始資料筆數:", rows.length);
        // console.log("LeaveOverallRecord 經權限覆蓋篩選後:", filteredRows.length);
        // console.log("========== LeaveOverallRecord 結束 ==========");

        const totalCount = filteredRows.length;
        const totalPages = Math.ceil(totalCount / limit);

        const pagedRows = filteredRows
            .slice(offset, offset + limit)
            .map((row) => ({
                ...row,
                leaveFile: row.leaveFile ? JSON.parse(row.leaveFile) : [],
                dataSource: row.randomuniqueid ? "已同步NEON資料" : "本地資料"
            }));

        res.status(200).json({
            message: "取得請假紀錄成功",
            data: pagedRows,
            totalCount,
            totalPages,
            page: currentPage,
            pageSize: limit
        });

    } catch (err) {
        console.error("Error <<LeaveOverallRecord>>:", err);
        res.status(500).json({
            error: "取得請假紀錄失敗，請稍後再試",
            message: err.message,
        });
    }
});



// 匯入請假 餘額 Excel 檔案並轉換為資料陣列 
const absentData_use = async (filePath) => {
    const COLUMN_MAPPING = {
        '員工工號': 'employeeNumber', 
        '員工姓名': 'employeeName', 
        '特休剩餘天數': 'annualLeave_Balance', 
        '補休剩餘天數': 'compensatory_Leave_Balance',
        '事假已請天數': 'personalLeave_Taken', 
        '病假已請天數': 'sickLeave_Taken',
        '生理假已請天數': 'menstrualLeave_Taken', 
        '婚假剩餘天數': 'marriage_Leave_Taken',
        '喪假剩餘天數': 'funeralLeave_Taken', 
        '產假剩餘天數': 'maternityLeave_Taken',
        '陪產假剩餘天數': 'paternityLeave_Taken', 
        '公傷假剩餘天數': 'workRelatedInjury_Leave_Taken'
    };
    
    const DB_COLUMNS_KEYS = Object.keys(COLUMN_MAPPING);

    try{
        const workbook = xlsx.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        // 使用 header: 1 讀取原始陣列
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetNames[0]], { header: 1 });

        if (!data || data.length < 2) {
             throw new Error("Excel 文件為空或缺少資料標題。");
        }
        
    // 取得標題列（去除前後空白，避免中英文空格導致對不到）
    const headers = data[0].map((h) => (h === undefined || h === null) ? '' : String(h).trim());
        const absentData = [];

        // 檢查必要的中文標題是否存在於 Excel 中
        const missingKeys = DB_COLUMNS_KEYS.filter(key => !headers.includes(key));
        if (missingKeys.length > 0) {
             throw new Error(`Excel 缺少必要的中文欄位標題: ${missingKeys.join(", ")}`);
        }

        // 逐行處理資料 (從第二行開始)
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const dataRow = {};

            for (let j = 0; j < headers.length; j++) {
                const excelHeader = headers[j];
                const dbColumn = COLUMN_MAPPING[excelHeader];
                
                if (dbColumn) {
                    let value = row[j];
                    // 去除字串前後空白
                    if (typeof value === 'string') value = value.trim();

                    // 將空字串統一視為 null
                    if (value === '') value = null;

                    // 針對 DECIMAL 欄位進行類型轉換
                    if (dbColumn.includes('Leave') || dbColumn.includes('dayleft') || dbColumn.includes('Balance')) {
                        // 確保天數相關的值是數字，如果為空則為 null
                        value = (value === null || value === undefined || value === '') ? null : parseFloat(value);
                        if (isNaN(value)) value = null; 
                        // 超小數值視為 0，避免科學記號造成髒資料
                        if (typeof value === 'number' && Math.abs(value) < 1e-8) value = 0;
                    }
                    
                    dataRow[dbColumn] = value;
                }
            }
            // 僅收錄有員工工號的資料列（避免空 key 造成唯一鍵 '' 重複）
            if (dataRow.employeeNumber !== null && dataRow.employeeNumber !== undefined && dataRow.employeeNumber !== '') {
                // 將工號標準化：去空白、字串化
                dataRow.employeeNumber = String(dataRow.employeeNumber).trim();
                absentData.push(dataRow);
            }
        }

        return absentData;

    }catch(err){
        console.error("Using insert Function Error " , err);
        throw err;
    }
}

// 匯入請假餘額資料到資料庫
const insertAbsentData = async (absentData) => {
    // 前置過濾：跳過沒有 employeeNumber 的資料列
    const validRows = (absentData || []).filter(r => r && r.employeeNumber !== undefined && r.employeeNumber !== null && String(r.employeeNumber).trim() !== '');
    if (validRows.length === 0) {
        throw new Error('Excel 內有效資料為 0：缺少有效的 員工工號');
    }

    // 依 employeeNumber 去重，保留最後一筆
    const dedup = new Map();
    for (const r of validRows) {
        const key = String(r.employeeNumber).trim();
        dedup.set(key, { ...r, employeeNumber: key });
    }
    const rows = Array.from(dedup.values());
    
    // 獲取一個連線 (Connection) 來啟動交易
    const connection = null;

    try{
        // 取得連線並啟動交易 (Transaction)
        connection = await dbcon.getConnection();
        await connection.beginTransaction();

        const columnNames = [
            'employeeNumber', 'employeeName', 'annualLeave_Balance', 
            'compensatory_Leave_Balance', 'personalLeave_Taken', 'sickLeave_Taken',
            'menstrualLeave_Taken', 'marriage_Leave_Taken', 'funeralLeave_Taken', 
            'maternityLeave_Taken', 'paternityLeave_Taken', 'workRelatedInjury_Leave_Taken',
            'onBoardDate' , 'threeMonth' , 'oneYear'
        ];
        
        // **優化點：轉換為二維陣列 (Values Array) 以供批量插入**
        const valuesToInsert = rows.map(row => [
            String(row.employeeNumber).trim(),
            row.employeeName || null,
            row.annualLeave_Balance ?? 0,
            row.compensatory_Leave_Balance ?? 0, 
            row.personalLeave_Taken ?? 0, 
            row.sickLeave_Taken ?? 0,
            row.menstrualLeave_Taken ?? 0, 
            row.marriage_Leave_Taken ?? 0,
            row.funeralLeave_Taken ?? 0, 
            row.maternityLeave_Taken ?? 0,
            row.paternityLeave_Taken ?? 0, 
            row.workRelatedInjury_Leave_Taken ?? 0
        ]);
        
        const sql = `
            INSERT INTO hr.absent_status (${columnNames.join(', ')})
            VALUES ?
            ON DUPLICATE KEY UPDATE
              ${columnNames
                .filter((c) => c !== 'employeeNumber')
                .map((c) => `${c} = VALUES(${c})`) // MySQL 5.7/8.0 兼容
                .join(', ')}
        `;

        // 執行查詢 (使用 chunk 分批避免單次過大)
        const CHUNK_SIZE = 200;
        for (let i = 0; i < valuesToInsert.length; i += CHUNK_SIZE) {
            const chunk = valuesToInsert.slice(i, i + CHUNK_SIZE);
            await connection.query(sql, [chunk]);
        }

        // 提交交易 (Commit)
        await connection.commit();

    } catch (err) {
        // **優化點：如果失敗，執行回滾（僅在已取得 connection 時）**
        if (connection) {
            try { await connection.rollback(); } catch (rbErr) { console.error('Rollback failed', rbErr); }
        }
        console.error("Insert Absent Data Error", err);
        throw err;
    } finally {
        // 確保連線被釋放或摧毀
        if (connection) {
            try {
                connection.release();
            } catch (relErr) {
                console.error('Release failed, destroying connection', relErr);
                try { connection.destroy(); } catch (_) {}
            }
        }
    }
}

// 匯入請假餘額資料 API
router.post("/insert_absentData_balance" , upload.single('excelFile') , async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    const filePath = req.file.path;
    let absentData;

    try{
        // 1. 解析 Excel
        absentData = await absentData_use(filePath);
        
        // 2. 批量插入資料庫 (最耗時步驟)
        await insertAbsentData(absentData);
        
        res.status(200).json({
            message: `成功匯入 ${absentData.length} 筆資料`,
        })
    }catch(err){
        // 3. 處理錯誤
        console.error("Using insert Function Error " , err);
        res.status(500).json({
             message: "匯入資料失敗",
             error: err.message 
        });
    } finally {
        // **必須修正：無論成功或失敗，都刪除暫存檔案**
        fs.unlink(filePath, (err) => {
            if (err) console.error("Error deleting temp file:", err);
        });
    }
})


router.get("/annualLeave_balance" , async (req , res) => {
    const {memberID , memberName} = req.query;
    console.log("Received data  :" , memberID , memberName);

    let sql = `SELECT annualLeave_Balance FROM hr.absent_status WHERE employeeNumber = ? AND employeeName = ?`;

    try{
        const [rows] = await dbcon.query(sql, [memberID, memberName]);
        console.log("Query Result :" , rows);
        
        let rowSend = rows[0];
        
        if (rowSend === undefined || rowSend.annualLeave_Balance === null || rowSend.annualLeave_Balance === undefined) {
            return res.status(200).json({
                annualLeave_Balance: 0
            })
        }
        else {
            return res.status(200).json({
                annualLeave_Balance: rows[0].annualLeave_Balance
            })
        }

    }catch(error){
        console.error("Error <<annualLeave_balance>>:", error);
        throw error
    }
})



router.get("/myLeaveRecord" , async (req , res) => {
    const {
        memberID,
        sortStartDate, // 來自前端的 YYYY-MM-DD 字符串
        sortEndDate,   // 來自前端的 YYYY-MM-DD 字符串
        page = 1,
        pageSize = 10
    } = req.query;

    console.log("Received query:", req.query);

    let sql = `SELECT * FROM absentsystem_leavesortoutall WHERE employeeNumber = ? AND leaveStartTime BETWEEN ? AND ? ORDER BY leaveStartTime DESC LIMIT ? OFFSET ?`;
    const limit = parseInt(pageSize, 10);
    const offset = (parseInt(page, 10) - 1) * limit;

    try{
        let start = moment(sortStartDate, 'YYYY-MM-DD').format('YYYY/MM/DD HH:mm:ss');
        let end = moment(sortEndDate, 'YYYY-MM-DD').format('YYYY/MM/DD HH:mm:ss');

        const params = [memberID, start, end, limit, offset];
        const [rows] = await dbcon.query(sql, params);
        console.log("Query Result :" , rows);

        // 取得總數量以計算總頁數
        let sql_count = `SELECT COUNT(id) AS total FROM absentsystem_leavesortoutall WHERE employeeName = ? AND leaveStartTime BETWEEN ? AND ?`;
        const params_count = [memberID, start, end];
        const [countRows] = await dbcon.query(sql_count, params_count);
        const total = countRows[0]?.total || 0;
        const totalPages = Math.ceil(total / limit);
        console.log("Total count:" , total);
        console.log("Total pages:" , totalPages);

        res.status(200).json({
            message: "取得請假紀錄成功",
            data: rows,
            pagenation : {
                total,
                totalPages,
                currentPage: page,
                pageSize: limit
            }
        })
        
    }catch(err){
        console.error("Error <<myLeaveRecord>>:", err);
        res.status(500).json({
            error: "取得請假紀錄失敗，請稍後再試",
            message: err.message,
        });

    
}});

// 暫時性使用 , 可以看到自己請了哪些假
router.get("/myLeaveRecord_temporary", async (req, res) => {
    const {
        // managerAuth,
        employeeName,
        sortStartDate, // 來自前端的 YYYY-MM-DD 字符串
        sortEndDate,   // 來自前端的 YYYY-MM-DD 字符串
        page = 1,
        pageSize = 10
    } = req.query;

    console.log("Received query:", req.query);


    const limit = parseInt(pageSize, 10);
    const offset = (parseInt(page, 10) - 1) * limit;

    let start = moment(sortStartDate, 'YYYY-MM-DD').format('YYYY/MM/DD');
    let end = moment(sortEndDate, 'YYYY-MM-DD').format('YYYY/MM/DD');


    let sql = `SELECT * FROM hr.leaverecord WHERE Name = ? AND
        STR_TO_DATE(LeaveSD , '%Y/%m/%d') BETWEEN 
        STR_TO_DATE (? , '%Y/%m/%d') AND
        STR_TO_DATE (? , '%Y/%m/%d')
        AND MemID NOT IN ('取消' , '申請')
        ORDER BY STR_TO_DATE(LeaveSD , '%Y/%m/%d') DESC
        LIMIT ? OFFSET ?
    `;
    const params = [employeeName, start, end, limit, offset];

    let sql_count = `SELECT COUNT(MemID) AS total FROM hr.leaverecord WHERE Name = ? AND
        STR_TO_DATE(LeaveSD , '%Y/%m/%d') BETWEEN 
        STR_TO_DATE (? , '%Y/%m/%d') AND
        STR_TO_DATE (? , '%Y/%m/%d')
        AND MemID NOT IN ('取消' , '申請')
    `;
    const params_count = [employeeName, start, end];

    // --- 5. 執行查詢 ---
    try {
        console.log("SQL Query:", sql);
        console.log("Params:", params);
        const [rows] = await dbcon.query(sql, params);
        console.log("Query Result :", rows);

        const [countRows] = await dbcon.query(sql_count, params_count);
        const total = countRows[0]?.total || 0;
        const totalPages = Math.ceil(total / limit);
        console.log("Total count:", total);
        console.log("Total pages:", totalPages);


        res.status(200).json({
            message: "取得請假紀錄成功",
            data: rows,
            pagenation : {
                total,
                totalPages,
                currentPage: page,
                pageSize: limit
            }
            // 這裡可以加上 totalPages: countResult.totalPages
        });

    } catch (error) {
        console.error("Error <<myLeaveRecord_temporary>>:", error);
        res.status(500).json({
            error: "取得請假紀錄失敗，請稍後再試",
            message: error.message,
        });
        
        throw error;
    }
});


router.get("/checkNowDepartment" , async (req , res) =>{
    const {} = req.query;
    console.log("有跑checkNowDepartment api ..."); 

    let allAuth = [];
    let allPos = [];

    try{
        const [rows] = await dbcon.query(`
            SELECT DISTINCT authPosition, positionarea FROM hr.absent_manager_roster
        `);
        
        console.log("取得部門資料成功" , rows); 
        
        rows.forEach(row => {
            // 安全處理 authPosition：確保不為 null/undefined 才解析
            let auth = [];
            if (row.authPosition) {
                if (Array.isArray(row.authPosition)) {
                    auth = row.authPosition;
                } else if (typeof row.authPosition === 'string') {
                    try {
                        auth = JSON.parse(row.authPosition);
                        if (!Array.isArray(auth)) auth = [];
                    } catch (e) {
                        console.warn("無法解析 authPosition:", row.authPosition, e);
                        auth = [];
                    }
                }
            }
            
            // 安全處理 positionarea：確保不為 null/undefined 才解析
            let pos = [];
            if (row.positionarea) {
                if (Array.isArray(row.positionarea)) {
                    pos = row.positionarea;
                } else if (typeof row.positionarea === 'string') {
                    try {
                        pos = JSON.parse(row.positionarea);
                        if (!Array.isArray(pos)) pos = [];
                    } catch (e) {
                        console.warn("無法解析 positionarea:", row.positionarea, e);
                        pos = [];
                    }
                }
            }
            
            allAuth.push(...auth);
            allPos.push(...pos);
        });


        let uniqueAuth = Array.from(new Set(allAuth))? Array.from(new Set(allAuth)) : [];
        let uniquePos = Array.from(new Set(allPos))? Array.from(new Set(allPos)) : [];
        
        console.log("uniqueAuth :" , uniqueAuth);
        console.log("uniquePos :" , uniquePos);

        res.status(200).json({
            message: "取得部門資料成功",
            uniqueAuth: uniqueAuth,
            uniquePos: uniquePos
        })
        
    }catch(err){
        console.error("Error <<checkNowDepartment>>:", err);
        res.status(500).json({
            error: "取得部門資料失敗，請稍後再試",
            message: err.message,
        });
    }
})


router.get("/check_isadmin" , async (req , res) =>{

 const {LoginId , LoginName} = req.query;

//  console.log("接收 LoginId = "+ LoginId  +  "  LoginName= "+LoginName);

 const memID = parseInt(LoginId);
 let Manergername = "";
 let Manerger_ID = 0;

 try{
        const [rows] = await dbcon.query(`SELECT * FROM hr.absent_manager_roster WHERE memberID = ${memID} and reg_schedulename = '${LoginName}'`);        
        
        const data_len = parseInt(rows.length, 10) || 0;
        
        if (data_len > 0) {
            Manergername = rows[0].reg_schedulename ?? "";
            Manerger_ID = Number(rows[0].memberID) || 0;
        }
   
        console.log("找到主管數據資料量:" + data_len);
        console.log("取得主管名稱為:" , Manergername);
        console.log("取得主管工號為:" , Manerger_ID); 
        
        res.status(200).json({
            message:  data_len > 0  ? "判定有主管名單列":"無建構主管名單列",            
            info :{
                auth_manerger : Manergername,
                memberID_num : Manerger_ID,
                find_count : data_len
            }
        })
        
    }catch(err){
        console.error("Error <<check_isadmin>>:", err);
        res.status(500).json({
            error: "取判定是否主管級職目前異常，請稍後再試",
            message: err.message,
        });
    }

})

// --------------------------------------------------
// 取得主管清單
// --------------------------------------------------
router.get("/managers", async (req, res) => {
  try {
    const list = await getManagerList();

    res.json({
      success: true,
      data: list,
    });
  } catch (err) {
    console.error("GET /managers failed:", err);
    res.status(500).json({
      success: false,
      message: "取得主管清單失敗",
    });
  }
});

// ---------------------------------------------
// GET 工號查人 (for 新增主管 Modal)
// - 從 hr.schedule_reginfo 查姓名/班別
// - 同時回傳 roster 是否存在 + nowIsManager 狀態
// ---------------------------------------------
router.get("/employees/:memberID", async (req, res) => {
  const { memberID } = req.params;

  if (!memberID) {
    return res
      .status(400)
      .json({ success: false, message: "必須提供 memberID" });
  }

  try {
    // 1) 查舊DB：schedule_reginfo（用來顯示姓名/班別）
    // ⚠️ 欄位名稱請依你實際 DB 調整：下面用常見命名示範
    const [empRows] = await dbcon.query(
      `
      SELECT
        memberID,
        reg_schedulename,
        shift
      FROM hr.schedule_reginfo
      WHERE memberID = ?
      LIMIT 1
      `,
      [memberID]
    );

    if (!empRows || empRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "schedule_reginfo 查無此員工" });
    }

    const employee = empRows[0];

    // 2) 查主管名冊是否存在 + nowIsManager
    const [rosterRows] = await dbcon.query(
      `
      SELECT nowIsManager
      FROM hr.absent_manager_roster
      WHERE memberID = ?
      LIMIT 1
      `,
      [memberID]
    );

    const rosterExists = rosterRows.length > 0;
    const nowIsManager = rosterExists ? Number(rosterRows[0].nowIsManager) : 0;

    return res.json({
      success: true,
      data: {
        memberID: employee.memberID,
        reg_schedulename: employee.reg_schedulename || "",
        shift: employee.shift || "",
        rosterExists,
        nowIsManager, // 0/1
      },
    });
  } catch (err) {
    console.error("GET /employees/:memberID failed:", err);
    return res.status(500).json({ success: false, message: "查詢員工失敗" });
  }
});

// ---------------------------------------------
// POST /managers  新增/重新啟用主管（Admin only）
// 同時：
// 1) 更新 hr.absent_manager_roster
// 2) 把 shift 同步到 hr.schedule_reginfo（該 memberID）
// 3) 若有填「前->現」(old/new) 也會做整體改名：schedule_reginfo(排除主管) + absent_manager_roster(全表) + PG同步
// ---------------------------------------------

// --------------------------------------------------
// 取得舊 DB(schedule_reginfo) 目前存在的「部門 / 工作區域」清單
// - 用於前端 datalist 提示
// - 排除「主管名冊 nowIsManager=1」的人（避免主管殘留資料污染清單）
// - 修正 collations 不一致：比對時兩邊都 COLLATE utf8mb4_unicode_ci
// --------------------------------------------------
router.get("/schedule/options", async (req, res) => {
  try {
    const [deptRows] = await dbcon.query(
      `
      SELECT DISTINCT TRIM(s.authPosition) AS v
      FROM hr.schedule_reginfo s
      WHERE s.authPosition IS NOT NULL
        AND TRIM(s.authPosition) <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM hr.absent_manager_roster m
          WHERE m.nowIsManager = 1
            AND (m.memberID COLLATE utf8mb4_unicode_ci)
                = (CAST(s.memberID AS CHAR) COLLATE utf8mb4_unicode_ci)
        )
      ORDER BY v
      `
    );

    const [areaRows] = await dbcon.query(
      `
      SELECT DISTINCT TRIM(s.positionarea) AS v
      FROM hr.schedule_reginfo s
      WHERE s.positionarea IS NOT NULL
        AND TRIM(s.positionarea) <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM hr.absent_manager_roster m
          WHERE m.nowIsManager = 1
            AND (m.memberID COLLATE utf8mb4_unicode_ci)
                = (CAST(s.memberID AS CHAR) COLLATE utf8mb4_unicode_ci)
        )
      ORDER BY v
      `
    );

    const departments = (deptRows || []).map((r) => r.v).filter(Boolean);
    const areas = (areaRows || []).map((r) => r.v).filter(Boolean);

    return res.json({ success: true, data: { departments, areas } });
  } catch (err) {
    console.error("GET /schedule/options failed:", err);
    return res.status(500).json({
      success: false,
      message: "取得舊 DB 清單失敗",
      error: err.message,
    });
  }
});

router.post("/managers", async (req, res) => {
  try {
    const {
      operator,
      memberID,
      reg_schedulename,
      name,
      shift,
      authStatus,
      nowIsManager,
      // admin 介面可能會送 old/new arrays
      oldDepartments = [],
      newDepartments = [],
      oldAreas = [],
      newAreas = [],
      // 也可能送 pairs 或直接送 authPosition/positionarea
      departments,
      areas,
      authPosition,
      positionarea,
      renames,
    } = req.body || {};

    if (!operator) {
      return res
        .status(400)
        .json({ success: false, message: "operator required" });
    }

    const op = await getOperatorInfo(operator);
    if (!op || !op.authStatus) {
      return res.status(403).json({
        success: false,
        message: "operator not found / no authStatus",
      });
    }
    if (Number(op.authStatus) !== 1) {
      return res.status(403).json({ success: false, message: "admin only" });
    }

    const mid = String(memberID ?? "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "memberID required" });
    }

    // authStatus：不允許指定成 1（1 代表 admin）
    const targetAuthStatus = authStatus == null ? "2" : String(authStatus);
    if (targetAuthStatus === "1") {
      return res
        .status(400)
        .json({ success: false, message: "authStatus cannot be 1" });
    }

    const buildFromPairs = (pairs) =>
      (Array.isArray(pairs) ? pairs : [])
        .map((p) => String(p?.new ?? "").trim())
        .filter(Boolean);

    const deptArr = Array.isArray(authPosition)
      ? safeStringArray(authPosition)
      : Array.isArray(newDepartments)
      ? safeStringArray(newDepartments)
      : Array.isArray(departments)
      ? safeStringArray(buildFromPairs(departments))
      : [];

    const areaArr = Array.isArray(positionarea)
      ? safeStringArray(positionarea)
      : Array.isArray(newAreas)
      ? safeStringArray(newAreas)
      : Array.isArray(areas)
      ? safeStringArray(buildFromPairs(areas))
      : [];

    // Upsert MySQL roster
    const [exist] = await dbcon.query(
      `SELECT id, nowIsManager FROM hr.absent_manager_roster WHERE memberID = ? LIMIT 1`,
      [mid]
    );

    if (exist && exist.length > 0) {
      await dbcon.query(
        `UPDATE hr.absent_manager_roster
         SET reg_schedulename = ?, shift = ?, positionarea = ?, authPosition = ?,
             authStatus = ?, nowIsManager = 1, updated_by = ?, updated_at = NOW()
         WHERE memberID = ?`,
        [
          reg_schedulename ?? name ?? "",
          shift ?? "",
          JSON.stringify(areaArr),
          JSON.stringify(deptArr),
          targetAuthStatus,
          operator,
          mid,
        ]
      );
    } else {
      await dbcon.query(
        `INSERT INTO hr.absent_manager_roster
         (memberID, reg_schedulename, shift, positionarea, authPosition, created_by, updated_by, authStatus, nowIsManager, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [
          mid,
          reg_schedulename ?? name ?? "",
          shift ?? "",
          JSON.stringify(areaArr),
          JSON.stringify(deptArr),
          operator,
          operator,
          targetAuthStatus,
        ]
      );
    }

    // shift 同步到舊DB(schedule_reginfo)：只更新這個 memberID
    if (shift !== undefined) {
      await dbcon.query(
        `UPDATE hr.schedule_reginfo SET shift = ? WHERE memberID = ?`,
        [shift ?? "", mid]
      );
    }

    // 如果有 old/new -> 也做整體改名
    const buildRenamesFromOldNew = (olds, news) => {
      const out = [];
      const a = Array.isArray(olds) ? olds : [];
      const b = Array.isArray(news) ? news : [];
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) {
        const oldVal = String(a[i] ?? "").trim();
        const newVal = String(b[i] ?? "").trim();
        if (oldVal && newVal && oldVal !== newVal)
          out.push({ old: oldVal, new: newVal });
      }
      return out;
    };

    const deptRenames = [
      ...buildRenamesFromOldNew(oldDepartments, newDepartments),
      ...(renames?.departments || []),
    ];
    const areaRenames = [
      ...buildRenamesFromOldNew(oldAreas, newAreas),
      ...(renames?.areas || []),
    ];

    const scheduleDeptRes = await applyScheduleReginfoRenames(
      "authPosition",
      deptRenames
    );
    const scheduleAreaRes = await applyScheduleReginfoRenames(
      "positionarea",
      areaRenames
    );

    const touched = new Set([mid]);
    const rosterRenamedIDs = await applyRosterRenames({
      deptRenames,
      areaRenames,
      operator,
    });
    rosterRenamedIDs.forEach((id) => touched.add(id));

    // 同步 PG（不阻擋主流程：PG 失敗就回傳在 pgSync）
    let pgSync = null;
    try {
      const rosterRows = await getRosterRowsByMemberIDs(Array.from(touched));
      pgSync = await syncManagerRosterToPG(rosterRows, {
        fallbackOperator: operator,
      });
    } catch (e) {
      pgSync = { success: false, message: e.message };
    }

    return res.json({
      success: true,
      message: "新增/更新主管成功",
      data: { memberID: mid },
      scheduleRename: { departments: scheduleDeptRes, areas: scheduleAreaRes },
      rosterRenameCount: rosterRenamedIDs.length,
      pgSync,
    });
  } catch (err) {
    console.error("POST /managers error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------
// GET /managers/sync-pg  手動把目前 MySQL roster 全量同步到 PG（Admin only）
// 用瀏覽器呼叫：/absent/managers/sync-pg?operator=你的工號
// ---------------------------------------------
router.get("/managers/sync-pg", async (req, res) => {
  try {
    const operator = String(req.query.operator || "").trim();

    // Admin only（避免被亂觸發）
    const op = await getOperatorInfo(operator);
    if (!op) {
      return res
        .status(401)
        .json({
          success: false,
          message: "operator not found / no authStatus",
        });
    }
    if (Number(op.authStatus) !== 1) {
      return res
        .status(403)
        .json({ success: false, message: "permission denied" });
    }

    // 先拿所有 memberID，再用既有 helper 取完整欄位（含 created_by / updated_by）
    const [idRows] = await dbcon.query(
      `SELECT memberID FROM hr.absent_manager_roster`
    );
    const ids = (idRows || []).map((r) => r.memberID).filter(Boolean);

    if (ids.length === 0) {
      return res.json({ success: true, message: "no data", processedCount: 0 });
    }

    const rosterRows = await getRosterRowsByMemberIDs(ids);
    const pgSync = await syncManagerRosterToPG(rosterRows, {
      fallbackOperator: operator,
    });

    return res.json({
      success: true,
      message: "pg sync all ok",
      ...pgSync,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "pg sync all failed",
      error: err.message,
    });
  }
});

// ---------------------------------------------
// POST 批次更新主管名冊（更新 + 暫刪）
// - 回傳 updated / skipped（含原因）避免「continue 靜默忽略」
// ---------------------------------------------
router.post("/managers/batch", async (req, res) => {
  try {
    const { operator, list = [], renames } = req.body || {};

    console.log ("list=" , list , " | " , "renames=" , renames); 

    if (!operator) {
      return res
        .status(400)
        .json({ success: false, message: "operator required" });
    }

    // 1) 操作者權限（必須是 1 或 2）
    const op = await getOperatorInfo(operator);
    if (!op || !op.authStatus) {
      return res.status(403).json({
        success: false,
        message: "operator not found / no authStatus",
      });
    }

    const opAuth = Number(op.authStatus);
    if (![1, 2].includes(opAuth)) {
      return res.status(403).json({ success: false, message: "no permission" });
    }

    // mid(2) 只允許改自己部門的人（以 operator 的 authPosition 當作可管理部門）
    const opDepts = safeStringArray(op.authPosition);

    const touched = new Set();
    const shiftSync = new Map(); // memberID -> shift
    const updated = [];
    const skipped = [];

    const items = Array.isArray(list) ? list : [];

    for (const item of items) {
      const memberID = String(item?.memberID ?? "").trim();
      if (!memberID) {
        skipped.push({ reason: "missing memberID" });
        continue;
      }

      // 取目標目前資料（做 mid 權限判定用）
      const [targetRows] = await dbcon.query(
        `SELECT memberID, authPosition, authStatus
         FROM hr.absent_manager_roster
         WHERE memberID = ? LIMIT 1`,
        [memberID]
      );
      const target = targetRows?.[0] || null;

      // 2) mid 權限限制：只能改自己部門的人，且不能把別人變成 admin(1)
      if (opAuth === 2) {
        // 如果目標不存在，mid 不允許新增/建立
        if (!target) {
          skipped.push({ memberID, reason: "mid cannot create new manager" });
          continue;
        }

        const targetDepts = safeStringArray(target.authPosition);
        const isSameDept =
          targetDepts.length > 0 &&
          targetDepts.some((d) => opDepts.includes(d));

        if (!isSameDept) {
          skipped.push({ memberID, reason: "mid cannot edit other dept" });
          continue;
        }

        if (String(item?.authStatus ?? "") === "1") {
          skipped.push({ memberID, reason: "mid cannot set authStatus=1" });
          continue;
        }
      }

      // 3) 停用（刪除/移除主管）：authStatus === "0"
      if (String(item?.authStatus ?? "") === "0") {
        const [ret] = await dbcon.query(
          `UPDATE hr.absent_manager_roster
           SET authStatus = "0", nowIsManager = 0, updated_by = ?, updated_at = NOW()
           WHERE memberID = ?`,
          [operator, memberID]
        );

        touched.add(memberID);
        updated.push({
          memberID,
          action: "deactivate",
          affectedRows: ret?.affectedRows ?? 0,
        });
        continue;
      }

      // 4) 一般更新（該 memberID）
      const allowedKeys = [
        "reg_schedulename",
        "shift",
        "positionarea",
        "authPosition",
        "authStatus",
        "nowIsManager",
      ];

      const sets = [];
      const vals = [];

      for (const key of allowedKeys) {
        if (item[key] === undefined) continue;

        if (key === "positionarea" || key === "authPosition") {
          const arr = safeJsonArray(item[key]);
          sets.push(`${key} = ?`);
          vals.push(JSON.stringify(arr));
          continue;
        }

        if (key === "nowIsManager") {
          sets.push(`${key} = ?`);
          vals.push(Number(item[key]) ? 1 : 0);
          continue;
        }

        sets.push(`${key} = ?`);
        vals.push(item[key]);
      }

      // 一律更新 updated_by / updated_at
      sets.push(`updated_by = ?`);
      vals.push(operator);
      sets.push(`updated_at = NOW()`);

      if (sets.length === 0) {
        skipped.push({ memberID, reason: "no fields to update" });
        continue;
      }

      vals.push(memberID);

      const [ret] = await dbcon.query(
        `UPDATE hr.absent_manager_roster SET ${sets.join(
          ", "
        )} WHERE memberID = ?`,
        vals
      );

      touched.add(memberID);
      updated.push({
        memberID,
        action: "update",
        affectedRows: ret?.affectedRows ?? 0,
      });

      // shift 同步（舊DB schedule_reginfo 的 shift 只更新該 memberID）
      if (item.shift !== undefined) {
        shiftSync.set(memberID, item.shift ?? "");
      }
    }

    // 5) shift 同步到 hr.schedule_reginfo（逐筆）
    for (const [mid, sh] of shiftSync.entries()) {
      try {
        await dbcon.query(
          `UPDATE hr.schedule_reginfo SET shift = ? WHERE memberID = ?`,
          [sh ?? "", mid]
        );
      } catch (e) {
        // 不阻擋主流程：只記錄
        console.warn("shift sync schedule_reginfo failed:", mid, e.message);
      }
    }

    // 6) 改名模式：更新舊DB整欄 + 更新新DB整欄（JSON array）
    //    前端會在有填「前部門/前區域」時，把 renames.departments / renames.areas 帶進來
    const deptRenames = dedupeRenames(renames?.departments || []);
    const areaRenames = dedupeRenames(renames?.areas || []);

    let scheduleRename = { departments: [], areas: [] };
    let rosterRenamedIDs = [];

    if (deptRenames.length > 0) {
      scheduleRename.departments = await applyScheduleReginfoRenames(
        "authPosition",
        deptRenames
      );
    }
    if (areaRenames.length > 0) {
      scheduleRename.areas = await applyScheduleReginfoRenames(
        "positionarea",
        areaRenames
      );
    }

    if (deptRenames.length > 0 || areaRenames.length > 0) {
      rosterRenamedIDs = await applyRosterRenames({
        deptRenames,
        areaRenames,
        operator,
      });
      rosterRenamedIDs.forEach((id) => touched.add(id));
    }

    // 7) 同步 PG（不阻擋主流程：PG 失敗就回傳在 pgSync）
    let pgSync = null;
    try {
      const rosterRows = await getRosterRowsByMemberIDs(Array.from(touched));
      pgSync = await syncManagerRosterToPG(rosterRows, {
        fallbackOperator: operator,
      });
    } catch (e) {
      pgSync = { success: false, message: e.message };
    }

    try {
        console.log("renames =" , renames);
           
        const dataCheck = await ScheduleTrackRecord(areaRenames);
        console.log("update position auth to schedule_reginfo success:" , dataCheck);
    }catch(e){
        console.error("update position auth to schedule_reginfo failed:" , e);
        throw e;
    }

    return res.json({
      success: true,
      message: "batch update ok",
      updatedCount: updated.length,
      skippedCount: skipped.length,
      updated,
      skipped,
      scheduleRename,
      rosterRenameCount: rosterRenamedIDs.length,
      pgSync,
    });
  } catch (err) {
    console.error("POST /managers/batch error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});



module.exports = router;