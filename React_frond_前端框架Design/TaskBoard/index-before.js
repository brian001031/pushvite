import "./index.scss";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Card from "react-bootstrap/Card";
// import dayjs from "dayjs";
import config from "../../config";
import React, { useState, useEffect } from "react";
import moment from "moment";
import axios from "axios";
import { FaCheckCircle, FaExclamationCircle, FaTools } from "react-icons/fa";
import Table from "react-bootstrap/Table";
import CountdownTimer from "../../components/CountdownTimer";

//成功提示套件
import { toast } from "react-toastify";

const TaskBoard = () => {
  const [inputText, setinputText] = useState("");
  const [inputTexts, setinputTexts] = useState([]);
  const [currentTime, setcurrentTime] = useState("");
  const [date, setDate] = useState("");
  const [cardItems, setCardItems] = useState([]); // 保存所有時間項目
  const [memberName, setmemberName] = useState(""); //更新組件獲取的員工姓名
  const [precautions, setprecautions] = useState(""); //保存注意交班工作事項
  const [options, setOptions] = useState([]); //站台的下拉選項
  const [buttonClicked, setButtonClicked] = useState(null);
  const [editnum, seteditnum] = useState(0); //更新編號
  const [type, settype] = useState(""); //更新編號
  const [confirmdt, setconfirmdt] = useState([]); //保存確認日期時間
  const [confirmname, setconfirmname] = useState([]); //已經確認員工姓名
  const [Count, setCount] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [resetTimer, setResetTimer] = useState(false);
  const [dateTime, setDateTime] = useState(moment());

  const max_carditem_num = 4;

  // const [formData, setFormData] = useState({
  //   noticeitem: "", //班表注意事項
  //   searchname: "", //確認人員名稱
  //   datetime: "", // 已紀錄過確認時間
  // });

  const delayTime = 500; // 每次請求之間延遲  0.5秒

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const handleClick = (buttonId) => {
    setButtonClicked(buttonId);
  };

  const handleInputChange = (event) => {
    if (event.target.name === "input_id") {
      setinputText(event.target.value);
    } else if (event.target.name === "input_noticeitem") {
      setprecautions(event.target.value);
    } else if (event.target.name === "sidestatus") {
      setOptions(event.target.value);
    }

    // const { name, value } = event.target;
    // setFormData((prevState) => ({
    //   ...prevState,
    //   [name]: value,
    // }));
  };

  // 使用 useEffect 設定計時器來每秒更新一次時間
  useEffect(() => {
    // 設置每秒更新一次時間
    const timer = setInterval(() => {
      setDateTime(moment());
    }, 1000); // 每6小時执行一次(1000毫秒X21600)

    // 清除計時器
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // handleAddinputText();
    if (buttonClicked !== null) {
      switch (buttonClicked) {
        case "confirmID":
          handleAddinputText();
          break;
        case "saveexcel":
          handleDumpExcellog();
          break;
        case "notifyline":
          // Notifyline_taskboardmsg();
          break;
        default:
          break;
      }
      // 清除或重置 buttonClicked，避免 effect 重複執行
      setButtonClicked(null);
    }
  }, [buttonClicked]);

  const current_confirm_name = async (e) => {
    const parseDate = (confirmdt) => new Date(confirmdt);
    const sortedItems = confirmdt.sort(
      (a, b) => parseDate(b.confirm_dtime) - parseDate(a.confirm_dtime)
    );

    // 提取日期時間值
    const dtimes = sortedItems[0];
    const dtimee = sortedItems[sortedItems.length - 1];

    const dtimestart = Object.values(dtimes).join("");
    const dtimeend = Object.values(dtimee).join("");

    // console.log(
    //   "查詢日期時間起始至止  dtimestart = " +
    //     dtimestart +
    //     " dtimeend = " +
    //     dtimeend
    // );

    try {
      // 發送GET請求並附帶查詢參數
      const response = await axios.get(
        // "http://localhost:3009/taskboard/confirmname",
        `${config.apiBaseUrl}/taskboard/confirmname`,
        {
          params: {
            dtimestart: dtimestart,
            dtimeend: dtimeend,
          },
        }
      );

      const responseData = response.data;

      console.log(responseData);

      if (dtimestart && dtimeend) {
        Object.entries(responseData.confirm).forEach(([key, value]) => {
          const confirm_num = value.result.length;

          for (let i = 0; i < confirm_num; i++) {
            const task = Object.values(value.result[Count]);

            const confirm_name = task[0];
            const confirm_precautions = task[1];

            console.log(
              "員工名字:" +
                confirm_name +
                " 確認注意事項: " +
                confirm_precautions
            );

            const newconfirm = {
              confirm_name,
              confirm_num,
              confirm_precautions,
            };

            setconfirmname([...confirmname, newconfirm]);
            const newCount = Count + 1;
            setCount(newCount);
          }
        });
      }

      // 更新狀態以顯示回應數據(目前需要為memberName)
      //console.log("Received data ALL :", { responseData });
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const handleAddinputText = async (e) => {
    if (inputText.trim()) {
      // setIsActive(false); // 不激活倒计时器
      setconfirmname([]);
      //這邊先解析條碼字串
      // const Regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      // const barcode = inputText.match(Regex) || [];

      // 查找是否有含關鍵字(員工公號或姓名),目前公司以員工公號為主: 3碼數字
      // const keyword = "033";
      // const StaffCheck = inputText.includes(keyword);

      if (inputTexts.includes(inputText.trim())) {
        //alert("工號已經確認過!請重新掃碼");
        toast.error("工號已經確認過!請換一組掃碼");
        setinputText("");
        return;
      }

      if (inputTexts.length > max_carditem_num) {
        toast.error("目前已到上限!請先'送出'後 再繼續掃碼確認 ");
        setinputText("");
        return;
      }

      // 掃碼目前提供3位數
      const memberid = inputText.replace(/[^\d]/);
      // if (StaffCheck === true)
      if (parseInt(memberid) && memberid.length === 3) {
        const param1 = parseInt(memberid);
        //到查表DB擷取員工姓名
        try {
          // 發送GET請求並附帶查詢參數
          const response = await axios.get(
            // "http://localhost:3009/taskboard/dbhr",
            `${config.apiBaseUrl}/taskboard/dbhr`,
            {
              params: {
                param1: param1,
              },
            }
          );

          const responseData = response.data;
          // 更新狀態以顯示回應數據(目前需要為memberName)
          //console.log("Received data ALL :", { responseData });

          Object.entries(responseData.member).forEach(([key, value]) => {
            const memName = Object.values(value.result[0]);

            // const edit_num = Object.values(value.result[1]);
            if (memName !== "") {
              //console.log("Received data memberName :", { memName });
              //setmemberName(memName);
              // const newmember = {
              //   // id: memName.length + 1,
              //   memname: memName,
              // };
              //setCount((prevCount) => prevCount + 1);
              // seteditnum(1);
              // seteditnum(edit_num + 1);

              setmemberName(memName[0]);

              settype(memName[1]);

              seteditnum((prevCount) => prevCount + 0);

              //const tTime = moment().format("HH:mm:ss");
              const tTime = dateTime.format("HH:mm:ss");

              setcurrentTime(tTime);

              // const date_formate = moment().format("YYYY-MM-DD");
              const date_formate = dateTime.format("YYYY-MM-DD");
              setDate(date_formate);

              setinputTexts([...inputTexts, inputText]);

              const platform = options;

              // console.log("platform = " + platform);

              // const confirm_dtime = date + " " + currentTime;
              const confirm_dtime = currentTime;

              setconfirmdt([...confirmdt, confirm_dtime]);

              const newCarditem = {
                // id: cardItems.length + 1, // 确保每位員工都有排序ID
                editnum,
                memberName,
                date,
                currentTime,
                precautions,
                type,
                platform,
              };

              setCardItems([...cardItems, newCarditem]);

              //確認日期時間測試
              // if (confirmdt.length > 0) {
              //   current_confirm_name();
              // }
            }
          });
        } catch (error) {
          console.error("Error fetching data:", error);
        }
      } else {
        //console.log("目前公司組織無此員工-> ", inputText);
        //alert("條碼格式無法正確辨識員工工號");
        toast.error("條碼格式無法辨識請確認員工ID號碼為3位數");
      }
    }
    setinputText("");
    //setCount((prevCount) => prevCount - 1);
  };

  const handleDumpExcellog = async (e) => {
    try {
      // 發送GET請求並附帶查詢參數
      const response = await axios.get(
        // "http://localhost:3009/taskboard/xlsoutput"
        `${config.apiBaseUrl}/taskboard/xlsoutput`
      );

      //console.log("response 狀態 = " + response.status);

      if (response.status === 200) {
        console.log("回傳運行正常");
        //toast.success("LOG保存成功");
      }

      if (response.statusText !== "OK") {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }

      // if (!response.ok) {
      //   throw new Error(`Network response was not ok: ${response.statusText}`);
      // }

      // console.log("response 狀態 = " + response);
      //  toast.success(response.message);
      // toast.success("資料保存成功");
      // toast.success("LOG保存成功");

      // console.log(`Network response was ok: ${response.statusText}`);
      //return response.status; // 处理响应数据
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  // 定义一个函数来发送 POST 请求
  async function sendPostRequest(data) {
    try {
      const response = await fetch(
        // "http://localhost:3009/taskboard/pushconfirm",
        `${config.apiBaseUrl}/taskboard/pushconfirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok && response.status !== 201) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }

      // 延遲到下一個請求
      await delay(delayTime);
      return response.status; // 处理响应数据
    } catch (error) {
      console.error(`Error fetching ${data}:`, error);
    }
  }

  const cleardisplayItems = (event) => {
    // 清空以下儲存內容數據
    setCardItems([]);
    setinputTexts([]);
    setconfirmdt([]);
    setCount(0);
    // setprecautions(event.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      (options.length === 0 && options.at.value === undefined) ||
      options.toString() === "請選擇站別"
    ) {
      toast.error("站別沒有選取!");
      // console.log("options = " + options);
      return;
    }

    if (precautions === "") {
      toast.error("注意事項未填!!!");
      //console.log("options = " + options);
      return;
    }

    try {
      // const response = await axios.post(
      //   // `${config.apiBaseUrl}/repair/repair_question`,
      //   "http://localhost:3009/taskboard/pushconfirm",
      //   formDataToSend,
      //   {
      //     headers: {
      //       "Content-Type": "application/json",
      //     },
      //   }
      // );

      const promises = cardItems.map((item) => sendPostRequest(item));
      const results = await Promise.all(promises);

      // console.log("All requests were successful:", results);

      // for (let i = 0; i < results.length; i++) {
      //   if (results[i] !== 201) {
      //     checkerror = checkerror + 1;
      //   }
      // }
      // console.log(results.status);

      //接收機制成功
      if (results.length >= 1 && results[results.length - 1] === 201) {
        // if (results.length > 1 && results[results.length - 1] !== 201) {
        //   throw new Error(`Network response was not ok`);
        // }
        // 這裡可以加上顯示成功訊息的邏輯，例如彈出提示框或顯示在畫面上
        // toast.success(results.JSON.message);
        cleardisplayItems();
        //toast.success("資料保存成功");
        // console.log("交接資料保存完畢");

        //針對已經確認的員工顯示於畫面上
        current_confirm_name();

        // 延遲到下一個請求
        await delay(delayTime * 2);
        //直接做log存檔於taskboard.xls

        //  console.log("執行同步存取LOG handleDumpExcellog");
        handleDumpExcellog();

        //提交linenotify群組告知事先預備動作
        //handleClick("notifyline");
      } else {
        toast.error("資料保存失敗");
        // console.log("保存失敗!回應狀態碼:");
      }

      setIsActive(true); // 激活倒计时器
      setResetTimer((prevReset) => !prevReset); // 切换重置状态以重新开始倒计时
    } catch (error) {
      console.error("Error uploading data:", error);
      toast.error("資料保存失敗");
      console.log("保存失敗!回應狀態碼:", error);
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <div className="TaskBoard">
        <div className="header">
          {/* <fieldset>
            <legend>入榖站</legend>
            設備編號:Aa_0000
          </fieldset>
           */}

          <Form.Group>
            <Form.Label>站別選擇:</Form.Label>
            <Form.Select
              name="sidestatus"
              value={options}
              onChange={handleInputChange}
            >
              <option value="請選擇站別">-- 請選擇站別 --</option>
              <option value="入殼站">入殼站</option>
              <option value="BREYER正極輾壓機">REYER正極輾壓機</option>
              <option value="負極輾壓機1">負極輾壓機1</option>
              <option value="負極輾壓機2">負極輾壓機2</option>
              <option value="西村分條機">西村分條機</option>
              <option value="億鑫丰分條機">億鑫丰分條機</option>
              <option value="正極五金模切機1">正極五金模切機1</option>
              <option value="負極五金模切機1">負極五金模切機1</option>
              <option value="極片除水設備">極片除水設備</option>
              <option value="疊片機1">疊片機1</option>
              <option value="疊片機2">疊片機2</option>
              <option value="右洋疊片機1">右洋疊片機1</option>
              <option value="右洋疊片機2">右洋疊片機2</option>
              <option value="右洋疊片機3">右洋疊片機3</option>
              <option value="右洋疊片機4">右洋疊片機4</option>
              <option value="右洋疊片機5">右洋疊片機5</option>
              <option value="右洋疊片機6">右洋疊片機6</option>
              <option value="右洋疊片機7">右洋疊片機7</option>
              <option value="右洋疊片機8">右洋疊片機8</option>
              <option value="右洋疊片機9">右洋疊片機9</option>
              <option value="疊片物流線">疊片物流線</option>
              <option value="自動焊接入殼機">自動焊接入殼機</option>
              <option value="(豪優)正極超聲波焊接機">
                (豪優)正極超聲波焊接機
              </option>
              <option value="(豪優)負極超聲波焊接機">
                (豪優)負極超聲波焊接機
              </option>
              <option value="(德國)正極超聲波焊接機">
                (德國)正極超聲波焊接機
              </option>
              <option value="(德國)負極超聲波焊接機">
                (德國)負極超聲波焊接機
              </option>
              <option value="真空烘烤爐">真空烘烤爐</option>
              <option value="孟申自動注液機">孟申自動注液機</option>
            </Form.Select>
          </Form.Group>
        </div>
        <div className="column">
          <div className="goal">
            <Card>
              <Card.Header className="custom-card-header">生產目標</Card.Header>
              <Card.Body>
                {/* <Card.Text>
                  機台架動率:90% <br />
                  良率:95% <br />
                  NG率:5%
                </Card.Text> */}
                <div class="form-group custom-notice">
                  <textarea
                    class="form-control"
                    id="noticeitem"
                    name="input_noticeitem"
                    rows="8"
                    cols="55"
                    placeholder="輸入內容"
                    // onChange={handleInputChange}
                  ></textarea>
                </div>
              </Card.Body>
            </Card>

            <Card>
              <Card.Header className="custom-card-header">短期目標</Card.Header>
              <Card.Body>
                {/* <Card.Text>
                  機台架動率:95% <br />
                  良率:97% <br />
                  NG率:3%
                </Card.Text> */}
                <div class="form-group custom-notice">
                  <textarea
                    class="form-control"
                    id="noticeitem"
                    name="input_noticeitem"
                    rows="8"
                    cols="55"
                    placeholder="輸入內容"
                    // onChange={handleInputChange}
                  ></textarea>
                </div>
              </Card.Body>
            </Card>
          </div>
          <div className="goal">
            {/* <Card>
              <Card.Header style={{ backgroundColor: "red", color: "white" }}>
                注意事項
              </Card.Header>
              <Card.Body>
                <Card.Text></Card.Text>
              </Card.Body>
            </Card> */}
            <Card>
              <Card.Header style={{ backgroundColor: "red", color: "white" }}>
                注意事項
              </Card.Header>
              <Card.Body>
                <div class="form-group custom-notice">
                  <textarea
                    class="form-control"
                    id="noticeitem"
                    name="input_noticeitem"
                    rows="10"
                    cols="55"
                    placeholder="輸入內容"
                    onChange={handleInputChange}
                  ></textarea>
                </div>
              </Card.Body>
            </Card>
            <Card>
              <Card.Header>人員確認</Card.Header>
              <Card.Body>
                <Card.Text>
                  {/* <input type="text"  placeholder="請輸入姓名" /> */}
                  <input
                    type="text"
                    id="input_id"
                    name="input_id"
                    placeholder="請輸入工號"
                    value={inputText}
                    onChange={handleInputChange}
                  />
                  <Button
                    variant="primary"
                    onClick={() => handleClick("confirmID")}
                  >
                    確認
                  </Button>
                  <br />
                  <br />
                  <h2 class="htag">
                    {/* {"日期: " + moment().format("YYYY-MM-DD")} */}
                    {"日期/時分: " + dateTime.format("YYYY-MM-DD HH:mm")}
                  </h2>
                </Card.Text>
              </Card.Body>
            </Card>
          </div>
          <div className="nameList">
            <Card>
              <Card.Header>已確認名單</Card.Header>
              <Card.Body>
                {/* <Card.Text>
                1.鄭坤德
                <br />
                2.吳鴻麟
                <br />
              </Card.Text> */}
                <ul>
                  {date &&
                    currentTime &&
                    cardItems.map((card, index) => (
                      <li key={index}>
                        {index + 1}
                        {". "}
                        {/* {". 編號:"}
                        {card.editnum} */}
                        {/* {" -> "} */}
                        {card.memberName}
                        {" 時間: "}
                        {card.currentTime}
                        {" 班別: "}
                        {card.type}
                      </li>
                    ))}
                </ul>
                <br />
                <br />
                <div align="center">
                  <Button
                    variant="primary"
                    name="request"
                    type="submit"
                    className="mt-3"
                  >
                    送出
                  </Button>
                  <br />
                  <CountdownTimer isActive={isActive} resetTimer={resetTimer} />
                </div>
                {/* <div align="right">
                  <Button
                    variant="primary"
                    className="mt-3 "
                    onClick={() => handleClick("saveexcel")}
                  >
                    儲存log
                  </Button>
                </div> */}
                <div align="right" className="countdown">
                  {/* <CountdownTimer initialSeconds={10}/>{"秒再重新確認"} */}
                </div>
              </Card.Body>
            </Card>
          </div>
          <div>
            <Table
              style={{ textAlign: "center", verticalAlign: "middle" }}
              striped
              bordered
              hover
            >
              <thead>
                <tr>
                  <th>姓名確認列表</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {confirmname.map((item, index) => (
                  <tr index>
                    <td>
                      {item.confirm_name}
                      {"共"}
                      {item.confirm_num + 1}
                      {"人"}
                    </td>
                    <td
                      style={{
                        color:
                          item.confirm_precautions === null ||
                          item.confirm_precautions === 0
                            ? "red"
                            : "inherit",
                      }}
                    >
                      {item.confirm_precautions === null ||
                      item.confirm_precautions === 0 ? (
                        <FaTools color="red" /> // 未填入注意事項
                      ) : (
                        <FaCheckCircle color="green" /> // 已確認OK!
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      </div>
    </Form>
  );
};

export default TaskBoard;
