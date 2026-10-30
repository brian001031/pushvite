require("dotenv").config();
const express = require("express");
const router = express.Router();
const db2 = require(__dirname + "/../../modules/mysql_connect.js");
const XLSX = require("xlsx");
const moment = require("moment-timezone");


router.get("/updatepage", async (req , res) => {
    const { machineoption } = req.query;
    // console.log("機台選項確認 :", machineoption); 

    if (!machineoption || machineoption === undefined || machineoption === null) {
        console.error("機台選項未提供");
    }
    
    switch (String(machineoption).trim()) {
        case "注液機":
            sql = "SELECT * FROM mes.injection_realtime ORDER BY ID DESC limit 1";
            break;
        case "注液機二期":
            sql = "SELECT * FROM mes.injection_realtime_2 ORDER BY ID DESC limit 1";
            break;
        
        default:
            return res.status(400).json({ message: "無效的機台選項" });
    }

    try {

    const [rows] = await db2.query(sql);
    res.json(rows);

    
    } catch (error) {
        console.error("發生錯誤", error);
        res.status(500).json({
        message: "取得資料錯誤",
        });
    }
});

router.get("/groupname_capacitynum" , async (req, res) => {
    const {machineoption , endDay} = req.query;
    console.log ( "machineoption :", machineoption , "endDay :", endDay);

    const currentDay = moment(endDay).tz("Asia/Taipei").format("YYYY-MM-DD");
    // console.log("機台確認  :", machineoption);
    

    const startDay = currentDay + " 00:00:00"; 
    const endDayToTranslate = currentDay + " 23:59:59";
    // console.log("startDay :", startDay, "endDayToTranslate :", endDayToTranslate);

    let sql = "";
    let sql_Staff = "";
    let sql_StaffName = "";
    let sql_conbine = ""

   
    
    if (!machineoption) {
        return res.status(400).json({ message: "機台選項未提供" });
    }

    switch (String(machineoption).trim()) {
        case "注液機":
            sql = `SELECT COUNT(DISTINCT PLCCellID_CE) FROM mes.injection_batch_fin WHERE REMARK LIKE "注液機出料自動寫入" AND Time BETWEEN ? AND ?`;
            break;
        
        case "注液機二期":
            sql = `SELECT COUNT(DISTINCT PLCCellID_CE) FROM mes.injection_batch_fin WHERE REMARK LIKE "注液機二期出料自動寫入" AND Time BETWEEN ? AND ?`;
            break;
         
        default:
            sql = "";
            break;
    }


    if (!sql) {
        return res.status(400).json({ 
            message: "無效的機台選項", 
            machineoption: machineoption 
        });
    }

        sql_Staff = `SELECT DISTINCT OPNO FROM mes.injection_batch_fin WHERE Time BETWEEN ? AND ?`;
        sql_conbine = `
            SELECT 
                COUNT(DISTINCT CASE WHEN REMARK LIKE '注液機出料自動寫入' THEN PLCCellID_CE END) AS injection_01,
                COUNT(DISTINCT CASE WHEN REMARK LIKE '注液機二期出料自動寫入' THEN PLCCellID_CE END) AS injection_02
            FROM mes.injection_batch_fin
            WHERE Time BETWEEN ? AND ?;
        `


    try {
        // 計算總體產能
        const [rowsToday] = await db2.query(sql, [startDay, endDayToTranslate]);
        const [rows] = await db2.query(sql, [endDay, endDayToTranslate]);
        const [staffRows] = await db2.query(sql_Staff, [startDay, endDayToTranslate]);
        const [conbine_DoubleTable] = await db2.query(sql_conbine, [startDay, endDayToTranslate]);
        // console.log("conbine check  :" , endDay, endDayToTranslate)

        // console.log("合併雙表產能數據 :", conbine_DoubleTable[0]);
        
        for (const key in conbine_DoubleTable[0]) {
            let doubleColumns_conbine
            doubleColumns_conbine = conbine_DoubleTable[0]["injection_01" ] + conbine_DoubleTable[0]["injection_02"];
            conbine_DoubleTable[0]["total_capacity"] = doubleColumns_conbine;
        }
        
        
        // 計算昨天晚上8點到今天早上8點的產能 (晚班)
        const yesterday = moment().tz("Asia/Taipei").subtract(1, "day").format("YYYY-MM-DD");
        const yesterdayEvening = `${yesterday} 20:00:00`;
        const todayMorning = `${currentDay} 08:00:00`;
        const [nightShiftRows] = await db2.query(sql, [yesterdayEvening, todayMorning]);
    
        // 計算今天早上8點到今天晚上8點的產能 (早班)
        const todayEvening = `${currentDay} 20:00:00`;
        const [morningShiftRows] = await db2.query(sql, [todayMorning, todayEvening]);

        sql_StaffName = `SELECT memberName FROM hr_memberinfo WHERE memberID = ? `;

        if (Array.isArray(staffRows) && staffRows.length > 0) {
            await Promise.all(
                staffRows.map(async (staff) => {
                    const staffNo1 = staff.OPNO;

                    // 獲取員工姓名
                    const [staffName1] = await db2.query(sql_StaffName, [staffNo1]);

                    // 將員工姓名添加到對應的屬性中
                    staff.StaffName1 = staffName1[0]?.memberName || "未知";
                })
            );
        }

        // console.log (
        //     "rowsToday  :", rowsToday,
        //     "rows  :", rows,
        //     "nightShiftRows  :", nightShiftRows,
        //     "morningShiftRows  :", morningShiftRows

        // )

        // console.log("合併雙表總產能 :", conbine_DoubleTable[0]['total_capacity']);
        
        const dataToSend = {
            todayCapacity_first_result: rowsToday[0]?.['COUNT(DISTINCT PLCCellID_CE)'] || 0,
            selectedDayCapacity_first_result: rows[0]?.['COUNT(DISTINCT PLCCellID_CE)'] || 0,
            nightShiftCapacity_first_result: nightShiftRows[0]?.['COUNT(DISTINCT PLCCellID_CE)'] || 0,
            morningShiftCapacity_first_result: morningShiftRows[0]?.['COUNT(DISTINCT PLCCellID_CE)'] || 0,
            staffRows: staffRows || [],          
            conbine_DoubleTable: conbine_DoubleTable[0]['total_capacity'] || 0
        }
    
        res.status(200).json([dataToSend]);
    }catch (error) {
        console.error("發生錯誤", error);
        res.status(500).json({
            message: "取得資料錯誤",
        });
    }
})


//收集全機台當天生產產能數據回傳前端
router.get("/fullmachinecapacity", async (req, res) => {
    const { currentDay } = req.query;

    let sql = `
        SELECT 
            COALESCE(COUNT(DISTINCT CASE WHEN REMARK LIKE "%注液機出料自動寫入%" THEN PLCCellID_CE END), 0) AS 注液機出料自動寫入,
            COALESCE(COUNT(DISTINCT CASE WHEN REMARK LIKE "%注液機二期出料自動寫入%" THEN PLCCellID_CE END), 0) AS 注液機二期出料自動寫入
        FROM mes.injection_batch_fin
        WHERE Time BETWEEN ? AND ?
    `;

    try {
        const startDay = currentDay + " 00:00:00";
        const endDay = currentDay + " 23:59:59";
        
        const [rows] = await db2.query(sql, [startDay, endDay]);
        console.log("全機台當天生產產能數據 :", rows[0]);
       
        res.status(200).json({data: rows[0]});
        
        
    } catch (error) {
        console.error("發生錯誤", error);
        res.status(500).json({
            message: "取得資料錯誤",
        });
    }
});






module.exports = router;