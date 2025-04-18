import "./index.scss";
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import Form from "react-bootstrap/Form";
// eslint-disable-next-line no-unused-vars
import config from "../../config";
import * as echarts from "echarts/core";

import {
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  BrushComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
} from "echarts/components";
import { ScatterChart } from "echarts/charts";
import { UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  BrushComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  ScatterChart,
  CanvasRenderer,
  UniversalTransition,
]);

// const button_pfandcc1_2 = ["PF化成", "CC1分容", "CC2分容"];
const button_pfandcc1_2 = ["PF化成", "CC1分容"];

//將後端擷取的年資料放入陣列中
const track_years = [];

let elec_analysis_side;

function ScatterSchematicDig() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 0-based index, so add 1
  // 使用 useState 儲存 checkbox 的選取狀態
  const [isChecked, setIsChecked] = useState(true);
  const [selectedButtonIndex, setSelectedButtonIndex] = useState(null);
  const [select_Side, setselect_Side] = useState("");
  const [isSelected, setSelected] = useState(true); // Define isSelected state
  const [itemYear, setItemYear] = useState(currentYear);
  const [itemMonth, setItemMonth] = useState(currentMonth);

  const record_yearlen = parseInt(currentYear) - 2024; // 2024年為起始年

  const years = Array.from(
    { length: record_yearlen + 1 },
    (_, i) => currentYear - i
  );
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  // 處理按鈕點擊事件
  const handleButtonClick = (index) => {
    //console.log("目前選擇為->:" + index);
    setSelectedButtonIndex(index); // 更新選取的按鈕索引
    switch_station(index + 1);
  };

  const switch_station = (select_num) => {
    switch (select_num) {
      case 1:
        setselect_Side(
          button_pfandcc1_2[select_num - 1].toString().slice(0, 2) + "站"
        );
        break;
      case 2:
      case 3:
        setselect_Side(
          button_pfandcc1_2[select_num - 1].toString().slice(0, 3) + "站"
        );
        break;

      default:
        break;
    }

    // return elec_analysis_side;
  };

  // 當 checkbox 狀態變更時的處理函數
  const handleCheckboxChange = (event) => {
    // 更新 checkbox 狀態
    setIsChecked(event.target.checked);

    // // 呼叫自定義事件處理函數
    // console.log(
    //   "Checkbox is now:",
    //   event.target.checked ? "checked" : "unchecked"
    // );
  };

  const handleYearMonthChange = async (e) => {
    const { name, value } = e.target;

    // console.log("選擇的年月為:" + e.target.value);

    if (name === "option_year") {
      setItemYear(parseInt(value));
    } else if (name === "option_month") {
      setItemMonth(parseInt(value));
    }
  };

  useEffect(() => {
    const select_side_name = select_Side.slice(0, select_Side.length - 1);
    console.log("選擇站別為:" + select_side_name);
    console.log("選擇站年為:" + itemYear);
    console.log("選擇站月為:" + itemMonth);

    //呼叫自定義事件處理函數;
    console.log("Checkbox is now:", isChecked === true ? "選取全部" : "沒選取");

    const fetchAnalyze_PFCC1Data = async () => {
      try {
        //這邊向後端索引資料(判斷是否有勾選全部年月數據 true / 只針對某年月 false)
        const response = await axios.get(
          "http://localhost:3009/scatterdigram/getanalyzedata",
          //`${config.apiBaseUrl}/scatterdigram/getanalyzedata`,
          {
            params: {
              select_side_name: select_side_name,
              isChecked: isChecked,
              itemYear: itemYear,
              itemMonth: itemMonth,
            },
          }
        );

        const responseData = response.data;
        console.log(responseData);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchAnalyze_PFCC1Data();
  }, [isChecked, select_Side, itemYear, itemMonth]); // 依賴項目為 isChecked 和 select_Side

  return (
    <div className="scatter_schematic_digram">
      <div
        // style={{
        //   padding: "65px 10px",
        //   width: "2000px",
        //   display: "flex",
        //   flexdirection: "column",
        //   alignitems: "center",
        //   marginbottom: "10px",
        // }}
        className="tab"
      >
        {button_pfandcc1_2.map((label, index) => (
          <button
            key={index}
            // className="button"
            onClick={() => handleButtonClick(index)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 顯示選取的按鈕索引 */}
      <div>
        {selectedButtonIndex !== null ? (
          <div>
            <h2
              style={{
                // textAlign: "center",
                // fontSize: "40px",
                // marginTop: "1px",
                //display: "none",
                padding: "6px 12px",
                border: "3px solid #a51a1a",
                backgroundcolor: "rgb(206, 212, 27)",
                bordertop: "none",
              }}
            >
              {/* 電化數據分析切換: {switch_station(selectedButtonIndex + 1)} */}
              電化數據分析切換: {select_Side}
            </h2>
            <br />{" "}
            <label>
              <input
                type="checkbox"
                name="allchecked"
                checked={isChecked}
                onChange={handleCheckboxChange}
              />
              顯示總年月電芯電性數據
            </label>
            <electric_group
              button_pfandcc1_2={button_pfandcc1_2}
              isSelected={isSelected}
              // setSelected={setSelected}
            />
          </div>
        ) : (
          <h2>待選擇顯示</h2> // 如果沒有選擇任何按鈕，顯示提示
        )}
      </div>
      {!isChecked && (
        <div style={{ marginTop: "10px" }}>
          <label>
            年份：
            <select
              name="option_year"
              value={itemYear}
              onChange={handleYearMonthChange}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label style={{ marginLeft: "10px" }}>
            月份：
            <select
              name="option_month"
              value={itemMonth}
              onChange={handleYearMonthChange}
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

export default ScatterSchematicDig;
