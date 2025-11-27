require("dotenv").config();
const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const axios = require("axios");
const _ = require("lodash");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2");
const { Pool } = require("pg");
const fs = require("fs");
const moment = require("moment");
const util = require('util');
const schedule = require("node-schedule");
const xlsx = require("xlsx");
const path = require("path");
const { type } = require("os");
const { Float } = require("mssql");


const dbcon = mysql.createPool({
  host: "192.168.3.100",
  user: "root",
  password: "Admin0331",
  database: "hr",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  multipleStatements: true,
    timezone: 'local', // 修正無效時區警告：mysql2 僅接受 'local' 或 'Z' / 偏移量
});

const leaveApply_Db = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

dbcon.once("error", (err) => {
  console.log("Error in connecting to database: ", err);
});

if (!dbcon.__errorListenerAdded) {
  dbcon.on("error", (err) => {
    console.error("Database connection error:", err);
  });
  dbcon.__errorListenerAdded = true; 

  //確認連線狀況是否正常
  dbcon.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting connection:", err);
      return err;
    }
  });
  dbcon.promise();
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

// ------------------------------------------------------------------
// 1. 抓取昨天的請假紀錄 (使用參數化查詢)
// ------------------------------------------------------------------
const original_annualLeave_check = async (connection) => {

    const yesterday = moment().subtract(1, 'days');
    const yesterdayStart = yesterday.clone().startOf('day').format("YYYY/MM/DD") + " 上午 12:00:00";
    const yesterdayEnd = yesterday.clone().endOf('day').format("YYYY/MM/DD") + " 下午 11:59:59";

    // 修正: 使用參數化查詢
    const sql_dataFrom_originWay = `
        SELECT Name, MemID, LeaveSD, LeaveED , LeaveST , LeaveET
        FROM hr.leaverecord
        WHERE DateTime >= ? AND DateTime <= ? AND
        LeaveClass LIKE '%特休%'
    `;
    
    try {
        // 使用傳入的 connection 執行查詢，並將日期作為參數傳入
        const [rows] = await connection.query(sql_dataFrom_originWay, [yesterdayStart, yesterdayEnd]);
        // console.log(`Found ${rows.length} leave records from yesterday.` , rows);
        // console.log("Find Time  :", yesterdayStart , ' | ', yesterdayEnd);
        
        return rows;

    } catch (error) {
        console.log('Error in annual leave check:', error);
        throw error;
    }
}



// 計算請假紀錄
const executAnnualLeaveTask = async (req, res) => {
    console.log("執行每日下午3點的特休扣除任務");

    let connection;
    
    try {
        // 1. 取得連線並開始交易 (Transaction)
        connection = await dbcon.promise().getConnection();
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
                // let startData , EndData

                // 解析時間字串
                const startTimeStr = parseChineseTime(data.LeaveST);
                const endTimeStr = parseChineseTime(data.LeaveET);
                if (!startTimeStr || !endTimeStr) {
                    console.log(`時間解析失敗，跳過: ${data.Name}`); continue;
                }
                const startMoment = buildMoment(data.LeaveSD, startTimeStr);
                const endMoment = buildMoment(data.LeaveED, endTimeStr);
                if (!startMoment || !endMoment || !endMoment.isAfter(startMoment)) {
                    console.log(`起迄時間不合法，跳過: ${data.Name}`); continue;
                }

                // 計算有效請假時數 (扣休息) + 午休 / 夜班處理
                const eff = calcEffectiveLeaveHours(startMoment, endMoment);
                leaveFinalTime = eff.totalHours;
                leaveTotalTime = endMoment.diff(startMoment,'hours', true);

                console.log(`員工:${data.Name} 原始:${leaveTotalTime.toFixed(2)}h 有效:${leaveFinalTime.toFixed(2)}h 午休扣:${eff.lunchDeduct}h 夜班扣:${eff.nightDeduct}h 班次:${eff.shiftType}`);

                // 轉為特休天數 (以 8 小時為 1 天)
                const daysToDeduct = leaveFinalTime / WORK_HOURS_PER_DAY;
                console.log("daysToDeduct  :" , daysToDeduct)
                const memberNumber = data.MemID.replace(/^0+/ , "")

                const [beforeRows] = await connection.query(
                    `SELECT annualLeave_Balance FROM hr.absent_status WHERE employeeName = ? AND employeeNumber = ?`,
                    [data.Name, memberNumber]
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
                    [Number(daysToDeduct.toFixed(4)), data.Name, memberNumber]
                );
                // 驗證更新後值
                const [afterRows] = await connection.query(
                    `SELECT annualLeave_Balance FROM hr.absent_status WHERE employeeName = ? AND employeeNumber = ?`,
                    [data.Name, memberNumber]
                );
                const afterRaw = afterRows && afterRows[0] ? afterRows[0].annualLeave_Balance : null;
                const afterBalance = afterRaw == null ? null : parseFloat(afterRaw);
                console.log(`更新 ${data.Name}(${memberNumber}) 餘額: 前=${beforeBalance} 扣=${daysToDeduct} 後=${afterBalance} affectedRows=${updResult && updResult.affectedRows}`);
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

// 每天中午12:00（台灣時間 UTC+8）執行特休扣除任務
const schedule_For_annualLeave = schedule.scheduleJob('0 12 * * *', async () => {
    try {
        await executAnnualLeaveTask();
        console.log('executAnnualLeaveTask 已於每日中午12:00執行');
    } catch (error) {
        console.error('executAnnualLeaveTask 執行失敗:', error);
    }
});


router.get("/testAPI_FOR_count" , async (req, res) => {

    try {
        await executAnnualLeaveTask();
        console.log('executAnnualLeaveTask 已於每日中午12:00執行');
    } catch (error) {
        console.error('executAnnualLeaveTask 執行失敗:', error);
    }
})




// 定時任務：每天同步請假資料
const syncLeaveData = async (req, res) => {

    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    const minusSevenDays = moment().subtract(7, 'days').format("YYYY-MM-DD HH:mm:ss");
    const plusSevenDays = moment().add(7, 'days').format("YYYY-MM-DD HH:mm:ss");

    const sql_OutSideDb_LeaveApply = `SELECT * FROM absentsystem_leavesortoutall `;
    const sql_localDb_LeaveApply = `SELECT * FROM absentsystem_leavesortoutall where created_at between '${minusSevenDays}' and '${plusSevenDays}'`;
    
    
    let syncedType = false;

    try {
        // 外部資料匯入
        const result = await leaveApply_Db.query(sql_OutSideDb_LeaveApply);
        console.log("OutSide Date " ,result.rows);
        console.log("minusSevenDays:", minusSevenDays + "|" + "plusSevenDays:" + plusSevenDays);
        
        let datas = result.rows;

        // 地端資訊匯入
        const result_local = await dbcon.query(sql_localDb_LeaveApply);
        console.log("Local Date ", result_local[0]);
        

        for (const row of result_local[0]) {
            const matchingData = datas.find(data => data.id === row.id);
            if (matchingData) {
                // 如果找到對應的資料，則更新
                Object.assign(matchingData, row);
            }
        }

        res.status(200).json({
            message: "NEON 資料庫連接成功",
            data: datas,
            timestamp: new Date().toISOString()
        });
        
    } catch (err) {
        console.error("NEON 資料庫連接錯誤:", err);
        res.status(500).json({
            error: "NEON 資料庫連接失敗",
            message: err.message
        });
    }
}

// 用於減輕資料庫壓力
const deleteData = async () => {
    try {
        const sql = `
            DELETE FROM leave_applications 
            WHERE randomuniqueid IS NOT NULL 
              AND is_synced = $1 
              AND synced_at IS NOT NULL
        `;
        const result = await leaveApply_Db.query(sql, [true]);

        // console.log(`🗑️ 已刪除 ${result.rowCount || 0} 筆已同步的資料`);
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

// 對標 線上資料庫 與 線下資料庫的請假申請資料
router.get("/compare_leaveApplyDb", async (req, res) => {
    // 檢測客戶端連接狀態
    let isClientConnected = true;
    let requestTimeout;

    // 設置請求超時 (60秒，因為同步可能需要較長時間)
    requestTimeout = setTimeout(() => {
        // console.log('⏰ 同步請求超時，自動取消');
        isClientConnected = false;
        if (!res.headersSent) {
            res.status(408).json({ error: "同步請求超時" });
        }
    }, 60000);

    req.on('close', () => {
        // console.log('⚠️ 客戶端連接已中斷，停止同步處理');
        isClientConnected = false;
        clearTimeout(requestTimeout);
    });

    req.on('aborted', () => {
        // console.log('⚠️ 客戶端請求已取消，停止同步處理');
        isClientConnected = false;
        clearTimeout(requestTimeout);
    });

    const now = moment().locale("zh-tw").format("YYYY-MM-DD HH:mm:ss");

    try {
        // 1. 從 NEON 資料庫抓取資料
        const sqlNeon = `SELECT * FROM leave_applications ORDER BY id`;
        const neonResult = await leaveApply_Db.query(sqlNeon);
        const neonData = neonResult.rows;
        console.log("NEON 資料筆數:", neonData.length);

        // 2. 從本地 MySQL 資料庫抓取資料
        const sqlLocal = `SELECT * FROM hr.absentsystem_leavesortoutall ORDER BY id`;
        const [localResult] = await db2.query(sqlLocal);
        const localData = localResult;
        console.log("本地資料筆數:", localData.length);

        // 3. 建立 Local 的 randomuniqueid 對應 Map
        const localMap = new Map();
        for (const row of localData) {
            if (row.randomuniqueid) {
                localMap.set(row.randomuniqueid, row);
            }
        }

        // 4. 欄位轉換設定
        const convertNeonToLocal = (neonRow) => ({
            id: neonRow.id,  // 或你想自訂的 ID
            employeeNumber: neonRow.employee_id,
            employeeName: neonRow.employee_name,
            leaveType: neonRow.leave_type,
            leaveStartTime: neonRow.start_date,
            leaveEndTime: neonRow.end_date,
            authPosition: neonRow.department,
            applyTime: neonRow.applied_at,
            managerSubmitTime: neonRow.approved_at,
            describtion: neonRow.reason,
            managerName: neonRow.approved_by,
            apply_folder_link: neonRow.apply_folder_link,
            errorStatusNotify: (() => {
                switch (neonRow.status) {
                    case "已核准": return "3";
                    case "待審核": return "4";
                    case "已拒絕": return "5";
                    default: return null;
                }
            })(),
            randomuniqueid: neonRow.randomuniqueid
        });

        // 5. 開始同步資料
        for (const neonRow of neonData) {
            const localMatch = localMap.get(neonRow.randomuniqueid);

            const localRowData = convertNeonToLocal(neonRow);

            // console.log(`🔄 處理 NEON 資料 ID: ${neonRow.id}, randomuniqueid: ${neonRow.randomuniqueid}`);

            const insertSql = `
                INSERT INTO hr.absentsystem_leavesortoutall (
                    id,
                    employeeNumber,
                    employeeName,
                    leaveType,
                    leaveStartTime,
                    leaveEndTime,
                    authPosition,
                    applyTime,
                    managerSubmitTime,
                    describtion,
                    managerName,
                    apply_folder_link,
                    errorStatusNotify,
                    randomuniqueid,
                    is_synced ,
                    synced_at 
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ,? ,?)
                ON DUPLICATE KEY UPDATE
                    employeeNumber = VALUES(employeeNumber),
                    employeeName = VALUES(employeeName),
                    leaveType = VALUES(leaveType),
                    leaveStartTime = VALUES(leaveStartTime),
                    leaveEndTime = VALUES(leaveEndTime),
                    authPosition = VALUES(authPosition),
                    applyTime = VALUES(applyTime),
                    managerSubmitTime = VALUES(managerSubmitTime),
                    describtion = VALUES(describtion),
                    managerName = VALUES(managerName),
                    apply_folder_link = VALUES(apply_folder_link),
                    errorStatusNotify = VALUES(errorStatusNotify),
                    randomuniqueid = VALUES(randomuniqueid)
            `;

            const insertParams = [
                localRowData.id,
                localRowData.employeeNumber,
                localRowData.employeeName,
                localRowData.leaveType,
                localRowData.leaveStartTime,
                localRowData.leaveEndTime,
                localRowData.authPosition,
                localRowData.applyTime,
                localRowData.managerSubmitTime,
                localRowData.describtion,
                localRowData.managerName,
                localRowData.apply_folder_link,
                localRowData.errorStatusNotify,
                localRowData.randomuniqueid,
                true,
                now
            ];

            await db2.query(insertSql, insertParams);

            // if (localMatch) {
            //     console.log(`✅ 已存在，已更新 randomuniqueid: ${neonRow.randomuniqueid}`);
            // } else {
            //     console.log(`🆕 不存在，已新增 randomuniqueid: ${neonRow.randomuniqueid}`);
            // }

            // 更新 NEON is_synced 狀態
            const updateNeonSql = `
                UPDATE leave_applications
                SET is_synced = true, synced_at = NOW()
                WHERE id = $1
            `;
            await leaveApply_Db.query(updateNeonSql, [neonRow.id]);
            // console.log(`☑️ NEON 同步標記完成 ID: ${neonRow.id}`);
        }

        // 6. 回傳
        res.status(200).json({
            message: "同步完成",
            totalNeon: neonData.length,
            timestamp: new Date().toISOString()
        });

        // 7. 執行清理 - 不影響主要回應
        try {
            await deleteData();
            console.log("✅ 資料清理完成");
        } catch (cleanupErr) {
            console.error("⚠️ 資料清理失敗，但不影響主要功能:", cleanupErr.message);
        }

    } catch (err) {
        console.error("❌ 同步過程發生錯誤:", err);
        res.status(500).json({
            error: "同步資料失敗",
            message: err.message,
            detail: err.detail || err.stack
        });
    }
});


router.post("/postLeaveApply", upload.any(), async (req, res) => {
    console.log("Received body:", req.body);
    console.log("Received files:", req.files);

    const formData = req.body;
    
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
            errorStatusNotify,
            managerAuth,
            apply__folder_link
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
    `;

    try {
        const [rows] = await db2.query(sql, [
            formData.memberID,
            formData.name,
            formData.leaveType,
            formData.startDate,
            formData.endDate,
            formData.leaveTotalHour,
            JSON.stringify(uploadedFiles),
            formData.describtion,
            formData.positionarea,
            formData.errorStatusNotify,
            formData.managerAuth,
            formData.apply__folder_link
        ]);
        
        console.log("新增請假申請成功", rows);
        console.log("上傳的檔案資訊:", uploadedFiles);

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
            ORDER BY id DESC
        `;
        const neonResult = await leaveApply_Db.query(sqlNeon);
        const unsyncedData = neonResult.rows;
        
        console.log(`🔄 發現 ${unsyncedData.length} 筆未同步的 NEON 資料`);
        
        if (unsyncedData.length === 0) {
            return {
                success: true,
                message: "沒有需要同步的資料",
                syncedCount: 0
            };
        }

        // 2. 從本地資料庫獲取現有的 randomuniqueid 建立對應 Map
        const sqlLocal = `SELECT randomuniqueid FROM hr.absentsystem_leavesortoutall WHERE randomuniqueid IS NOT NULL`;
        const [localResult] = await db2.query(sqlLocal);
        const existingIds = new Set(localResult.map(row => row.randomuniqueid));

        // 3. 欄位轉換設定
        const convertNeonToLocal = (neonRow) => ({
            id: neonRow.id,
            employeeNumber: neonRow.employee_id,
            employeeName: neonRow.employee_name,
            leaveType: neonRow.leave_type,
            leaveStartTime: neonRow.start_date,
            leaveEndTime: neonRow.end_date,
            authPosition: neonRow.department,
            applyTime: neonRow.applied_at,
            managerSubmitTime: neonRow.approved_at,
            describtion: neonRow.reason,
            managerName: neonRow.approved_by,
            apply_folder_link: neonRow.apply_folder_link,
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

                // 插入到本地資料庫
                const insertSql = `
                    INSERT INTO hr.absentsystem_leavesortoutall (
                        employeeNumber,
                        employeeName,
                        leaveType,
                        leaveStartTime,
                        leaveEndTime,
                        authPosition,
                        applyTime,
                        managerSubmitTime,
                        describtion,
                        managerName,
                        apply_folder_link,
                        errorStatusNotify,
                        randomuniqueid,
                        is_synced,
                        synced_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const insertParams = [
                    localRowData.employeeNumber,
                    localRowData.employeeName,
                    localRowData.leaveType,
                    localRowData.leaveStartTime,
                    localRowData.leaveEndTime,
                    localRowData.authPosition,
                    localRowData.applyTime,
                    localRowData.managerSubmitTime,
                    localRowData.describtion,
                    localRowData.managerName,
                    localRowData.apply_folder_link,
                    localRowData.errorStatusNotify,
                    localRowData.randomuniqueid,
                    true,
                    now
                ];

                await db2.query(insertSql, insertParams);

                // 更新 NEON 資料庫的同步狀態
                const updateNeonSql = `
                    UPDATE leave_applications
                    SET is_synced = true, synced_at = NOW()
                    WHERE id = $1
                `;
                await leaveApply_Db.query(updateNeonSql, [neonRow.id]);

                syncedCount++;
                console.log(`✅ 同步完成 ID: ${neonRow.id}, randomuniqueid: ${neonRow.randomuniqueid}`);

            } catch (rowError) {
                console.error(`❌ 同步單筆資料失敗 ID: ${neonRow.id}:`, rowError.message);
            }
        }

        console.log(`🎉 同步完成！同步: ${syncedCount} 筆，跳過: ${skippedCount} 筆`);
        
        return {
            success: true,
            message: "同步完成",
            syncedCount,
            skippedCount,
            totalProcessed: unsyncedData.length
        };

    } catch (err) {
        console.error("❌ 同步過程發生錯誤:", err);
        throw err;
    }
};

router.get("/getLeaveApply", async (req, res) => {
    const managerAuth = req.query;
    console.log("Received query:", managerAuth);

    // 先執行同步 NEON 資料庫的未同步資料
    try {
        console.log("🔄 開始同步 NEON 資料庫未同步的請假申請...");
        const syncResult = await syncUnsyncedLeaveData();
        console.log("✅ 同步結果:", syncResult);
    } catch (syncError) {
        console.error("⚠️ 同步失敗，但繼續執行查詢:", syncError.message);
        // 即使同步失敗，也繼續執行查詢
    }

    // 根據主管權限設定部門篩選
    let departmentFilter = "";
    switch (String(managerAuth.managerAuth).trim()) {
        case "0":
            departmentFilter = ""; // 查看所有部門
            break;
        case "1":
            departmentFilter = "行政";
            break;
        case "2":
            departmentFilter = "設備與廠務";
            break;
        case "3":
            departmentFilter = "組裝";
            break;
        case "4":
            departmentFilter = "研發一";
            break;
        case "5":
            departmentFilter = "塗佈區";
            break;
        case "6":
            departmentFilter = "儲能中心";
            break;
        case "7":
            departmentFilter = "馬達組";
            break;
    }

    try {
        // 從本地資料庫獲取資料（包含已同步的 NEON 資料）
        let sql = "";
        let params = [];

        if (departmentFilter === "") {
            // 查看所有部門的待審核申請
            sql = `SELECT * FROM hr.absentSystem_leaveSortOutAll WHERE errorStatusNotify NOT IN ("3", "5") ORDER BY id DESC`;
        } else {
            // 查看特定部門的待審核申請
            sql = `SELECT * FROM hr.absentSystem_leaveSortOutAll WHERE errorStatusNotify NOT IN ("3", "5") AND authPosition = ? ORDER BY id DESC`;
            params = [departmentFilter];
        }

        const [rows] = await db2.query(sql, params);
        console.log("查詢到的請假申請資料筆數:", rows.length);

        // 格式化資料
        const formattedRows = rows.map(row => {
            return {
                ...row,
                leaveFile: row.leaveFile ? JSON.parse(row.leaveFile) : [],
                dataSource: row.randomuniqueid ? "已同步NEON資料" : "本地資料"
            };
        });

        res.status(200).json({
            message: "取得請假申請成功",
            data: formattedRows,
            summary: {
                totalCount: formattedRows.length,
                syncedFromNeon: formattedRows.filter(row => row.randomuniqueid).length,
                localOnly: formattedRows.filter(row => !row.randomuniqueid).length
            }
        });
        
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

    try {
        const [result] = await db2.query(sql, [errorStatusNotify, managerName, managerNumber, id]);
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

router.get("/LeaveOverallRecord", async (req , res) => {
    const {
        managerAuth , 
        employeeNumber , 
        searchInput ,
        sortStartDate ,
        sortEndDate,
        page = 1,
        pageSize = 25
    
    } = req.query

    const limit = parseInt(pageSize, 10);
    const offset = (parseInt(page, 10) - 1) * limit;

    console.log("Received query:", req.query);

    let sql = "";
    let params = [];
    let positionarea = "";

    // 依據主管權限設定可看到的部門
    switch (String(managerAuth).trim()) {
        case "1":
            positionarea = "行政";
            break;
        case "2":
            positionarea = "設備與廠務";
            break;
        case "2-1":
            positionarea = "混漿區";
            break;
        case "2-2":
            positionarea = "塗佈區";
            break;
        case "2-3":
            positionarea = "輾壓區";
            break;
        case "2-4":
            positionarea = "電芯組裝區";
            break;
        case "2-5":
            positionarea = "電化學區";
            break;
        case "2-6":
            positionarea = "模組與產品測試區";
            break;
        case "3":
            positionarea = "組裝";
            break;
        case "4":
            positionarea = "研發一";
            break;
        case "5":
            positionarea = "塗佈區";
            break;
        case "6":
            positionarea = "儲能中心";
            break;
        case "7":
            positionarea = "馬達組";
            break;
        default:
            positionarea = "";
    }

    // 確認主管權限
    if (!managerAuth) {
        // 僅能看個人請假資料
        sql = `SELECT * FROM hr.absentSystem_leaveSortOutAll WHERE employeeNumber = ? AND leaveStartTime BETWEEN ? AND ? AND leaveEndTime BETWEEN ? AND ?`;
        params = [employeeNumber , sortStartDate , sortEndDate , sortStartDate , sortEndDate];
    } else if (managerAuth === "0") {
        // 主管權限為0，查看所有請假資料
        sql = `SELECT * FROM hr.absentSystem_leaveSortOutAll WHERE 1=1 AND leaveStartTime BETWEEN ? AND ? AND leaveEndTime BETWEEN ? AND ?`;  // 修正：加上 WHERE 1=1
        params = [sortStartDate , sortEndDate , sortStartDate , sortEndDate];
    } else {
        // 主管權限為1-7，查看特定部門的請假資料
        sql = `SELECT * FROM hr.absentSystem_leaveSortOutAll WHERE positionarea = ? AND leaveStartTime BETWEEN ? AND ? AND leaveEndTime BETWEEN ? AND ?`;
        params = [positionarea , sortStartDate , sortEndDate , sortStartDate , sortEndDate];
    }

    // 如果有搜尋條件，則添加到 SQL 查詢中
    if (typeof searchInput === 'string' && searchInput.trim() !== '') {
        // 判斷 searchInput 是否為純數字
        if (/^\d+$/.test(searchInput.trim())) {
            // 純數字，搜尋員工編號（修正：使用 LIKE 或 = ，不要同時使用）
            let paddedNumber = searchInput.trim().padStart(3, '0');
            sql += ` AND employeeNumber LIKE ?`;
            params.push(`%${paddedNumber}%`);
        } else {
            // 不是純數字，搜尋姓名（修正：使用 LIKE）
            sql += ` AND employeeName LIKE ?`;
            params.push(`%${searchInput.trim()}%`);
        }
    }
    sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;

    console.log("SQL Query:", sql);
    console.log("Params:", params);
    console.log("positionarea:", positionarea);
    params.push(limit, offset);

    try {
        const [rows] = await dbcon.promise().query(sql, params);
        console.log("取得請假紀錄成功", rows);

        // 格式化返回資料，解析 leaveFile JSON
        const formattedRows = rows.map(row => {
            return {
                ...row,
                leaveFile: row.leaveFile ? JSON.parse(row.leaveFile) : []
            };
        });

        // 總數量查詢
        let countSql = "";
        let countParams = [];

        if (!managerAuth) {
            // 僅能看個人請假資料
            countSql = `SELECT COUNT(*) AS total FROM hr.absentSystem_leaveSortOutAll WHERE employeeNumber = ? AND leaveStartTime BETWEEN ? AND ? AND leaveEndTime BETWEEN ? AND ?`;
            countParams = [employeeNumber, sortStartDate, sortEndDate, sortStartDate, sortEndDate];
        } else if (managerAuth === "0") {
            // 主管權限為0，查看所有請假資料
            countSql = `SELECT COUNT(*) AS total FROM hr.absentSystem_leaveSortOutAll WHERE 1=1 AND leaveStartTime BETWEEN ? AND ? AND leaveEndTime BETWEEN ? AND ?`;
            countParams = [sortStartDate, sortEndDate, sortStartDate, sortEndDate];
        } else {
            // 主管權限為1-7，查看特定部門的請假資料
            countSql = `SELECT COUNT(*) AS total FROM hr.absentSystem_leaveSortOutAll WHERE positionarea = ? AND leaveStartTime BETWEEN ? AND ? AND leaveEndTime BETWEEN ? AND ?`;
            countParams = [positionarea, sortStartDate, sortEndDate, sortStartDate, sortEndDate];
        }

        // 如果有搜尋條件，則添加到 SQL 查詢中
        if (typeof searchInput === 'string' && searchInput.trim() !== '') {
            if (/^\d+$/.test(searchInput.trim())) {
            let paddedNumber = searchInput.trim().padStart(3, '0');
            countSql += ` AND employeeNumber LIKE ?`;
            countParams.push(`%${paddedNumber}%`);
            } else {
            countSql += ` AND employeeName LIKE ?`;
            countParams.push(`%${searchInput.trim()}%`);
            }
        }

        const [countRows] = await dbcon.promise().query(countSql, countParams);
        const totalCount = countRows[0].total;

        console.log("Total count:", totalCount);
        res.status(200).json({
            message: "取得請假紀錄成功",
            data: formattedRows,
            totalCount: totalCount,
            totalPages: Math.ceil(totalCount / limit),
            page: parseInt(page, 10),
            pageSize: limit
        });


    } catch (err) {
        console.error("Error <<LeaveOverallRecord>>:", err);
        res.status(500).json({
            error: "取得請假紀錄失敗，請稍後再試",
            message: err.message,
        });
    }
})





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
    const connection = await dbcon.promise().getConnection();

    try{
        // 啟動交易 (Transaction)
        await connection.beginTransaction();

        const columnNames = [
            'employeeNumber', 'employeeName', 'annualLeave_Balance', 
            'compensatory_Leave_Balance', 'personalLeave_Taken', 'sickLeave_Taken',
            'menstrualLeave_Taken', 'marriage_Leave_Taken', 'funeralLeave_Taken', 
            'maternityLeave_Taken', 'paternityLeave_Taken', 'workRelatedInjury_Leave_Taken'
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

        // 執行查詢 (使用 [valuesToInsert] 作為第二個參數)
    await connection.query(sql, [valuesToInsert]);
        
        // 提交交易 (Commit)
        await connection.commit();

    }catch(err){
        // **優化點：如果失敗，執行回滾**
        await connection.rollback(); 
        console.error("Insert Absent Data Error " , err);
        throw err;
    } finally {
        // 釋放連線
        connection.release();
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
        const [rows] = await dbcon.promise().query(sql, [memberID, memberName]);
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


module.exports = router;