require("dotenv").config();
const express = require("express");
const router = express.Router();
const db2 = require(__dirname + "/../../modules/mysql_connect.js");
const XLSX = require("xlsx");
const moment = require("moment-timezone");


router.get("/updatepage", async (req , res) => {
    const { machineoption } = req.query;
    // console.log("機台選項確認 :", machineoption); 
    sql = "SELECT * FROM mes.cutting_realtime_a ORDER BY ID DESC limit 1";
    

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

    const currentDay = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
    console.log("機台確認  :", machineoption);

    const startDay = currentDay + " 00:00:00"; 
    const endDayToTranslate = currentDay + " 23:59:59";


    let machineoptionConfirm = String(machineoption).trim().split("-")[1];
    console.log("機台選項確認 :", machineoptionConfirm);
    
    

    let sql = "";
    let modifucation = "";
    let sql_Staff = "";
    let sql_StaffName = "";

   
    
    if (!machineoption) {
        return res.status(400).json({ message: "機台選項未提供" });
    }

    switch (machineoptionConfirm) {
        case "良品":
            sql = 
            `SELECT case WHEN SUM( Prdouction ) is NULL then '0' 
                ELSE SUM( Prdouction ) END 良品總計 
                FROM mes.cutting_bath tb1 
                WHERE 1=1 AND 
                OKNGSelection = '良品' And 
                Caseno like 'B%' AND 
                Time between ? AND ?`;
            modifucation = "良品總計";
            break;
        
        case "不良品":
            sql = `SELECT case WHEN SUM( Prdouction ) is NULL then '0' 
                ELSE SUM( Prdouction ) END 不良品總計 
                FROM mes.cutting_bath tb1 
                WHERE 1=1 AND 
                OKNGSelection = '不良品' And 
                Caseno like 'B%' AND 
                Time between ? AND ?`;
            modifucation = "不良品總計";
            
            break;
         
        case "報廢品": 
            sql = `SELECT case WHEN SUM( Prdouction ) is NULL then '0' 
                ELSE SUM( Prdouction ) END 報廢品總計 
                FROM mes.cutting_bath tb1 WHERE 1=1 AND 
                OKNGSelection = '報廢品' AND Caseno like 'B%' AND
                Time between ? AND ?`;
            modifucation = "報廢品總計";
            break;

        case "手動良品":
            sql = `SELECT CASE WHEN COUNT(Prdouction) IS NULL THEN '0' 
                        ELSE COUNT(Prdouction) END AS 手工良品總計 
                FROM mes.cutting_bath tb1 
                WHERE OKNGSelection = '手工良品(Manual Good)' 
                    AND Caseno LIKE 'B%' 
                    AND Time BETWEEN ? AND ?`;
            modifucation = "手工良品總計";
            break;

        case "手動不良品":
            sql = `SELECT case WHEN SUM( OKNGSelection ) is NULL then '0' 
                ELSE SUM( OKNGSelection ) END 手動不良品總計 
                FROM mes.cutting_bath tb1 WHERE 1=1 AND 
                ( ManualInput <> '' OR ManualInput NOT LIKE 'N%' ) AND 
                 OKNGSelection = '不良品' AND 
                 Caseno like 'B%' AND 
                Time between ? AND ?`;
            modifucation = "手工不良品總計";
                
            break;
        default:
            sql = "";
            break;
    }

    sql_Staff = `SELECT StaffNo1 , StaffNo2 FROM mes.cutting_bath WHERE Time BETWEEN ? AND ? LIMIT 1`;
    
    

    

    if (!sql) {
    return res.status(400).json({ 
        message: "無效的機台選項", 
        machineoption: machineoption 
    });
}

    try {
        // 計算總體產能
        const [rowsToday] = await db2.query(sql, [startDay, endDayToTranslate]);
        const [rows] = await db2.query(sql, [endDay, endDayToTranslate]);
        const [staffRows] = await db2.query(sql_Staff, [startDay, endDayToTranslate]);
        

        console.log("modifucation :", modifucation);
        
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
                    const staffNo1 = staff.StaffNo1;
                    const staffNo2 = staff.StaffNo2;

                    // 獲取員工姓名
                    const [staffName1] = await db2.query(sql_StaffName, [staffNo1]);
                    const [staffName2] = await db2.query(sql_StaffName, [staffNo2]);

                    // 將員工姓名添加到對應的屬性中
                    staff.StaffName1 = staffName1[0]?.memberName || "未知";
                    staff.StaffName2 = staffName2[0]?.memberName || "未知";
                })
            );
        }
        
        const dataToSend = {
            todayCapacity_first_result: rowsToday[0]?.[modifucation] || 0,
            selectedDayCapacity_first_result: rows[0]?.[modifucation] || 0,
            nightShiftCapacity_first_result: nightShiftRows[0]?.[modifucation] || 0,
            morningShiftCapacity_first_result: morningShiftRows[0]?.[modifucation] || 0,
            staffRows: staffRows || [],
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
            COALESCE(SUM(CASE WHEN OKNGSelection = '良品' THEN Prdouction END), 0) AS 良品總計,
            COALESCE(SUM(CASE WHEN OKNGSelection = '不良品' THEN Prdouction END), 0) AS 不良品總計,
            COALESCE(SUM(CASE WHEN OKNGSelection = '報廢品' THEN Prdouction END), 0) AS 報廢品總計,
            COALESCE(COUNT(CASE WHEN OKNGSelection = '手工良品(Manual Good)' THEN 1 END), 0) AS 手工良品總計,
            COALESCE(COUNT(CASE WHEN OKNGSelection = '不良品' 
                                 AND ManualInput IS NOT NULL 
                                 AND ManualInput <> '' 
                                 AND ManualInput NOT LIKE 'N%' THEN 1 END), 0) AS 手工不良品總計
        FROM mes.cutting_bath 
        WHERE Caseno LIKE 'B%' 
          AND Time BETWEEN ? AND ?
    `;

    try {
        const startDay = currentDay + " 00:00:00";
        const endDay = currentDay + " 23:59:59";
        
        const [rows] = await db2.query(sql, [startDay, endDay]);
        for (let row in rows[0]) {
            rows[0].總良品 = rows[0].良品總計 + rows[0].手工良品總計;
            rows[0].總不良品 = rows[0].不良品總計 + rows[0].手工不良品總計; 
        }
        res.status(200).json({data: rows[0]});
        
    } catch (error) {
        console.error("發生錯誤", error);
        res.status(500).json({
            message: "取得資料錯誤",
        });
    }
});






module.exports = router;