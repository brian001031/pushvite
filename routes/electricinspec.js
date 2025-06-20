require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js");
const axios = require("axios");
const { Sequelize } = require("sequelize");
const _ = require("lodash");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const csv = require("fast-csv");
const { parse } = require("path");
const { google } = require("googleapis");
const path = require("path");
const ngrok = require("@ngrok/ngrok");


let oauth2Client = null; // 初始化 OAuth2 客戶端

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid", // 如果你還需要登入資訊，可保留
];

const dbcon = mysql.createPool({
  host: "192.168.3.100",
  user: "root",
  password: "Admin0331",
  database: "hr",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  multipleStatements: true,
});

const ngrokUrl = process.env.NGROK_PUBLIC_URL || "尚未啟動 ngrok";

router.get("/authurl", async (req, res) => {
  console.log("接收到/authurl的請求，生成授權 URL");

  try {
    const redirectUri = `${global.ngrokUrl}/oauth2callback`;

    oauth2Client = new google.auth.OAuth2(
      "",
      "",
      redirectUri
    );
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent", // 確保拿到 refresh_token
    });

    res.status(200).send({ url: authUrl });
    console.log("✅ 授權 URL 已生成:", authUrl);
  } catch (error) {
    res.status(500).send("❌ 生成授權 URL 時發生錯誤");
  }
});

router.get("/getapibaseURL", async (req, res) => {
  // const redirectUri = `${global.ngrokUrl}`;
  //  console.log(
  //   `接收到/getapibaseURL的請求，回傳 API 基礎 URL = " ${redirectUri}`
  // );

  const url = await ngrok.connect(3009); // 假設您的應用程式在 3009 埠上運行
  console.log(`ngrok 公開網址：${url}`);

  // 在此處設定您的 API 基礎 URL
  const redirectUri = `${url}`;

  console.log("✅ API 基礎 URL 已生成:", redirectUri);

  res.status(200).send({
    redUri: redirectUri,
    message: "✅ API 基礎 URL 已回傳",
  });
});

router.post("/oauth2callback", async (req, res) => {
  const { code, apiBase } = req.body;

  console.log("收到授權碼：", code);
  console.log("API 基礎 URL：", apiBase);

  try {
    const redirectUri = `${apiBase}/oauth2callback`;

    // 💡 在取得 token 時，明確指定 redirect_uri
    const { tokens } = await oauth2Client.getToken({
      code,
      redirect_uri: redirectUri,
    });

    oauth2Client.setCredentials(tokens);

    // ✅ 儲存 token（推薦儲存在資料庫或安全檔案中）
    // fs.writeFileSync("token.json", JSON.stringify(tokens, null, 2));

    res.status(200).send({
      message: "✅ Token 已儲存",
      tokens: tokens,
    });
  } catch (err) {
    console.error("❌ 取得 token 錯誤：", err);
    res.status(500).send("取得 token 發生錯誤");
  }
});

router.get("/get_thickweight_irocv", async (req, res) => {
  const { view_selectside, itemYear, itemMonth } = req.query;
  const uploadpath_echk = process.env.test_echk_batch;

  console.log(
    "接收到get_thickweight_irocv的請求：",
    "選擇站別為:" + view_selectside,
    itemYear,
    itemMonth
  );

  return res
    .status(200)
    .json("⚠️ 尚未實作 /get_thickweight_irocv 功能，請稍後再試");

  // try {
  //   const tokenData = fs.readFileSync("token.json", "utf8");
  //   oauth2Client.setCredentials(JSON.parse(tokenData));
  //   console.log("✅ Token 已載入");
  // } catch (e) {
  //   console.error("❌ 無法載入 token.json，請先走過 /authurl 流程");
  //   return res.status(401).send("⚠️ 尚未授權，請先走過 /authurl 流程");
  // }

  // const drive = google.drive({ version: "v3", auth: oauth2Client });

  // if (!fs.existsSync(uploadpath_echk)) {
  //   return res
  //     .status(400)
  //     .json({ error: "上傳路徑不存在：" + uploadpath_echk });
  // }

  // try {
  //   const driveRes = await drive.files.create({
  //     requestBody: {
  //       name: "echk_batch_export_1_500.csv",
  //       mimeType: "text/csv",
  //     },
  //     media: {
  //       mimeType: "text/csv",
  //       body: fs.createReadStream(uploadpath_echk),
  //     },
  //   });

  //   console.log("✅ 上傳成功:", driveRes.data);
  //   res.status(200).send({
  //     message: "電檢表格參數已接收",
  //     fileId: driveRes.data.id,
  //   });
  // } catch (err) {
  //   console.error("❌ 上傳檔案失敗:", err);
  //   if (err.response?.status === 401 || err.response?.status === 403) {
  //     return res.status(401).send("Token 權限不足，請重新授權 /authurl");
  //   }
  //   res.status(500).send("上傳失敗");
  // }
});

module.exports = router;
