import "./index.scss";
import React, { useState, useEffect, useRef, useMemo } from "react";
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
import index from "../Home";

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
const seriesPF_name = ["VAHS28", "VAHS32", "VAHS35"];
const seriesCC1_name = ["V2_0VAh", "V3_6VAh", "V3_5VAhcom"];
// eslint-disable-next-line no-unused-vars
let dynmaic_PFCC1_name = [];
let range_PFCC1_name = [];

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
  const [PFCCData_collect, setPFCCData_collect] = useState([]); // Define PFCCData_collect state
  const [PFCCData_echart_draw, setPFCCData_echart_draw] = useState([]); // Define PFCCData_collect state
  const [pfcc_echart_visualmap, setpfcc_echart_visualmap] = useState([]); // 設置visualMap的最大值
  const [pfcc_echart_min, setpfcc_echart_min] = useState([]); // 設置visualMap的最小值
  const [pfcc_echart_max, setpfcc_echart_max] = useState([]); // 設置visualMap的最大值
  const [adjustinterval, setadjustinterval] = useState(0);
  const chartRef = useRef(null); // 创建 ref 来引用 DOM 元素 (指定图表容器)
  const visualMapArray = []; // 用於存放 visualMap 的數據
  const combinedData = []; // 用於存放合併後的數據
  const [selectedIndex, setSelectedIndex] = useState(0); //代表目前選擇的電壓分析range 索引index號碼
  const record_yearlen = parseInt(currentYear) - 2024; // 2024年為起始年

  const years = Array.from(
    { length: record_yearlen + 1 },
    (_, i) => currentYear - i
  );
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const useSetStateWithDiff = () => {
    const prevValueRef = useRef();

    const setIfChanged = (setter, newValue) => {
      const prev = prevValueRef.current;
      const isEqual = JSON.stringify(prev) === JSON.stringify(newValue); // 可改成 lodash.isEqual
      if (!isEqual) {
        prevValueRef.current = newValue;
        setter(newValue);
      }
    };

    return setIfChanged;
  };

  const updateIfChanged = (setter, currentValue, newValue) => {
    const isSame = JSON.stringify(currentValue) === JSON.stringify(newValue);
    if (!isSame) setter(newValue);
  };

  const clearScatter_digramItems = (event) => {
    // 清空以下儲存內容數據
    setadjustinterval(0);
    setpfcc_echart_visualmap([]); // 更新 visualMapArray 狀態
    setPFCCData_echart_draw([]); // 更新 PFCCData_echart_draw 狀態
  };

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

  const generate_PFCC1_Option = ({
    select_Side,
    visualMapArray,
    allSeries,
    xAxisType,
    xAxisName,
    adjustinterval,
  }) => ({
    title: {
      text: `${select_Side} 電芯數據散佈圖`,
      left: "center",
      top: 0,
    },
    grid: {
      left: "3%",
      right: "7%",
      bottom: "7%",
      containLabel: true,
    },
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const cap_mah_value = params.value;
        const name = params.name === "警戒線" ? "最低容許limit->" : params.name;
        // console.log("總接收為 = " + JSON.stringify(params, null, 2));
        return `          
         ${name} 電容量(mAH): ${cap_mah_value}<br/>           
        `;
      },
    },

    xAxis: [
      {
        type: xAxisType,
        name: xAxisName,
        axisLabel: {
          rotate: 15,
        },
      },
    ],
    yAxis: [
      {
        type: "value",
        name: "電容量 (mAh)",
        interval: adjustinterval,
        boundaryGap: [0.1, 0.1], // 上下保留 10% 空間
        min: 0,
        max: "dataMax",
        axisLabel: {
          formatter: "{value} mAh",
        },
      },
    ],
    series: allSeries,
    visualMap: visualMapArray,
  });

  const Provide_Scatter_PFCC_Diagram = async ({
    allSeries,
    visualMapArray,
    adjustinterval,
  }) => {
    let myChart;
    //let chartOption = null; // 初始化 chartOption 变量

    // console.log("serialdata 接收數據!: " + JSON.stringify(allSeries, null, 2));
    // console.log(
    //   "visualMap 接收數據!: " + JSON.stringify(visualMapArray, null, 2)
    // );

    try {
      // console.log(
      //   "初始化图表 站別:" +
      //     select_Side +
      //     " 數據: " +
      //     serialdata +
      //     " 級距拉bar內容: " +
      //     visualMap
      // );

      // 初始化图表
      // eslint-disable-next-line no-unused-vars
      myChart = echarts.init(chartRef.current, "dark", {
        renderer: "canvas",
        useDirtyRect: false,
      });

      //echarts.init(chartRef.current, undefined, { renderer: "canvas" });

      // const testOption = {
      //   xAxis: {
      //     type: "category",
      //   },
      //   yAxis: {},
      //   series: [
      //     {
      //       type: "scatter",
      //       data: [
      //         ["MW1", 1000],
      //         ["MW2", 2000],
      //         ["MW3", 3000],
      //       ],
      //     },
      //   ],
      // };

      const xAxisType_item = select_Side === "PF站" ? "category" : "category";
      const xAxisType_name = select_Side === "PF站" ? "電芯號" : "平均電壓";

      // console.log("adjustinterval調整適合的interval->" + adjustinterval);

      const chartOption = generate_PFCC1_Option({
        select_Side,
        visualMapArray,
        allSeries,
        xAxisType: xAxisType_item,
        xAxisName: xAxisType_name,
        adjustinterval,
      });

      // console.log(
      //   "chartOption 最終調整為: " + JSON.stringify(chartOption, null, 2)
      // );

      if (
        chartOption &&
        typeof chartOption === "object"
        // chartOption.series &&
        // Array.isArray(chartOption.series)
      ) {
        console.log("清除echart並重新繪圖");
        myChart.clear(); // 清除前一張圖
        // 設定圖表選項
        selectedIndex === 0
          ? myChart.setOption(chartOption)
          : // : myChart.setOption(chartOption, selectedIndex !== 0);
            myChart.setOption(chartOption, true); // 第二參數設為 true 表示 "notMerge"
      }

      window.addEventListener("resize", () => {
        if (myChart) myChart.resize();
      });
    } catch (error) {
      console.error("Error initializing chart:", error);
      return;
    }
  };

  useEffect(() => {
    const select_side_name = select_Side.slice(0, select_Side.length - 1);

    // console.log("選擇站別為:" + select_side_name);
    // console.log("選擇站年為:" + itemYear);
    // console.log("選擇站月為:" + itemMonth);

    // //呼叫自定義事件處理函數;
    // console.log("Checkbox is now:", isChecked === true ? "選取全部" : "沒選取");

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

        const responseData = response.data; // 取出 overallData

        // const { AllContent, max_list, min_list } = response.data;

        // const transformedData = AllContent.map((item) => {
        //   return {
        //     modelId: item.modelId,
        //     value: item.value,
        //   };
        // });

        // console.log(
        //   "AllContent = " + JSON.stringify(responseData.overall, null, 2)
        // );
        // console.log("max_list = " + responseData.max_list);
        // console.log("min_list = " + responseData.min_list);
        // const data_ALL = Object.entries(response.data.AllContent);

        //console.log("data_ALL = " + data_ALL);
        // console.log("data_Min = " + data_Min);
        // console.log("data_Max= " + data_Max);

        // 使用 map 遍历数组，并提取每个对象的键值对
        // const extractedData = AllContent.map((item) => {
        //   // 假设每个 item 是对象，返回该对象的所有键值对
        //   return Object.entries(item); // 返回每个对象的键值对数组
        // });

        // console.log("extractedData = " + extractedData);

        setPFCCData_collect(responseData.overall); // 更新 PFCCData_collect 狀態
        setpfcc_echart_min(responseData.min_list); // 存入 min_list 狀態
        setpfcc_echart_max(responseData.max_list); // 存入 max_list 狀態
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchAnalyze_PFCC1Data();
  }, [isChecked, select_Side, itemYear, itemMonth]); // 依賴項目為 isChecked 和 select_Side

  useEffect(() => {
    if (PFCCData_collect) {
      let allValues = [];
      let interval_default = 2000; // 預設刻度

      //清除既有畫面數據,重新import data
      clearScatter_digramItems();
      // console.log("select_Side站別為 = " + select_Side);
      // console.log(
      //   "PFCCData_collect (stringified):",
      //   JSON.stringify(PFCCData_collect, null, 2)
      // );

      // const PFCC1_ResultArray = PFCCData_collect.map((item) => {
      //   return Object.values(item); // 把每筆物件的所有值轉為陣列
      // });

      // console.log("轉換後的陣列：", PFCC1_ResultArray);

      // const entries = Object.entries(PFCCData_collect);
      // entries.forEach(([key, value]) => {
      //   console.log(`鍵名: ${key}, 值: ${value}`);
      // });

      // console.log("切換range範圍選擇項目號:" + selectedIndex);

      pfcc_echart_min.forEach((item) => {
        return Object.values;
      });

      console.log("min_list = " + pfcc_echart_min);

      pfcc_echart_max.forEach((item) => {
        return Object.values;
      });

      console.log("max_list = " + pfcc_echart_max);

      // 根據站別決定要取的 key 名稱
      dynmaic_PFCC1_name =
        select_Side === "PF站" ? seriesPF_name : seriesCC1_name;

      range_PFCC1_name.length = 0;
      range_PFCC1_name.push("全範圍");
      if (select_Side === "PF站") {
        seriesPF_name.forEach((item) => {
          range_PFCC1_name.push(item);
        });
      } else {
        seriesCC1_name.forEach((item) => {
          range_PFCC1_name.push(item);
        });
      }

      // console.log("dynmaic_PFCC1_name = " + dynmaic_PFCC1_name);

      visualMapArray.length = 0; // 清空 visualMapArray

      let diff_warin_value, midValue;

      dynmaic_PFCC1_name.forEach((key) => {
        const index = dynmaic_PFCC1_name.indexOf(key);

        const isOnlySelected = selectedIndex === index + 1;

        //這邊針對全選或只單獨選其一電壓keyname範圍做存值
        if (selectedIndex === 0 || isOnlySelected) {
          let div_radio_check_ng = false;
          //if (selectedIndex === 0 || selectedIndex === index + 1)
          const visualMin = index !== -1 ? pfcc_echart_min[index] : 0;
          const visualMax = index !== -1 ? pfcc_echart_max[index] : 6000;

          // console.log("index = " + index);
          // console.log("minValue = " + visualMin);
          // console.log("maxValue = " + visualMax);
          // console.log("key = " + key);

          midValue = (visualMin + visualMax) / 2;

          const divradio_value = midValue / visualMax;

          //當平均值/最大值 比例小於7成,這邊依序調整
          // console.log("divradio_value 平均比值為:" + divradio_value);

          const firstDecimal = Math.floor(divradio_value * 10) % 10;
          // 小數點第二位
          // const secondDecimal = Math.floor(divradio_value * 100) % 10;

          // eslint-disable-next-line no-undef
          if (firstDecimal < 7) {
            console.log("小於平均比值0.7 ,實際為:" + firstDecimal);
            div_radio_check_ng = true;
          }

          const seriesData = PFCCData_collect.map((item) => item[key]).filter(
            (val) => typeof val === "number" && !isNaN(val)
          );

          const total = seriesData.length;
          const belowMid = seriesData.filter((val) => val < midValue);
          const belowMidCount = belowMid.length;

          const percentageBelowMid = ((belowMidCount / total) * 100).toFixed(2);
          const limitbellow = 1 - percentageBelowMid * 0.01;

          // console.log(`=== ${key} 資料分析 ===`);
          // console.log(`平均基準值（midValue）: ${midValue}`);
          // console.log(`總筆數: ${total}`);
          // console.log(`小於平均基準值的筆數: ${belowMidCount}`);
          // console.log(`低於中位數的比例: ${percentageBelowMid}%`);

          // console.log("臨界容許平均值百分比以下為:" + limitbellow);
          // console.log("調整下修為:" + parseFloat(1 - limitbellow) / 2);

          const finallimit = (1 - limitbellow) / 2;
          const finallimitRounded = parseFloat(finallimit.toFixed(2));
          // console.log("finallimit = " + finallimit);

          // console.log(
          //   "1 - finallimit = " + (1.0 - finallimitRounded).toFixed(2)
          // );

          if (select_Side === "PF站") {
            diff_warin_value =
              div_radio_check_ng === true
                ? (midValue * (1 - finallimitRounded)) / 2 //這邊多除於2原因為,當max min 落差太大需要再除2達到警戒線值
                : midValue * 0.9;
          } else {
            diff_warin_value = (visualMax - visualMin) * 0.55 + visualMin;
          }

          console.log("diff_warin_value 容許警戒值為 = " + diff_warin_value);

          visualMapArray.push({
            show: true,
            type: "continuous",
            min: visualMin,
            max: visualMax,
            seriesIndex: index,
            orient: "vertical",
            // right: 10, // 避免多個 visualMap 疊在一起
            right:
              index === 0
                ? "10%"
                : index === 1
                ? "40%"
                : index === 2
                ? "70%"
                : "10%",
            top: "middle",
            dimension: 1, // y 軸的維度
            text: ["HIGH", "LOW"],
            calculable: true,
            // inRange: {
            //   color: ["#f6f6f6", "#a51a1a"],
            // },
            inRange: {
              color:
                index === 0
                  ? ["#f2c31a", "#24b7f2"]
                  : index === 1
                  ? ["#f6f6f6", "#a51a1a"]
                  : index === 2
                  ? ["#FF9224", "#5CADAD"]
                  : ["#ccc", "#000"],
            },
          });
        }
      });

      const allSeries = dynmaic_PFCC1_name
        .map((key, index) => {
          // console.log("正在執行->" + index + " 範圍:" + key);
          const isOnlyRange = selectedIndex === index + 1;

          //這邊針對全選或只單獨選其一電壓keyname範圍做存值
          if (selectedIndex === 0 || isOnlyRange) {
            const data = PFCCData_collect.map((item) => {
              const value = item[key];

              if (typeof value === "number" && !isNaN(value)) {
                allValues.push(value);
              }

              return [
                item.modelId, // 0：電芯編號
                item[key], // 1：y 軸數值
                select_Side !== "PF站"
                  ? [item.averageV1, item.averageV2, item.averageV3]
                  : 0, // 2：平均電壓
                item.extracted_filter, // 3：時間
              ];
            });

            // 根據站別切換 encode 設定
            const encodeSetting =
              select_Side === "PF站"
                ? { x: 0, y: 1 } // PF站: x = 時間, y = 電容量
                : { x: 2, y: 1 }; // CC1站: x=平均電壓, y=電容量

            const baseSeries = {
              name: key,
              type: "scatter",
              symbolSize: 10,
              data,
              encode: encodeSetting,
              itemStyle: {
                color:
                  selectedIndex === 1
                    ? "#2A52BE"
                    : selectedIndex === 2
                    ? "#F2BE45"
                    : selectedIndex === 3
                    ? "#66FFE6"
                    : selectedIndex === 0 && index === 0
                    ? "#FEC0CB"
                    : selectedIndex === 0 && index === 1
                    ? "#00FFFF"
                    : selectedIndex === 0 && index === 2
                    ? "#FFFF00"
                    : "",
              },
              tooltip: {
                trigger: "item",
                axisPointer: {
                  type: "cross",
                },
                emphasis: {
                  focus: "series",
                },
                formatter: function (params) {
                  // const [date, value, modelId] = params.data;
                  const [modelId, value, voltage_avglist, date] = params.data;

                  // const voltage_avglist = params.data[3];
                  const Total_AVGList = Array.isArray(voltage_avglist)
                    ? voltage_avglist
                        .map((v, i) => `<b>平均電壓V${i + 1}:</b> ${v}`)
                        .join("<br/>")
                    : "";

                  return `
                <b>範圍:</b> ${key}<br/>               
                <b>電芯:</b> ${modelId}<br/>                            
                <b>電容量mAH:</b> ${value}<br/>                                             
                ${
                  select_Side !== "PF站" ? Total_AVGList : "無平均電壓數據"
                }<br/>                 
                <b>日期:</b> ${date}<br/> 
                `;
                },
              },
            };

            // 只有單選才加上標線等輔助圖層
            if (isOnlyRange) {
              baseSeries.markLine = {
                label: {
                  formatter: (param) =>
                    param.type === "average"
                      ? "平均值"
                      : param.name === "警戒線"
                      ? "最低規範警戒線"
                      : param.name,
                  position: "end",
                },
                data: [
                  {
                    type: "average",
                    name: "平均值",
                    lineStyle: {
                      type: "solid",
                      color: "#FFFF93",
                      width: 2,
                    },
                  },
                  {
                    yAxis: diff_warin_value,
                    name: "警戒線",
                    lineStyle: {
                      color: "#FF5809",
                      width: 2,
                      type: "dashed",
                    },
                  },
                ],
              };

              baseSeries.markPoint = {
                data: [
                  { type: "max", name: "Max" },
                  { type: "min", name: "Min" },
                ],
              };

              baseSeries.markArea = {
                silent: true,
                itemStyle: {
                  color: "transparent",
                  borderWidth: 1,
                  borderType: "dashed",
                },
                data: [
                  [
                    {
                      name: "電容量範圍",
                      xAxis: "min",
                      yAxis: "min",
                    },
                    {
                      xAxis: "max",
                      yAxis: "max",
                    },
                  ],
                ],
              };
            }

            return baseSeries;
          }
          // 沒有符合條件就 return undefined
          return undefined;
        })
        .filter(Boolean); //  把 undefined 過濾掉

      // console.log("產生的 series 有幾筆：", allSeries.length);
      // allSeries.forEach((s, i) => {
      //   console.log(`[${i}] name: ${s.name}, data筆數: ${s.data.length}`);
      // });

      //全選電壓範圍
      if (selectedIndex === 0) {
        if (allValues.length > 0) {
          const max = Math.max(...allValues);
          const min = Math.min(...allValues);
          const range = max - min;

          const roughInterval = Math.ceil(range / 6);

          // 防止 0 除錯 or interval = 0
          interval_default =
            roughInterval > 0 ? Math.ceil(roughInterval / 100) * 100 : 100;
        }
      } //單獨選其中一範圍
      else {
        if (allSeries.length === 1) {
          const max = Math.max(...allValues);
          const min = Math.min(...allValues);
          const range = max - min;

          const roughInterval = Math.ceil(range / 3);

          // 防止 0 除錯 or interval = 0
          interval_default =
            roughInterval > 0 ? Math.ceil(roughInterval / 100) * 120 : 100;
        }
      }

      // console.log("interval 調整為 = " + interval_default);
      // console.log("visualMapArray 型態:", Array.isArray(visualMapArray));

      //將重整的data存入setPFCCData_echart_draw,後續帶入e-chart呈現圖像
      setadjustinterval(interval_default);
      // 更新 visualMapArray 狀態
      updateIfChanged(
        setpfcc_echart_visualmap,
        pfcc_echart_visualmap,
        visualMapArray
      );
      // 更新 PFCCData_echart_draw 狀態
      updateIfChanged(setPFCCData_echart_draw, PFCCData_echart_draw, allSeries);

      // PFCCData_collect.forEach((dataItem, index) => {
      //   // // 依照對應 key 列印鍵名和鍵值
      //   dynmaic_PFCC1_name.forEach((key) => {
      //     const value = dataItem[key];
      //     if (value !== undefined) {
      //       console.log(`站別: ${select_Side}，鍵名: ${key}，鍵值: ${value}`);
      //     } else {
      //       console.warn(`⚠️ 鍵名 ${key} 不存在於 PFCCData_collect 中`);
      //     }
      //   });
      // });
    } else {
      console.log("PFCCData_collect is empty or undefined.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    PFCCData_collect,
    select_Side,
    pfcc_echart_min,
    pfcc_echart_max,
    selectedIndex,
  ]); // 依賴項目為 PFCCData_collect 和 select_Side

  useEffect(() => {
    if (PFCCData_echart_draw.length > 0) {
      // console.log(
      //   "分析數據庫資料數量: " +
      //     PFCCData_echart_draw.length +
      //     " PFCCData_echart_draw 帶入chart分析數據庫資料:" +
      //     JSON.stringify(PFCCData_echart_draw, null, 2)
      // );
      // console.log(
      //   "pfcc_echart_visualmap 級距(min max):" +
      //     JSON.stringify(pfcc_echart_visualmap, null, 2)
      // );

      Provide_Scatter_PFCC_Diagram({
        allSeries: PFCCData_echart_draw,
        visualMapArray: pfcc_echart_visualmap,
        adjustinterval: adjustinterval,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    PFCCData_echart_draw,
    pfcc_echart_visualmap,
    select_Side,
    adjustinterval,
  ]);

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
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <label>
                <input
                  type="checkbox"
                  name="allchecked"
                  checked={isChecked}
                  onChange={handleCheckboxChange}
                />
                顯示總年月電芯電性數據
              </label>
              {!isChecked && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginTop: "1px",
                  }}
                >
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
                  <label style={{ marginLeft: "10px" }}>
                    電壓範圍：
                    <select
                      name="option_PFCC1_range"
                      value={selectedIndex}
                      onChange={(e) =>
                        setSelectedIndex(parseInt(e.target.value))
                      }
                    >
                      {range_PFCC1_name.map((name, index) => (
                        <option key={index} value={index}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <electric_group
                button_pfandcc1_2={button_pfandcc1_2}
                isSelected={isSelected}
                // setSelected={setSelected}
              />
            </div>
            <div
              // id="chartref"
              ref={chartRef}
              style={{ width: "350%", height: "630px", marginTop: "20px" }}
            ></div>
            <br />
          </div>
        ) : (
          <h2>待選擇顯示</h2> // 如果沒有選擇任何按鈕，顯示提示
        )}
      </div>
    </div>
  );
}

export default ScatterSchematicDig;
