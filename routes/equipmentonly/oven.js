require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../../modules/db_connect.js");
const dbmes = require(__dirname + "/../../modules/mysql_connect_mes.js");
const db2 = require(__dirname + "/../../modules/mysql_connect.js");
const dbms_pool = require(__dirname + "/../../modules/mssql_newconnect.js");
const ms_newsql = require("mssql");
const mysql = require("mysql2");
const multer = require("multer");
const axios = require("axios");
const { Sequelize } = require("sequelize");
const fs = require("fs");
const readline = require("readline");
const path = require("path");
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const { parseString } = require("fast-csv");
const moment = require("moment-timezone");


router.get("/updatepage", async (req, res) => {
    const { machineoption } = req.query;
    console.log("machineoption = " + machineoption);

    if (!machineoption || !machineoption.includes("真空電芯-大烘箱/極片-小烘箱")){
        return res.status(400).send("Invalid machine option");
    }

    let sql = `SELECT * FROM mes.cellbaking_realtime order by id desc LIMIT 1;`;
    let sql2 = `SELECT memberName FROM hr.hr_memberinfo where memberID = ? `;
            
    try {
        const [rows] = await db2.query(sql);
        if (!rows || rows.length === 0) {
            return res.status(404).send("No data found");
        }
        const row = rows[0];
        const memberID = String(row.OP).trim();
        const [memberName] = await db2.query(sql2,memberID);

        row.OPName = memberName.length > 0 ? memberName[0].memberName : null;

        res.status(200).json([row]);
    
    } catch (error) {
        console.error("Error in /updatepage:", error);
        res.status(500).send("Internal Server Error");
    }

});


router.get("/groupname_capacitynum", async (req, res) => {
  const { endDay } = req.query;

    
    const currentDay = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
    const startDay = currentDay + " 00:00:00"; 
    const endDayToTranslate = currentDay + " 23:59:59";

  // 當日產能查詢

  let sql = `
    SELECT 
      SUM(
        CASE 
            WHEN REMARK IS NULL AND 
            PLCCellID_CE IS NOT NULL
            THEN 1 
            ELSE 0 
        END
        ) AS first_result,
        SUM(
            CASE 
                WHEN REMARK = "二期" AND
                PLCCellID_CE IS NOT NULL
                THEN 1 
                ELSE 0 
        END
        ) AS second_result
        FROM mes.cellbaking_realtime
    WHERE Time BETWEEN ? AND ?
  `;
  
  try {
    // 計算總體產能
    const [rowsToday] = await db2.query(sql, [startDay, endDayToTranslate]);
    const [rows] = await db2.query(sql, [endDay, endDayToTranslate]);
    // 計算昨天晚上8點到今天早上8點的產能 (晚班)
    const yesterday = moment().tz("Asia/Taipei").subtract(1, "day").format("YYYY-MM-DD");
    const yesterdayEvening = `${yesterday} 20:00:00`;
    const todayMorning = `${currentDay} 08:00:00`;
    const [nightShiftRows] = await db2.query(sql, [yesterdayEvening, todayMorning]);

    // 計算今天早上8點到今天晚上8點的產能 (早班)
    const todayEvening = `${currentDay} 20:00:00`;
    const [morningShiftRows] = await db2.query(sql, [todayMorning, todayEvening]);

    
    const dataToSend = {
        todayCapacity_first_result: rowsToday[0].first_result,
        todayCapacity_second_result: rowsToday[0].second_result,
        selectedDayCapacity_first_result: rows[0].first_result,
        selectedDayCapacity_second_result: rows[0].second_result,
        nightShiftCapacity_first_result: nightShiftRows[0].first_result,
        nightShiftCapacity_second_result: nightShiftRows[0].second_result,
        morningShiftCapacity_first_result: morningShiftRows[0].first_result,
        morningShiftCapacity_second_result: morningShiftRows[0].second_result,
    }

    res.status(200).json([dataToSend]);
  } catch (error) {
    console.error("Error in /groupname_capacitynum:", error);
    res.status(500).send("Internal Server Error");
  }
});






module.exports = router;