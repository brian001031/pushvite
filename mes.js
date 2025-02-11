require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");
const dbms_pool = require(__dirname + "/../modules/mssql_newconnect.js");
const ms_newsql = require("mssql");
const axios = require("axios");
const { Sequelize } = require("sequelize");
const _ = require("lodash");
const { json } = require("body-parser");

let alldata = [];
let stringrunstatus = "";

let startoem_dt = "";
let endoem_dt = "";

let st_oem_currentday = "";
let end_oem_currentday = "";

// 獲取當前日期
let now = new Date();

// 取得當前年份、月份和日期
let nowyear = now.getFullYear();
let nowMonth = (now.getMonth() + 1).toString().padStart(2, "0"); // 月份從0開始，所以要加1
let nowdate = now.getDate().toString().padStart(2, "0");

const backendHT_RT_station = ["H.T.Aging", "R.T.Aging"];

let HT_Aging_mesdata = [];
let RT_Aging_mesdata = [];

const MS_dbConfig = {
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
};

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

//action (true/false) 控制MSSQL連結池開關 , platform 判斷站別 , query 提交查詢字串
async function connectToasrssvrASRS_HTBI(action, platform, query) {
  try {
    // 初始化連接池
    const pool = new ms_newsql.ConnectionPool(MS_dbConfig);

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
    let total_product = "";
    // 在這裡補充您的 SQL 查詢語句，以從資料庫中獲取區域資料
    const sql = "SELECT * FROM mes.injection_realtime ORDER BY ID DESC limit 1";

    // 假設您使用的是您的資料庫查詢函數或 ORM，這裡假設使用 db.query 函數
    const [rows] = await dbmes.query(sql);
    // const data = JSON.stringify(rows);
    // console.log("全部injection_realtime表單內容(最新一筆):" + rows);
    // 從查詢結果中提取所需的資料(ex:製令單號)
    const MES_ID = rows.map((row) => row.ID);
    const MES_MachineNO = rows.map((row) => row.MachineNO);
    const MES_WO = rows.map((row) => row.WO);
    const MES_PARAM06 = rows.map((row) => row.PARAM06);
    const MES_MachineStatus = rows.map((row) => row.MachineStatus);

    const MES_PARAM28 = rows.map((row) => row.PARAM28);
    const MES_PARAM29 = rows.map((row) => row.PARAM29);
    const MES_PARAM30 = rows.map((row) => row.PARAM30);

    const MES_PARAM38 = rows.map((row) => row.PARAM38);
    const MES_PARAM40 = rows.map((row) => row.PARAM40);
    const MES_proqty = rows.map((row) => row.PARAM42);

    let MES_paramtest = "";
    for (let c = 0; c < querycell_1_Item.length; c++) {
      //------測試 start-------
      // const randomNumber = (Math.random() * 5 + 1).toFixed(5);
      // // console.log("MES_PARAM06 = " + MES_PARAM06);
      // let summixnumber =
      //   parseFloat(MES_PARAM06).toFixed(5) - parseInt(randomNumber);
      // //針對設備運作狀態,顯示字串做判斷變化
      // changeruntime_display(parseInt(MES_MachineStatus));
      // MES_paramtest = MES_ID + "," + summixnumber + "," + stringrunstatus;
      //------測試 end-------

      //total_product = "";
      if (c === 0) {
        changeruntime_display(parseInt(MES_MachineStatus));
        // MES_paramtest +=
        //   MES_ID + "," + MES_PARAM06 + "," + stringrunstatus ;
        MES_paramtest +=
          MES_ID + "," + MES_MachineNO + "," + MES_WO + "," + MES_proqty;
        // } else if (c === 1) {
        //   MES_paramtest +=
        //     "," + MES_PARAM28 + "," + MES_PARAM29 + "," + MES_PARAM30;
        // } else if (c === 2) {
        //   MES_paramtest +=
        //     "," + MES_PARAM38 + "," + MES_PARAM40 + "," + MES_proqty;
      } else {
        // MES_paramtest += "," + "N/A" + "," + "N/A" + "," + "N/A" + "," + "N/A";
      }
    }

    // 將製令單號回傳給前端
    res.status(200).send(MES_paramtest);
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
    const sql_ass1 =
      "SELECT * FROM  assembly_realtime WHERE  1 = 1 ORDER BY  ID DESC LIMIT 1";

    // 假設您使用的是您的資料庫查詢函數或 ORM，這裡假設使用 db.query 函數
    const [rows] = await dbmes.query(sql_ass1);

    const sql_ass2 = `SELECT  count(DISTINCT PLCCellID_CE) AS result, 'PLCCellID_total' AS type FROM  assembly_batch WHERE  1 = 1 AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' 
      UNION ALL SELECT count(Distinct MachineNO),'onlineequipment' FROM mes.assembly_batch  where 1 = 1 AND TIME BETWEEN '${st_oem_currentday}'  AND '${end_oem_currentday}'`;

    // console.log(sql_ass2);
    // console.log("sql2= " + sql2);
    const [MES_proqty] = await dbmes.query(sql_ass2);

    const PLCE_PRODUCESUM = MES_proqty[0]["result"];
    const MES_equstack_online_qty = MES_proqty[1]["result"];

    const sql_ass3 =
      "SELECT count(DISTINCT OPNO),count(DISTINCT MachineNO) FROM assembly_batch";

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
    const MES_ID = rows.map((row) => row.ID);
    const MES_PLCWO = rows.map((row) => row.WONO);
    const refix_MES_PLCWO = MES_PLCWO[0].replace(/[\s\W]+/g, ""); //將空白及符號部分過濾掉
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

    const PLCE_PRODUCESUM2 = MES_proqty_PLCE[0]["result"];
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
      row.WONO === "" || row.WONO === null ? "尚未產生" : row.WONO
    );

    // if (MES_StackWO === "") {
    //   MES_StackWO = "尚未產生";
    //   console.log("MES_StackWO 修改為= " + MES_StackWO);
    // }

    const sql_Stack2 = `SELECT count(DISTINCT PLCCellID_CE) FROM  stacking_batch WHERE  1 = 1  AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}' AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''`;

    const [MES_Stack_PLCE] = await dbmes.query(sql_Stack2);
    const PLCE_PRODUCE_Stack =
      MES_Stack_PLCE[0]["count(DISTINCT PLCCellID_CE)"];

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

    //Cathode 正極
    const MES_Cutting_Cath_lastID = MES_cutting_ID[0]["id"];
    const MES_Cutting_Cath_equipment_qty = 1;
    const MES_Cutting_Cath_equipment_onlineqty = 1;
    const MES_Cutting_Cath_op_online = MES_cutting_OP[1]["result"];
    const MES_Cutting_Cath_op_total = MES_cutting_OP[0]["result"];
    const MES_Cutting_CathStackWO = "尚未產生";
    const MES_Cutting_Cath_machine_passnum =
      MES_cutting_product_num[0]["良品總計"];
    const MES_Cutting_Cath_mannul_passnum =
      MES_cutting_product_num[1]["良品總計"];

    //Anode 負極
    const MES_Cutting_An_lastID = MES_cutting_ID[1]["id"];
    const MES_Cutting_An_equipment_qty = 1;
    const MES_Cutting_An_equipment_onlineqty = 1;
    const MES_Cutting_An_op_online = MES_cutting_OP[3]["result"];
    const MES_Cutting_An_op_total = MES_cutting_OP[2]["result"];
    const MES_Cutting_ANStackWO = "尚未產生";
    const MES_Cutting_An_machine_passnum =
      MES_cutting_product_num[2]["良品總計"];
    const MES_Cutting_An_mannul_passnum =
      MES_cutting_product_num[3]["良品總計"];
    //正負極模切站 部分 ------------end

    let MES_paramtest = "";
    for (let c = 0; c < querycell_2_Item.length; c++) {
      //total_product = "";

      //入殼站
      if (c === 3) {
        MES_paramtest =
          MES_ID +
          "|" +
          MES_equstack_online_qty +
          "/" +
          MES_equipstack_ment_qty1 +
          "|" +
          MES_Patqtystaff_qty1 +
          "|" +
          refix_MES_PLCWO +
          "|" +
          PLCE_PRODUCESUM;
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
      } else {
        MES_paramtest =
          "N/A" + "|" + "N/A" + "|" + "N/A" + "|" + "N/A" + "|" + "N/A";
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

    const Seci_chemosBarcodeSUM = MES_Format_barcode[0]["result"];
    const Chroma_chemosBarcodeSUM = MES_Format_barcode[1]["result"];
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

    const MES_chemosStackWO = "尚未產生";

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
      parseInt(Seci_CC1_one_total) + parseInt(Seci_CC2_one_total);

    const MES_capacity_two_sum =
      parseInt(Chroma_CC1_two_total) + parseInt(Chroma_CC2_two_total);

    // console.log("ALL_BarcodeSUM = " + ALL_BarcodeSUM);

    //先預設機台和操作人員數量,後續依據表單有提供數據再透過query索引

    const MES_cap_onlineequip_qty = 4;
    const MES_cap_stack_machineQty = 4;
    const MES_capstack_OP_qty = 4;
    const MES_capStackWO = "尚未產生";
    //Capacity-Check分容站 部分 -----------end

    // H.T. Aging(高溫倉靜置)部分使用之MSSQL -----------start
    const sql_HTAg_row = `SELECT TOP 1 * FROM ITFC_MES_UPLOAD_STATUS_TB WHERE BIN_CODE LIKE 'H%' ORDER BY ID DESC; 
      select count(*) AS cell_HT_product_num from ITFC_MES_UPLOAD_STATUS_TB where 1=1 and replace(convert(nvarchar(100),create_date,120),'.','-') between '${startoem_dt}' AND '${endoem_dt}' and BIN_CODE like 'H%' and type=4 and BOX_BATT <> 'NANANANANANA';`;

    //取得高溫倉靜置 工作序號,
    connectToasrssvrASRS_HTBI(strat, backendHT_RT_station[0], sql_HTAg_row);

    // console.log(HT_Aging_mesdata[0].ID);
    // console.log(HT_Aging_mesdata[1].cell_HT_product_num.toString());

    const MES_HT_Aging_ID = HT_Aging_mesdata[0].ID;
    const MES_HT_Aging_currentdat_amount =
      HT_Aging_mesdata[1].cell_HT_product_num.toString();

    const MES_HT_Agingstaff_qty = 1;
    const MES_HT_Agingequipment_qty = 1;
    const MES_HT_OnlineAgingstaff_qty =
      parseInt(HT_Aging_mesdata[1].cell_HT_product_num) === 0 ? 0 : 1;

    const MES_HT_OnlineAgingOP_qty = MES_HT_OnlineAgingstaff_qty.toString();
    const MES_HT_Agin_ALLgstack_OP_qty = 1;
    const MES_HT_AgingStackWO = "尚未產生";
    const MES_HT_AgingQtyinstock = "尚未產生";
    const MES_HT_temperature_ca = "尚未產生";

    // H.T. Aging(高溫倉靜置)部分 -----------end

    // R.T. Aging(常溫倉靜置)部分使用之MSSQL -----------start

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
      RT_Aging_mesdata[2].cell_RT1_Period_product_num.toString();
    const MES_RT2_Aging_currentdat_amount =
      RT_Aging_mesdata[3].cell_RT2_Period_product_num.toString();

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
    const MES_RT_AgingStackWO = "尚未產生";
    const MES_RT_AgingQtyinstock = "尚未產生";
    const MES_RT_temperature_ca = "尚未產生";

    // R.T. Aging(常溫倉靜置)部分 -----------end

    // Edge Folding(精封) -----------start

    const sql_edgeFolding =
      "SELECT * FROM beforeinjectionstage WHERE stageid='分選機前站'  ORDER BY ID DESC LIMIT 1";

    // const sql_edgeFolding = `
    // SELECT * FROM beforeinjectionstage WHERE stageid='分選機前站'  AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}'`;

    // const sql_edgeFolding_QTY_All = `
    // SELECT COUNT(DISTINCT cellNO) AS cellNO FROM beforeinjectionstage WHERE stageid='分選機前站' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}'`;
    const sql_edgeAllID =
      "SELECT * FROM (SELECT ID AS Edge_LastID, 'Edge_One_ID' AS type  FROM mes.beforeinjectionstage WHERE stageid='分選機前站' AND remark like '精封機出料自動化寫入'  ORDER BY ID DESC LIMIT 1 ) AS subEdge1 \
     UNION ALL  SELECT * FROM ( SELECT ID, 'Edge_Two_ID' AS type FROM mes.beforeinjectionstage WHERE stageid='分選機前站' AND remark like '精封機出料自動化寫入二期' ORDER BY ID DESC LIMIT 1) AS subEdge2";

    const sql_edgeFolding_QTY_All_test = `
    SELECT COUNT(DISTINCT cellNO) AS SumofCellNo , 'Edge_1_total' AS type FROM beforeinjectionstage WHERE stageid='分選機前站' AND remark like '精封機出料自動化寫入' AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt} '
    UNION ALL SELECT COUNT(DISTINCT cellNO) , 'Edge_2_total' FROM beforeinjectionstage WHERE stageid='分選機前站' AND remark like '精封機出料自動化寫入二期'  AND TIME BETWEEN '${startoem_dt}' AND '${endoem_dt}'`;

    // console.log(sql_edgeAllID);
    // console.log(sql_edgeFolding_QTY_All_test);

    const [row4] = await dbmes.query(sql_edgeFolding);
    // const edgeFoldingWorkPaper = row4[0].cellNO; // 生產工單
    const edgeFoldingWorkPaper = "尚未產生"; // 生產工單

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
    const MES_Edge_one_period_sum = row5[0]["SumofCellNo"];
    const MES_Edge_two_period_sum = row5[1]["SumofCellNo"];

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
          "/" +
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
      } else {
        MES_paramtest =
          "N/A" + "|" + "N/A" + "|" + "N/A" + "|" + "N/A" + "|" + "N/A";
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

module.exports = router;
