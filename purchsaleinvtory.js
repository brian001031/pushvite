require("dotenv").config();
const express = require("express");
const router = express.Router();
const db = require(__dirname + "/../modules/db_connect.js");
const db2 = require(__dirname + "/../modules/mysql_connect.js");
const axios = require("axios");
const { Sequelize } = require("sequelize");
const _ = require("lodash");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2");
const multer = require("multer");
const crypto = require("crypto");
const { google } = require("googleapis");
const fs = require("fs");
const csv = require("fast-csv");
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio"

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

// 登入驗證
router.get("/login", async (req, res) => {
  const { userID, userPWD } = req.query;

  // console.log(req.query);

  // console.log("userID接收為 = " + userID + " userPWD接收為 = " + userPWD);

  const sql = "SELECT * FROM pursainv_reginfo WHERE memberID = ?";
  dbcon.query(sql, [userID], async (err, results) => {
    if (err) return res.status(500).send("資料庫連結錯誤!");
    if (results.length === 0)
      return res.status(400).send(`工號:${userID}未註冊紀錄`);

    const psipasswd = results[0].psipasswd;

    // console.log("psipasswd = " + psipasswd);
    // console.log("userPWD = " + userPWD);
    const isPasswordMatch = await bcrypt.compare(userPWD, psipasswd);

    // console.log("isPasswordMatch 布林比對結果:" + isPasswordMatch);

    if (!isPasswordMatch) return res.status(401).send("密碼錯誤");

    const token = jwt.sign(
      { memberID: results[0].memberID },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );
    res.status(200).json({ token });
  });
});

// 註冊使用者
router.post("/register", async (req, res) => {
  const { userId, password, email, confirm_vrifycode, emailpwd } = req.body;
  //   console.log("全收到數據為: " + userId, password, email, confirm_vrifycode);
  //   const domain = email.split("@")[1];
  //   if (domain !== "指定的domain.com") {
  //     return res.status(400).send("Email 必須是指定的 domain");
  //   }

  //先確認是否有工號存在
  const sql1 = `SELECT * FROM hr_memberinfo WHERE memberID = ?`;
  const sqlpuch = `SELECT * FROM pursainv_reginfo WHERE memberID = ?`;

  dbcon.query(sql1, [userId], (err, result) => {
    if (err) {
      console.log("輸入例外錯誤" + err);
    } else {
      if (result.length === 0) {
        res.status(405).send(`無此工號:${userId},請確認人事資料表!`);
      } else {
        dbcon.query(sqlpuch, [userId], async (err, result2) => {
          //沒有註冊過,直接接續執行最下方query流程
          if (result2.length === 0) {
            console.log("沒有註冊此工號,請往下註冊!");
            const hashedPassword = await bcrypt.hash(password, 10);
            // console.log(
            //   userId + " - " + hashedPassword + " - " + email,
            //   confirm_vrifycode
            // );

            const sql_signup =
              "INSERT INTO pursainv_reginfo (memberID, psipasswd, memEmail, verifycode,memEmailpwd) VALUES (?,?,?,?,?)";
            dbcon.query(
              sql_signup,
              [userId, hashedPassword, email, confirm_vrifycode, emailpwd],
              (err, result3) => {
                if (err) {
                  console.log(err.code);
                  if (err.code === "ER_DUP_ENTRY") {
                    res.status(400).send("帳號ID或 Email 已存在");
                  } else {
                    res.status(500).send("運行伺服器錯誤!");
                  }
                } else {
                  res.status(200).send({ message: "註冊成功" });
                }
              }
            );
          } else {
            if (
              parseInt(result2[0].memberID) === parseInt(userId) ||
              result2.length > 0
            )
              res.status(403).send(`工號:${userId}已註冊過!`);
          }
        });
      }
    }
  });
});

// 忘記密碼,重發驗證碼
router.get("/sendverifycode", async (req, res) => {
  const { userId, inputVerifymethod } = req.query;
  let register_phonenumber, sqlreg, sql_verifyup;

  // console.log("userId = " + userId + " - 驗證方法為:" + inputVerifymethod);

  //若選擇手機驗證這邊先行確認是否有手機號碼
  if (inputVerifymethod.indexOf("個人手機電話") !== -1) {
    const sqlphonenum =
      "select member_phone from hr_memberinfo where memberID =?";

    dbcon.query(sqlphonenum, [userId], (err, result) => {
      if (err) {
        console.log(`目前無此工號:${userId}手機號,空值` + err);
        res
          .status(401)
          .send(`目前無此工號:${userId}手機號(空值),發送驗證失敗!`);
      } else {
        //搜無member_phone,判定尚未註冊過mobile電話號碼
        if (result.length === 0) {
          res.status(400).send(`此工號:${userId}未註冊過mobile電話號碼!`);
        } else {
          // console.log("result = " + JSON.stringify(result));
          register_phonenumber = result[0].member_phone;
          console.log(
            `工號:${userId}->驗證之手機號碼為:${register_phonenumber}`
          );
          //發送簡訊驗證碼
          // res
          //   .status(200)
          //   .send(`已發送驗證碼至手機號碼:${result[0].member_phone}`);
        }
      }
    });
  }

  //先從hr.pursainv_reginfo 資料庫table 找出該對應的email
  sqlreg =
    "select memEmail,memEmailpwd from pursainv_reginfo where memberID =?";

  dbcon.query(sqlreg, [userId], (err, result) => {
    if (err) {
      console.log("輸入例外錯誤" + err);
    } else {
      //搜無email,判定尚未註冊
      if (result.length === 0) {
        res.status(400).send(`此工號:${userId}未註冊過紀錄!`);
      } else {
        sql_verifyup =
          "UPDATE pursainv_reginfo SET verifycode = ? where memberID =?";
        // 註冊之(電子郵件 和 郵件程式密碼)
        const reg_confirm_mail = result[0].memEmail;
        const reg_confirm_mailpwd = result[0].memEmailpwd;
        // console.log(reg_confirm_mail + " - " + reg_confirm_mailpwd);
        const verificationCode = Math.floor(
          100000 + Math.random() * 900000
        ).toString();

        dbcon.query(
          sql_verifyup,
          [verificationCode, userId],
          async (err, result2) => {
            if (err) {
              console.log(err.code);
              res.status(401).send("驗證碼發送有錯誤!");
            } else {
              // console.log("result2 = " + JSON.stringify(result2));

              //使用個人手機號碼接收驗證碼
              if (inputVerifymethod.indexOf("個人手機電話") !== -1) {
                try {
                  const accountSid = process.env.twilio_accountSid;
                  const authToken = process.env.twilio_authToken;
                  const client = require("twilio")(accountSid, authToken);
                  const adjust_phonenumber = register_phonenumber
                    .toString()
                    .slice(1);
                  console.log("調整後手機號碼為:" + adjust_phonenumber);

                  //傳送簡訊驗證碼
                  client.messages
                    .create({
                      body: `進銷存系統接收您的驗證碼是：${verificationCode}`,
                      from: `${process.env.twilio_virtual_phone_number}`,
                      to: `+886${adjust_phonenumber}`,
                    })
                    .then((message) => console.log(message.sid));

                  res
                    .status(200)
                    .json(`驗證碼發送成功於手機號碼:${register_phonenumber}`);
                } catch (err) {
                  console.error("Error member_phone input :", err);
                  res.status(404).send(`此碼:${verificationCode}驗證錯誤`);
                }
              } // 使用長庚能源@coldelectric電子郵件接收驗證碼
              else {
                const transporter = nodemailer.createTransport({
                  service: "gmail",
                  auth: {
                    user: `${reg_confirm_mail}`,
                    pass: `${reg_confirm_mailpwd}`, // 使用生成的應用程式密碼
                  },
                });

                const mailOptions = {
                  from: `${reg_confirm_mail}`,
                  to: `${reg_confirm_mail}`,
                  subject: "更新進銷存系統密碼",
                  text: `您的驗證碼是：${verificationCode}`,
                };

                transporter.sendMail(mailOptions, (error, info) => {
                  if (error) {
                    console.error("郵件發送失敗", error);
                    res.status(404).send("郵件發送失敗!");
                  } else {
                    console.log("郵件發送成功", info.response);
                    res
                      .status(200)
                      .json(`驗證碼發送成功於信箱:${reg_confirm_mail}`);
                  }
                });
              }
            }
          }
        );
      }
    }
  });
});

// 重設密碼
router.post("/reset-password", async (req, res) => {
  const { userId, newpassword, verificationCode } = req.body;

  //先從hr.pursainv_reginfo 資料庫table 找出該對應的驗證碼
  const sqlcompare_verifi =
    "select verifycode from pursainv_reginfo where memberID =?";

  //先確認驗證碼是否一樣
  dbcon.query(sqlcompare_verifi, [userId], async (err, result) => {
    try {
      const reg_confirm_verifycode = result[0].verifycode;

      // console.log("reg_confirm_verifycode = " + reg_confirm_verifycode);

      //搜無email,判定尚未註冊
      if (reg_confirm_verifycode !== verificationCode) {
        res.status(404).send(`此碼:${verificationCode}驗證錯誤`);
      } else {
        // 驗證碼比對由前端處理後送出
        const hashedPassword = await bcrypt.hash(newpassword, 10);

        let sql_uppsipwd =
          "UPDATE pursainv_reginfo SET psipasswd = ? where memberID =?";
        dbcon.query(
          sql_uppsipwd,
          [hashedPassword, userId],
          async (err, result2) => {
            console.log("sql_uppsipwd = " + sql_uppsipwd);

            if (err) {
              console.log(err.code);
              return res.status(500).send("資料庫伺服器錯誤");
            } else {
              res.status(210).json("密碼已重設成功!");
            }
          }
        );
      }
    } catch (err) {
      console.error("Error ID input :", err);
      res.status(444).send(`此碼:${verificationCode}驗證錯誤`);
    }
  });
});

// 查詢資料庫中的所有表名
router.get("/search_psi_tables", (req, res) => {
  const { RadioValue } = req.query;
  // console.log("RadioValue 接收資料庫名稱為: " + RadioValue);
  const dbpsi_run = mysql.createConnection({
    host: "192.168.3.100",
    user: "root",
    password: "Admin0331",
    database: RadioValue,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    multipleStatements: true,
  });

  const sqlall_tables = `SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = '${RadioValue}'
`;

  dbpsi_run.query(sqlall_tables, (err, results) => {
    if (err) {
      console.error("Error fetching table names:", err);
      return res.status(500).json({ error: "Database query error" });
    }

    const tableNames = results.map((row) => row.TABLE_NAME);
    res.status(210).json({ count: tableNames.length, tables: tableNames });
  });
});

module.exports = router;
