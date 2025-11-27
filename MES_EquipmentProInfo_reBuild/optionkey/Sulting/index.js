/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from "react";
import React, { Suspense } from "react";
import MES_EquipmentProInfoReBuild from "../../index";
import moment from "moment";
import DatePicker from "react-datepicker";
import { FormattedMessage, IntlProvider, FormattedDate } from "react-intl";
import {
  Row,
  Col,
  Button,
  FormGroup,
  Label,
  Input,
  Toast,
  Card,
  Form,
} from "reactstrap";
import "../../styles.scss";
import api from "../../api";
import {
  mes_sulting,
  group_direct_sulting_fields,
} from "../../../../mes_remak_data";
import { useNavigate } from "react-router-dom";
import { faL } from "@fortawesome/free-solid-svg-icons";

const Sulting = () => {
  const [inputValue, setInputValue] = React.useState("");
  const [machineOption, setMachineOption] = useState(
    mes_sulting[0].toString().trim()
  );
  const [responseData, setResponseData] = useState({});
  const [responseDataQuality, setResponseDataQuality] = useState({}); // api groupname_capacitynum 資料
  const [equipmentID, setEquipmentID] = useState("");
  const previousDataRef = useRef({});
  const PopupAllInfo = React.lazy(() => import("../../PopupAllInfo")); // 懶加載組件
  const [modalIsOpen, setIsOpen] = React.useState(false);
  const [isMainDataLoading, setIsMainDataLoading] = useState(false);
  const [startDate, setStartDate] = useState(moment().locale("zh-tw"));
  // 左側資料
  const [leftData, setLeftData] = useState({});

  const handleSelectChange = (e) => {
    setInputValue(e.target.value);
    setMachineOption(String(e.target.value).trim());
  };

  const [highlightedFields, setHighlightedFields] = useState({});
  const [dataReference, setDataReference] = useState({});
  const [shiftClass, setShiftClass] = useState("");
  const navigate = useNavigate();

  const handle_error_View = () => {
    const sideoption_error = "sulting";
    console.log("side option = " + sideoption_error);
    navigate(`/Mes_Error_StatusView/${sideoption_error}`);
  };

  const handle_Introduce_View = () => {
    const sideoption = "sulting";
    console.log("side option = " + sideoption);
    navigate(`/Mes_WorkflowIntroduce/${sideoption}`);
  };

  const handleShow = () => {
    setIsOpen(true);
  };
  const handleOnHide = () => {
    setIsOpen(false);
  };

  const handleSubmit = () => {
    if (inputValue === "分選判別CC2") {
      console.log("分選判別CC2");
    }
  };

  const fetchData = async () => {
    setIsMainDataLoading(true);
    try {
      if (modalIsOpen === true) {
        console.log("Modal is open, skipping fetchData");
        return;
      } else if (modalIsOpen === false) {
        const response = await api?.callSulting(machineOption);

        if (response?.length) {
          console.log("API response (Sulting):", response[0]);
          setResponseData(response[0]);
        } else {
          setResponseData({});
        }
      }
    } catch (error) {
      console.error("callEdgeFolding API 錯誤:", error);
      setResponseData({});
    } finally {
      setIsMainDataLoading(false);
    }
  };

  // 當 machineOption 變更時更新資料 (主要數據)
  useEffect(() => {
    if (!machineOption) {
      setResponseData({});
      setLeftData({});
      return;
    }
    if (modalIsOpen === true) {
      console.log("Modal is open, skipping fetchData");
      return;
    }

    fetchData();
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
    if (responseData?.OPNO) {
      const op = String(responseData.OPNO).padStart(3, "0");
      setEquipmentID(op);
    } else {
      setEquipmentID(""); // 如果沒有 CurrentEdgeOP 則清空
    }
  }, [responseData]); // 監聽 responseData 物件的變化

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

  // 這個函數用於判斷給定 key 的值是否需要變色
  const fetchQuality = async () => {
    if (modalIsOpen === true) {
      console.log("Modal is open, skipping fetchData");
      return;
    }

    setIsMainDataLoading(true);

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
    setShiftClass(currentShiftClass.trim());

    try {
      if (modalIsOpen === true) {
        console.log("Modal is open, skipping fetchData");
        return;
      } else if (modalIsOpen === false) {
        const response = await api?.callSulting_groupname_capacitynum(
          equipmentID || "",
          currentShiftClass.trim() || "",
          machineOption || "",
          startDate.format("YYYY/MM/DD")
        );

        console.log("API回傳 callSulting_groupname_capacitynum:", response);
        if (response?.length > 0) {
          const class_rerw = response[0].searchclass.trim().split("");
          response[0].searchclass = class_rerw[1] || "";
          setLeftData(response[0]);
        }
      }
    } catch (error) {
      console.error("callSulting_groupname_capacitynum API 錯誤:", error);
      setLeftData({});
    } finally {
      setIsMainDataLoading(false);
    }
  };

  // 判斷班別與更新品質資料 (這部分邏輯與變色無關，獨立在另一個 useEffect)
  useEffect(() => {
    if (!machineOption || !startDate) return;
    if (modalIsOpen === true) {
      console.log("Modal is open, skipping fetchData");
      return;
    }

    const hour = startDate.hour();

    let currentShiftClass;
    // 判斷班別邏輯
    if (hour >= 8 && hour < 20) {
      currentShiftClass = "早班";
    } else {
      currentShiftClass = "晚班";
    }
    setShiftClass(currentShiftClass.trim());

    fetchQuality();
    const intervalId = setInterval(fetchQuality, 10000);
    return () => clearInterval(intervalId);
  }, [machineOption, equipmentID, startDate, modalIsOpen]);

  // 抓取 Reference setting 的資料
  const varName = String("group_direct_sulting_fields").trim();
  const IDuni = responseData?.ID || responseData?.id || "";

  useEffect(() => {
    try {
      if (!varName) {
        console.error("varName is empty or undefined");
        return;
      }

      setIsMainDataLoading(true);

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
  }, [IDuni]);

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
  }, [dataReference, varName]);

  return (
    <div>
      <MES_EquipmentProInfoReBuild />
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
        }}
      >
        <option value="分選判別CC2">分選判別CC2</option>
      </select>
      <Row>
        <Col lg={12} md={12} sm={12}></Col>
      </Row>

      <Row className="EdgeFoldingRow" style={{ flexWrap: "nowrap" }}>
        <Col lg={3} md={3} sm={12} style={{ minWidth: 300 }}>
          <div className="LeftContent">
            <div className="Content_Top">
              <div className="Title">生產資訊標籤</div>
              <div className="Content">●設備編號: </div>
              <div className="Answer" style={getColorStyle("MachineNO")}>
                {responseData.MachineNO || "抓取中"}{" "}
              </div>
              <div className="Content">●目前狀態: </div>
              <div
                className="Answer"
                style={getColorStyle("MachineStatusCode")}
              >
                {responseData.MachineStatusCode || "抓取中"}
              </div>
              <div className="Content">●目前生產人員: </div>
              <div className="Answer">
                <div
                  className="AnswerEquipment"
                  style={getColorStyle("CurrentEdgeOP")}
                >
                  {responseData.OPNO || "抓取中"}|
                  {responseData.OpName || "抓取中"}
                </div>
              </div>
              <div className="Content">●目前工單號: </div>
              <div className="Answer" style={getColorStyle("stageID")}>
                {responseData.WONO || "抓取中"}
              </div>
              <div className="Content">●當日產能: </div>
              {machineOption.toString().includes("CC") &&
              /\d+/.test(machineOption.toString()) ? (
                <div
                  className="Answer"
                  key={"todayCapacity_result"}
                  style={getColorStyle("todayCapacity_result")}
                >
                  {leftData?.todayCapacity_result || "抓取中"} PCS
                </div>
              ) : (
                <div
                  className="Answer"
                  key={"todayCapacity_second_result"}
                  style={getColorStyle("todayCapacity_second_result")}
                >
                  {leftData?.todayCapacity_second_result || "抓取中"} PCS
                </div>
              )}
              <div className="Content">●班別 </div>
              <div
                className="Answer"
                style={{
                  backgroundColor: "#f0f0f0",
                  color: "black",
                  padding: "10px",
                  borderRadius: "5px",
                }}
              >
                {shiftClass || "抓取中"}
              </div>
              <div className="Content">●生產日期: </div>
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
                  onChange={(date) => setStartDate(moment(date))}
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
              {machineOption.toString().includes("CC") &&
              /\d+/.test(machineOption.toString()) ? (
                startDate && leftData?.amountCapacity_result !== null ? (
                  <div
                    className="Answer"
                    key={"amountCapacity_result"}
                    style={getColorStyle("amountCapacity_result")}
                  >
                    累積產能 :{leftData?.amountCapacity_result || "抓取中"} PCS
                  </div>
                ) : (
                  <div style={{ fontSize: "1.5rem", color: "red" }}>
                    請先選定日期區間
                  </div>
                )
              ) : (
                <div
                  className="Answer"
                  key={"selectedDayCapacity_second_result"}
                  style={getColorStyle("selectedDayCapacity_second_result")}
                >
                  累積產能 :
                  {leftData?.selectedDayCapacity_second_result || "抓取中"} PCS
                </div>
              )}

              <div className="Content">
                {" "}
                {shiftClass || "抓取中"}|{leftData?.searchclass || ""}| 生產中
              </div>
              {machineOption.toString().includes("CC") &&
              /\d+/.test(machineOption.toString()) ? (
                shiftClass === "早班" ? (
                  <div
                    className="Answer"
                    key={"morningShiftDayCapacity_result"}
                    style={getColorStyle("morningShiftDayCapacity_result")}
                  >
                    班別產能:
                    {leftData?.morningShiftDayCapacity_result ?? "抓取中"} PCS
                  </div>
                ) : (
                  <div
                    className="Answer"
                    key={"nightShiftDayCapacity_result"}
                    style={getColorStyle("nightShiftDayCapacity_result")}
                  >
                    班別產能:
                    {leftData?.nightShiftDayCapacity_result ?? "抓取中"} PCS
                  </div>
                )
              ) : shiftClass === "早班" ? (
                <div
                  className="Answer"
                  key={"morningShiftCapacity_second_result"}
                  style={getColorStyle("morningShiftCapacity_second_result")}
                >
                  班別產能:
                  {leftData?.morningShiftCapacity_second_result ?? "抓取中"} PCS
                </div>
              ) : (
                <div
                  className="Answer"
                  key={"nightShiftCapacity_second_result"}
                  style={getColorStyle("nightShiftCapacity_second_result")}
                >
                  班別產能:
                  {leftData?.nightShiftCapacity_second_result ?? "抓取中"} PCS
                </div>
              )}
              <div className="Content">●設備維護員</div>
              <div className="Answer">
                <div
                  className="AnswerEquipment"
                  style={getColorStyle("OpName")}
                >
                  {responseData.OPNO || "抓取中"}|
                  {responseData.OpName || "抓取中"}
                </div>
              </div>
              {/* <div className="Content">●語言切換:</div> */}
            </div>
          </div>
        </Col>
        <Col lg={5} md={5} sm={12} style={{ minWidth: 600 }}>
          <div className="MiddleContent">
            <div className="Content_Top">
              <div className="Title_Middle">設備生產參數</div>
              <div className="ContainerCentter">
                <div className="Content_Middle">設備參數更新約 </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "60%",
                    boxSizing: "inlineBlock",
                  }}
                >
                  <div className="Answer_Middle">10</div>
                </div>
                <div className="Content_Middle">秒鐘</div>
              </div>
              <div
                className="DataBack"
                style={{
                  width: "100%",
                  boxSizing: "inLine-box",
                  padding: "10px",
                  borderRadius: "5px",
                  backgroundColor: "#f8f9fa",
                  overflow: "scroll",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                {Object.keys(group_direct_sulting_fields).map((groupName) => {
                  const labelMap =
                    group_direct_sulting_fields[groupName]?.[0] || {};
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

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              alignItems: "center",
                              marginLeft: "auto",
                            }}
                          >
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
        <Col lg={4} md={4} sm={12}>
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
              style={{
                display: "flex",
                display: "flex",
                flexDirection: "column",
              }}
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
              >
                檢點表
              </button>
              <button
                className="BtnChange"
                style={{ backgroundColor: "#cc2200" }}
                onClick={handle_error_View}
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
                {machineOption.slice(0, 4)}總資訊
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
            mes_side={{ sulting: "sulting" }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}; // 注意這裡有分號

// 將 Assembly 組件作為預設匯出
export default Sulting;
