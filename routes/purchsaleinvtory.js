const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
// 使用共用的資料庫連線池（標準做法，與 productBrochure.js 一致）
const dbcon = require(__dirname + "/../modules/mysql_connect.js"); // hr 資料庫
const dbmes = require(__dirname + "/../modules/mysql_connect_mes.js"); // mes 資料庫

// Promise wrapper for convenience
const dbconP = dbcon;

let dbpsi_run;
let viewdata_combine = [];

const select_DB_connect = async (dbname) => {
  // Use the shared pool from modules/mysql_connect.js for all DB selections.
  // Ensure dbpsi_run is set so psiPromise() returns a usable pool.

  switch (dbname) {
    case "mes":
      dbpsi_run = dbmes;
      break;
    case "hr":
      dbpsi_run = dbcon;
      break;
    default:
      null;
      break;
  }

  console.log(`Selected DB connection for: ${dbname}`);
  return dbpsi_run;
};

// 登入驗證
router.get("/login", async (req, res) => {
  const { userID, userPWD } = req.query;
  const sql = "SELECT * FROM pursainv_reginfo WHERE memberID = ?";
  try {
    const [results] = await dbconP.query(sql, [userID]);
    if (results.length === 0)
      return res.status(400).send(`工號:${userID}未註冊紀錄`);

    const psipasswd = results[0].psipasswd;
    const isPasswordMatch = await bcrypt.compare(userPWD, psipasswd);

    if (!isPasswordMatch) return res.status(401).send("密碼錯誤");

    const token = jwt.sign(
      { memberID: results[0].memberID },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    return res.status(200).json({ token });
  } catch (err) {
    console.error(err);
    return res.status(500).send("資料庫連結錯誤!");
  }
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

  try {
    const [result] = await dbconP.query(sql1, [userId]);
    if (result.length === 0) {
      return res.status(405).send(`無此工號:${userId},請確認人事資料表!`);
    }

    const [result2] = await dbconP.query(sqlpuch, [userId]);
    if (result2.length === 0) {
      console.log("沒有註冊此工號,請往下註冊!");
      const hashedPassword = await bcrypt.hash(password, 10);
      const sql_signup =
        "INSERT INTO pursainv_reginfo (memberID, psipasswd, memEmail, verifycode,memEmailpwd) VALUES (?,?,?,?,?)";
      try {
        await dbconP.query(sql_signup, [
          userId,
          hashedPassword,
          email,
          confirm_vrifycode,
          emailpwd,
        ]);
        return res.status(200).send({ message: "註冊成功" });
      } catch (err) {
        console.log(err.code);
        if (err.code === "ER_DUP_ENTRY")
          return res.status(400).send("帳號ID或 Email 已存在");
        return res.status(500).send("運行伺服器錯誤!");
      }
    } else {
      if (
        parseInt(result2[0].memberID) === parseInt(userId) ||
        result2.length > 0
      )
        return res.status(403).send(`工號:${userId}已註冊過!`);
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send("輸入例外錯誤");
  }
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

    try {
      const [result] = await dbconP.query(sqlphonenum, [userId]);
      if (result.length === 0) {
        return res.status(400).send(`此工號:${userId}未註冊過mobile電話號碼!`);
      }
      register_phonenumber = result[0].member_phone;
      console.log(`工號:${userId}->驗證之手機號碼為:${register_phonenumber}`);
    } catch (err) {
      console.log(`目前無此工號:${userId}手機號,空值` + err);
      return res
        .status(401)
        .send(`目前無此工號:${userId}手機號(空值),發送驗證失敗!`);
    }
  }

  //先從hr.pursainv_reginfo 資料庫table 找出該對應的email
  sqlreg =
    "select memEmail,memEmailpwd from pursainv_reginfo where memberID =?";

  try {
    const [result] = await dbconP.query(sqlreg, [userId]);
    if (result.length === 0)
      return res.status(400).send(`此工號:${userId}未註冊過紀錄!`);

    sql_verifyup =
      "UPDATE pursainv_reginfo SET verifycode = ? where memberID =?";
    const reg_confirm_mail = result[0].memEmail;
    const reg_confirm_mailpwd = result[0].memEmailpwd;
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    try {
      await dbconP.query(sql_verifyup, [verificationCode, userId]);
    } catch (err) {
      console.log(err.code);
      return res.status(401).send("驗證碼發送有錯誤!");
    }

    if (inputVerifymethod.indexOf("個人手機電話") !== -1) {
      try {
        const accountSid = process.env.twilio_accountSid;
        const authToken = process.env.twilio_authToken;
        const client = require("twilio")(accountSid, authToken);
        const adjust_phonenumber = register_phonenumber.toString().slice(1);
        console.log("調整後手機號碼為:" + adjust_phonenumber);

        //傳送簡訊驗證碼
        client.messages
          .create({
            body: `進銷存系統接收您的驗證碼是：${verificationCode}`,
            from: `${process.env.twilio_virtual_phone_number}`,
            to: `+886${adjust_phonenumber}`,
          })
          .then((message) => console.log(message.sid))
          .catch((err) => console.error(err));

        return res
          .status(200)
          .json(`驗證碼發送成功於手機號碼:${register_phonenumber}`);
      } catch (err) {
        console.error("Error member_phone input :", err);
        return res.status(404).send(`此碼:${verificationCode}驗證錯誤`);
      }
    } else {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: `${reg_confirm_mail}`, pass: `${reg_confirm_mailpwd}` },
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
          return res.status(404).send("郵件發送失敗!");
        } else {
          console.log("郵件發送成功", info.response);
          return res
            .status(200)
            .json(`驗證碼發送成功於信箱:${reg_confirm_mail}`);
        }
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send("輸入例外錯誤");
  }
});

// 重設密碼
router.post("/reset-password", async (req, res) => {
  const { userId, newpassword, verificationCode } = req.body;

  //先從hr.pursainv_reginfo 資料庫table 找出該對應的驗證碼
  const sqlcompare_verifi =
    "select verifycode from pursainv_reginfo where memberID =?";

  try {
    const [result] = await dbconP.query(sqlcompare_verifi, [userId]);
    const reg_confirm_verifycode = result[0].verifycode;
    if (reg_confirm_verifycode !== verificationCode) {
      return res.status(404).send(`此碼:${verificationCode}驗證錯誤`);
    }

    const hashedPassword = await bcrypt.hash(newpassword, 10);
    let sql_uppsipwd =
      "UPDATE pursainv_reginfo SET psipasswd = ? where memberID =?";
    try {
      await dbconP.query(sql_uppsipwd, [hashedPassword, userId]);
      return res.status(210).json("密碼已重設成功!");
    } catch (err) {
      console.log(err.code);
      return res.status(500).send("資料庫伺服器錯誤");
    }
  } catch (err) {
    console.error("Error ID input :", err);
    return res.status(444).send(`此碼:${verificationCode}驗證錯誤`);
  }
});

//索引指定FileName
router.get("/query_FileName", async (req, res) => {
  const { RadioValue, Rawtable, FileName_titleKey } = req.query;
  const FileKey = FileName_titleKey.queryfile;

  const dbp = await select_DB_connect(RadioValue);
  const sql_FileNameKey = `SELECT DISTINCT FileName FROM ${Rawtable} where FileName LIKE '%${FileKey}%'`;

  // console.log("sql_FileNameKey = " + sql_FileNameKey);

  try {
    if (!dbp) return res.status(500).json({ error: "DB pool not initialized" });
    const [results] = await dbp.query(sql_FileNameKey);
    return res.status(200).json(results);
  } catch (err) {
    console.error("FileKey query issue error :", err);
    return res
      .status(400)
      .json({ error: `FileKey query issue '%${FileKey}%'` });
  }
});

//索引FileName對應的搜尋資料
router.get("/view_FileName_raw", async (req, res) => {
  const { FormRawtable, RadioValue, File } = req.query;
  // console.log("FormRawtable =", FormRawtable);
  // console.log("RadioValue =", RadioValue);
  // console.log("File =", File);

  const dbp = await select_DB_connect(RadioValue);

  const sql_FileName_rawcount = `SELECT count(*) FROM ${FormRawtable} where FileName IN ${File} order by id`;

  try {
    if (!dbp) return res.status(500).json({ error: "DB pool not initialized" });

    const [countRes] = await dbp.query(sql_FileName_rawcount);
    let row_view_number = countRes[0]["count(*)"];
    console.log("sql_FileName_rawcount 取得數量 = " + row_view_number);

    const sql_FileName_raw = `SELECT * FROM ${FormRawtable} where FileName IN ${File} order by id`;
    const [results2] = await dbp.query(sql_FileName_raw);

    const sql3 = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${FormRawtable}' AND TABLE_SCHEMA = '${RadioValue}' ORDER BY ORDINAL_POSITION;`;
    const [results3] = await dbp.query(sql3);

    res
      .status(200)
      .json({ count: row_view_number, rawdata: results2, colname: results3 });
  } catch (err) {
    console.error("Error fetching FileName raw data:", err);
    return res
      .status(500)
      .json({ error: `Database error query RAW data IN ${File}` });
  }
});

//索引ID範圍內的搜尋資料
router.get("/view_rangeID_raw", async (req, res) => {
  const { FormRawtable, RadioValue, Start_ID, End_ID, ColViewID } = req.query;
  // console.log("req.query =", req.query);

  const dbp = await select_DB_connect(RadioValue);

  const sql_IDrange_count = `SELECT count(*) FROM ${FormRawtable} where ${ColViewID} between ${parseInt(
    Start_ID
  )} and ${parseInt(End_ID)};`;

  // console.log("query 測試: " + sql);
  // res.status(200).json({ message: "參數已收到" });
  try {
    if (!dbp) return res.status(500).json({ error: "DB pool not initialized" });

    const [countRes] = await dbp.query(sql_IDrange_count);
    let row_view_number = countRes[0]["count(*)"];
    console.log("sql_IDrange_count 取得數量 = " + row_view_number);

    const sql_IDrange = `SELECT * FROM ${FormRawtable} where ${ColViewID} between ${parseInt(
      Start_ID
    )} and ${parseInt(End_ID)};`;
    const [results2] = await dbp.query(sql_IDrange);

    const sql3 = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${FormRawtable}' AND TABLE_SCHEMA = '${RadioValue}' ORDER BY ORDINAL_POSITION;`;
    const [results3] = await dbp.query(sql3);

    res
      .status(200)
      .json({ count: row_view_number, rawdata: results2, colname: results3 });
  } catch (err) {
    console.error("Error fetching ID range data:", err);
    return res.status(500).json({
      error: `Database error query RAW data ${parseInt(
        Start_ID
      )} and ${parseInt(End_ID)}`,
    });
  }
});

// 查詢資料庫指定表單資料
router.get("/view_schematicraw", async (req, res) => {
  const { FormRawtable, RadioValue } = req.query;

  console.log("FormRawtable = " + FormRawtable);
  let sql2;

  const dbp = await select_DB_connect(RadioValue);

  const sql = `SELECT FLOOR(count(*)/1) as viewcount,'test' as type FROM ${FormRawtable}`;

  try {
    if (!dbp) return res.status(500).json({ error: "DB pool not initialized" });
    const [countRes] = await dbp.query(sql);
    let row_view_number = countRes[0]["viewcount"];
    if (row_view_number > 150000) row_view_number = 150000;
    sql2 = `SELECT * FROM ${FormRawtable} limit ${row_view_number}`;
    console.log("row_view_number = " + row_view_number);

    const [results2] = await dbp.query(sql2);
    const sql3 = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${FormRawtable}' AND TABLE_SCHEMA = '${RadioValue}' ORDER BY ORDINAL_POSITION;`;
    const [results3] = await dbp.query(sql3);
    return res
      .status(200)
      .json({ count: row_view_number, rawdata: results2, colname: results3 });
  } catch (err) {
    console.error("Error fetching schematic raw data:", err);
    return res
      .status(500)
      .json({ error: `Database error query row_view limit` });
  }
});
// 查詢資料庫中的所有表名
router.get("/search_psi_tables", async (req, res) => {
  const { RadioValue } = req.query;

  const dbp = await select_DB_connect(RadioValue);

  const sqlall_tables = `SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = '${RadioValue}'
`;

  try {
    if (!dbp) return res.status(500).json({ error: "DB pool not initialized" });
    const [results] = await dbp.query(sqlall_tables);
    const tableNames = results.map((row) => row.TABLE_NAME);
    return res
      .status(210)
      .json({ count: tableNames.length, tables: tableNames });
  } catch (err) {
    console.error("Error fetching table names:", err);
    return res.status(500).json({ error: "Database query error" });
  }
});

module.exports = router;
