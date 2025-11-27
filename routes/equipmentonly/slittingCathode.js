require("dotenv").config();
const express = require("express");
const axios = require("axios");
const dbmes = require(__dirname + "/../../modules/mysql_connect_mes.js");
const moment = require("moment-timezone");
const mysql = require("mysql2");
const router = express.Router();

dbmes.once("error", (err) => {
  console.log("Error in connecting to database: ", err);
});


router.get("/updatepage", async (req, res) => {
    const { machineoption } = req.query;

    let sql = "SELECT * FROM mes.slittingcathode_batch where is_deleted LIKE 0 AND (STOCK <> 1 OR STOCK IS NULL) ORDER BY id DESC LIMIT 1";

    try{
        const [rows] = await dbmes.query(sql);
        res.status(200).json(rows);

        
    }catch(error){
        console.error("發生錯誤", error);
        res.status(500).json({
        message: "取得資料錯誤",
        });
        throw error;
    }
})

router.get("/groupname_capacitynum", async (req, res) => {
    const { machineoption  , startDay , endDay } = req.query;

      let start , end , nightShiftStart , nightShiftEnd , morningShiftStart , morningShiftEnd;
      const now = new Date()

      console.log("startDay:", startDay, "endDay:", endDay);

      start = moment(startDay, 'YYYY/MM/DD').format('YYYY-MM-DD') + " 00:00:00";
      end = moment(endDay, 'YYYY/MM/DD').format('YYYY-MM-DD') + " 23:59:59";

      nightShiftStart = moment(endDay, 'YYYY/MM/DD').format('YYYY-MM-DD') + " 20:00:00";
      nightShiftEnd = moment(endDay, 'YYYY/MM/DD').format('YYYY-MM-DD') + " 08:00:00";
      morningShiftStart = moment(endDay, 'YYYY/MM/DD').format('YYYY-MM-DD') + " 08:00:00";
      morningShiftEnd = moment(endDay, 'YYYY/MM/DD').format('YYYY-MM-DD') + " 20:00:00";

    let sql = `SELECT
    -- R Side 當天 START
    SUM(CASE
        WHEN DATE(employee_InputTime) = CURDATE() AND lotNumber_R IS NOT NULL AND lotNumber_R <> '' AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
        THEN CAST(COALESCE(Length_R, 0) AS DECIMAL(10,2))  -- 符合條件時，加總 Length_R 的值
        ELSE 0         -- 不符合條件時，加 0
    END) AS todayCapacity_R_Length, -- 當天產能 R side 總長度

    SUM(CASE
        WHEN DATE(employee_InputTime) = CURDATE() AND lotNumber_R IS NOT NULL AND lotNumber_R <> '' AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
        THEN CAST(COALESCE(LostLength_R, 0) AS DECIMAL(10,2))  -- 符合條件時，加總 LostLength_R 的值
        ELSE 0         -- 不符合條件時，加 0
    END) AS todayLost_R_Length, -- 當天Lost R side 總長度
    -- R Side 當天 END


    -- L Side 當天 START
    SUM(CASE
        WHEN DATE(employee_InputTime) = CURDATE() AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
        THEN CAST(COALESCE(Length_L, 0) AS DECIMAL(10,2))  -- 符合條件時，加總 Length_L 的值
        ELSE 0  -- 不符合時，加 0
    END) AS todayCapacity_L_Length,

    SUM(CASE
        WHEN DATE(employee_InputTime) = CURDATE() AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
        THEN CAST(COALESCE(LostLength_L, 0) AS DECIMAL(10,2))  -- 符合條件時，加總 LostLength_L 的值
        ELSE 0  -- 不符合時，加 0
    END) AS todayLost_L_Length, 
    -- L Side 當天 END


    -- R Side (依選擇時間) -- START
    SUM(CASE
        WHEN employee_InputTime >= '${start}' AND employee_InputTime < '${end}' AND lotNumber_R IS NOT NULL AND lotNumber_R <> '' AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
        THEN CAST(COALESCE(Length_R, 0) AS DECIMAL(10,2))  
        ELSE 0   -- 不符合時，加 0
    END) AS selectedCapacity_R_Length,

    SUM(CASE
        WHEN employee_InputTime >= '${start}' AND employee_InputTime < '${end}' AND lotNumber_R IS NOT NULL AND lotNumber_R <> '' AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
        THEN CAST(COALESCE(LostLength_R, 0) AS DECIMAL(10,2))  
        ELSE 0  -- 不符合時，加 0
    END) AS selectedLost_R_Length,  
    -- R Side (依選擇時間) -- END


    -- L Side (依選擇時間) -- START
    SUM(CASE
        WHEN employee_InputTime >= '${start}' AND employee_InputTime < '${end}' AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
        THEN CAST(COALESCE(Length_L, 0) AS DECIMAL(10,2))  
        ELSE 0   -- 不符合時，加 0
    END) AS selectedCapacity_L_Length,

    SUM(CASE
        WHEN employee_InputTime >= '${start}' AND employee_InputTime < '${end}' AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
        THEN CAST(COALESCE(LostLength_L, 0) AS DECIMAL(10,2))  
        ELSE 0  -- 不符合時，加 0
    END) AS selectedLost_L_Length,  
    -- L Side (依選擇時間) -- END

        -- R Side (晚班) START
        SUM(CASE
            WHEN employee_InputTime >= '${nightShiftStart}' AND employee_InputTime < '${nightShiftEnd}' AND lotNumber_R IS NOT NULL AND lotNumber_R <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(Length_R, 0) AS DECIMAL(10, 2))
            ELSE 0         -- 不符合條件時，加 0
        END) AS nightShiftCapacity_R_Length, 
        SUM(CASE
            WHEN employee_InputTime >= '${nightShiftStart}' AND employee_InputTime < '${nightShiftEnd}' AND lotNumber_R IS NOT NULL AND lotNumber_R <> ''
             AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
             THEN CAST(COALESCE(LostLength_R, 0) AS DECIMAL(10, 2))
            ELSE 0         -- 不符合條件時，加 0
        END) AS nightShiftLost_R_Length, 
        -- R Side (晚班) END

        -- L Side (晚班) START
        SUM(CASE
            WHEN employee_InputTime >= '${nightShiftStart}' AND employee_InputTime < '${nightShiftEnd}' AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(Length_L, 0) AS DECIMAL(10, 2))
            ELSE 0
        END) AS nightShiftCapacity_L_Length,  
        SUM(CASE
            WHEN employee_InputTime >= '${nightShiftStart}' AND employee_InputTime < '${nightShiftEnd}' AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(LostLength_L, 0) AS DECIMAL(10, 2))
            ELSE 0
        END) AS nightShiftLost_L_Length,  
        -- L Side (晚班) END

        -- R Side (早班) START
        SUM(CASE
            WHEN employee_InputTime >= '${morningShiftStart}' AND employee_InputTime < '${morningShiftEnd}' AND lotNumber_R IS NOT NULL AND lotNumber_R <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(Length_R, 0) AS DECIMAL(10, 2))
            ELSE 0         -- 不符合條件時，加 0
        END) AS morningShiftCapacity_R_Length, 
        SUM(CASE
            WHEN employee_InputTime >= '${morningShiftStart}' AND employee_InputTime < '${morningShiftEnd}' AND lotNumber_R IS NOT NULL AND lotNumber_R <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(LostLength_R, 0) AS DECIMAL(10, 2))
            ELSE 0
        END) AS morningShiftLost_R_Length,
        -- R Side (早班) END

        -- L Side (早班) START
        SUM(CASE
            WHEN employee_InputTime >= '${morningShiftStart}' AND employee_InputTime < '${morningShiftEnd}' AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(Length_L, 0) AS DECIMAL(10, 2))
            ELSE 0
        END) AS morningShiftCapacity_L_Length,
        SUM(CASE
            WHEN employee_InputTime >= '${morningShiftStart}' AND employee_InputTime < '${morningShiftEnd}' AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(LostLength_L, 0) AS DECIMAL(10, 2))
            ELSE 0
        END) AS morningShiftLost_L_Length
        -- L Side (早班) END
    FROM
        mes.slittingcathode_batch;
     
    `

    try{
        const [rows] = await dbmes.query(sql);
        // console.log("sql", sql);
        // console.log("rows:", rows);

        const todayCapacity_R_Length = Number(rows[0].todayCapacity_R_Length).toFixed(2)
        const todayLost_R_Length = Number(rows[0].todayLost_R_Length).toFixed(2)
        const todayCapacity_L_Length = Number(rows[0].todayCapacity_L_Length).toFixed(2)
        const todayLost_L_Length = Number(rows[0].todayLost_L_Length).toFixed(2)

        const selectedCapacity_R_Length = Number(rows[0].selectedCapacity_R_Length).toFixed(2)
        const selectedLost_R_Length = Number(rows[0].selectedLost_R_Length).toFixed(2)
        const selectedCapacity_L_Length = Number(rows[0].selectedCapacity_L_Length).toFixed(2)
        const selectedLost_L_Length = Number(rows[0].selectedLost_L_Length).toFixed(2)

        const nightShiftCapacity_R_Length = Number(rows[0].nightShiftCapacity_R_Length).toFixed(2)
        const nightShiftLost_R_Length = Number(rows[0].nightShiftLost_R_Length).toFixed(2)
        const nightShiftCapacity_L_Length = Number(rows[0].nightShiftCapacity_L_Length).toFixed(2)
        const nightShiftLost_L_Length = Number(rows[0].nightShiftLost_L_Length).toFixed(2)

        const morningShiftCapacity_R_Length = Number(rows[0].morningShiftCapacity_R_Length).toFixed(2)
        const morningShiftLost_R_Length = Number(rows[0].morningShiftLost_R_Length).toFixed(2)
        const morningShiftCapacity_L_Length = Number(rows[0].morningShiftCapacity_L_Length).toFixed(2)
        const morningShiftLost_L_Length = Number(rows[0].morningShiftLost_L_Length).toFixed(2)


        res.status(200).json({
            message: "取得資料成功",
            data: {
                todayCapacity_R_Length : todayCapacity_R_Length - todayLost_R_Length, // 今日R side 產能
                todayCapacity_L_Length : todayCapacity_L_Length - todayLost_L_Length, // 今日L side 產能

                selectedCapacity_R_Length : selectedCapacity_R_Length - selectedLost_R_Length, // 選擇時間R side 產能
                selectedCapacity_L_Length : selectedCapacity_L_Length - selectedLost_L_Length, // 選擇時間L side 產能

                nightShiftCapacity_R_Length : nightShiftCapacity_R_Length - nightShiftLost_R_Length, // 晚班R side 產能
                nightShiftCapacity_L_Length : nightShiftCapacity_L_Length - nightShiftLost_L_Length, // 晚班L side 產能

                morningShiftCapacity_R_Length : morningShiftCapacity_R_Length - morningShiftLost_R_Length, // 早班R side 產能
                morningShiftCapacity_L_Length : morningShiftCapacity_L_Length - morningShiftLost_L_Length // 早班L side 產能
            }
        });

        
    }catch(error){
        console.error("發生錯誤", error);
        res.status(500).json({
        message: "取得資料錯誤",
        });
        throw error;
    }
})


// 塗佈負極 (mes 副-表單)
router.get("/fullmachinecapacity" , async (req, res) => {
    const { currentDay } = req.query || {};
    const now = moment().tz("Asia/Taipei");

    // 使用當前時間判斷班別
    const currentTime = currentDay ? moment(currentDay).tz("Asia/Taipei") : now;

      
      
      
      // 早班：當天 08:00 - 20:00
      let morningShiftStart = currentTime.format("YYYY-MM-DD") + " 08:00:00";
      let morningShiftEnd = moment(currentTime).format("YYYY-MM-DD") + " 20:00:00";
      
      // 夜班：前一天 20:00 - 當天 08:00
      let nightShiftStart = moment(currentTime).subtract(1, 'day').format("YYYY-MM-DD") + " 20:00:00";
      let nightShiftEnd = moment(currentTime).format("YYYY-MM-DD") + " 08:00:00";

      const sql = `
      SELECT 
        -- R Side (晚班) START
        SUM(CASE
            WHEN employee_InputTime >= '${nightShiftStart}' AND employee_InputTime < '${nightShiftEnd}' AND lotNumber_R IS NOT NULL AND lotNumber_R <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(Length_R, 0) AS DECIMAL(10, 2))
            ELSE 0         -- 不符合條件時，加 0
        END) AS nightShiftCapacity_R_Length, 
        SUM(CASE
            WHEN employee_InputTime >= '${nightShiftStart}' AND employee_InputTime < '${nightShiftEnd}' AND lotNumber_R IS NOT NULL AND lotNumber_R <> ''
             AND (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
             THEN CAST(COALESCE(LostLength_R, 0) AS DECIMAL(10, 2))
            ELSE 0         -- 不符合條件時，加 0
        END) AS nightShiftLost_R_Length, 
        -- R Side (晚班) END

        -- L Side (晚班) START
        SUM(CASE
            WHEN employee_InputTime >= '${nightShiftStart}' AND employee_InputTime < '${nightShiftEnd}' AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(Length_L, 0) AS DECIMAL(10, 2))
            ELSE 0
        END) AS nightShiftCapacity_L_Length,  
        SUM(CASE
            WHEN employee_InputTime >= '${nightShiftStart}' AND employee_InputTime < '${nightShiftEnd}' AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(LostLength_L, 0) AS DECIMAL(10, 2))
            ELSE 0
        END) AS nightShiftLost_L_Length,  
        -- L Side (晚班) END

        -- R Side (早班) START
        SUM(CASE
            WHEN employee_InputTime >= '${morningShiftStart}' AND employee_InputTime < '${morningShiftEnd}' AND lotNumber_R IS NOT NULL AND lotNumber_R <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(Length_R, 0) AS DECIMAL(10, 2))
            ELSE 0         -- 不符合條件時，加 0
        END) AS morningShiftCapacity_R_Length, 
        SUM(CASE
            WHEN employee_InputTime >= '${morningShiftStart}' AND employee_InputTime < '${morningShiftEnd}' AND lotNumber_R IS NOT NULL AND lotNumber_R <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_R')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(LostLength_R, 0) AS DECIMAL(10, 2))
            ELSE 0
        END) AS morningShiftLost_R_Length,
        -- R Side (早班) END

        -- L Side (早班) START
        SUM(CASE
            WHEN employee_InputTime >= '${morningShiftStart}' AND employee_InputTime < '${morningShiftEnd}' AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(Length_L, 0) AS DECIMAL(10, 2))
            ELSE 0
        END) AS morningShiftCapacity_L_Length,
        SUM(CASE
            WHEN employee_InputTime >= '${morningShiftStart}' AND employee_InputTime < '${morningShiftEnd}' AND lotNumber_L IS NOT NULL AND lotNumber_L <> '' AND 
            (delete_operation IS NULL OR delete_operation NOT IN ('user_delete_both' , 'user_delete_L')) AND (is_deleted IS NULL OR is_deleted = 0)
            THEN CAST(COALESCE(LostLength_L, 0) AS DECIMAL(10, 2))
            ELSE 0
        END) AS morningShiftLost_L_Length
        -- L Side (早班) END

        FROM
        mes.slittingcathode_batch;
      `

      try{
        const [rows] = await dbmes.query(sql);
        console.log("rows:", rows);
        console.log("sql", sql);

        const data = {
            "早班R側": Number(rows[0].morningShiftCapacity_R_Length) - Number(rows[0].morningShiftLost_R_Length),
            "早班L側": Number(rows[0].morningShiftCapacity_L_Length) - Number(rows[0].morningShiftLost_L_Length),
            "晚班R側": Number(rows[0].nightShiftCapacity_R_Length) - Number(rows[0].nightShiftLost_R_Length),
            "晚班L側": Number(rows[0].nightShiftCapacity_L_Length) - Number(rows[0].nightShiftLost_L_Length),
            "早班總產能": (Number(rows[0].morningShiftCapacity_R_Length) - Number(rows[0].morningShiftLost_R_Length)) + (Number(rows[0].morningShiftCapacity_L_Length) - Number(rows[0].morningShiftLost_L_Length)),
            "晚班總產能": (Number(rows[0].nightShiftCapacity_R_Length) - Number(rows[0].nightShiftLost_R_Length)) + (Number(rows[0].nightShiftCapacity_L_Length) - Number(rows[0].nightShiftLost_L_Length)),
        }
            

        res.status(200).json({data});

        
      }catch(error){
        console.error("發生錯誤", error);
        throw error;
      }

      
    
})



module.exports = router;