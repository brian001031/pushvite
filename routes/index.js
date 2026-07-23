process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 未處理 Promise:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔥 未捕捉例外:', err);
});

try {
  require("ts-node").register({
    transpileOnly: true,
    compilerOptions: {
      module: "commonjs",
      esModuleInterop: true,
    },
  });
  // console.log("ts-node register ✓ 允許載入 TypeScript 路由");
} catch (err) {
  console.error("❌ 無法載入 ts-node，請先執行 npm install 並確認 ts-node 已安裝", err);
  process.exit(1);
}

require("dotenv").config();
//node.js微框架
const express = require("express");
//express的server
const app = express();

// app.use((req, res, next) => {
//   console.log(req.method, req.originalUrl);
//   next();
// });

//設定資料庫
const db = require(__dirname + "/modules/db_connect.js");
//保存照片
const multer = require("multer");
//設定jwt
const jwt = require("jsonwebtoken");

const cors = require("cors");
//跨網域 白名單 (允許前端 origin 並支援憑證)
const corsOptions = {
  origin: ['http://192.168.3.101:3000', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','X-Content-Range', 'ETag'],
  optionsSuccessStatus: 200
};
const iconv = require("iconv-lite");
// 全域啟用 CORS
app.use(cors(corsOptions));
// 明確允許 preflight (OPTIONS) 請求
app.options('*', cors(corsOptions));

// 開發環境下輸出 CORS 偵錯日誌，方便確認 Origin 與回應 header
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const origin = req.get('Origin') || req.get('origin');
    if (origin) {
      const allowed = Array.isArray(corsOptions.origin) ? corsOptions.origin.includes(origin) : corsOptions.origin === origin;
      console.log(`[CORS debug] ${req.method} ${req.path} - Origin: ${origin} allowed:${allowed}`);
    }
    next();
  });
}

//設定靜態資料夾
//app.use(express.static("public"));

// app.use(express.json());
app.use(express.json({
    limit:"50mb"
}));


app.use("/uploads", express.static("public/uploads"));

app.use("/factoryuploads", express.static("public/factoryuploads"));

//設定post部分

const myParser = require("body-parser");

//引入excel套件
const XLSX = require("xlsx");

//讀檔案
const fs = require("fs").promises;
const axios = require("axios");

//解析 JSON
app.use(myParser.json({
    limit:"50mb"
}));

app.use(myParser.urlencoded({ extended: true ,
    limit:"50mb"
}));

app.use(async (req, res, next) => {
  res.locals.auth = {};
  let auth = req.get("Authorization");

  if (auth && auth.indexOf("Bearer ") === 0) {
    console.log({ auth });
    auth = auth.slice(7);
    try {
      const payload = await jwt.verify(auth, process.env.JWT_SECRET);
      res.locals.auth = payload;
    } catch (err) {
      console.log("token解析有問題:", err);
    }
  }
  next();
});

// const dayjs = require("dayjs");
// const utc = require("dayjs/plugin/utc");
// const timezone = require("dayjs/plugin/timezone");

// //應用他
// dayjs.extend(utc);
// dayjs.extend(timezone);
// // 設置時區
// dayjs.tz.setDefault("Asia/Taipei");

//路由部分
app.get("/", (req, res) => {
  res.send("歡迎來到express");
});

//   const excelFilePath = "C:/Users/bh205/OneDrive/桌面/人員班別一覽表.xlsx";
//   let workbook = XLSX.readFile(excelFilePath);
//   let worksheet = workbook.Sheets["工作表1"];
//   const range = XLSX.utils.decode_range(worksheet["!ref"]);
//   // console.log(range);
//   const workData = [];
//   for (let index = 1; index <= range.e.r; index++) {
//     const id = worksheet[`A${index}`].v;
//     const name = worksheet[`B${index}`].v;
//     const work = worksheet[`C${index}`].v;
//     // console.log({ id: id, name: name, work: work });
//     workData.push({ id: id, name: name, work: work });
//   }

//   // 將 JSON 物件陣列轉換為 JSON 字串
//   const jsonString = JSON.stringify(workData, null, 2);

//   // 在控制台印出 JSON 字串
//   // console.log(jsonString);

//   // 將 JSON 字串回應給客戶端
//   res.json(workData);
// });

// app.post("/test", async (req, res) => {
//   const { message } = req.body;
//   console.log("hello");

//   try {
//     // 設定 Line Notify 的 API 請求參數
//     const config = {
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//         Authorization: `Bearer DDQkgqDLPadECteqSx0WCowjRC0pOLhLC4S1Qovx52H`,
//       },
//     };

//     // 呼叫 Line Notify API 來發送訊息

//     // 呼叫 Line Notify API 來發送訊息
//     await axios.post(
//       "https://notify-api.line.me/api/notify",
//       `message=${message}`,
//       config
//     );

//     res.status(200).send("Message sent successfully.");
//   } catch (error) {
//     console.error("Error sending message:", error);
//     res.status(500).send("Failed to send message.");
//   }
// });

app.get("/check", async (req, res) => {
  try {
    //先讀入excel
    const excelFilePath = process.env.excelFile;
    let workbook = XLSX.readFile(excelFilePath);
    let worksheet = workbook.Sheets["工作表1"];
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    console.log(range);
    const workData = [];
    for (let index = 2; index <= range.e.r + 1; index++) {
      try {
        const id = worksheet[`A${index}`].v;
        const name = worksheet[`B${index}`].v;
        const work = worksheet[`C${index}`].v;
        // console.log("Reading record:", { id: id, name: name, work: work });
        workData.push({ id: id, name: name, work: work });
      } catch (error) {
        console.error("Error reading record:", error);
      }
    }

    const shiftMap = {};
    workData.forEach((employee) => {
      shiftMap[employee.id] = employee.work;
    });
    // console.log(shiftMap);

    // 讀取資料檔案，並且轉換成 Big5 編碼
    const fileBuffer = await fs.readFile(process.env.ADEF);
    const fileContent = iconv.decode(fileBuffer, "Big5");

    // 將資料以換行符號分割成陣列
    let lines = fileContent.replace(/\r\n/g, "\n").split("\n");

    let data = [];
    //找出今天日期
    const today = new Date();
    const todayStr = `${today.getFullYear()}${(today.getMonth() + 1)
      .toString()
      .padStart(2, "0")}${today
      .getDate()
      .toString()
      .padStart(2, "0")}`.substring(2);

    // console.log(todayStr);
    // 迴圈遍歷每一行資料
    for (let line of lines) {
      // 將每一行資料以分號分割成陣列
      let fields = line.split(";");

      if (["014", "026", "039"].includes(fields[5]) && todayStr === fields[1]) {
        // 建立一個物件來儲存每一行資料的欄位
        let obj = {
          id: fields[0],
          date: fields[1],
          time: fields[2],
          name: fields[3],
          location: fields[4],
          location_code: fields[5],
          shift: shiftMap[fields[0]],
          state: "", // 初始化state字段
        };

        const shift = obj.shift;
        const time = parseInt(obj.time);

        if (shift === "早班" && time > 800 && time < 1700) {
          obj.state = "異常";
        } else if (shift === "常日班" && time > 830 && time < 1730) {
          obj.state = "異常";
        } else if (shift === "夜班") {
          if ((time > 2000 && time <= 2359) || (time >= 0 && time < 800)) {
            obj.state = "異常";
          } else {
            obj.state = "正常";
          }
        } else {
          obj.state = "正常";
        }
        // 將物件加入到 JSON 陣列中
        data.push(obj);
      }
    }

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

//讀取資料庫並顯示出員工

app.use("/employee", require(__dirname + "/routes/employees"));


//要區域資料
app.use("/zone", require(__dirname + "/routes/zone"));
//保存維修資料
app.use("/repair", require(__dirname + "/routes/repair"));
app.use("/factory", require(__dirname + "/routes/factory"));

app.use("/bento", require(__dirname + "/routes/bento"));

//交接班人員工作事項
app.use("/taskboard", require(__dirname + "/routes/taskboard"));

//資源回收
app.use("/recycle", require(__dirname + "/routes/recycle"));

//機器設備生產資訊追蹤
app.use("/equipment", require(__dirname + "/routes/equipment"));

//MES（製造執行系統）
app.use("/mes", require(__dirname + "/routes/mes"));

//purchase-sales-stock-management（進銷存系統）
app.use("/purchsaleinvtory", require(__dirname + "/routes/purchsaleinvtory"));

//條碼串接批號
app.use("/barcode", require(__dirname + "/routes/barcode"));

//排班系統
app.use("/schedule", require(__dirname + "/routes/schedule"));

//電化數據分析切換圖
app.use("/scatterdigram", require(__dirname + "/routes/scatterdigram"));

//電檢站分析數據呈現圖
app.use("/electricinspec", require(__dirname + "/routes/electricinspec"));

//MES（製造執行系統）-生產排程 各站設備細節資訊
//塗佈站
app.use(
  "/coatingAnode",
  require(__dirname + "/routes/equipmentonly/coatingAnode")
);

// 混漿站
app.use(
  "/mixingAnode",
  require(__dirname + "/routes/equipmentonly/mixingAnode")
);

//精封裝站
app.use("/edgefold", require(__dirname + "/routes/equipmentonly/edgefold"));

// 入殼站
app.use("/assembly", require(__dirname + "/routes/equipmentonly/assembly"));

//混槳站
app.use("/mixprocess", require(__dirname + "/routes/mixprocess"));

//大小烘箱
app.use("/oven", require(__dirname + "/routes/equipmentonly/oven"));

//正極模切
app.use(
  "/cuttingCathod",
  require(__dirname + "/routes/equipmentonly/cuttingCathod")
);

//負極模切
app.use(
  "/CuttingAnode",
  require(__dirname + "/routes/equipmentonly/CuttingAnode")
);

//疊片站
app.use("/stacking", require(__dirname + "/routes/equipmentonly/stacking"));

// 注液站
app.use("/injection", require(__dirname + "/routes/equipmentonly/injection"));

//常溫Aging(常溫倉靜置)
app.use("/rt_aging", require(__dirname + "/routes/equipmentonly/rt_aging"));

//32類分選判別
app.use("/sulting", require(__dirname + "/routes/equipmentonly/sulting"));

// 分容站
app.use("/capacity", require(__dirname + "/routes/equipmentonly/capacity"));

// HT aging(高溫倉)
app.use("/ht_aging", require(__dirname + "/routes/equipmentonly/ht_aging"));

// 除氣站 mes 副
app.use("/degassing", require(__dirname + "/routes/equipmentonly/degassing"));

// 分切負極
app.use(
  "/slittingAnode",
  require(__dirname + "/routes/equipmentonly/slittingAnode")
);

// 分切正極
app.use(
  "/slittingCathode",
  require(__dirname + "/routes/equipmentonly/slittingCathode")
);

//PF化成站
app.use(
  "/chemosynthesis",
  require(__dirname + "/routes/equipmentonly/chemosynthesis")
);

// 測試 token 用的
app.get("/test-token", (_req, res) => {
  // return res.json({ a: 1 });
  const output = {
    success: false,
    member_sid: "沒登入不能看唷",
  };
  const { auth } = res.locals;
  if (auth && auth.member_sid) {
    return res.json({ ...output, success: true, member_sid: auth.member_sid });
  }
  res.json(output);
});

//資料報修上傳s

// 產品資訊(FOR 客戶)
app.use("/productBrochure", require("./routes/productBrochure"));
app.use("/completeDataFind" , require("./routes/completeDataFind"));

app.use("/equipmentonly", require("./routes/equipmentonly/dataFetch"));

// 考勤系統
app.use("/absent", require("./routes/absent"));

// Debug 路由
app.use("/debug", require("./routes/debug"));



// 將 Z:\Upload_Data 映射為 /files 路徑
app.use(
  "/notifyfiles",
  express.static("Z:/Upload_Data") // 注意：Windows 路徑要寫成這樣
);

// 輾壓&分切 系統
app.use("/rollingRecord", require("./routes/rollingRecord.js"));

// 塗佈站紀錄系統
app.use("/coatingRecord", require("./routes/coatingRecord.js"));

// 將 W:/ 映射為 / 路徑
app.use("/SipSopIntorducefiles", express.static("W:/"));

// SIP,SOP,教學影片
app.use("/instructionalflow", require("./routes/instructionalflow"));

//無塵室內靜壓
app.use("/clean_roomdetect", require("./routes/clean_roomdetect"));


app.use("/onBoardConfirm", require("./routes/onBoardConfirm.ts"));

app.use("/checklist", require("./routes/checklist.tsx"));

// 連線池監控
app.use("/dbStatus" , require("./routes/dbStatus"));

//設定找不到頁面時顯示的畫面
app.use((req, res) => {res.status(404).send("<h1>404-找不到你要的網頁</h1>")});
  



//偵聽port
// const port = process.env.SERVER_PORT;
const port = process.env.PORT || 3009
// 明確傳入 port 與 host（避免錯誤使用逗號運算子造成傳入字串 '0.0.0.0'）
app.listen(port, '0.0.0.0', async () => {   
  console.log(`server port:${port}已經開始執行`);

  // 開發環境下才開啟 ngrok
  if (process.env.NODE_ENV !== "production") {
    try {
      const ngrok = require("ngrok");
      const url = await ngrok.connect({
        addr: port,
        authtoken: process.env.NGROK_AUTH_TOKEN,
      });
      global.ngrokUrl = url; // 儲存到環境變數中
      console.log(`🌐 ngrok 公開網址：${url}`);
      console.log(`👉 請使用此網址在前端設定 redirect_uri 或 API base URL`);
    } catch (err) {
      console.error("❌ 啟動 ngrok 失敗：", err);
    }
  }
});