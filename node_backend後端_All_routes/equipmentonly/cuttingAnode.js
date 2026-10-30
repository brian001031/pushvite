require("dotenv").config();
const express = require("express");
const router = express.Router();
const db2 = require(__dirname + "/../../modules/mysql_connect.js");
const XLSX = require("xlsx");
const moment = require("moment-timezone");
const dayjs = require("dayjs");

router.get("/updatepage", async (req, res) => {
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

router.get("/groupname_capacitynum", async (req, res) => {
  const { machineoption, endDay } = req.query;
  console.log("machineoption :", machineoption, "endDay :", endDay);

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
      sql = `SELECT case WHEN SUM( Prdouction ) is NULL then '0' 
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
      machineoption: machineoption,
    });
  }

  try {
    // 計算總體產能
    const [rowsToday] = await db2.query(sql, [startDay, endDayToTranslate]);
    const [rows] = await db2.query(sql, [endDay, endDayToTranslate]);
    const [staffRows] = await db2.query(sql_Staff, [
      startDay,
      endDayToTranslate,
    ]);

    console.log("modifucation :", modifucation);

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
      morningShiftCapacity_first_result:
        morningShiftRows[0]?.[modifucation] || 0,
      staffRows: staffRows || [],
    };

    res.status(200).json([dataToSend]);
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

//收集全機台當天生產產能數據回傳前端
router.get("/fullmachinecapacity", async (req, res) => {
  const { currentDay } = req.query;

  const current = dayjs(currentDay);
  const previousDay = current.subtract(1, "day").format("YYYY-MM-DD");
  const nextDay = current.add(1, "day").format("YYYY-MM-DD");

  // 時間點 定義 (昨晚8點~今早8點,今早8點~今晚8點,今晚8點~明早8點)
  const lastnightStart = previousDay + " 20:00:00";
  const morningStart = currentDay + " 08:00:00";
  const morningEnd = currentDay + " 20:00:00";
  const nextnightEnd = nextDay + " 08:00:00";

  const shifts = [
    [lastnightStart, morningStart],
    [morningStart, morningEnd],
    [morningEnd, nextnightEnd],
  ];

  const datetime_range_Sql = shifts
    .map(([start, end]) => {
      return `WHEN TIME BETWEEN '${start}' AND '${end}' THEN '${start}~${end}'`;
    })
    .join("\n    ");

  const Anode_full_Pass_SQL = `
        WITH base_run_stable AS (
            SELECT 
                TIME,
                CASE
                    WHEN OKNGSelection = '良品' AND Prdouction IS NOT NULL THEN Prdouction
                    WHEN OKNGSelection = '手工良品' 
                        AND ManualInput IS NOT NULL 
                        AND ManualInput <> '' 
                        AND ManualInput <> 'NA'
                    THEN CAST(ManualInput AS SIGNED)
                    ELSE 0
                END AS 'Qty_Good'
            FROM mes.cutting_bath
            WHERE Caseno LIKE 'B%'
                AND TIME BETWEEN '${shifts[0][0]}' AND '${
    shifts[shifts.length - 1][1]
  }')
         
         SELECT 
            CASE
                ${datetime_range_Sql}
            END AS time_range,
            SUM(Qty_Good) AS 總計
            FROM base_run_stable
            GROUP BY time_range
            ORDER BY time_range;
        `;

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

    //計算班別產能
    const [anode_shift_range_amount] = await db2.query(Anode_full_Pass_SQL);

    const anode_dt_range_result = {};

    // 補齊沒出現的時間區間
    // shifts.map(([start, end], index) => {
    //   const dt_range_key = `${start}~${end}`;
    //   const map_dt_between = anode_shift_range_amount.find(
    //     (r) => r.time_range === dt_range_key
    //   );
    //   //   console.log(
    //   //     "index = " + index + " : " + dt_range_key + " : ",
    //   //     map_dt_between
    //   //   );

    //   if (index === 0) {
    //     phase = "昨晚班";
    //   } else if (index === 1) {
    //     phase = "今早班";
    //   } else if (index === 2) {
    //     phase = "今晚班";
    //   }
    //   const key = `負極模切站-${phase}總產能`;
    //   const total = map_dt_between ? map_dt_between.總計 : 0;
    //   anode_dt_range_result[key] = total;
    // });

    //另外方法
    // STEP 1: 將結果轉為 key-value 物件
    const map_dt_between = Object.fromEntries(
      anode_shift_range_amount.map((obj) => [obj.time_range, obj])
    );
    // STEP 2: 遍歷班別時間段，填寫對應總產能
    shifts.forEach(([start, end], index) => {
      const key = `${start}~${end}`;
      const data = map_dt_between[key];

      const total = data?.["總計"] ?? 0;
      if (!data) {
        console.warn(`負極模切站 ⚠️ 無資料 for 時段: ${key}，預設為 0`);
      }

      anode_dt_range_result[
        `負極模切站-${["昨晚班", "今早班", "今晚班"][index]}總產能`
      ] = total;

      //   console.log(`index = ${index} : ${key} :`, data);
    });

    // console.log(
    //   "cathnode_dt_range_result :",
    //   JSON.stringify(anode_dt_range_result, null, 2)
    // );

    res.status(200).json({
      data: rows[0],
      Total_capacity_shift: anode_dt_range_result,
    });
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(500).json({
      message: "取得資料錯誤",
    });
  }
});

module.exports = router;
