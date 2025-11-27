import React, { useState, useEffect, useRef, Suspense } from "react";
import { Row, Col } from "reactstrap";
import moment from "moment";
import "../../styles.scss";
import api from "../../api";
import MES_EquipmentProInfo_reBuild from "../../index";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

import { group_CuttingAnode } from "../../../../mes_remak_data";
import { useNavigate } from "react-router-dom";

// 使用 const 宣告箭頭函數，然後再預設匯出
const CuttingAnode = () => {
  const [startDate, setStartDate] = useState(moment().locale("zh-tw"));
  const [inputValue, setInputValue] = useState("");
  const [machineOption, setMachineOption] = useState("");
  const [equipmentID, setEquipmentID] = useState("");
  const [shiftClass, setShiftClass] = useState("");
  const [responseData, setResponseData] = useState({}); // api update page 資料
  const [responseDataQuality, setResponseDataQuality] = useState({}); // api groupname_capacitynum 資料
  const previousDataRef = useRef({});
  const [dataReference, setDataReference] = useState({});

  const PopupAllInfo = React.lazy(() => import("../../PopupAllInfo")); // 懶加載組件
  const [modalIsOpen, setModalIsOpen] = React.useState(false);
  const navigate = useNavigate();

  // 左側資料
  const [leftData, setLeftData] = useState({});

  // 用來追蹤哪些欄位正在變色，以及它們何時需要恢復
  // 結構會是 { key: { isChanging: true } }
  const [highlightedFields, setHighlightedFields] = useState({});

  const handleSelectChange = (e) => {
    const value = e.target.value.trim();
    setInputValue(value);
    setMachineOption(value);
  };

  const handle_Introduce_View = () => {
    const sideoption = "cutting_anode";
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
    setMachineOption("負極五金模切-良品");
  }, []);

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

    const fetchData = async () => {
      try {
        const response = await api?.callCuttingAnode(machineOption || "");

        if (response?.length) {
          // console.log("API response (EdgeFolding):", response[0]);
          setResponseData(response[0]);
        } else {
          setResponseData({});
        }
      } catch (error) {
        console.error("callEdgeFolding API 錯誤:", error);
        setResponseData({});
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, 10000);

    // 返回清理函數，在組件卸載或依賴項變化時清除定時器
    return () => clearInterval(intervalId);
  }, [machineOption, modalIsOpen]);

  useEffect(() => {
    if (Object.keys(leftData).length > 0) {
      setResponseData((prev) => ({
        ...prev,
        ...leftData,
      }));
    }
  }, [leftData]);

  console.log("responseData:", responseData);

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
    previousDataRef.current = { ...responseData, ...leftData };
  }, [responseData, leftData]);

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

    let currentShiftClass;
    // 判斷班別邏輯
    if (hour >= 8 && hour < 20) {
      currentShiftClass = "早班";
    } else {
      currentShiftClass = "晚班";
    }
    setShiftClass(currentShiftClass.trim());

    if (modalIsOpen === true) {
      console.log("Modal is open, skipping fetchData");
      return;
    }

    const fetchQuality = async () => {
      try {
        const response = await api?.callCuttingAnode_groupname_capacitynum(
          machineOption || "",
          startDate.format("YYYY-MM-DD HH:mm:ss") || ""
        );

        console.log("API回傳 callEdgeFolding_groupname_capacitynum:", response);
        if (response?.length > 0) {
          setLeftData(response[0]);
        }
      } catch (error) {
        console.error("callEdgeFolding_groupname_capacitynum API 錯誤:", error);
        setLeftData({});
      }
    };

    fetchQuality();
    const intervalId = setInterval(fetchQuality, 10000);
    return () => clearInterval(intervalId);
  }, [machineOption, equipmentID, startDate, modalIsOpen]);

  // 抓取 Reference setting 的資料
  const varName = String("group_CuttingAnode").trim();
  const IDuni = responseData?.ID;

  useEffect(() => {
    try {
      if (!varName) {
        console.error("varName is empty or undefined");
        return;
      }

      const fetchReference = async () => {
        console.log("呼叫 callGet_referenceItem API，變數名稱:", varName);
        const response = await api.callGet_referenceItem(varName);
        console.log("api回傳 callGet_referenceItem:", response);
        if (response) {
          setDataReference(response);
          console.log("dataReference:", dataReference);
        }
      };
      fetchReference();
    } catch (error) {
      console.error("callPost_referenceItem API 錯誤:", error);
    }
  }, [IDuni]);

  // 當 dataReference 變化時，更新資料
  useEffect(() => {
    if (!dataReference || Object.keys(dataReference).length === 0) return;
    console.log("dataReference 更新:", dataReference);

    if (modalIsOpen === true) {
      console.log("Modal is open, skipping fetchData");
      return;
    }

    const fetchPostData = async () => {
      if (!varName && varName === undefined) {
        console.error("varName is empty or undefined");
        return;
      }
      try {
        const response = await api.callPost_referenceItem(
          varName,
          dataReference
        );
        console.log("Post API回傳資料:", response);
      } catch (error) {
        console.error("callPost_referenceItem API 錯誤:", error);
      }
    };

    fetchPostData();
  }, [dataReference, varName]);

  const handleLink = () => {
    const pdfUrl = "/pdf/Edge Folding.pdf";
    if (pdfUrl) {
      window.open(pdfUrl, "_blank");
    } else {
      alert("PDF 連結未設定");
    }
  };

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
        <option value="負極五金模切-良品">負極五金模切-良品</option>
        <option value="負極五金模切-不良品">負極五金模切-不良品</option>
        <option value="負極五金模切-手動良品">負極五金模切-手工良品</option>
        <option value="負極五金模切-手動不良品">負極五金模切-手工不良品</option>
        <option value="負極五金模切-報廢品">負極五金模切-報廢品</option>
      </select>

      <Row className="EdgeFoldingRow" style={{ flexWrap: "nowrap" }}>
        {/* 左欄 */}
        <Col lg={3} md={3} sm={12} style={{ minWidth: 300 }}>
          <div className="LeftContent">
            <div className="Content_Top">
              <div className="Title">生產資訊標籤</div>
              <div className="Content">●設備編號:</div>
              <div className="Answer" style={getColorStyle("cellNO")}>
                {responseData.MachineNO || "抓取中"}{" "}
              </div>
              <div className="Content">●目前狀態:</div>
              <div className="Answer" style={getColorStyle("boxNO")}>
                {responseData.boxNO || "抓取中"}
              </div>
              <div className="Content">●目前生產人員:</div>
              <div className="Answer">
                <div
                  className="AnswerEquipment"
                  style={getColorStyle("CurrentEdgeOP")}
                >
                  {leftData?.staffRows?.[0]?.StaffNo1 || "抓取中"}|{" "}
                  {leftData?.staffRows?.[0]?.StaffName1 || "抓取中"}
                  <br />
                  {leftData?.staffRows?.[0]?.StaffNo2 || "抓取中"}|{" "}
                  {leftData?.staffRows?.[0]?.StaffName2 || "抓取中"}
                </div>
              </div>
              <div className="Content">●目前工單號:</div>
              <div className="Answer" style={getColorStyle("stageID")}>
                {responseData.CellNO || "抓取中"}
              </div>
              <div className="Content">●當日產能:</div>
              <div
                className="Answer"
                key={"todayCapacity_first_result"}
                style={getColorStyle("todayCapacity_first_result")}
              >
                {leftData?.todayCapacity_first_result || "抓取中"} PCS
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

              {startDate &&
              leftData?.selectedDayCapacity_first_result !== null ? (
                <div
                  className="Answer"
                  key={"selectedDayCapacity_first_result"}
                  style={getColorStyle("selectedDayCapacity_first_result")}
                >
                  累積產能 :
                  {leftData?.selectedDayCapacity_first_result || "抓取中"} PCS
                </div>
              ) : (
                <div style={{ fontSize: "1.5rem", color: "red" }}>
                  請先選定日期區間
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
                  key={"morningShiftCapacity_first_result"}
                  style={getColorStyle("morningShiftCapacity_first_result")}
                >
                  班別產能:
                  {leftData?.morningShiftCapacity_first_result || "抓取中"} PCS
                </div>
              ) : (
                <div
                  className="Answer"
                  key={"nightShiftCapacity_first_result"}
                  style={getColorStyle("nightShiftCapacity_first_result")}
                >
                  班別產能:
                  {leftData?.nightShiftCapacity_first_result || "抓取中"} PCS
                </div>
              )}
              <div className="Content">●設備維護員:</div>
              <div className="Answer">
                <div
                  className="AnswerEquipment"
                  style={getColorStyle("CurrentEdgeOP")}
                >
                  {leftData?.staffRows?.[0]?.StaffNo1 || "抓取中"}|{" "}
                  {leftData?.staffRows?.[0]?.StaffName1 || "抓取中"}
                  <br />
                  {leftData?.staffRows?.[0]?.StaffNo2 || "抓取中"}|{" "}
                  {leftData?.staffRows?.[0]?.StaffName2 || "抓取中"}
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
                {Object.keys(group_CuttingAnode).map((groupName) => {
                  const labelMap = group_CuttingAnode[groupName]?.[0] || {};
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
                onClick={handleShow}
              >
                負極模切站總資訊
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
            mes_side={{ cuttingCathode: "cuttingAnode" }}
          />
        </Suspense>
      ) : null}
    </div>
  );
};
export default CuttingAnode;
