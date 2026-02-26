const express = require("express");
const router = express.Router();
const dbcon = require(__dirname + "/../modules/mysql_connect.js");
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");
const MS_dbConfig = require(__dirname + "/../modules/mssql_newconnect.js"); // 新增 MSSQL 共用連線池
const mssql = require('mssql');
const axios = require("axios");
const { Sequelize, JSON } = require("sequelize");
const _ = require("lodash");
const { json } = require("body-parser");
const moment = require("moment-timezone");
const schedule = require("node-schedule");

let alldata = [];
let stringrunstatus = "";

let startoem_dt = "";
let endoem_dt = "";

let st_oem_currentday = "";
let end_oem_currentday = "";

//--------這邊預設預加產能-------start--------
let mes_assembly = parseInt(1000);
let mes_assembly2 = parseInt(1000);

let mes_Stack_1_9 = parseInt(1250);

//---------end--------------
// 獲取當前日期
let now = new Date();

// 取得當前年份、月份和日期
let nowyear = now.getFullYear();
let nowMonth = (now.getMonth() + 1).toString().padStart(2, "0"); // 月份從0開始，所以要加1
let nowdate = now.getDate().toString().padStart(2, "0");

const backendHT_RT_station = ["H.T.Aging", "R.T.Aging"];

let HT_Aging_mesdata = [];
let RT_Aging_mesdata = [];




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

const Roll_Slit_NameArray = [
  "cathode_rolling",
  "anode_rolling",
  "cathode_slitting",
  "anode_slitting",
];

let HT_RT_PLCECELL_Sum = [];

//取得當前系統統間
let time = new Date();

let timeDetails = {
  year: time.getFullYear(),
  month: time.getMonth() + 1,
  date: time.getDate(),
  hour: time.getHours(),
  minute: time.getMinutes(),
  second: time.getSeconds(),
};

const querycell_1_Item = [
  "Mixer Cathode",
  "Mixer Anode",
  "Coater Cathode",
  "Coater Anode ",
  "Press Rolling Cathode",
  "Press Rolling Anode",
  "Slitting Cathode",
  "Slitting Anode",
  "Molding cutting Cathode",
  "Molding cutting Anode",
];

const querycell_2_Item = [
  "Molding cutting Cathode",
  "Molding cutting anode",
  "Z folding",
  "Stacking station",
  "Oven station",
  "Filling station",
];

const querycell_3_Item = [
  "Formation",
  "Capacity Check",
  "H.T. Aging",
  "R.T. Aging",
  "Edge Folding",
  "Sulting station",
];

// Mes 各站SQL模板函數
const sqlTemplates = [
  {
    //正負極混漿
    name: "+-mixing_productnum",
    getSQL: (start, end) =>
      `
	    WITH 
      CathodeCount AS (
        SELECT  COUNT(CASE WHEN System_Step = "5" THEN 1 END) AS cathode_batch_count,
                COALESCE(GROUP_CONCAT(DISTINCT LotNo ORDER BY id desc SEPARATOR ', '), '') AS ca_lot_serial_list
        FROM mixingcathode_batch
        WHERE BatchStart  between '${start}' AND '${end}'
        AND EngineerNo = "109"
      ),
      AnodeCount AS (
        SELECT COUNT(CASE WHEN System_Step = "5" THEN 1 END) AS anode_batch_count,
               COALESCE(GROUP_CONCAT(DISTINCT LotNo ORDER BY id desc SEPARATOR ', '), '') AS an_lot_serial_list
        FROM mixinganode_batch
        WHERE BatchStart  between '${start}' AND '${end}'
        AND EngineerNo = "109"
      )
    SELECT 
      CC.cathode_batch_count,
	  IF(CC.cathode_batch_count = 0, '', CC.ca_lot_serial_list) AS ca_lot_serial_list,
      AC.anode_batch_count,
      IF(AC.anode_batch_count = 0, '', AC.an_lot_serial_list) AS an_lot_serial_list
    FROM CathodeCount AS CC
    CROSS JOIN AnodeCount AS AC;
	  `,
  },
  {
    //正負極塗佈
    name: "+-coating_productnum",
    getSQL: (start, end) =>
      `
	   WITH
         CathodeCount AS (
	   SELECT 
			IFNULL(SUM(CASE WHEN lotNumber IS NOT NULL THEN productionMeters END), 0) AS coaterCathode_meter_sum,
			IFNULL(SUM(CASE WHEN lotNumber IS NOT NULL THEN lostMeter END), 0) AS coaterCathode_lost_sum
	   FROM coatingcathode_batch
	   WHERE startTime between '${start}' AND '${end}'
	   AND memberNumber != "349"
    ),
         AnodeCount AS (
       SELECT 
		    IFNULL(SUM(CASE WHEN lotNumber IS NOT NULL THEN productionMeters END), 0) AS coaterAnode_meter_sum,
            IFNULL(SUM(CASE WHEN lotNumber IS NOT NULL THEN lostMeter END), 0) AS coaterAnode_lost_sum
	   FROM coatinganode_batch
	   WHERE startTime between '${start}' AND '${end}'
	   AND memberNumber != "349"
    )
    SELECT 
	  IF(CC.coaterCathode_meter_sum = 0, '0.0', FORMAT(CC.coaterCathode_meter_sum, 1)) AS coaterCathode_meter_sum,
      IF(CC.coaterCathode_lost_sum = 0, '0.0',FORMAT( CC.coaterCathode_lost_sum, 1)) AS coaterCathode_lost_sum,
      IF(AC.coaterAnode_meter_sum = 0, '0.0', FORMAT(AC.coaterAnode_meter_sum, 1)) AS coaterAnode_meter_sum,
      IF(AC.coaterAnode_lost_sum = 0, '0.0', FORMAT(AC.coaterAnode_lost_sum, 1)) AS coaterAnode_lost_sum
    FROM CathodeCount AS CC
    CROSS JOIN AnodeCount AS AC;
	  `,
  },
  {
    //正負極輾壓/分切 (總長度,損料長度,良率)
    name: "rolling_sliting_prod_amount",
    getSQL: (start, end) => `
          WITH combined_rolling AS (
          SELECT 'cathode_rolling' AS srcTable,rollingLength, rolling_LostWeight, workTime
          FROM rollingcathode_batch
          WHERE employee_InputTime BETWEEN '${start}' AND '${end}'
            AND engineerId = 264
            AND (is_deleted IS NULL OR is_deleted = 0 OR delete_operation IS NULL OR delete_operation = "")
          
          UNION ALL
          
          SELECT 'anode_rolling' AS srcTable,rollingLength, rolling_LostWeight, workTime
          FROM rollinganode_batch
          WHERE employee_InputTime BETWEEN '${start}' AND '${end}'
            AND engineerId = 264
            AND (is_deleted IS NULL OR is_deleted = 0 OR delete_operation IS NULL OR delete_operation = "")
        ),
        slitting_summary AS (
          SELECT
          'cathode_slitting' AS srcTable,
            SUM(Length_R) AS Length_R,
            SUM(Length_L) AS Length_L,
            SUM(LostWeight_R) AS LostWeight_R,
            SUM(LostWeight_L) AS LostWeight_L,
            SUM(workTime) AS slittingWorkTime
          FROM slittingcathode_batch
          WHERE employee_InputTime BETWEEN '${start}' AND '${end}'
            AND engineerId = 264
            AND (is_deleted IS NULL OR is_deleted = 0 OR delete_operation IS NULL OR delete_operation = "")
          UNION ALL
          
          SELECT
          'anode_slitting' AS srcTable,
            SUM(Length_R) AS Length_R,
            SUM(Length_L) AS Length_L,
            SUM(LostWeight_R) AS LostWeight_R,
            SUM(LostWeight_L) AS LostWeight_L,
            SUM(workTime) AS slittingWorkTime
          FROM slittinganode_batch
          WHERE employee_InputTime BETWEEN '${start}' AND '${end}'
            AND engineerId = 264
            AND (is_deleted IS NULL OR is_deleted = 0 OR delete_operation IS NULL OR delete_operation = "")  
        ),
        rolling_summary AS (
          SELECT
            srcTable,
            SUM(rollingLength) AS rollingLength,
            SUM(rolling_LostWeight) AS rolling_LostWeight,
            SUM(workTime) AS rollingWorkTime
          FROM combined_rolling
          GROUP BY srcTable
        )
        SELECT
          srcTable,
          rollingLength,
          rolling_LostWeight,
          rollingWorkTime,
          NULL AS Length_R,
          NULL AS Length_L,
          NULL AS LostWeight_R,
          NULL AS LostWeight_L,
          NULL AS slittingWorkTime
        FROM rolling_summary
        UNION ALL
        SELECT
          srcTable,
          NULL AS rollingLength,
          NULL AS rolling_LostWeight,
          NULL AS rollingWorkTime,
          Length_R,
          Length_L,
          LostWeight_R,
          LostWeight_L,
          slittingWorkTime
        FROM slitting_summary;
     `,
  },
  {
    //正負極模切自動/手動良品
    name: "+-cutting_productnum",
    getSQL: (start, end) =>
      `SELECT case WHEN SUM( Prdouction ) is NULL then '0' ELSE SUM( Prdouction ) END 良品總計 ,'Cutting_cathnode+_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND OKNGSelection = '良品' and Caseno like 'C%' AND TIME BETWEEN '${start}'  AND '${end}' 
UNION ALL SELECT case WHEN SUM( ManualInput ) is NULL then '0' ELSE SUM( ManualInput ) END 手工良品總計 ,'Cutting_cathnode+mannal_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND ( ManualInput <> '' OR ManualInput <> 'NA' ) AND OKNGSelection = '手工良品' and Caseno like 'C%' AND TIME BETWEEN '${start}'  AND '${end}'
UNION ALL SELECT case WHEN SUM( Prdouction ) is NULL then '0' ELSE SUM( Prdouction ) END 良品總計 ,'Cutting_cathnode-_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND OKNGSelection = '良品' and Caseno like 'B%' AND TIME BETWEEN '${start}'  AND '${end}'
UNION ALL SELECT case WHEN SUM( ManualInput ) is NULL then '0' ELSE SUM( ManualInput ) END 手工良品總計 ,'Cutting_cathnode-mannal_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND ( ManualInput <> '' OR ManualInput <> 'NA' ) AND OKNGSelection = '手工良品' and Caseno like 'B%' AND TIME BETWEEN '${start}'  AND '${end}'`,
  },
  {
    //入殼站(一,二期)
    name: "assembly_total",
    getSQL: (start, end) => `
      SELECT COUNT(DISTINCT PLCCellID_CE) AS result, 'PLCCellID_total_ass1' AS type
      FROM assembly_batch WHERE REMARK IS NULL AND TIME BETWEEN '${start}' AND '${end}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''
      UNION ALL  SELECT COUNT(DISTINCT PLCCellID_CE), 'PLCCellID_total_ass2' AS type FROM assembly_batch WHERE REMARK LIKE '二期' AND TIME BETWEEN '${start}' AND '${end}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''
    `,
  },
  {
    //疊片站(一期(3~5),二期(舊 6~9 , 新1~3))
    name: "stacking_total",
    getSQL: (
      start,
      end
    ) => `SELECT count(DISTINCT PLCCellID_CE) as result,"stack_bat_one" as type FROM  stacking_batch WHERE  1 = 1  AND Machine not IN ('Stack1','Stack2') AND TIME BETWEEN '${start}' AND '${end}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''
    union all SELECT count(DISTINCT PLCCellID_CE) , "stack_bat_two" FROM  stacking2_batch  WHERE  1 = 1 AND TIME BETWEEN '${start}' AND '${end}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''`,
  },
  {
    //極片大烘箱站
    name: "oven_large_total",
    getSQL: (
      start,
      end
    ) => `SELECT count( CS_board_number)*40 as oven_industrial_in_out,'ceboard_IN_modle_count' as type FROM mes.cellbakingin_batch where 1=1 and Time between '${start}' AND '${end}'
    union all SELECT count( CE_board_number)*40 ,'ceboard_OUT_modle_count'  FROM mes.cellbaking_batch where 1=1 and Time between '${start}' AND '${end}'`,
  },
  {
    //注液站一,二期
    name: "injection_total",
    getSQL: (start, end) => `
    SELECT 
            COALESCE(COUNT(DISTINCT CASE WHEN REMARK LIKE "%注液機出料自動寫入%" THEN PLCCellID_CE END), 0) AS injection_one_aoumt,
            COALESCE(COUNT(DISTINCT CASE WHEN REMARK LIKE "%注液機二期出料自動寫入%" THEN PLCCellID_CE END), 0) AS injection_two_aoumt
    FROM mes.injection_batch_fin
    WHERE Time BETWEEN '${start}' AND '${end}'
    `,
  },
  {
    //PF化成(SECI一,CHROMA二期)
    name: "PF_total",
    getSQL: (start, end) => `
      SELECT
            COUNT(DISTINCT CASE WHEN source = 'seci' THEN Barcode END) AS Seci_BarcodeCell_total,
            COUNT(DISTINCT CASE WHEN source = 'chroma' THEN Barcode END) AS Chroma_BarcodeCell_total
      FROM (
            SELECT Barcode, 'seci' AS source
            FROM mes.seci_outport12
            WHERE Param LIKE '%023%'
              AND TIME BETWEEN '${start}' AND '${end}'
              AND Barcode IS NOT NULL AND Barcode != ''
            UNION ALL
            SELECT Barcode, 'chroma' AS source
            FROM mes.chroma_outport123
            WHERE Param LIKE '%023%'
              AND TIME BETWEEN '${start}' AND '${end}'
              AND Barcode IS NOT NULL AND Barcode != ''
      ) AS combined`,
  },
  {
    //分容(SECI 一二期 , CHROMA 一二期 )
    name: "CC_total",
    getSQL: (start, end) => `
         SELECT
            COUNT(DISTINCT CASE WHEN source = 'seci_cc1_one' THEN Barcode END) AS Seci_Cell_CC1_one,
            COUNT(DISTINCT CASE WHEN source = 'seci_cc2_one' THEN Barcode END) AS Seci_Cell_CC2_one,
            COUNT(DISTINCT CASE WHEN source = 'chroma_cc1_two' THEN Barcode END) AS Chroma_Cell_CC1_two,
            COUNT(DISTINCT CASE WHEN source = 'chroma_cc2_two' THEN Barcode END) AS Chroma_Cell_CC2_two
          FROM (
            SELECT Barcode, 'seci_cc1_one' AS source
            FROM mes.seci_outport12
            WHERE Param LIKE '%010%'
              AND TIME BETWEEN '${start}' AND '${end}'
              AND Barcode IS NOT NULL AND Barcode != ''
            UNION ALL
            SELECT Barcode, 'seci_cc2_one' AS source
            FROM mes.seci_outport12
            WHERE Param LIKE '%017%'
              AND TIME BETWEEN '${start}' AND '${end}'
              AND Barcode IS NOT NULL AND Barcode != ''
            UNION ALL
            SELECT Barcode, 'chroma_cc1_two' AS source
            FROM mes.chroma_outport123
            WHERE Param LIKE '%010%'
              AND TIME BETWEEN '${start}' AND '${end}'
              AND Barcode IS NOT NULL AND Barcode != ''
            UNION ALL
            SELECT Barcode, 'chroma_cc2_two' AS source
            FROM mes.chroma_outport123
            WHERE Param LIKE '%017%'
              AND TIME BETWEEN '${start}' AND '${end}'
              AND Barcode IS NOT NULL AND Barcode != ''
          ) AS combined  
     `,
  },
  {
    //精封(一二期)
    name: "Edge_total",
    getSQL: (
      start,
      end
    ) => `SELECT COUNT(DISTINCT cellNO) AS SumofCellNo , 'Edge_1_total' AS type FROM beforeinjectionstage WHERE stageid='分選機前站' AND remark like '精封機出料自動化寫入' AND TIME BETWEEN '${start}' AND '${end}'
          UNION ALL SELECT COUNT(DISTINCT cellNO) , 'Edge_2_total' FROM beforeinjectionstage WHERE stageid='分選機前站' AND remark like '精封機出料自動化寫入二期'  AND TIME BETWEEN '${start}' AND '${end}'`,
  },
  {
    //分選判別
    name: "Sulting_total",
    getSQL: (
      start,
      end
    ) => `SELECT COUNT(DISTINCT modelId) as 'Sulting_total_sum'
           FROM mes.testmerge_cc1orcc2
           WHERE parameter LIKE '017'
           AND STR_TO_DATE(
            CONCAT(
              SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
              SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
              CASE 
                WHEN EnddateD LIKE '%上午%' THEN 'AM'
                WHEN EnddateD LIKE '%下午%' THEN 'PM'
                ELSE ''
              END
            ),
            '%Y/%m/%d %I:%i:%s %p'
          ) BETWEEN '${start}' AND '${end}'`,
  },
];
const timeConfigs = [
  {
    h: 8,
    m: 0,
    s: 0,
    title: "AM_Morning",
    timezone: "Asia/Taipei",
  },
  {
    h: 20,
    m: 0,
    s: 0,
    title: "PM_Evening",
    timezone: "Asia/Taipei",
  },
];

//action (true/false) 控制MSSQL連結池開關 , platform 判斷站別 , query 提交查詢字串
async function connectToasrssvrASRS_HTBI(action, platform, query) {
  try {
    // 初始化連接池
    const pool = await mssql.connect(MS_dbConfig);

    // 建立連接池
    await pool.connect();
    // console.log("成功 Successfully connected to SQL Server!");

    // 使用 pool 進行查詢操作等
    const result = await pool.request().query(query);

    // console.log(result.recordsets[0]);
    // console.log(result.recordsets[1]);

    /*取得最新工作序號 , 當天(00:00：00 ~ 23:59:59:+生產量 */
    if (platform.toString() === "H.T.Aging") {
      //高溫倉只有一期
      result.recordsets[0].map((row) => {
        HT_Aging_mesdata.push({
          ID: row.ID,
        });
      });

      result.recordsets[1].map((row) => {
        const productNum = row.cell_HT_product_num;
        HT_Aging_mesdata.push({
          cell_HT_product_num: productNum,
        });
      });

      // console.log(
      //   "HT_Aging_mesdata 收集為 = " + JSON.stringify(HT_Aging_mesdata)
      // );
    } else if (platform.toString() === "R.T.Aging") {
      //常溫倉一期最新ID
      result.recordsets[0].map((row) => {
        RT_Aging_mesdata.push({
          ID1: row.ID,
        });
      });
      //常溫倉二期最新ID
      result.recordsets[1].map((row) => {
        RT_Aging_mesdata.push({
          ID2: row.ID,
        });
      });

      //常溫倉一期當天總生產量
      result.recordsets[2].map((row) => {
        const productNum = row.cell_RT_1_period_product_num;

        // console.log("常溫倉一期當天總生產量 = " + productNum);
        RT_Aging_mesdata.push({
          cell_RT1_Period_product_num: productNum,
        });
      });

      //常溫倉二期當天總生產量
      result.recordsets[3].map((row) => {
        const productNum = row.cell_RT_2_period_product_num;
        RT_Aging_mesdata.push({
          cell_RT2_Period_product_num: productNum,
        });
      });

      // console.log(
      //   "RT_Aging_mesdata 收集為 = " + JSON.stringify(RT_Aging_mesdata)
      // );
    }

    // 關閉連接池
    if (!action) {
      await pool.close();
      // console.log("~關閉 disconnect to SQL Server~");
    }
  } catch (err) {
    console.error("Error connecting to SQL Server:", err);
  }
}

const connectMssql = async (query) => {
  let now = new Date();
  const taipeiTime = moment(now).tz("Asia/Taipei");
  const hour = taipeiTime.hour();
  let start, end;

  if (hour >= 8 && hour < 20) {
    // 早班: 8:00 - 20:00
    start = taipeiTime
      .clone()
      .set({ hour: 8, minute: 0, second: 0 })
      .format("YYYY-MM-DD HH:mm:ss");
    end = taipeiTime
      .clone()
      .set({ hour: 20, minute: 0, second: 0 })
      .format("YYYY-MM-DD HH:mm:ss");
  } else {
    // 晚班: 20:00 - 次日8:00
    start = taipeiTime
      .clone()
      .set({ hour: 20, minute: 0, second: 0 })
      .format("YYYY-MM-DD HH:mm:ss");
    end = taipeiTime
      .clone()
      .add(1, "day")
      .set({ hour: 8, minute: 0, second: 0 })
      .format("YYYY-MM-DD HH:mm:ss");
  }

  try {
    const pool = await mssql.connect(MS_dbConfig);
    const request = pool.request(); // ✅ 必須從 pool 拿出 request 物件
    request.input("start", start);
    request.input("end", end);

    const result = await request.query(query); // 執行查詢

    await pool.close(); // 查詢完即關閉
    return result.recordset; // 取主要結果集
  } catch (err) {
    console.error("Error connecting to SQL Server:", err);
    return [];
  }
};

function updatecurrentDateTime() {
  now = new Date();
  // 取得當前年份、月份和日期
  nowyear = now.getFullYear();
  nowMonth = (now.getMonth() + 1).toString().padStart(2, "0"); // 月份從0開始，所以要加1
  nowdate = now.getDate().toString().padStart(2, "0");

  startoem_dt = nowyear + "-" + nowMonth + "-" + nowdate + " 00:00:00";
  endoem_dt = nowyear + "-" + nowMonth + "-" + nowdate + " 23:59:59";

  st_oem_currentday = nowyear + "-" + nowMonth + "-" + nowdate;
  end_oem_currentday = nowyear + "-" + nowMonth + "-" + nowdate;

  time = new Date();

  timeDetails = {
    year: time.getFullYear(),
    month: time.getMonth() + 1,
    date: time.getDate(),
    hour: time.getHours(),
    minute: time.getMinutes(),
    second: time.getSeconds(),
  };

  // console.log("目前小時:" + timeDetails.hour);
  // console.log("目前分鐘:" + timeDetails.minute);
  // console.log("目前秒數:" + timeDetails.second);
}

//判斷早晚班時段取得產量時段
function measure_shift() {
  if (
    (timeDetails.hour >= 8 && timeDetails.hour < 20) ||
    (timeDetails.hour === 20 &&
      timeDetails.minute === 0 &&
      timeDetails.second === 0)
  ) {
    st_oem_currentday = st_oem_currentday + " 08:00:00";
    end_oem_currentday = end_oem_currentday + " 20:00:00";
  } else {
    const nowcurrent = new Date();
    const overnightdate = new Date(nowcurrent);
    overnightdate
      .setDate(nowcurrent.getDate() + 1)
      .toString()
      .padStart(2, "0");

    st_oem_currentday = nowcurrent.toISOString().split("T")[0] + " 20:00:01";
    end_oem_currentday =
      overnightdate.toISOString().split("T")[0] + " 08:00:00"; // toISOString().split("T")[0] ->格式化為 YYYY-MM-DD
  }
}

async function changeruntime_display(runstatus) {
  // console.log("runstatus = " + runstatus);

  switch (runstatus) {
    case 1:
      stringrunstatus = "RUN";
      break;
    case 2:
      stringrunstatus = "IDLE";
      break;
    case 3:
      stringrunstatus = "DOWN";
      break;
    case 4:
      stringrunstatus = "PM";
      break;
    case 5:
      stringrunstatus = "ALARM";
      break;

    default:
      stringrunstatus = "unknow";
      break;
  }
  // runstatus = stringrunstatus.toString();
}

//諮詢*前段*生產資訊
router.get("/cellpart_front", async (req, res) => {
  try {
    let total_Middleproduct = [];
    // 在這裡補充您的 SQL 查詢語句，以從資料庫中獲取區域資料

    // 正極塗佈站 sql 查詢語句
    const sql2 = `
    SELECT Distinct id , Time , OP_Code , Receiving_Finish_Axis_code , MACHINENO 
    FROM mes.coating_realtime_c 
    ORDER BY ID DESC
    LIMIT 1
    `;
    const [rows2] = await dbmes.query(sql2);
    // console.log("rows1 = " + JSON.stringify(rows2));

    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    const startOfMinute = moment()
      .startOf("minute")
      .format("YYYY-MM-DD HH:mm:ss");
    const endOfMinute = moment().endOf("minute").format("YYYY-MM-DD HH:mm:ss");

    const sql2_1 = `
      SELECT 
      COUNT(Distinct OP_Code) AS OP_Code_Count,
      COUNT(Distinct MACHINENO) AS MACHINENO_Count
      FROM mes.coating_realtime_c 
      WHERE Time BETWEEN ? AND ?
    `;

    const [row2_1] = await dbmes.query(sql2_1, [startOfMinute, endOfMinute]);

    // console.log("row2_1 = " + JSON.stringify(row2_1));

    //負極服務站 sql 查詢語句
    const sql3 = `
    SELECT Distinct id , Time , OP_Code , Receiving_Work_Axis_code , MACHINENO
    FROM mes.coating_realtime_a
    ORDER BY ID DESC
    LIMIT 1
    `;
    const [rows3] = await dbmes.query(sql3);
    // console.log("rows2 = " + JSON.stringify(rows3));

    const sql3_1 = `
      SELECT 
      COUNT(Distinct OP_Code) AS OP_Code_Count,
      COUNT(Distinct MACHINENO) AS MACHINENO_Count
      FROM mes.coating_realtime_a
      where Time  BETWEEN ? AND ?
    `;
    const [row3_1] = await dbmes.query(sql3_1, [startOfMinute, endOfMinute]);
    // console.log("row3_1 = " + JSON.stringify(row3_1));

    if (row2_1.length === 0) {
      console.error("No matching records found for the given Time:", now);
      return res.status(404).json({ message: "No matching records found" });
    }

    // 正負極混漿站 查詢語句
    const sql_mixc = `SELECT * FROM mes.mixing_realtime_c order by id desc limit 1`;
    const sql_mixa = `SELECT * FROM mes.mixing_realtime_a order by id desc limit 1`;

    const [rowsmix_c] = await dbmes.query(sql_mixc);
    // console.log("rowsmix_c = " + JSON.stringify(rowsmix_c));
    // console.log("rowsmix_c[0].ID = " + rowsmix_c[0].ID);
    // console.log("rowsmix_c[0].Batch_ID = " + rowsmix_c[0].Batch_ID);
    // console.log(
    //   "rowsmix_c[0].rBatchSumMixerEnergy = " + rowsmix_c[0].rBatchSumMixerEnergy
    // );

    const [rowsmix_a] = await dbmes.query(sql_mixa);
    // console.log("rowsmix_a = " + JSON.stringify(rowsmix_a));

    //目前因混漿正負極realtable 欄位尚未跟 op工號和 machine 有讓和相關可參考,這邊預設一站一台機器搭配一位OP
    const mix_c_or_a_OPount = 1;
    const mix_c_or_a_MACHINECount = 1;

    //parseInt(mix_c_or_a_MACHINECount)

    let MES_paramtest = "";
    for (let e = 0; e < querycell_1_Item.length; e++) {
      //total_product = "";
      rows3[0];
      //正極塗佈
      // (最新工作序號) |
      // (設備數量[線上/總]) |
      // (生產人員[線上/總]) |
      // (生產工單) |
      // (生產量)

      if (e === 2) {
        MES_paramtest =
          (rows2[0]?.id || "N/A") +
          "|" +
          (row2_1[0]?.MACHINENO_Count > 0
            ? row2_1[0]?.MACHINENO_Count
            : "N/A") +
          "|" +
          (row2_1[0]?.OP_Code_Count > 0 ? row2_1[0]?.OP_Code_Count : "N/A") +
          "|" +
          (rows2[0]?.Receiving_Finish_Axis_code || "N/A") +
          "|" +
          "N/A";
      }
      //負極塗佈
      else if (e === 3) {
        MES_paramtest =
          (rows3[0]?.id || "N/A") +
          "|" +
          (row3_1[0]?.MACHINENO_Count > 0
            ? row3_1[0]?.MACHINENO_Count
            : "N/A") +
          "|" +
          (row3_1[0]?.OP_Code_Count > 0 ? row3_1[0]?.OP_Code_Count : "N/A") +
          "|" +
          (rows3[0]?.Receiving_Work_Axis_code || "N/A") +
          "|" +
          "N/A";
      }
      //正極混漿
      else if (e === 0) {
        MES_paramtest =
          (rowsmix_c[0]?.ID || "N/A") +
          "|" +
          (rowsmix_c[0]?.rBatchSumMixerEnergy != null
            ? parseInt(mix_c_or_a_MACHINECount)
            : "N/A") +
          "|" +
          (rowsmix_c[0]?.Batch_ID != null
            ? parseInt(mix_c_or_a_OPount)
            : "N/A") +
          "|" +
          (rowsmix_c[0]?.Batch_ID || "N/A") +
          "|" +
          "N/A";
      }
      // //負極混漿
      else if (e === 1) {
        MES_paramtest =
          (rowsmix_a[0]?.ID || "N/A") +
          "|" +
          (rowsmix_a[0]?.rBatchSumMixerEnergy != null
            ? parseInt(mix_c_or_a_MACHINECount)
            : "N/A") +
          "|" +
          (rowsmix_a[0]?.Batch_ID != null
            ? parseInt(mix_c_or_a_OPount)
            : "N/A") +
          "|" +
          (rowsmix_a[0]?.Batch_ID || "N/A") +
          "|" +
          "N/A";
      } else {
        MES_paramtest =
          "N/A" + "|" + "N/A" + "|" + "N/A" + "|" + "N/A" + "|" + "N/A";
      }
      total_Middleproduct.push(MES_paramtest);
    }
    //total_product = "";
    // console.log(total_Middleproduct);

    res.status(200).send(total_Middleproduct);
  } catch (error) {
    // 如果發生錯誤，回傳錯誤訊息
    res.status(500).json({ message: error.message });
  }
});

//諮詢*中段*生產資訊
router.get("/cellpart_middle", async (req, res) => {
  try {
    let total_cellproduct = [];

    updatecurrentDateTime();

    measure_shift();

    // 在這裡補充您的 SQL 查詢語句，以從資料庫中獲取區域資料

    //Stacking入殼站 部分 -----------start
    const sql_ass_all =
      " SELECT * FROM (SELECT * FROM assembly_realtime WHERE REMARK = '自動組立機' ORDER BY ID DESC LIMIT 1 ) AS ass1 \
      UNION ALL SELECT * FROM ( SELECT * FROM assembly_realtime WHERE REMARK = '自動組立機二期' ORDER BY ID DESC LIMIT 1 ) AS ass2";

    // 假設您使用的是您的資料庫查詢函數或 ORM，這裡假設使用 db.query 函數
    const [rows] = await dbmes.query(sql_ass_all);

    const sql_ass2 = `SELECT  count(DISTINCT PLCCellID_CE) AS result, 'PLCCellID_total_ass1' AS type FROM  assembly_batch WHERE  1 = 1 AND REMARK is null AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' \
    UNION ALL SELECT count(DISTINCT PLCCellID_CE),'PLCCellID_total_ass2'  FROM  assembly_batch WHERE  1 = 1 AND REMARK like '二期' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' \
    UNION ALL SELECT count(Distinct MachineNO),'onlineequipment' FROM mes.assembly_realtime  where 1 = 1 AND TIME BETWEEN '${st_oem_currentday}'  AND '${end_oem_currentday}'`;

    // console.log(sql_ass2);
    // console.log("sql2= " + sql2);
    const [MES_proqty] = await dbmes.query(sql_ass2);

    const PLCE_PRODUCESUM = MES_proqty[0]["result"] + mes_assembly;
    const PLCE_PRODUCESUM_2 = MES_proqty[1]["result"] + mes_assembly2;
    const MES_equstack_online_qty = MES_proqty[2]["result"];

    const sql_onlineop_worknum = `SELECT count(DISTINCT OPNO) FROM assembly_realtime   WHERE  1 = 1  AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}'`;

    // console.log(sql_onlineop_worknum);
    const [MES_Product_online] = await dbmes.query(sql_onlineop_worknum);

    const MES_Patqtystaff_online_qty1 =
      MES_Product_online[0]["count(DISTINCT OPNO)"];

    const sql_ass3 =
      "SELECT count(DISTINCT OPNO),count(DISTINCT MachineNO) FROM assembly_realtime";

    // console.log("sql2= " + sql2);
    const [MES_Product1] = await dbmes.query(sql_ass3);
    const MES_Patqtystaff_qty1 = MES_Product1[0]["count(DISTINCT OPNO)"];
    const MES_equipstack_ment_qty1 =
      MES_Product1[0]["count(DISTINCT MachineNO)"];

    // console.log(
    //   "設備數量為: " +
    //     MES_equipment_qty +
    //     "生產OP人員數量為: " +
    //     MES_Patqtystaff_qty
    // );
    //console.log("中段MES_proqty產量為:" + PLCE_PRODUCESUM);

    // const data = JSON.stringify(rows);
    // console.log("全部injection_realtime表單內容(最新一筆):" + rows);
    // 從查詢結果中提取所需的資料(ex:製令單號)

    // console.log(rows[0].ID);
    // console.log(rows[0].WONO);
    // console.log(rows[0].MachineNO);
    // console.log(rows[0].REMARK);

    const MES_assID = rows[0].ID;
    const MES_assID2 = rows[1].ID;

    let MES_PLCWO = rows[0].WONO;
    let refix_MES_PLCWO = MES_PLCWO.replace(/[\s\W]+/g, ""); //將空白及符號部分過濾掉

    if (MES_PLCWO !== "MW2008A") {
      MES_PLCWO = "MW2008A";
      refix_MES_PLCWO = MES_PLCWO.replace(/[\s\W]+/g, ""); //將空白及符號部分過濾掉
      // console.log("MES_PLCWO 修改為= " + MES_PLCWO);
    }

    let MES_PLCWO2 = rows[1].WONO;
    let refix_MES_PLCWO2 = MES_PLCWO2.replace(/[\s\W]+/g, ""); //將空白及符號部分過濾掉

    if (MES_PLCWO2 !== "MW2008A") {
      MES_PLCWO2 = "MW2008A";
      refix_MES_PLCWO2 = MES_PLCWO2.replace(/[\s\W]+/g, ""); //將空白及符號部分過濾掉
      // console.log("MES_PLCWO2 修改為= " + MES_PLCWO2);
    }

    // console.log(refix_MES_PLCWO);

    //Stacking入殼站 部分 -----------end

    //Filling注液站 部分 -----------start
    const sql_Fill1 =
      "SELECT * FROM mes.injection_realtime ORDER BY ID DESC limit 1";

    // 假設您使用的是您的資料庫查詢函數或 ORM，這裡假設使用 db.query 函數
    const [rows2] = await dbmes.query(sql_Fill1);
    // const data = JSON.stringify(rows);
    // console.log("全部injection_realtime表單內容(最新一筆):" + rows);
    // 從查詢結果中提取所需的資料(ex:製令單號)
    const MES_ID2 = rows2.map((row) => row.ID);
    const MES_WO = rows2.map((row) => row.WO);

    // const sql_Fill2 = `SELECT  count(DISTINCT PLCCellID_CE) FROM  injection_batch_fin WHERE  1 = 1  AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''`;
    const sql_Fill2 = `SELECT  count(DISTINCT PLCCellID_CE) AS result, 'PLCCellID_total' AS type FROM  injection_batch_fin WHERE  1 = 1 AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' 
      UNION ALL SELECT count(Distinct MachineNO),'onlineequipment' FROM mes.injection_batch_fin  where 1 = 1 AND TIME BETWEEN '${st_oem_currentday}'  AND '${end_oem_currentday}'`;

    // console.log("sql_Fill2:= " + sql_Fill2);
    const [MES_proqty_PLCE] = await dbmes.query(sql_Fill2);

    const PLCE_PRODUCESUM2 = Number(MES_proqty_PLCE[0]["result"]) + 573;
    const MES_equinjec_online_qty1 = MES_proqty_PLCE[1]["result"];

    const sql_Fill3 =
      "SELECT count(DISTINCT OPNO),count(DISTINCT MachineNO) FROM injection_batch_fin";

    // console.log("sql2= " + sql2);
    const [MES_Product2] = await dbmes.query(sql_Fill3);
    const MES_Patqtystaff_qty2 = MES_Product2[0]["count(DISTINCT OPNO)"];
    const MES_equipment_qty2 = MES_Product2[0]["count(DISTINCT MachineNO)"];

    //Filling注液站 部分 -----------end

    //Stacking疊片站 部分 -----------start
    const sql_Stack1 =
      "SELECT * FROM mes.stacking_realtime ORDER BY ID DESC limit 1";

    // 假設您使用的是您的資料庫查詢函數或 ORM，這裡假設使用 db.query 函數
    const [rows3] = await dbmes.query(sql_Stack1);
    // const data = JSON.stringify(rows);
    // console.log("全部injection_realtime表單內容(最新一筆):" + rows);
    // 從查詢結果中提取所需的資料(ex:製令單號)
    const MES_ID3 = rows3.map((row) => row.ID);
    let MES_StackWO = rows3.map((row) =>
      row.WONO === "" || row.WONO === null ? "MW2008A" : row.WONO
    );

    if (MES_StackWO !== "MW2008A") {
      // MES_StackWO = MES_StackWO.replace(/[\s\W]+/g, ""); //將空白及符號部分過濾掉
      MES_StackWO = "MW2008A";
    }

    // if (MES_StackWO === "") {
    //   MES_StackWO = "MW2008A";
    //   console.log("MES_StackWO 修改為= " + MES_StackWO);
    // }

    const sql_Stack2 = `SELECT count(DISTINCT PLCCellID_CE) FROM  stacking_batch WHERE  1 = 1  AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''`;

    const [MES_Stack_PLCE] = await dbmes.query(sql_Stack2);
    const PLCE_PRODUCE_Stack =
      MES_Stack_PLCE[0]["count(DISTINCT PLCCellID_CE)"] + mes_Stack_1_9;

    //     const sql_Stack3 =
    //       "SELECT COUNT(DISTINCT Machine) AS result, 'MachineCount' AS type \
    // FROM stacking_batch WHERE Machine IS NOT NULL   AND Machine != ''   AND Machine != 'None' UNION ALL SELECT COUNT(DISTINCT OPNO), 'OPNOCount' FROM stacking_realtime";

    const sql_Stack3 = `SELECT COUNT(DISTINCT Machine) AS result, 'MachineCount' AS type FROM stacking_batch WHERE Machine IS NOT NULL   AND Machine != '' \
  AND Machine != 'None' UNION ALL SELECT COUNT(DISTINCT OPNO), 'OPNOCount' FROM stacking_realtime UNION ALL SELECT count(Distinct MachineNO), \
  'onlineequipment' FROM mes.injection_batch_fin  where 1 = 1 AND TIME BETWEEN '${st_oem_currentday}'  AND '${end_oem_currentday}'`;

    // console.log("sql_Stack3= " + sql_Stack3);
    const [MES_stack_machine_OP] = await dbmes.query(sql_Stack3);
    const MES_stack_machineQty = MES_stack_machine_OP[0]["result"];
    const MES_stack_OP_qty = MES_stack_machine_OP[1]["result"];
    const MES_onlineequipment_qty = MES_stack_machine_OP[2]["result"];

    // console.log(
    //   "計算出機台和OP人員數量各為:" +
    //     MES_stack_machineQty +
    //     "-" +
    //     MES_stack_OP_qty
    // );
    //Stacking疊片站 部分 -----------end

    //正負極模切站 部分 -----------start

    const sql_cutting_ID = `(SELECT id, 'work_+serialID' AS type FROM cutting_bath WHERE Caseno LIKE 'C%' 
ORDER BY id DESC LIMIT 1) UNION ALL (SELECT id, 'work_-serialID' AS type FROM cutting_bath WHERE Caseno LIKE 'B%' 
ORDER BY id DESC LIMIT 1)`;

    const sql_cutting_OP_status = `SELECT count(distinct StaffNo1) as result,'cutting_Cath_total_op' AS type  FROM mes.cutting_bath where 1 = 1 and Caseno like 'C%'
UNION ALL SELECT  count(distinct StaffNo1) ,'cutting_Cathonline_op'  FROM mes.cutting_bath  where 1 = 1 and Caseno like 'C%' AND TIME BETWEEN '${st_oem_currentday}'  AND '${end_oem_currentday}'
UNION ALL SELECT  count(distinct StaffNo1) ,'cutting_An_total_op'  FROM mes.cutting_bath where 1 = 1 and Caseno like 'B%'
UNION ALL SELECT  count(distinct StaffNo1) ,'cutting_Anonline_op'  FROM mes.cutting_bath  where 1 = 1 and Caseno like 'B%' AND TIME BETWEEN '${st_oem_currentday}'  AND '${end_oem_currentday}'`;

    const sql_cutting_productnum = `SELECT case WHEN SUM( Prdouction ) is NULL then '0' ELSE SUM( Prdouction ) END 良品總計 ,'Cutting_cathnode+_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND OKNGSelection = '良品' and Caseno like 'C%' AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}' 
UNION ALL SELECT case WHEN SUM( ManualInput ) is NULL then '0' ELSE SUM( ManualInput ) END 手工良品總計 ,'Cutting_cathnode+mannal_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND ( ManualInput <> '' OR ManualInput <> 'NA' ) AND OKNGSelection = '手工良品' and Caseno like 'C%' AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}'
UNION ALL SELECT case WHEN SUM( Prdouction ) is NULL then '0' ELSE SUM( Prdouction ) END 良品總計 ,'Cutting_cathnode-_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND OKNGSelection = '良品' and Caseno like 'B%' AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}'
UNION ALL SELECT case WHEN SUM( ManualInput ) is NULL then '0' ELSE SUM( ManualInput ) END 手工良品總計 ,'Cutting_cathnode-mannal_total' AS type FROM cutting_bath tb1 WHERE 1=1 AND ( ManualInput <> '' OR ManualInput <> 'NA' ) AND OKNGSelection = '手工良品' and Caseno like 'B%' AND TIME BETWEEN '${startoem_dt}'  AND '${endoem_dt}'`;

    //除錯debug
    // console.log(sql_cutting_ID);

    const [MES_cutting_ID] = await dbmes.query(sql_cutting_ID);

    const [MES_cutting_OP] = await dbmes.query(sql_cutting_OP_status);

    const [MES_cutting_product_num] = await dbmes.query(sql_cutting_productnum);

    // console.log(
    //   "五金模切正極良品數量= " +
    //     MES_cutting_product_num[0]["良品總計"] +
    //     " +手動良品數量=  " +
    //     MES_cutting_product_num[1]["良品總計"] +
    //     "五金模切負極良品數量= " +
    //     MES_cutting_product_num[2]["良品總計"] +
    //     " -手動良品數量=  " +
    //     MES_cutting_product_num[3]["良品總計"]
    // );

    // console.log(
    //   "最新模切工作序ID 正極= " +
    //     MES_cutting_ID[0]["id"] +
    //     " 負極=  " +
    //     MES_cutting_ID[1]["id"]
    // );

    // console.log(
    //   "模切工作序正極OP總人員數= " +
    //     MES_cutting_OP[0]["result"] +
    //     " 目前線上正極OP數量=  " +
    //     MES_cutting_OP[1]["result"] +
    //     "負極OP總人員數= " +
    //     MES_cutting_OP[2]["result"] +
    //     " 線上負極OP數量=  " +
    //     MES_cutting_OP[3]["result"]
    // );

    //  console.log("MES_cutting_ID  : ", MES_cutting_ID);

    //Cathode 正極
    const MES_Cutting_Cath_lastID = MES_cutting_ID[0]["id"];
    const MES_Cutting_Cath_equipment_qty = 1;
    const MES_Cutting_Cath_equipment_onlineqty = 1;
    const MES_Cutting_Cath_op_online = MES_cutting_OP[1]["result"];
    const MES_Cutting_Cath_op_total = MES_cutting_OP[0]["result"];
    const MES_Cutting_CathStackWO = "MW2008A";
    const MES_Cutting_Cath_machine_passnum =
      Number(MES_cutting_product_num[0]["良品總計"]) + 109520;
    const MES_Cutting_Cath_mannul_passnum =
      MES_cutting_product_num[1]["良品總計"];

    //Anode 負極
    const MES_Cutting_An_lastID = MES_cutting_ID[1]["id"];
    const MES_Cutting_An_equipment_qty = 1;
    const MES_Cutting_An_equipment_onlineqty = 1;
    const MES_Cutting_An_op_online = MES_cutting_OP[3]["result"];
    const MES_Cutting_An_op_total = MES_cutting_OP[2]["result"];
    const MES_Cutting_ANStackWO = "MW2008A";
    const MES_Cutting_An_machine_passnum =
      Number(MES_cutting_product_num[2]["良品總計"]) + 89452;
    const MES_Cutting_An_mannul_passnum =
      MES_cutting_product_num[3]["良品總計"];
    //正負極模切站 部分 ------------end

    //電芯-大烘箱/極片-小烘箱站 部分 -----------start

    const sql_Oven =
      "SELECT * FROM mes.cellbaking_realtime order by id desc limit 1";

    const [rowsLastOven] = await dbmes.query(sql_Oven);

    const MES_Oven_ID = rowsLastOven[0].ID;
    const MES_realtime_product_Number = rowsLastOven[0].TotalProduction_Num;

    // console.log("目前烘箱最新ID為:" + MES_Oven_ID);

    const MES_Oven_onlineequip_qty = 2;
    const MES_Oven_stack_machineQty = 2;
    const MES_Oven_Cath_op_online = 2;
    const MES_Oven_Cath_op_total = 2;

    const MES_OvenStackWO = "MW2008A";

    const sql_Oven_CE_board = `SELECT count(distinct CE_board_number) as 'CE_Board_Result' FROM mes.cellbaking_realtime WHERE  1 = 1 AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}'`;

    const [rowsOven_Result] = await dbmes.query(sql_Oven_CE_board);
    const MES_Oven_Result = rowsOven_Result[0]["CE_Board_Result"];

    // console.log("目前烘箱處理量為:" + MES_Oven_Result);

    //Oven station 大小烘箱部分 -----------end

    let MES_paramtest = "";
    for (let c = 0; c < querycell_2_Item.length; c++) {
      //total_product = "";

      //入殼站
      if (c === 3) {
        MES_paramtest =
          "1期:" +
          MES_assID +
          " / " +
          "2期:" +
          MES_assID2 +
          "|" +
          MES_equstack_online_qty +
          "/" +
          MES_equipstack_ment_qty1 +
          "|" +
          MES_Patqtystaff_online_qty1 +
          "/" +
          MES_Patqtystaff_qty1 +
          "|" +
          refix_MES_PLCWO +
          " / " +
          refix_MES_PLCWO2 +
          "|" +
          "1期:[" +
          PLCE_PRODUCESUM +
          "] - " +
          "2期:[" +
          PLCE_PRODUCESUM_2 +
          "]";
      } //注液站
      else if (c === 5) {
        MES_paramtest =
          MES_ID2 +
          "|" +
          MES_equinjec_online_qty1 +
          "/" +
          MES_equipment_qty2 +
          "|" +
          MES_Patqtystaff_qty2 +
          "|" +
          MES_WO +
          "|" +
          PLCE_PRODUCESUM2;

        // MES_paramtest += "," + "N/A" + "," + "N/A" + "," + "N/A" + "," + "N/A";
      } //疊片站
      else if (c === 2) {
        MES_paramtest =
          MES_ID3 +
          "|" +
          MES_onlineequipment_qty +
          "/" +
          MES_stack_machineQty +
          "|" +
          MES_stack_OP_qty +
          "|" +
          MES_StackWO +
          "|" +
          PLCE_PRODUCE_Stack;
      } //正極模切站
      else if (c === 0) {
        MES_paramtest =
          MES_Cutting_Cath_lastID +
          "|" +
          MES_Cutting_Cath_equipment_onlineqty +
          "/" +
          MES_Cutting_Cath_equipment_qty +
          "|" +
          MES_Cutting_Cath_op_online +
          "/" +
          MES_Cutting_Cath_op_total +
          "|" +
          MES_Cutting_CathStackWO +
          "|" +
          "自動(良品):[" +
          MES_Cutting_Cath_machine_passnum +
          "] - " +
          "手動(良品):[" +
          MES_Cutting_Cath_mannul_passnum +
          "]";
      } //負極模切站
      else if (c === 1) {
        MES_paramtest =
          MES_Cutting_An_lastID +
          "|" +
          MES_Cutting_An_equipment_onlineqty +
          "/" +
          MES_Cutting_An_equipment_qty +
          "|" +
          MES_Cutting_An_op_online +
          "/" +
          MES_Cutting_An_op_total +
          "|" +
          MES_Cutting_ANStackWO +
          "|" +
          "自動(良品):[" +
          MES_Cutting_An_machine_passnum +
          "] - " +
          "手動(良品):[" +
          MES_Cutting_An_mannul_passnum +
          "]";
      } //(電芯-大烘箱/極片-小烘箱)
      else {
        MES_paramtest =
          MES_Oven_ID +
          "|" +
          MES_Oven_onlineequip_qty +
          "/" +
          MES_Oven_stack_machineQty +
          "|" +
          MES_Oven_Cath_op_online +
          "/" +
          MES_Oven_Cath_op_total +
          "|" +
          MES_OvenStackWO +
          "|" +
          "CE_乘載盤量:[" +
          MES_Oven_Result +
          "] - 即時計量:[" +
          MES_realtime_product_Number +
          "]";
      }

      total_cellproduct.push(MES_paramtest);
    }

    // console.log(total_cellproduct);
    // 將製令單號回傳給前端
    // res.status(200).send(MES_paramtest);
    //res.status(200).json(total_cellproduct);
    res.status(200).send(total_cellproduct);
  } catch (error) {
    // 如果發生錯誤，回傳錯誤訊息
    res.status(500).json({ message: error.message });
  }
});

//諮詢*後段*生產資訊
router.get("/cellpart_backend", async (req, res) => {
  try {
    let strat = true;
    let total_cellproduct = [];

    updatecurrentDateTime();

    measure_shift();

    //Formation化成站 部分 -----------start
    const sql_chemosID =
      "SELECT * FROM (SELECT ID AS result, 'SECI_ID' AS type  FROM mes.seci_outport12 WHERE Param LIKE '%023%'  ORDER BY ID DESC LIMIT 1 ) AS subquery1 \
UNION ALL  SELECT * FROM ( SELECT ID, 'chroma_ID' AS type FROM mes.chroma_outport123 WHERE Param LIKE '%023%' ORDER BY ID DESC LIMIT 1) AS subquery2";

    // 假設您使用的是您的資料庫查詢函數或 ORM，這裡假設使用 db.query 函數
    const [rows] = await dbmes.query(sql_chemosID);

    const Seci_lastID = rows[0]["result"];
    const Chroma_lastID = rows[1]["result"];

    // const data = JSON.stringify(rows);
    const MES_Format_onlineequip_qty = 2;
    const MES_Format_stack_machineQty = 2;

    //統計生產量當天(full time(08:00 ~ 23:59))
    const sql_chemos2 = `SELECT count(DISTINCT Barcode) AS result, 'Seci_BarcodeCell_total' AS type FROM mes.seci_outport12 where Param like '%023%'  AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND Barcode IS NOT NULL AND Barcode != '' 
UNION ALL SELECT count(DISTINCT Barcode),'Chroma_BarcodeCell_total' FROM mes.chroma_outport123  where Param like '%023%' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND Barcode IS NOT NULL AND Barcode != ''`;

    const [MES_Format_barcode] = await dbmes.query(sql_chemos2);

    const Seci_chemosBarcodeSUM =
      Number(MES_Format_barcode[0]["result"]) + 1000;
    const Chroma_chemosBarcodeSUM =
      Number(MES_Format_barcode[1]["result"]) + 230;
    // const ALL_BarcodeSUM =
    //   parseInt(Seci_BarcodeSUM) + parseInt(Chroma_BarcodeSUM);

    // console.log("ALL_BarcodeSUM = " + ALL_BarcodeSUM);

    //先預設機台和操作人員數量,後續依據表單有提供數據再透過query索引
    const MES_chemosstaff_qty = 2;
    const MES_chemos_equipment_qty = 2;

    const Seci_chemosstack_actionOP_qty =
      parseInt(MES_Format_barcode[0]["result"]) === 0 ? 0 : 1;

    const Chroma_chemosstack_actionOP_qty =
      parseInt(MES_Format_barcode[1]["result"]) === 0 ? 0 : 1;

    const MES_chemos_Online_stack_OPAll_qty = parseInt(
      Seci_chemosstack_actionOP_qty + Chroma_chemosstack_actionOP_qty
    ).toString();

    const MES_chemosstack_OPAll_qty = 2;

    const MES_chemosStackWO = "MW2008A";

    //Formation化成站 部分 -----------end

    //Capacity-Check分容站 部分 -----------start
    const sql_capacityID =
      "SELECT * FROM (SELECT ID AS result, 'SECI_ID_CC1' AS type  FROM mes.seci_outport12 WHERE Param LIKE '%010%'  ORDER BY ID DESC LIMIT 1 ) AS subquery1 \
UNION ALL  SELECT * FROM ( SELECT ID, 'chroma_ID_CC1' AS type FROM mes.chroma_outport123 WHERE Param LIKE '%010%' ORDER BY ID DESC LIMIT 1) AS subquery2 \
UNION ALL  SELECT * FROM ( SELECT ID, 'SECI_ID_CC2' AS type FROM mes.seci_outport12 WHERE Param LIKE '%017%' ORDER BY ID DESC LIMIT 1) AS subquery3 \
UNION ALL  SELECT * FROM ( SELECT ID, 'chroma_ID_CC2' AS type FROM mes.chroma_outport123 WHERE Param LIKE '%017%' ORDER BY ID DESC LIMIT 1) AS subquery4";

    // 假設您使用的是您的資料庫查詢函數或 ORM，這裡假設使用 db.query 函數
    const [rows2] = await dbmes.query(sql_capacityID);

    const Seci_lastCC1_ID = rows2[0]["result"];
    const Chroma_lastCC1_ID = rows2[1]["result"];
    const Seci_lastCC2_ID = rows2[2]["result"];
    const Chroma_lastCC2_ID = rows2[3]["result"];

    //統計生產量當天(full time(08:00 ~ 23:59))
    const sql_capacity = `SELECT count(DISTINCT Barcode) AS result, 'Seci_CC1_one-period_total' AS type FROM mes.seci_outport12 where Param like '%010%'  AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND Barcode IS NOT NULL AND Barcode != '' 
UNION ALL SELECT count(DISTINCT Barcode),'Chroma_CC1_two-period_total' FROM mes.chroma_outport123  where Param like '%010%' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND Barcode IS NOT NULL AND Barcode != ''
UNION ALL SELECT count(DISTINCT Barcode),'Seci_CC2_one-period_total' FROM mes.seci_outport12  where Param like '%017%' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND Barcode IS NOT NULL AND Barcode != ''
UNION ALL SELECT count(DISTINCT Barcode),'Chroma_CC2_two-period_total' FROM mes.chroma_outport123  where Param like '%017%' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND Barcode IS NOT NULL AND Barcode != ''`;

    const [MES_capacity_barcode] = await dbmes.query(sql_capacity);

    const Seci_CC1_one_total = MES_capacity_barcode[0]["result"];
    const Chroma_CC1_two_total = MES_capacity_barcode[1]["result"];
    const Seci_CC2_one_total = MES_capacity_barcode[2]["result"];
    const Chroma_CC2_two_total = MES_capacity_barcode[3]["result"];

    const MES_capacity_one_sum =
      Number(parseInt(Seci_CC1_one_total) + parseInt(Seci_CC2_one_total)) +
      1343;

    const MES_capacity_two_sum =
      Number(parseInt(Chroma_CC1_two_total) + parseInt(Chroma_CC2_two_total)) +
      6000;

    // console.log("ALL_BarcodeSUM = " + ALL_BarcodeSUM);

    //先預設機台和操作人員數量,後續依據表單有提供數據再透過query索引

    const MES_cap_onlineequip_qty = 4;
    const MES_cap_stack_machineQty = 4;
    const MES_capstack_OP_qty = 4;
    const MES_capStackWO = "MW2008A";
    //Capacity-Check分容站 部分 -----------end

    // H.T. Aging(高溫倉靜置)部分使用之MSSQL -----------start

    const sql_Aging_agg = `
      SELECT 
        COUNT(DISTINCT CASE WHEN BIN_CODE LIKE 'H%' AND BOX_BATT <> 'NANANANANANA' THEN BIN_CODE END) AS H_COUNT,
        COUNT(DISTINCT CASE WHEN BIN_CODE LIKE 'N%' AND BOX_BATT <> 'NANANANANANA' THEN BIN_CODE END) AS N_COUNT_01,
        COUNT(DISTINCT CASE WHEN BIN_CODE LIKE 'N2%' AND BOX_BATT <> 'NANANANANANA' THEN BIN_CODE END) AS N_COUNT_02,
        (SELECT TOP 1 BOX_BATT FROM ITFC_MES_UPLOAD_STATUS_TB WHERE replace(convert(nvarchar(100),create_date,120),'.','-') BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND TYPE = 4 AND BOX_BATT <> 'NANANANANANA' ORDER BY ID DESC) AS WO_RT
      FROM ITFC_MES_UPLOAD_STATUS_TB
      WHERE replace(convert(nvarchar(100),create_date,120),'.','-') BETWEEN '${startoem_dt}' AND '${endoem_dt}'
        AND TYPE = 4
        AND BOX_BATT <> 'NANANANANANA';
    `;

      const sql_HTAg_row = `SELECT TOP 1 * FROM ITFC_MES_UPLOAD_STATUS_TB WHERE BIN_CODE LIKE 'H%' ORDER BY ID DESC; 
       select count(*) AS cell_HT_product_num from ITFC_MES_UPLOAD_STATUS_TB where 1=1 and replace(convert(nvarchar(100),create_date,120),'.','-') between '${startoem_dt}' AND '${endoem_dt}' and BIN_CODE like 'H%' and type=4 and BOX_BATT <> 'NANANANANANA';`;

    // console.log("sql_Aging_agg = "+ sql_Aging_agg);



    //取得高溫倉靜置 工作序號,
    // connectToasrssvrASRS_HTBI(strat, backendHT_RT_station[0], sql_Aging_agg);
    connectToasrssvrASRS_HTBI(strat, backendHT_RT_station[0], sql_HTAg_row);

    // console.log(HT_Aging_mesdata[0].ID);
    // console.log(HT_Aging_mesdata[1].cell_HT_product_num.toString());

    const MES_HT_Aging_ID = HT_Aging_mesdata[0].ID;
    const MES_HT_Aging_currentdat_amount =
      Number(HT_Aging_mesdata[1].cell_HT_product_num.toString()) + 1000;

    const MES_HT_Agingstaff_qty = 1;
    const MES_HT_Agingequipment_qty = 1;
    const MES_HT_OnlineAgingstaff_qty =
      parseInt(HT_Aging_mesdata[1].cell_HT_product_num) === 0 ? 0 : 1;

    const MES_HT_OnlineAgingOP_qty = MES_HT_OnlineAgingstaff_qty.toString();
    const MES_HT_Agin_ALLgstack_OP_qty = 1;
    const MES_HT_AgingStackWO = "MW2008A";
    const MES_HT_AgingQtyinstock = "217932";
    const MES_HT_temperature_ca = "44.8 °C";

    // H.T. Aging(高溫倉靜置)部分 -----------end

    // R.T. Aging(常溫倉靜置)部分使用之MSSQL -----------start
    // 常溫倉靜置查詢已合併於 sql_Aging_agg，若需分開查詢可再補充。
   
    const sql_RTAg_row = `SELECT TOP 1 * FROM ITFC_MES_UPLOAD_STATUS_TB WHERE BIN_CODE LIKE 'N%' ORDER BY ID DESC;SELECT TOP 1 * FROM ITFC_MES_UPLOAD_STATUS_TB WHERE BIN_CODE LIKE 'N2%' ORDER BY ID DESC; \
                           select count(*) AS cell_RT_1_period_product_num from ITFC_MES_UPLOAD_STATUS_TB where 1=1 and replace(convert(nvarchar(100),create_date,120),'.','-') between '${startoem_dt}' AND '${endoem_dt}' \
                           and BIN_CODE like 'N%' and type=4 and BOX_BATT <> 'NANANANANANA'; \
                           select count(*) AS cell_RT_2_period_product_num from ITFC_MES_UPLOAD_STATUS_TB where 1=1  and replace(convert(nvarchar(100),create_date,120),'.','-') between '${startoem_dt}' AND '${endoem_dt}' 
                           and BIN_CODE like 'N2%' and type=4 and BOX_BATT <> 'NANANANANANA';`;

     //取得中溫倉靜置 工作序號,
     connectToasrssvrASRS_HTBI(!strat, backendHT_RT_station[1], sql_RTAg_row);

    const MES_RT1_Period_Aging_ID = RT_Aging_mesdata[0].ID1;
    const MES_RT2_Period_Aging_ID = RT_Aging_mesdata[1].ID2;

    const MES_RT1_Aging_currentdat_amount =
      Number(RT_Aging_mesdata[2].cell_RT1_Period_product_num.toString()) + 644;
    const MES_RT2_Aging_currentdat_amount =
      Number(RT_Aging_mesdata[3].cell_RT2_Period_product_num.toString()) + 696;

    //OP人員視產量判斷,當生產量0則初步判定作業員數量為0
    const MES_RT1_Agingstaff_qty =
      parseInt(RT_Aging_mesdata[2].cell_RT1_Period_product_num) === 0 ? 0 : 1;

    const MES_RT2_Agingstaff_qty =
      parseInt(RT_Aging_mesdata[3].cell_RT2_Period_product_num) === 0 ? 0 : 1;

    const MES_RT_OnlineAgingOP_qty = parseInt(
      MES_RT1_Agingstaff_qty + MES_RT2_Agingstaff_qty
    ).toString();

    const MES_RT_AllAgingOP_qty = 2;

    const MES_RT_onlineequip_qty = 2;
    const MES_RT_Agingequipment_qty = 2;
    const MES_RT_AgingStackWO = "MW2008A";
    const MES_RT_AgingQtyinstock = "262128";
    const MES_RT_temperature_ca = "25.3 °C";

    // R.T. Aging(常溫倉靜置)部分 -----------end

    // Edge Folding(精封) -----------start

    const sql_edgeFolding =
      "SELECT * FROM beforeinjectionstage WHERE stageid='分選機前站'  ORDER BY ID DESC LIMIT 1";

    // const sql_edgeFolding = `
    // SELECT * FROM beforeinjectionstage WHERE stageid='分選機前站'  AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}'`;
    const sql_edgeAllID =
      "SELECT * FROM (SELECT ID AS Edge_LastID, 'Edge_One_ID' AS type  FROM mes.beforeinjectionstage WHERE stageid='分選機前站' AND remark like '精封機出料自動化寫入'  ORDER BY ID DESC LIMIT 1 ) AS subEdge1 \
     UNION ALL  SELECT * FROM ( SELECT ID, 'Edge_Two_ID' AS type FROM mes.beforeinjectionstage WHERE stageid='分選機前站' AND remark like '精封機出料自動化寫入二期' ORDER BY ID DESC LIMIT 1) AS subEdge2";

    const sql_edgeFolding_QTY_All_test = `
    SELECT COUNT(DISTINCT cellNO) AS SumofCellNo , 'Edge_1_total' AS type FROM beforeinjectionstage WHERE stageid='分選機前站' AND remark like '精封機出料自動化寫入' AND TIME BETWEEN '${startoem_dt}' AND '${end_oem_currentday} '
    UNION ALL SELECT COUNT(DISTINCT cellNO) , 'Edge_2_total' FROM beforeinjectionstage WHERE stageid='分選機前站' AND remark like '精封機出料自動化寫入二期'  AND TIME BETWEEN '${startoem_dt}' AND '${end_oem_currentday}'`;

    // console.log(sql_edgeAllID);
    // console.log(sql_edgeFolding_QTY_All_test);

    const [row4] = await dbmes.query(sql_edgeFolding);
    // const edgeFoldingWorkPaper = row4[0].cellNO; // 生產工單
    const edgeFoldingWorkPaper = "MW2008A"; // 生產工單

    // console.log("edgeFoldingWorkPaper = " + edgeFoldingWorkPaper);

    const edgeFoldingWorkNo = row4[0].ID; // 最新工作序號
    const [rowID] = await dbmes.query(sql_edgeAllID);

    //最新工作序號
    const Edge1_LastID = rowID[0]["Edge_LastID"];
    const Edge2_LastID = rowID[1]["Edge_LastID"];

    // console.log("Edge1_LastID = " + Edge1_LastID);
    // console.log("Edge2_LastID = " + Edge2_LastID);

    // // 設備線上數量/設備總數量
    const edgeFoldingEquipments_online_QTY = 2;
    const edgeFoldingEquipmentsQTY = 2;
    const edgeFolding_OP_QTY = 2;

    // const [row5] = await dbmes.query(sql_edgeFolding_QTY_All);
    // const edgeFoldingQTY = Number(row5[0].cellNO); // 生產數量

    const [row5] = await dbmes.query(sql_edgeFolding_QTY_All_test);

    // 生產數量
    const MES_Edge_one_period_sum = Number(row5[0]["SumofCellNo"]) + 600;
    const MES_Edge_two_period_sum = Number(row5[1]["SumofCellNo"]) + 1020;

    // console.log("MES_Edge_one_period_sum = " + MES_Edge_one_period_sum);
    // console.log("MES_Edge_two_period_sum = " + MES_Edge_two_period_sum);

    const edge_one_OP_Online_QTY =
      parseInt(MES_Edge_one_period_sum) === 0 ? 0 : 1;

    const edge_two_OP_Online_QTY =
      parseInt(MES_Edge_two_period_sum) === 0 ? 0 : 1;

    const edgeFolding_OP_QTY_all = parseInt(
      edge_one_OP_Online_QTY + edge_two_OP_Online_QTY
    ).toString();

    // Edge Folding(精封)　-----------end

    // Sulting station(分選判別) ----------------start
    const sql_sultingID =
      "SELECT * FROM testmerge_cc1orcc2 WHERE parameter like '017' ORDER BY id DESC LIMIT 1";

    const split_YMD_date = startoem_dt.split("-");
    const nowday = split_YMD_date[2].split(" ")[0];
    // console.log("time = " + split_YMD_date[2].split(" ")[1]);

    const sqL_model_currentday_productcount = `SELECT count(distinct modelId) FROM mes.testmerge_cc1orcc2 where parameter like '017' and year(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) = '${split_YMD_date[0]}' and month(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) = '${split_YMD_date[1]}' and day(str_to_date(SUBSTRING_INDEX(EnddateD, ' ', 1), '%Y/%m/%d')) = '${nowday}' \
    AND TIME(
    STR_TO_DATE(
      CONCAT(
        SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
        SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
        CASE 
          WHEN EnddateD LIKE '%上午%' THEN 'AM'
          WHEN EnddateD LIKE '%下午%' THEN 'PM'
          ELSE ''
        END
      ),
      '%Y/%m/%d %I:%i:%s %p'
    )
  ) BETWEEN '00:00:00' AND '23:59:59'`;

    // console.log(
    //   "計算分容判別CC2目前當天總量query = " + sqL_model_currentday_productcount
    // );

    const [rowSultingID] = await dbmes.query(sql_sultingID);

    // console.log("分選機器CC2目前最新序號= " + rowSultingID[0].id);

    const [rowSulting_MODLE_count] = await dbmes.query(
      sqL_model_currentday_productcount
    );

    // console.log(
    //   "分選機器CC2當天產能 = " + rowSulting_MODLE_count[0]["count(distinct modelId)"]
    // );
    // console.log("分選機器CC2當天產能 = ");

    const MES_Sulting_cc2_ID = rowSultingID[0].id;
    const MES_Sulting_onlineequipment_qty = 1;
    const MES_Sulting_machineQty = 1;
    const MES_Sulting_OP_qty_online = 1;
    const MES_Sulting_OP_qty_all = 1;
    const MES_SultingWO = "MW2008A";
    const PLCE_PRODUCE_Sulting =
      Number(rowSulting_MODLE_count[0]["count(distinct modelId)"]) + 3012;

    // Sulting station(分選判別)  -----------end

    let MES_paramtest = "";
    for (let c = 0; c < querycell_3_Item.length; c++) {
      //------測試 start-------
      // const randomNumber = (Math.random() * 5 + 1).toFixed(5);
      // // console.log("MES_PARAM06 = " + MES_PARAM06);
      // let summixnumber =
      //   parseFloat(MES_PARAM06).toFixed(5) - parseInt(randomNumber);
      // //針對設備運作狀態,顯示字串做判斷變化
      // changeruntime_display(parseInt(MES_MachineStatus));
      // MES_paramtest = MES_ID + "," + summixnumber + "," + stringrunstatus;
      //------測試 end-------

      //化成站
      if (c === 0) {
        MES_paramtest =
          "PF1:" +
          Seci_lastID +
          " / " +
          "PF2:" +
          Chroma_lastID +
          "|" +
          MES_Format_onlineequip_qty +
          "/" +
          MES_Format_stack_machineQty +
          "|" +
          MES_chemos_Online_stack_OPAll_qty +
          "/" +
          MES_chemosstack_OPAll_qty +
          "|" +
          MES_chemosStackWO +
          "|" +
          "1期:[" +
          Seci_chemosBarcodeSUM +
          "] - " +
          "2期:[" +
          Chroma_chemosBarcodeSUM +
          "]";
      } //分容站
      else if (c === 1) {
        MES_paramtest =
          "CC1:" +
          Seci_lastCC1_ID +
          "/" +
          "CC2:" +
          Seci_lastCC2_ID +
          "|" +
          MES_cap_onlineequip_qty +
          "/" +
          MES_cap_stack_machineQty +
          "|" +
          MES_capstack_OP_qty +
          "|" +
          MES_capStackWO +
          "|" +
          "1期:[" +
          MES_capacity_one_sum +
          "] - " +
          "2期:[" +
          MES_capacity_two_sum +
          "]";
      } //H.T高溫倉
      else if (c === 2) {
        MES_paramtest =
          MES_HT_Aging_ID +
          "|" +
          MES_HT_Agingstaff_qty +
          "/" +
          MES_HT_Agingequipment_qty +
          "|" +
          MES_HT_OnlineAgingOP_qty +
          "/" +
          MES_HT_Agin_ALLgstack_OP_qty +
          "|" +
          MES_HT_AgingStackWO +
          "|" +
          MES_HT_Aging_currentdat_amount +
          "|" +
          MES_HT_AgingQtyinstock +
          "|" +
          MES_HT_temperature_ca;
      } //R.T常溫倉
      else if (c === 3) {
        MES_paramtest =
          "RT1:" +
          MES_RT1_Period_Aging_ID +
          "/" +
          "RT2:" +
          MES_RT2_Period_Aging_ID +
          "|" +
          MES_RT_onlineequip_qty +
          "/" +
          MES_RT_Agingequipment_qty +
          "|" +
          MES_RT_OnlineAgingOP_qty +
          "/" +
          MES_RT_AllAgingOP_qty +
          "|" +
          MES_RT_AgingStackWO +
          "|" +
          "1期:[" +
          MES_RT1_Aging_currentdat_amount +
          "] - " +
          "2期:[" +
          MES_RT2_Aging_currentdat_amount +
          "]" +
          "|" +
          MES_RT_AgingQtyinstock +
          "|" +
          MES_RT_temperature_ca;
      } else if (c === 4) {
        MES_paramtest =
          "Edge1:" +
          Edge1_LastID +
          "/" +
          "Edge2:" +
          Edge2_LastID +
          "|" +
          edgeFoldingEquipments_online_QTY +
          "/" +
          edgeFoldingEquipmentsQTY +
          "|" +
          edgeFolding_OP_QTY_all +
          "/" +
          edgeFolding_OP_QTY +
          "|" +
          edgeFoldingWorkPaper +
          "|" +
          "1期:[" +
          MES_Edge_one_period_sum +
          "] - " +
          "2期:[" +
          MES_Edge_two_period_sum +
          "]";
      }
      //分選判別Sulting
      else if (c === 5) {
        MES_paramtest =
          MES_Sulting_cc2_ID +
          "|" +
          MES_Sulting_onlineequipment_qty +
          "/" +
          MES_Sulting_machineQty +
          "|" +
          MES_Sulting_OP_qty_online +
          "/" +
          MES_Sulting_OP_qty_all +
          "|" +
          MES_SultingWO +
          "|" +
          PLCE_PRODUCE_Sulting;
      }

      total_cellproduct.push(MES_paramtest);
    }

    // console.log(total_cellproduct);

    //確定total_cellproduct陣列內容不為空
    if (total_cellproduct.length > 0 || total_cellproduct !== null) {
      // 清空之前暫存高常溫資料陣列
      HT_Aging_mesdata.length = RT_Aging_mesdata.length = 0;
    }

    // 將製令單號回傳給前端
    res.status(200).send(total_cellproduct);
  } catch (error) {
    // 如果發生錯誤，回傳錯誤訊息
    res.status(500).json({ message: error.message });
  }
});

router.get("/main_FrontSet_Page_front", async (req, res) => {
  const finalSend = [];

  // 🕒 動態生成時間區段（早/晚班）
  function getTimeCondition(now, columnName = "Time") {
    const moment = require("moment-timezone"); // 確保 moment-timezone 已經引入
    const taipeiTime = moment(now).tz("Asia/Taipei");

    // 確保時間條件是封閉區間 [startTime, endTime)
    return `DATE(${columnName}) = CURDATE()`;
  }
  const rollingTimeSelect = getTimeCondition(new Date(), "employee_InputTime");
  const mixingTimeSelect = getTimeCondition(new Date(), "BatchStart");
  const coaterTimeSelect = getTimeCondition(new Date(), "CreateAt");
  const coaterMesTime = getTimeCondition(new Date(), "startTime");

  // ------------------------
  // 📊 SQL 區塊
  // ------------------------

  // HR：混漿設備數
  const sql_mixing_devices = `
    SELECT 
      COUNT(CASE WHEN MixingSelect = "正極混漿" THEN 1 END) AS mixingDevice_cathode_count,
      COUNT(CASE WHEN MixingSelect = "負極混漿" THEN 1 END) AS mixingDevice_anode_count
    FROM mixing_register 
    WHERE MixingSelect IN ("正極混漿", "負極混漿")
    AND EngineerNo = "109"
    ;
  `;

  // HR：輾壓 / 分切設備數
  const sql_rolling_devices = `
    SELECT 
      COUNT(DISTINCT CASE WHEN selectWork = 'rollingcathode' THEN machineNo END) AS rollingDevice_cathode_count,
      COUNT(DISTINCT CASE WHEN selectWork = 'rollinganode' THEN machineNo END) AS rollingDevice_anode_count,
      COUNT(DISTINCT CASE WHEN selectWork = 'slittingcathode' THEN machineNo END) AS slittingDevice_cathode_count,
      COUNT(DISTINCT CASE WHEN selectWork = 'slittinganode' THEN machineNo END) AS slittingDevice_anode_count
    FROM rollingnslitting_register 
    WHERE selectWork IN ('rollingcathode', 'rollinganode', 'slittingcathode', 'slittinganode')
      AND engineerId = "264"
      AND (is_deleted IS NULL OR is_deleted = 0);
  `;

  // HR：塗佈設備數
  const sql_coating_devices = `
    SELECT 
    (SELECT machineForOPselect FROM coating_register WHERE ${coaterTimeSelect} AND selectWork = "coaterCathode" ORDER BY id DESC LIMIT 1 ) AS coater_Cathode_MachineSelect,
    (SELECT machineForOPselect FROM coating_register WHERE ${coaterTimeSelect} AND selectWork = "coaterAnode_S" ORDER BY id DESC LIMIT 1 ) AS coater_Anode_S_MachineSelect,
    (SELECT machineForOPselect FROM coating_register WHERE ${coaterTimeSelect} AND selectWork = "coaterAnode_D" ORDER BY id DESC LIMIT 1 ) AS coater_Anode_D_MachineSelect
  `;

  // MES：混漿資訊 (已修正為 FULL JOIN 邏輯，確保任一邊有資料都能回傳)
  const sql_mixing_other = `
    WITH
      LatestCathode AS (
          SELECT 'key' AS join_key, LotNo AS mixingCathode_LotNo, 
          ReceipeNo AS mixingCathode_ReceipeNo
          FROM mixingcathode_batch
          WHERE ${mixingTimeSelect} 
          AND EngineerNo = "109"
          ORDER BY BatchStart DESC LIMIT 1
      ),
      LatestAnode AS (
          SELECT 'key' AS join_key, LotNo AS mixingAnode_LotNo, 
          ReceipeNo AS mixingAnode_ReceipeNo
          FROM mixinganode_batch
          WHERE ${mixingTimeSelect} 
          AND EngineerNo = "109"
          ORDER BY BatchStart DESC LIMIT 1
      )
    -- 1. LEFT JOIN: 保留陰極資料，並嘗試匹配陽極
    SELECT
      C.mixingCathode_LotNo,
      C.mixingCathode_ReceipeNo,
      A.mixingAnode_LotNo,
      A.mixingAnode_ReceipeNo
    FROM LatestCathode AS C
    LEFT JOIN LatestAnode AS A ON C.join_key = A.join_key

    UNION ALL

    -- 2. RIGHT JOIN 邏輯: 保留陽極資料，但只保留那些在 1. 中沒有被匹配到的
    SELECT
      C.mixingCathode_LotNo,
      C.mixingCathode_ReceipeNo,
      A.mixingAnode_LotNo,
      A.mixingAnode_ReceipeNo
    FROM LatestAnode AS A
    LEFT JOIN LatestCathode AS C ON A.join_key = C.join_key
    WHERE C.join_key IS NULL;
  `;

  // MES：混漿批次完成數 (已修正 COUNT 函數空格問題)

  const sql_mixing_CountFinish = `
    WITH 
      CathodeCount AS (
        SELECT COUNT(CASE WHEN System_Step = "5" THEN 1 END) AS cathode_batch_count 
        FROM mixingcathode_batch
        WHERE ${mixingTimeSelect}
        AND EngineerNo = "109"
      ),
      AnodeCount AS (
        SELECT COUNT(CASE WHEN System_Step = "5" THEN 1 END) AS anode_batch_count 
        FROM mixinganode_batch
        WHERE ${mixingTimeSelect}
        AND EngineerNo = "109"
      )
    SELECT 
      CC.cathode_batch_count,
      AC.anode_batch_count
    FROM CathodeCount AS CC
    CROSS JOIN AnodeCount AS AC; 
  `;

  // mes 塗佈批次完成數
  const sql_coater_CountFinish = `
    WITH
    CathodeCount AS (
      SELECT SUM(CASE WHEN lotNumber IS NOT NULL THEN productionMeters END) AS coaterCathode_meter_sum,
             SUM(CASE WHEN lotNumber IS NOT NULL THEN lostMeter END) AS coaterCathode_lost_sum
      FROM coatingcathode_batch
      WHERE ${coaterMesTime}
    ),
    AnodeCount AS (
      SELECT SUM(CASE WHEN lotNumber IS NOT NULL THEN productionMeters END) AS coaterCathode_meter_sum,
             SUM(CASE WHEN lotNumber IS NOT NULL THEN lostMeter END) AS coaterCathode_lost_sum
      FROM coatinganode_batch
      WHERE ${coaterMesTime}
    )
    SELECT 
      CC.coaterCathode_meter_sum,
      CC.coaterCathode_lost_sum,
      AC.coaterCathode_meter_sum AS coaterAnode_meter_sum,
      AC.coaterCathode_lost_sum AS coaterAnode_lost_sum
    FROM CathodeCount AS CC
    CROSS JOIN AnodeCount AS AC;
  `;

  // MES：輾壓
  const sql_rolling_other = `
    SELECT 
      (SELECT lotNumber FROM rollingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS rollingCathode_LotNo,
      (SELECT SUM(rollingLength) FROM rollingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS rollingCathode_Length,
      (SELECT SUM(rollingLostLength) FROM rollingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS rollingcathode_LostLength,
      (SELECT lotNumber FROM rollinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS rollinganode_LotNo,
      (SELECT SUM(rollingLength) FROM rollinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS rollinganode_Length,
      (SELECT SUM(rollingLostLength) FROM rollinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS rollinganode_LostLength;
  `;

  // MES：分切
  const sql_slitting_other = `
    SELECT 
      (SELECT lotNumber_R FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS slittingcathode_LotNo_R,
      (SELECT lotNumber_L FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS slittingcathode_LotNo_L,
      (SELECT SUM(Length_R) FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittingcathode_Length_R,
      (SELECT SUM(Length_L) FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittingcathode_Length_L,
      (SELECT SUM(LostLength_R) FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittingcathode_LostLength_R,
      (SELECT SUM(LostLength_L) FROM slittingcathode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittingcathode_LostLength_L,
      (SELECT lotNumber_R FROM slittinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS slittinganode_LotNo_R,
      (SELECT lotNumber_L FROM slittinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264" ORDER BY id DESC LIMIT 1) AS slittinganode_LotNo_L,
      (SELECT SUM(Length_R) FROM slittinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittinganode_Length_R,
      (SELECT SUM(Length_L) FROM slittinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittinganode_Length_L,
      (SELECT SUM(LostLength_R) FROM slittinganode_batch WHERE ${rollingTimeSelect} AND engineerId = "264") AS slittinganode_LostLength_R,
      (SELECT SUM(LostLength_L) FROM slittinganode_batch WHERE ${rollingTimeSelect}) AS slittinganode_LostLength_L;
  `;

  const sql_coater_other = `
    SELECT 
    (SELECT lotNumber FROM coatingcathode_batch WHERE ${coaterMesTime} ORDER BY id DESC LIMIT 1) AS lotNumber_Cathode,
    (SELECT lotNumber FROM coatinganode_batch WHERE ${coaterMesTime} ORDER BY id DESC LIMIT 1) AS lotNumber_Anode;
  `;

  try {
    const [
      [mixingDevicesArray],
      [rollingDevicesArray],
      [mixingOtherArray],
      [rollingOtherArray],
      [slittingOtherArray],
      [mixingCountArray],
      [coaterDevicesArray],
      [coaterCountFinishArray],
      [coaterOtherArray],
    ] = await Promise.all([
      dbcon.query(sql_mixing_devices),
      dbcon.query(sql_rolling_devices),
      dbmes.query(sql_mixing_other),
      dbmes.query(sql_rolling_other),
      dbmes.query(sql_slitting_other),
      dbmes.query(sql_mixing_CountFinish),
      dbcon.query(sql_coating_devices),
      dbmes.query(sql_coater_CountFinish),
      dbmes.query(sql_coater_other),
    ]);

    const rollingDevices = rollingDevicesArray[0] || {};
    const mixingDevices = mixingDevicesArray[0] || {};
    const mixingOther = mixingOtherArray[0] || {};

    const rollingOther = rollingOtherArray[0] || {};
    const slittingOther = slittingOtherArray[0] || {};
    const mixingCountFinish = mixingCountArray[0] || {};

    // 用於計算 Coater 機器數量 --start
    const coaterDevicesRow = Object.keys(coaterDevicesArray).flat().length || {};
    console.log ("coaterDevicesRow:", coaterDevicesRow);

    const coaterDevices = coaterDevicesArray[0] || {};

    // 安全地解析 JSON 字符串，即使它是 null 或不是有效的 JSON
    const safeJsonParse = (str) => {
      if (typeof str !== 'string') return [];
      try {
        // 在這裡，我們不能依賴全域的 JSON.parse，因為它可能被覆蓋
        // 我們將使用一個簡單的正規表達式來提取機器名稱
        // 這是一個針對 ["C-C-01", "C-C-02"] 這種格式的簡化解析
        const matches = str.match(/"(.*?)"/g);
        if (matches) {
          return matches.map(s => s.replace(/"/g, ''));
        }
        return [];
      } catch (e) {
        return [];
      }
    };

    const cathodeArr = safeJsonParse(coaterDevices.coater_Cathode_MachineSelect);
    const anodeSArr = safeJsonParse(coaterDevices.coater_Anode_S_MachineSelect);
    const anodeDArr = safeJsonParse(coaterDevices.coater_Anode_D_MachineSelect);
    
    const anodeArr = [...anodeSArr, ...anodeDArr];

    const countCoaterMachines = cathodeArr.length + anodeArr.length;

    console.log("Total Coater Machines Counted:", countCoaterMachines);
    // 用於計算 Coater 機器數量 --end

    const coaterCountFinish = coaterCountFinishArray[0] || {};
    console.log("coaterCountFinish:", coaterCountFinish);

    const coaterArr = coaterOtherArray[0] || {};

    const rolling = {
      cathode: {
        deviceCount: rollingDevices.rollingDevice_cathode_count || 0,
        lotNo: rollingOther.rollingCathode_LotNo || "",
        length: rollingOther.rollingCathode_Length || 0,
        lostLength: rollingOther.rollingcathode_LostLength || 0,
      },
      anode: {
        deviceCount: rollingDevices.rollingDevice_anode_count || 0,
        lotNo: rollingOther.rollinganode_LotNo || "",
        length: rollingOther.rollinganode_Length || 0,
        lostLength: rollingOther.rollinganode_LostLength || 0,
      },
    };

    const slitting = {
      cathode: {
        deviceCount: rollingDevices.slittingDevice_cathode_count || 0,
        lotNo_R: slittingOther.slittingcathode_LotNo_R || "",
        lotNo_L: slittingOther.slittingcathode_LotNo_L || "",
        length_R: slittingOther.slittingcathode_Length_R || 0,
        length_L: slittingOther.slittingcathode_Length_L || 0,
        lostLength_R: slittingOther.slittingcathode_LostLength_R || 0,
        lostLength_L: slittingOther.slittingcathode_LostLength_L || 0,
      },
      anode: {
        deviceCount: rollingDevices.slittingDevice_anode_count || 0,
        lotNo_R: slittingOther.slittinganode_LotNo_R || "",
        lotNo_L: slittingOther.slittinganode_LotNo_L || "",
        length_R: slittingOther.slittinganode_Length_R || 0,
        length_L: slittingOther.slittinganode_Length_L || 0,
        lostLength_R: slittingOther.slittinganode_LostLength_R || 0,
        lostLength_L: slittingOther.slittinganode_LostLength_L || 0,
      },
    };

    const mixing = {
      cathode: {
        deviceCount: mixingDevices.mixingDevice_cathode_count || 0,
        lotNo: mixingOther.mixingCathode_LotNo || "",
        receipeNo: mixingOther.mixingCathode_ReceipeNo || "",
        capacity: mixingCountFinish.cathode_batch_count || 0,
      },
      anode: {
        deviceCount: mixingDevices.mixingDevice_anode_count || 0,
        lotNo: mixingOther.mixingAnode_LotNo || "",
        receipeNo: mixingOther.mixingAnode_ReceipeNo || "",
        capacity: mixingCountFinish.anode_batch_count || 0,
      },
    };

    const coater = {
      cathode: {
        deviceCount: cathodeArr.length || 0,
        lotNo: coaterArr.lotNumber_Cathode || "",
        capacity: coaterCountFinish.coaterCathode_meter_sum || 0,
        lostLength: coaterCountFinish.coaterCathode_lost_sum || 0,
      },
      anode: {
        deviceCount: anodeArr.length || 0,
        lotNo: coaterArr.lotNumber_Anode || "",
        capacity: coaterCountFinish.coaterAnode_meter_sum || 0,
        lostLength: coaterCountFinish.coaterAnode_lost_sum || 0,
      },
    };

    finalSend.push({ rolling, slitting, mixing, coater });

    res.status(200).json({
      message: "API 執行成功",
      data: finalSend,
    });
  } catch (error) {
    console.error("❌ API 錯誤詳細:", error);
    res.status(500).json({
      message: "API 執行失敗",
      error: error.message,
      details: error.stack,
    });
  }
});

// 中段 main_FrontSet_Page (全部回來)
router.get("/main_FrontSet_Page_middle", async (req, res) => {
  const {} = req.body;
  const finalSend = [];

  // 根據現在時間動態生成 WHERE time 條件函數
  function getTimeCondition(now, columnName = "Time") {
    const taipeiTime = moment(now).tz("Asia/Taipei");
    const hour = taipeiTime.hour();
    let startTime, endTime;

    if (hour >= 8 && hour < 20) {
      // 早班: 8:00 - 20:00
      startTime = taipeiTime.clone().set({ hour: 8, minute: 0, second: 0 });
      endTime = taipeiTime.clone().set({ hour: 20, minute: 0, second: 0 });
    } else {
      // 晚班: 20:00 - 次日8:00
      startTime = taipeiTime.clone().set({ hour: 20, minute: 0, second: 0 });
      endTime = taipeiTime
        .clone()
        .add(1, "day")
        .set({ hour: 8, minute: 0, second: 0 });
    }

    return `${columnName} >= '${startTime.format(
      "YYYY-MM-DD HH:mm:ss"
    )}' AND ${columnName} < '${endTime.format("YYYY-MM-DD HH:mm:ss")}'`;
  }

  const now = new Date();
  const timeCondition = getTimeCondition(now, "Time");

  // mes db

  // 模切資訊:
  let sql_cutting_all = `
  SELECT
    -- Cathode 正極數據
    COUNT(DISTINCT CASE WHEN Caseno LIKE 'C%' THEN machine END) AS cuttingcathode_deviceCount,
    SUM(CASE WHEN OKNGSelection = '良品' AND Caseno LIKE 'C%' THEN Prdouction ELSE 0 END) AS cuttingcathode_autoGoodCapacity,
    SUM(CASE WHEN OKNGSelection = '手工良品(Manual Good)' AND Caseno LIKE 'C%' THEN Prdouction ELSE 0 END) AS cuttingcathode_manualGoodCapacity,
    COUNT(DISTINCT CASE WHEN Caseno LIKE 'C%' THEN StaffNo1 END) + COUNT(DISTINCT CASE WHEN Caseno LIKE 'C%' THEN StaffNo2 END) AS cuttingcathode_staffCount,
    MAX(CASE WHEN Caseno LIKE 'C%' THEN Rollno ELSE NULL END) AS cuttingcathode_LotNo,


    -- Anode 負極數據
    COUNT(DISTINCT CASE WHEN Caseno LIKE 'B%' THEN machine END) AS cuttinganode_deviceCount,
    SUM(CASE WHEN OKNGSelection = '良品' AND Caseno LIKE 'B%' THEN Prdouction ELSE 0 END) AS cuttinganode_autoGoodCapacity,
    SUM(CASE WHEN OKNGSelection = '手工良品(Manual Good)' AND Caseno LIKE 'B%' THEN Prdouction ELSE 0 END) AS cuttinganode_manualGoodCapacity,
    COUNT(DISTINCT CASE WHEN Caseno LIKE 'B%' THEN StaffNo1 END) + COUNT(DISTINCT CASE WHEN Caseno LIKE 'B%' THEN StaffNo2 END) AS cuttinganode_staffCount,
    MAX(CASE WHEN Caseno LIKE 'B%' THEN Rollno ELSE NULL END) AS cuttinganode_LotNo
  FROM mes.cutting_bath
  WHERE ${timeCondition};
`;

  // 疊片資訊:
  let sql_stacking_all = `
  SELECT
      -- 1. 碟片機台數/人數/工單 (來自 stacking_realtime)
      T1.stacking_deviceCount_old,
      T1.stacking_staffCount,
      T1.stacking_WONO,
      -- 2. 算碟片機產能 (舊機台) (來自 stacking_batch)
      T2.stacking_capacit_old,
      -- 3. 算碟片機產能 (新/全部機台) (來自 stacking2_batch)
      T3.stacking_deviceCount_new,
      T3.stacking_capacit_new
  FROM
      -- 子查詢 A: 碟片機台數/人數/工單
      (
          SELECT
              COUNT(DISTINCT CASE WHEN MachineName NOT IN ('Stack1','Stack2') THEN MachineName END) AS stacking_deviceCount_old,
              COUNT(DISTINCT OPNO) AS stacking_staffCount,
              (SELECT WONO 
                FROM mes.stacking_realtime 
                WHERE MachineName NOT IN ('Stack1','Stack2') 
                  AND ${timeCondition}
                ORDER BY ID DESC LIMIT 1) AS stacking_WONO
              
          FROM mes.stacking_realtime
          WHERE ${timeCondition}
      ) AS T1
  CROSS JOIN
      -- 子查詢 B: 碟片機產能 (舊機台)
      ( 
          SELECT 
              COUNT(DISTINCT PLCCellID_CE) AS stacking_capacit_old
          FROM mes.stacking_batch
          WHERE Machine NOT IN ('Stack1','Stack2') 
            AND ${timeCondition}
      ) AS T2
  CROSS JOIN
      -- 子查詢 C: 碟片機產能 (新/全部機台)
      (
          SELECT 
            COUNT(DISTINCT PLCCellID_CE) AS stacking_capacit_new,
            COUNT(DISTINCT Machine ) AS stacking_deviceCount_new
          FROM mes.stacking2_batch
          WHERE ${timeCondition}
            AND Machine IN ('Stack-1', 'Stack-2', 'Stack-10')
      ) AS T3;
`;

  // 入殼資訊:
  let sql_assembly_all = `
    SELECT 
    -- 1. 入殼機台數/人數/工單 (來自 assembly_realtime)
    T1.assembly_deviceCount,
    T1.assembly_staffCount,
    T1.assembly_WONO,

    -- 2. 算入殼產能 (來自 assembly_batch)
    T2.assembly_capacity_First,
    T2.assembly_capacity_Second
    FROM
    -- 1. 入殼機台數/人數/工單 (來自 assembly_realtime)
      (
        SELECT 
          COUNT(DISTINCT MachineNO) AS assembly_deviceCount,
          COUNT(DISTINCT OPNO) AS assembly_staffCount,
          MAX(CellNO) AS assembly_WONO
        FROM mes.assembly_realtime
        WHERE ${timeCondition}
      ) AS T1
    CROSS JOIN
      -- 2. 算入殼產能 (來自 assembly_batch)
      (
        SELECT
          SUM(CASE WHEN Remark <> '' OR Remark IS NULL THEN 1 ELSE 0 END) AS assembly_capacity_First,
          SUM(CASE WHEN Remark LIKE '二期' THEN 1 ELSE 0 END) AS assembly_capacity_Second
        FROM mes.assembly_batch
        WHERE ${timeCondition}
      ) AS T2
CROSS JOIN
  (
    SELECT Cell AS WO
    FROM mes.pack3_v
    WHERE ${timeCondition} AND Cell IS NOT NULL AND Cell <> ''
    ORDER BY time DESC
    LIMIT 1
  ) AS T3
`;

  // 烘箱資訊:
  let sql_oven_all = `
      SELECT
          -- 1. 入庫數量 (來自 T1)
          T1.oven_InStock,
          -- 2. 出庫數量 (來自 T2)
          T2.oven_OutStock,
          T2.oven_StaffCount,
          T2.oven_DeviceCount,
          T2.oven_WONO
      FROM
          (
              -- T1: 查詢入庫/投入批次資料
              SELECT
                  COUNT( CS_board_number ) * 40 AS oven_InStock  -- 假設 T1 表中每筆紀錄都是一個批次
              FROM
                  mes.cellbakingin_batch
              WHERE
                  ${timeCondition}
          ) AS T1
      CROSS JOIN
          (
              -- T2: 查詢出庫/產出批次資料
              SELECT
                  COUNT(CE_board_number) * 40 AS oven_OutStock,  -- *** 語法修正：增加逗號 ***
                  COUNT(DISTINCT OP) AS oven_StaffCount,
                  COUNT(DISTINCT Machine) AS oven_DeviceCount,
                  MAX(WO) AS oven_WONO
              FROM
                  mes.cellbaking_batch
              WHERE
                  ${timeCondition}
          ) AS T2;
      `;

  // 注液資訊:
  let sql_injection_all = `
  SELECT
    COUNT(CASE WHEN REMARK = '人工作業寫入' THEN PLCCellID_CE END) AS injection_handleMade_count,
    COUNT(CASE WHEN REMARK = '注液機出料自動寫入' THEN PLCCellID_CE END) AS injection_auto_count_1,
    COUNT(CASE WHEN REMARK = '注液機二期出料自動寫入' THEN PLCCellID_CE END) AS injection_auto_count_2,
    COUNT(MachineNO) AS injection_machine_count,
    COUNT(OPNO) AS injection_staff_count,
    MAX(WORKNO) AS injection_WO_count
  FROM mes.injection_batch_fin
  WHERE ${timeCondition}
  `;

  //Degassing 資訊:
  let sql_degassing_all = `
    SELECT
        T1.pump3_Capacity_01,
        T1.pump3_Capacity_02,
        T2.pump2_Capacity_01,
        T2.pump2_Capacity_02,
        
        T3.WO_pump3,
        T3.Time_pump3,

        T4.WO_pump2,
        T4.Time_pump2

    FROM
        ( -- T1 三抽
            SELECT
                COUNT(DISTINCT CASE WHEN REMARK IN ('一期三抽出料自動化寫入', '三抽出料自動寫入') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> '' THEN PLCCellID12_CE END) AS pump3_Capacity_01,
                COUNT(DISTINCT CASE WHEN REMARK IN ('二期三抽出料自動寫入', '人工二期補帳', '二期第一台三抽出料自動寫入', '二期第二台三抽出料自動寫入') AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> '' THEN PLCCellID12_CE END) AS pump3_Capacity_02
            FROM mes.pack3_batch
            WHERE ${timeCondition}
        ) AS T1
    CROSS JOIN
        ( -- T2 二抽
            SELECT
                COUNT(DISTINCT CASE WHEN REMARK IN ('二抽出料自動寫入') THEN PLCCellID12_CE END) AS pump2_Capacity_01,
                COUNT(DISTINCT CASE WHEN REMARK IN ('二抽二期出料自動寫入', '人工二期補帳') THEN PLCCellID12_CE END) AS pump2_Capacity_02
            FROM mes.pack2_batch
            WHERE ${timeCondition}
        ) AS T2

    CROSS JOIN 
        ( -- 三抽
          SELECT
            PLCCellID12_CE AS WO_pump3,
            Time AS Time_pump3
          FROM mes.pack3_batch
          WHERE ${timeCondition} AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> ''
          ORDER BY time DESC
          LIMIT 1
        ) AS T3
    CROSS JOIN 
        ( -- 二抽
          SELECT
            PLCCellID12_CE AS WO_pump2,
            Time AS Time_pump2
          FROM mes.pack2_batch
          WHERE ${timeCondition} AND PLCCellID12_CE IS NOT NULL AND PLCCellID12_CE <> ''
          ORDER BY time DESC
          LIMIT 1
        ) AS T4
  `;

  // 合併多段 SQL：先去除每段尾部的分號與多餘空白，避免產生空的 SQL 語句導致 MySQL ER_PARSE_ERROR
  const middleSectionQuery = [
    sql_cutting_all,
    sql_stacking_all,
    sql_assembly_all,
    sql_oven_all,
    sql_injection_all,
    sql_degassing_all,
  ]
    .map((s) => (typeof s === "string" ? s.trim().replace(/;+\s*$/g, "") : ""))
    .filter((s) => s.length > 0)
    .join(";\n") + ";";

  try {
    const [middleResults] = await dbmes.query(middleSectionQuery);

    const [
      cuttingData = [],
      stackingData = [],
      assemblyData = [],
      ovenData = [],
      injectionData = [],
      degassingData = [],
    ] = middleResults || [];

    // 模切
    const cutting = {
      cathode: {
        deviceCount: cuttingData[0]?.cuttingcathode_deviceCount || 0,
        autoGoodCapacity: cuttingData[0]?.cuttingcathode_autoGoodCapacity || 0,
        manualGoodCapacity:
          cuttingData[0]?.cuttingcathode_manualGoodCapacity || 0,
        staffCount: cuttingData[0]?.cuttingcathode_staffCount || 0,
        lotNo: cuttingData[0]?.cuttingcathode_LotNo || "",
      },
      anode: {
        deviceCount: cuttingData[0]?.cuttinganode_deviceCount || 0, //設備數
        autoGoodCapacity: cuttingData[0]?.cuttinganode_autoGoodCapacity || 0, // 自動良品
        manualGoodCapacity:
          cuttingData[0]?.cuttinganode_manualGoodCapacity || 0, // 手工良品
        staffCount: cuttingData[0]?.cuttinganode_staffCount || 0, // 人員數
        lotNo: cuttingData[0]?.cuttinganode_LotNo || "",
      },
    };


    console.log("cuttingData:", stackingData[0]);
    // 疊片站
    const stacking = {
      deviceCount: stackingData[0]?.stacking_deviceCount_old || 0, //設備數
      deviceCount: stackingData[0]?.stacking_deviceCount_new || 0, //設備數
      deviceCount: stackingData[0]?.stacking_deviceCount || 0, //設備數
      staffCount: stackingData[0]?.stacking_staffCount || 0, // 人員數
      WO: stackingData[0]?.stacking_WONO ? stackingData[0]?.stacking_WONO :  "", // 工單
      old_capacity: stackingData[0]?.stacking_capacit_old || 0, // 舊機台產能
      new_capacity: stackingData[0]?.stacking_capacit_new || 0, // 新機台產能
    };

    // 入殼站
    const assembly = {
      deviceCount: assemblyData[0]?.assembly_deviceCount || 0, //設備數
      staffCount: assemblyData[0]?.assembly_staffCount || 0, // 人員數
      WO: assemblyData[0]?.assembly_WONO?.slice(0, 7) || "", // 工單
      capacity_First: assemblyData[0]?.assembly_capacity_First || 0, // 產能
      capacity_Second: assemblyData[0]?.assembly_capacity_Second || 0, // 產能
    };
    // 烘箱站
    const oven = {
      deviceCount: ovenData[0]?.oven_DeviceCount || 0, //設備數
      staffCount: ovenData[0]?.oven_StaffCount || 0, // 人員數
      WO: ovenData[0]?.oven_WONO || "", // 工單
      InStock: ovenData[0]?.oven_InStock || 0, // 入庫數量
      OutStock: ovenData[0]?.oven_OutStock || 0, // 出庫數量
    };

    // 注液站
    const injection = {
      deviceCount: injectionData[0]?.injection_machine_count || 0, //設備數
      staffCount: injectionData[0]?.injection_staff_count || 0, // 人員數
      WO: injectionData[0]?.injection_WO_count || 0, // 工單數
      handleMade_count: injectionData[0]?.injection_handleMade_count || 0, // 人工作業寫入 數量
      auto_count_1: injectionData[0]?.injection_auto_count_1 || 0, // 注液機出料自動寫入 數量
      auto_count_2: injectionData[0]?.injection_auto_count_2 || 0, // 注液機二期出料自動寫入 數量
    };

    //Degassing
    const degassing = {
      WO:
        degassingData[0]?.Time_pump2 &&
        degassingData[0]?.Time_pump3 &&
        degassingData[0]?.Time_pump2 > degassingData[0]?.Time_pump3
          ? (degassingData[0]?.WO_pump2 || "").substring(0, 7)
          : (degassingData[0]?.WO_pump3 || "").substring(0, 7),
      pump3_phase_1_capacity: degassingData[0]?.pump3_Capacity_01 || 0,
      pump3_phase_2_capacity: degassingData[0]?.pump3_Capacity_02 || 0,
      pump2_phase_1_capacity: degassingData[0]?.pump2_Capacity_01 || 0,
      pump2_phase_2_capacity: degassingData[0]?.pump2_Capacity_02 || 0,
    };

    finalSend.push({
      cutting,
      stacking,
      assembly,
      oven,
      injection,
      degassing,
    });

    res.status(200).json({
      message: "有成功call到 api ",
      data: finalSend,
    });
    start = false; // 關閉MSSQL 開關
  } catch (error) {
    console.error("API錯誤詳細信息:", error);
    res.status(500).json({
      message: "沒有對接到api",
      error: error.message,
      details: error.stack,
    });
  }
});

// 後段 main_FrontSet_Page (全部回來)
router.get("/main_FrontSet_Page_end", async (req, res) => {
  const {} = req.body;
  const finalSend = [];

  // 根據現在時間動態生成 WHERE time 條件函數
  function getTimeCondition(now, columnName = "time") {
    const taipeiTime = moment(now).tz("Asia/Taipei");
    const hour = taipeiTime.hour();
    let startTime, endTime;

    if (hour >= 8 && hour < 20) {
      // 早班: 8:00 - 20:00
      startTime = taipeiTime.clone().set({ hour: 8, minute: 0, second: 0 });
      endTime = taipeiTime.clone().set({ hour: 20, minute: 0, second: 0 });
    } else {
      // 晚班: 20:00 - 次日8:00
      startTime = taipeiTime.clone().set({ hour: 20, minute: 0, second: 0 });
      endTime = taipeiTime
        .clone()
        .add(1, "day")
        .set({ hour: 8, minute: 0, second: 0 });
    }

    return `${columnName} >= '${startTime.format(
      "YYYY-MM-DD HH:mm:ss"
    )}' AND ${columnName} < '${endTime.format("YYYY-MM-DD HH:mm:ss")}'`;
  }

  const timeCondition = getTimeCondition(new Date(), "time");
  const analysisDTCondition = getTimeCondition(new Date(), "analysisDT");

  // mes db

  // 化成資訊:
  let sql_formation_all = `
    SELECT
      T1.formationcathode_capacity_01,
      T2.formationcathode_capacity_02
    FROM 
      (SELECT 
        COUNT(DISTINCT CASE WHEN Param LIKE '%023%' THEN Barcode END) AS formationcathode_capacity_01
      FROM mes.seci_outport12
      WHERE ${getTimeCondition(new Date(), "Time")}
      ) AS T1
    CROSS JOIN
      (SELECT 
        COUNT(DISTINCT CASE WHEN Param LIKE '%023%' THEN Barcode END) AS formationcathode_capacity_02
      FROM mes.chroma_outport123
      WHERE ${getTimeCondition(new Date(), "Time")}
      ) AS T2;
  `;

  let sql_capacity_all = `
      SELECT
      T1.formationcathode_capacity_01,
      T2.formationcathode_capacity_02
    FROM 
      (SELECT 
        COUNT(DISTINCT CASE WHEN Param LIKE '%010%' OR Param LIKE '%017%' THEN Barcode END) AS formationcathode_capacity_01
      FROM mes.seci_outport12
      WHERE ${getTimeCondition(new Date(), "Time")}
      ) AS T1
    CROSS JOIN
      (SELECT 
        COUNT(DISTINCT CASE WHEN Param LIKE '%010%' OR Param LIKE '%017%' THEN Barcode END) AS formationcathode_capacity_02
      FROM mes.chroma_outport123
      WHERE ${getTimeCondition(new Date(), "Time")}
      ) AS T2;
  `;

  let sql_edgeFolding_all = `
SELECT
    t1.edgeFolding_auto_count_1,
    t1.edgeFolding_auto_count_2,
    t1.edgeFolding_handmade_count,
    t2.cellNO
FROM
    (
        SELECT  
            COUNT(DISTINCT CASE WHEN stageID = '分選機前站' AND remark = '精封機出料自動寫入' THEN cellNO END) AS edgeFolding_auto_count_1,
            COUNT(DISTINCT CASE WHEN stageID = '分選機前站' AND remark = '精封機出料自動寫入二期' THEN cellNO END) AS edgeFolding_auto_count_2,
            COUNT(DISTINCT CASE WHEN stageID = '分選機前站' AND remark LIKE '%人工作業%' THEN cellNO END) AS edgeFolding_handmade_count
        FROM mes.beforeinjectionstage
        WHERE ${timeCondition}
    ) AS t1
CROSS JOIN
    (
        SELECT cellNO
        FROM mes.beforeinjectionstage
        WHERE stageID = '分選機前站' AND cellNO <> '' AND cellNO IS NOT NULL
        ORDER BY time DESC
        LIMIT 1
    ) AS t2
  `;

  // 分選資訊:
  let sql_sorting_all = `
    SELECT
      COUNT(DISTINCT modelId) as sortingCapacity,
      MAX(modelId) AS sortingWO

    FROM mes.testmerge_cc1orcc2
    WHERE 
  	    parameter = '017' AND
      ${analysisDTCondition}
  `;
  // RT/HT Aging 資訊:
  let sql_RTNHT_all = `
    SELECT 
        T1.H_COUNT,
        T1.N_COUNT_01,
        T1.N_COUNT_02,
        T2.WO_RT
    FROM 
        (
            SELECT 
                COUNT(DISTINCT CASE WHEN BIN_CODE LIKE 'H%' AND BOX_BATT <> 'NANANANANANA' THEN BIN_CODE END) AS H_COUNT,
                COUNT(DISTINCT CASE WHEN BIN_CODE LIKE 'N%' AND BOX_BATT <> 'NANANANANANA' THEN BIN_CODE END) AS N_COUNT_01,
                COUNT(DISTINCT CASE WHEN BIN_CODE LIKE 'N2%' AND BOX_BATT <> 'NANANANANANA' THEN BIN_CODE END) AS N_COUNT_02
            FROM ITFC_MES_UPLOAD_STATUS_TB
            WHERE CREATE_DATE BETWEEN @start AND @end
                AND TYPE = 4
                AND BOX_BATT <> 'NANANANANANA'
        ) AS T1
    CROSS JOIN 
        (
            SELECT TOP 1 BOX_BATT AS WO_RT
            FROM ITFC_MES_UPLOAD_STATUS_TB
            WHERE CREATE_DATE BETWEEN @start AND @end
                AND TYPE = 4 
                AND BOX_BATT <> 'NANANANANANA' 
            ORDER BY ID DESC
        ) AS T2
    `;

  try {
    // MES DB :
    const [formationArray, capacityArray, edgeFoldingArray, sortingArray] =
      await Promise.all([
        dbmes.query(sql_formation_all),
        dbmes.query(sql_capacity_all),
        dbmes.query(sql_edgeFolding_all),
        dbmes.query(sql_sorting_all),
      ]);
    const agingArray = await connectMssql(sql_RTNHT_all);

    // 每個 dbmes.query 似乎返回 [rows, fields]，所以我們要取出 rows
    const formationData = formationArray[0];
    const capacityData = capacityArray[0];
    const edgeFoldingData = edgeFoldingArray[0];
    const sortingData = sortingArray[0];

    // MSSQL 撈出來 HTaging , RTaging 資料
    const agingData = agingArray && agingArray[0] ? agingArray[0] : {};

    // 化成
    const formation = {
      deviceCount: 2,
      staffCount: 2,
      WO: "MW2008A",
      auto_count_1: formationData[0]?.formationcathode_capacity_01 || 0, // 一期
      auto_count_2: formationData[0]?.formationcathode_capacity_02 || 0, // 二期
    };

    // 分容
    const Capacity_Check = {
      deviceCount: 2,
      staffCount: 2,
      WO: "MW2008A",
      auto_count_1: capacityData[0]?.formationcathode_capacity_01 || 0, // 一期
      auto_count_2: capacityData[0]?.formationcathode_capacity_02 || 0, // 二期
    };

    // 精封
    const edgeFolding = {
      deviceCount: 2,
      staffCount: 2,
      WO: edgeFoldingData[0]?.cellNO?.substring(0, 7) || "", // 取前7碼當工單
      auto_count_1: edgeFoldingData[0]?.edgeFolding_auto_count_1 || 0, // 精封機出料自動寫入
      auto_count_2: edgeFoldingData[0]?.edgeFolding_auto_count_2 || 0, // 精封機出料自動寫入二期
      handmade_count: edgeFoldingData[0]?.edgeFolding_handmade_count || 0, // 人工作業
    };

    // 分選
    const sorting = {
      deviceCount: 2,
      staffCount: 2,
      WO: sortingData[0]?.sortingWO?.substring(0, 7) || "",
      capacity: sortingData[0]?.sortingCapacity || 0,
    };

    const ht_aging = {
      deviceCount: 1,
      staffCount: 1,
      WO: agingData?.WO_RT?.substring(0, 7) || "",
      capacity: agingData?.H_COUNT || 0,
      template: "44.8℃",
    };

    const rt_aging = {
      deviceCount: 1,
      staffCount: 1,
      WO: agingData?.WO_RT?.substring(0, 7) || "",
      auto_count_1: agingData?.N_COUNT_01 || 0,
      auto_count_2: agingData?.N_COUNT_02 || 0,
      template: "25.3℃",
    };

    finalSend.push({
      formation,
      Capacity_Check,
      edgeFolding,
      sorting,
      ht_aging,
      rt_aging,
    });

    res.status(200).json({
      message: "有成功call到 api ",
      data: finalSend,
    });
  } catch (error) {
    console.error("API錯誤詳細信息:", error);
    res.status(500).json({
      message: "沒有對接到api",
      error: error.message,
      details: error.stack,
    });
  }
});

async function notify_MesAll_side_amount(start_dt_range, end_dt_range) {
  let datetype;
  console.log(`Mes總產能統計：從 ${start_dt_range} 到 ${end_dt_range}`);
  const config_Discord = {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${process.env.discord_botToken}`,
    },
  };
  // 從模板產出 SQL 陣列
  const sqlArray = sqlTemplates.map((t) =>
    t.getSQL(start_dt_range, end_dt_range)
  );
  // 使用之前的工具函數執行
  const [
    mixingResult,
    coatingResult,
    roll_slit_Result,
    cuttingResult,
    assemblyResult,
    stackingResult,
    ovenResult,
    injectionResult,
    PFResult,
    CCResult,
    EdgeResult,
    SultingResult,
  ] = await runQueryWithDelay(sqlArray, dbmes, 1000);

  // console.log(
  //   "正負極(混漿)產能(批號數量):" + JSON.stringify(mixingResult, null, 2)
  // );

  // console.log(
  //   "正負極(塗佈)產能(執行總全mm,loss耗損mm):" +
  //     JSON.stringify(coatingResult, null, 2)
  // );

  // console.log(
  //   "正負極(輾壓/分切)產能:" + JSON.stringify(roll_slit_Result, null, 2)
  // );
  // console.log("正負模切產能:" + JSON.stringify(cuttingResult, null, 2));
  // console.log("入殼站產能:" + JSON.stringify(assemblyResult, null, 2));
  // console.log("疊片站產能:" + JSON.stringify(stackingResult, null, 2));
  // console.log("大烘箱極片站產能:" + JSON.stringify(ovenResult, null, 2));
  // console.log("注液站產能:" + JSON.stringify(injectionResult, null, 2));
  // console.log("PF化成站產能:" + JSON.stringify(PFResult, null, 2));
  // const Factor =
  //           type === "rollingCathode"
  //             ? 0.216
  //             : type === "rollingAnode"
  //             ? 0.034
  //             : 1; // 用於換算損料長度
  //         const lostLength = lostWeight / Factor; // 損料長度(統整)

  // 混漿批量數量/實際工作序最新的lotNO
  let mixingCathnode_lotbat_num = [],
    mixingAnode_lotbat_num = [],
    mixingCathnode_lot_seriallist = [],
    mixingAnode_lotbat_seriallist = [];

  // 塗佈/輾壓/分切 取得總生產米數/耗損米數
  let coaterCathode_All_length = [],
    coaterCathode_All_Ross_length = [],
    coaterAnode_All_length = [],
    coaterAnode_All_Ross_length = [],
    coater_efficiency = [];

  let rolling_All_length = [],
    sliting_All_RL_length = [],
    rolling_All_Ross_length = [],
    sliting_All_RL_Ross_length = [],
    rolling_efficiency = [],
    sliting_efficiency = [],
    roll_slit_run,
    check_table = false;
  for (let k = 0; k < Roll_Slit_NameArray.length; k++) {
    // k 0~1 輾壓 / 2~3 分切
    const roll_slit_search_table = Roll_Slit_NameArray[k];
    for (let t = 0; t < roll_slit_Result.length; t++) {
      roll_slit_run = roll_slit_Result[t];
      if (roll_slit_run && roll_slit_run.srcTable === roll_slit_search_table) {
        check_table = true;
        break;
      }
    }
    const roll_slit_table = roll_slit_run?.srcTable;
    // console.log("第" + k + "項   check_table = " + check_table);
    if (!check_table) {
      if (k <= 1) {
        rolling_All_length.push("0");
        rolling_All_Ross_length.push("0");
        rolling_efficiency.push("0%");
      } else {
        sliting_All_RL_length.push("0");
        sliting_All_RL_Ross_length.push("0");
        sliting_efficiency.push("0%");
      }
    } else {
      //正負輾壓(先正後負)
      if (
        roll_slit_table.includes("cathode_rolling") ||
        roll_slit_table.includes("anode_rolling")
      ) {
        const total_length = safeParseFloat(roll_slit_run?.rollingLength);
        const total_Loss_weight = safeParseFloat(
          roll_slit_run?.rolling_LostWeight
        );
        rolling_All_length.push(total_length);
        //   type === "rollingCathode"
        //             ? 0.216
        //             : type === "rollingAnode"
        //             ? 0.034
        //             : 1; // 用於換算損料長度
        rolling_All_Ross_length.push(
          isNaN(total_Loss_weight)
            ? 0.0
            : k === 0
            ? parseFloat(total_Loss_weight / 0.216).toFixed(2)
            : parseFloat(total_Loss_weight / 0.034).toFixed(2)
        );
        //計算效率
        const efficiency =
          total_length > 0
            ? ((total_length - total_Loss_weight) / total_length) * 100
            : 0; // 良率(統整)
        rolling_efficiency.push(efficiency.toFixed(2) + "%");
      } //正負分切(先正後負)
      else if (
        roll_slit_table.includes("cathode_slitting") ||
        roll_slit_table.includes("anode_slitting")
      ) {
        const total_R_length = safeParseFloat(roll_slit_run?.Length_R);
        const total_L_length = safeParseFloat(roll_slit_run?.Length_L);
        const total_sum_R_L_length = parseFloat(
          total_R_length + total_L_length
        ).toFixed(2);
        const total_Loss_R_weight = safeParseFloat(roll_slit_run?.LostWeight_R);
        const total_Loss_L_weight = safeParseFloat(roll_slit_run?.LostWeight_L);
        const total_sum_R_L_weight = parseFloat(
          total_Loss_R_weight + total_Loss_L_weight
        ).toFixed(2);
        // type === "slittingCathode"
        //         ? 0.108
        //         : type === "slittingAnode"
        //         ? 0.067
        //         : 1; // 用於換算損料長度，預設為1避免除以null
        const total_Loss_All_length = isNaN(total_sum_R_L_weight)
          ? 0.0
          : k === 2
          ? parseFloat(total_sum_R_L_weight / 0.108).toFixed(2)
          : parseFloat(total_sum_R_L_weight / 0.067).toFixed(2);
        //分切左右總長度(相加) , 分切左右總後耗損長度(左右加總重量除於/比值)
        sliting_All_RL_length.push(total_sum_R_L_length);
        sliting_All_RL_Ross_length.push(
          isNaN(total_Loss_All_length) ? 0.0 : total_Loss_All_length
        );
        //計算效率
        const efficiency =
          total_sum_R_L_length > 0
            ? ((total_sum_R_L_length - total_sum_R_L_weight) /
                total_sum_R_L_length) *
              100
            : 0; // 良率(統整)
        sliting_efficiency.push(efficiency.toFixed(2) + "%");
      }
    }
    check_table = false;
  }
  //確認正負極輾壓/分切 產能
  // console.log("確認正負極輾壓/分切 產能▽");
  // console.log("正負極輾壓總長度(mm)" + rolling_All_length);
  // console.log("正負極輾壓耗損總長度(mm)" + rolling_All_Ross_length);
  // console.log("正負極輾壓產能效率(%)" + rolling_efficiency);
  // console.log("正負極分切(R.L)總長度(mm)" + sliting_All_RL_length);
  // console.log("正負極分切(R.L)耗損總長度(mm)" + sliting_All_RL_Ross_length);
  // console.log("正負極分切(R.L)產能效率(%)" + sliting_efficiency);

  //計算(正負極)塗佈良率( (總生產米數扣除耗損)/(總生產米數)*100% )-------start--------------
  //@@塗佈良率計算
  //(+)
  const coatCath_Alength = safeParseFloat(
    coatingResult[0]?.coaterCathode_meter_sum ?? parseFloat("0").toFixed(1)
  );
  const coatCath_ALosslength = safeParseFloat(
    coatingResult[0]?.coaterCathode_lost_sum ?? parseFloat("0").toFixed(1)
  );

  //計算效率
  const coatingCath_efficiency =
    coatCath_Alength > 0
      ? ((coatCath_Alength - coatCath_ALosslength) / coatCath_Alength) * 100
      : 0; // 良率(統整)
  coater_efficiency.push(coatingCath_efficiency.toFixed(2) + "%");

  //(-)
  const coatAn_Alength = safeParseFloat(
    coatingResult[0]?.coaterAnode_meter_sum ?? parseFloat("0").toFixed(1)
  );
  const coatAn_ALosslength = safeParseFloat(
    coatingResult[0]?.coaterAnode_lost_sum ?? parseFloat("0").toFixed(1)
  );

  //計算效率
  const coatingAn_efficiency =
    coatAn_Alength > 0
      ? ((coatAn_Alength - coatAn_ALosslength) / coatAn_Alength) * 100
      : 0; // 良率(統整)
  coater_efficiency.push(coatingAn_efficiency.toFixed(2) + "%");

  // console.log(
  //   "塗佈+ 總長/耗損 -> " +
  //     coatCath_Alength +
  //     " / " +
  //     coatCath_ALosslength +
  //     "\r\n" +
  //     "塗佈- 總長/耗損 -> " +
  //     coatAn_Alength +
  //     " / " +
  //     coatAn_ALosslength
  // );

  // coater_efficiency.forEach((item, index) => {
  //   console.log(`塗佈${index === 0 ? "正極" : "負極"}效率:`, item);
  // });

  //計算(正負極)塗佈良率-------end--------------

  const Mixing_Cath_lot_sum = Number(mixingResult[0]["cathode_batch_count"]);
  const Mixing_Cath_LastNew_lot = mixingResult[0]?.ca_lot_serial_list
    ? mixingResult[0]?.ca_lot_serial_list.split(",")[0]
    : "";

  const Mixing_Anode_lot_sum = Number(mixingResult[0]["anode_batch_count"]);
  const Mixing_Anode_LastNew_lot = mixingResult[0]?.an_lot_serial_list
    ? mixingResult[0]?.an_lot_serial_list.split(",")[0]
    : "";

  // console.log(
  //   "正極混漿批號數量 =" +
  //     Mixing_Cath_lot_sum +
  //     " 正混lot最新:" +
  //     Mixing_Cath_LastNew_lot +
  //     " 負極混漿批號數量=" +
  //     Mixing_Anode_lot_sum +
  //     " 負混lot最新:" +
  //     Mixing_Anode_LastNew_lot
  // );

  const Cutting_Cath_sum = Number(cuttingResult[0]["良品總計"]);
  const Cutting_Cath_mannul_sum = Number(cuttingResult[1]["良品總計"]);
  const Cutting_Anode_sum = Number(cuttingResult[2]["良品總計"]);
  const Cutting_Anode_mannul_sum = Number(cuttingResult[3]["良品總計"]);
  // console.log(
  //   "模切+正極產能 -> 自動:" +
  //     Cutting_Cath_sum +
  //     " 手動:" +
  //     Cutting_Cath_mannul_sum
  // );
  // console.log(
  //   "模切-負極產能 -> 自動:" +
  //     Cutting_Anode_sum +
  //     " 手工:" +
  //     Cutting_Anode_mannul_sum
  // );
  const PLCE_PRODUCESUM = assemblyResult[0]["result"];
  const PLCE_PRODUCESUM_2 = assemblyResult[1]["result"];
  // console.log(
  //   "入殼站產能 -> 一期: " + PLCE_PRODUCESUM + " 二期: " + PLCE_PRODUCESUM_2
  // );
  const Stack_full_SUM = stackingResult[0]["result"];
  const Stack2_new_SUM = stackingResult[1]["result"];
  // console.log(
  //   "疊片站總產能 -> 一期(3~5)+二期(6~9):" +
  //     Stack_full_SUM +
  //     " 二期新(1~3):" +
  //     Stack2_new_SUM
  // );
  //電芯大烘箱 (入庫和出庫)
  const Oven_lage_In_SUM = ovenResult[0]["oven_industrial_in_out"];
  const Oven_lage_Out_SUM = ovenResult[1]["oven_industrial_in_out"];
  // console.log(
  //   "電芯大烘箱站 總入庫量->:" +
  //     Oven_lage_In_SUM +
  //     " 總出庫量->:" +
  //     Oven_lage_Out_SUM
  // );
  //注液站產能 (一二期)
  const injection_one_sum = injectionResult[0]["injection_one_aoumt"];
  const injection_two_sum = injectionResult[0]["injection_two_aoumt"];
  // console.log(
  //   "注液站產量->  一期:" + injection_one_sum + " 二期:" + injection_two_sum
  // );
  //化成(一,二期)
  const Pf_Seci_sum = PFResult[0]["Seci_BarcodeCell_total"];
  const Pf_Chroma_sum = PFResult[0]["Chroma_BarcodeCell_total"];
  // console.log(
  //   "化成站產量->  Seci一期:" + Pf_Seci_sum + " Chroma二期:" + Pf_Chroma_sum
  // );
  //分容(一,二期)
  const CC1_Seci_One_Sum = CCResult[0]["Seci_Cell_CC1_one"];
  const CC2_Seci_One_Sum = CCResult[0]["Seci_Cell_CC2_one"];
  const CC1_Chroma_Two_Sum = CCResult[0]["Chroma_Cell_CC1_two"];
  const CC2_Chroma_Two_Sum = CCResult[0]["Chroma_Cell_CC2_two"];
  // console.log(
  //   "分容站產量->  Seci(一期CC1,CC2):" +
  //     CC1_Seci_One_Sum +
  //     " " +
  //     CC2_Seci_One_Sum +
  //     " Chroma(二期CC1,CC2):" +
  //     CC1_Chroma_Two_Sum +
  //     " " +
  //     CC2_Chroma_Two_Sum
  // );
  //精封站(一,二期)
  const Edge_One_Sum = EdgeResult[0]["SumofCellNo"];
  const Edge_Two_Sum = EdgeResult[1]["SumofCellNo"];
  // console.log("精封站產量->  一期:" + Edge_One_Sum + " 二期:" + Edge_Two_Sum);
  //分選判別站(CC2)
  const sulting_amount_sum = SultingResult[0]["Sulting_total_sum"];
  // console.log("分選判別(CC2)產量-> " + sulting_amount_sum);
  //高溫倉(一期) , 常溫倉(一,二期) ,使用MSSQL查詢
  try {
    // 從共用模組取得 MSSQL 連線池
    const pool = await mssql.connect(MS_dbConfig);
    const query = `
        select count(*) AS cell_HT_num from ITFC_MES_UPLOAD_STATUS_TB where 1=1 and replace(convert(nvarchar(100),create_date,120),'.','-') between '${start_dt_range}' AND '${end_dt_range}' and BIN_CODE like 'H%' and type=4 and BOX_BATT <> 'NANANANANANA' \
        select count(*) AS cell_RT_1_period_num from ITFC_MES_UPLOAD_STATUS_TB where 1=1 and replace(convert(nvarchar(100),create_date,120),'.','-') between '${start_dt_range}' AND '${end_dt_range}' \
        and BIN_CODE like 'N%' and type=4 and BOX_BATT <> 'NANANANANANA'; \
        select count(*) AS cell_RT_2_period_num from ITFC_MES_UPLOAD_STATUS_TB where 1=1  and replace(convert(nvarchar(100),create_date,120),'.','-') between '${start_dt_range}' AND '${end_dt_range}' \
        and BIN_CODE like 'N2%' and type=4 and BOX_BATT <> 'NANANANANANA';
    `;
    // 使用 pool 進行查詢操作等
    const result = await pool.request().query(query);
    HT_RT_PLCECELL_Sum.length = 0;
    // console.log("MS result:" + JSON.stringify(result, null, 2));
    for (let i = 0; i < 3; i++) {
      result.recordsets[i].map((row) => {
        i === 0
          ? HT_RT_PLCECELL_Sum.push(row.cell_HT_num)
          : i === 1
          ? HT_RT_PLCECELL_Sum.push(row.cell_RT_1_period_num)
          : HT_RT_PLCECELL_Sum.push(row.cell_RT_2_period_num);
      });
    }
    // console.log("高溫,常溫(一期,二期)產能為:" + HT_RT_PLCECELL_Sum);
    // 連線池由共用模組管理，無需在此關閉


    //將MES(前中後段)站別產能資訊傳送DISCORD 通報
    const now_send = moment().tz("Asia/Taipei"); // 用指定時區的當下時間
    // 解析時間字串成 Date 物件
    const date = new Date(now_send);
    // 取得小時（0-23）
    const hours = date.getHours();
    // 判斷時段
    if (hours < 12) {
      datetype = "早上AM-Morning";
    } else {
      datetype = "晚上PM-Evening";
    }
    const message = `
    #前中後段生產通報#
    ${datetype} 通知日期時間為: ${now_send}
    Mes總產能統計：從 ${start_dt_range} 到 ${end_dt_range}    
    ----------------
    ⚗️ 前段:
    正負極混漿批號生產數量->  正(+)提交量:${Mixing_Cath_lot_sum}  負(-)提交量:${Mixing_Anode_lot_sum}   
    正負極混漿處理最新批號->  正(+)最新lotNo:${Mixing_Cath_LastNew_lot}  負(-)最新lotNo:${Mixing_Anode_LastNew_lot}
    正負極塗佈總長度(mm)-> ${coatCath_Alength} , ${coatAn_Alength}
    正負極塗佈耗損總長度(mm)-> ${coatCath_ALosslength} , ${coatAn_ALosslength}
    正負極塗佈產能效率(%)-> ${coater_efficiency[0]} , ${coater_efficiency[1]}
    正負極輾壓總長度(mm)-> ${rolling_All_length}
    正負極輾壓耗損總長度(mm)-> ${rolling_All_Ross_length}
    正負極輾壓產能效率(%)-> ${rolling_efficiency}
    正負極分切(R.L)總長度(mm)-> ${sliting_All_RL_length}
    正負極分切(R.L)耗損總長度(mm)-> ${sliting_All_RL_Ross_length}
    正負極分切(R.L)產能效率(%)-> ${sliting_efficiency}
    🏗️ 中段:
    模切+正極產能(良品)-> 自動:${Cutting_Cath_sum} 手動:${Cutting_Cath_mannul_sum}
    模切-負極產能(良品)-> 自動:${Cutting_Anode_sum} 手動:${Cutting_Anode_mannul_sum}              
    入殼站產能 -> 一期: ${PLCE_PRODUCESUM} 二期: ${PLCE_PRODUCESUM_2}
    疊片站總產能 -> 一期(3~5)+二期(6~9): ${Stack_full_SUM}  二期新(1~3): ${Stack2_new_SUM}
    電芯大烘箱站 總入庫量->:${Oven_lage_In_SUM}  總出庫量->:${Oven_lage_Out_SUM}
    注液站產量->  一期:${injection_one_sum}  二期:${injection_two_sum}
    🔋 後段:
    化成站產量->  Seci一期: ${Pf_Seci_sum}  Chroma二期: ${Pf_Chroma_sum}  
    分容站產量->  Seci(一期CC1,CC2):${CC1_Seci_One_Sum} , ${CC2_Seci_One_Sum} Chroma(二期CC1,CC2): ${CC1_Chroma_Two_Sum} , ${CC2_Chroma_Two_Sum}
    高溫,常溫(一期,二期)產能為:${HT_RT_PLCECELL_Sum}
    精封站產量->  一期: ${Edge_One_Sum} 二期: ${Edge_Two_Sum}
    分選判別(CC2)產量-> ${sulting_amount_sum}
    ----------------
      `;
    const MesNotify_Product_REQUEST_URL = `${process.env.discord_Mes_front_middle_backend}`;
    await axios.post(
      // "https://notify-api.line.me/api/notify",
      MesNotify_Product_REQUEST_URL,
      { content: message },
      config_Discord
    );
    console.log("MES前中後段生產通報提交內容已經委託DisCord");
  } catch (err) {
    console.error("Error connecting to MSSQL Server:", err);
  }
}

// 註冊通知Mes各站總產能行程
function register_mes_notify({ h, m, s, title, timezone }) {
  const rule = { hour: h, minute: m, second: s };
  schedule.scheduleJob(rule, () => {

    const currentIP = getServerIP();
    const allowedIP = '192.168.3.207';
    
    if (currentIP !== allowedIP) {
        console.log(`[排程保護] 目前伺服器 IP: ${currentIP}，只允許在 ${allowedIP} 執行。任務已跳過。`);
        return;
    }
    const now = moment().tz(timezone); // 用指定時區的當下時間
    let start_dt_range, endTime;
    if (title.includes("AM_Morning")) {
      // 計算昨晚 20:00 到今天早上 08:00
      start_dt_range = moment(now)
        .subtract(1, "day")
        .set({ hour: 20, minute: 0, second: 0 });
      endTime = moment(now).set({ hour: 8, minute: 0, second: 0 });
    } else if (title.includes("PM_Evening")) {
      // 計算今天 08:00 到 20:00
      start_dt_range = moment(now).set({ hour: 8, minute: 0, second: 0 });
      endTime = moment(now).set({ hour: 20, minute: 0, second: 0 });
    } else {
      console.warn(`⚠️ 未知的查詢班別間距時段: ${title}`);
      return;
    }
    console.log(`✅ [${title}] 任務執行於 ${now}`);
    notify_MesAll_side_amount(
      start_dt_range.format("YYYY-MM-DD HH:mm:ss"),
      endTime.format("YYYY-MM-DD HH:mm:ss")
    );
  });
}
// 註冊所有Mes產能通報的排程


// timeConfigs.forEach((config) => {
//   register_mes_notify(config);
// });
function safeParseFloat(value, defaultValue = 0) {
  if (value == null) return defaultValue;

  // 轉成字串並移除千分位逗號
  const cleaned = String(value).replace(/,/g, ""); //移除千分位逗號
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? defaultValue : parsed;
}
// 延遲函數
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function runQueryWithDelay(sqlArray, db, delayMs = 1000) {
  const results = [];
  for (let i = 0; i < sqlArray.length; i++) {
    const sql = sqlArray[i];
    const [rows] = await db.query(sql);
    results.push(rows);
    // 如果不是最後一個查詢，才延遲
    if (i < sqlArray.length - 1) {
      await delay(delayMs);
    }
  }
  return results;
}

router.get("/dataMemberList", async (req, res) => {
  let result = {};

  // 根據現在時間動態生成 WHERE time 條件函數
  function getTimeCondition(now, columnName = "Time") {
    const taipeiTime = moment(now).tz("Asia/Taipei");
    const hour = taipeiTime.hour();
    let startTime, endTime;
    if (hour >= 8 && hour < 20) {
      // 早班: 8:00 - 20:00
      startTime = taipeiTime.clone().set({ hour: 8, minute: 0, second: 0 });
      endTime = taipeiTime.clone().set({ hour: 20, minute: 0, second: 0 });
    } else {
      // 晚班: 20:00 - 次日8:00
      startTime = taipeiTime.clone().set({ hour: 20, minute: 0, second: 0 });
      endTime = taipeiTime
        .clone()
        .add(1, "day")
        .set({ hour: 8, minute: 0, second: 0 });
    }
    return `${columnName} >= '${startTime.format(
      "YYYY-MM-DD HH:mm:ss"
    )}' AND ${columnName} < '${endTime.format("YYYY-MM-DD HH:mm:ss")}'`;
  }

  const mixingTime = getTimeCondition(new Date(), "BatchStart");

  // 查詢塗佈正極人員
  const sql_mixing_cathode = `
    SELECT DISTINCT Member01_No AS mixing_cathode_MemberList
    FROM mixingcathode_batch
    WHERE ${mixingTime}
      AND Member01_No IS NOT NULL AND Member01_No != ''
  `;
  // 查詢塗佈負極人員
  const sql_mixing_anode = `
    SELECT DISTINCT Member01_No AS mixing_anode_MemberList
    FROM mixinganode_batch
    WHERE ${mixingTime}
      AND Member01_No IS NOT NULL AND Member01_No != ''
  `;

  try {
    const [cathodeRows, anodeRows] = await Promise.all([
      dbmes.query(sql_mixing_cathode),
      dbmes.query(sql_mixing_anode),
    ]);

    let mixing_cathode = cathodeRows[0].map(
      (person) => person.mixing_cathode_MemberList
    );
    let mixing_anode = anodeRows[0].map(
      (person) => person.mixing_anode_MemberList
    );

    console.log("mixing_cathode  :", mixing_cathode);
    console.log("mixing_Anode  : ", mixing_anode);

    result = {
      mixing_cathode: mixing_cathode,
      mixing_anode: mixing_anode,
    };

    console.log("result :", result);

    res.status(200).json({
      message: "有成功call到 api ",
      data: result,
    });
  } catch (error) {
    console.error("API錯誤詳細信息:", error);
    res.status(500).json({
      message: "網路問題 未正確連接到api ",
      error: error.message,
      details: error.stack,
    });
  }
});

module.exports = router;
