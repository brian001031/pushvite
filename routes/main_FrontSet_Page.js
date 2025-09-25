const express = require("express");
const router = express.Router();
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");
const moment = require("moment-timezone");


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

//action (true/false) 控制MSSQL連結池開關 , platform 判斷站別 , query 提交查詢字串
async function connectToasrssvrASRS_HTBI(action, platform, query) {
  try {
    // 初始化連接池
    const pool = new ms_newsql.ConnectionPool(MS_dbConfig);

    // 建立連接池
    await pool.connect();
    // console.log("成功 Successfully connected to SQL Server!");

    // 關閉連接池
    if (!action) {
      await pool.close();
      // console.log("~關閉 disconnect to SQL Server~");
    }
  } catch (err) {
    console.error("Error connecting to SQL Server:", err);
  }
}

const mysql_config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
};


// 斷線重連機制
const disconnect_handler = (conn) => {
  console.log("重新回連DB機制啟動!");
  conn = mysql.createConnection(mysql_config);
  conn.connect((err) => {
    err && setTimeout("disconnect_handler()", 2000);
    console.log("2秒後重啟連線DB!");
  });

    conn.on("error", (err) => {
    count++;
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      console.log("err.code 訊息回饋有連線lodss");
      // db error 重新連線
      disconnect_handler(conn);
    } else if (count <= 2) {
      console.log("DB啟動執行!");
      disconnect_handler(conn);
    } else {
      count = 0;
      throw err;
    }
  });
}