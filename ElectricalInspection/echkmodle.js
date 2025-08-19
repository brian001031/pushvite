/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from "react";
import Table from "react-bootstrap/Table";
import Button from "react-bootstrap/Button";
import axios from "axios";
import config from "../../config";
import dayjs from "dayjs";
import "./echkmodle.css";

import { toast } from "react-toastify";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  ToolboxComponent,
  DataZoomComponent,
  MarkPointComponent,
  MarkLineComponent,
  LegendComponent,
} from "echarts/components";
import { BarChart, LineChart } from "echarts/charts";
import { UniversalTransition } from "echarts/features";

// 註冊元件和渲染器
echarts.use([
  TitleComponent,
  TooltipComponent,
  GridComponent,
  ToolboxComponent,
  DataZoomComponent,
  MarkPointComponent,
  MarkLineComponent,
  LegendComponent,
  BarChart,
  LineChart,
  CanvasRenderer,
]);

const EchkModle = () => {
  const [searchview_date_start, setSearchView_Date_start] = useState(
    dayjs(new Date(new Date().getFullYear(), 0, 1)).format("YYYY-MM-DD") // 預設為當年1月1日
  );
  const [searchview_date_end, setSearchView_Date_end] = useState(
    dayjs().format("YYYY-MM-DD")
  );
  const [echkname, setSelectedEchk] = useState({
    Mes_echk1: "",
    Mes_echk2: "",
  });
  const [RadioValue, setdRadioValue] = useState("echk1"); // 用於儲存選擇的電檢表類型
  const [Inputvalue, setInputvalue] = useState("");
  const [modleList, setModleList] = useState([]); // 後端回傳的完整 model list
  const [vender, setVender] = useState("");

  //用來儲存經過篩選的選項，只顯示與輸入關鍵字匹配的選項
  const [modelSelectedByUser, setModelSelectedByUser] = useState(false);
  const [filtered_echkOptions, setFiltered_echkOptions] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  // 创建 ref 来引用 DOM 元素 (指定图表容器)
  const prevVenderRef = useRef(null);
  const chartRef_thick = useRef(null);
  const chartRef_sealthick = useRef(null);
  const chartRef_ir_edge = useRef(null);
  const chartRef_ocv = useRef(null);

  // 建立一個陣列包含所有的 refs
  let ref_map_list = [
    chartRef_thick,
    chartRef_sealthick,
    chartRef_ir_edge,
    chartRef_ocv,
  ];

  //設定厚度,封口厚度,絕緣阻抗/臨界電壓,過保護電壓 儲存空間
  const [thick_strogedata, set_thick_strogedata] = useState([]);
  const [sealthick_strogedata, set_sealthick_strogedata] = useState([]);
  const [ir_edge_strogedata, set_ir_edge_strogedata] = useState([]);
  const [ocv_strogedata, setOcv_strogedata] = useState(0.0);

  let echk_modle_param_map = [];

  // 正規表達式判斷是否包含英文和數字
  const regex_echkerr = /^(?=.*[a-zA-Z])(?=.*\d).+$/;

  const styles = {
    container: {
      display: "flex",
      flexWrap: "wrap", // 圖片自動換行
      gap: "10px", // 圖片之間間距
      justifyContent: "space-between", // 水平平均分布
    },
    image: {
      width: "calc(50% - 5px)", // 每列兩張圖片
      height: "470px",
      display: "block",
      backgroundColor: "#f2ebf0ff", // 可刪：讓空白div有背景方便看
    },
  };

  // 監聽 Radio Button 切換
  const handleRadioChange = async (e) => {
    const { name, value } = e.target;

    if (name === "Mes_echk1") {
      setSelectedEchk({ ...echkname, [name]: "echk1" });
      setdRadioValue("echk1");
    } else if (name === "Mes_echk2") {
      setSelectedEchk({ ...echkname, [name]: "echk2" });
      setdRadioValue("echk2");
    }

    //清除既有的Inputvalue和 filtered_echkOptions
    clear_item_select();
  };

  const clear_item_select = () => {
    setFiltered_echkOptions([]);
    setIsDropdownOpen(false);
    setInputvalue("");
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputvalue(value);
    handleSearch_Modle(value); // 呼叫搜尋函式
  };

  function isValidDateFormat_dayafter(dt_start = null, dt_end = null) {
    // console.log("檢查日期格式:", dt_start, dt_end);
    // 先檢查格式是否為 YYYY-MM-DD
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dt_start) || !regex.test(dt_end)) return false;

    // 再檢查是否為合法日期
    const startDate = dayjs(dt_start, "YYYY-MM-DD", true);
    const endDate = dayjs(dt_end, "YYYY-MM-DD", true);

    if (!startDate.isValid() || !endDate.isValid()) return false;

    // 檢查起始日期是否早於結束日期
    if (startDate.isAfter(endDate)) {
      toast.error("起始日期不能晚於結束日期");
      return false;
    }

    // console.log("日期格式正確");
    return true;
  }

  const handle_Date_Change = (e) => {
    const { name, value } = e.target;
    if (name === "trip-start") {
      setSearchView_Date_start(value);
    } else if (name === "trip-end") {
      setSearchView_Date_end(value);
    }
    // console.log(`日期更改: ${name} = ${value}`);
  };

  useEffect(() => {
    //當 起始或結束日期 改變時執行的副作用
    if (
      !isValidDateFormat_dayafter(searchview_date_start, searchview_date_end)
    ) {
      console.error("日期格式不正確或起始日期晚於結束日期");
      return;
    }

    //去呼叫執行搜尋 modle list
    fetchModle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchview_date_start, searchview_date_end, RadioValue]);

  useEffect(() => {
    // console.log("電檢廠商:" + vender + " modleList 更新:", modleList);

    // 比對前後 vender
    const isVenderChanged =
      prevVenderRef.current !== null && prevVenderRef.current !== vender;

    // 更新 prevVenderRef 為當前的 vender
    if (isVenderChanged) {
      if (!modelSelectedByUser) {
        // vender 或 modleList 變更，但不是因為使用者剛選的
        setInputvalue("");
      }
    } else {
      // console.log("vender 沒有變更，保持原有的 Inputvalue:", Inputvalue);
      // 如果沒有變更，則保持原有的 Inputvalue
      setInputvalue(Inputvalue);
    }

    // reset flag 每次都重設，供下次判斷
    setModelSelectedByUser(false);

    prevVenderRef.current = vender;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vender, modleList]);

  const fetchModle = async (e) => {
    try {
      const body = {
        startDate: searchview_date_start.trim(),
        endDate: searchview_date_end.trim(),
        echkvender: RadioValue, // 傳遞選擇的電檢表類型
      };

      const response = await axios.post(
        //`http://localhost:3009/electricinspec/vaildmodle_list`,
        `${config.apiBaseUrl}/electricinspec/vaildmodle_list`,
        body,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log(
        "搜尋 modle list 資料數量為=:",
        response?.data.modle_list.length
      );

      if (response && response.data) {
        // 檢查資料結構並正確設定
        const modle_list = response.data.modle_list;
        //初始 modleList 狀態
        setModleList([]); // 清空 modleList 狀態
        if (Array.isArray(modle_list)) {
          setModleList(modle_list); // 更新 modleList 狀態
          setVender(response.data.vender); // 更新 vender 狀態
        } else {
          console.error("回應資料格式錯誤，預期為陣列");
          setModleList([]);
          setVender(""); // 清空 vender 狀態
        }
      }
    } catch (error) {}
  };

  const handleSearch_Modle = (keywordInput) => {
    const keyword = keywordInput.trim();

    //避免空白輸入觸發搜尋
    if (!keyword || keyword === "") {
      setFiltered_echkOptions([]);
      setIsDropdownOpen(false);
      return;
    }

    const matched = modleList.filter((model) =>
      model.toUpperCase().includes(keyword.toUpperCase())
    );

    // eslint-disable-next-line no-undef
    if (matched.length === 0) {
      // 若沒有匹配項目則關閉下拉
      setFiltered_echkOptions([]);
      setIsDropdownOpen(false);
    } else {
      // 若有匹配項目則開啟下拉
      setFiltered_echkOptions(matched);
      setIsDropdownOpen(true);
    }
  };

  const EchkOptionSelect = (selectedModel) => {
    // 設定輸入框為選到的值
    setInputvalue(selectedModel);
    //代表使用者已選擇一個 model,目前未切換vender
    setModelSelectedByUser(true);
    // 關閉下拉選單
    setFiltered_echkOptions([]);
    setIsDropdownOpen(false);
  };

  const Item_Parameters_Define = (number, datalist) => {
    let arrayitem;

    //number 為鎖定的電檢參數序號,陣列data
    if (Array.isArray(datalist)) {
      //使用 _ 表示忽略值，只使用 index
      switch (number) {
        case 0:
          arrayitem = datalist.map((_, index) => "厚度" + String(index + 1));
          break;
        case 1:
          arrayitem = datalist.map(
            (_, index) => "封口厚度" + String(index + 1)
          );
          break;
        case 2:
          // eslint-disable-next-line no-unused-vars
          arrayitem = [
            "絕緣阻抗", // 絕緣阻抗
            ...datalist
              .slice(1)
              .map((_, index) => "臨界電壓" + String(index + 1)), // 臨界電壓 + index ,從1 begin
          ];
          break;

        default:
          // 可以在這裡處理未預期的 number 值
          break;
      }
    } //非陣列 ,單純字串
    else {
      arrayitem = "過保護電壓";
    }
    return arrayitem;
  };

  const Provide_LineBar_ECHK_Diagram = async ({
    item_valuelist,
    serialID,
    ref_serial,
  }) => {
    // console.log(
    //   "接收 list = " +
    //     item_valuelist +
    //     "序號為: " +
    //     serialID +
    //     "chart_ref = " +
    //     ref_serial
    // );
    //排序 厚度,封口厚度, 絕緣阻抗/臨界電壓 , 過保護電壓
    let allValues,
      myChart,
      view_display = { mode: "", type: "" };
    let sub_title =
      serialID < 1
        ? "厚度"
        : serialID > 2
        ? "過保護電壓"
        : serialID === 1
        ? "封口厚度"
        : "絕緣阻抗/臨界電壓";

    if (serialID <= 1) {
      view_display.mode = "dark";
      view_display.type = "line";
    } else {
      view_display.mode = "light";
      view_display.type = "bar";
    }

    if (typeof item_valuelist === "object") {
      allValues = item_valuelist
        .map((v) => parseFloat(v)) // 將字串轉為浮點數
        .filter((v) => !isNaN(v)); // 過濾掉轉換失敗的值
    } else if (typeof item_valuelist === "string") {
      allValues = item_valuelist;
      // allValues = [parseFloat(item_valuelist)]; // ✅ 包成陣列，且轉為數字
    } else {
      allValues = []; // 預設為空陣列，避免後續 map 出錯
    }

    // console.log(
    //   "allValues = " + allValues,
    //   "狀態陣列allValues = " + Array.isArray(allValues),
    //   "序號:" + serialID,
    //   "標題:" + sub_title,
    //   "電芯號:" + Inputvalue
    // );

    const isLineChart = serialID <= 1;

    //將電檢項目陣列打包存入
    const itemlabel_list = Item_Parameters_Define(serialID, allValues);

    //判定xAxis 值或項目 , 因絕緣阻抗/臨界電壓的浮點精準度位元數較多,目前偏向用bar value 橫向顯示(+,-)
    const isXAxisValue = serialID === 2;

    // 設定絕緣阻抗/臨界電壓 bar itemsyle color
    let bardata = [];
    if (Array.isArray(allValues) && serialID === 2) {
      bardata = allValues.map((val, index) => {
        let color = "#323acdff";
        // 只對絕緣阻抗/臨界電壓使用顏色
        if (index === 0) color = "#232623ff"; // 絕緣阻抗顏色
        else color = val < 0 ? "#ff6347" : "#323acdff"; // 臨界電壓顏色
        const negitiveValue = val < 0; // 如果是負值，取labelRight
        return {
          value: val,
          label: negitiveValue ? { position: "right" } : undefined,
          itemStyle: { color },
        }; // 返回帶有顏色的物件
      });
    } else if (!Array.isArray(allValues) && serialID === 3) {
      // 過保護電壓
      bardata = [
        {
          value: parseFloat(allValues).toFixed(3),
          itemStyle: { color: "#22829dff" },
        },
      ]; // 保留3位小數
    }

    //產生動態serial
    const series =
      serialID <= 1
        ? [
            {
              //厚度及封口厚度
              name: sub_title,
              type: view_display.type, // 使用 line 顯示
              data: allValues,
              itemStyle: {
                color: serialID === 0 ? "#a6983cff" : "#568f58ff", // 厚度為天藍色  , 封口厚度為綠色
              },
              emphasis: {
                focus: "series",
              },
              markPoint: {
                data: [
                  {
                    type: "max",
                    name: "Max",
                    value: Math.max(
                      ...allValues.map((p) =>
                        serialID === 0 ? p.toFixed(3) : p.toFixed(10)
                      )
                    ), // 厚度保留3位小數,封口厚度保留10位小數
                  },
                  {
                    type: "min",
                    name: "Min",
                    value: Math.min(
                      ...allValues.map((p) =>
                        serialID === 0 ? p.toFixed(3) : p.toFixed(10)
                      )
                    ),
                  },
                ],
              },
              markLine: {
                data: [
                  {
                    type: "average",
                    name: "平均值",
                  },
                  [
                    {
                      symbol: "none",
                      x: "90%",
                      yAxis: "max",
                    },
                    {
                      symbol: "circle",
                      label: {
                        position: "start",
                        formatter: "Max",
                      },
                      type: "max",
                      name: "最高点",
                    },
                  ],
                ],
              },
            },
          ]
        : [
            {
              //絕緣阻抗/臨界電壓及過保護電壓
              name: sub_title,
              type: view_display.type, // 使用 bar 顯示
              stack: "Total",
              data: bardata,
              label: {
                show: true,
                formatter: "{b}",
              },
              grid: {
                top: 80,
                bottom: 30,
              },
            },
          ];

    const Echk_General_Option = {
      title: {
        text: `電芯:(${Inputvalue})-${sub_title} 數據呈列圖`,
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
        trigger: isLineChart ? "axis" : "item",
        formatter: function (params) {
          // 如果是 bar 圖（trigger: 'item'），params 是 object，不是 array
          const isArray = Array.isArray(params);
          const paramList = isArray ? params : [params];

          let axisLabel =
            paramList[0]?.axisValueLabel ??
            paramList[0]?.axisValue ??
            paramList[0]?.name ??
            sub_title;

          if (serialID === 2) {
            // eslint-disable-next-line array-callback-return
            return paramList
              .map((item, idx) => {
                // 如果是絕緣阻抗/臨界電壓，顯示 index 和數值
                const label = paramList[0]?.name;
                const val =
                  typeof item.value === "number" ? item.value.toFixed(10) : "-";
                return `${label}: <strong>${val}
                </strong>`;
              })
              .join("<br>");
          } else if (serialID === 3) {
            // 過保護電壓
            axisLabel = paramList[0]?.seriesName ?? "過保護電壓";
          }

          return [
            `<strong >項目: ${axisLabel}</strong>`,
            ...paramList.map((item) => {
              let value;
              if (typeof item?.data?.getValue === "function") {
                value = item.data.getValue("key");
              }
              // ✅ 處理格式: { value: number | string }
              else if (
                item?.data &&
                typeof item.data === "object" &&
                "value" in item.data
              ) {
                const rawVal = item.data.value;
                value = typeof rawVal === "number" ? rawVal.toFixed(3) : rawVal; // 如果是字串就不格式化
              } else if (typeof item?.data?.value === "number") {
                value = item.data.value.toFixed(3);
              } else {
                value = item?.data ?? "-";
              }

              return `${item.seriesName}: <strong>${value}</strong>`;
            }),
          ].join("<br>");
        },

        axisPointer: {
          type: isLineChart ? "line" : "shadow",
        },
      },

      toolbox: {
        show: true,
        feature: {
          dataZoom: {
            yAxisIndex: "none",
          },
          dataView: { readOnly: false },
          magicType: isLineChart ? { type: ["line", "bar"] } : undefined,
          restore: {},
          saveAsImage: {},
        },
      },
      xAxis: {
        type: isXAxisValue ? "value" : "category",
        boundaryGap: false,
        data: isXAxisValue
          ? undefined
          : serialID === 3
          ? ["過保護電壓"]
          : itemlabel_list,
      },
      yAxis: {
        type: isXAxisValue ? "category" : "value",
        data: isXAxisValue ? itemlabel_list : undefined,
        axisLabel: {
          formatter: function (value, index) {
            if (serialID === 2) {
              // 針對 serialID 2：第0筆為 Ω，其餘為 V
              const unit = index === 0 ? "Ω" : "V";
              return `${value} ${unit}`;
            }

            // 其他情況，統一判斷單位
            return `${value} ${
              serialID <= 1 ? "mm" : serialID > 2 ? "v" : "Ω" //// 絕緣阻抗單位為 Ω, 其他為 mm
            }`;
          },
        },
      },
      series: series,
    };

    try {
      // 初始化图表
      // eslint-disable-next-line no-unused-vars
      myChart = echarts.init(ref_serial.current, view_display.mode, {
        renderer: "canvas",
        useDirtyRect: false,
      });

      if (Echk_General_Option && typeof Echk_General_Option === "object") {
        console.log("清除echart並重新繪圖");
        myChart.clear(); // 清除前一張圖
        // 設定圖表選項

        myChart.setOption(Echk_General_Option, true); // 第二參數設為 true 表示 "notMerge"
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
    //當 inputValue 改變時執行的副作用
    if (Inputvalue === "") {
      return;
    }
    // console.log("Inputvalue 改變:", Inputvalue);
  }, [Inputvalue]);

  useEffect(() => {
    //清空在後續存取新modle電檢數據
    echk_modle_param_map.length = 0;
    echk_modle_param_map.push(thick_strogedata);
    echk_modle_param_map.push(sealthick_strogedata);
    echk_modle_param_map.push(ir_edge_strogedata);
    echk_modle_param_map.push(ocv_strogedata);

    // //string
    // console.log("ocv_strogedata 取值為= " + ocv_strogedata);

    // //objet
    // console.log("thick_strogedata data值為= " + thick_strogedata);
    // console.log("sealthick_strogedata data值為= " + sealthick_strogedata);
    // console.log("ir_edge_strogedata data值為= " + ir_edge_strogedata);

    for (let id = 0; id < echk_modle_param_map.length; id++) {
      //傳入參數列
      const list = echk_modle_param_map[id];
      const ref_set = ref_map_list[id];
      Provide_LineBar_ECHK_Diagram({
        item_valuelist: list,
        serialID: id,
        ref_serial: ref_set,
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    thick_strogedata,
    sealthick_strogedata,
    ir_edge_strogedata,
    ocv_strogedata,
  ]);

  const Search_EchkModle_drawChart = async (e) => {
    try {
      const modle = Inputvalue.trim(); // 使用輸入的 Modle 編號

      if (!modle) {
        // console.error("Modle 編號不能為空");
        toast.error("請輸入有效的電芯編號");
        return;
      }

      const response = await axios.get(
        `${config.apiBaseUrl}/electricinspec/characteristics_modle`,
        //`http://localhost:3009/electricinspec/characteristics_modle`,
        {
          params: {
            modle: modle, // 使用輸入的 Modle 編號
            RadioValue: RadioValue, // 傳遞選擇的電檢表類型
          },
        }
      );

      // console.log("回應資料:", response?.data);

      if (response && response.data) {
        // 檢查資料結構並正確設定
        const responseData = response.data;

        // console.log("回應資料: " + JSON.stringify(responseData, null, 2));

        set_thick_strogedata(responseData.thick);
        set_sealthick_strogedata(responseData.sealthick);
        set_ir_edge_strogedata(responseData.ir_edge);
        setOcv_strogedata(parseFloat(responseData.ocv[0]).toFixed(3));

        // if (responseData.data && Array.isArray(responseData.data)) {
        // }
      }
    } catch (error) {
      console.error("Error fetching absent data:", error);
    }
  };

  return (
    <div className="echkmodle">
      <>
        <h2
          style={{
            textAlign: "center",
            verticalAlign: "middle",
            fontSize: "50px",
          }}
        >
          電檢表-電芯模組彙整數據圖
        </h2>
        <br />
        <div className="radio-container">
          <label className="radio-item">
            <input
              type="radio"
              name="Mes_echk1"
              value={echkname.echk1}
              checked={RadioValue === "echk1"}
              onChange={handleRadioChange}
            />
            <p className="dbselect">右洋電檢一期</p>
          </label>
          <label className="radio-item">
            <input
              type="radio"
              name="Mes_echk2"
              value={echkname.echk2}
              checked={RadioValue === "echk2"}
              onChange={handleRadioChange}
            />
            <p className="dbselect">孟申電檢二期</p>
          </label>
        </div>
        <div className="titlerange" style={{ position: "relative" }}>
          <div
            className="input-dropdown-wrapper"
            style={{ position: "relative", width: "300px" }}
          >
            <input
              className="editdatetime-input"
              type="text"
              value={Inputvalue}
              // onBlur={handleBlur}
              placeholder="輸入模組編號"
              onChange={handleInputChange}
              // onKeyDown={(e) => {
              //   if (e.key === "Enter") {
              //     handleSearch_Modle(e);
              //   }
              // }}
            />
            {/* 這邊整合下拉選單邏輯 */}
            {isDropdownOpen && filtered_echkOptions.length > 0 && (
              <ul className="dropdown-options">
                {filtered_echkOptions.map((option, index) => (
                  <li
                    key={index}
                    onClick={() => EchkOptionSelect(option)}
                    className="dropdown-option"
                  >
                    {option}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button class="button" onClick={() => Search_EchkModle_drawChart()}>
            檢視數據
          </button>
          <label
            style={{
              paddingRight: "15px",
              display: "inline-block",
              width: "fit-content",
            }}
          ></label>
          {/* 日期區塊 */}
          <label htmlFor="start">查詢日期(START):</label>
          <input
            type="date"
            id="start"
            name="trip-start"
            value={searchview_date_start}
            max={dayjs().format("YYYY-MM-DD")}
            onChange={handle_Date_Change}
            // onChange={(e) => setSearchView_Date_start(e.target.value)}
          />

          <label
            htmlFor="end"
            style={{
              paddingLeft: "15px",
              display: "inline-block",
              width: "fit-content",
            }}
          >
            查詢日期(END):
          </label>
          <input
            type="date"
            id="start"
            name="trip-end"
            value={searchview_date_end}
            max={dayjs().format("YYYY-MM-DD")}
            onChange={handle_Date_Change}
            // onChange={(e) => setSearchView_Date_end(e.target.value)}
          />
        </div>
        <div style={styles.container}>
          {ref_map_list.map((ref, index) => (
            <div key={index} ref={ref} style={styles.image}>
              {/* 可在此加入圖表或圖片，例如 */}
              {/* <img src={...} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> */}
            </div>
          ))}
        </div>
      </>
    </div>
  );
};

export default EchkModle;
