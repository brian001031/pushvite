import React, { useState, useEffect, useRef, Suspense } from "react";
import { Row, Col } from "reactstrap";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Card from "react-bootstrap/Card";
import moment from "moment";
import "../../styles.scss";
import api from "../../api";
import MES_EquipmentProInfo_reBuild from "../../index";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

import { group_oven } from "../../../../mes_remak_data";
import { use } from "react";
import { useNavigate } from "react-router-dom";

// 使用 const 宣告箭頭函數，然後再預設匯出
const Oven = () => {
  const [startDate, setStartDate] = useState(moment().locale("zh-tw"));
  const [inputValue, setInputValue] = useState("");
  const [machineOption, setMachineOption] = useState("");
  const [equipmentID, setEquipmentID] = useState("");
  const [shiftClasstype, setShiftClasstype] = useState("");
  const [shiftClass, setShiftClass] = useState("");
  const [direction, setDirection] = useState("IN");
  const [responseData, setResponseData] = useState({}); // api update page 資料
  const [responseDataQuality, setResponseDataQuality] = useState({}); // api groupname_capacitynum 資料
  const previousDataRef = useRef({});
  const [boardListFormatted, setBoardListFormatted] = useState("");
  const [modelCount, setModelCount] = useState("");
  const [shiftCount, setShiftCount] = useState("");
  const [accCount, setAccCount] = useState("");
  const [dataReference, setDataReference] = useState({}); // 用來存儲參考資料
  const PopupAllInfo = React.lazy(() => import("../../PopupAllInfo")); // 懶加載組件
  const [modalIsOpen, setModalIsOpen] = React.useState(false);
  const [isMainDataLoading, setIsMainDataLoading] = useState(false);
  const navigate = useNavigate();

  // 用來追蹤哪些欄位正在變色，以及它們何時需要恢復
  // 結構會是 { key: { isChanging: true } }
  const [highlightedFields, setHighlightedFields] = useState({});

  const handleSelectChange = (e) => {
    const value = e.target.value.trim();
    setInputValue(value);
    setMachineOption(value);
  };

  const handle_Introduce_View = () => {
    const sideoption = "oven";
    console.log("side option = " + sideoption);
    navigate(`/Mes_WorkflowIntroduce/${sideoption}`);
  };

  const handleShow = () => {
    setModalIsOpen(true);
  };

  const handleOnHide = () => {
    setModalIsOpen(false);
  };

  useEffect(() => {
    // 初始化機台選項
    setMachineOption("真空電芯-大烘箱-入料");
  }, []);
  // 當 machineOption 變更時更新資料 (主要數據)
  useEffect(() => {
    if (!machineOption) {
      setResponseData({});
      return;
    }

    const fetchData = async () => {
      setIsMainDataLoading(true);
      try {
        if (modalIsOpen === true) {
          console.log("Modal is open, skipping fetchData");
          return;
        } else if (modalIsOpen === false) {
          const response = await api?.callOven(machineOption);

          if (response?.length) {
            console.log("API response (EdgeFolding):", response[0]);
            setResponseData(response[0]);
          } else {
            setResponseData({});
          }
        }
      } catch (error) {
        console.error("callCoating_cathanode API 錯誤:", error);
        setResponseData({});
      } finally {
        setIsMainDataLoading(false);
      }
    };

    fetchData();
    if (modalIsOpen === true) return;
    const intervalId = setInterval(fetchData, 10000);

    // 返回清理函數，在組件卸載或依賴項變化時清除定時器
    return () => clearInterval(intervalId);
  }, [machineOption, modalIsOpen]);

  // 監聽 responseData 變化，執行比較和高亮邏輯
  useEffect(() => {
    // 如果 responseData 是空物件，則不做任何比較
    if (Object.keys(responseData).length === 0) {
      previousDataRef.current = {}; // 清空 previousDataRef
      return;
    }

    // 第一次載入時或 previousDataRef 為空時，初始化 previousDataRef
    if (Object.keys(previousDataRef.current).length === 0) {
      previousDataRef.current = { ...responseData };
      return;
    }

    const prevData = previousDataRef.current;

    // 資料改變變顏色
    for (const key in responseData) {
      if (Object.prototype.hasOwnProperty.call(responseData, key)) {
        if (
          Object.prototype.hasOwnProperty.call(prevData, key) &&
          String(responseData[key]) !== String(prevData[key])
        ) {
          // 值發生變化，設置為高亮
          setHighlightedFields((prev) => ({
            ...prev,
            [key]: { isChanging: true },
          }));

          // 設定 2 秒後恢復顏色
          setTimeout(() => {
            setHighlightedFields((prev) => {
              const newPrev = { ...prev };
              delete newPrev[key]; // 移除該 key 的變色狀態
              return newPrev;
            });
          }, 2000); // 2000 毫秒 = 2 秒
        }
      }
    }

    // 更新 previousDataRef.current 以便下次比較
    previousDataRef.current = { ...responseData }; // 淺拷貝當前數據

    // console.log(
    //   "responseData OPCODE = " + JSON.stringify(responseData, null, 2)
    // );

    // 同步 equipmentID (這部分邏輯可以放在這裡，因為它依賴 responseData)
    if (responseData?.OP) {
      const op = String(responseData.OP).padStart(3, "0");
      setEquipmentID(op);
    } else {
      setEquipmentID(""); // 如果沒有 CurrentEdgeOP 則清空
    }
  }, [responseData, modalIsOpen]); // 監聽 responseData 物件的變化

  // 這個函數用於判斷給定 key 的值是否需要變色
  const getColorStyle = (key) => {
    if (highlightedFields[key] && highlightedFields[key].isChanging) {
      return {
        color: "red",
        transition: "color 0.1s ease-out",
        minWidth: 120,
        fontWeight: "bold",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        marginBottom: "10px",
        width: "100%",
      };
    }
    return {
      color: "black",
      minWidth: 120,
      fontWeight: "bold",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      marginBottom: "10px",
      width: "100%",
    }; // 預設顏色為黑色
  };

  // 判斷班別與更新品質資料 (這部分邏輯與變色無關，獨立在另一個 useEffect)
  useEffect(() => {
    if (!machineOption || !startDate) return;

    const hour = startDate.hour();
    const minutes = startDate.minutes();
    const seconds = startDate.seconds();

    let currentShiftClass;
    // 判斷班別邏輯
    if (hour >= 8 && hour < 20) {
      currentShiftClass = "早班";
      // setIsDayShift(true); // 如果沒有用到，可以移除
    } else {
      currentShiftClass = "晚班";
      // setIsDayShift(false); // 如果沒有用到，可以移除
    }
    setShiftClasstype(currentShiftClass.trim());

    const fetchQuality = async () => {
      if (!machineOption || !startDate) return;

      setIsMainDataLoading(true);

      try {
        if (modalIsOpen === true) {
          console.log("Modal is open, skipping fetchData");
          return;
        } else if (modalIsOpen === false) {
          const response = await api.callOven_groupname_capacitynum(
            equipmentID || "",
            currentShiftClass.trim() || "",
            machineOption || "",
            startDate.format("YYYY/MM/DD")
          );

          console.log("品質 API capacitynum資料:", response);
          if (response && typeof response === "object") {
            const keys = Object.keys(response);

            if (keys.some((key) => key.startsWith("ceboard_IN_"))) {
              setDirection("IN");
            } else if (keys.some((key) => key.startsWith("ceboard_OUT_"))) {
              setDirection("OUT");
            }
            // 格式為 "192|新|陳尚吉|732"
            // const [code, status, name, score] = response.split("|");
            // setResponseDataQuality({ code, status, name, score });
            setResponseDataQuality(response);
          } else {
            setResponseDataQuality({});
          }
        }
      } catch (error) {
        console.error("callEdgeFolding_groupname_capacitynum API 錯誤:", error);
        setResponseDataQuality({});
      } finally {
        setIsMainDataLoading(false);
      }
    };

    fetchQuality();
    const intervalId = setInterval(fetchQuality, 10000);
    return () => clearInterval(intervalId);
  }, [machineOption, equipmentID, startDate, modalIsOpen]);

  // 抓取 Reference setting 的資料
  const varName = String("group_oven").trim();
  const IDuni = responseData?.ID;

  useEffect(() => {
    setIsMainDataLoading(true);
    try {
      if (!varName) {
        console.error("varName is empty or undefined");
        return;
      }

      const fetchReference = async () => {
        console.log("呼叫 callGet_referenceItem API，變數名稱:", varName);
        if (modalIsOpen === true) {
          console.log("Modal is open, skipping fetchData");
          return;
        } else if (modalIsOpen === false) {
          const response = await api.callGet_referenceItem(varName);
          console.log("api回傳 callGet_referenceItem:", response);
          if (response) {
            setDataReference(response);
            console.log("dataReference:", dataReference);
          }
        }
      };
      fetchReference();
    } catch (error) {
      console.error("callPost_referenceItem API 錯誤:", error);
    } finally {
      setIsMainDataLoading(false);
    }
  }, [IDuni, modalIsOpen]);

  // 當 dataReference 變化時，更新資料
  useEffect(() => {
    if (!dataReference || Object.keys(dataReference).length === 0) return;
    console.log("dataReference 更新:", dataReference);

    const fetchPostData = async () => {
      if (!varName && varName === undefined) {
        console.error("varName is empty or undefined");
        return;
      }

      setIsMainDataLoading(true);

      try {
        if (modalIsOpen === true) {
          console.log("Modal is open, skipping fetchData");
          return;
        } else if (modalIsOpen === false) {
          const response = await api.callPost_referenceItem(
            varName,
            dataReference
          );
          console.log("Post API回傳資料:", response);
        }
      } catch (error) {
        console.error("callPost_referenceItem API 錯誤:", error);
      } finally {
        setIsMainDataLoading(false);
      }
    };

    fetchPostData();
  }, [dataReference, varName, modalIsOpen]);

  const handleLink = () => {
    const pdfUrl = "/pdf/Anode Mixer CL.pdf";
    if (pdfUrl) {
      window.open(pdfUrl, "_blank");
    } else {
      alert("PDF 連結未設定");
    }
  };

  useEffect(() => {
    const prefix = `ceboard_${direction}_`;

    console.log("prefix 前綴為 = " + prefix);

    const nameList = responseDataQuality?.[`${prefix}name`] || "";
    const formattedNames = nameList
      .trim()
      .split(/\s+/)
      .reduce((acc, val, i) => {
        const idx = Math.floor(i / 2); // 每兩個為一組
        acc[idx] = acc[idx] ? `${acc[idx]} ${val}` : val;
        return acc;
      }, [])
      .join("\n");

    setBoardListFormatted(formattedNames);
    setModelCount(responseDataQuality?.[`${prefix}modle_count`] || "抓取中");
    setShiftCount(
      responseDataQuality?.[`${prefix}modle_shiftcount`] || "抓取中"
    );

    // console.log(
    //   "responseDataQuality 全組態為=" +
    //     JSON.stringify(responseDataQuality, null, 2)
    // );

    setAccCount(responseDataQuality?.[`${prefix}modle_acccount`] || "抓取中");
    setShiftClass(responseDataQuality?.shiftclass || "");
  }, [responseDataQuality, direction]);

  useEffect(() => {
    console.log("accCount = " + accCount);
  }, [accCount, modalIsOpen]);

  return (
    <div style={{ maxWidth: "100vw", overflowX: "auto" }}>
      <MES_EquipmentProInfo_reBuild />

      <div className="Title" style={{ fontSize: "24px", marginBottom: "20px" }}>
        選擇機台:
      </div>
      <select
        id="type"
        value={inputValue}
        onChange={handleSelectChange}
        style={{
          width: "100%",
          height: "40px",
          fontSize: "16px",
          padding: "10px",
          border: "1px solid #ccc",
          marginBottom: "1vh",
          marginTop: "1vh",
        }}
      >
        <option value="真空電芯-大烘箱-入料">真空電芯-大烘箱-入料</option>
        <option value="真空電芯-大烘箱-出料">真空電芯-大烘箱-出料</option>
        {/* <option value="極片-小烘箱-入料">極片-小烘箱-入料</option>
        <option value="極片-小烘箱-出料">極片-小烘箱-出料</option> */}
      </select>

      <Row className="EdgeFoldingRow" style={{ flexWrap: "nowrap" }}>
        {/* 左欄 */}
        <Col lg={3} md={3} sm={12} style={{ minWidth: 300 }}>
          <div className="LeftContent">
            <div className="Content_Top">
              <div className="Title">生產資訊標籤</div>
              <div className="Content">●設備編號:</div>
              <div className="Answer" style={getColorStyle("cellNO")}>
                {responseData.Machine || "抓取中"}{" "}
              </div>
              <div className="Content">●目前狀態:</div>
              <div className="Answer" style={getColorStyle("boxNO")}>
                {responseData.CE_board_number !== "" ? "RUN" : "抓取中"}
              </div>

              <div className="Content">●目前生產人員:</div>
              <div className="Answer">
                <div
                  className="AnswerEquipment"
                  style={getColorStyle("CurrentEdgeOP")}
                >
                  {responseData.OP || "抓取中"}|
                  {responseData.OPName || "抓取中"}
                </div>
              </div>
              <div className="Content">●目前工單號:</div>
              <div className="Answer" style={getColorStyle("stageID")}>
                {responseData.WO || "抓取中"}
              </div>
              <div className="Content">●CE_乘載盤列表(目前):</div>
              <Card.Header style={{ backgroundColor: "green", color: "white" }}>
                ▼
              </Card.Header>
              <Card.Body>
                <div class="form-group custom-notice">
                  <textarea
                    class="form-control"
                    id="noticeitem"
                    name="input_noticeitem"
                    rows="2"
                    cols="55"
                    value={boardListFormatted}
                    //onChange={handleInputChange}
                    readOnly
                  ></textarea>
                </div>
              </Card.Body>
              <div className="Content">●當日產能:</div>
              {/* quality score 是另一個 state，也需要應用變色 */}
              <div className="Answer" style={getColorStyle("score")}>
                {modelCount} PCS
              </div>
              {/* <div className="Answer" style={getColorStyle("score")}>
                暫無設置
              </div> */}
              {/* 班別也可能需要變色，但它不是來自 responseData，而是根據時間判斷 */}
              <div className="Content">●生產日期:</div>
              <div
                className="Answer"
                style={{
                  backgroundColor: "#f0f0f0",
                  color: "black",
                  padding: "10px",
                  borderRadius: "5px",
                }}
              >
                <DatePicker
                  selected={startDate.toDate()}
                  onChange={(date) =>
                    setStartDate(moment(date).locale("zh-tw"))
                  }
                  dateFormat="yyyy/MM/dd"
                  className="datePicker"
                  style={{
                    display: "flex",
                    width: "80%",
                    height: "20",
                    fontSize: "16px",
                    padding: "10px",
                    border: "1px solid #ccc",
                  }}
                />
              </div>
              <div className="Content">●生產量:</div>
              <div className="Answer" style={getColorStyle("score")}>
                累積產能 :{accCount} PCS
              </div>
              {/* <div className="Answer" style={getColorStyle('Time')}>{responseData.Time || "抓取中"} PCS </div> */}
              <div className="Content">
                {" "}
                {shiftClasstype}
                {"|"}
                {shiftClass || "抓取中"}|生產中
              </div>
              {machineOption.includes("大烘箱-入料") &&
              shiftClasstype !== "" ? (
                <div
                  className="Answer"
                  key={"ceboard_IN_modle_shiftcount"}
                  style={getColorStyle("ceboard_IN_modle_shiftcount")}
                >
                  班別產能:
                  {shiftCount} PCS
                </div>
              ) : machineOption.includes("大烘箱-出料") &&
                shiftClasstype !== "" ? (
                <div
                  className="Answer"
                  key={"ceboard_OUT_modle_shiftcount"}
                  style={getColorStyle("ceboard_OUT_modle_shiftcount")}
                >
                  班別產能:
                  {responseDataQuality?.ceboard_OUT_modle_shiftcount ||
                    "抓取中"}{" "}
                  PCS
                </div>
              ) : null}
              {/* <div className="Answer" style={getColorStyle("score")}>
                累積產能 : 暫無設置
              </div> */}
              <div className="Content">●設備維護員:</div>
              <div className="Answer">
                <div
                  className="AnswerEquipment"
                  style={getColorStyle("CurrentEdgeOP")}
                >
                  {responseData.OP || "抓取中"}|
                  {responseData.OPName || "抓取中"}
                </div>
              </div>
            </div>
          </div>
        </Col>

        {/*  中欄  */}
        <Col lg={5} md={5} sm={12} style={{ minWidth: 600 }}>
          <div className="MiddleContent">
            <div className="Content_Top">
              <div className="Title_Middle">設備生產參數</div>
              <div className="ContainerCentter">
                <div className="Content_Middle">設備參數更新約</div>
                <div
                  className="dataSet"
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    width: "60%",
                  }}
                >
                  <div className="Answer_Middle">10</div>
                </div>
                <div className="Content_Middle">秒鐘</div>
              </div>
              <div
                className="DataBack"
                style={{ width: "100%", overflow: "scroll" }}
              >
                {Object.keys(group_oven).map((groupName) => {
                  const labelMap = group_oven[groupName]?.[0] || {};
                  const settingData = dataReference[groupName]?.[0] || {};
                  return (
                    <div key={groupName} style={{ marginBottom: "30px" }}>
                      <div
                        style={{
                          fontWeight: "bold",
                          fontSize: "20px",
                          color: "#007bff",
                          margin: "10px 0",
                        }}
                      >
                        {groupName}
                      </div>

                      {Object.keys(labelMap).map((key) => (
                        <div
                          key={key}
                          className="DataBack_Middles"
                          style={{
                            ...getColorStyle(key),
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {/* 中文欄位名稱 */}
                          <div
                            style={{
                              minWidth: 120,
                              fontWeight: "bold",
                              display: "flex",
                            }}
                          >
                            {labelMap[key] || key}
                          </div>

                          <div style={{ display: "flex", marginLeft: "auto" }}>
                            {/* 實際值 */}
                            <input
                              type="text"
                              readOnly
                              value={responseData[key] || ""}
                              style={{
                                width: "15rem",
                                border: "1px solid #ccc",
                                borderRadius: "5px",
                                margin: "0 10px",
                                backgroundColor: "#e8e9eb",
                              }}
                            />

                            {/* 設定值（來自 dataReference） */}
                            <input
                              type="text"
                              placeholder="設定值"
                              value={settingData[key] || ""}
                              onChange={(e) => {
                                const newDataReference = {
                                  ...dataReference,
                                  [groupName]: [
                                    {
                                      ...settingData,
                                      [key]: e.target.value,
                                    },
                                  ],
                                };
                                setDataReference(newDataReference);
                              }}
                              style={{
                                width: "100px",
                                border: "1px solid #ccc",
                                borderRadius: "5px",
                                marginRight: "10px",
                              }}
                            />

                            {/* 實際誤差值 */}
                            <input
                              type="text"
                              readOnly
                              value={
                                responseData[key] && settingData[key]
                                  ? (
                                      parseFloat(responseData[key]) -
                                      parseFloat(settingData[key])
                                    ).toFixed(2)
                                  : ""
                              }
                              placeholder="誤差"
                              style={{
                                width: "80px",
                                border: "1px solid #ccc",
                                borderRadius: "5px",
                                backgroundColor: "#f9f9f9",
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Col>
        <Col lg={4} md={4} sm={12} style={{ minWidth: 350 }}>
          <div className="RightContent">
            <div className="Content_Top">
              <div
                className="Title"
                style={{ backgroundColor: "#f0f0f0", color: "black" }}
              >
                1.短期目標:
              </div>
              <textarea
                style={{
                  border: "1px solid #ccc",
                  width: "100%",
                  height: "30vh",
                  overflow: "scroll",
                }}
              ></textarea>
              <div
                className="Title"
                style={{ backgroundColor: "#f0f0f0", color: "black" }}
              >
                2.長期目標:
              </div>
              <textarea
                style={{
                  border: "1px solid #ccc",
                  width: "100%",
                  height: "30vh",
                  overflow: "scroll",
                }}
              ></textarea>
            </div>
            <div
              className="Title"
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              細節分頁進入:
            </div>
            <div
              className="ButtonGroup"
              style={{ display: "flex", flexDirection: "column" }}
            >
              <button
                className="BtnChange"
                style={{ backgroundColor: "#ff5809" }}
              >
                例行性保養介面
              </button>
              <button
                className="BtnChange"
                style={{ backgroundColor: "#8ec0c0" }}
              >
                耗材更換紀錄
              </button>
              <button
                className="BtnChange"
                style={{ backgroundColor: "#82d900" }}
                onClick={() => handleLink()}
              >
                檢點表
              </button>
              <button
                className="BtnChange"
                style={{ backgroundColor: "#cc2200" }}
              >
                異常紀錄
              </button>
              <button
                className="BtnChange"
                style={{ backgroundColor: "#0b565f" }}
                onClick={handle_Introduce_View}
              >
                SOP、SIP、教學影片
              </button>
              <button
                className="BtnChange"
                style={{ backgroundColor: "#a83d74" }}
                // onClick={handleShow}
                onClick={(event) => {
                  event.preventDefault();

                  if (isMainDataLoading) {
                    console.log("主頁面資料載入中，阻止開啟 Modal！");
                    return; // 阻止執行後續的開啟 Modal 動作
                  }
                  handleShow();
                }}
              >
                真空電芯大烘箱/極片小烘箱站總資訊
              </button>
            </div>
          </div>
        </Col>
      </Row>
      {modalIsOpen === true ? (
        <Suspense fallback={<div>Loading...</div>}>
          <PopupAllInfo
            show={modalIsOpen}
            onHide={handleOnHide}
            centered={true}
            mes_side={{ oven: "oven" }}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

// 將 Assembly 組件作為預設匯出
export default Oven;
