/* eslint-disable react-hooks/rules-of-hooks */
import React, { useState, useEffect } from "react";
import Table from "react-bootstrap/Table";
import { useNavigate, Form } from "react-router-dom";
import { Button } from "react-bootstrap";
import axios from "axios";
import config from "../../config";
import dayjs from "dayjs";
import "./index_puchsaleinv.scss";
//成功提示套件
import { toast } from "react-toastify";

const PsiStockManagement = () => {
  const [datas, setDatas] = useState([]);
  const [results, setresults] = useState([]);
  const [Inputvalue, setInputvalue] = useState("");
  const [isValidString, setIsValidString] = useState(true);
  const [Count, setCount] = useState(1);
  const [worksheet, setworksheet] = useState("");
  const [filteredData, setFilteredData] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(true); // 加載狀態
  const [RadioValue, setdRadioValue] = useState("");
  const [timeLeft, setTimeLeft] = useState(600); // 倒數時間(以'秒做偵測')
  let currentPageId = null;
  // 紀錄登入狀態 , 瀏覽器http會話存儲，關閉標籤頁或瀏覽器資料會自動清除
  let isLoggedIn_Session = sessionStorage.getItem("authToken");
  // 紀錄登入狀態 , 永久存儲，除非手動刪除或呼叫了刪除資料的方法，否則會永久儲存在使用者的裝置中
  let isLoggedIn = localStorage.getItem("authToken");

  // console.log("isLoggedIn_Session token 存取得為 = " + isLoggedIn_Session);
  const navigate = useNavigate();
  const [selectedDB, setSelectedDB] = useState({
    DB_HR: "",
    DB_MES: "",
  });

  useEffect(() => {
    // 啟動倒數計時
    const timer = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(timer); // 倒數結束
          //本地端長期儲存
          // if (isLoggedIn) {
          //   // 清除登入紀錄
          //   localStorage.removeItem("authToken");
          // }
          //瀏覽器會話http端暫時儲存
          if (isLoggedIn_Session) {
            // 清除登入紀錄
            sessionStorage.removeItem("authToken");
          }
          return navigate("/purchase_sale_inventory"); // 返回登入頁面
        }
        return prevTime - 1;
      });
    }, 1000); //timetick 為1000毫秒為一次偵測

    // 組件卸載時清理計時器
    return () => clearInterval(timer);
  }, [navigate]);

  // useEffect(() => {
  //   const handlePopState = () => {
  //     const authToken = localStorage.getItem("authToken");

  //     // 清除 authToken
  //     localStorage.removeItem("authToken");
  //     console.log("authToken 已清除");
  //     // 重定向到登入頁面
  //     navigate("/purchase_sale_inventory"); // 返回登入頁面
  //   };

  //   // 監聽 popstate 事件
  //   window.addEventListener("popstate", handlePopState);

  //   console.log();

  //   return () => {
  //     // 清除事件監聽器
  //     window.removeEventListener("popstate", handlePopState);
  //   };
  // }, [navigate]);

  // 當進入頁面時初始化
  window.addEventListener("DOMContentLoaded", () => {
    // eslint-disable-next-line no-restricted-globals
    if (!history.state) {
      // eslint-disable-next-line no-restricted-globals
      history.replaceState({ pageIndex: 0, pageId: "puchsaleinvter" }, "");
    }
  });

  window.addEventListener("popstate", function (event) {
    // console.log("完整的 event.state:", JSON.stringify(event.state, null, 2));

    const page_key = JSON.stringify(event.state.key);

    // console.log("event.key = " + JSON.stringify(event.state.key));

    //初始沒定義狀態
    if (page_key === undefined) {
      //上一頁
      isLoggedIn_Session = sessionStorage.getItem("authToken");

      console.log("isLoggedIn_Session 狀態為 = " + isLoggedIn_Session);

      if (isLoggedIn_Session !== null) {
        sessionStorage.removeItem("authToken");
        console.log("authToken 已清除");
      }
    } else {
      //下一頁
      // 判斷authToken 是否有效(成功登入之state)
      isLoggedIn_Session = sessionStorage.getItem("authToken");

      // console.log("下一頁isLoggedIn_Session狀態:" + isLoggedIn_Session);

      if (isLoggedIn_Session !== null) {
        sessionStorage.removeItem("authToken");
      }
      return navigate("/purchase_sale_inventory");

      // return isLoggedIn_Session === null
      //   ? navigate("/purchase_sale_inventory")
      //   : navigate("/psi_stock_management");
    }
  });

  const navigateTo = (url, pageId) => {
    currentPageId = pageId;
    // eslint-disable-next-line no-restricted-globals
    history.pushState({ pageId: pageId }, "", url);
  };

  // 格式化時間為 mm:ss
  const countdown_displayformat = (seconds) => {
    //當小於1小時內倒數
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${String(minutes).padStart(2, "0")}分:${String(secs).padStart(
        2,
        "0"
      )}秒`;
    } //大於1小時倒數
    else {
      //超過一天以上
      const day = Math.floor(seconds / (60 * 60 * 24));
      const day_div = Math.floor(seconds % (60 * 60 * 24));
      const hours_onday = Math.floor(day_div / (60 * 60));
      const hours_onday_div = Math.floor(day_div % (60 * 60));
      const minutes_onday = Math.floor(hours_onday_div / 60);
      const secs_onday = Math.floor(hours_onday_div % 60);
      //一天之內
      return `${day}天:${String(hours_onday).padStart(2, "0")}時:${String(
        minutes_onday
      ).padStart(2, "0")}分:${String(secs_onday).padStart(2, "0")}秒`;
    }
  };

  // 監聽 Radio Button 切換
  const handleRadioChange = async (e) => {
    const { name, value } = e.target;

    if (name === "DB_HR") {
      setSelectedDB({ ...selectedDB, [name]: "hr" });
      setdRadioValue("hr");
    } else if (name === "DB_MES") {
      setSelectedDB({ ...selectedDB, [name]: "mes" });
      setdRadioValue("mes");
    }
  };

  useEffect(() => {
    async function FindDB_Tablelist() {
      if (RadioValue) {
        // console.log("RadioValue 資料庫名稱= " + RadioValue);
        // 向後端請求資料標list數據
        try {
          setLoading(true);
          setTableData([]);
          const response = await axios.get(
            // `${config.apiBaseUrl}/purchsaleinvtory/search_psi_tables`,
            "http://localhost:3009/purchsaleinvtory/search_psi_tables",
            {
              params: { RadioValue: RadioValue },
            }
          );

          if (response.status === 210) {
            // console.log(" 總資料表單名稱list排序: " + response.data.tables);
            setTableData(response.data.tables); // 假設後端回傳 { tables: [...] }
          }
        } catch (err) {
          console.error("Error fetching data:", err);
        } finally {
          setLoading(false);
        }
      }
    }

    FindDB_Tablelist();
  }, [RadioValue]);

  // 處理按鈕點擊事件
  const handle_cov2CSV_uploadcloud_Click = async (tableName) => {
    try {
      setLoading(true);
      // const response = await axios.post(
      //   "http://localhost:3009/purchsaleinvtory/export-csv",
      //   // `${config.apiBaseUrl}/purchsaleinvtory/export-csv`,
      //   {
      //     tableName,
      //   },
      //   {
      //     headers: {
      //       "Content-Type": "application/json",
      //     },
      //   }
      // );
    } catch (err) {
      console.error("Error exporting CSV:", err);
      toast.error("產生 CSV 檔案失敗，請檢查後端日誌");
    } finally {
      setLoading(false);
    }
  };

  const clearDataItems = () => {};

  const handleBlur = () => {
    // 使用正則表達式檢查字串格式（這裡是簡單的例子）
    //const validStringRegex = /^[a-zA-Z\s]+$/; // 只允許字母和空格

    // 定義一個正則表達式來匹配特定的特殊符號  目前這邊針對YYYY-MM-DD 格式做解析
    const specialCharsRegex = /[,\"-]/;
    setIsValidString(specialCharsRegex.test(Inputvalue));
  };

  const hasSpecialChars = (str) => /[^a-zA-Z0-9\s]/.test(str);

  useEffect(() => {
    // 假設這裡是你的 API 請求

    const handleSearchtable_to_worksheet = async (e) => {
      const editnum = Inputvalue;
      try {
        const response = await axios.get(
          "http://localhost:3009/taskboard/checktaskworksheet",
          // `${config.apiBaseUrl}/taskboard/checktaskworksheet`,
          {
            params: {
              editnum: editnum, // 這邊搜尋編號回饋執行"日期"
            },
          }
        );

        const workseetname = response.data;

        console.log(workseetname);

        Object.entries(workseetname.editgroup).forEach(([key1, value]) => {
          const result_worksheet = Object.values(value.result[0]);
          const task_worksheet = result_worksheet
            .toString()
            .split(",")[0]
            .trim();

          // console.log(task_worksheet);

          //代表有判斷到-符號 (YYYY-MM-DD)
          if (hasSpecialChars(task_worksheet) === true) {
            setworksheet(task_worksheet);
            handleSearchtable_to_xls();
          }
        });
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    handleSearchtable_to_worksheet();
  }, []);

  useEffect(() => {
    //當 inputValue 改變時執行的副作用
    if (Inputvalue === "") {
      clearDataItems();
      return;
    }

    setFilteredData(results);
    //使用excel 回查 worksheet.id 工作表單名(editnum搭配當日確認數據)顯示表單
  }, [Inputvalue, results]);

  const handleSearchtable_to_xls = async (e) => {
    // console.log("要回傳的sheetname為 = " + worksheet);

    try {
      const response = await axios.get(
        "http://localhost:3009/taskboard/vieweditworksheet",
        // `${config.apiBaseUrl}/taskboard/vieweditworksheet`,
        {
          params: {
            worksheet: worksheet, // 這邊搜尋1 編號 或 日期
          },
        }
      );

      const edittask_content = response.data;

      // console.log(edittask_content);

      // edittask_content.map = new Map(
      //   edittask_content.map((item) => [item.id, item])
      // );

      setresults(edittask_content);

      // results.filter((data) => {
      //   return (
      //     typeof data.edit === "number" && data.edit.includes(Inputvalue)
      //   );
      // });

      //console.log(results);

      // const filterData = results.filter((item) => {});

      // const item ={
      //   item.id,item.edit   , item.name   ,  item.date   ,   item.time   ,   item.precautions   ,item.type
      //   }

      //    setData((prevData) => [...prevData, item]);

      //setresults(response.data);

      //console.log("datas = " + datas);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  return (
    <div className="purchasesalesstock">
      <div>
        <p className="headtitle">進銷存系統-轉換CSV </p>
      </div>
      {/* 資料庫選單 */}
      <div>
        <p className="countdown">
          倒數：{countdown_displayformat(timeLeft)} 後回到登入頁面
        </p>
      </div>
      <label className="database-select">選擇資料庫:</label>
      <br />
      {/* Radio Button 選項 */}
      <div className="radio-container ">
        <label className="radio-item">
          <input
            type="radio"
            name="DB_HR"
            value={selectedDB.DB_HR}
            checked={RadioValue === "hr"}
            onChange={handleRadioChange}
          />
          <p className="dbselect">HR(人事建立表)</p>
        </label>
        <label className="radio-item">
          <input
            type="radio"
            name="DB_MES"
            value={selectedDB.DB_MES}
            checked={RadioValue === "mes"}
            onChange={handleRadioChange}
          />
          <p className="dbselect">MES（製造執行系統）</p>
        </label>
      </div>
      <br />
      <br />
      <div class="table-wrapper">
        <Table striped bordered hover className="htag ">
          <thead>
            <tr className="tbadjust ">
              <th className="columnID">序號</th>
              <th className="columntablename">表單</th>
              <th className="columntask">作業</th>
            </tr>
          </thead>
          <tbody>
            {tableData.length > 0 &&
              tableData.map(
                (table, index) =>
                  // Check if the 'id' is not empty before rendering the table row
                  table[0] && (
                    <tr key={index}>
                      <td className="rowindex">{index}</td>
                      <td className="rowtable">{table}</td>
                      <td className="rowtabletask">
                        <button
                          className="buttoncsv"
                          onClick={() =>
                            handle_cov2CSV_uploadcloud_Click(table)
                          }
                        >
                          產生CSV
                        </button>
                      </td>
                    </tr>
                  )
              )}
          </tbody>
        </Table>
      </div>
    </div>
  );
};

export default PsiStockManagement;
