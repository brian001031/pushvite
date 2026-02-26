const express = require("express");
const router = express.Router();
// const db = require(__dirname + "/../modules/db_connect.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const moment = require("moment");
const ini = require("ini");
//引入excel套件
const XLSX = require("xlsx");
const multer = require("multer");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { auth } = require("googleapis/build/src/apis/abusiveexperiencereport");

let targetPath;

const mysql_config = require(__dirname + "/../modules/mysql_connect.js");


// const excellogpath = path.join(__dirname, "log/taskboard.xlsx");
// const iniFilePath = path.join(__dirname, "log/editnumcheck.ini");

const excellogpath = process.env.xls_log;
const iniFilePath = process.env.ini_edit;

// 獲取當前日期
let now = new Date();

// 取得當前年份、月份和日期
let nowyear = now.getFullYear();
let nowMonth = (now.getMonth() + 1).toString().padStart(2, "0"); // 月份從0開始，所以要加1
let nowdate = now.getDate().toString().padStart(2, "0");
let newSheetName = nowyear + "-" + nowMonth + "-" + nowdate;


//更新取得最新日期時間
setInterval(() => {
  now = new Date();
  // 取得當前年份、月份和日期
  nowyear = now.getFullYear();
  nowMonth = (now.getMonth() + 1).toString().padStart(2, "0"); // 月份從0開始，所以要加1
  nowdate = now.getDate().toString().padStart(2, "0");
  newSheetName = nowyear + "-" + nowMonth + "-" + nowdate;
  console.log(`current "${newSheetName}"  exist here!.`);

  //確認mysql連接狀態createpool有無異常
  disconnect_handler_Fix();
}, 21600000); // 每6小時执行一次(1000毫秒X21600)

// 配置 Multer 用於保存上傳檔案,直接執行寫入
const storage = multer.diskStorage({
  // const upload_filepath = `${process.env.UPLOAD_ANNOUNCE}`;
  // 將公告檔案保存在 Z:/Upload_Data
  destination: (req, file, cb) => {
    const dateFolder = `${nowyear}${nowMonth}${nowdate}`;

    targetPath = path.join(process.env.UPLOAD_ANNOUNCE, dateFolder);

    // 確保目錄存在，若不存在則建立
    fs.mkdirSync(targetPath, { recursive: true });
    cb(null, targetPath);
  },
  // 將文件名稱以binary
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const converted = Buffer.from(file.originalname, "latin1").toString(
      "utf-8"
    ); // 將文件名轉換為 URL 安全的格式

    // 彙整文件名稱
    const newFileName =
      converted !== file.originalname ? converted : `${file.originalname}`;
    cb(null, newFileName);
  },
});

// const upload = multer({ storage: storage });

dayjs.extend(utc);
dayjs.extend(timezone);

const formatDateToTaiwanTime = (date, format = "YYYY-MM-DD") => {
  if (!date) return "";
  return dayjs(date).tz("Asia/Taipei").format(format);
};

// 使用 memoryStorage 暫存檔案在 RAM 中，避免自動寫入硬碟
const upload = multer({ storage: multer.memoryStorage() });


const containsSpecialCharacters = (str) => {
  if (typeof str !== "string") {
    return false;
  }
  // 定義一個正則表達式來匹配特定的特殊符號
  const specialCharsRegex = /[,\"-]/;
  return specialCharsRegex.test(str);
};

const isNumber = (value) => {
  const num = Number(value);
  return !isNaN(num) && typeof num === "number";
};

function clearWorksheet(worksheet) {
  // 获取工作表的范围
  const range = XLSX.utils.decode_range(worksheet["!ref"]); // 获取当前工作表的范围
  for (let row = range.s.r; row <= range.e.r; ++row) {
    for (let col = range.s.c; col <= range.e.c; ++col) {
      const cellAddress = { c: col, r: row }; // 单元格地址
      const cellRef = XLSX.utils.encode_cell(cellAddress); // 单元格引用
      worksheet[cellRef] = undefined; // 清空单元格内容
    }
  }
  // 更新工作表范围，设置为空的范围
  worksheet["!ref"] = XLSX.utils.encode_range({
    s: { c: 0, r: 0 },
    e: { c: 0, r: 0 },
  });
}

async function backup_exist_taskboardXLS(logxlsfilePath, backupsheet, logdata) {
  const sheetNames = await listWorksheetNames(logxlsfilePath);
  const targetSheetName = backupsheet; // 替換為你要查找的備份工作表名稱

  const xlsfile = "taskboard.xlsx";
  const targetDir = path.join("C:\\tasklog");
  const backfullpathfile = path.join(targetDir, xlsfile); // 目标文件路径

  //console.log(logdata);

  const conver2json = JSON.stringify(logdata);
  const parsedData = JSON.parse(conver2json);

  //已經有當前backupsheet (YYYY-MM-DD)
  if (sheetNames.includes(targetSheetName)) {
    // console.log(`當前${targetSheetName}有存在!`);

    const workbook = new ExcelJS.Workbook();

    try {
      // 讀取 Excel 文件
      await workbook.xlsx.readFile(logxlsfilePath);

      // 獲取指定名稱的工作表
      const ackbpsheet = workbook.getWorksheet(targetSheetName);
      if (!ackbpsheet) {
        throw new Error(`Sheet "${targetSheetName}" not found.`);
      }

      //console.log("ackbpsheet = " + ackbpsheet);

      const backupID = ackbpsheet.id;
      // console.log("備份worksheetID = " + backupID);
      // 取得備份工作表單名稱
      //const ackbpsheet = workbook.worksheets[backupID];

      // console.log("ackbpsheet =  " + ackbpsheet);

      // 清空工作表內容
      // ackbpsheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      //   ackbpsheet.spliceRows(rowNumber, 1); // 刪除每一行
      // });

      const lastRow = ackbpsheet.lastRow;
      const rowIndex = lastRow ? lastRow.number + 1 : 1; // 如果 worksheet 不存在任何行，從第1行開始

      // console.log("lastRow  = " + lastRow);

      //方法 : 從最後一行開始刪除，以避免行號變更導致的問題
      // while (ackbpsheet.lastRow.number > 0) {
      //   ackbpsheet.spliceRows(ackbpsheet.lastRow.number, 1);
      // }

      // console.log("lastRow = "+lastRow);
      // console.log("rowIndex = "+rowIndex);

      if (typeof lastRow !== "undefined" || rowIndex === 1) {
        // console.log(
        //   "從最後 lastRow number = (" + lastRow.number + ") 開始刪除至第一筆"
        // );
        if (typeof lastRow !== "undefined") {
          if (lastRow.number > 0) {
            for (let k = lastRow.number; k >= 1; k--) {
              ackbpsheet.spliceRows(k, 1); // 刪除每一行
            }
          }
        }

        ackbpsheet.columns = [
          { header: "ID", key: "id", width: 5 },
          { header: "Editnum", key: "editnum", width: 5 },
          { header: "Name", key: "name", width: 10 },
          { header: "Date", key: "date", width: 20 },
          { header: "Time", key: "time", width: 20 },
          { header: "Precautions", key: "precautions", width: 100 },
          { header: "absenttype", key: "absenttype", width: 10 },
          { header: "Platform", key: "platform", width: 30 },
          { header: "Producttarget", key: "producttarget", width: 100 },
          { header: "Shorttermgoals", key: "shortterm_goals", width: 100 },
        ];

        // console.log(conver2json.length);
        // console.log(parsedData);
        //console.log("conver2json.length = "+conver2json.length);

        if (conver2json.length > 0) {
          // console.log("log寫入進行中!");
          parsedData.forEach((row, index) => {
            ackbpsheet.addRow(Object.values(row));
          });
        }

        //console.log("寫入log完畢");
        // 保存修改後的 XLS 文件
        await workbook.xlsx.writeFile(logxlsfilePath);
      }

      // 保存修改後的 XLS 文件
      await workbook.xlsx.writeFile(logxlsfilePath);

      // var variable = XLSX.utils.decode_range(ackbpsheet["!ref"]);
      // for (var R = 0; R < variable.e.r; ++R) {
      //   for (var C = variable.s.c; C <= variable.e.c; ++C) {
      //     ackbpsheet[ec(R, C)] = ackbpsheet[ec(R + 1, C)];
      //   }
      // }
      // variable.e.r--;
      // ackbpsheet["!ref"] = XLSX.utils.encode_range(variable.s, variable.e);

      //console.log(`已經刪除完工作表內容 "${targetSheetName}.`);

      // 確定要追加的行數
      // const lastRow = worksheet.lastRow;
      // const rowIndex = lastRow ? lastRow.number + 1 : 1; // 如果 worksheet 不存在任何行，從第1行開始

      // const newrowData = [
      //   parsedData.id,
      //   parsedData.editnum,
      //   parsedData.memberName,
      //   parsedData.date,
      //   parsedData.currentTime,
      //   parsedData.precautions,
      //   parsedData.type,
      // ];
    } catch (error) {
      console.error("Error:", error);
    }
  } //需要新增當前年月日(YYYY-MM-DD)格式名稱worksheetname
  else {
    try {
      if (conver2json.length <= 0 || !logdata || !targetSheetName) {
        //console.log("有query 空值,請確認換班交接有無紀錄");
        return 0;
      }

      //  console.log("backupsheet不存在....,需要新增");
      const workbook = new ExcelJS.Workbook();

      // 讀取 Excel 文件
      await workbook.xlsx.readFile(logxlsfilePath);

      // 添加新的工作表
      const newbackupsheet = workbook.addWorksheet(targetSheetName);

      newbackupsheet.columns = [
        { header: "ID", key: "id", width: 5 },
        { header: "Editnum", key: "editnum", width: 5 },
        { header: "Name", key: "name", width: 10 },
        { header: "Date", key: "date", width: 20 },
        { header: "Time", key: "time", width: 20 },
        { header: "Precautions", key: "precautions", width: 100 },
        { header: "absenttype", key: "absenttype", width: 10 },
        { header: "Platform", key: "platform", width: 30 },
        { header: "Producttarget", key: "producttarget", width: 100 },
        { header: "Shorttermgoals", key: "shortterm_goals", width: 100 },
      ];

      if (conver2json.length > 0) {
        //  console.log("log寫入進行中!");
        parsedData.forEach((row, index) => {
          newbackupsheet.addRow(Object.values(row));
        });
      }

      // console.log("寫入log完畢");
      workbook.xlsx.writeFile(logxlsfilePath);
    } catch (err) {
      console.error("Error taskboard-record file:", err);
    }
  }

  //多複製到備用路徑(C:\tasklog)
  if (!fs.existsSync(targetDir)) {
    //console.log("backupxlspath路徑有空,需要重建");
    fs.mkdirSync(targetDir, { recursive: true });
  }

  try {
    //複製文件（同步方式）
    fs.copyFileSync(logxlsfilePath, backfullpathfile);
  } catch (err) {
    console.error("Error copying file:", err);
  }

  console.log(
    `${targetSheetName}.工作表單已備份完畢 / 額外備份到C:\\tasklog資料夾`
  );
}

// 查詢資料並寫入 Excel
async function exportDataToExcel(xlsfilePath, newworksheet, file, res) {
  const workbook = new ExcelJS.Workbook();

  // 讀取 Excel 文件
  await workbook.xlsx.readFile(xlsfilePath);

  //console.log("newworksheet = " + newworksheet);

  const newsheet = workbook.getWorksheet(newworksheet);

  // console.log("當前 newsheet.id = " + newsheet.id);
  try {
    // // 設置工作表標題行
    // const headers = Object.keys(res.rows[0]);
    // newsheet.addRow(headers);
    if (newsheet) {
      workbook.removeWorksheet(newsheet.id);
      console.log(`Worksheet '${newworksheet}' removed successfully.`);
    }

    // 確保標題行存在並保存
    // const headerRow = newsheet.getRow(1); // 獲取標題行
    // newsheet.spliceRows(2, newsheet.rowCount - 1); // 刪除標題行以外的所有行

    // 設置標題行(1)
    // newsheet.columns = Object.keys(res[0]).map((key) => ({
    //   header: key,
    //   key,
    // }));
    // 創建一個新的 worksheet
    const newWorksheet = workbook.addWorksheet(newworksheet);

    // 設置標題行(2)
    newWorksheet.columns = [
      { header: "ID", key: "id", width: 5 },
      { header: "Editnum", key: "editnum", width: 5 },
      { header: "Name", key: "name", width: 10 },
      { header: "Date", key: "date", width: 20 },
      { header: "Time", key: "time", width: 20 },
      { header: "Precautions", key: "precautions", width: 100 },
      { header: "absenttype", key: "absenttype", width: 10 },
      { header: "Platform", key: "platform", width: 30 },
    ];

    // 保留標題行
    // headerRow.values = newsheet.columns.map((col) => col.header);

    //Editnum 列
    const EditnumIndex = 2;

    //確定有當日的工作表單號別
    if (newsheet.id > 0) {
      for (let i = 0; i < 3; i++) {
        //先將DB taskboard table 先寫入 xls
        if (i === 0) {
          // 添加數據行
          res.forEach((row, index) => {
            newWorksheet.addRow(Object.values(row));
          });
          // 保存工作簿
          await workbook.xlsx.writeFile(xlsfilePath);
          // console.log("已經增加taskboard.xls 完畢rows ALL ");
        } //再後續xls更新欄位 (Editnum 列)
        else if (i === 1) {
          // const workbook2 = new ExcelJS.Workbook();
          // // 讀取 Excel 文件
          // await workbook2.xlsx.readFile(xlsfilePath);
          // const newsheet2 = workbook2.getWorksheet(newworksheet);
          // if (newsheet2) {
          //   res.forEach((row, index) => {
          //     //更新特定列的單元格數據(Editnum) , 從第2筆開始原因是需要避開null ,column name 2筆
          //     newsheet2.getRow(index + 2).getCell(EditnumIndex).value =
          //       newsheet.id.valueOf();
          //   });
          // }
          // // 保存已經修改過的工作簿
          // await workbook2.xlsx.writeFile(xlsfilePath);
          // console.log("taskboard.xls update 更新完成");
        }
        // 備份原先 taskboard.xlsx 到備份路徑(目前預設 : C:/log)
        else if (i === 2) {
          // 选择taskboard.xlsx文件保存備份路径
          const targetDir = path.join("C:\\tasklog");
          const backfullpathfile = path.join(targetDir, file); // 目标文件路径

          if (!fs.existsSync(targetDir)) {
            //console.log("backupxlspath路徑有空,需要重建");
            fs.mkdirSync(targetDir, { recursive: true });
          }

          // 复制文件（同步方式）
          try {
            fs.copyFileSync(xlsfilePath, backfullpathfile);

            console.log(`taskboard.xls 已備份到路徑-> ${targetDir}`);
          } catch (err) {
            console.error("Error copying file:", err);
          }
        }
      }
    }
    //console.log("taskboard.xls update 更新完成");
  } catch (error) {
    console.error("Error during export:", error);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listWorksheetNames(filePath) {
  const workbook = new ExcelJS.Workbook();

  try {
    // 讀取 Excel 文件
    await workbook.xlsx.readFile(filePath);

    // 獲取所有工作表名稱
    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    const sheetNamesID = workbook.worksheets.map((sheet) => sheet.id);

    // 輸出工作表名稱
    //  console.log("Worksheet names:", sheetNames);
    //  console.log("Worksheet ID:", sheetNamesID);

    return sheetNames;
  } catch (error) {
    console.error("Error reading Excel file:", error);
  }
}

async function addWorksheetToExcel(filePath, newSheetName, jsondata) {
  //重新新增worksheetname (YYYY-MM-DD)
  const workbook = new ExcelJS.Workbook();

  // 嘗試讀取現有的工作簿
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (error) {
    console.log(
      "File does not exist or could not be read. Creating a new one."
    );
  }

  // 添加新的工作表
  const worksheet = workbook.addWorksheet(newSheetName);

  const parsedData = JSON.parse(jsondata);

  // 添加數據到新的工作表
  // 假設 `data` 是一個二維數組，每個子數組表示一行
  // rowdata.forEach((row) => {
  //   worksheet.addRow(row);
  // });

  const data = (worksheet.columns = [
    { header: "ID", key: "id", width: 5 },
    { header: "Editnum", key: "editnum", width: 5 },
    { header: "Name", key: "name", width: 10 },
    { header: "Date", key: "date", width: 20 },
    { header: "Time", key: "time", width: 20 },
    { header: "Precautions", key: "precautions", width: 100 },
    { header: "absenttype", key: "absenttype", width: 10 },
    { header: "Platform", key: "platform", width: 30 },
    { header: "Producttarget", key: "producttarget", width: 100 },
    { header: "Shorttermgoals", key: "shortterm_goals", width: 100 },
  ]);

  if (jsondata.length > 0) {
    // worksheet.addRow({
    //   id: parsedData.id,
    //   editnum: parsedData.editnum,
    //   memberName: parsedData.memberName,
    //   date: parsedData.date,
    //   currentTime: parsedData.currentTime,
    //   precautions: parsedData.precautions,
    //   type: parsedData.type,
    //   platform: parsedData.platform
    // });
  }

  // 保存工作簿
  await workbook.xlsx.writeFile(filePath);
  console.log(`New worksheet "${newSheetName}" added to ${filePath}`);
}

async function UpdateWorksheetCheck(filePath, newSheet) {
  const sheetNames = WorksheetCheck(filePath, newSheet);

  return;

  if (sheetNames.includes(newSheet)) return newSheet === excellogpath;
}

async function WorksheetCheck(filePath, newSheet) {
  // 創建一個新的工作簿
  const workbook = new ExcelJS.Workbook();
  try {
    // 讀取 Excel 文件
    await workbook.xlsx.readFile(filePath);

    // 獲取所有工作表名稱
    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);

    // 輸出工作表名稱
    //console.log("Worksheet names:", sheetNames);

    return sheetNames;
  } catch (error) {
    console.error("Error reading Excel file:", error);
  }

  // 檢查是否有與新的 worksheet 同名的 worksheet
  // if (workbook.worksheets.some((sheet) => sheet.name === newSheet)) {
  //   //console.log(`Worksheet named '${newSheetname}' already exists.`);
  //   console.log(
  //     "3 確認 > " + filePath,
  //     newSheet + "sheet.name = " + sheet.name
  //   );
  //   return sheet.name;
  // }

  // let searchname = workbook.getWorksheet(newSheet);
  // console.log("worksheetname = " + searchname);
  return searchname;
}
async function entrust_line_notify(neweditnum, req) {
  const test_token = "3EuY6ByrJAcShp93pLE45u0D4iuLEtvYCqhafEoXybs";

  try {
    const {
      editnum,
      memberName,
      date,
      currentTime,
      precautions,
      type,
      platform,
    } = req.body;

    const getpart_of_notice = precautions.slice(0, precautions.length);

    // 送linetoken
    //開始處理送資料

    const config_line = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${process.env.lineToken_taskboard}`,
        // Authorization: `Bearer ${process.env.lineToken}`,
        //Authorization: `Bearer ${test_token}`,
      },
    };

    const config_Discord = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${process.env.discord_botToken}`,
      },
    };

    const message = `
    ----------------
    ${platform}-換班交接回報
    編號: ${neweditnum}
    確認員工: ${memberName}
    確認事項: ${getpart_of_notice}
    確認日期時間: ${date + " " + currentTime}
    班別: ${type}
    ----------------
      `;

    // for (let k = 1; k < 2; k++) {
    //   if (k == 0) {
    //     await axios.post(
    //       "https://notify-api.line.me/api/notify",
    //       `message=${message}`,
    //       config_line
    //     );

    //     console.log("換班交接已經提交訊息內容委託LINE");
    //   } else if (k == 1) {
    //     const TaskBoard_REQUEST_URL = `${process.env.discord_taskboard_submit}`;
    //     await axios.post(
    //       // "https://notify-api.line.me/api/notify",
    //       TaskBoard_REQUEST_URL,
    //       { content: message },
    //       config_Discord
    //     );

    //     console.log("換班交接已經提交訊息內容委託DisCord");
    //   }
    // }

    const TaskBoard_REQUEST_URL = `${process.env.discord_taskboard_submit}`;
    // 只發送 Discord
    await axios.post(
      TaskBoard_REQUEST_URL,
      { content: message },
      config_Discord
    );
    console.log("換班交接已經提交訊息內容委託DisCord");
  } catch (error) {
    console.error("send linetoken Error during export:", error);
  }
}

const backup_lastworksheet = async (filePath, backSheetid) => {
  // 創建一個新的工作簿
  const workbook = new ExcelJS.Workbook();
  try {
    // 讀取 Excel 文件
    await workbook.xlsx.readFile(filePath);

    // 獲取所有工作表名稱
    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);

    sheetNames.forEach( async (sheetName, index) => {
      // console.log(`Sheet Index: ${index}, Sheet Name: ${sheetName}`);

      //這邊因為索引,所以要將既有的ID-1才能符合
      if (index === backSheetid - 1) {
        // console.log(
        //   `backup-> Sheet Index: ${index + 1}, Sheet Name: ${sheetName}`
        // );

        try {
          let sql = "SELECT * from hr.taskboard";
          if (sheetName) {
            // 查詢該編輯號所有內容
            sql += ` WHERE (editnum LIKE '${backSheetid}%') `;
          }

          // 將指定條件回傳至前端 , ex:memberName , member_phone...諸如此類
          await mysql_config.query(sql, (err, res) => {
            if (err) {
              return res.status(500).send({ error: "Error  query" });
            } else {
              console.log(
                `準備備份最後編輯號${backSheetid} 工作表: ${sheetName}`
              );
              //console.log(res);
              backup_exist_taskboardXLS(filePath, sheetName, res);
            }
          });

          //return res.status(200).json({ message: "taskboard.xlsx Log更新完畢" });
          return res.status(200).send({
            message: "備份最後工作表單:於taskboard.xls完畢",
          });
        } catch (error) {
          console.error("發生錯誤", error);
          res.status(400).json({
            message: "取得MEMBERID錯誤",
          });
        }
      }
    });
  } catch (error) {
    console.error("Error reading Excel file:", error);
  }
}

//當下確認名單追蹤
router.get("/confirmname", async (req, res) => {
  const { dtimestart, dtimeend } = req.query;

  // console.log(" dtimestart = " + dtimestart);
  // console.log(" dtimeend = " + dtimeend);

  // const starttime = dtimestart.split(" ");
  // const endtime = dtimeend.split(" ");

  // const stime = convertostart[0];
  // const etime = convertoend[0];

  const stime = dtimestart;
  const etime = dtimeend;

  //console.log("要查詢的日期時間區間為 stime = " + stime + " etime = " + etime);

  try {
    let sql = "SELECT name,Precautions from taskboard";

    if (stime && etime) {
      // 搜尋當前日期時間確認之員工姓名及注意確認事項
      sql += ` WHERE (confirm_date LIKE '${newSheetName}%' AND confirm_time BETWEEN '${stime}%' AND '${etime}%') `;
    }

    try {
      const [result] = await mysql_config.query(sql);
      return res.status(200).json({
        message: "DateTime text received successfully",
        receivedParams: { dtimestart, dtimeend },
        confirm: {
          key1: { result },
        },
      });
    } catch (err) {
      return res.status(500).send({ error: "Error executing query" });
    }

    // return res.status(200).send({ message: "taskboard.xlsx Log更新完畢" });
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得DATETIME錯誤",
    });
  }
});

//建立交班log xls檔案
router.get("/xlsoutput", async (req, res) => {
  // if (err) return res.json(err);
  // else return res.json(data);

  // console.log("newSheetName = " + newSheetName);
  const xlsfile = "taskboard.xlsx";

  try {
    let sql = "SELECT * from taskboard";
    if (newSheetName) {
      // 假設你的 query 字串可能是工號或者姓名
      sql += ` WHERE (confirm_date LIKE '${newSheetName}%') `;
    }



    try {
      const [rows] = await mysql_config.query(sql);
      // write backup/worksheet based on rows
      await backup_exist_taskboardXLS(excellogpath, newSheetName, rows);
      console.log("taskboard.xls update 更新完成");
      return res.status(200).send({ message: "taskboard.xlsx Log更新完畢" });
    } catch (err) {
      console.error(err);
      return res.status(500).send({ error: "Error executing query" });
    }
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得MEMBERID錯誤",
    });
  }
});

// 從資料庫中擷取公司人員姓名
router.get("/dbhr", async (req, res) => {
  //const sql = "SELECT memberName FROM hr_memberinfo where memberID = '295'";

  const { param1 } = req.query;
  const memberid = parseInt(param1);

  // if (err) return res.json(err);
  // else return res.json(data);

  // console.log("Received parameters:", { param1 });
  // 根據接收到的數據進行處理並返回響應

  try {
    const memID = parseInt(param1);
    const sql1 =
      "SELECT memberName,absent_type FROM `hr`.`hr_memberinfo` where memberID = ?";


    try {
      const [result] = await mysql_config.query(sql1, [memID]);
      return res.status(200).json({
        message: "Data received successfully",
        receivedParams: { param1 },
        member: {
          key1: { result },
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).send({ error: "Error executing query" });
    }
    //return res.status(200).send({ results });
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得MEMBERID錯誤",
    });
  }
});

//將上次最後確認做備份
router.get("/savebacklog", async (req, res) => {
  const { editnum } = req.query;
  const editnumID = parseInt(editnum);
  let search_worksheet;
  const xlsfile = "taskboard.xlsx";
  const logData = [];

  const sql1 = "SELECT confirm_date FROM taskboard where editnum =? LIMIT 1";
  const sql2 = "SELECT * FROM taskboard where editnum =?";

  try {
    const [results1] = await mysql_config.query(sql1, [editnumID]);
    if (!results1 || results1.length === 0) {
      return res.status(404).send("Error confirm_date wherefind");
    }

    results1.forEach((row) => {
      search_worksheet = row.confirm_date;
    });

    const [results2] = await mysql_config.query(sql2, [editnumID]);
    if (!results2) {
      return res.status(404).send("Error editnum allcontent find result");
    }

    try {
      results2.forEach((row) => {
        const id = row.id;
        const edit = row.editnum;
        const name = row.name;
        const date = row.confirm_date;
        const time = row.confirm_time;
        const precautions = row.Precautions;
        const type = row.absent_type;
        const platform = row.platform;
        const producttarget = row.Producttarget;
        const shorttermgoals = row.Shorttermgoals;

        logData.push({
          id: id,
          edit: edit,
          name: name,
          date: date,
          time: time,
          precautions: precautions,
          type: type,
          platform: platform,
          producttarget: producttarget,
          shorttermgoals: shorttermgoals,
        });
      });
    } catch (error) {
      console.error("Error reading record:", error);
      return res.status(404).send("Error editnum allcontent find result");
    }

    console.log("查询结果的数组logData▽");
    console.log(logData);

    // 透過日期取找出worksheet表單是否存在
    await backup_exist_taskboardXLS(excellogpath, search_worksheet, logData);

    return res.status(200).json({
      message: "taskboard.xlsx 重新備份完畢",
      receivedParams: { editnumID },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Internal Server Error");
  }
});

router.get("/checktaskworksheet", async (req, res) => {
  const { editnum } = req.query;

  const editnumID = parseInt(editnum);
  //console.log("editnumID = " + editnumID);

  let sql1 = "SELECT confirm_date , COUNT(*) AS count FROM taskboard";

  if (editnumID) {
    sql1 += ` WHERE (editnum LIKE '${editnumID}') GROUP BY confirm_date
    ORDER BY count DESC
    LIMIT 1; `;
  }

  try {
    const [result] = await mysql_config.query(sql1);
    return res.status(200).json({
      message: "editnum received successfully",
      receivedParams: { editnum },
      editgroup: {
        key1: { result },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ error: "Error executing query" });
  }
});

//最新要更新部分2024.08.22
router.get("/vieweditworksheet", (req, res) => {
  const { worksheet } = req.query;
  let targetSheet;

  try {
    console.log("目前要索引的worksheet為 = " + worksheet);

    // 讀取 Excel 文件
    let workbook = XLSX.readFile(excellogpath);

    const sheetNames = workbook.SheetNames;
    //const sheetNames =  listWorksheetNames(excellogpath);
    // console.log("所有工作表名称:", sheetNames);
    // console.log("worksheet = " + worksheet);

    const targetSheetName = worksheet; // 确保这个名称是正确的

    // console.log("targetSheetName = " + targetSheetName);

    if (workbook.Sheets[targetSheetName]) {
      targetSheet = workbook.Sheets[targetSheetName];
      // console.log(`工作表 ${targetSheetName} 存在`);
      // console.log("已找到工作表数据:", targetSheet);
      console.log(`已找到工作表数据-> : ${targetSheet}`);
    } else {
      console.log(`工作表 ${targetSheetName} 不存在`);
    }

    const range = XLSX.utils.decode_range(targetSheet["!ref"]);
    console.log(range);
    let workData = [];
    for (let index = 2; index <= range.e.r + 1; index++) {
      try {
        const id = targetSheet[`A${index}`].v;
        const edit = targetSheet[`B${index}`].v;
        const name = targetSheet[`C${index}`].v;
        const date = targetSheet[`D${index}`].v;
        const time = targetSheet[`E${index}`].v;
        const precautions = targetSheet[`F${index}`].v;
        const type = targetSheet[`G${index}`].v;
        const platform = targetSheet[`H${index}`].v;
        // const producttarget = targetSheet[`I${index}`].v;
        // const shorttermgoals = targetSheet[`J${index}`].v;

        // console.log("Reading record:", {
        //   id: id,
        //   edit: edit,
        //   name: name,
        //   date: date,
        //   time: time,
        //   precautions: precautions,
        //   type: type,
        // });
        workData.push({
          id: id,
          edit: edit,
          name: name,
          date: date,
          time: time,
          precautions: precautions,
          type: type,
          platform: platform,
          // producttarget: producttarget,
          // shorttermgoals: shorttermgoals,
        });
      } catch (error) {
        console.error("Error reading record:", error);
      }
    }

    // const shiftMap = {};
    // workData.forEach((employee) => {
    //   shiftMap[employee.id] = employee.work;
    // });
    // console.log(shiftMap);

    // 讀取資料檔案，並且轉換成 Big5 編碼
    //const fileBuffer = fs.readFile(process.env.ADEF);
    //const fileContent = iconv.decode(fileBuffer, "Big5");

    // 將資料以換行符號分割成陣列
    //let lines = fileContent.replace(/\r\n/g, "\n").split("\n");

    let data = [];
    // 迴圈遍歷每一行資料
    for (let line of workData) {
      //console.log(line);
      // 將每一行資料以分號分割成陣列
      //let fields = line.split("");
      // // 建立一個物件來儲存每一行資料的欄位
      // let obj = {
      //   id: fields[0],
      //   edit: fields[1],
      //   name: fields[2],
      //   date: fields[3],
      //   time: fields[4],
      //   precautions: fields[5],
      //   type: fields[5],
      //   // shift: shiftMap[fields[0]],
      //   // state: "", // 初始化state字段
      // };
      // //將物件加入到 JSON 陣列中
      // data.push(obj);
    }

    // data.forEach((item, index) => {
    //   //shiftMap[employee.id] = employee.work;
    //   console.log(
    //     index +
    //       ": 項目為" +
    //       item.id +
    //       " " +
    //       item.edit +
    //       " " +
    //       item.name +
    //       " " +
    //       item.date +
    //       " " +
    //       item.time +
    //       " " +
    //       item.precautions +
    //       " " +
    //       item.type
    //   );
    // });

    //res.json(data);
    // console.log("回傳XLS班日提交紀錄為:"+ JSON.stringify(workData,null,2));
    res.json(workData);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/checktask", async (req, res) => {
  // if (err) return res.json(err);
  // else return res.json(data);
  const { editnum } = req.query;
  let checkdatetime = false; //初始化設定
  let checkeditnum = false; //初始化設定
  let sql1 = "SELECT * FROM taskboard";

  //判斷是否有日期格式 YYYY-MM-DD  其中 符號 '-'
  // if (containsSpecialCharacters(editnum) === true) checkdatetime = true;

  //判斷是否為編輯號,數值格式
  if (isNumber(editnum) == true) checkeditnum = true;

  // console.log("checkdatetime 狀態為 = " + checkdatetime);
  // console.log("checkeditnum 狀態為 = " + checkeditnum);

  // if (checkdatetime) sql1 += ` WHERE (confirm_date LIKE '%${editnum}%') `;

  if (checkeditnum) sql1 += ` WHERE (editnum LIKE ${editnum}) `;

  // console.log("sql1 = " + sql1);


  try {
    const [result] = await mysql_config.query(sql1);
    return res.status(200).json({
      message: "datenum received successfully",
      receivedParams: { editnum },
      condition: {
        key1: { result },
      },
    });
  } catch (error) {
    console.error("發生錯誤", error);
    return res.status(400).json({
      message: "取得MEMBERID錯誤",
    });
  }
});

// 提交交班人員確認資訊記錄到目標table
router.post("/pushconfirm", async (req, res) => {
  const data = req.body;
  //const excelfilePath = path.join(__dirname, "log/taskboard.xlsx");
  // console.log(data);

  // //取得當前日期
  // let ts = Date.now();
  // let date_time = new Date(ts);
  // let nowdate = date_time.getDate();
  // let nowMonth = date_time.getMonth() + 1;
  // let nowyear = date_time.getFullYear();
  // let newSheetName = nowyear + "-" + nowMonth + "-" + nowdate;
  //console.log(data);

  //針對前端傳送之json格式做解析後再處理
  let conver2json = JSON.stringify(data);
  const parsedData = JSON.parse(conver2json);

  // 當員工名稱是空值這邊不給予保存DBc
  if (parsedData.memberName === "") {
    // console.log(
    //   "員工名稱是空值,無效不存取DB 確認日期時間為:",
    //   parsedData.dateTime
    // );
    return res.status(201).send({
      message: "員工名稱是空值",
    });
  }

  let workbook = new ExcelJS.Workbook();

  // 讀取 Excel 文件
  await workbook.xlsx.readFile(excellogpath);
  //取得工作表單確認
  let newsheet = workbook.getWorksheet(newSheetName);

  //當天要建立新worksheet,先備份前一次最後換班交接作業的紀錄到log(這邊避免手動存取log無執行防止措施)
  if (!newsheet) {
    // worksheet 以年月日作區隔
    newsheet = workbook.addWorksheet(newSheetName);
    //以下不用再寫入workseet,因為會發生file crash error

    //往前推backup worksheet id
    const backup_worksheet_id = parseInt(newsheet.id - 1);

    // console.log("備份worksheet id = " + backup_worksheet_id);
    if (backup_worksheet_id > 0) {
      //backup_lastworksheet(excelfilePath, backup_worksheet_id);
    }
  }

  if (newsheet.id === 0) {
    return res.status(401).send({
      message: `當前workseet表單 ${newSheetName} 工作表單號 newsheet.id =  ${newsheet.id} " 建立失敗"`,
    });
  }

  let editconfirm = newsheet.id;

  try {
    let {
      editnum,
      memberName,
      date,
      currentTime,
      precautions,
      type,
      platform,
      producttarget,
      shortterm_goals,
    } = req.body;

    //console.log("editconfirm 最終值為= " + editconfirm);

    // console.log("platform value 為= " + platform);

    try {
      const iniData = await fs.promises.readFile(iniFilePath, "utf8");
      const config = ini.parse(iniData);

      // 访问特定的 key 和 value
      const section = "editnum"; // 例如配置文件中的一个节
      const key = "final"; // 要查找的 key

      if (config[section] && config[section][key]) {
        const numtest = config[section][key];
        // console.log("editconfirm = " + editconfirm);
        // console.log("numtest = " + numtest);

        editconfirm = parseInt(editconfirm) + parseInt(numtest);

        //這邊從新當日newworksheet取得工作表單號(這邊視為editnum 流水號)
        //console.log("editconfirm 最終值為= " + editconfirm);

        // // 委託line傳送訊息
        await entrust_line_notify(editconfirm, req);

        const sql =
          "INSERT INTO taskboard (editnum ,name , confirm_date ,confirm_time ,Precautions ,absent_type,platform,Producttarget,Shorttermgoals) VALUES (?,?,?,?,?,?,?,?,?)";

        try {
          const [insertRes] = await mysql_config.query(sql, [
            editconfirm,
            memberName,
            date,
            currentTime,
            precautions,
            type,
            platform,
            producttarget,
            shortterm_goals,
          ]);
          console.log("執行中INSERT INTO -> " + editconfirm);
        } catch (err) {
          console.error("INSERT query Error during export:", err);
        }
      } else {
        console.log(`Key ${key} not found in section ${section}`);
      }
    } catch (err) {
      console.error("Error reading ini file or processing insert:", err);
    }

    // // 委託line傳送訊息
    // entrust_line_notify(editconfirm, req);

    if (!fs.existsSync(excellogpath)) {
      // 创建一个新的工作簿
      const workbook = new ExcelJS.Workbook();

      // worksheet 以年月日作區隔
      const worksheet = workbook.addWorksheet(newSheetName);

      //console.log(data);

      const jsonparse = (worksheet.columns = [
        { header: "ID", key: "id", width: 5 },
        { header: "Editnum", key: "editnum", width: 5 },
        { header: "Name", key: "name", width: 10 },
        { header: "Date", key: "date", width: 20 },
        { header: "Time", key: "time", width: 20 },
        { header: "Precautions", key: "precautions", width: 100 },
        { header: "absenttype", key: "absenttype", width: 10 },
        { header: "Platform", key: "platform", width: 30 },
        { header: "Producttarget", key: "producttarget", width: 100 },
        { header: "Shorttermgoals", key: "shortterm_goals", width: 100 },
      ]);

      // let becket = JSON.parse(data, "utf8");
      // let conver2json = JSON.stringify(data);

      // const parsedData = JSON.parse(conver2json);

      // console.log("id: " + parsedData.id);
      // console.log("iprecautionsd: " + parsedData.precautions);
      // console.log("memberName: " + parsedData.memberName);
      // console.log("currentTime: " + parsedData.currentTime);
      // console.log("dateTime: " + parsedData.dateTime);

      let conver2json = JSON.stringify(data);
      const parsedData = JSON.parse(conver2json);

      //解析res json格式
      if (conver2json.length > 0) {
        // 设置列標題 ,要以下這樣寫需要conver2json不是字串浮,而是多數劇列形式才可正常
        // worksheet.columns = Object.keys(conver2json[0]).map((key) => ({
        //   header: key,
        //   key: key,
        //   width: 250,
        // }));
        // worksheet.addRow({
        //   id: parsedData.id,
        //   editnum: parsedData.editnum,
        //   memberName: parsedData.memberName,
        //   date: parsedData.date,
        //   currentTime: parsedData.currentTime,
        //   precautions: parsedData.precautions,
        //   type: parsedData.type,
        // });
      }
      // 写入 Excel 文件
      workbook.xlsx.writeFile(excellogpath);

      console.log("新增taskboard.xlsx檔案寫入完畢");
    } // 繼續複寫寫入完畢excel");
    else {
      // console.log("繼續複寫excel");
      let conver2json1 = JSON.stringify(data);
      const parsedData1 = JSON.parse(conver2json1);

      // listWorksheetNames(excelfilePath)
      //   .then((sheetNames) =>
      //     console.log(
      //       "Sheet names retrieved successfully." + "sheetNames = " + sheetNames
      //     )
      //   )
      //   .catch((error) => console.error("Error:", error));

      const sheetNames = await listWorksheetNames(excellogpath);
      const targetSheetName = newSheetName; // 替換為你要查找的工作表名稱

      // console.log("newSheetName原始 = "+ newSheetName);

      // console.log("targetSheetName======="+ targetSheetName);

      //已經有當前worksheetname (YYYY-MM-DAYS)
      if (sheetNames.includes(targetSheetName)) {
        const workbook = new ExcelJS.Workbook();

        try {
          // 讀取 Excel 文件
          await workbook.xlsx.readFile(excellogpath);

          // 獲取指定名稱的工作表
          const worksheet = workbook.getWorksheet(newSheetName);
          if (!worksheet) {
            throw new Error(`Sheet "${newSheetName}" not found.`);
          }

          // 確定要追加的行數
          // const lastRow = worksheet.lastRow;
          // const rowIndex = lastRow ? lastRow.number + 1 : 1; // 如果 worksheet 不存在任何行，從第1行開始

          // console.log("rowIndex 從開始下面這行開始 = " + rowIndex);

          const newrowData = [
            parsedData.id,
            parsedData.editnum,
            parsedData.memberName,
            parsedData.date,
            parsedData.currentTime,
            parsedData.precautions,
            parsedData.type,
            parsedData.platform,
            parsedData.producttarget,
            parsedData.shortterm_goals,
          ];

          // 插入資料並追蹤行索引
          // let currentRowIndex = worksheet.lastRow.number; // 獲取目前最後一行的行索引
          // currentRowIndex += 1; // 增加行索引
          // worksheet.insertRow(currentRowIndex, newrowData);
          workbook.xlsx.writeFile(excellogpath);
          // console.log(`Inserted row at index ${currentRowIndex}:`, newrowData);
          // console.log("taskboard.xls繼續更新");

          // if (!Array.isArray(jsondata)) {
          //   throw new Error("Fetched data is not an array");
          // }

          // for (const row of jsondata) {
          //   // 確保每行數據的格式正確
          //   if (row && Array.isArray(row)) {
          //     // 可以選擇在每次插入後立刻保存
          //     worksheet.insertRow(currentRowIndex, newrowData);
          //     console.log(
          //       `Inserted row at index ${currentRowIndex}:`,
          //       newrowData
          //     );
          //     workbook.xlsx.writeFile(excelfilePath);
          //   } else {
          //     console.warn("Invalid row data:", row);
          //   }
          // }

          // console.log("當前worksheet name = " + worksheet);
          // console.log("taskboard.xls繼續更新");

          //因為目前一多筆輸入只會出現最後一筆insert xls , 這邊再去搜尋DB table 將整個內容全部覆寫
          // exportDataToExcel(excelfilePath, newSheetName);
        } catch (error) {
          console.error("Error:", error);
        }
      } //需要新增當前年月日(YYYY-MM-DD)格式名稱worksheetname
      else {
        addWorksheetToExcel(excellogpath, newSheetName, conver2json1)
          .then(() => console.log("Operation completed successfully."))
          .catch((error) => console.error("Error:", error));
      }
    }

    console.log("確認存取/換班交接回報已傳送完畢");

    return res.status(201).json({
      message: "確認上傳,linenotify通知全部完成",
    });
  } catch (error) {
    // 如果發生錯誤，回傳錯誤訊息
    res.status(500).json({ message: error.message });
    console.error(error);
  }
});

router.get("/absent", async (req, res) => {
  const {
    memberID , 
    Name,
    inputType,
    sortStartDate,
    sortEndDate,
    page = 1,
    pageSize = 25,
  } = req.query;

  const limit = parseInt(pageSize, 10);
  const offset = (parseInt(page, 10) - 1) * limit;

  console.log("memberID = " + memberID);

  let sql = "";
  let params = [];
  let inputValue = Name;

  // 轉換進入的時間
  let startDate_Year = String(sortStartDate).trim().split("-")[0].slice(-2);
  let startDate_Month = String(sortStartDate).trim().split("-")[1];
  let startDate_Day = String(sortStartDate).trim().split("-")[2];
  let sortStart = `${startDate_Year}${startDate_Month}${startDate_Day}`;

  let endDate_Year = String(sortEndDate).trim().split("-")[0].slice(-2);
  let endDate_Month = String(sortEndDate).trim().split("-")[1];
  let endDate_Day = String(sortEndDate).trim().split("-")[2];
  let sortEnd = `${endDate_Year}${endDate_Month}${endDate_Day}`;

  console.log(
    "sortStartDate : " + sortStart + "|" + "sortEndDate : " + sortEnd
  );

  if (inputType === "all" || (inputType === "text" && inputValue === "all")) {
    sql = `SELECT * FROM hr_myabsent WHERE card_date BETWEEN ? AND ? AND card_name LIKE ? ORDER BY card_date DESC LIMIT ? OFFSET ?`;
    params = [sortStart, sortEnd, "%考勤機%", limit, offset];
  } else if (inputType === "text") {
    sql = `SELECT * FROM hr_myabsent WHERE memName = ? AND card_date BETWEEN ? AND ? AND card_name LIKE ? ORDER BY card_date DESC LIMIT ? OFFSET ?`;
    params = [inputValue, sortStart, sortEnd, "%考勤%", limit, offset];
  } else if (inputType === "number") {
    inputValue = String(Name).padStart(5, "0");
    sql = `SELECT * FROM hr_myabsent WHERE memID = ? AND card_date BETWEEN ? AND ? AND card_name LIKE ? ORDER BY card_date DESC LIMIT ? OFFSET ?`;
    params = [inputValue, sortStart, sortEnd, "%考勤%", limit, offset];
  }

  try {
    // 執行查詢 (使用 promise pool)
    const [rows] = await mysql_config.query(sql, params);

      // 計算總筆數
      let sql_Count = "";
      let countParams = [];

      if (
        inputType === "all" ||
        (inputType === "text" && inputValue === "all")
      ) {
        sql_Count = `SELECT COUNT(*) AS totalCount FROM hr_myabsent WHERE card_date BETWEEN ? AND ?`;
        countParams = [sortStart, sortEnd];
      } else if (inputType === "text") {
        sql_Count = `SELECT COUNT(*) AS totalCount FROM hr_myabsent WHERE memName = ? AND card_date BETWEEN ? AND ?`;
        countParams = [inputValue, sortStart, sortEnd];
      } else if (inputType === "number") {
        sql_Count = `SELECT COUNT(*) AS totalCount FROM hr_myabsent WHERE memID = ? AND card_date BETWEEN ? AND ?`;
        countParams = [inputValue, sortStart, sortEnd];
      }

      // 補上與主查詢一致的 card_name LIKE 條件
      if (inputType === "all" || (inputType === "text" && inputValue === "all")) {
        sql_Count += ` AND card_name LIKE ?`;
        countParams.push("%考勤機%");
      } else {
        sql_Count += ` AND card_name LIKE ?`;
        countParams.push("%考勤%");
      }

      // 執行計算總筆數查詢
      const [countResult] = await mysql_config.query(sql_Count, countParams);

      const totalRowsInbackend = countResult[0]?.totalCount || 0;

      res.status(200).json({
        message: "查詢成功",
        data: rows,
        totalCount: totalRowsInbackend,
        page: parseInt(page, 10),
        totalPages: Math.ceil(totalRowsInbackend / parseInt(pageSize, 10)),
        receivedParams: {
          Name,
          inputType,
          sortStartDate,
          sortEndDate,
        },
      });
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得資料錯誤",
    });
  }
});

//公告提交
router.post("/announce", upload.array("filenames"), async (req, res) => {
  const annou_request_body = req.body;
  let photo_paths = [],
    prefix;
  // console.log("接收公告body = " + JSON.stringify(annou_request_body, null, 2));
  // console.log("檔案資訊：", req.files);

  const dateFolder = `${nowyear}${nowMonth}${nowdate}`;
  const targetPath = path.join(process.env.UPLOAD_ANNOUNCE, dateFolder);
  try {
    // 確保目錄存在，若不存在則建立
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    if (req.files && req.files.length > 0) {
      // 遍歷上傳的所有圖片，將其保存到資料庫中
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const filename = file.originalname;

        const converted = Buffer.from(filename, "latin1").toString("utf-8"); // 將文件名轉換為 URL 安全的格式

        // 彙整文件名稱
        const FilterFileName = converted !== filename ? converted : filename;

        // 匹配 YYYYMMDD-title-流水號.ext 格式
        // const match = FilterFileName.match(
        //   /^(\d{8}-[a-zA-Z0-9_-]+)-\d+\.[^.]+$/
        // );
        // 支援允許中文（加上 Unicode 字元）
        // const match = FilterFileName.match(
        //   /^(\d{8}-[\u4e00-\u9fa5a-zA-Z0-9_-]+)-\d+\.[^.]+$/
        // );

        //支持所有漢字字符以及數字和字母
        const match = FilterFileName.match(
          /^(\d{8}-[\p{Script=Han}\w_-]+)-\d+\.[^.]+$/u
        );

        if (!match || !match[1]) {
          return res
            .status(400)
            .send(
              `檔名格式 ${FilterFileName}錯誤，應為 YYYYMMDD-title-序號.ext`
            );
        }

        prefix = match[1]; // e.g. '20250721-cool'

        // 先刪除 uploads/YYYYMMDD 資料夾中所有與 prefix 相符的檔案,迴圈第一次全刪除
        if (i === 0) {
          const filesInFolder = fs.readdirSync(targetPath);
          for (const existingFile of filesInFolder) {
            if (existingFile.startsWith(prefix + "-")) {
              fs.unlinkSync(path.join(targetPath, existingFile));
            }
          }
        }

        // 將新檔案寫入磁碟
        const filePath = path.join(targetPath, FilterFileName);
        fs.writeFileSync(filePath, file.buffer);

        photo_paths.push(filePath); // 將檔案路徑保存到 photo_paths 陣列中
      }
    }

    // for (let k = 0; k < photo_paths.length; k++) {
    //   console.log(`存取檔案list ->${k}  = ` + photo_paths[k].toString().trim(""));
    // }

    //將上傳資訊存入SQL 後續追蹤查看
    let sql = `INSERT INTO hr.bulletinboard (memberID, name, title, submit_belongarea, filenames,cansee_area, already_view, upload_date,causereason) VALUES (?, ?, ?, ?, ?, ?, ? ,CURRENT_TIMESTAMP ,?) 
               ON DUPLICATE KEY UPDATE
                  filenames = ?,
                  cansee_area = ?,
                  causereason = ?`;

    const sqlParams = [
      annou_request_body.memberID,
      annou_request_body.name,
      annou_request_body.title,
      annou_request_body.submit_belongarea,
      photo_paths.join(", "), // 將圖片路徑陣列轉換成字串，用逗號分隔
      annou_request_body.cansee_area,
      "",
      annou_request_body.causereason,

      // 這是 for ON DUPLICATE KEY UPDATE 的值
      photo_paths.join(", "),
      annou_request_body.cansee_area,
      annou_request_body.causereason,
    ];

    await mysql_config.query(sql, sqlParams);

    //等待0.5秒鐘
    delay(500);

    //查詢目前最新提交序號+標題 ,將URL連結傳送DisCord通知
    const sql_ID = `SELECT id FROM hr.bulletinboard where memberID=${annou_request_body.memberID} and title ='${annou_request_body.title}' and upload_date like '${newSheetName}';`;

    const [submit_id] = await mysql_config.query(sql_ID);

    const submitID = submit_id[0].id;

    console.log("submitID = " + submitID);

    const message = `
    ----------------
     公告通知部門:${annou_request_body.cansee_area}
     標題: ${annou_request_body.title}
     發布日期: ${newSheetName}
	   連結: ${process.env.web_BulletinBoard}/${submitID}-${annou_request_body.title}
    ----------------
      `;
    //本機端連結測試
    // http://localhost:3000/bulletinboard_confirm/${submitID}-${annou_request_body.title}

    const config_Discord = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${process.env.discord_botToken}`,
      },
    };

    const BulletinBoard_REQUEST_URL = `${process.env.discord_BulletinBoard}`;

    await axios.post(
      BulletinBoard_REQUEST_URL,
      { content: message },
      config_Discord
    );
    console.log("公告通知訊息及連結已經提交訊息內容委託DisCord");

    res.status(200).send({
      message: `標題:"${annou_request_body.title}"->公告提交成功`,
    });
  } catch (error) {
    // disconnect_handler(db);
    console.error("公告提交錯誤:", error);
    res.status(500).json({ message: "公告提交錯誤" });
  }
});

// router.use((req, res, next) => {
//   console.log(
//     `[${new Date().toISOString()}] 接收到請求: ${req.method} ${req.originalUrl}`
//   );
//   next();
// });

//公告提交檢視
router.post("/announce_record", async (req, res) => {
  const view_body = req.body;

  // console.log("接收公告提交檢視參數 = " + JSON.stringify(view_body, null, 2));

  const group_area = view_body.group_area;
  const st_date = view_body.sortStartDate;
  const ed_date = view_body.sortEndDate;

  const area_search = group_area.includes("全公告") ? "全部" : group_area;

  try {
    const sql_view = `select * FROM hr.bulletinboard where  date(upload_date)  between '${st_date}' AND '${ed_date}' AND 
    cansee_area LIKE '%${area_search}%' order by id desc;`;

    //檢視某區域公告呈現(依照實際日期區間)
    const [bulletinboard_raw] = await mysql_config.query(sql_view);

    // console.log(
    //   `檢視${group_area} 公告內容為->` +
    //     JSON.stringify(bulletinboard_raw, null, 2)
    // );

    const bulletinboard_adjust = bulletinboard_raw.map((row) => ({
      ...row,
      upload_date: formatDateToTaiwanTime(row.upload_date),
    }));

    res.status(200).send({
      data: bulletinboard_adjust,
      message: `檢視${group_area} 公告內容成功!`,
    });
  } catch (error) {
    console.error("公告檢視錯誤:", error);
    res.status(500).json({ message: "公告檢視錯誤" });
  }
});

//公告title檢閱
router.get("/announce_titlecheck", async (req, res) => {
  const { titleKey, memberID } = req.query;

  // console.log("標題路由參數=" + titleKey + " 登入ID=" + memberID);

  const id = titleKey.split("-")[0].trim();
  const tiite = titleKey.split("-")[1].trim();

  try {
    const sql_titileview = `select * FROM hr.bulletinboard where  id=${id} AND  title ='${tiite}' `;

    //檢視某區域公告呈現
    const [board_title_raw] = await mysql_config.query(sql_titileview);

    // console.log("取得欄位內容:" + JSON.stringify(board_title_raw, null, 2));

    res.status(200).json(board_title_raw);
  } catch (error) {
    console.error(`公告檢視${tiite}錯誤:`, error);
    res.status(500).json({ message: "公告檢視錯誤" });
  }
});

//更新已經閱覽公告欄的人員(目前用工號紀錄)
router.post("/view_checkrecord_memid", async (req, res) => {
  const viewstatus = req.body;

  // console.log(
  //   "目前確認傳送後端組態資訊為= " + JSON.stringify(viewstatus, null, 2)
  // );

  // const memberid = String(viewstatus.memberid).padStart(3, "0");
  //const memberid = String(parseInt("0000003"));
  const memberid = String(viewstatus.memberid);
  const board_ID = viewstatus.board_ID;
  const board_title = viewstatus.board_title;

  try {
    const sql_viewtrue = `select already_view FROM hr.bulletinboard where id=${board_ID} AND  title ='${board_title}'`;

    //檢視已經閱覽有無內容
    const [board_already_raw] = await mysql_config.query(sql_viewtrue);

    if (board_already_raw.length === 0) {
      return res
        .status(404)
        .json({ error: "board_already_raw Record not found" });
    }

    const currentView = board_already_raw[0].already_view || ""; // 可能是 null

    // 拆成陣列，並轉成字串類型做比對
    const viewArray = currentView ? currentView.split(",") : [];

    console.log("目前已閱覽ID list = " + viewArray);

    //檢視memberid 登入ID公告瀏覽紀錄情形判定
    if (!viewArray.includes(memberid)) {
      viewArray.push(memberid);
      const updatedView = viewArray.join(",");

      const sql_updateview_memid = `UPDATE hr.bulletinboard SET already_view ='${updatedView}' where id=${board_ID} AND  title ='${board_title}'`;

      // console.log("sql_updateview_memid = " + sql_updateview_memid);

      //更新閱覽欄位already_view ->增加memberid
      const [update_raw] = await mysql_config.query(sql_updateview_memid);

      res.status(200).json({
        message: `更新${viewstatus?.memberid || "?未知號"}已閱覽紀錄完畢`,
      });
    } else {
      res.status(201).json({
        message: `ID:${
          viewstatus?.memberid || "?未知號"
        } already exists, no update needed`,
      });
    }
  } catch (error) {
    console.error(`${viewstatus} 更新已經閱覽程序異常錯誤:`, error);
    res.status(500).json({ message: "更新閱覽程序錯誤" });
  }
});

//檢閱公告已被讀取紀錄人員清冊
router.get("/check_announce", async (req, res) => {
  const {
    Name,
    inputType,
    sortStartDate,
    sortEndDate,
    page = 1,
    pageSize = 25,
    isChecked,
  } = req.query;


  console.log (
  "check_announce 有再跑 : " ,
    "接收參數為 Name=" + Name +
  " inputType=" + inputType +
  " sortStartDate=" + sortStartDate +
  " sortEndDate=" + sortEndDate +
  " page=" + page +
  " pageSize=" + pageSize +
  " isChecked=" + isChecked
  );

  let connection = null;
  const limit = parseInt(pageSize, 10);
  const offset = (parseInt(page, 10) - 1) * limit;

  let sql = "";
  let params = [];
  let inputValue = Name;
  let have_view = "";

  // 轉換進入的時間
  let startDate_Year = String(sortStartDate).trim().split("-")[0].slice(-2);
  let startDate_Month = String(sortStartDate).trim().split("-")[1];
  let startDate_Day = String(sortStartDate).trim().split("-")[2];
  let sortStart = `${startDate_Year}-${startDate_Month}-${startDate_Day}`;

  let endDate_Year = String(sortEndDate).trim().split("-")[0].slice(-2);
  let endDate_Month = String(sortEndDate).trim().split("-")[1];
  let endDate_Day = String(sortEndDate).trim().split("-")[2];
  let sortEnd = `${endDate_Year}-${endDate_Month}-${endDate_Day}`;

  // console.log(
  //   "sortStartDate : " +
  //     sortStart +
  //     "|" +
  //     "sortEndDate : " +
  //     sortEnd +
  //     "limit : " +
  //     limit +
  //     "offset : " +
  //     offset
  // );

  if (inputType === "all" || (inputType === "text" && inputValue === "all")) {
    sql = `SELECT * FROM bulletinboard WHERE upload_date BETWEEN ? AND ? ORDER BY upload_date DESC LIMIT ? OFFSET ?`;
    params = [sortStart, sortEnd, limit, offset];
  } else if (inputType === "text") {
    //目前不支援名字查詢閱覽公告紀錄
    // return res.status(401).json({
    //   message: "不支援工號以外查詢,錯誤",
    // });
    sql = `SELECT * FROM bulletinboard WHERE cansee_area LIKE CONCAT('%', ?, '%')  AND upload_date BETWEEN ? AND ? ORDER BY upload_date DESC LIMIT ? OFFSET ?`;
    params = [inputValue, sortStart, sortEnd, limit, offset];
  } else if (inputType === "number") {
    //當輸入不為數值
    if (isNaN(inputValue)) {
      return res.status(402).json({
        message: "偵測輸入為非數值,錯誤!",
      });
    }

    //inputValue = String(Name).padStart(3, "0");

    // console.log("isChecked 接收= " + isChecked);

    //使用工號查詢  inputValue = 101 或 1..
    have_view =
      isChecked === "true"
        ? `FIND_IN_SET('${inputValue}', already_view) > 0 `
        : `(FIND_IN_SET('${inputValue}', already_view) = 0 OR FIND_IN_SET('${inputValue}', already_view) IS NULL) `;

    sql =
      `SELECT * FROM bulletinboard WHERE ` +
      have_view +
      ` AND upload_date BETWEEN ? AND ? ORDER BY upload_date DESC LIMIT ? OFFSET ?`;

    params = [sortStart, sortEnd, limit, offset];
  }

  try {
    connection = await mysql_config.getConnection();
    
    // 執行查詢 (改用 async/await)
    const [rows] = await connection.query(sql, params);

    for (let row of rows) {
      let time_real = "";
      if (row.upload_date) {
        time_real = moment(row.upload_date)
          .locale("zh-tw")
          .format("YYYY-MM-DD");
      }
      row.upload_date = time_real;
    }

    // 計算總筆數
    let sql_Count = "";
    let countParams = [];

    if (
      inputType === "all" ||
      (inputType === "text" && inputValue === "all")
    ) {
      sql_Count = `SELECT COUNT(*) AS totalCount FROM bulletinboard WHERE upload_date BETWEEN ? AND ?`;
      countParams = [sortStart, sortEnd];
    } else if (inputType === "text") {
      //目前只支援公司部門查詢閱覽公告紀錄
      sql_Count = `SELECT COUNT(*) AS totalCount FROM bulletinboard WHERE cansee_area LIKE CONCAT('%', ?, '%') AND upload_date BETWEEN ? AND ?`;
      countParams = [inputValue, sortStart, sortEnd];
    } else if (inputType === "number") {
      sql_Count =
        `SELECT COUNT(*) AS totalCount FROM bulletinboard WHERE ` +
        have_view +
        ` AND upload_date BETWEEN ? AND ? `;
      countParams = [sortStart, sortEnd];
    }

    if (!sql_Count || sql_Count.trim() === "") {
      console.warn("sql_Count 為空，可能是 inputType 條件不正確");
      return res.status(404).json({
        message: "目前不支援此查詢條件",
      });
    }

    // 執行計算總筆數查詢 (改用 async/await)
    const [countResult] = await connection.query(sql_Count, countParams);
    const totalRowsInbackend = countResult[0].totalCount;

    res.status(200).json({
      message: "查詢成功",
      data: rows,
      totalCount: totalRowsInbackend,
      page: parseInt(page, 10),
      totalPages: Math.ceil(totalRowsInbackend / parseInt(pageSize, 10)),
      receivedParams: {
        Name,
        inputType,
        sortStartDate,
        sortEndDate,
        isChecked,
      },
    });

    
  } catch (error) {
    console.error("發生錯誤", error);
    res.status(400).json({
      message: "取得資料錯誤",
    });
  }
  finally{
   if (connection) {
    try {
      connection.release();
    } catch (e) {
      try { connection.destroy(); } catch (_) {}
    }
  }
  }
});

router.get("/GetAllAbsent_managment" , async (req , res) =>{
  const {
    memberID,
    inputValue,
    sortStartDate,
    sortEndDate,
    page = 1,
    pageSize = 20
  } = req.query;

  console.log ("確認回傳參數資訊" , { memberID, inputValue, sortStartDate, sortEndDate, page, pageSize });

  let sql_FindAuth = `
  SELECT 
    memberID , 
    positionarea , 
    authPosition 
  FROM hr.absent_manager_roster 
  WHERE memberID = ? AND 
  nowIsManager = "1"
  `

  let posArea = []
  let authPos = []

  // 安全的 JSON 解析函数
  const safeJsonParse = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return [];
      
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        return [trimmed];
      }
    }
    
    return [];
  };

  try{
    const [authRows] = await mysql_config.query(sql_FindAuth , [memberID]);
    
    if (authRows.length === 0){
      return res.status(403).json({
        message: "無權限存取員工請假管理資料",
      })
    }

    posArea = safeJsonParse(authRows[0].positionarea);
    authPos = safeJsonParse(authRows[0].authPosition);
    console.log("取得請假管理權限區域及職位如下:" , { posArea , authPos });

    // 如果没有权限，返回空数据
    if (authPos.length === 0) {
      return res.status(200).json({
        message: "無管理權限",
        data: [],
        totalCount: 0,
        totalPages: 0,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      });
    }

    // 1. 构造 SQL 条件：使用 LIKE 匹配（兼容所有格式）
    // 支持: "內部資訊與MIS" 或 ["內部資訊與MIS"] 或 ["內部資訊與MIS", "廠長室-樹林"]
    const authConditions = authPos.map(() => 'authPosition LIKE ?');
    const authParams = authPos.map(pos => `%${pos}%`);

    // 从 schedule_reginfo 查找符合权限的员工 ID
    const sql_FindMembers = `
      SELECT DISTINCT memberID 
      FROM hr.schedule_reginfo 
      WHERE memberID IS NOT NULL 
        AND memberID != ''
        AND authPosition IS NOT NULL
        AND (${authConditions.join(' OR ')})
    `;
    
    const [members] = await mysql_config.query(sql_FindMembers, authParams);
    
    const matchedMemberIDs = [...new Set(
      members
        .map(m => String(m.memberID).replace(/^0+/, '') || '0')
        .filter(id => id && id !== '0')
    )];

    console.log(`找到 ${matchedMemberIDs.length} 位符合权限的员工`);

    if (matchedMemberIDs.length === 0) {
      return res.status(200).json({
        message: "無符合權限的員工資料",
        data: [],
        totalCount: 0,
        totalPages: 0,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      });
    }

    const memberIDFormats = new Set();
    matchedMemberIDs.forEach(id => {
      memberIDFormats.add(id); // 原格式: '1'
      memberIDFormats.add(String(id).padStart(5, '0')); // 5位: '00001'
    });
    const allMemberIDs = Array.from(memberIDFormats);
    
    let sql_TestQuery = `
      SELECT COUNT(*) as total, MIN(card_date) as minDate, MAX(card_date) as maxDate
      FROM hr_myabsent 
      WHERE memID IN (${allMemberIDs.map(() => '?').join(',')})
    `;
    const [testResult] = await mysql_config.query(sql_TestQuery, allMemberIDs);
    console.log('测试查询结果（不带日期条件）:', testResult[0]);
    
    let sql_GetAbsent = `
      SELECT * FROM hr_myabsent 
      WHERE memID IN (${allMemberIDs.map(() => '?').join(',')})
    `;

    const params = [...allMemberIDs];

    console.log('查询参数样例（原始）:', matchedMemberIDs.slice(0, 3));
    console.log('查询参数样例（所有格式）:', allMemberIDs.slice(0, 9));

    // 添加搜索条件
    if (inputValue && inputValue.trim() !== '') {
      const keyword = inputValue.trim();
      if (/^\d+$/.test(keyword)) {
        sql_GetAbsent += ` AND memID LIKE ?`;
        params.push(`%${keyword}%`);
      } else {
        sql_GetAbsent += ` AND Name LIKE ?`;
        params.push(`%${keyword}%`);
      }
    }

    // 日期格式转换：YYYY-MM-DD → YYMMDD (例: 2021-06-21 → 210621)
    const formatToYYMMDD = (dateStr) => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      if (isNaN(date)) return null;
      
      const yy = String(date.getFullYear()).slice(-2);
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return yy + mm + dd;
    };

    // 添加日期范围条件（card_date 格式为 YYMMDD）
    if (sortStartDate) {
      const startYYMMDD = formatToYYMMDD(sortStartDate);
      if (startYYMMDD) {
        sql_GetAbsent += ` AND card_date >= ?`;
        params.push(startYYMMDD);
        console.log('开始日期条件:', sortStartDate, '→', startYYMMDD);
      }
    }
    if (sortEndDate) {
      const endYYMMDD = formatToYYMMDD(sortEndDate);
      if (endYYMMDD) {
        sql_GetAbsent += ` AND card_date <= ?`;
        params.push(endYYMMDD);
        console.log('结束日期条件:', sortEndDate, '→', endYYMMDD);
      }
    }

    sql_GetAbsent += ` ORDER BY card_date DESC`;

    console.log('执行 SQL:', sql_GetAbsent);
    console.log('SQL 参数:', params);

    const [absentRecords] = await mysql_config.query(sql_GetAbsent, params);

    console.log(`查询到 ${absentRecords.length} 条请假记录`);

    // 分页处理
    const totalCount = absentRecords.length;
    const totalPages = Math.ceil(totalCount / parseInt(pageSize));
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const pagedRecords = absentRecords.slice(offset, offset + parseInt(pageSize));

    res.status(200).json({
      message: "取得所有員工請假管理資料成功",
      data: pagedRecords,
      totalCount,
      totalPages,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      matchedEmployees: matchedMemberIDs.length
    })

  }catch(error){
    console.error("取得所有員工請假管理資料錯誤", error);
    res.status(500).json({
      message: "取得所有員工請假管理資料錯誤",
      error: error.message
    });
  }
})

module.exports = router;
