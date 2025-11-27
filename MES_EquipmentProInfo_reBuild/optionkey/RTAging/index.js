import { useState, useEffect, useRef } from "react";
import React, { Suspense } from "react";
import MESEquipmentProInfoRebuild from "../..";
import DatePicker from "react-datepicker";
import moment from "moment";
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
import "../../styles.scss"; // 引入樣式檔案
import api from "../../api";
import {
  mes_HR_TEMP_Aging,
  change_HRT_Aging_batchfield,
  change_RTAging_field,
} from "../../../../mes_remak_data";
import {
  couldStartTrivia,
  createNoSubstitutionTemplateLiteral,
} from "typescript";

import { useNavigate } from "react-router-dom";

const keyOrder = [
  "ID",
  "MachineNO",
  "MachineStatus",
  "OP",
  "Time",
  "WO",
  "BIN_CODE",
  "BIN_STA",
  "BOX_BATT",
  "BOX_BATT_SEQ",
  "BOX_NO",
  "CREATE_DATE",
  "CREATE_TYPE",
  "INBOUND_DATE",
  "OUTBOUND_DATE",
  "TEST1_DATE_BEGIN",
  "TEST1_DATE_END",
  "TEST1_VALUE",
  "TEST2_DATE_BEGIN",
  "TEST2_DATE_END",
  "TEST2_VALUE",
  "TEST_STATUS",
  "TYPE",
  "MES_RECEIVE_FLG",
];

const RTAging = () => {
  const [inputValue, setInputValue] = React.useState("");
  const [machineOption, setMachineOption] = useState(
    mes_HR_TEMP_Aging[1] || "N%"
  ); // 預設值N%為第一個選項
  const [responseData, setResponseData] = useState({}); // api update page 資料
  const [startDate, setStartDate] = useState(moment().locale("zh-tw"));
  const [shiftClass, setShiftClass] = useState("");
  const [responseDataQuality, setResponseDataQuality] = useState({}); // api groupname_capacitynum 資料
  const [modalIsOpen, setIsOpen] = React.useState(false);
  const [equipmentID, setEquipmentID] = useState("");
  const PopupAllInfo = React.lazy(() => import("../../PopupAllInfo")); // 懶加載組件
  const previousDataRef = useRef({});
  const [dataReference, setDataReference] = useState({});
  const mes_RT_Aging_period = "常溫倉靜置";

  // 左側資料
  const [leftData, setLeftData] = useState({});

  //設定操作性名
  const [member_name, setmember_name] = useState("");

  // 用來追蹤哪些欄位正在變色，以及它們何時需要恢復
  // 結構會是 { key: { isChanging: true } }
  const [highlightedFields, setHighlightedFields] = useState({});
  const [isMainDataLoading, setIsMainDataLoading] = useState(false);
  const navigate = useNavigate();

  const handle_Introduce_View = () => {
    const sideoption = "rt_aging";
    console.log("side option = " + sideoption);
    navigate(`/Mes_WorkflowIntroduce/${sideoption}`);
  };

  const handleShow = () => {
    setIsOpen(true);
  };
  const handleOnHide = () => {
    setIsOpen(false);
  };
  const handleSelectChange = (e) => {
    setInputValue(e.target.value);
    setMachineOption(String(e.target.value).trim());
  };

  const fetchQuality = async () => {
    const memeID = responseData[0]?.OP || "";
    console.log("memeID = " + parseInt(memeID));

    setIsMainDataLoading(true);

    try {
      if (modalIsOpen === true) {
        console.log("Modal is open, skipping fetchData");
        return;
      } else if (modalIsOpen === false) {
        const response = await api?.callRTAging_groupname_capacitynum(
          machineOption || "",
          startDate.format("YYYY-MM-DD HH:mm:ss") || "",
          String(parseInt(memeID)) || ""
        );

        console.log(
          "API回傳 callRTAging_groupname_capacitynum:",
          JSON.stringify(response, null, 2)
        );

        // console.log("type response " + typeof response);
        // console.log("操作員工: " + response[0][1].staffName1);

        if (Array.isArray(response) && response.length > 0) {
          // console.log("有設定setLeftData");
          setLeftData(response);
        }
      }
    } catch (error) {
      console.error("callRTAging_groupname_capacitynum API 錯誤:", error);
      setLeftData({});
    } finally {
      setIsMainDataLoading(false);
    }
  };

  const handleSettingChange = (key, value) => {
    const updatedDataReference = { ...dataReference };

    for (const groupName in updatedDataReference) {
      const settingData = updatedDataReference[groupName]?.[0] || {};
      if (key in settingData) {
        updatedDataReference[groupName] = [
          {
            ...settingData,
            [key]: value,
          },
        ];
        break;
      }
    }
    setDataReference(updatedDataReference);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineOption, equipmentID, startDate, modalIsOpen]);

  useEffect(() => {
    if (Object.keys(leftData).length > 0) {
      setResponseData((prev) => {
        const updatedData = {
          ...prev, // 保留原本的 responseData
          leftData: [...(prev.leftData || []), ...leftData], // 合併 leftData 陣列
        };
        console.log("updated responseData:", updatedData);

        return updatedData;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftData]);

  console.log("最終responseData:", responseData);
  // 抓取 Reference setting 的資料
  const varName = String("change_RTAging_field").trim();
  const IDuni = responseData?.ID || responseData?.id || "";

  // 監聽 responseData 變化，執行比較和高亮邏輯
  useEffect(() => {
    if (Object?.keys(responseData)?.length === 0) {
      previousDataRef.current = {}; // 清空 previousDataRef
      return;
    }
    // 第一次載入時或 previousDataRef 為空時，初始化 previousDataRef
    if (Object?.keys(previousDataRef.current)?.length === 0) {
      previousDataRef.current = { ...responseData, ...leftData };
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

    for (const key in leftData) {
      if (
        Object.prototype.hasOwnProperty.call(prevData, key) &&
        String(leftData[key]) !== String(prevData[key])
      ) {
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

    // 更新 previousDataRef.current 以便下次比較
    // 保證只將新增的 responseData 和 leftData 更新進去
    previousDataRef.current = { ...responseData, ...leftData };

    const staffName1 =
      Array.isArray(responseData.leftData) &&
      responseData.leftData[0]?.[1]?.staffName1;

    if (staffName1 !== member_name) {
      // console.log("staffName1 =" + staffName1, "準備儲存setmember_name");
      setmember_name(staffName1);
    }
  }, [responseData, leftData, member_name]); // 當 responseData 或 leftData 改變時執行

  const fetchData = async () => {
    setIsMainDataLoading(true);
    try {
      if (modalIsOpen === true) {
        console.log("Modal is open, skipping fetchData");
        return;
      } else if (modalIsOpen === false) {
        const response = await api?.callRTAging(machineOption);

        if (response?.length) {
          console.log("API response (RTAging):", response);

          const realObj = response.find((obj) => obj.realtable);
          const batchObj = response.find((obj) => obj.batchtable);

          // 將 realtable 轉為 Map，使用字串 ID 為 key
          const realtable = realObj.realtable || []; // 取出陣列

          const realMap = {};
          realtable.forEach((item) => {
            const id = String(item.ID); // 強制轉成字串
            realMap[id] = item;
          });

          if (realObj && batchObj) {
            const batchtable = batchObj.batchtable;

            const merged = batchtable.map((batchitem, index) => {
              const id = String(batchitem.ID); // 強制轉字串
              const realtime_Item = realMap[id] || realtable[index] || {}; // ⬅ index 作為 fallback

              // 如果找不到對應的 realtable 項目，則使用空物件
              // 合併物件，將 batchitem 的屬性覆蓋到 realtime_Item 上
              const mergedItem = { ...realtime_Item, ...batchitem };

              // 重建有序物件
              const orderedItem = {};
              keyOrder.forEach((key) => {
                if (mergedItem.hasOwnProperty(key)) {
                  orderedItem[key] = mergedItem[key];
                }
              });

              return orderedItem;
            });

            console.log("合併後的資料:", merged);

            // 更新狀態
            setResponseData(merged);
          } else {
            console.error(
              "資料格式錯誤，找不到 realtable 或 batchtable",
              response
            );
          }
        }
      } else {
        setResponseData({});
      }
    } catch (error) {
      console.error("callRTAging API 錯誤:", error);
      setResponseData({});
    } finally {
      setIsMainDataLoading(false);
    }
  };

  useEffect(() => {
    try {
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
          console.log("C fetchPostData 被呼叫");
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
    // eslint-disable-next-line no-use-before-define
  }, [dataReference, varName, modalIsOpen]);

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

  const handleSubmit = () => {
    if (inputValue === "常溫倉靜置-1期") {
      console.log("常溫倉靜置-1期");
    } else if (inputValue === "常溫倉靜置-2期") {
      console.log("常溫倉靜置-2期");
    } else {
      alert("請選擇正確的選項");
    }
  };

  return (
    <div>
      <MESEquipmentProInfoRebuild />
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
        {/* <option value="">請選擇</option> */}
        {/* <option value="常溫倉靜置-1期">常溫倉靜置-1期</option>
        <option value="常溫倉靜置-2期">常溫倉靜置-2期</option> */}
        {/* 常溫倉靜置站選單 */}
        {mes_HR_TEMP_Aging.length > 0 &&
          mes_HR_TEMP_Aging.map((item, index) =>
            index >= 1 ? (
              <option key={index} value={item}>
                {mes_RT_Aging_period + "-" + parseInt(index) + "期"}
              </option>
            ) : null
          )}
      </select>
      <Row>
        <Col lg={12} md={12} sm={12}></Col>
      </Row>

      <Row className="EdgeFoldingRow" style={{ flexWrap: "nowrap" }}>
        {/* 左欄 */}
        <Col lg={3} md={3} sm={12} style={{ minWidth: 300 }}>
          <div className="LeftContent">
            <div className="Content_Top">
              <div className="Title">生產資訊標籤</div>
              <div className="Content">●設備編號:</div>
              <div className="Answer" style={getColorStyle("cellNO")}>
                {responseData[0]?.MachineNO || "抓取中"}{" "}
              </div>
              <div className="Content">●目前狀態:</div>
              <div className="Answer" style={getColorStyle("boxNO")}>
                {responseData[0]?.MachineStatus || "抓取中"}
              </div>
              <div className="Content">●目前生產人員:</div>
              <div className="Answer">
                <div
                  className="AnswerEquipment"
                  style={getColorStyle("CurrentEdgeOP")}
                >
                  {responseData[0]?.OP || "抓取中"}
                  {"|"}
                  {member_name ? member_name : "抓取中"}
                </div>
              </div>
              <div className="Content">●目前工單號:</div>
              <div className="Answer" style={getColorStyle("stageID")}>
                {responseData[0]?.BOX_BATT || "抓取中"}
              </div>
              <div className="Content">●當日產能:</div>
              <div
                className="Answer"
                key={"fulltime"}
                style={getColorStyle("fulltime")}
              >
                {(Array.isArray(responseData.leftData) &&
                  responseData.leftData[0]?.[0]?.fulltime) ||
                  "抓取中"}{" "}
                PCS
              </div>
              <div className="Content">●班別:</div>
              {/* 班別也可能需要變色，但它不是來自 responseData，而是根據時間判斷 */}
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
              {machineOption.toString().includes("Stack") &&
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
                  {(Array.isArray(responseData.leftData) &&
                    responseData.leftData[0]?.[0]?.selectedDayCapacity) ||
                    "抓取中"}{" "}
                  PCS
                </div>
              )}
              <div className="Content">
                {" "}
                {shiftClass || "抓取中"}|{responseDataQuality.status || ""}|
                生產中
              </div>
              {shiftClass === "早班" ? (
                <div
                  className="Answer"
                  key={"morningShiftDayCapacity_result"}
                  style={getColorStyle("morningShiftDayCapacity_result")}
                >
                  班別產能:
                  {(Array.isArray(responseData.leftData) &&
                    responseData.leftData[0]?.[0]?.morningShiftCapacity) ||
                    "抓取中"}
                  PCS
                </div>
              ) : (
                <div
                  className="Answer"
                  key={"nightShiftDayCapacity_result"}
                  style={getColorStyle("nightShiftDayCapacity_result")}
                >
                  班別產能:
                  {(Array.isArray(responseData.leftData) &&
                    responseData.leftData[0]?.[0]?.nightShiftCapacity) ||
                    "抓取中"}
                  PCS
                </div>
              )}
              <div className="Content">●設備維護員:</div>
              <div className="Answer">
                <div
                  className="AnswerEquipment"
                  style={getColorStyle("CurrentEdgeOP")}
                >
                  {responseData.OPNO || "抓取中"}
                  {"|"}
                  {member_name ? member_name : "抓取中"}
                </div>
              </div>
            </div>
          </div>
        </Col>
        <Col lg={5} md={5} sm={12}>
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
                {Object.keys(change_RTAging_field).map((groupName) => {
                  const labelMap = change_RTAging_field[groupName]?.[0] || {};
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
                        // 使用 Object.keys(labelMap) 來獲取每個欄位的 key
                        // 並使用 key 來獲取對應的值

                        // const trimmedKey = key.trim();
                        // const value = responseData[0]?.[key] ?? ""; // 獲取 labelMap 中對應 key 的值
                        // const settingValue = getSettingValueForKey(trimmedKey);
                        // console.log("key:", trimmedKey, "value:", value);

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
                              value={responseData[0]?.[key] ?? ""}
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
                ;
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
                常溫站產能總資訊
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
            mes_side={{ rtaging: "rtaging" }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}; // 注意這裡有分號

// 將 Assembly 組件作為預設匯出
export default RTAging;
