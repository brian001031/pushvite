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

        console.log(`🗑️ 已刪除 ${result.rowCount || 0} 筆已同步的資料`);
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
        console.log('⏰ 同步請求超時，自動取消');
        isClientConnected = false;
        if (!res.headersSent) {
            res.status(408).json({ error: "同步請求超時" });
        }
    }, 60000);

    req.on('close', () => {
        console.log('⚠️ 客戶端連接已中斷，停止同步處理');
        isClientConnected = false;
        clearTimeout(requestTimeout);
    });

    req.on('aborted', () => {
        console.log('⚠️ 客戶端請求已取消，停止同步處理');
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

            console.log(`🔄 處理 NEON 資料 ID: ${neonRow.id}, randomuniqueid: ${neonRow.randomuniqueid}`);

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

            if (localMatch) {
                console.log(`✅ 已存在，已更新 randomuniqueid: ${neonRow.randomuniqueid}`);
            } else {
                console.log(`🆕 不存在，已新增 randomuniqueid: ${neonRow.randomuniqueid}`);
            }

            // 更新 NEON is_synced 狀態
            const updateNeonSql = `
                UPDATE leave_applications
                SET is_synced = true, synced_at = NOW()
                WHERE id = $1
            `;
            await leaveApply_Db.query(updateNeonSql, [neonRow.id]);
            console.log(`☑️ NEON 同步標記完成 ID: ${neonRow.id}`);
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


module.exports = router;