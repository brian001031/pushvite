require("dotenv").config();
const express = require("express");
const router = express.Router();
const db2 = require(__dirname + "/../../modules/mysql_connect.js");
const XLSX = require("xlsx");
const moment = require("moment-timezone");

const currentDate = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
const startoem_dt = moment().startOf("day").format("YYYY-MM-DD HH:mm:ss"); // 今天 00:00:00
const endoem_dt = moment().endOf("day").format("YYYY-MM-DD HH:mm:ss"); // 今天 23:59:59

async function confirm_group_xls(searid) {
  //先讀入電化學班表.xlsx
  const elecxlsx = process.env.electricxls;
  let workbook = XLSX.readFile(elecxlsx);
  let worksheet = workbook.Sheets["各站班表"];
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  console.log(range);
  const workData = [];
  for (let index = 2; index <= range.e.r + 1; index++) {
    try {
      // 确保单元格存在再访问其值
      const id = worksheet[`A${index}`].v;
      const name = worksheet[`B${index}`].v;
      const work = worksheet[`C${index}`].v;

      // const memberName = `SELECT memberName FROM hr_memberinfo where memberID = ${id}`;

      // console.log("memberName = " + memberName);

      // const [Name] = await db2.query(sqlopname);

      // searchclassname = mes_name;

      // console.log("操作機台姓名=" + searchclassname);

      //有鎖定到工號ID,在擷取對應之班別時段
      if (searid.includes(id)) {
        //console.log("have find!");
        searchclass = work;

        break;
      }

      //console.log("Reading record:", { id: id, name: name, work: work });
      //workData.push({ id: id, name: name, work: work });
    } catch (error) {
      console.error("Error reading record:", error);
    }
  }

  // const shiftMap = {};
  // workData.forEach((employee) => {
  //   shiftMap[employee.id] = employee.work;
  // });
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

async function change_update_mestable(machineselect) {
  let selectMachine = machineselect;
}

router.get("/updatepage", async (req, res) => {
  const { machineoption } = req.query;
  // console.log("machineoption接收為= " + machineoption);

  let sql; // 在 switch 語句外部定義 sql 變數
  let params = []; // 定義參數陣列

  switch (machineoption) {
    case "自動組立機":
      sql = `select * from mes.assembly_realtime WHERE REMARK = ? order by id desc limit 1 ;`;
      params = [machineoption];
      break;
    case "自動組立機二期":
      sql = `select * from mes.assembly_realtime WHERE REMARK = ? order by id desc limit 1;`;
      params = [machineoption];
      break;
    default:
      console.log("沒有符合的機台選項，請確認機台名稱");
      return res.status(400).send("Invalid machine option"); // 使用 return 避免後續程式碼執行
  }

  let sqlSearchName = `SELECT memberName FROM hr.hr_memberinfo WHERE memberID = ?`;

  try {
    const [rows] = await db2.query(sql, params);

    const row = rows[0];
    const OPNumber = String(row.OPNO).trim();

    const [searchName] = await db2.query(sqlSearchName, OPNumber);
    row.opName =
      searchName.length > 0 ? searchName[0].memberName : "無操作人員";

    res.status(200).json(rows);
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
        FROM mes.assembly_batch
    WHERE Time BETWEEN ? AND ?
  `;

  try {
    // 計算總體產能
    const [rowsToday] = await db2.query(sql, [startDay, endDayToTranslate]);
    const [rows] = await db2.query(sql, [endDay, endDayToTranslate]);

    // 計算昨天晚上8點到今天早上8點的產能 (晚班)
    const yesterday = moment()
      .tz("Asia/Taipei")
      .subtract(1, "day")
      .format("YYYY-MM-DD");
    const yesterdayEvening = `${yesterday} 20:00:00`;
    const todayMorning = `${currentDay} 08:00:00`;
    const [nightShiftRows] = await db2.query(sql, [
      yesterdayEvening,
      todayMorning,
    ]);

    // 計算今天早上8點到今天晚上8點的產能 (早班)
    const todayEvening = `${currentDay} 20:00:00`;
    const [morningShiftRows] = await db2.query(sql, [
      todayMorning,
      todayEvening,
    ]);

    const dataToSend = {
      todayCapacity_first_result: rowsToday[0].first_result ? rowsToday[0].first_result : 0,
      todayCapacity_second_result: rowsToday[0].second_result ? rowsToday[0].second_result : 0,
      selectedDayCapacity_first_result: rows[0].first_result ? rows[0].first_result : 0,
      selectedDayCapacity_second_result: rows[0].second_result ? rows[0].second_result : 0,
      nightShiftCapacity_first_result: nightShiftRows[0].first_result ? nightShiftRows[0].first_result : 0,
      nightShiftCapacity_second_result: nightShiftRows[0].second_result ? nightShiftRows[0].second_result : 0,
      morningShiftCapacity_first_result: morningShiftRows[0].first_result ? morningShiftRows[0].first_result : 0,
      morningShiftCapacity_second_result: morningShiftRows[0].second_result ? morningShiftRows[0].second_result : 0,
    };

    res.status(200).json([dataToSend]);
  } catch (error) {
    console.error("Error in /groupname_capacitynum:", error);
    res.status(500).send("Internal Server Error");
  }
});

//收集全機台當天生產產能數據回傳前端
router.get("/fullmachinecapacity", async (req, res) => {
  const { currentDay } = req.query;

  const startDay = currentDay + " 00:00:00";
  const endDayToTranslate = currentDay + " 23:59:59";

  // console.log(
  //   "startDay= " + startDay + " endDayToTranslate =  " + endDayToTranslate
  // );

  try {
    if (currentDay) {
      const assembly_result = {};
      //目前入殼站有1~2機台
      // 當日產能查詢
      let sqlAll = `
                    WITH Machines AS (
                        SELECT 'assembly1' AS Machine
                        UNION ALL
                        SELECT 'assembly2'
                        UNION ALL
                        SELECT 'assemblytotal'
                    ),
                    Production AS 
                    (
                      (
                        SELECT 
                        CASE 
                            WHEN REMARK IS NULL THEN 'assembly1'
                            WHEN REMARK = '二期' THEN 'assembly2'
                        END AS Machine,
                            COUNT(*) AS PLCCellID_CE_makenum
                        FROM mes.assembly_batch WHERE TIME BETWEEN ? AND ?                           
                            AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != '' AND (REMARK IS NULL OR REMARK = '二期')
                        GROUP BY CASE  WHEN REMARK IS NULL THEN 'assembly1'
                                        WHEN REMARK = '二期' THEN 'assembly2'
                        END
                      )
                      UNION ALL
                      (
                        SELECT 'assemblytotal' AS Machine, COUNT(*) AS PLCCellID_CE_makenum
                        FROM mes.assembly_batch
                        WHERE  TIME BETWEEN ? AND ?
                        AND PLCCellID_CE IS NOT NULL AND PLCCellID_CE != ''
                      )                                    
                    )                    
                    SELECT 
                        m.Machine,
                        COALESCE(p.PLCCellID_CE_makenum, 0) AS PLCCellID_CE_makenum
                    FROM Machines m
                    LEFT JOIN Production p ON m.Machine = p.Machine
                    ORDER BY m.Machine;
                    `;

      // 計算入殼站全機器,當天全部產能
      const [rows_fullmachine] = await db2.query(sqlAll, [
        startDay,
        endDayToTranslate,
        startDay,
        endDayToTranslate,
      ]);

      // console.log(
      //   "計算入殼站各機台當天全產能數據列為: " +
      //     rows_fullmachine.length +
      //     JSON.stringify(rows_fullmachine, null, 2)
      // );

      rows_fullmachine.forEach((item, index) => {
        const AssemblyNumber = parseInt(item.Machine.replace("assembly", ""));

        //計算全部機台總產能
        if (
          index === rows_fullmachine.length - 1 &&
          item.Machine === "assemblytotal"
        ) {
          const key = `入殼機台總產能`;
          assembly_result[key] = item.PLCCellID_CE_makenum;
        } else {
          //const phase = AssemblyNumber <= 5 ? "入殼一期機台" : "入殼二期機台";
          //確認為數字格式
          const sidealias = !isNaN(AssemblyNumber) ? "入殼機台" : "無法辨識";
          const key = `${sidealias}${AssemblyNumber}期`;
          assembly_result[key] = item.PLCCellID_CE_makenum;
        }
      });

      // console.log(
      //   "計算入殼站各機台當天全產能數據列為:" +
      //     JSON.stringify(assembly_result, null, 2)
      // );

      res.status(200).json({
        data: assembly_result,
      });
    }
  } catch (error) {
    console.error("Error in /fullmachinecapacity:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
