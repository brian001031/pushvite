require("dotenv").config();
const express = require("express");
const router = express.Router();
const ms_newsql = require("mssql");
const moment = require("moment-timezone");



const MS_dbconfig = {
    server: "192.168.200.52",
    database: "ASRS_HTBI",
    user: "HTBI_MES",
    password: "mes123",
    port: parseInt(process.env.MSSQL_PORT, 10) || 1433, // 使用默認端口
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    multipleStatements: true,
    options: {
        encrypt: true, // 如果使用 Azure SQL Database，需設為 true
        trustServerCertificate: true, // 若使用自簽名憑證，可設為 true
    },
}

router.get("/updatepage" , async (req , res) =>{
    const {machineoption , endDay}  = req.query || {};

    // console.log ("Had received the data from api ht_aging - /updatepage" ,
    //     machineoption,
    //     endDay
    // )

    if (!machineoption){
        res.status(404).json({error: "No machineoption provided"});
        return;
    }

    const currentDay = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
    const start = moment(currentDay).tz("Asia/Taipei").format("YYYY-MM-DD 00:00:00") // 前端送來 使用者選定開始日期
    const end = moment(endDay).tz("Asia/Taipei").format("YYYY-MM-DD 23:59:59") // 前端送來 使用者選定當天日期
    const nightShiftStart = moment(end).subtract(1, 'days').format("YYYY-MM-DD") + " 20:00:00"; // 夜班開始時間
    const nightShiftEnd = moment(end).format("YYYY-MM-DD") + " 08:00:00"; // 夜班結束時間
    const morningShiftStart = moment(end).format("YYYY-MM-DD") + " 08:00:00"; // 早班開始時間
    const morningShiftEnd = moment(end).format("YYYY-MM-DD") + " 20:00:00"; // 早班結束時間
    


    // SQL查詢 高溫倉(HT aging) 今天的資料
    let sql_today = `
    SELECT TOP 1 *
    FROM "ITFC_MES_UPLOAD_STATUS_TB"
    WHERE
        CREATE_DATE >= CAST(GETDATE() AS DATE)  -- 今天開始 (午夜 00:00:00)
        AND CREATE_DATE < DATEADD(day, 1, CAST(GETDATE() AS DATE)) -- 明天開始 (下一天的午夜 00:00:00)
        AND BIN_CODE LIKE 'H%' 
        AND BOX_BATT <> '%NA%';
    `;

    try{
        const pool = await ms_newsql.connect(MS_dbconfig);
        let finalSned = {}

        const todayRequest = pool.request();
        const todayData= await todayRequest.query(sql_today)
        const todayData_beSend = todayData.recordset;
       

        // console.log ( "todayData :", todayData_beSend)

        const [rows] = [{todayData: todayData_beSend[0]}]

        for (const key in rows.todayData) {
            if (rows.todayData.hasOwnProperty(key)) {
                finalSned[key] = rows.todayData[key];
            }
        }

        res.status(200).json([finalSned])
            
        
    }catch(error){
        console.error("Database query error:", error);
        res.status(500).json({ error: "Internal server error" });
    }

    finally {
        // ms_newsql.close();
    }


})



router.get("/groupname_capacitynum" , async (req , res) =>{
    const {machineoption ,startDay , endDay}  = req.query || {};

    let rows = {}


    if (!machineoption){
        res.status(404).json({error: "No machineoption provided"});
        return;
    }  

    const currentDay = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
    const start = moment(startDay).tz("Asia/Taipei").format("YYYY-MM-DD 00:00:00") // 前端送來 使用者選定開始日期
    const end = moment(currentDay).tz("Asia/Taipei").format("YYYY-MM-DD 23:59:59") // 前端送來 使用者選定當天日期
    const nightShiftStart = moment(end).subtract(1, 'days').format("YYYY-MM-DD") + " 20:00:00"; // 夜班開始時間
    const nightShiftEnd = moment(end).format("YYYY-MM-DD") + " 08:00:00"; // 夜班結束時間       
    const morningShiftStart = moment(end).format("YYYY-MM-DD") + " 08:00:00"; // 早班開始時間
    const morningShiftEnd = moment(end).format("YYYY-MM-DD") + " 20:00:00"; // 早班結束時間
    


    // SQL查詢 高溫倉(HT aging) 今天的資料
    let sql_today = `
    SELECT COUNT (BIN_CODE) AS today_capacitynum
    FROM "ITFC_MES_UPLOAD_STATUS_TB"
    WHERE
        CREATE_DATE >= CAST(GETDATE() AS DATE)  -- 今天開始 (午夜 00:00:00)
        AND CREATE_DATE < DATEADD(day, 1, CAST(GETDATE() AS DATE)) -- 明天開始 (下一天的午夜 00:00:00)
        AND BIN_CODE LIKE 'H%' 
        AND BOX_BATT <> '%NA%';
    `;

    let sql_amount = `
    SELECT COUNT (BIN_CODE) AS amount_capacitynum
    FROM "ITFC_MES_UPLOAD_STATUS_TB"
    WHERE
        CREATE_DATE >= @START AND
        CREATE_DATE <= @END
        AND BIN_CODE LIKE 'H%' 
        AND BOX_BATT <> '%NA%';
    `
    let sql_amount_morning = `
    SELECT COUNT (BIN_CODE) AS morning_capacitynum
    FROM "ITFC_MES_UPLOAD_STATUS_TB"
    WHERE
        CREATE_DATE >= @START AND
        CREATE_DATE <= @END
        AND BIN_CODE LIKE 'H%' 
        AND BOX_BATT <> '%NA%';
    `
    let sql_amount_night = `
    SELECT COUNT (BIN_CODE) AS night_capacitynum
    FROM "ITFC_MES_UPLOAD_STATUS_TB"
    WHERE
        CREATE_DATE >= @START AND
        CREATE_DATE <= @END
        AND BIN_CODE LIKE 'H%' 
        AND BOX_BATT <> '%NA%';
    `

    try{
        const pool = await ms_newsql.connect(MS_dbconfig);

        const todayRequest = pool.request();

        // 算累加產能(累加資料 / 夜班 / 早班)
        const amountRequest = pool.request();
        amountRequest.input('START', ms_newsql.DateTime, start);
        amountRequest.input('END', ms_newsql.DateTime, end);
        

        const morningRequest = pool.request();
        morningRequest.input('START', ms_newsql.DateTime, morningShiftStart);
        morningRequest.input('END', ms_newsql.DateTime, morningShiftEnd);

        const nightRequest = pool.request();
        nightRequest.input('START', ms_newsql.DateTime, nightShiftStart);
        nightRequest.input('END', ms_newsql.DateTime, nightShiftEnd);

        const [todayData, amountData, nightData, morningData] = await Promise.all([
            todayRequest.query(sql_today),
            amountRequest.query(sql_amount),
            nightRequest.query(sql_amount_night),
            morningRequest.query(sql_amount_morning)
        ]);

        const todayData_beSend = todayData.recordset;
        const amountData_beSend = amountData.recordset;
        const nightData_beSend = nightData.recordset;
        const morningData_beSend = morningData.recordset;


        // console.log (
        //     "todayData :", todayData_beSend[0],
        //     "amountData :", amountData_beSend[0],
        //     "nightData :", nightData_beSend[0],
        //     "morningData :", morningData_beSend[0]
        // )


    res.status(200).json([{
        today_capacitynum: todayData_beSend[0]?.today_capacitynum || 0,
        amount_capacitynum: amountData_beSend[0]?.amount_capacitynum || 0,
        night_capacitynum: nightData_beSend[0]?.night_capacitynum || 0,
        morning_capacitynum: morningData_beSend[0]?.morning_capacitynum || 0
    }])

        
    }catch(error){
        console.error("Database query error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
    finally {
        ms_newsql.close();
    }
})



router.get("/fullmachinecapacity", async (req, res) => {
    const { currentDay } = req.query || {};
    if (!currentDay) {
        return res.status(400).json({ error: "缺少 currentDay 參數" });
    }

    // 時段界定
    const morningStart = moment(currentDay).tz("Asia/Taipei").format("YYYY-MM-DD") + " 08:00:00";
    const morningEnd = moment(currentDay).tz("Asia/Taipei").format("YYYY-MM-DD") + " 20:00:00";
    const nightStart = moment(currentDay).tz("Asia/Taipei").format("YYYY-MM-DD") + " 20:00:00";
    const nightEnd = moment(currentDay).tz("Asia/Taipei").add(1, 'day').format("YYYY-MM-DD") + " 08:00:00";
    const last_nightStart = moment(currentDay).tz("Asia/Taipei").subtract(1, 'day').format("YYYY-MM-DD") + " 20:00:00";
    const last_nightEnd = moment(currentDay).tz("Asia/Taipei").format("YYYY-MM-DD") + " 08:00:00";

    // 使用三個子查詢計算各時段 DISTINCT BIN_CODE 數量
    const sql_total = `
        SELECT
            (SELECT COUNT(DISTINCT BIN_CODE) FROM ITFC_MES_UPLOAD_STATUS_TB
             WHERE BIN_CODE LIKE 'H%' AND BOX_BATT <> '%NA%' AND CREATE_DATE >= @morningStart AND CREATE_DATE < @morningEnd) AS morning_capacity,
            (SELECT COUNT(DISTINCT BIN_CODE) FROM ITFC_MES_UPLOAD_STATUS_TB
             WHERE BIN_CODE LIKE 'H%' AND BOX_BATT <> '%NA%' AND CREATE_DATE >= @nightStart AND CREATE_DATE < @nightEnd) AS night_capacity,
            (SELECT COUNT(DISTINCT BIN_CODE) FROM ITFC_MES_UPLOAD_STATUS_TB
             WHERE BIN_CODE LIKE 'H%' AND BOX_BATT <> '%NA%' AND CREATE_DATE >= @last_nightStart AND CREATE_DATE < @last_nightEnd) AS last_night_capacity;
    `;

    try {
        const pool = await ms_newsql.connect(MS_dbconfig);
        const totalRequest = pool.request();
        totalRequest.input('morningStart', ms_newsql.DateTime, morningStart);
        totalRequest.input('morningEnd', ms_newsql.DateTime, morningEnd);
        totalRequest.input('nightStart', ms_newsql.DateTime, nightStart);
        totalRequest.input('nightEnd', ms_newsql.DateTime, nightEnd);
        totalRequest.input('last_nightStart', ms_newsql.DateTime, last_nightStart);
        totalRequest.input('last_nightEnd', ms_newsql.DateTime, last_nightEnd);

        const totalData = await totalRequest.query(sql_total);
        const rec = totalData.recordset && totalData.recordset[0] ? totalData.recordset[0] : {};
        const responseObj = {
            "早班產能": rec.morning_capacity || 0,
            "晚班產能": rec.night_capacity || 0,
            "昨天晚班產能": rec.last_night_capacity || 0,
            "當天總產能": (rec.morning_capacity || 0) + (rec.night_capacity || 0)
        };
        res.status(200).json({ data: responseObj });
    } catch (error) {
        console.error("Database query error:", error);
        res.status(500).json({ error: "Internal server error" });
    } finally {
        ms_newsql.close();
    }
});




module.exports = router;



