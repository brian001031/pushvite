import "./index.scss";
import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import Form from "react-bootstrap/Form";
// eslint-disable-next-line no-unused-vars
import config from "../../../config";
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
import index from "../../Home";

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

const button_ca_oranode_mixing = ["+正極Canode", "-負極Anode"];
const seriesCath_An_node_name = ["N值", "黏度", "顆粒尺寸", "固體含量"];
const mixing_units = ["N value", "c.P.", "um", "%"];

const keyMap_Mixing = {
  N值: "Nvalue",
  黏度: "Viscosity",
  顆粒尺寸: "ParticalSize",
  固體含量: "SolidContent",
};

// eslint-disable-next-line no-unused-vars
let dynmaic_mixingSide_name = [];
let range_mxing_name = [];

function MixingParamDig() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 0-based index, so add 1
  // 使用 useState 儲存 checkbox 的選取狀態
  const [isChecked, setIsChecked] = useState(true);
  const [selectedButtonIndex, setSelectedButtonIndex] = useState(null);
  const [select_Side, setselect_Side] = useState("");
  const [isSelected, setSelected] = useState(true); // Define isSelected state
  // const [itemYear, setItemYear] = useState(currentYear);
  // const [itemMonth, setItemMonth] = useState(currentMonth);
  const [sortStartDate, setSortStartDate] = useState("");
  const [sortEndDate, setSortEndDate] = useState("");
  const [MixingData_collect, setMixingData_collect] = useState([]); // Define MixingData_collect state
  const [MixData_echart_draw, setMixing_Data_echart_draw] = useState([]); // Define MixingData_collect state
  const [mixing_echart_visualmap, setMixing_echart_visualmap] = useState([]); // 設置visualMap的最大值
  const [mixing_echart_min, setmixing_echart_min] = useState([]); // 設置visualMap的最小值
  const [mixing_echart_max, setmixing_echart_max] = useState([]); // 設置visualMap的最大值
  const [mixing_echart_avg, setmixing_echart_avg] = useState([]); // 設置visualMap的平均值
  const [adjustinterval, setadjustinterval] = useState(0);
  const [min_scale_value, setMin_scale_value] = useState(0);
  const [max_scale_value, setMax_scale_value] = useState(1000);
  const [isSingleSelect, setIsSingleSelect] = useState(true); // 單選模式
  const chartRef = useRef(null); // 创建 ref 来引用 DOM 元素 (指定图表容器)
  const visualMapArray = []; // 用於存放 visualMap 的數據
  const combinedData = []; // 用於存放合併後的數據
  const [MinDate, setMinDate] = useState("");
  const [MaxDate, setMaxDate] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0); //代表目前選擇的混漿分析range 索引index號碼
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
    setMixing_echart_visualmap([]); // 更新 visualMapArray 狀態
    setMixing_Data_echart_draw([]); // 更新 MixData_echart_draw 狀態
  };

  const Mixing_Unit = (serialname) => {
    const item = seriesCath_An_node_name.find((item) =>
      item.includes(serialname)
    );
    if (item) {
      const index = seriesCath_An_node_name.indexOf(item);
      return mixing_units[index];
    }
    return "";
  };

  const formatDate_local = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  function generateColorRange(index, avg, min, max) {
    // 根據 visualAvg 位置決定漸層，例如：
    const percentage = (avg - min) / (max - min);
    const clamped = Math.max(0, Math.min(1, percentage)); // 確保 0~1 範圍
    if (percentage < 0.3) {
      return ["#D3E4CD", "#A9D18E"]; // 偏低 - 淺綠
    } else if (percentage > 0.7) {
      return ["#FFF5BA", "#FF6F61"]; // 偏高 - 黃到紅
    } else {
      return ["#E0E0E0", "#87CEFA"]; // 中間 - 灰到藍
    }
  }

  useEffect(() => {
    const initializeData = async () => {
      //預設查詢(起始日期/結束日期)
      const currentDate = new Date();
      const startOfMonth = new Date(2025, 0, 1);

      //當前月份最後一日
      const lastDay = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0
      );

      const min = formatDate_local(startOfMonth);
      const max = formatDate_local(lastDay);

      setMinDate(min);
      setMaxDate(max);

      // 預設搜尋時間可設為當月第一天 ~ 最後一天
      const firstDayOfThisMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      );

      setSortStartDate(formatDate_local(firstDayOfThisMonth));
      // setSortStartDate(min);
      setSortEndDate(max);

      //取得目前工號(最新的一筆)
      // 初始化時不需要搜尋條件，所以直接傳空值
      try {
      } catch (error) {
        console.error("Error fetching initial data:", error);
      }
    };

    initializeData();
  }, []);

  // 處理按鈕點擊事件
  const handleButtonClick = (index) => {
    //console.log("目前選擇為->:" + index);
    setSelectedButtonIndex(index); // 更新選取的按鈕索引
    switch_station(index + 1);
  };

  const switch_station = (select_num) => {
    switch (select_num) {
      case 1:
      case 2:
        setselect_Side(
          button_ca_oranode_mixing[select_num - 1].toString() + "-Mixer混漿站"
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

  const generate_Mixing_Option = ({
    select_Side,
    visualMapArray,
    allSeries,
    xAxisType,
    xAxisName,
    adjustinterval,
  }) => ({
    title: {
      text: `(${seriesCath_An_node_name[selectedIndex - 1]})${select_Side.slice(
        0,
        3
      )}混漿數據散佈圖`,
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
        const mix_lotno_value = params.value;
        console.log("params.value = " + JSON.stringify(params.value, null, 2));
        const name = params.name === "警戒線" ? "容許範圍limit" : params.name;
        console.log("總接收為 = " + JSON.stringify(params, null, 2));
        const mixing_units = Mixing_Unit(params.seriesName);
        return `          
         ${name} : ${mix_lotno_value} (${mixing_units}) <br/>           
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
        name: "mixing parameter",
        interval: adjustinterval,
        boundaryGap: [0.1, 0.1], // 上下保留 10% 空間
        min: isSingleSelect ? min_scale_value : min_scale_value * 2,
        max: isSingleSelect ? max_scale_value : "dataMax",
        axisLabel: {
          formatter: "{value}",
        },
      },
    ],
    series: allSeries,
    visualMap: visualMapArray,
  });

  const Provide_Info_Mixing_Diagram = async ({
    allSeries,
    visualMapArray,
    adjustinterval,
  }) => {
    let myChart;
    //let chartOption = null; // 初始化 chartOption 变量

    console.log("serialdata 接收數據!: " + JSON.stringify(allSeries, null, 2));
    console.log(
      "visualMap 接收數據!: " + JSON.stringify(visualMapArray, null, 2)
    );

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

      const xAxisType_item =
        select_Side.includes("-負極Anode") ||
        select_Side.includes("+正極Canode")
          ? "category"
          : "category";
      const xAxisType_name =
        select_Side.includes("-負極Anode") ||
        select_Side.includes("+正極Canode")
          ? "用料配號"
          : "平均電壓";

      // console.log("adjustinterval調整適合的interval->" + adjustinterval);

      const chartOption = generate_Mixing_Option({
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
    const select_side_name = select_Side.slice(0, 3); //這邊尋找前3字元

    console.log("選擇站別為:" + select_side_name);
    console.log("選擇開始日期為:" + sortStartDate);
    console.log("選擇最後日期為:" + sortEndDate);

    // //呼叫自定義事件處理函數;
    // console.log("Checkbox is now:", isChecked === true ? "選取全部" : "沒選取");

    const fetchAnalyze_MixingData = async () => {
      try {
        //這邊向後端索引資料
        const response = await axios.get(
          //"http://localhost:3009/mixprocess/getMixProductParam",
          `${config.apiBaseUrl}/mixprocess/getMixProductParam`,
          {
            params: {
              select_side_name: select_side_name,
              sortStartDate: sortStartDate,
              sortEndDate: sortEndDate,
            },
          }
        );

        const responseData = response.data; // 取出 overallData

        // console.log(
        //   "全部接收回來數據流資料 = " + JSON.stringify(responseData, null, 2)
        // );

        const { AllContent, max_list, min_list, avg_list } = response.data;

        // const transformedData = AllContent.map((item) => {
        //   return {
        //     modelId: item.modelId,
        //     value: item.value,
        //   };
        // });

        // console.log(
        //   "AllContent全部數據 = " +
        //     JSON.stringify(responseData.AllContent, null, 2)
        // );

        console.log("max_list = " + responseData.max_list);
        console.log("min_list = " + responseData.min_list);
        // console.log("avg_list = " + responseData.avg_list);
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

        setMixingData_collect(responseData.AllContent); // 更新 MixingData_collect 狀態
        setmixing_echart_min(responseData.min_list); // 存入 min_list 狀態
        setmixing_echart_max(responseData.max_list); // 存入 max_list 狀態
        setmixing_echart_avg(responseData.avg_list); // 存入 avg_list 狀態
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchAnalyze_MixingData();
  }, [select_Side, sortStartDate, sortEndDate]); // 依賴項目為 isChecked 和 select_Side

  useEffect(() => {
    if (MixingData_collect) {
      let allValues = [];
      let interval_default = 100000; // 預設刻度
      let firstDecimal = 0; //預設小數點第一位
      let visualAvg = 0,
        visualMin,
        visualMax;
      let find_maxValue = 0,
        minLimit = 0,
        maxLimit = 0;
      let lotItemMap = new Map();

      let isOnlyRange = false,
        isOnlySelected = false;

      // 动态设置 markPoint
      let maxPointData, threshold, isMaxExceeded;

      //清除既有畫面數據,重新import data
      clearScatter_digramItems();
      // console.log("select_Side站別為 = " + select_Side);
      console.log(
        "MixingData_collect (stringified):",
        JSON.stringify(MixingData_collect, null, 2)
      );

      // const PFCC1_ResultArray = MixingData_collect.map((item) => {
      //   return Object.values(item); // 把每筆物件的所有值轉為陣列
      // });

      // console.log("轉換後的陣列：", PFCC1_ResultArray);

      // const entries = Object.entries(MixingData_collect);
      // entries.forEach(([key, value]) => {
      //   console.log(`鍵名: ${key}, 值: ${value}`);
      // });

      //console.log("切換range範圍選擇項目號:" + selectedIndex);

      mixing_echart_min.forEach((item) => {
        return Object.values;
      });

      console.log("min_list = " + mixing_echart_min);

      mixing_echart_max.forEach((item) => {
        return Object.values;
      });

      console.log("max_list = " + mixing_echart_max);

      mixing_echart_avg.forEach((item) => {
        return Object.values;
      });
      console.log("avg_list = " + mixing_echart_avg);

      // 根據站別決定要取的 key 名稱(目前正負極共用同參數名稱)
      dynmaic_mixingSide_name = seriesCath_An_node_name;

      range_mxing_name.length = 0;
      range_mxing_name.push("全參數項目");
      seriesCath_An_node_name.forEach((item) => {
        range_mxing_name.push(item);
      });

      // console.log("dynmaic_mixingSide_name = " + dynmaic_mixingSide_name);

      visualMapArray.length = 0; // 清空 visualMapArray

      let diff_warin_value, midValue;

      dynmaic_mixingSide_name.forEach((key) => {
        const index = dynmaic_mixingSide_name.indexOf(key);

        isOnlySelected = selectedIndex === index + 1;

        //這邊針對全選或只單獨選其一電壓keyname範圍做存值
        if (selectedIndex === 0 || isOnlySelected) {
          let div_radio_check_ng = false;

          //這邊因N值數據級距過小,這邊需要另外計算,以下不考慮N值
          visualMin = index !== -1 ? mixing_echart_min[index] : 0;
          visualMax =
            index !== -1
              ? mixing_echart_max[index]
              : index <= 1
              ? 6000
              : 100000;

          visualAvg =
            index !== -1 ? mixing_echart_avg[index] : index === 0 ? 500 : 1000;

          visualAvg = Number(visualAvg);

          //若非數字型態
          if (isNaN(visualAvg) || visualAvg === 0) {
            visualAvg = Number(1000);
          }

          // if (index > 2) {
          //   // 取前三個範圍累加
          //   visualMin =
          //     mixing_echart_min[0] +
          //     mixing_echart_min[1] +
          //     mixing_echart_min[2];
          //   visualMax =
          //     mixing_echart_max[0] +
          //     mixing_echart_max[1] +
          //     mixing_echart_max[2];
          // }

          midValue = (visualMin + visualMax) / 2;

          const divradio_value = midValue / visualMax;

          //當平均值/最大值 比例小於7成,這邊依序調整
          console.log("divradio_value 平均比值為:" + divradio_value);

          //N值取小數點後第3位為準(四捨五入),並後續判斷是否為0.70,達到標準
          if (isOnlySelected && index >= 0) {
            // console.log("目前選擇為單選模式 index =" + selectedIndex);
            setIsSingleSelect(isOnlySelected); //判定單選或非單選模式
            firstDecimal = Number(divradio_value.toFixed(3));
          } else {
            setIsSingleSelect(false); //判定單選或非單選模式
          }

          // eslint-disable-next-line no-undef
          if (Number(firstDecimal.toFixed(3)) < 0.7) {
            console.log("小於平均比值0.7 ,實際為:" + firstDecimal);
            div_radio_check_ng = true;
          }

          const mixing_key = keyMap_Mixing[key] || key;

          const seriesData = MixingData_collect.map(
            (item) => item[mixing_key] // 取出每筆資料中對應 key 的值
          ).filter((val) => typeof val === "number" && !isNaN(val));

          MixingData_collect.forEach((item) => {
            lotItemMap.set(item.LotNo, item);
          });

          // console.log("目前選擇為 index = " + index);

          // 找出最大值
          find_maxValue = Math.max(...seriesData);

          // 設定刻度基準值為最大值的 10 倍
          threshold = visualAvg * 10;
          // 判断 Max 是否超过 Avg 的 10 倍
          isMaxExceeded = find_maxValue > threshold;

          //目前微調以下Max Min scale 依據現有混漿生產數據視覺平整度
          maxLimit = isMaxExceeded ? visualAvg * 5 : visualMax * 2.5; // 设置最大限制
          minLimit = visualAvg * -3; // 设置最小限制，假设为平均值的30%

          // 计算小于 midValue 的数据比例
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

          if (
            select_Side.includes("-負極Anode") ||
            select_Side.includes("+正極Canode")
          ) {
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
            // type: "continuous",
            min: `${visualMin}`,
            max: `${visualMax}`,
            seriesIndex: index,
            orient: "vertical",
            // right: 10, // 避免多個 visualMap 疊在一起
            right:
              index === 0
                ? "10%"
                : index === 2
                ? "40%"
                : index === 3
                ? "70%"
                : index === 4
                ? "90%"
                : "10%",
            top: "middle",
            dimension: 1, // y 軸的維度
            text: ["HIGH", "LOW"],
            calculable: true,

            // inRange: {
            //   // color:
            //   // index === 0
            //   //   ? ["#f2c31a", "#24b7f2"]
            //   //   : index === 2
            //   //   ? ["#f6f6f6", "#a51a1a"]
            //   //   : index === 3
            //   //   ? ["#FF9224", "#5CADAD"]
            //   //   : index === 4
            //   //   ? ["#cad7ceff", "#0000FF"]
            //   //   : ["#f6f6f6", "#a51a1a"],

            // },
            // inRange: generateColorRange(index, visualAvg, visualMin, visualMax),
            outOfRange: {
              color: ["#ccc", "#000"],
            },

            type: "piecewise",
            pieces: [
              { gt: visualMin, lte: visualAvg, color: "#CCCCCC" },
              { gt: visualAvg, lte: visualMax, color: "#e4a547ff" },
            ],
          });
        }
      });

      const allSeries = dynmaic_mixingSide_name
        .map((key, index) => {
          // console.log("正在執行->" + index + " 範圍:" + key);
          const mixing_key = keyMap_Mixing[key] || key;
          isOnlyRange = selectedIndex === index + 1;

          //這邊針對全選或只單獨選其一電壓keyname範圍做存值
          if (selectedIndex === 0 || isOnlyRange) {
            const data = MixingData_collect.map((item) => {
              const value = item[mixing_key];

              if (typeof value === "number" && !isNaN(value)) {
                allValues.push(value);
              }

              return [
                item.LotNo, // 0：混漿化學料編號
                value !== undefined ? value : 0, // 若值為 undefined，則設為 0 , 1：y 軸數值
                // // 2: 各項參數值
                // select_Side.includes("-負極Anode")
                //   ? selectedIndex === 0
                //     ? [
                //         item.Nvalue,
                //         item.Viscosity,
                //         item.ParticalSize,
                //         item.SolidContent,
                //       ]
                //     : selectedIndex === 1
                //     ? item.Nvalue
                //     : selectedIndex === 2
                //     ? item.Viscosity
                //     : selectedIndex === 3
                //     ? item.ParticalSize
                //     : selectedIndex === 4
                //     ? item.SolidContent
                //     : null
                //   : 0,
                item.WorkDate, // 2：時間
              ];
            });

            // 根據站別切換 encode 設定
            const encodeSetting =
              select_Side.includes("-負極Anode") ||
              select_Side.includes("+正極Canode")
                ? { x: 0, y: 1 } // -負極Anode: x = lotNumber, y = 參數值
                : { x: 0, y: 1 }; // +正極Canode: x = lotNumber, y = 參數值

            const baseSeries = {
              name: key,
              type: "scatter",
              symbolSize: 16,
              data,
              encode: encodeSetting,
              itemStyle: {
                color:
                  selectedIndex === 1
                    ? "#2a6fbeff"
                    : selectedIndex === 3
                    ? "#F2BE45"
                    : selectedIndex === 4
                    ? "#66FFE6"
                    : selectedIndex === 5
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
                  if (!params || !params.data || !Array.isArray(params.data)) {
                    return "⚠ 資料格式錯誤";
                  }

                  const [LotNo, selectedValue, WorkDate] = params.data;
                  const fullItem = lotItemMap.get(LotNo);

                  // 如果是單選，只顯示該 index 的名稱和值
                  const singleItemDisplay = `<b>${
                    seriesCath_An_node_name[selectedIndex - 1]
                  }:</b> ${selectedValue} (${
                    mixing_units[selectedIndex - 1]
                  }) `;

                  const Total_Lot_Mixing_List = `                                           
                                                <b>${seriesCath_An_node_name[0]}:</b> ${fullItem.Nvalue} (${mixing_units[0]})<br/>
                                                <b>${seriesCath_An_node_name[1]}:</b> ${fullItem.Viscosity} (${mixing_units[1]})<br/>
                                                <b>${seriesCath_An_node_name[2]}:</b> ${fullItem.ParticalSize} (${mixing_units[2]})<br/>
                                                <b>${seriesCath_An_node_name[3]}:</b> ${fullItem.SolidContent} (${mixing_units[3]})<br/>                                              
                                              `;

                  return `
                 <b>範圍:</b>${
                   selectedIndex > 0 ? key : "全部"
                 }<br/>               
                <b>LotNo:</b> ${LotNo}<br/>                                                                                   
                ${
                  selectedIndex > 0 //單選模式
                    ? singleItemDisplay
                    : Total_Lot_Mixing_List // 全部模式
                }<br/>    
                <b>日期:</b> ${WorkDate}<br/>`;
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
                      ? "最低規範線"
                      : param.name,
                  position: "end",
                },
                data: [
                  {
                    // type: "average",
                    yAxis: visualAvg,
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
                      color: "#e493a1ff",
                      width: 2,
                      type: "dashed",
                    },
                  },
                ],
              };

              if (isMaxExceeded) {
                // 替换 Max 为 Max / Avg 的商
                const maxOverAvg = find_maxValue / visualAvg;
                maxPointData = {
                  name: "Max/Avg",
                  value: maxOverAvg,
                  yAxis: maxOverAvg,
                  symbol: "pin",
                  symbolSize: 40,
                  label: {
                    show: true,
                    formatter: `Max/Avg比值\n${maxOverAvg.toFixed(2)}`,
                  },
                };
              } else {
                // 否则使用原始的 Max 值
                maxPointData = {
                  type: "max",
                  name: "Max",
                };
              }

              baseSeries.markPoint = {
                data: [
                  maxPointData,
                  { type: "min", name: "Min" },
                  {
                    name: "平均值",
                    value: visualAvg,
                    yAxis: visualAvg,
                    symbol: "pin",
                    symbolSize: 40,
                    label: {
                      show: true,
                      formatter:
                        "平均值\n" +
                        (typeof visualAvg === "number" && !isNaN(visualAvg)
                          ? visualAvg.toFixed(2)
                          : "N/A"),
                    },
                  },
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
                      name: "參數值範圍",
                      xAxis: visualMin, // 左邊界
                      yAxis: visualMin, // 底邊界
                    },
                    {
                      xAxis: visualMax, // 右邊界
                      yAxis: visualMax, // 上邊界
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
          // const maxValue = Math.max(...allValues);
          // const minValue = Math.min(...allValues);

          setMin_scale_value(minLimit); //存入min_scale_value
          setMax_scale_value(maxLimit); //存入max_scale_value

          const range = maxLimit - minLimit;
          // const roughInterval = Math.ceil(range / 10);
          // // 防止 0 除錯 or interval = 0
          // interval_default =
          //   roughInterval > 0 ? Math.ceil(roughInterval / 10) * 10 : 100;

          // 計算最大刻度
          // interval_default =
          //   maxValue > visualAvg * 100 ? visualAvg * 10 : maxValue;

          // interval_default = isMaxExceeded ? threshold / 0.001 : visualMax;

          const roughInterval = Math.ceil(range / 20); // 初步计算一个大致的区间

          console.log("range 範圍值 = " + range);
          console.log("roughInterval 初步计算的区间 = " + roughInterval);

          interval_default =
            roughInterval > 0
              ? isOnlySelected && (selectedIndex === 2 || selectedIndex === 4)
                ? Math.ceil(roughInterval / 50000) * 100
                : isOnlySelected && selectedIndex === 1
                ? Math.ceil(roughInterval / 10) * 100
                : isOnlySelected && selectedIndex === 3
                ? Math.ceil(roughInterval / 0.5) * 10
                : Math.ceil(roughInterval / 500) * 900
              : 1000;
        }
      }

      // console.log("interval 調整為 = " + interval_default);
      // console.log("visualMapArray 型態:", Array.isArray(visualMapArray));

      //將重整的data存入setMixing_Data_echart_draw,後續帶入e-chart呈現圖像
      setadjustinterval(interval_default);

      // 更新 visualMapArray 狀態
      updateIfChanged(
        setMixing_echart_visualmap,
        mixing_echart_visualmap,
        visualMapArray
      );

      // 更新 MixData_echart_draw 狀態
      updateIfChanged(
        setMixing_Data_echart_draw,
        MixData_echart_draw,
        allSeries
      );

      // MixingData_collect.forEach((dataItem, index) => {
      //   // // 依照對應 key 列印鍵名和鍵值
      //   dynmaic_mixingSide_name.forEach((key) => {
      //     const value = dataItem[key];
      //     if (value !== undefined) {
      //       console.log(`站別: ${select_Side}，鍵名: ${key}，鍵值: ${value}`);
      //     } else {
      //       console.warn(`⚠️ 鍵名 ${key} 不存在於 MixingData_collect 中`);
      //     }
      //   });
      // });
    } else {
      console.log("MixingData_collect is empty or undefined.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    MixingData_collect,
    select_Side,
    mixing_echart_min,
    mixing_echart_max,
    mixing_echart_avg,
    selectedIndex,
  ]); // 依賴項目為 MixingData_collect 和 select_Side

  useEffect(() => {
    if (MixData_echart_draw.length > 0) {
      // console.log(
      //   "分析數據庫資料數量: " +
      //     MixData_echart_draw.length +
      //     " MixData_echart_draw 帶入chart分析數據庫資料:" +
      //     JSON.stringify(MixData_echart_draw, null, 2)
      // );
      // console.log(
      //   "mixing_echart_visualmap 級距(min max):" +
      //     JSON.stringify(mixing_echart_visualmap, null, 2)
      // );

      Provide_Info_Mixing_Diagram({
        allSeries: MixData_echart_draw,
        visualMapArray: mixing_echart_visualmap,
        adjustinterval: adjustinterval,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    MixData_echart_draw,
    mixing_echart_visualmap,
    select_Side,
    adjustinterval,
  ]);

  return (
    <div className="scatter_mixing_digram">
      <div>
        <h2
          style={{
            textAlign: "center",
            verticalAlign: "middle",
            backgroundColor: "#F5DEB3",
            color: "#000",
            padding: "10px",
            fontSize: "45px",
            marginbottom: "38px",
          }}
        >
          正負極混漿(N值/黏度/顆粒尺寸/固體含量)分析數據
        </h2>
      </div>
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
        {button_ca_oranode_mixing.map((label, index) => (
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
                border: "3px solid #0a0202ff",
                backgroundColor:
                  selectedButtonIndex === 0 ? "#a9d0b1ff" : "#eea1a1ff",
                bordertop: "none",
              }}
            >
              {/* 電化數據分析切換: {switch_station(selectedButtonIndex + 1)} */}
              混漿參數檢視切換: {select_Side}
            </h2>
            <br />{" "}
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <electric_group
                button_ca_oranode_mixing={button_ca_oranode_mixing}
                isSelected={isSelected}
                // setSelected={setSelected}
              />
            </div>
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
                  marginRight: "30px",
                }}
              >
                <label htmlFor="start" style={{ marginRight: "20px" }}>
                  <div style={{ textWrap: "nowrap" }}>開始日期</div>
                  <div style={{ fontSize: "0.7rem" }}>Start time</div>
                </label>
                <input
                  type="date"
                  id="start"
                  name="trip-start"
                  value={sortStartDate}
                  style={{
                    width: "200px",
                    borderRadius: "4px",
                    padding: "5px",
                    border: "1px solid #bdc3c7",
                    marginTop: "0px",
                  }}
                  onChange={(e) => setSortStartDate(e.target.value)}
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
                  name="trip-start"
                  value={sortEndDate}
                  style={{
                    width: "200px",
                    borderRadius: "4px",
                    padding: "5px",
                    border: "1px solid #bdc3c7",
                  }}
                  onChange={(e) => setSortEndDate(e.target.value)}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  marginRight: "10px",
                }}
              >
                <label style={{ marginLeft: "10px" }}>
                  檢閱參數：
                  <select
                    name="option_mixing_param"
                    value={selectedIndex}
                    onChange={(e) => setSelectedIndex(parseInt(e.target.value))}
                  >
                    {range_mxing_name.map((name, index) => (
                      <option key={index} value={index}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div
              // id="chartref"
              ref={chartRef}
              style={{ width: "350%", height: "630px", marginTop: "20px" }}
            ></div>
          </div>
        ) : (
          <h2>待選擇顯示</h2> // 如果沒有選擇任何按鈕，顯示提示
        )}
      </div>
    </div>
  );
}

export default MixingParamDig;
