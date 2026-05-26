import "./index.scss";
import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import Form from "react-bootstrap/Form";
// eslint-disable-next-line no-unused-vars
import config from "../../config";
import * as echarts from "echarts/core";
import { ClipLoader } from "react-spinners";
import Skeleton from "react-loading-skeleton";
import * as XLSX from "xlsx";
import "react-loading-skeleton/dist/skeleton.css";

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
import moment from "moment";
import { toast } from "react-toastify";

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
const button_pfandcc1_2 = ["PF化成", "CC1分容", "CC2分容"];
const seriesPF_name = ["VAHS28", "VAHS32", "VAHS35", "VAHS_PF_SUM"];
const seriesCC1_name = ["V2_0VAh", "V3_6VAh", "V3_5VAhcom", "VAHS_CC_SUM"];
const avg_list = ["Avg2","Avg3"];
// eslint-disable-next-line no-unused-vars
let dynmaic_PFCC1_name = [];
let range_PFCC1_name = [];

// 1:使用object 轉化  2: 使用array 轉化
const xlsx_data_flow = Number("2");

const formatDate_local = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

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
  //預設查詢當前年月(第一天,最後一天)	  ----start------
  const [itemStartDate, setItemStartDate] = useState(
    formatDate_local(new Date(currentYear, today.getMonth(), 1))
  );
  const [itemEndDate, setItemEndDate] = useState(
    formatDate_local(new Date(currentYear, currentMonth, 0))
  );
  //----end------
  const [PFCCData_collect, setPFCCData_collect] = useState([]); // Define PFCCData_collect state
  const [PFCCData_echart_draw, setPFCCData_echart_draw] = useState([]); // Define PFCCData_collect state
  const [pfcc_echart_visualmap, setpfcc_echart_visualmap] = useState([]); // 設置visualMap的最大值
  const [pfcc_echart_min, setpfcc_echart_min] = useState([]); // 設置visualMap的最小值
  const [pfcc_echart_max, setpfcc_echart_max] = useState([]); // 設置visualMap的最大值
  const [adjustinterval, setadjustinterval] = useState(0);
  const chartRef = useRef(null); // 创建 ref 来引用 DOM 元素 (指定图表容器)
  const visualMapArray = []; // 用於存放 visualMap 的數據
  const combinedData = []; // 用於存放合併後的數據
  const [selectedIndex, setSelectedIndex] = useState(0); //代表目前選getanalyzedata擇的電壓分析range 索引index號碼
  const record_yearlen = parseInt(currentYear) - 2024; // 2024年為起始年
  const [loading, setLoading] = useState(false); //增加搜尋緩衝判斷
  const cancelTokenRef = useRef(null);
  const [capacityvalue, setCapacity_Value] = useState({
    minCap_low: Number("0").toFixed(2), //低電容量下限limit lower
    maxCap_up: Number("200000").toFixed(2), //高電容量上限limit upper
  });
  const [captrigger, setCap_trigger] = useState(false);

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

  const handleYearMonthCalendarChange = async (e) => {
    const { name, value } = e.target;
    let firstDay, lastDay;
    let adjust_1toend = false;
    // console.log("選擇的年月或日期為:" + e.target.value);

    if (name === "option_year") {
      setItemYear(parseInt(value));
      firstDay = formatDate_local(new Date(parseInt(value), itemMonth - 1, 1));
      lastDay = formatDate_local(new Date(parseInt(value), itemMonth, 0));
      adjust_1toend = true;
    } else if (name === "option_month") {
      setItemMonth(parseInt(value));
      firstDay = formatDate_local(new Date(itemYear, parseInt(value) - 1, 1));
      lastDay = formatDate_local(new Date(itemYear, parseInt(value), 0));
      adjust_1toend = true;
    }

    //調整會該年月第一天到最後一天
    if (adjust_1toend) {
      setItemStartDate(firstDay);
      setItemEndDate(lastDay);
    } //調整查詢當前選擇年月指定區間
    else {
      if (name === "trip-start") {
        // 防止選到比結束日期晚的開始日
        if (new Date(value) > new Date(itemEndDate)) {
          setItemStartDate(itemEndDate);
        } else {
          setItemStartDate(value);
        }
      } else if (name === "trip-end") {
        // 防止選到比開始日期早的結束日
        if (new Date(value) < new Date(itemStartDate)) {
          setItemEndDate(itemStartDate);
        } else {
          setItemEndDate(value);
        }
      }
    }
  };

  const handleChange = async (e) => {
    const { name, value } = e.target;
    setCapacity_Value({ ...capacityvalue, [name]: value });		
  }

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
    load_status
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

      if (!chartRef.current) return;

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

      //判定是否已經擷取完資料量完整
      //使用原生動畫
      if (load_status) {
        console.log("正在載入中....")
        myChart.showLoading("default", {
          text: "資料載入中..."
        });
      } else {
        console.log("完成載入....")
        myChart.hideLoading();
         // 這裡更新圖表 option
        myChart.setOption(chartOption, true); // 第二個參數 true → 重置圖表
      }
      
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

     const scan_timer = setTimeout(() => {
        fetchAnalyze_PFCC1Data();
      }, 300); // 防止重複執行 API

    const fetchAnalyze_PFCC1Data = async () => {

    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel("取消前次request請求!");
    }
    cancelTokenRef.current = axios.CancelToken.source();
    setLoading(true);

    try {
        //這邊向後端索引資料(判斷是否有勾選全部年月數據 true / 只針對某年月 false)
        const response = await axios.get(
         //  "http://localhost:3009/scatterdigram/getanalyzedata",
          `${config.apiBaseUrl}/scatterdigram/getanalyzedata`,
          {
            cancelToken: cancelTokenRef.current.token,
            params: {
              select_side_name: select_side_name,
              isChecked: isChecked,
              itemYear: itemYear,
              itemMonth: itemMonth,
              itemStartDate: itemStartDate,
              itemEndDate: itemEndDate,
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

        // console.log("data_ALL = " + data_ALL);
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
        if (axios.isCancel(error)) {
          console.log("🚫 request 被取消");
        } else {
          console.error("Error fetching data:", error);
        }        
      } finally{
        setLoading(false);
      }
    };

    //每次執行緒都要重啟下列過程,清除計數器並將tokenref清除待重新配置
    return () => {
      clearTimeout(scan_timer);
      if (cancelTokenRef.current) {
        cancelTokenRef.current.cancel("component unmount");
      }
    };

    // fetchAnalyze_PFCC1Data();
  }, [isChecked, select_Side, itemYear, itemMonth, itemStartDate, itemEndDate]); // 依賴項目為 isChecked 和 select_Side

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
          let visualMin = index !== -1 ? pfcc_echart_min[index] : 0;
          let visualMax = index !== -1 ? pfcc_echart_max[index] : 6000;

          if (index > 2) {
            // 取前三個範圍累加
            visualMin =
              pfcc_echart_min[0] + pfcc_echart_min[1] + pfcc_echart_min[2];
            visualMax =
              pfcc_echart_max[0] + pfcc_echart_max[1] + pfcc_echart_max[2];
          }

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

            if (selectedIndex === 4 && div_radio_check_ng) {
              // console.log("有切換PF站 CC2分容範圍,重新計算警戒值");
              const adjust_fix = diff_warin_value * 0.51;
              // console.log("adjust_fix 調整FIX = " + adjust_fix);
              // console.log("midValue   = " + midValue);
              diff_warin_value = midValue - adjust_fix;
            }
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
                : index === 3
                ? "90%"
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


      const min_cap = selectedIndex === 0 ? 0 : Number(capacityvalue.minCap_low);
      const max_cap = selectedIndex === 0 ? 200000 : Number(capacityvalue.maxCap_up);

      const isValid_cap_max_min = Number.isFinite(min_cap) && Number.isFinite(max_cap);

      // if (isValid_cap_max_min) {
      //   console.log(
      //     `captrigger狀態為:${captrigger}   低Cap下限狀態為:${min.toFixed(2)} 高Cap上限狀態為:${max.toFixed(2)}`
      //   );
      // }
             
      const allSeries = dynmaic_PFCC1_name        
        .map((key, index) => {
          // console.log("正在執行->" + index + " 範圍:" + key);
          const isOnlyRange = selectedIndex === index + 1;
           
          //這邊針對全選或只單獨選其一電壓keyname範圍做存值
          if (selectedIndex === 0 || isOnlyRange) {
            const data = PFCCData_collect
            .filter((item) => {
              const value = item[key];
              if (typeof value !== "number" || isNaN(value)) return false;            
              // console.log(`第${index}筆keyname範圍做存值=`+value );

              //若單選壓段,目前需要多判定電容量間距設置範圍
              if(isOnlyRange && isValid_cap_max_min){
                  const recive_capvalue = Number(value);
                  //console.log("若單選壓段,目前需要多判定電容量間距設置範圍");              
                  const inRange = recive_capvalue >= min_cap && recive_capvalue <= max_cap;

                  if (inRange) {
                    allValues.push(recive_capvalue);
                  }
                  return inRange;   // ✅ 不符合會直接 false                                       
              }   
              
               // 👉 全選 或 沒有啟用範圍 → 全部保留
                allValues.push(value);
                return true;                    
            })
            .map((item ) => {              
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
                    : selectedIndex === 4
                    ? "#FF9797"
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

      // console.log("allvalue 整體數值為:"+ allValues);

      //全選電壓範圍
      if (selectedIndex === 0) {
          setCap_trigger(false);  //針對電容量調整選單隱藏是否

        if (allValues.length > 0) {
          //陣列的長度非常大時，這會導致堆疊溢出錯誤
          // const max = Math.max(...allValues);
          // const min = Math.min(...allValues);

          let max = -Infinity;
          let min = Infinity;
          for (let i = 0; i < allValues.length; i++) {
            if (allValues[i] > max) max = allValues[i];
            if (allValues[i] < min) min = allValues[i];
          }
          const range = max - min;

          const roughInterval = Math.ceil(range / 6);

          // 防止 0 除錯 or interval = 0
          interval_default =
            roughInterval > 0 ? Math.ceil(roughInterval / 100) * 100 : 100;
        }
      } //單獨選其中一範圍
      else {
        if (allSeries.length === 1) {
          setCap_trigger(true);  //針對電容量調整選單隱藏是否
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
    capacityvalue
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

      //多壓段切回後回到預設電容量
      if(selectedIndex === 0){
          setCapacity_Value({
          ...capacityvalue,
          minCap_low: Number(0).toFixed(2),
          maxCap_up: Number(200000).toFixed(2)
        });
      }

      Provide_Scatter_PFCC_Diagram({
        allSeries: PFCCData_echart_draw,
        visualMapArray: pfcc_echart_visualmap,
        adjustinterval: adjustinterval,
        load_status : loading
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    PFCCData_echart_draw,
    pfcc_echart_visualmap,
    select_Side,
    adjustinterval,
    loading
  ]);

  const deepFlatten = (arr) => {
    return arr.flatMap(item =>
      Array.isArray(item)
        ? deepFlatten(item)
        : item
    );
  };

  const exportDetec_Cap_ToExcel = ( data_all ) => {
    //找尋鍵名CC放電電壓鍵名
    const voltage_key = data_all.flatMap(item => item.name);
    const array_cap_header = ["modleID電芯號",voltage_key+"_電容量(mAH)","Avg1","Avg2","Avg3","數據date日期"];
    
    const filename  = select_Side+"_"+voltage_key+"_"+itemYear+itemMonth+"_電容範圍_"+String(capacityvalue.minCap_low)+"_"+String(capacityvalue.maxCap_up);
    console.log("產出filename = " + filename);
    const cap_avgvol_info_data = data_all.flatMap(item => item.data);

    //當電容資訊為空時,不產生xlsx
    if(!cap_avgvol_info_data)
    {
      toast.error("按下多刷新幾次!");              
      return;      
    }

    //------------方法1: 使用object map 物件回存-----------------------
    const data__flat_json_final = cap_avgvol_info_data.map(([id, value, avg = [], date]) => {
      const [Avg1, Avg2, Avg3] = !select_Side.includes("PF")? avg: [0,0,0];

      if(select_Side.includes("PF")){
         return {
          modleID電芯號: id,
          [array_cap_header[1]]: value,
          Avg1,          
          數據date日期: date,
        };

      }else{
        return {
          modleID電芯號: id,
          [array_cap_header[1]]: value,
          Avg1,
          Avg2,
          Avg3,
          數據date日期: date,
        };
      }    
    });
    console.log("data__flat_json_final內部array再次攤平結果 :",JSON.stringify(data__flat_json_final,null,2));


              
    //------------方法2: 使用sclice 每筆6做物件回存-----------------------
    //無限攤平（deep flatten）(因內部有可能會有array摻雜)
    const deep_array_redc = cap_avgvol_info_data.map((item)=> deepFlatten(item) );
    const array_data_combine = [...array_cap_header,...deep_array_redc];
    const chunkSize = !select_Side.includes("PF")?6:4; //CC 每6組,pf每4組 ->為一單位object
    const data_result = [];

    //全部flatmap 重整維一維陣列
    const flat_fix_all_onearray = array_data_combine.flatMap(item => {
      // console.log("實際擷取item"+ typeof item +  "val = "+ item);
      if (Array.isArray(item)) return item;
      
      const pf_noavg = select_Side.includes("PF") && avg_list.includes(item);

      if(pf_noavg) return [];

      if (select_Side.includes("PF") && item ==="Avg1")
         item = "noAvg無均電壓";

      return [item];
    });

    // console.log("array_data_combine 原始數據為 :",array_data_combine);
    //  console.log("flat_fix_all 重整維一數據為 :",flat_fix_all_onearray);
    const headerall = array_data_combine.slice(0, 6);
    const cap_avgv_raw = array_data_combine.slice(6);

    //需要都是row資料源,不含header(標頭)
    for (let i = 0; i < flat_fix_all_onearray.length; i += chunkSize) {
      // row 是「一組資料」     
      let row = flat_fix_all_onearray.slice(i, i + chunkSize); 
      
      data_result.push(row);       
    }
    //--------------------------------end--------------------------------------

    // console.log("全部筆資料為(含key,data):",JSON.stringify(data_result,null,2));

    const worksheet = xlsx_data_flow ===1? XLSX.utils.json_to_sheet(data__flat_json_final): XLSX.utils.aoa_to_sheet(data_result);;
    
    //object 轉檔
    if(xlsx_data_flow === 1){
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "偵測數據表單");

          //  產生下載鏈接
          const excelBuffer = XLSX.write(workbook, {
            bookType: "xlsx",
            type: "array",
          });
          const blob = new Blob([excelBuffer], { type: "application/octet-stream" });

          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.setAttribute("download", filename+".xlsx"); 
          document.body.appendChild(link);
          link.click();
          URL.revokeObjectURL(url);

      }//array data 轉檔
      else{

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "偵測數據表單");

        const excelBuffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
        });

        const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename+".xlsx");
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }

      console.log("轉化xlsx 完成!");
      toast.success("xlsx資料保存成功");
  };

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
            <div style={{ display: "flex", alignItems: "center", gap: "20px"  }}>
              <label style={{minWidth:"200px"}}>
                <input
                  type="checkbox"
                  name="allchecked"
                  checked={isChecked}
                  onChange={handleCheckboxChange}
                />
                顯示{itemYear}年{itemMonth}月電芯電性數據
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
                  <label style={{ marginLeft: "15px" , minWidth:"150px" }}>
                    年份：
                    <select
                      name="option_year"
                      value={itemYear}
                      onChange={handleYearMonthCalendarChange}
                    >
                      {years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ minWidth:"100px" }}>
                    月份：
                    <select
                      name="option_month"
                      value={itemMonth}
                      onChange={handleYearMonthCalendarChange}
                    >
                      {months.map((month) => (
                        <option key={month} value={month}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </label>
                  {/* 日期區塊 */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      marginLeft: "auto",
                      alignContent: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        marginRight: "20px",
                      }}
                    >
                      <label htmlFor="start" style={{ marginRight: "20px" }}>
                        <div
                          style={{ textWrap: "nowrap", paddingLeft: "25px" }}
                        >
                          開始日期
                        </div>
                        <div
                          style={{ fontSize: "0.7rem", paddingLeft: "25px" }}
                        >
                          Start time
                        </div>
                      </label>
                      <input
                        type="date"
                        id="start"
                        name="trip-start"
                        value={itemStartDate}
                        // min={itemStartDate} // ✅ 限制最小值
                        // max={itemEndDate} // ✅ 限制最大值
                        min={formatDate_local(
                          new Date(itemYear, itemMonth - 1, 1)
                        )} // 當月第一天
                        max={formatDate_local(new Date(itemYear, itemMonth, 0))} // 當月最後一天
                        // 🔒 禁止手動輸入 ,避免輸入1日期預設為到該年第一天導致資料量max
                        onKeyDown={(e) => e.preventDefault()}   
                        style={{
                          width: "150px",
                          borderRadius: "4px",
                          padding: "5px 10px",
                          border: "1px solid #bdc3c7",
                          marginTop: "0px",
                        }}
                        onChange={handleYearMonthCalendarChange}                   
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: "0px",
                      }}
                    >
                      <label htmlFor="start" style={{ marginRight: "20px" }}>
                        <div style={{ textWrap: "nowrap" }}>結束日期</div>
                        <div style={{ fontSize: "0.7rem" }}>Start time</div>
                      </label>
                      <input
                        type="date"
                        id="start"
                        name="trip-end"
                        value={itemEndDate}
                        // min={itemStartDate} // ✅ 限制最小值
                        // max={itemEndDate} // ✅ 限制最大值
                        min={formatDate_local(
                          new Date(itemYear, itemMonth - 1, 1)
                        )} // 當月第一天
                        max={formatDate_local(new Date(itemYear, itemMonth, 0))} // 當月最後一天
                        // 🔒 禁止手動輸入 ,避免輸入1日期預設為到該年第一天導致資料量max
                        onKeyDown={(e) => e.preventDefault()}   
                        style={{
                          width: "150px",
                          borderRadius: "4px",
                          padding: "5px",
                          border: "1px solid #bdc3c7",
                        }}
                        onChange={handleYearMonthCalendarChange}
                      />
                    </div>
                  </div>
                  <label style={{ marginLeft: "3px" , minWidth:"260px" }}>
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
                  {/* 電容查詢區塊 */}
                  {captrigger && (
                       <div
                          style={{
                            display: "flex",
                            flexDirection: "row",
                            marginLeft: "auto",
                            alignContent: "center",
                            justifyContent: "center",
                            
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "row",
                              alignItems: "center",
                              marginRight: "1px",
                            }}
                          >
                            <label htmlFor="start" style={{ marginRight: "20px" }}>
                              <div style={{ textWrap: "nowrap", paddingLeft: "25px" }}>
                                電容量下限:
                              </div>
                              <div style={{ fontSize: "0.7rem", paddingLeft: "25px" }}>
                                Cap LimitLower
                              </div>
                            </label>
                            <input
                              type="number"
                              step="0.01"                        
                              name="minCap_low"
                              value={capacityvalue.minCap_low}
                              style={{
                                width: "120px",
                                borderRadius: "4px",
                                padding: "5px 10px",
                                border: "1px solid #bdc3c7",
                                marginTop: "0px",
                              }}
                              onChange={handleChange}             
                            />
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexDirection: "row",
                              alignItems: "center",
                              marginTop: "0px",
                            }}
                          >
                            <label htmlFor="start" style={{ marginRight: "20px" }}>
                              <div style={{ textWrap: "nowrap", paddingLeft: "25px" }}>
                                電容量上限:
                              </div>
                              <div style={{ fontSize: "0.7rem", paddingLeft: "25px" }}>
                                Cap LimitUpper
                              </div>
                            </label>
                            <input
                              type="number"
                              step="0.01"                        
                              name="maxCap_up"
                              value={capacityvalue.maxCap_up}
                              style={{
                                width: "120px",
                                borderRadius: "4px",
                                padding: "5px 10px",
                                border: "1px solid #bdc3c7",
                                marginTop: "0px",
                              }}
                              onChange={handleChange}                   
                            />
                          </div>
                           <div
                            style={{
                              fontSize: "1rem",
                              display: "flex",
                              padding: "5px 110px",
                              justifyContent: "space-between",
                              flexWrap: "wrap",    
                              alignItems: "center",
                            }}
                        >        
                         <div className="titlerange"> 
                            <button
                              className="excel-convert-btn"
                              onClick={() =>
                                exportDetec_Cap_ToExcel(
                                  PFCCData_echart_draw                                 
                                )
                              }
                            >
                              轉換電容數據|Excel
                            </button>
                          </div>
                        </div>
                      </div>                                                             
                   )}                 
                  {loading  && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                      <Skeleton height={110} style={{ marginBottom: 2 ,borderRadius: 8 }} baseColor="#e053b6" highlightColor="#f0f0f0" animation="wave"  />                
                      {/* <Skeleton height={50} baseColor="#2c8f96" highlightColor="#ebec95" animation="wave" /> */}
                      {/* 旋轉大區塊 Skeleton */}
                      <div style={{
                        width: 10,
                        height: 20,
                        borderRadius: 12,
                        overflow: "hidden",
                        animation: "spin 1.5s linear infinite",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative"
                      }}>
                        <Skeleton
                          height={130}
                          width={130}
                          baseColor="#10daa7"                           
                          style={{ borderRadius: 52, position: "absolute", top: 0, left: 10 }}
                        />
                      </div>
                      {/* 自訂旋轉動畫 */}
                      <style>
                        {`
                          @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                          }
                        `}
                      </style>
                    </div>
                   ) 
                  }                  
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
