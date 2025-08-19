import "./index.scss";
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
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

const button_OP_Mode = ["作業模式CE_2", "作業模式CE_3"];
const batteryData = {
  CE_2: {
    thickness: ["電池厚度1~9_Mode_2"],
    sealThickness: ["電池封口厚度1~3_Mode_2"],
    AC_IR_OCV: ["電池絕緣阻抗IR-OCV_Mode_2"],
    edgeVoltage: ["電池臨界邊緣電壓1~2_Mode_2"],
  },
  CE_3: {
    thickness: ["電池厚度1~9_Mode_3"],
    sealThickness: ["電池封口厚度1~3_Mode_3"],
    AC_IR_OCV: ["電池絕緣阻抗IR-OCV_Mode_3"],
    edgeVoltage: ["電池臨界邊緣電壓1~2_Mode_3"],
  },
};

const echk_options = [
  { value: "echk_option1", label: "右洋一期" },
  { value: "echk_option2", label: "孟申二期" },
];

const seriesCC1_name = ["V2_0VAh", "V3_6VAh", "V3_5VAhcom"];

// const series_echk_object_name = [
//   "厚度",
//   "封口厚度",
//   "紅外光值ce,過保護電壓值ce",
//   "臨界電壓",
// ];

const series_echk_object_name = {
  0: { item: "厚度", count: 9 },
  1: { item: "封口厚度", count: 3 },
  2: { items: ["絕緣阻抗ce", "過保護電壓值ce"] },
  3: { item: "臨界電壓", count: 2 },
};

const prefix_list = [
  "厚度",
  "封口厚度",
  "絕緣阻抗ce",
  "過保護電壓值ce",
  "臨界電壓V",
];

const ignoredPrefixes = ["絕緣阻抗ce", "過保護電壓值ce"];

//調整slider 值基準
// 調整min值基準
// 調整min值基準
const base_MinValueIR = 0.00001;
const base_MinValueOCV = 0.5;
const base_MinValueEdge = -0.003;

// 調整max值基準
const base_MaxValueIR = 0.00002;
const base_MaxValueOCV = 0.005;
const base_MaxValueEdge = 0.007;

// eslint-disable-next-line no-unused-vars
let dynmaic_ELECISPEC_name = [];
let range_thickness_name = [];
let range_seal_thickness_name = [];
let range_AC_IR_OCV_name = [];
let range_EdgeVoltage_name = [];

const ElectricalInspecDig = () => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 0-based index, so add 1
  // 使用 useState 儲存 checkbox 的選取狀態
  const [isChecked, setIsChecked] = useState(true);
  const [selectedButtonIndex, setSelectedButtonIndex] = useState(null);
  const [select_Side, setselect_Side] = useState("");
  const [itemYear, setItemYear] = useState(currentYear);
  const [itemMonth, setItemMonth] = useState(currentMonth);
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const [selectedElectricIndex, setSelectedElectricIndex] = useState(null);
  const [elec_ispecData_collect, setElecIspecData_collect] = useState([]); // Define elec_ispecData_collect state
  const [elec_echk_data_echart_draw, setELec_Echk_Data_echart_draw] = useState(
    []
  ); // Define elec_ispecData_collect state
  const [electric_echk__echart_visualmap, setelec_echk_echart_visualmap] =
    useState([]); // 設置visualMap的最大值
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
  const [select_periodvender, setSelect_PeriodVender] = useState("");
  //const [isSelected, setSelected] = useState(null); // Define isSelected state
  const [selectedOption, setSelectedOption] = useState("");
  const [header, setHeader] = useState([]);
  const [datasetSource, setDatasetSource] = useState([]);
  const prevSelectSideRef = useRef(select_Side); // 初始化為當前值
  const [viewside_name, setviewside_name] = useState("");
  const record_yearlen = parseInt(currentYear) - 2023; // 2023年為起始年
  const [axis_visualmin, setaxis_visualMin] = useState(0);
  const [axis_visualmax, setaxis_visualMax] = useState(0);
  const [rangevalue, setrangeValue] = useState(0); //縮放大小比例值,預設0
  const [isZoomed, setIsZoomed] = useState(false);

  const years = Array.from(
    { length: record_yearlen + 1 },
    (_, i) => currentYear - i
  );

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const handleChange = (e) => {
    setrangeValue(e.target.value);
  };

  const handleToggle = () => {
    setIsZoomed((prev) => !prev);
  };

  const handleDropdownChange = useCallback(
    (selectedItem) => {
      const index = dropdownItems.indexOf(selectedItem);

      const sideChanged = select_Side !== prevSelectSideRef.current;

      // 若是相同就不觸發任何副作用
      if (index === selectedButtonIndex && !sideChanged) {
        console.log(`重複點選 -> index: ${index}, 無切換 CE_側別`);
        return;
      }

      // ✅ 在這裡更新 previous side
      prevSelectSideRef.current = select_Side;

      if (selectedItem && index >= 0) {
        setView_Selectside(selectedItem);
        const selectmode = selectedItem.split("_");
        // console.log("選擇的工作模式為:", selectmode[2]);
        setSelectedButtonIndex(index); // 記錄選擇（但不等它觸發）

        handleButtonClick(parseInt(selectmode[2])); // 這邊傳入按鈕的索引 （例如 UI 樣式）

        // ✅ 立即呼叫 fetch 而不是等待 selectedButtonIndex 更新
        Direct_fetch_Electricial_IspecData({
          view_selectside: selectedItem,
          isChecked,
          itemYear,
          itemMonth,
          selectedOption,
          dropdownIndex: index, // ✅ 傳 index，不用等 setState 完成
        });
      }
    },

    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dropdownItems, selectedButtonIndex, itemYear, itemMonth, isChecked]
  );

  const orderedKey_refix_headervalue = (respondata) => {
    const staticStart = "電芯號";
    const staticEnd = "日期";

    const prefix_list = [
      "厚度",
      "封口厚度",
      "臨界電壓V",
      "絕緣阻抗ce",
      "過保護電壓值ce",
    ];

    // 動態收集各 prefix 對應的欄位名
    const dynamicKeyGroups = {};

    respondata.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if ([staticStart, staticEnd].includes(key)) return;
        const prefix = prefix_list.find((p) => key.startsWith(p));

        if (!prefix) return;

        // if (!dynamicKeyGroups[prefix]) dynamicKeyGroups[prefix] = [];
        // dynamicKeyGroups[prefix].push(key);
        if (!dynamicKeyGroups[prefix]) {
          dynamicKeyGroups[prefix] = new Set(); // 改為 Set
        }

        dynamicKeyGroups[prefix].add(key);
      });
    });

    // 排序每個 prefix 內部欄位（數字後綴優先）
    for (const prefix in dynamicKeyGroups) {
      dynamicKeyGroups[prefix] = Array.from(dynamicKeyGroups[prefix]).sort(
        (a, b) => {
          const aNum = parseFloat(a.replace(prefix, "")) || 0;
          const bNum = parseFloat(b.replace(prefix, "")) || 0;
          return aNum - bNum;
        }
      );
    }

    // 組成最終欄位清單
    const orderedKeys = [
      staticStart,
      ...prefix_list.flatMap((prefix) => dynamicKeyGroups[prefix] || []),
      staticEnd,
    ];

    return orderedKeys;
  };

  function createTooltipFormatterFromSource(header, selectnumber) {
    return function (params) {
      const dataObj = params.data;

      // 單選狀態時，選中的 key（注意：header[0] 是 "電芯號"，末端是 "日期"）
      const selectedKey = selectnumber > 0 ? header[selectnumber] : null;
      return header
        .filter((key) => {
          if (key === "電芯號" || key === "日期") return true;
          // 如果有選擇單一欄位，就只保留該欄位顯示
          if (selectedKey) return key === selectedKey;
          return true; // 全部顯示
        })
        .map((key, i) => `<b>${key}:</b> ${dataObj[i] ?? "-"}<br/>`)
        .join("");

      // return Object.entries(dataObj)
      //   .map(([key, val]) => `<b>${key}:</b> ${val ?? "-"}<br/>`)
      //   .join("");
    };
  }

  function refix_headervalue_ResponseData(respondata) {
    const fixedStart = "電芯號";
    const fixedEnd = "日期";
    const dynamicKeysSet = new Set();

    // 收集所有動態欄位（排除固定欄位）
    respondata.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if (key !== fixedStart && key !== fixedEnd) {
          dynamicKeysSet.add(key);
        }
      });
    });

    const dynamicKeys = Array.from(dynamicKeysSet); // 你可自定排序邏輯
    const header = [fixedStart, ...dynamicKeys, fixedEnd];

    //改為陣列
    // const data = respondata.map((item) => {
    //   return header.map((key) => item[key] ?? null);
    // });

    // 保持為物件形式，讓後續可以針對欄位名稱進行操作
    const data = respondata.map((item) => {
      const obj = {};
      header.forEach((key) => {
        obj[key] = item[key] ?? null;
      });
      return obj;
    });

    return { header, data };
  }

  function min_max_scale_mannulsetting(Item_index) {
    let scale_Min, scale_Max;
    //厚度
    if (Item_index === 0) {
      scale_Min = 0;
      scale_Max = 50;
    }
    //封口厚度
    else if (Item_index === 1) {
      scale_Min = -2;
      scale_Max = 2;
    }
    //IR-OCV
    else if (Item_index === 2) {
      scale_Min = -0.05;
      scale_Max = 4;
    }
    //臨界電壓
    else if (Item_index === 3) {
      scale_Min = -0.05;
      scale_Max = 0.05;
    } else {
      //預設一個範圍
      scale_Min = -3;
      scale_Max = 50;
    }

    return { scale_Min, scale_Max };
  }

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

  const clearElec_digramItems = (event) => {
    // 清空以下儲存內容數據
    setadjustinterval(0);
    setelec_echk_echart_visualmap([]); // 更新 visualMapArray 狀態
    setELec_Echk_Data_echart_draw([]); // 更新 elec_echk_data_echart_draw 狀態
  };

  const adjustmenu_echk_select = (index) => {
    dynmaic_ELECISPEC_name.length = 0;
    dynmaic_ELECISPEC_name.push("全範圍");

    const echkset = series_echk_object_name[index];

    if (!echkset) {
      dynmaic_ELECISPEC_name.push("無選項");
      return;
    }

    setviewside_name(echkset.items ? echkset.items : echkset.item);

    //單一項目 (依照數字1~N)
    if (echkset.count) {
      dynmaic_ELECISPEC_name.push(
        ...Array.from(
          { length: echkset.count },
          (_, i) => echkset.item + (i + 1)
        )
      );
    }
    // 有多項目
    else if (echkset.items) {
      dynmaic_ELECISPEC_name.push(...echkset.items);
    }
  };

  const showtip_unit = (echk_index) => {
    let str_echk_unit;

    switch (echk_index) {
      case 0:
      case 1:
        // eslint-disable-next-line no-unused-vars
        str_echk_unit = "毫米(mm)";
        break;
      case 2:
        str_echk_unit =
          selectedIndex === 1 ? "絕緣阻抗(歐姆µΩ)" : "電壓(voltage)";
        break;
      case 3:
        // eslint-disable-next-line no-unused-vars
        str_echk_unit = "電壓(voltage)";
        break;

      default:
        break;
    }
    return str_echk_unit;
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

    setselect_Side(ceMode);
    console.log("✅ 選擇站別為:", ceMode);

    // console.log("dropmenu 選擇號碼最終為=" + selectedButtonIndex);

    console.log("index = " + index);
    console.log("selectedButtonIndex = " + selectedButtonIndex);

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
      //     ...(battery.AC_IR_OCV || []),
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

    //選擇廠商
    // console.log("選擇電檢廠商-> " + selectedOption);
    // // eslint-disable-next-line react-hooks/exhaustive-deps

    if (parseInt(selectedButtonIndex) !== "") {
      console.log("目前參數選單index =" + parseInt(selectedButtonIndex));
    }

    // console.log(
    //   "縮放大調整 rangevalue目前為: " + rangevalue,
    //   "isZoomed 切換狀態為= " + isZoomed
    // );

    // 只有在 selectedButtonIndex 有值時才執行

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [button_OP_Mode, selectedButtonIndex, rangevalue, isZoomed]);

  const handleTabHover = (index) => {
    const modeString = button_OP_Mode[index];
    const ceMode = modeString.split("作業模式")[1]?.trim();
    const battery = batteryData[ceMode];

    // console.log("目前選擇為->:" + index);

    if (battery) {
      const items = [
        ...(battery.thickness || []),
        ...(battery.sealThickness || []),
        ...(battery.AC_IR_OCV || []),
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
      ...(battery.AC_IR_OCV || []),
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

  const Direct_fetch_Electricial_IspecData = async ({
    view_selectside,
    isChecked,
    itemYear,
    itemMonth,
    selectedOption,
    dropdownIndex,
  }) => {
    try {
      const response = await axios.get(
        //"http://localhost:3009/electricinspec/call_thickAndseal_irocv",
        `${config.apiBaseUrl}/electricinspec/call_thickAndseal_irocv`,
        {
          params: {
            view_selectside: view_selectside,
            isChecked: isChecked,
            itemYear: itemYear,
            itemMonth: itemMonth,
            selectedOption: selectedOption,
          },
        }
      );

      const responseData = response.data; // 取出
      const mode = response.data.ceMode;

      // console.log(
      //   `Direct_fetch_ 廠商CE = ${selectedOption} ,工作模式為->${mode}` +
      //     `電檢表查詢data = ` +
      //     JSON.stringify(responseData.echkall, null, 2)
      // );

      const { header, data } = refix_headervalue_ResponseData(
        responseData.echkall
      );

      console.log("header = " + header);
      console.log("data = " + JSON.stringify(data, null, 2));

      setHeader(header);
      setDatasetSource(data);

      //存入echk 測試項目數據列
      setElecIspecData_collect(responseData.echkall);

      //重新調整項目選單
      //adjustmenu_echk_select(dropdownIndex);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const adjust_interval_IR_EDGE = () => {};

  const generate_elec_echk_Option = ({
    select_Side,
    visualMapArray,
    allSeries,
    xAxisType,
    xAxisName,
    adjustinterval,
    rangevalue,
    isZoomed,
  }) => ({
    title: {
      text: `${select_Side}-${viewside_name}-電檢數據散佈圖`,
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
        return (
          `    
         ${name}` +
          showtip_unit(selectedButtonIndex) +
          `: ${cap_mah_value}<br/> `
        );
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
        name: showtip_unit(selectedButtonIndex),
        // interval: adjustinterval,
        // interval: (value) => {
        //   if (selectedButtonIndex >= 2) {
        //     const maxAbs = Math.max(Math.abs(value.max), Math.abs(value.min));
        //     // 刻度間隔為 maxAbs 的 1%
        //      return maxAbs * 0.01;
        //   } else {
        //     return adjustinterval; // 其他情況使用預設
        //   }
        // },
        boundaryGap: [0.1, 0.1], // 上下保留 10% 空間
        // min: 0,
        // max: "dataMax",
        min: (value) => {
          if (selectedButtonIndex >= 2) {
            //當使用拉Bar放大縮小時
            if (isZoomed) {
              console.log("有到Min這裡, isZoomed狀態為:", isZoomed);
              //透過實際的range 設置最小值 , 異常最大或最小無法保證顯示
              //IR-OCV
              if (selectedButtonIndex === 2) {
                return selectedIndex === 0 || selectedIndex === 1
                  ? rangevalue * base_MinValueIR
                  : rangevalue * base_MinValueOCV;
              }
              //臨界電壓 V1或V2
              else if (selectedButtonIndex === 3) {
                return rangevalue * base_MinValueEdge; // 例如 -0.001
              }
            } //使用原先數據列數據分配刻度深度
            else {
              console.log("直接用原先Min這裡, isZoomed狀態為:", isZoomed);
              //計算最小絕對值，並將最小值設為該值的 60% <-可將異常最小值顯示
              const maxAbs = Math.max(Math.abs(value.max), Math.abs(value.min));
              return -maxAbs * 0.6;
            }
          } else {
            return value.min; // 其他狀況使用原始最小值
          }
        },
        max: (value) => {
          if (selectedButtonIndex >= 2) {
            //當使用拉Bar放大縮小時
            if (isZoomed) {
              //透過實際的range 設置最大值 , 異常最大或最小無法保證顯示
              // IR-OCV
              if (selectedButtonIndex === 2) {
                return selectedIndex === 0 || selectedIndex === 1
                  ? rangevalue * base_MaxValueIR
                  : rangevalue * base_MaxValueOCV; // 例如 0.0012 或 5.0
              }
              //臨界電壓 V1或V2
              else if (selectedButtonIndex === 3) {
                return rangevalue * base_MaxValueEdge; // 例如 0.12
              }
            } //使用原先數據列數據分配刻度深度
            else {
              //計算最大絕對值，並將最大值設為該值的 130% <-可將異常最大值顯示
              const maxAbs = Math.max(Math.abs(value.max), Math.abs(value.min));
              return maxAbs * 1.3;
            }
          } else {
            return value.max; // 其他狀況使用原始最大值
          }
        },
        scale: true, // 重要：允許非0開始
        axisLabel: {
          // formatter: (value) => value.toExponential(2), // e.g. 7.46e-4
          formatter: function (val) {
            return val.toFixed(7) + showtip_unit(selectedButtonIndex).slice(2); // 或用 val.toExponential(2)
          },
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
    rangevalue,
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
      const xAxisType_name = select_Side === "CE_2" ? "電芯號" : "電芯號";

      // console.log("adjustinterval調整適合的interval->" + adjustinterval);

      const chartOption = generate_elec_echk_Option({
        select_Side,
        visualMapArray,
        allSeries,
        xAxisType: xAxisType_item,
        xAxisName: xAxisType_name,
        adjustinterval,
        rangevalue,
        isZoomed,
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
    // console.log("✅ 選擇站別為::" + view_selectside);
    // console.log("選擇站年為:" + itemYear);
    // console.log("選擇站月為:" + itemMonth);

    // console.log("selectedOption 狀態 = " + selectedOption);
    // console.log("view_selectside 狀態 = " + view_selectside);

    if (!selectedOption && !view_selectside) {
      console.log("⛔ 尚未選擇廠商或站別，不執行 API");
      return;
    }

    // 如果還沒選廠商，就不要執行 fetch
    if (selectedOption === "" && view_selectside !== "") {
      toast.error(`請先選擇廠商!`);
      return;
    }

    // //呼叫自定義事件處理函數;
    // console.log("Checkbox is now:", isChecked === true ? "選取全部" : "沒選取");

    const fetch_Electricial_IspecData = async () => {
      try {
        //這邊向後端索引資料(判斷是否有勾選全部年月數據 true / 只針對某年月 false)
        const response = await axios.get(
          // "http://localhost:3009/electricinspec/call_thickAndseal_irocv",
          `${config.apiBaseUrl}/electricinspec/call_thickAndseal_irocv`,
          {
            params: {
              view_selectside: view_selectside,
              isChecked: isChecked,
              itemYear: itemYear,
              itemMonth: itemMonth,
              selectedOption: selectedOption,
            },
          }
        );
        const responseData = response.data; // 取出
        const mode = response.data.ceMode;

        // if (responseData.status === 401) {
        //   console.log("沒有選擇廠商導致->" + response.data.message);
        //   return;
        // }

        // console.log(
        //   `廠商CE = ${selectedOption} ,工作模式為->${mode}` +
        //     `電檢表查詢data = ` +
        //     JSON.stringify(responseData.echkall, null, 2)
        // );
        // const { AllContent, max_list, min_list } = response.data;
        // const transformedData = AllContent.map((item) => {
        //   return {
        //     modelId: item.modelId,
        //     value: item.value,
        //   };
        // });

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
        const { header, data } = refix_headervalue_ResponseData(
          responseData.echkall
        );

        setHeader(header);
        setDatasetSource(data);

        setElecIspecData_collect(responseData.echkall); // 更新 elec_ispecData_collect 狀態
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
      let interval_default = 100; // 預設刻度
      let menuItem_index;
      let visualMin, visualMax;

      //清除既有畫面數據,重新import data
      clearElec_digramItems();
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

      // pfcc_echart_min.forEach((item) => {
      //   return Object.values;
      // });

      // console.log("min_list = " + pfcc_echart_min);

      // pfcc_echart_max.forEach((item) => {
      //   return Object.values;
      // });

      // console.log("max_list = " + pfcc_echart_max);

      if (!batteryData[select_Side]) {
        console.error("❌ 無法取得 batteryData 對應站別:", select_Side);
        return;
      }

      // 確認有索取要取的 key 名稱
      if (batteryData[select_Side]) {
        //紅外光值 &臨界電壓 這邊不帶序號 ,menuItem_index = 2
        menuItem_index = parseInt(selectedButtonIndex);
        // const total_amountnumber =
        //   menuItem_index === 0
        //     ? "9"
        //     : menuItem_index === 1
        //     ? "3"
        //     : menuItem_index === 3
        //     ? "2"
        //     : "0";
        // console.log(
        //   "目前確認menuItem_index =" +
        //     menuItem_index +
        //     "  total_amountnumber = " +
        //     total_amountnumber
        // );
        console.log("menuItem_index 有辨識到= " + menuItem_index);
        adjustmenu_echk_select(menuItem_index);
        // dynmaic_ELECISPEC_name = dynmaic_ELECISPEC_name.concat(
        //   batteryData[select_Side].thickness,
        //   batteryData[select_Side].sealThickness,
        //   batteryData[select_Side].AC_IR_OCV,
        //   batteryData[select_Side].edgeVoltage
        // );
      } else {
        console.warn("Invalid select_Side:", select_Side);
      }

      //清空數據列表空間
      range_thickness_name.length =
        range_seal_thickness_name.length =
        range_AC_IR_OCV_name.length =
        range_EdgeVoltage_name.length =
          0;

      // console.log("dynmaic_ELECISPEC_name = " + dynmaic_ELECISPEC_name);

      visualMapArray.length = 0; // 清空 visualMapArray
      let diff_warin_value, midValue;
      // const final_order = orderedKey_refix_headervalue(elec_ispecData_collect);

      // console.log("final_order 最終為= " + final_order);\

      // console.log(
      //   typeof datasetSource +
      //     "= datasetSource轉變為 = " +
      //     JSON.stringify(datasetSource, null, 2)
      // );

      // 用 header 建 formatter
      // const tooltipFormatter = createTooltipFormatter(header);

      // console.log("tooltipFormatter 解析為:= " + tooltipFormatter);

      dynmaic_ELECISPEC_name.forEach((key) => {
        const index = dynmaic_ELECISPEC_name.indexOf(key);

        const isOnlySelected = selectedIndex === index + 1;

        //這邊針對全選或只單獨選其一電壓keyname範圍做存值
        if (selectedIndex === 0 || isOnlySelected) {
          let div_radio_check_ng = false;

          //如果有從後端api擷取 minlist and maxlist
          if (
            pfcc_echart_min[index] !== undefined &&
            pfcc_echart_max[index] !== undefined
          ) {
            visualMin = pfcc_echart_min[index];
            visualMax = pfcc_echart_max[index];
          } //無則使用手動標記min,max刻度值
          else {
            const { scale_Min, scale_Max } =
              min_max_scale_mannulsetting(menuItem_index);
            visualMin = parseInt(scale_Min);
            visualMax = parseInt(scale_Max);
          }

          // console.log("index = " + index);
          console.log("minValue = " + visualMin);
          console.log("maxValue = " + visualMax);

          setaxis_visualMin(parseFloat(visualMin));
          setaxis_visualMax(parseFloat(visualMax));

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
            precision: 11, // ✅ 加入 precision 以顯示浮點數精度
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

          //這邊針對全選或只單獨選其一電檢參數keyname範圍做存值
          if (selectedIndex === 0 || isOnlyRange) {
            // console.log("selectedIndex狀態=" + selectedIndex);
            // console.log("isOnlyRange狀態=" + isOnlyRange);

            const data = isOnlyRange
              ? //單選serial
                //用 flatMap()，展開每一個 item 對應的多個值
                datasetSource.flatMap((item) => {
                  const selectedKeys = Object.keys(item).filter((k) => {
                    // 被忽略的 prefix：只要包含就視為匹配
                    const isIgnoredMatch = ignoredPrefixes.some((prefix) =>
                      k.includes(prefix)
                    );

                    // 非忽略 prefix：需符合 prefix+數字的格式
                    const isPatternMatch = prefix_list
                      .filter((prefix) => !ignoredPrefixes.includes(prefix))
                      .some((prefix) => {
                        const regex = new RegExp(`^${prefix}\\d+$`);
                        return regex.test(k);
                      });

                    return isIgnoredMatch || isPatternMatch;
                  });

                  return selectedKeys
                    .map((k) => {
                      const selectedKey = selectedKeys[selectedIndex - 1];
                      // 只取指定欄位，如"厚度5,封口厚度X,臨界電壓V1"
                      if (k.endsWith(selectedKey)) {
                        const val = item[k];
                        if (typeof val === "number" && isFinite(val)) {
                          const roundedVal = parseFloat(val.toFixed(11));
                          allValues.push(roundedVal);

                          return [
                            item["電芯號"] || "未知電芯",
                            roundedVal,
                            // select_Side !== "PF站"
                            //   ? [item.averageV1, item.averageV2, item.averageV3]
                            //   : 0,
                            item["日期"] || "未知日期",
                            k,
                          ];
                        }
                      }
                      return null;
                    })
                    .filter(Boolean);
                }) //多選Allserial
              : // eslint-disable-next-line array-callback-return
                datasetSource.map((item) => {
                  const selectedKeys = Object.keys(item).filter((k) => {
                    // 被忽略的 prefix：只要包含就視為匹配
                    const isIgnoredMatch = ignoredPrefixes.some((prefix) =>
                      k.includes(prefix)
                    );

                    // 非忽略 prefix：需符合 prefix+數字的格式
                    const isPatternMatch = prefix_list
                      .filter((prefix) => !ignoredPrefixes.includes(prefix))
                      .some((prefix) => {
                        const regex = new RegExp(`^${prefix}\\d+$`);
                        return regex.test(k);
                      });

                    return isIgnoredMatch || isPatternMatch;
                  });

                  //照數字順序排列(無加下列則排序不會一致)
                  selectedKeys.sort((a, b) =>
                    a.localeCompare(b, "zh-Hant-u-nu-numeric")
                  );
                  // 把各欄位值存進 array
                  const values = selectedKeys.map((k) => {
                    const val = item[k];
                    if (typeof val === "number" && isFinite(val)) {
                      const roundedVal = parseFloat(val.toFixed(11));
                      allValues.push(roundedVal);
                      return roundedVal;
                    } else {
                      return null;
                    }
                  });
                  // 組成一筆資料：電芯號 + 數值們 + 日期
                  return [
                    item["電芯號"] || "未知電芯",
                    ...values,
                    item["日期"] || "未知日期",
                  ];
                });

            // console.log(typeof data + " 轉換後最終return 各個data =" + data);

            // 根據站別切換 encode 設定
            const encodeSetting =
              select_Side === "PF站" ? { x: 2, y: 1 } : { x: 0, y: 1 }; // CE_2 或 CE_3 , x = 電芯號 ,   y = 厚度(封口)或紅外光值IR OCP ,臨界電壓

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
                    : selectedIndex % 2 === 0 && selectedIndex <= 4
                    ? "#F2BE45"
                    : selectedIndex % 3 === 0
                    ? "#66FFE6"
                    : "#CF9E9E",
              },
              tooltip: {
                trigger: "item",
                axisPointer: {
                  type: "cross",
                },
                emphasis: {
                  focus: "series",
                },
                formatter: createTooltipFormatterFromSource(
                  header,
                  selectedIndex
                ), // ✅ 正確用 closure 包參數
              },
            };

            // 只有單選才加上標線等輔助圖層
            if (isOnlyRange) {
              let avg = 0.0;
              const sorted = [...allValues].sort((a, b) => a - b);
              const mid = Math.floor(sorted.length / 2);
              //取中位數精度
              const centerValue =
                sorted.length % 2 === 0
                  ? (sorted[mid - 1] + sorted[mid]) / 2
                  : sorted[mid];

              //±90% 範圍篩選
              const tolerance = 0.9;
              const lowerBound = centerValue * (1 - tolerance);
              const upperBound = centerValue * (1 + tolerance);
              const maxRatio = 10; // 最大值篩選比例
              // ✅ 過濾範圍：中位數的 -90% ~ 10 倍內
              const filtered = allValues.filter(
                // (val) => val >= lowerBound && val <= upperBound
                (val) => val >= lowerBound && val <= centerValue * maxRatio
              );

              // 計算平均值（小數點精度）,過濾超出範圍的值重計算
              if (filtered.length > 0) {
                const total_avg = filtered.reduce((acc, cur) => acc + cur, 0);
                avg = total_avg / filtered.length;

                // console.log(
                //   "total_avg = " +
                //     total_avg +
                //     " allValues.length =  " +
                //     allValues.length +
                //     "avg = " +
                //     avg +
                //     "centerValue " +
                //     centerValue
                // );
              } else {
                avg = centerValue * 0.9;
              }

              // const outliers = allValues.filter(
              //   (val) => val < lowerBound || val > upperBound
              // );
              // console.log("🔍 被濾除的異常值：", outliers);

              //目前紅外線光/臨界電壓值 ->小數點精度12位,需要做bit調整顯示
              const avgRounded =
                selectedButtonIndex >= 2
                  ? parseFloat(avg.toFixed(10))
                  : parseFloat(avg.toFixed(7));
              //臨界電壓
              // if (selectedButtonIndex === 3 && selectedIndex >= 1) {
              //   if (selectedIndex === 1) {
              //     console.log(" 臨界電壓One1 avgRounded = " + avgRounded);
              //   } else if (selectedIndex === 2) {
              //     console.log(" 臨界電壓Two2 avgRounded = " + avgRounded);
              //   }
              // }

              baseSeries.markLine = {
                label: {
                  formatter: (param) =>
                    param.type === "average"
                      ? `平均值：${avgRounded} `
                      : param.name === "警戒線"
                      ? "最低規範警戒線"
                      : param.name,
                  position: "end",
                },
                tooltip: {
                  trigger: "item",
                  // formatter: (params) => {
                  //   console.log("🧪 Tooltip params:", params);
                  // },
                  formatter: (param) => {
                    const name = param.data?.name || "";
                    const value = param.data?.yAxis ?? 0;
                    const unit = showtip_unit(selectedButtonIndex);

                    // 根據 selectedButtonIndex (紅外線過電壓/臨界電壓)選單設定高精度10
                    const precision = selectedButtonIndex >= 2 ? 10 : 7;
                    let formattedValue = value.toFixed(precision);

                    if (name === "平均值") {
                      return `平均值：${formattedValue} ${unit}`;
                    } else if (name === "警戒線") {
                      return `最低規範警戒線：${formattedValue} ${unit}`;
                    } else {
                      return `${name}：${value} ${unit}`;
                    }
                  },
                },
                data: [
                  {
                    // type: "average",
                    yAxis: avgRounded, // ✅ 使用手動計算的平均值
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
                      name: "電檢特性範圍",
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

            // ✅ 擴展 Y 軸用 dummy 點（僅針對紅外光值ce / 選項 2）
            if (menuItem_index === 2) {
              baseSeries.data.push([
                "DUMMY_電芯",
                visualMin - 0.00001,
                0,
                "DUMMY_日期",
                "絕緣阻抗ce",
              ]);
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

      //將重整的data存入setELec_Echk_Data_echart_draw,後續帶入e-chart呈現圖像
      setadjustinterval(interval_default);
      // 更新 visualMapArray 狀態
      updateIfChanged(
        setelec_echk_echart_visualmap,
        electric_echk__echart_visualmap,
        visualMapArray
      );
      // 更新 elec_echk_data_echart_draw 狀態
      updateIfChanged(
        setELec_Echk_Data_echart_draw,
        elec_echk_data_echart_draw,
        allSeries
      );

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
    selectedIndex,
    pfcc_echart_min,
    pfcc_echart_max,
    selectedButtonIndex,
    header,
  ]); // 依賴項目為 elec_ispecData_collect 和 select_Side

  useEffect(() => {
    if (selectedDropdownItem) {
      const selectedItem = dropdownItems.find(
        (item) => item === selectedDropdownItem
      );

      const index = dropdownItems.indexOf(selectedDropdownItem);
      // console.log("dropmenu 選擇工作序號碼:", index);

      if (selectedItem || index !== -1) {
        setView_Selectside(selectedItem);
        // console.log("選擇的項目為:", selectedItem);
        // console.log("選擇的項目索引為:", dropdownItems.indexOf(selectedItem));

        const selectmode = selectedItem.split("_");

        //console.log("選擇的工作模式為:", selectmode[2]);

        setSelectedButtonIndex(index); // 記錄選擇（但不等它觸發）

        handleButtonClick(parseInt(selectmode[2])); // 這邊傳入按鈕的索引 （例如 UI 樣式）

        // // ✅ 立即呼叫 fetch 而不是等待 selectedButtonIndex 更新
        Direct_fetch_Electricial_IspecData({
          view_selectside: selectedItem,
          isChecked,
          itemYear,
          itemMonth,
          selectedOption,
          dropdownIndex: index,
        });
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDropdownItem]);

  useEffect(() => {
    if (elec_echk_data_echart_draw.length > 0) {
      // console.log(
      //   "分析數據庫資料數量: " +
      //     elec_echk_data_echart_draw.length +
      //     " elec_echk_data_echart_draw 帶入chart分析數據庫資料:" +
      //     JSON.stringify(elec_echk_data_echart_draw, null, 2)
      // );
      // console.log(
      //   "electric_echk__echart_visualmap 級距(min max):" +
      //     JSON.stringify(electric_echk__echart_visualmap, null, 2)
      // );

      Provide_Scatter_PFCC_Diagram({
        allSeries: elec_echk_data_echart_draw,
        visualMapArray: electric_echk__echart_visualmap,
        adjustinterval: adjustinterval,
        rangevalue: rangevalue,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    elec_echk_data_echart_draw,
    electric_echk__echart_visualmap,
    select_Side,
    adjustinterval,
    rangevalue,
  ]);

  return (
    <div className="scatter_electrical_digram">
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

      <div className="radio-container">
        <label style={{ marginLeft: "5px", fontSize: "12px" }}>
          請選擇廠商{" "}
        </label>
        {echk_options.map((opt) => (
          <label
            key={opt.value}
            className={`radio-label ${
              selectedOption === opt.value ? "isSelected" : ""
            }`}
          >
            <input
              type="radio"
              name="options"
              value={opt.value}
              checked={selectedOption === opt.value}
              onChange={() => setSelectedOption(opt.value)}
            />
            <span className="label-text">{opt.label}</span>
          </label>
        ))}
      </div>
      <div
        className="tab-hover-wrapper"
        onMouseEnter={() => {}} // 不清空，保持顯示
        onMouseLeave={clearHover} // 只有完全移出才清除
        style={{ position: "relative", display: "inline-block" }}
      >
        <div
          className="tab"
          style={{ display: "flex", gap: "10px", paddingTop: "20px" }}
        >
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
          <label>
            <input
              type="checkbox"
              name="allchecked"
              checked={isChecked}
              onChange={handleCheckboxChange}
            />
            顯示總年電檢表數據
          </label>
          {!isChecked && (
            <>
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
                參數範圍：
                <select
                  name="option_echk_range"
                  value={selectedIndex}
                  onChange={(e) => setSelectedIndex(parseInt(e.target.value))}
                >
                  {dynmaic_ELECISPEC_name.map((name, index) => (
                    <option key={index} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
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
            {dropdownItems.map((item, index) => (
              <div
                key={index}
                onClick={() => {
                  // 若重複選到同一個項目，先清空再設回，確保 useEffect 會跑
                  if (item === selectedDropdownItem) {
                    setSelectedDropdownItem(null); //是非同步的，等不到立即變更。
                    setTimeout(() => handleDropdownChange(item), 0); //  強行「晚一點再執行」會讓你處理到過期（錯誤的） index。
                  } else {
                    handleDropdownChange(item);
                  }
                }}
                // onClick={() => handleDropdownChange(item)}
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
        <br />
        {selectedButtonIndex >= 2 && (
          <div class="slidecontainer">
            <input
              type="checkbox"
              id="switch"
              checked={isZoomed}
              onChange={handleToggle}
            />
            <label for="switch">
              <span class="switch-txt">{isZoomed ? "放大" : "原先"}</span>
            </label>
            {isZoomed && (
              <>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={rangevalue}
                  class="slider"
                  name="echk_range"
                  onChange={handleChange}
                />
                <span id="sliderValue">{rangevalue}</span>
              </>
            )}
          </div>
        )}
        <div
          // id="chartref"
          ref={chartRef}
          style={{ width: "350%", height: "630px", marginTop: "20px" }}
        ></div>
        <br />
      </div>
    </div>
  );
};

export default ElectricalInspecDig;
