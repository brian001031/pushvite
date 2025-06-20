import { useRef, useState, useEffect, useContext, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons"; // 引入顯示與隱藏圖標
import axios from "axios";
import dayjs from "dayjs";
import config from "../../config";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import { debounce } from "lodash";
import "./index.scss";

const USER_REGEX = /^[A-z][A-z0-9-_]{3,23}$/;
const PWD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%]).{8,24}$/;
const REGISTER_URL = "/register";

const ResetPassword = () => {
  const [isLogin, setIsLogin] = useState(false); // 是否顯示註冊畫面
  const [userId, setuserId] = useState("");
  const [newpassword, setNewPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [ischeckverify, setischeckverify] = useState(true); // 判斷是驗證碼否是為重設定模式
  const [isResetPassword, setIsResetPassword] = useState(false); // 判斷是否是重設密碼模式
  const [inputVerifymethod, setinputVerifymethod] = useState(""); // 切換驗證碼傳送方法存值
  //以下保留用--start
  const [message, setMessage] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  //--end
  //跳轉要用到的東西
  const navigate = useNavigate();

  // State 用來控制密碼是否顯示
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const verify_target = ["個人手機電話", "長庚能源e-mail"];
  const verifymethond = [];

  // 生成從verify_target訪問全部的驗證方式
  for (let i = 0; i < verify_target.length; i++) {
    verifymethond.push(verify_target[i]);
  }

  //註冊資訊( ID ,NewPassWord,VerifiCode, VerifiCodeMethond)
  const [values, setValues] = useState({
    ID: "",
    NewPassWord: "",
    VerifiCode: "",
    VerifiCodeMethond: "長庚能源e-mail",
  });

  const debouncedChange = useCallback(
    debounce((value) => {
      setVerificationCode(value);
    }, 5000),
    [] // 空依賴陣列確保 debounce 函數只創建一次
  );

  const handleChange = async (e) => {
    const { name, value } = e.target;
    setValues({ ...values, [name]: value });

    //輸入ID
    if (name === "ID") {
      setuserId(value);
    } //輸入新密碼
    else if (name === "NewPassWord") {
      setNewPassword(value);
    } // 處理驗證碼輸入
    else if (name === "VerifiCode") {
      // debouncedChange(value);
      setVerificationCode(value);
    } //切換驗證碼傳送方法
    else if (name === "VerifiCodeMethond") {
      setinputVerifymethod(value);
    }
  };

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  const SendVerifycode_coldelectric_email = async (e) => {
    // const verifynum = verificationCode;

    //過濾註冊的參數(ID,NEWPASSWORD)
    if (filter_resetpasswordInfo() === false) {
      console.log("判定filter_resetpasswordInfo有異常");
      return;
    }

    try {
      const response = await axios.get(
        // "http://localhost:3009/purchsaleinvtory/sendverifycode",
         `${config.apiBaseUrl}/purchsaleinvtory/sendverifycode`,
        {
          params: {
            userId: userId,
            inputVerifymethod: inputVerifymethod,
          },
        }
      );

      if (response.status === 200) {
        //console.log("回傳運行正常");
        toast.success(response.data);
      } else if (response.status === 400) {
        toast.error(`${userId}:工號沒有註冊過!`);
      } else if (response.status === 401) {
        toast.error("驗證碼更新有錯誤!");
      }

      // Object.entries(verifywork.editgroup).forEach(([key1, value]) => {});
    } catch (error) {
      // console.error("Error fetching data:", error);
      toast.error(error.response.data);
    }
  };

  const clear_resetpwd_Items = () => {
    setValues({
      ID: "",
      NewPassWord: "",
      VerifiCode: "",
    });
  };

  const filter_resetpasswordInfo = () => {
    // setFormData({ ...formData, repair_person: option.employee_name }); //將選項自動填入
    // setOptions([]); // 清空選項
    let checkfail = false;

    // 掃碼目前提供3位數
    const memberid = userId.replace(/[^\d]/);
    //當ID輸入為空或是字串型態有空白狀況
    if (memberid.length === 0 || !parseInt(memberid)) {
      toast.error("ID尚未輸入!");
      return checkfail;
    }
    // 當輸入不是數字型態或是符合數字型態但不是3位數格式
    if (parseInt(memberid) && memberid.length !== 3) {
      toast.error("員工ID號碼為3位數字,請重新輸入!");
      return checkfail;
    }
    //當新密碼輸入為空或是字串型態有空白狀況
    if (String(newpassword) === "") {
      toast.error("密碼尚未輸入!");
      return checkfail;
    }

    //當新密碼輸入長度小於5碼不給予通過PASS
    if (String(newpassword).length < 5) {
      toast.error("密碼長度最少5碼!");
      return checkfail;
    }

    //當驗證碼輸入有字元狀態時
    if (String(verificationCode) !== "") {
      setischeckverify(false); //確認驗證碼輸入flag 切為false
    } else {
      setischeckverify(true); //確認驗證碼輸入flag 切為true
    }

    // console.log("有近來useEffect ischeckverify = " + ischeckverify);
  };

  useEffect(() => {
    let checkfail = false;

    // console.log("最終確認重設密碼 ischeckverify= " + ischeckverify);
    //當要重設密碼驗證碼欄位判定,ischeckverify為false狀態
    if (!ischeckverify) {
      //當輸入有6字元狀態時
      if (verificationCode.length < 6 || String(verificationCode) === "") {
        toast.error("驗證碼最少6碼!");
        return checkfail;
      }
    }
  }, [ischeckverify, verificationCode]);

  // 重設密碼處理
  const handleResetPassword = async (e) => {
    e.preventDefault();

    //過濾註冊的參數(ID,NEWPASSWORD,VERIFYCODE)
    if (filter_resetpasswordInfo() === false) {
      console.log("判定filter_resetpasswordInfo有異常");
      return;
    }

    console.log(userId, newpassword, verificationCode);

    try {
      const response = await axios.post(
        // "http://localhost:3009/purchsaleinvtory/reset-password",
         `${config.apiBaseUrl}/purchsaleinvtory/reset-password`,
        {
          userId,
          newpassword,
          verificationCode,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      // setMessage("Password reset successful. You can now log in.");

      if (response.status === 210) {
        //console.log("更新密碼成功");
        clear_resetpwd_Items();
        toast.success("更新密碼成功");
        navigate("/purchase_sale_inventory");
      } else if (response.status === 404) {
        toast.error(response.data);
      } else if (response.status === 401) {
        toast.error("驗證碼更新有錯誤!");
      } else if (response.status === 500) {
        toast.error("資料庫伺服器錯誤!");
      }
      setIsResetPassword(false);
      setischeckverify(true); //重設密碼完切為true
    } catch (err) {
      setMessage("Error: " + err.response.data);
      toast.error(err.response.data);
    }
  };

  return (
    <div className="purchasesaleinventory">
      <div>
        <div>
          <p className="h1">進銷存系統-重設密碼</p>
        </div>
      </div>
      <div className="">
        <form onSubmit={handleResetPassword} className="flex-form">
          <div>
            <label htmlFor="ID">
              <strong>ID:</strong>
            </label>
            <input
              type="text"
              ID="text_ID"
              placeholder="輸入工號..."
              name="ID"
              value={values.ID}
              className="shift-input id"
              onChange={handleChange}
              // onChange={(e) => setValues({ ...values, ID: e.target.value })}
            />
          </div>
          <div className="mb-3 ">
            <label htmlFor="password">
              <strong>新密碼:</strong>
            </label>
            <input
              type={isPasswordVisible ? "text" : "password"} // 根據狀態決定密碼顯示還是隱藏
              placeholder="輸入新密碼..."
              name="NewPassWord"
              value={values.NewPassWord}
              className="password"
              onChange={handleChange}
              // onChange={(e) =>
              //   setValues({ ...values, NewPassWord: e.target.value })
              // }
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              style={{
                position: "relative",
                left: "5px",
                top: "2px",
                transform: "translateY(-10%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <FontAwesomeIcon icon={isPasswordVisible ? faEye : faEyeSlash} />
            </button>
          </div>
          <div className="mb-3 ">
            <label htmlFor="verifycode">
              <strong style={{ position: "relative", left: "50px" }}>
                {" "}
                請輸入驗證碼：
              </strong>
            </label>
            <input
              type="text"
              placeholder="輸入驗證碼6字元"
              name="VerifiCode"
              value={values.VerifiCode}
              style={{
                position: "relative",
                left: "38px",
                bottom: "-2px",
                transform: "translateY(-10%)",
              }}
              onChange={handleChange}
              // onChange={(e) =>
              //   setValues({ ...values, VerifiCode: e.target.value })
              // }
            />

            <button
              type="button"
              onClick={SendVerifycode_coldelectric_email}
              style={{
                position: "relative",
                left: "55px",
                bottom: "-2px",
                transform: "translateY(-10%)",
                background: "#BBFF00",
                cursor: "pointer",
              }}
              // className="buttonverify  rounded-0 button "
            >
              傳送驗證碼
            </button>
            <label
              style={{
                position: "relative",
                left: "230px",
                top: "15px",
                fontSize: "15px",
                fontFamily: "Arial",
                borderradius: "5px",
              }}
            >
              選擇驗證方法：
              <select
                name="VerifiCodeMethond"
                style={{
                  backgroundColor: "#000079",
                  position: "relative",
                  color: "#FFFFB9",
                  fontSize: "15px",
                  fontFamily: "Arial",
                  borderradius: "5px",
                }}
                value={values.VerifiCodeMethond}
                onChange={handleChange}
              >
                {verifymethond.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            style={{
              textAlign: "center",
              backgroundColor: "yellow",
              maxWidth: "120px",
              display: "inline-flex",
            }}
          >
            <button
              type="submit"
              className=" button-container w-100 rounded-0 button "
              style={{
                marginLeft: "20%",
                textAlign: "center",
                verticalAlign: "middle",
                position: "relative",
                display: "grid",
              }}
            >
              更新密碼
            </button>
            <br />
          </div>
          <p>
            {"(Go back to previous page)"}
            <br />
            <span className="signup">
              <Link href="/">
                <Link to={`/purchase_sale_inventory`}>回上一頁</Link>
              </Link>
            </span>
          </p>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
