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

const button_OP_Mode = ["作業模式CE_2", "作業模式CE_3"];
const batteryData = {
  CE_2: {
    thickness: [
      "電池厚度1~3_Mode_2",
      "電池厚度4~6_Mode_2",
      "電池厚度7~9_Mode_2",
    ],
    sealThickness: [
      "電池封口厚度1_Mode_2",
      "電池封口厚度2_Mode_2",
      "電池封口厚度3_Mode_2",
    ],
    IR_OCV: ["電池IR_Mode_2", "電池OCV_Mode_2"],
    edgeVoltage: ["電池臨界邊緣電壓1_Mode_2", "電池臨界邊緣電壓2_Mode_2"],
  },
  CE_3: {
    thickness: [
      "電池厚度1~3_Mode_3",
      "電池厚度4~6_Mode_3",
      "電池厚度7~9_Mode_3",
    ],
    sealThickness: [
      "電池封口厚度1_Mode_3",
      "電池封口厚度2_Mode_3",
      "電池封口厚度3_Mode_3",
    ],
    IR_OCV: ["電池IR_Mode_3", "電池OCV_Mode_3"],
    edgeVoltage: ["電池臨界邊緣電壓1_Mode_3", "電池臨界邊緣電壓2_Mode_3"],
  },
};

const seriesCC1_name = ["V2_0VAh", "V3_6VAh", "V3_5VAhcom"];
// eslint-disable-next-line no-unused-vars
let dynmaic_ELECISPEC_name = [];
let range_thickness_name = [];
let range_seal_thickness_name = [];
let range_IR_OCV_EdgeVoltage_name = [];

const ElectricalInspecDig = () => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 0-based index, so add 1
  // 使用 useState 儲存 checkbox 的選取狀態
  const [isChecked, setIsChecked] = useState(true);
  const [selectedButtonIndex, setSelectedButtonIndex] = useState(null);
  const [select_Side, setselect_Side] = useState("");
  const [isSelected, setSelected] = useState(null); // Define isSelected state
  const [itemYear, setItemYear] = useState(currentYear);
  const [itemMonth, setItemMonth] = useState(currentMonth);
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const [selectedElectricIndex, setSelectedElectricIndex] = useState(null);
  const [elec_ispecData_collect, setElecIspecData_collect] = useState([]); // Define elec_ispecData_collect state
  const [PFCCData_echart_draw, setPFCCData_echart_draw] = useState([]); // Define elec_ispecData_collect state
  const [pfcc_echart_visualmap, setpfcc_echart_visualmap] = useState([]); // 設置visualMap的最大值
  const [pfcc_echart_min, setpfcc_echart_min] = useState([]); // 設置visualMap的最小值
  const [pfcc_echart_max, setpfcc_echart_max] = useState([]); // 設置visualMap的最大值
  const [adjustinterval, setadjustinterval] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hoveredDropdownItems, setHoveredDropdownItems] = useState([]);
  const [selectedDropdownItem, setSelectedDropdownItem] = useState(null);
  const [view_selectside, setView_Selectside] = useState(""); // 用於存放目前選擇的站別
  const tabRefs = useRef([null]);
  const [dropdownLeft, setDropdownLeft] = useState(0);
  const [dropdownTop, setDropdownTop] = useState(0);
  const chartRef = useRef(null); // 创建 ref 来引用 DOM 元素 (指定图表容器)
  const visualMapArray = []; // 用於存放 visualMap 的數據
  const combinedData = []; // 用於存放合併後的數據
  const [selectedIndex, setSelectedIndex] = useState(0); //代表目前選擇的電壓分析range 索引index號碼
  const [dropdownItems, setDropdownItems] = useState([]); // 用於存放下拉選單的數據
  const [selectedItem, setSelectedItem] = useState(null); // 點選下拉的項目
  const record_yearlen = parseInt(currentYear) - 2024; // 2024年為起始年

  const years = Array.from(
    { length: record_yearlen + 1 },
    (_, i) => currentYear - i
  );
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const clearHover = () => {
    setHoveredIndex(null);
    setHoveredDropdownItems([]);
  };

  const handleMouseLeave = () => {
    setTimeout(() => setDropdownVisible(false), 150);
  };

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

  // 處理按鈕點擊事件 ,當使用者點擊時，更新外部選取狀態（單向）
  const handleButtonClick = (index) => {
    //console.log("目前選擇為->:" + index);

    const modeString = button_OP_Mode[index - 2];

    // console.log("index 目前選擇為->:" + index, modeString);

    if (!modeString || !modeString.includes("作業模式")) {
      console.log("❌ 無效的作業模式資料：", modeString);
      return;
    }

    const ceMode = modeString.split("作業模式")[1]?.trim();
    // console.log("✅ 選擇站別為:", ceMode);

    // console.log("selectedButtonIndex 最終為=" + selectedButtonIndex);

    // 只有在選擇的按鈕索引變更時才更新狀態
    if (index !== selectedButtonIndex) {
      setSelectedButtonIndex(index); // 更新選取的按鈕索引

      // const switch_station = (select_num) => {
      //   const modeString = button_OP_Mode[select_num];
      //   const ceMode = modeString.split("作業模式")[1]?.trim();
      //   const battery = batteryData[ceMode];

      //   if (!battery) {
      //     console.error("❌ 找不到站別數據：", ceMode);
      //     return;
      //   }

      //   console.log("✅ 選擇站別為:", ceMode);
      //   setselect_Side(ceMode);

      //   const items = [
      //     ...(battery.thickness || []),
      //     ...(battery.sealThickness || []),
      //     ...(battery.IR_OCV || []),
      //     ...(battery.edgeVoltage || []),
      //   ];

      //   setDropdownItems(items);
      // };

      // switch_station(index); // ✅ 呼叫邏輯
    }
  };

  useEffect(() => {
    tabRefs.current = Array(button_OP_Mode.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [button_OP_Mode]);

  const handleTabHover = (index) => {
    const modeString = button_OP_Mode[index];
    const ceMode = modeString.split("作業模式")[1]?.trim();
    const battery = batteryData[ceMode];

    console.log("目前選擇為->:" + index);

    if (battery) {
      const items = [
        ...(battery.thickness || []),
        ...(battery.sealThickness || []),
        ...(battery.IR_OCV || []),
        ...(battery.edgeVoltage || []),
      ];

      setDropdownItems(items);
      setHoveredIndex(index);
      setDropdownVisible(true);
    }

    const tabRef = tabRefs.current[index];
    if (tabRef) {
      const rect = tabRef.getBoundingClientRect();
      const dropdownWidth = 200; // 下拉選單的寬度
      const dropdownHeight = 100; // 下拉選單的高度
      const left =
        rect.left + window.scrollX - dropdownWidth / 2 + rect.width / 2;
      const top = rect.bottom + window.scrollY;

      setDropdownLeft(left);
      setDropdownTop(top);
    }
  };

  const switch_station = (select_num) => {
    const index = select_num;

    if (index < 0 || index >= button_OP_Mode.length) {
      console.error("❌ 無效的 select_num:", select_num);
      return;
    }

    const modeString = button_OP_Mode[index];
    if (!modeString.includes("作業模式")) {
      console.error("❌ 模式字串缺少 '作業模式':", modeString);
      return;
    }

    const ceMode = modeString.split("作業模式")[1]?.trim();
    if (!ceMode) {
      console.error("❌ 無法從模式字串取得 ceMode:", modeString);
      return;
    }

    const battery = batteryData[ceMode];
    if (!battery) {
      console.error("❌ batteryData 中無 ceMode:", ceMode);
      return;
    }

    console.log("✅ 選擇站別為:", ceMode);
    setselect_Side(ceMode);

    const items = [
      ...(battery.thickness || []),
      ...(battery.sealThickness || []),
      ...(battery.IR_OCV || []),
      ...(battery.edgeVoltage || []),
    ];
    setDropdownItems(items);
  };

  //checkbox 狀態實際變更時，setIsChecked 才會被調用，避免不必要的重渲染
  const handleCheckboxChange = (event) => {
    // 更新 checkbox 狀態
    // setIsChecked(event.target.checked);

    const newCheckedState = event.target.checked;

    // 只有在新狀態和當前狀態不同時才更新
    if (newCheckedState !== isChecked) {
      setIsChecked(newCheckedState);
    }

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
      text: `${select_Side} 電檢數據散佈圖`,
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
      if (echarts.getInstanceByDom(chartRef.current)) {
        echarts.dispose(chartRef.current);
      }

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

      const xAxisType_item = select_Side === "CE_2" ? "category" : "category";
      const xAxisType_name = select_Side === "CE_2" ? "電芯號" : "平均電壓";

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
    console.log("✅ 選擇站別為::" + view_selectside);
    console.log("選擇站年為:" + itemYear);
    console.log("選擇站月為:" + itemMonth);

    // //呼叫自定義事件處理函數;
    // console.log("Checkbox is now:", isChecked === true ? "選取全部" : "沒選取");

    const fetch_Electricial_IspecData = async () => {
      try {
        //這邊向後端索引資料(判斷是否有勾選全部年月數據 true / 只針對某年月 false)
        const response = await axios.get(
          "http://localhost:3009/electricinspec/get_thickweight_irocv",
          // `${config.apiBaseUrl}/electricinspec/get_thickweight_irocv`,
          {
            params: {
              view_selectside: view_selectside,
              itemYear: itemYear,
              itemMonth: itemMonth,
            },
          }
        );
        const responseData = response.data; // 取出 overallData
        console.log(
          "electric_tricalinspec = " + JSON.stringify(responseData, null, 2)
        );
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
        // setElecIspecData_collect(responseData.overall); // 更新 elec_ispecData_collect 狀態
        // setpfcc_echart_min(responseData.min_list); // 存入 min_list 狀態
        // setpfcc_echart_max(responseData.max_list); // 存入 max_list 狀態
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetch_Electricial_IspecData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view_selectside, itemYear, itemMonth, selectedButtonIndex]); // 依賴項目為 isChecked 和 select_Side

  useEffect(() => {
    if (elec_ispecData_collect) {
      let allValues = [];
      let interval_default = 2000; // 預設刻度

      //清除既有畫面數據,重新import data
      clearScatter_digramItems();
      // console.log("select_Side站別為 = " + select_Side);
      // console.log(
      //   "elec_ispecData_collect (stringified):",
      //   JSON.stringify(elec_ispecData_collect, null, 2)
      // );

      // const PFCC1_ResultArray = elec_ispecData_collect.map((item) => {
      //   return Object.values(item); // 把每筆物件的所有值轉為陣列
      // });

      // console.log("轉換後的陣列：", PFCC1_ResultArray);

      // const entries = Object.entries(elec_ispecData_collect);
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

      if (!batteryData[select_Side]) {
        console.error("❌ 無法取得 batteryData 對應站別:", select_Side);
        return;
      }

      // 根據站別決定要取的 key 名稱
      dynmaic_ELECISPEC_name = batteryData[select_Side].thickness.concat(
        batteryData[select_Side].sealThickness,
        batteryData[select_Side].IR_OCV,
        batteryData[select_Side].edgeVoltage
      );

      range_thickness_name.length = 0;
      range_seal_thickness_name.length = 0;
      range_IR_OCV_EdgeVoltage_name.length = 0;

      // console.log("dynmaic_ELECISPEC_name = " + dynmaic_ELECISPEC_name);

      visualMapArray.length = 0; // 清空 visualMapArray

      let diff_warin_value, midValue;

      dynmaic_ELECISPEC_name.forEach((key) => {
        const index = dynmaic_ELECISPEC_name.indexOf(key);

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

          const seriesData = elec_ispecData_collect
            .map((item) => item[key])
            .filter((val) => typeof val === "number" && !isNaN(val));

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

      const allSeries = dynmaic_ELECISPEC_name
        .map((key, index) => {
          // console.log("正在執行->" + index + " 範圍:" + key);
          const isOnlyRange = selectedIndex === index + 1;

          //這邊針對全選或只單獨選其一電壓keyname範圍做存值
          if (selectedIndex === 0 || isOnlyRange) {
            const data = elec_ispecData_collect.map((item) => {
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
          //console.log("目前選擇數據量為:" + allValues.length);
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

      // elec_ispecData_collect.forEach((dataItem, index) => {
      //   // // 依照對應 key 列印鍵名和鍵值
      //   dynmaic_ELECISPEC_name.forEach((key) => {
      //     const value = dataItem[key];
      //     if (value !== undefined) {
      //       console.log(`站別: ${select_Side}，鍵名: ${key}，鍵值: ${value}`);
      //     } else {
      //       console.warn(`⚠️ 鍵名 ${key} 不存在於 elec_ispecData_collect 中`);
      //     }
      //   });
      // });
    } else {
      console.log("elec_ispecData_collect is empty or undefined.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    elec_ispecData_collect,
    select_Side,
    pfcc_echart_min,
    pfcc_echart_max,
    selectedIndex,
  ]); // 依賴項目為 elec_ispecData_collect 和 select_Side

  useEffect(() => {
    if (selectedDropdownItem) {
      const selectedItem = dropdownItems.find(
        (item) => item === selectedDropdownItem
      );

      const index = dropdownItems.indexOf(selectedDropdownItem);
      console.log("index", index);

      if (selectedItem || index !== -1) {
        setView_Selectside(selectedItem);
        // console.log("選擇的項目為:", selectedItem);
        // console.log("選擇的項目索引為:", dropdownItems.indexOf(selectedItem));

        const selectmode = selectedItem.split("_");

        // console.log("選擇的工作模式為:", selectmode[2]);

        setSelectedButtonIndex(dropdownItems.indexOf(selectedItem));
        handleButtonClick(parseInt(selectmode[2])); // 這邊傳入按鈕的索引
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDropdownItem]);

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
    <div>
      <div>
        <h2
          style={{
            textAlign: "center",
            verticalAlign: "middle",
            backgroundColor: "#F5DEB3",
            color: "#000",
            padding: "10px",
            fontSize: "30px",
            marginbottom: "38px",
          }}
        >
          電檢表重量-厚度-OCV&IR分析數據
        </h2>
      </div>

      <div
        className="tab-hover-wrapper"
        onMouseEnter={() => {}} // 不清空，保持顯示
        onMouseLeave={clearHover} // 只有完全移出才清除
        style={{ position: "relative", display: "inline-block" }}
      >
        <div className="tab" style={{ display: "flex", gap: "10px" }}>
          {button_OP_Mode.map((label, index) => (
            <button
              key={index}
              // ref={(el) => (tabRefs.current[index] = el)} // 放入 ref 陣列
              ref={(el) => {
                if (index < button_OP_Mode.length) {
                  tabRefs.current[index] = el;
                }
              }}
              onMouseEnter={() => handleTabHover(index)}
              onClick={() => handleButtonClick(index)}
              style={{
                padding: "10px 20px",
                cursor: "pointer",
                backgroundColor: hoveredIndex === index ? "#FF7F50" : "#ffffff",
                border: "1px solid #ccc",
                borderRadius: "4px",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 滑鼠滑曳選取的按鈕索引 */}
      {isDropdownVisible && (
        <div
          className="dropdown-content"
          onMouseEnter={() => setDropdownVisible(true)}
          onMouseLeave={() => setDropdownVisible(false)}
          style={{
            position: "fixed", // ✅ 建議用 fixed，避免被其他 relative 容器干擾
            top: `${dropdownTop}px`, // ✅ 重點
            left: `${dropdownLeft}px`, // ✅ 重點
            backgroundColor: "#fff",
            border: "1px solid #ccc",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            padding: "8px",
            fontSize: "30px",
            zIndex: 20,
            minWidth: "180px",
          }}
        >
          {dropdownItems.map((item, idx) => (
            <div
              key={idx}
              onClick={() => {
                // 若重複選到同一個項目，先清空再設回，確保 useEffect 會跑
                if (item === selectedDropdownItem) {
                  setSelectedDropdownItem(null);
                  setTimeout(() => setSelectedDropdownItem(item), 0); // 強制變更
                } else {
                  setSelectedDropdownItem(item);
                }
              }}
              onMouseEnter={(e) => {
                if (item !== selectedDropdownItem) {
                  e.currentTarget.style.backgroundColor = "#FFFF00";
                }
              }}
              onMouseLeave={(e) => {
                if (item !== selectedDropdownItem) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
              style={{
                padding: "6px 12px",
                cursor: "pointer",
                backgroundColor:
                  item === selectedDropdownItem ? "#e6f7ff" : "transparent",
                fontWeight: item === selectedDropdownItem ? "bold" : "normal",
                borderRadius: "4px",
              }}
            >
              {item}
            </div>
          ))}
        </div>
      )}
      <div
        // id="chartref"
        ref={chartRef}
        style={{ width: "350%", height: "630px", marginTop: "20px" }}
      ></div>
      <br />
    </div>
  );
};

export default ElectricalInspecDig;
