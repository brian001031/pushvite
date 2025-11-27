require("dotenv").config();
const express = require("express");
const router = express.Router();
const axios = require("axios");
const { Sequelize } = require("sequelize");
const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const moment = require("moment");
const { isUtf8 } = require("buffer");
const multer = require("multer");

// 支援多種符號分割（包含 / ／ 、 | ， , － 空白）
// const filter_split_flag = /[\/／\\、|，,－\s]+/;
// 支援分隔符：/ ／ | 、 （不包含逗號！）
const filter_split_flag = /[\/／|、－]+/;

//關鍵字前綴比對清單,符合就視為相同狀態
const prefixMatchKeys = ["阻值計算失敗,有空值導致"];

//支援的檢視檔案屬性
const validExtensions = [".pdf", ".mp4", ".mpeg4", ".mpg", ".mpeg"];
//const sopflow = process.env.PDF_MPEG_INTRODUCE_PATH;
const sopflow = "W:";
const checklist = "W:/CheckList";

const sideOptionPathMap = {
  CoatingCathode: `${sopflow}/正極塗佈`,
  cutting_cathode: `${sopflow}/正極模切`,
  cutting_anode: `${sopflow}/負極模切`,
  stacking: `${sopflow}/疊片`,
  assembly: `${sopflow}/入殼`,
  oven: `${sopflow}/真空大小烘箱`,
  injection: `${sopflow}/注液`,
  chemosynthesis: `${sopflow}/化成`,
  capacity: `${sopflow}/分容`,
  ht_aging: `${sopflow}/高溫倉靜置`,
  rt_aging: `${sopflow}/常溫倉靜置`,
  edgeFolding: `${sopflow}/精封`,
  sulting: `${sopflow}/分選判別`,
  mixingAnode: `${sopflow}/負極混漿`,
  mixingCathode: `${sopflow}/正極混漿`,
  slittingCathode: `${sopflow}/正極分條`,
  slittingAnode: `${sopflow}/負極分條`,
  rollingCathode: `${sopflow}/正極輥壓`,
  rollingAnode: `${sopflow}/負極輥壓`,
  
};

function checkPrefixMatch(error_item, message, prefixKeys) {
  const enable = prefixKeys.some((p) => error_item.includes(p));
  return enable && prefixKeys.some((p) => message.startsWith(p));
}

function normalizeText(str) {
  if (!str) return "";
  return (
    str
      // 全形轉半形（Full-width → Half-width）
      .replace(/[\uFF01-\uFF5E]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
      )
      // 全形空白 → 半形空白
      .replace(/\u3000/g, " ")
      // 移除多餘空白
      .trim()
    // 全部轉小寫
    // .toLowerCase()
  );
}
// 解析 error_record.txt 內容(分選判別站)
function parseErrorLog(ng_status, ng_select_date) {
  const ng_log_file = process.env.sulting_errorfile;
  const alldata = fs.readFileSync(ng_log_file, "utf-8");
  const sections = alldata.split(/-{5,}結束-{5,}/).filter(Boolean); //過濾空白項目
  const dateSet = new Set(); //  用來蒐集有NG紀錄的日期
  const results = [];

  // ✅ 分隔多符號支援（- , \ ／ 、 | ， －）
  const ngArray = Array.isArray(ng_status)
    ? ng_status
    : typeof ng_status === "string"
    ? ng_status
        .split(filter_split_flag)
        .map((s) => normalizeText(s))
        .filter(Boolean)
    : [];

  //只將有錯誤訊息的行記錄下來
  sections.forEach((section) => {
    const dateMatch = section.match(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}/);
    const date = dateMatch ? dateMatch[1] : null;
    const date_add_calendar = dateMatch
      ? moment(dateMatch[1], "YYYY-MM-DD").format("YYYY-MM-DD")
      : null;

    if (!date) return; //無日期則跳過

    //確認選單或是日期篩選條件
    const nodateFilter = ng_select_date.trim() === "" || !ng_select_date;

    // 年月日篩選條件
    const dateFilter =
      date_add_calendar &&
      date_add_calendar === ng_select_date.trim() &&
      ng_select_date.trim() !== ""
        ? true
        : false;

    // if (ng_select_date && ng_select_date.trim() !== "" && !dateFilter) {
    //   return; // 若有指定篩選日期且不符合，則跳過
    // } else {
    //   console.log("符合篩選日期條件結果 = " + dateFilter);
    //   console.log("符合篩選日期條件 date_add_calendar = " + date_add_calendar);
    // }

    //異常檔案列蒐集
    const fileLines = section.match(/([A-Z0-9_]+\.csv)\s+(.+)/g);

    if (fileLines) {
      fileLines.forEach((line) => {
        const [filename, message] = line.split(/\s+(.+)/);

        //模糊比對：正規化 message
        const normalizedMsg = normalizeText(message);

        // 🔹 若啟用前綴比對，才檢查 normalizedMsg 是否以該前綴開頭
        const isPrefixMatch = checkPrefixMatch(
          ngArray,
          normalizedMsg,
          prefixMatchKeys
        );

        // 判斷完整匹配
        const isFullMatch = ngArray.find((key) => normalizedMsg === key);

        // 若有指定篩選日期且不符合，則跳過
        // if (!nodateFilter && !dateFilter) {
        //   return;
        // }

        // 若 ngArray 為空，則不篩選，全部加入結果 或符合篩選條件的加入結果
        if (isPrefixMatch || ngArray.includes("All全部") || isFullMatch) {
          // if (isPrefixMatch) console.log("前綴匹配成功: " + normalizedMsg);
          dateSet.add(date_add_calendar);
          results.push({
            date,
            filename,
            error_status: normalizedMsg || "未制定狀態 (前綴匹配)",
          });
          // return; // 已匹配前綴，跳過後續判斷
        }
      });
    }
  });

  return {
    allinfo: results, // 符合條件的錯誤紀錄
    log_date: Array.from(dateSet).sort((a, b) => new Date(a) - new Date(b)), // 所有出現過的日期(最早到最新)
  };
}

//API：根據 sideOption 傳回檔案清單
router.get("/mes_flowalldata", (req, res) => {
  const sideOption = req.query.section;

  console.log("接收sideOption = " + sideOption);
  const folderPath = sideOptionPathMap[sideOption];

  if (!folderPath) {
    return res.status(400).json({ error: "Invalid option and Not find Path" });
  }

  console.log("folderPath = " + folderPath);

  const side_path_name = folderPath.split("/")[1];

  console.log("side_path_name = " + side_path_name);

  fs.readdir(folderPath, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Unable to read folder" });
    }

    const filtered = files.filter((file) => {
      return validExtensions.includes(path.extname(file).toLowerCase());
    });

    const response = filtered.map((file) => {
      const ext = path.extname(file).toLowerCase();
      const type = ext === ".pdf" ? "pdf" : "video";
      //   const relativePath = path
      //     .relative(basePath, fullPath)
      //     .replace(/\\/g, "/");
      return {
        name: file,
        type: type,
        url: `/SipSopIntorducefiles/${side_path_name}/${encodeURIComponent(
          file
        )}`, // e.g. /SipSopIntorducefiles/疊片/file.pdf
      };
    });

    res.status(200).json(response);
  });
});

//取得error_record.txt NG狀態記錄文本內容
// router.get("/ng_record_content", (req, res) => {
//   const { errorstatus, runlogDate, sideoption } = req.query; // 篩選條件 (錯誤狀態,站別)

//   const ng_error_status = decodeURIComponent(req.query.errorstatus || "");
//   // console.log("type of errorstatus = " + typeof errorstatus);
//   // console.log("解析URL原型態為:" + ng_error_status);

//   const error_item = Array.isArray(ng_error_status)
//     ? ng_error_status
//         .split(filter_split_flag)
//         .map((s) => s.trim())
//         .filter(Boolean)
//     : ng_error_status; //支援多選錯誤狀態

//   // console.log("重配置 error_item = " + error_item);
//   // console.log("異常發生日期 = " + runlogDate);
//   // console.log("異常接收站選項站別 = " + sideoption);

//   //分選判別站 error_record.txt 路徑
//   if (sideoption.includes("sulting")) {
//     const data = parseErrorLog(error_item, runlogDate);

//     // console.log("data.allinfo  = " + JSON.stringify(data.allinfo, null, 2));
//     console.log(
//       "異常選單相關回傳數量:" +
//         data.allinfo.length +
//         "  異常紀錄日期  = " +
//         data.log_date.length +
//         "筆 -> " +
//         data.log_date[0] +
//         " ~ " +
//         data.log_date.slice(-1) +
//         "\r\n" +
//         " 異常日期列:" +
//         JSON.stringify(data.log_date, null, 2)
//     );

//     //無符合條件紀錄回傳提示
//     if (!data || data.allinfo.length === 0) {
//       console.log("無符合條件紀錄回傳提示");
//       return res.status(200).json({
//         message: "No matching records found",
//         allinfo: [],
//         log_date: [],
//       });
//     }

//     res.status(200).json(data);
//   } else {
//     res.status(200).json([]); //其他站別暫無資料
//   }
// });

module.exports = router;
