require("dotenv").config();
const express = require("express");
const router = express.Router();
const dbmes = require(__dirname + "/../../modules/mysql_connect.js");
const XLSX = require("xlsx");
const moment = require("moment-timezone");


// 分容站最新一筆資料查詢
router.get("/updatepage" , async (req , res) =>{
    const {machineoption}  = req.query || {};
    let sql = '';

    // console.log ("Received machineoption:", machineoption);

    if (!machineoption) {
        return res.status(400).json({ error: "Missing machineoption parameter" });
    }

    const machineSelect = String(machineoption).trim();
    // console.log ("machineSelect:", machineSelect);

    switch (machineSelect) {

        case "CC1-分容機一期":
            sql = `SELECT * FROM mes.seci_outport12  
            WHERE Param LIKE '%010%' AND 
            time >= CURDATE()  AND 
            time < DATE_ADD(CURDATE(), INTERVAL 1 DAY) 
            ORDER BY time DESC LIMIT 1;`;
        break;

        case "CC1-分容機二期": 
            sql = `SELECT * FROM mes.chroma_outport123 
            WHERE Param LIKE '%010%' AND
            time >= CURDATE()
            AND time < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            ORDER BY id DESC LIMIT 1`
        break;

        case "CC2-分容機一期":
            sql = `SELECT * FROM mes.seci_outport12 
            WHERE Param LIKE '%017%' AND 
            time >= CURDATE()  AND 
            time < DATE_ADD(CURDATE(), INTERVAL 1 DAY) 
            ORDER BY time DESC LIMIT 1;`;
        break;

        case "CC2-分容機二期":
            sql = `SELECT * FROM mes.chroma_outport123 
            WHERE Param LIKE '%017%' AND 
            time >= CURDATE()  AND 
            time < DATE_ADD(CURDATE(), INTERVAL 1 DAY) 
            ORDER BY time DESC LIMIT 1;`;
        break;
    }

    if (!sql || sql.trim() === "") {
        return res.status(400).json({ error: "SQL query is empty" });
        }

    try{
        let [rows] = await dbmes.query(sql);
        // console.log("sql:", sql);
        // console.log("Query Result:", rows);
        res.status(200).json(rows);
            
    }catch(err){
        // console.error("Database query error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
})

router.get("/groupname_capacitynum" , async (req , res) =>{

    //startDay === 選定開始時間
    //endDay === 由前端系統送出確認查詢當下的時間
    
    const {machineoption , startDay, endDay} = req.query || {};

    console.log ("startDay :", startDay);
    console.log ("endDay :", endDay);
    console.log ("machineoption :", machineoption, typeof machineoption);

    const currentDay = moment().tz("Asia/Taipei").format("YYYY-MM-DD");

    const startDateToTranslate = startDay + " 00:00:00"; // 自行設定 為當天日期的00:00:00
    const endDayToTranslate = startDay+ " 23:59:59"; // 自行設定 為當天日期的23:59:59

    const start = moment(startDay).tz("Asia/Taipei").format("YYYY-MM-DD 00:00:00") // 前端送來 使用者選定開始日期
    const end = moment(currentDay).tz("Asia/Taipei").format("YYYY-MM-DD 23:59:59") // 前端送來 使用者選定當天日期
    

    const nightShiftStart = moment(end).subtract(1, 'days').format("YYYY-MM-DD") + " 20:00:00"; // 夜班開始時間
    const nightShiftEnd = moment(end).format("YYYY-MM-DD") + " 08:00:00"; // 夜班結束時間
   
    const morningShiftStart = moment(end).format("YYYY-MM-DD") + " 08:00:00"; // 早班開始時間
    const morningShiftEnd = moment(end).format("YYYY-MM-DD") + " 20:00:00"; // 早班結束時間


    const machineoptionConfirm = String(machineoption).trim();
    console.log("machineoptionConfirm :", machineoptionConfirm);

    if (!machineoptionConfirm){
        return res.status(400).json({ error: "Missing machineoption parameter" });
    }

   let sql = ""; 

   switch (machineoptionConfirm) {
    case "CC1-分容機一期":
            sql = `
            SELECT
                SUM(CASE WHEN time BETWEEN '${startDateToTranslate}' AND '${endDayToTranslate}' THEN 1 ELSE 0 END) AS todayCapacity_result, -- 今日分容數量
                SUM(CASE WHEN time BETWEEN '${start}' AND '${end}' THEN 1 ELSE 0 END) AS amountCapacity_result, -- 累計時間分容數量
                SUM(CASE WHEN time BETWEEN '${nightShiftStart}' AND '${nightShiftEnd}' THEN 1 ELSE 0 END) AS nightShiftCapacity_result, -- 晚班分容數量
                SUM(CASE WHEN time BETWEEN '${morningShiftStart}' AND '${morningShiftEnd}' THEN 1 ELSE 0 END) AS morningShiftCapacity_result -- 早班分容數量
            FROM
                mes.seci_outport12
            WHERE
                Param LIKE '%010%';
            `;
        break;

        case "CC1-分容機二期": 
            sql = `
            SELECT
                SUM(CASE WHEN time BETWEEN '${startDateToTranslate}' AND '${endDayToTranslate}' THEN 1 ELSE 0 END) AS todayCapacity_result, -- 今日分容數量
                SUM(CASE WHEN time BETWEEN '${start}' AND '${end}' THEN 1 ELSE 0 END) AS amountCapacity_result, -- 累計時間分容數量
                SUM(CASE WHEN time BETWEEN '${nightShiftStart}' AND '${nightShiftEnd}' THEN 1 ELSE 0 END) AS nightShiftCapacity_result, -- 晚班分容數量
                SUM(CASE WHEN time BETWEEN '${morningShiftStart}' AND '${morningShiftEnd}' THEN 1 ELSE 0 END) AS morningShiftCapacity_result -- 早班分容數量
            FROM
                mes.chroma_outport123
            WHERE
                Param LIKE '%010%';
            `
        break;
        case "CC2-分容機一期":
            sql = `
            SELECT
                SUM(CASE WHEN time BETWEEN '${startDateToTranslate}' AND '${endDayToTranslate}' THEN 1 ELSE 0 END) AS todayCapacity_result, -- 今日分容數量
                SUM(CASE WHEN time BETWEEN '${start}' AND '${end}' THEN 1 ELSE 0 END) AS amountCapacity_result, -- 累計時間分容數量
                SUM(CASE WHEN time BETWEEN '${nightShiftStart}' AND '${nightShiftEnd}' THEN 1 ELSE 0 END) AS nightShiftCapacity_result, -- 晚班分容數量
                SUM(CASE WHEN time BETWEEN '${morningShiftStart}' AND '${morningShiftEnd}' THEN 1 ELSE 0 END) AS morningShiftCapacity_result -- 早班分容數量
            FROM
                mes.seci_outport12
            WHERE
                Param LIKE '%017%';
            `;
        break;
        case "CC2-分容機二期":
            sql = `
            SELECT
                SUM(CASE WHEN time BETWEEN '${startDateToTranslate}' AND '${endDayToTranslate}' THEN 1 ELSE 0 END) AS todayCapacity_result, -- 今日分容數量
                SUM(CASE WHEN time BETWEEN '${start}' AND '${end}' THEN 1 ELSE 0 END) AS amountCapacity_result, -- 累計時間分容數量
                SUM(CASE WHEN time BETWEEN '${nightShiftStart}' AND '${nightShiftEnd}' THEN 1 ELSE 0 END) AS nightShiftCapacity_result, -- 晚班分容數量
                SUM(CASE WHEN time BETWEEN '${morningShiftStart}' AND '${morningShiftEnd}' THEN 1 ELSE 0 END) AS morningShiftCapacity_result -- 早班分容數量
            FROM
                mes.chroma_outport123
            WHERE
                Param LIKE '%017%';
            `
        break;
   }

   try{

    const [rows] = await dbmes.query(sql);
    
    res.status(200).json({
        "todayCapacity_first_result": rows[0]?.todayCapacity_result || "0",
        "amountCapacity_first_result": rows[0]?.amountCapacity_result || "0",
        "nightShiftCapacity_first_result": rows[0]?.nightShiftCapacity_result || "0",
        "morningShiftCapacity_first_result": rows[0]?.morningShiftCapacity_result || "0",
        "staffRows": {} // 預留給未來擴展使用
    });

    
   }catch(error){
    console.error("Database query error:", error);
    return res.status(500).json({ error: "Internal server error" });
    
   }
   
});


router.get("/fullmachinecapacity" , async (req , res) =>{
    const {currentDay} = req.query || {};
    const now = moment().tz("Asia/Taipei");

    let startDateToTranslate , endDayToTranslate // 班別產能時間

    let nightShiftStart , nightShiftEnd

    let morningShiftStart = now.format("YYYY-MM-DD") + " 08:00:00"  // 早班時間開始
    let morningShiftEnd = now.format("YYYY-MM-DD") + " 20:00:00" // 早班時間結束

    // 使用當前時間判斷班別
    const currentTime = currentDay ? moment(currentDay).tz("Asia/Taipei") : now;
    const currentHour = currentTime.hour();

    // 班別產能時間轉換
    if (currentHour >= 8 && currentHour < 20) {
        //  這是白班你知道的
        startDateToTranslate = currentTime.format("YYYY-MM-DD") + " 08:00:00"; // 自行設定 為當天日期的08:00:00
        endDayToTranslate = currentTime.format("YYYY-MM-DD") + " 20:00:00"; // 自行設定 為當天日期的20:00:00
    }
    else if (currentHour >= 20 && currentHour < 24) {
        // 這是夜班你知道的
        startDateToTranslate = currentTime.format("YYYY-MM-DD") + " 20:00:00"; // 自行設定 為當天日期的20:00:00
        endDayToTranslate = moment(currentTime).add(1, 'day').format("YYYY-MM-DD") + " 08:00:00"; // 自行設定 為次日的08:00:00

        nightShiftStart = moment(now).format("YYYY-MM-DD") + " 20:00:00"// 夜班時間開始
        nightShiftEnd = moment(now).format("YYYY-MM-DD") + " 00:00:00" // 夜班時間結束
    }
    else if (currentHour < 8) {
        // 這是夜班你知道的
        startDateToTranslate = moment(currentTime).subtract(1, 'day').format("YYYY-MM-DD") + " 20:00:00"; // 自行設定 為前一天日期的20:00:00
        endDayToTranslate = currentTime.format("YYYY-MM-DD") + " 08:00:00"; // 自行設定 為當天日期的08:00:00

        nightShiftStart = moment(now).subtract(1, 'day').format("YYYY-MM-DD") + " 20:00:00"// 夜班時間開始
        nightShiftEnd = moment(now).format("YYYY-MM-DD") + " 08:00:00" // 夜班時間結束
    }


    //總體產能時間

    let sql_one = `
    SELECT 
        SUM(CASE WHEN time BETWEEN '${startDateToTranslate}' AND '${endDayToTranslate}' AND Param Like '%010%' THEN 1 ELSE 0 END) AS todayCapacity_result, -- CC1-分容機一期 班別產能
        SUM(CASE WHEN time BETWEEN '${startDateToTranslate}' AND '${endDayToTranslate}' AND Param Like '%017%' THEN 1 ELSE 0 END) AS todayCapacity_result_cc2 -- CC2-分容機一期 班別產能
    FROM mes.seci_outport12;
    `
    let sql_two = `
    SELECT 
        SUM(CASE WHEN time BETWEEN '${startDateToTranslate}' AND '${endDayToTranslate}' AND Param Like '%010%' THEN 1 ELSE 0 END) AS todayCapacity_result, -- CC1-分容機二期 班別產能
        SUM(CASE WHEN time BETWEEN '${startDateToTranslate}' AND '${endDayToTranslate}' AND Param Like '%017%' THEN 1 ELSE 0 END) AS todayCapacity_result_cc2 -- CC2-分容機二期 班別產能
    FROM mes.chroma_outport123;
    `

    let sql_total = `
    SELECT 
        SUM(CASE WHEN time BETWEEN '${morningShiftStart}' AND '${morningShiftEnd}' AND (Param LIKE '%010%' OR Param LIKE '%017%') THEN 1 ELSE 0 END) AS capacity_result -- cc1 + cc2 早班總產能 (一期)
    FROM mes.seci_outport12
    UNION ALL
    SELECT 
        SUM(CASE WHEN time BETWEEN '${nightShiftStart}' AND '${nightShiftEnd}' AND (Param LIKE '%010%' OR Param LIKE '%017%') THEN 1 ELSE 0 END) AS capacity_result -- cc1 + cc2 夜班總產能 (一期)
    FROM mes.seci_outport12
    UNION ALL
    SELECT 
        SUM(CASE WHEN time BETWEEN '${morningShiftStart}' AND '${morningShiftEnd}' AND (Param LIKE '%010%' OR Param LIKE '%017%') THEN 1 ELSE 0 END) AS capacity_result -- cc1 + cc2 早班總產能 (二期)
    FROM mes.chroma_outport123
    UNION ALL
    SELECT 
        SUM(CASE WHEN time BETWEEN '${nightShiftStart}' AND '${nightShiftEnd}' AND (Param LIKE '%010%' OR Param LIKE '%017%') THEN 1 ELSE 0 END) AS capacity_result -- cc1 + cc2 夜班總產能 (二期)
    FROM mes.chroma_outport123
    `

    console.log(
        "startDateToTranslate" , startDateToTranslate,
        "endDayToTranslate" , endDayToTranslate,
        "morningShiftStart" , morningShiftStart,
        "morningShiftEnd" , morningShiftEnd,
        "nightShiftStart" , nightShiftStart,
        "nightShiftEnd" , nightShiftEnd
    )

    console.log("sql_total:", sql_total);

    try{

        const [[rows_one], [rows_two], [rows_total]] = await Promise.all([
            dbmes.query(sql_one),
            dbmes.query(sql_two),
            dbmes.query(sql_total)
        ]);
        
        console.log("rows_one:", rows_one);
        console.log("rows_two:", rows_two);
        console.log("rows_total:", rows_total);

        const data = {
            "CC1-分容機一期": rows_one[0]?.todayCapacity_result || 0,// 班別產能 cc1 (一期)
            "CC2-分容機一期": rows_one[0]?.todayCapacity_result_cc2 || 0, // 班別產能 cc2 (一期)
            "CC1-分容機二期": rows_two[0]?.todayCapacity_result || 0, // 班別產能 cc1 (二期)
            "CC2-分容機二期": rows_two[0]?.todayCapacity_result_cc2 || 0, // 班別產能 cc2 (二期)
        }

        const Total_capacity_shift = {
            "分容機一期早班總產能": rows_total[0]?.capacity_result || 0,
            "分容機一期夜班總產能": rows_total[1]?.capacity_result || 0,
            "分容機二期早班總產能": rows_total[2]?.capacity_result || 0,
            "分容機二期夜班總產能": rows_total[3]?.capacity_result || 0,
        }

        res.status(200).json({
            message: "Success",
            data,
            Total_capacity_shift

        })

        

        

    }catch(error){
        console.error("Database query error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
})

module.exports = router;