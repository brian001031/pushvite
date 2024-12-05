import { useRef, useState, useEffect, useContext } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons"; // 引入顯示與隱藏圖標
import axios from "axios";
import dayjs from "dayjs";
import config from "../../config";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import "./index.scss";

const USER_REGEX = /^[A-z][A-z0-9-_]{3,23}$/;
const PWD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%]).{8,24}$/;
const REGISTER_URL = "/register";

const PuchSaleInvRegister = () => {
  const [isLogin, setIsLogin] = useState(false); // 是否顯示註冊畫面
  const [userId, setuserId] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [emailpwd, setEmailPwd] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  // State 用來控制密碼是否顯示
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  //跳轉要用到的東西
  const navigate = useNavigate();

  //註冊資訊( ID , PassWord  ,Email )
  const [values, setValues] = useState({
    ID: "",
    PassWord: "",
    Email: "",
    VerifyCode: "000000",
    EmailPassWord: "",
  });

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  const countSpaces = (inputString) => {
    const spaces = inputString.match(/ /g);
    return spaces ? spaces.length : 0;
  };

  const filter_registerInfo = () => {
    // setFormData({ ...formData, repair_person: option.employee_name }); //將選項自動填入
    // setOptions([]); // 清空選項
    let checkfail = false;

    const email_keyword = "@coldelectric.com";

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
    //當密碼輸入為空或是字串型態有空白狀況
    if (String(password) === "") {
      toast.error("密碼尚未輸入!");
      return checkfail;
    }

    //當密碼輸入長度小於5碼不給予通過PASS
    if (String(password).length < 5) {
      toast.error("密碼長度最少5碼!");
      return checkfail;
    }

    //當email輸入為空狀況
    if (String(email) === "") {
      toast.error("電子郵件尚未輸入!");
      return checkfail;
    }

    //當email輸入不為長庚國際能源網域的狀態
    if (String(email).slice(-email_keyword.length) !== email_keyword) {
      toast.error("請輸入網域字尾->(@coldelectric.com)的mail!");
      return checkfail;
    }

    //當emailpassword輸入為空狀況
    if (String(emailpwd) === "") {
      toast.error("郵件程式密碼尚未輸入!");
      return checkfail;
    }

    //當輸入emailpassword格式不為如右狀況(ex:vwdm vixe yqff sgnw) 條件為3個空白數量格式才符合
    const spacenumber = countSpaces(String(emailpwd));

    // console.log("偵測空白數量為 = "+ spacenumber);

    if (spacenumber !== 3) {
      toast.error("請輸入格式:xxxx xxxx xxxx xxxx");
      return checkfail;
    }
  };

  const clear_registerItems = () => {
    setValues({
      ID: "",
      PassWord: "",
      Email: "",
      VerifyCode: "000000", // 保持默认值
      EmailPassWord: "",
    });
  };

  const handleChange = async (e) => {
    const { name, value } = e.target;
    setValues({ ...values, [name]: value });

    //輸入ID
    if (name === "ID") {
      setuserId(value);
    } //輸入密碼
    else if (name === "PassWord") {
      setPassword(value);
    } //輸入email
    else if (name === "Email") {
      setEmail(value);
    } else if (name === "EmailPassWord") {
      setEmailPwd(value);
    }
  };

  // 註冊處理
  const handleRegister = async (e) => {
    e.preventDefault();

    const confirm_vrifycode = values.VerifyCode.trim("");

    //過濾註冊的參數(ID,PASSWORD,EMAIL)
    if (filter_registerInfo() === false) {
      console.log("判定filter_registerInfo有異常");
      return;
    }

    try {
      const response = await axios.post(
        // "http://localhost:3009/purchsaleinvtory/register",
        `${config.apiBaseUrl}/purchsaleinvtory/register`,
        {
          userId,
          password,
          email,
          confirm_vrifycode,
          emailpwd,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      // console.log(response.status);

      if (response.status === 200) {
        //console.log("回傳運行正常");
        toast.success("註冊成功.");
        clear_registerItems();
        // setValues({
        //   ID: "",
        //   PassWord: "",
        //   Email: "",
        //   VerifyCode: "000000", // 保持默认值
        //   EmailPassWord: "",
        // });
      } else if (response.status === 403) {
        toast.error(`${userId}:工號已註冊過!`);
      }
    } catch (err) {
      // setMessage("Registration failed: " + err.response.data);
      toast.error(err.response.data);
    }
  };
  return (
    <div className="purchasesaleinventory">
      <div>
        <p className="h1">進銷存系統-{isLogin ? "首頁" : "註冊"}</p>
      </div>
      <div className="">
        <form onSubmit={handleRegister} className="flex-form">
          <div className="mb-3 ">
            <label htmlFor="ID">
              <strong>ID</strong>
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
          <div>
            <label htmlFor="password">
              <strong>Password</strong>
            </label>
            <input
              type={isPasswordVisible ? "text" : "password"} // 根據狀態決定密碼顯示還是隱藏
              placeholder="輸入密碼..."
              name="PassWord"
              value={values.PassWord}
              className="shift-input password"
              style={{
                width: "70%",
                padding: "10px",
                fontSize: "16px",
                paddingRight: "30px", // 留出空間給按鈕
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
              onChange={handleChange}
              // onChange={(e) =>
              //   setValues({ ...values, PassWord: e.target.value })
              // }
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              style={{
                position: "relative",
                left: "315px",
                bottom: "30px",
                transform: "translateY(-10%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <FontAwesomeIcon icon={isPasswordVisible ? faEyeSlash : faEye} />
            </button>
          </div>

          <div>
            <label htmlFor="email">
              <p className="h3">電子郵件</p>
            </label>
            <input
              type="email"
              ID="email"
              placeholder="輸入網域@coldelectric.com之Email"
              name="Email"
              value={values.Email}
              className="shift-input  "
              style={{
                width: "110%",
                padding: "10px",
                fontSize: "16px",
                paddingRight: "30px", // 留出空間給按鈕
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
              onChange={handleChange}
              // onChange={(e) => setValues({ ...values, Email: e.target.value })}
            />
          </div>
          <div className="mb-3 ">
            <label htmlFor="Mailpwd">
              <strong>郵件程式密碼</strong>
            </label>
            <input
              type="text"
              ID="text_mailpwd"
              placeholder="輸入郵件應用密碼..."
              name="EmailPassWord"
              value={values.EmailPassWord}
              className="shift-input id"
              onChange={handleChange}
              // onChange={(e) => setValues({ ...values, ID: e.target.value })}
            />
          </div>
          <div
            style={{
              textAlign: "center",
              backgroundColor: "yellow",
              maxWidth: "100px",
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
              送出
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

export default PuchSaleInvRegister;
