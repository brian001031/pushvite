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

const PurchaseSaleInventory = () => {
  const [isLogin, setIsLogin] = useState(true); // 是否顯示登入畫面
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isResetPassword, setIsResetPassword] = useState(false); // 判斷是否是重設密碼模式
  // State 用來控制密碼是否顯示
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  //跳轉要用到的東西
  const navigate = useNavigate();

  const [values, setValues] = useState({
    MemberID: "",
    PassWord: "",
  });

  const data = [
    { name: "John", age: 30, city: "New York" },
    { name: "Jane", age: 25, city: "Los Angeles" },
  ];

  const jsonToExcel = (data) => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      data.map((row) => Object.values(row).join(",")).join("\n");
    return encodeURI(csvContent);
  };

  const downloadExcel = () => {
    const csvData = jsonToExcel(data);
    const link = document.createElement("a");
    link.setAttribute("href", csvData);
    link.setAttribute("download", "data.csv"); // 下載檔案名稱
    document.body.appendChild(link);
    link.click();
  };

  const toggleForm = () => setIsLogin(!isLogin);

  const clear_LoginItems = () => {
    setValues({
      MemberID: "",
      PassWord: "",
    });
  };

  // 切換顯示/隱藏密碼
  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  // 登入處理
  const handleLogin = async (e) => {
    e.preventDefault();

    //當前輸入註冊之工號ID及密碼
    let userID = values.MemberID;
    let userPWD = values.PassWord;
    // 掃碼目前提供3位數

    const memberid = userID.replace(/[^\d]/);

    //當ID輸入為空或是字串型態有空白狀況
    if (memberid.length === 0 || !parseInt(memberid)) {
      toast.error("ID尚未輸入!");
      return;
    }

    // 當輸入不是數字型態或是符合數字型態但不是3位數格式
    if (parseInt(memberid) && memberid.length !== 3) {
      toast.error("員工ID號碼為3位數字,請重新輸入!");
      return;
    }

    //當密碼輸入為空或是字串型態有空白狀況
    if (String(userPWD) === "") {
      toast.error("密碼尚未輸入!");
      return;
    }

    //當密碼輸入長度小於5碼不給予通過
    if (String(userPWD).length < 5) {
      toast.error("密碼長度不到5碼!");
      return;
    }

    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/purchsaleinvtory/login`,
        // "http://localhost:3009/purchsaleinvtory/login",
        {
          params: {
            userID: userID,
            userPWD: userPWD,
          },
        }
      );

      const data = response.data; /// 取設備生產資訊此陣列即可,陣列位置為0

      // console.log("接收token為 = " + data);

      if (response.status === 200) {
        //console.log("回傳運行正常");
        console.log("Token:", response.data.token);
        // 存到 sessionStorage
        sessionStorage.setItem("authToken", response.data.token);
        clear_LoginItems();
        toast.success("登入成功.");
        navigate("/psi_stock_management");
      }

      // setMessage("Login successful");
      // 登入成功後處理頁面跳轉
    } catch (err) {
      // setMessage("Login failed: " + err.response.data);
      toast.error(err.response.data);
    }
  };

  return (
    <div className="purchasesaleinventory">
      <div>
        <p className="h1">進銷存系統{isLogin ? "首頁" : "註冊"}</p>
      </div>
      <div className="">
        <form onSubmit={handleLogin} className="flex-form">
          <div className="mb-3 ">
            <label htmlFor="ID">
              <strong>ID</strong>
            </label>
            <input
              type="text"
              ID="text_ID"
              placeholder="輸入工號..."
              name="text_ID"
              value={values.MemberID}
              className="text_ID"
              style={{ width: "50%", marginLeft: "13%" }}
              onChange={(e) =>
                setValues({ ...values, MemberID: e.target.value })
              }
            />
          </div>
          <div>
            <label htmlFor="password">
              <strong>Password</strong>
            </label>
            <input
              type={isPasswordVisible ? "text" : "password"} // 根據狀態決定密碼顯示還是隱藏
              placeholder="輸入密碼..."
              value={values.PassWord}
              name="password"
              className="shift-input password"
              style={{
                width: "70%",
                padding: "10px",
                fontSize: "16px",
                paddingRight: "30px", // 留出空間給按鈕
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
              onChange={(e) =>
                setValues({ ...values, PassWord: e.target.value })
              }
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
              <FontAwesomeIcon icon={isPasswordVisible ? faEye : faEyeSlash} />
            </button>
          </div>
          <div
            style={{
              textAlign: "center",
              backgroundColor: "yellow",
              padding: "20px",
            }}
          >
            <button
              type="submit"
              className=" button-container w-100 rounded-0 button "
              style={{
                maxWidth: "100px",
                marginLeft: "5%",
                textAlign: "center",
                verticalAlign: "middle",
                position: "relative",
                display: "grid",
              }}
            >
              登入(Log in)
            </button>
            <br />
            <Link to="/purchase_sale_resetpassword">
              <button
                className="  button-container w-100 rounded-0 button "
                style={{
                  maxWidth: "100px",
                  marginLeft: "5%",
                  textAlign: "center",
                  verticalAlign: "middle",
                  position: "relative",
                  display: "grid",
                }}
              >
                重設密碼
              </button>
            </Link>
          </div>
          <p className="h2">
            第一次登入請先註冊
            <br />
            {"(Please register first when logging in for the first time)"}
            <br />
            <span className="login ">
              <Link href="/">
                {/* <a href="/purchase_sale_register">註冊</a> */}
                <Link to={`/purchase_sale_register`}>前往註冊</Link>
              </Link>
            </span>
          </p>
        </form>
      </div>

      {/* <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Age</th>
            <th>City</th>
          </tr>
        </thead>
        <tbody>
          {data.map((person, index) => (
            <tr key={index}>
              <td>{person.name}</td>
              <td>{person.age}</td>
              <td>{person.city}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={downloadExcel}>下載 Excel</button> */}
    </div>
  );
};

export default PurchaseSaleInventory;
