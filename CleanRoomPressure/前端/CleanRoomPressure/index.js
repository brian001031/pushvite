/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef, useMemo } from "react";
import Table from "react-bootstrap/Table";
import Button from "react-bootstrap/Button";
import axios from "axios";
import config from "../../config";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import moment, { min } from "moment-timezone";
import "./clerm_pre.scss";
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
import { Value } from "sass";

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

const updateFrequency = 3000;
const FETCH_INTERVAL = 2 * 60 * 1000; // 2分鐘
const chartColors = ["#FF5733", "#33C1FF", "#33FF57", "#FFC133" , "#9400D3","#FF8C00"];
dayjs.extend(utc);
dayjs.extend(timezone);

const view_type_options = [
  { val: "realtime", type: "即時機器偵測" },
  { val: "before", type: "舊歷史數據" },
  { val: "condenser", type: "冷凝器溫度監測" }
];

// 要判別過濾的欄位名稱
const ignore_Date_Fields = ["datetime", "Time"];

const CleanRoom_Presure = () => {
  const [searchview_date_record, setSearchView_Date_record] = useState(
    dayjs().subtract(0, "day").format("YYYY-MM-DD") // 預設為昨日,因批次目前只能擷取最新前日
  );
  const [searchview_date_start, setSearchView_Date_start] = useState(
    dayjs(new Date(new Date().getFullYear(), 0, 1)).format("YYYY-MM-DD") // 預設為當年1月1日
  );
  const [searchview_date_end, setSearchView_Date_end] = useState(
    dayjs().subtract(0, "day").format("YYYY-MM-DD")
  );
  const [echkname, setSelectedEchk] = useState({
    Mes_echk1: "",
    Mes_echk2: "",
  });
  const [RadioValue, setdRadioValue] = useState("echk1"); // 用於儲存選擇的電檢表類型
  const [Inputvalue, setInputvalue] = useState("");
  const [modleList, setModleList] = useState([]); // 後端回傳的完整 model list
  const [vender, setVender] = useState("");
  const [viewDetectype, setViewDetectype] = useState("realtime"); //預設即時模式
  const [singleChartMode, setSingleChartMode] = useState(false); //預設多圖模式


  //取當前台灣區日期
  // const now_TW_Date = moment().tz("Asia/Taipei").format("YYYY-MM-DD");
  const startOfDay = moment()
    .tz("Asia/Taipei")
    .startOf("day")
    .format("YYYY-MM-DD HH:mm:ss");
  const endOfDay = moment()
    .tz("Asia/Taipei")
    .endOf("day")
    .format("YYYY-MM-DD HH:mm:ss");

  // 创建 ref 来引用 DOM 元素 (指定图表容器) , for 即時數據
  const chartRef_peak_lower_CR1B22_1 = useRef(null);
  const chartRef_CR1B22_2 = useRef(null);
  const chartRef_CR1B24_1 = useRef(null);
  const chartRef_CR1B24_2 = useRef(null);

  //创建 ref 来引用 DOM 元素 (指定图表容器) ,for 總年月日數據
  const chartRefs_realtime = useRef([]); // 创建 ref 来引用 DOM 元素
  const chartRefs_All = useRef([]);

  const [isfulldatedata, setFulldatedata] = useState(false);
  const chartInstances = useRef([]);

  // 建立一個陣列包含所有的 refs
  let ref_map_list = [
    chartRef_peak_lower_CR1B22_1,
    chartRef_CR1B22_2,
    chartRef_CR1B24_1,
    chartRef_CR1B24_2,
  ];

  const titles = [
    "無塵1B22-1室內",
    "無塵1B22-2室內",
    "無塵1B24-1室內",
    "無塵1B24-2室內",
  ];

  const titles_2 = [
    ["冷卻水溫度", "第一段", "上層"],     
    ["冷凝劑出口溫度", "第二段", "上層"],
    ["冷卻水溫度", "第一段", "下層"],     
    ["冷凝劑出口溫度", "第二段", "下層"],
    ["廢氣入口溫度",  "上層"],
    ["廢氣入口溫度",  "下層"],
  ];


  const lastTimestampRef = useRef(Array(ref_map_list.length).fill(null));

  //設定 CR1B22_1, CR1B22_2, CR1B24_1, CR1B24_2 氣壓(Pa)參數值 , 壓力單位使用MPa 1MPa=1000KPa=10.2kgf/cm2
  const [peak_lower_CR1B22_1_pa, set_peak_lower_CR1B22_1_pa] = useState([]);
  const [moderate_CR1B22_2_pa, set_moderate_CR1B22_2_pa] = useState([]);
  const [moderate_CR1B24_1_pa, set_moderate_CR1B24_1_pa] = useState([]);
  const [moderate_CR1B24_2_pa, setmoderate_CR1B24_2_pa] = useState([]);
  const [datetime_itemlist, setdDtetime_ItemList] = useState([]);
  const [presure_chartDataList, setPresure_chartDataList] = useState([]);
  const [cleanroom_detec_param_map, setPrcleanroom_detec_param_map] = useState(
    []
  );

  // 正規表達式判斷是否包含英文和數字
  const regex_echkerr = /^(?=.*[a-zA-Z])(?=.*\d).+$/;

  const styles = {
    container: (singleChartMode) => ({
      display: "flex",
      flexWrap: singleChartMode? "nowrap" : "wrap", // 圖片自動換行
      gap: "10px", // 圖片之間間距
      justifyContent: singleChartMode ? "center" : "space-between", // 水平平均分布
    }),

    image:(singleChartMode, idx) => {
      if(singleChartMode){
        return {
          width: "100%",
          height: "705px", // 470 * 1.5 = 705
          display: idx === 0 ? "block" : "none",  //只顯示第0筆,其餘不顯示
          backgroundColor: "#f2ebf0ff",
        };
      }

      // 多 chart 模式
      return {
        width: "calc(50% - 5px)", // 每列兩張圖片
        height: "470px",
        display: "block",
        backgroundColor: "#f2ebf0ff", // 可刪：讓空白div有背景方便看
     };
   },
  };

  // 将时间戳转换为台湾时区格式 (UTC+8)
  const convertTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const taiwanTime = new Date(date.getTime() + 8 * 60 * 60 * 1000); // 转换为台湾时区 (UTC+8)

    const year = taiwanTime.getFullYear();
    const month = ("0" + (taiwanTime.getMonth() + 1)).slice(-2);
    const day = ("0" + taiwanTime.getDate()).slice(-2);
    const hour = ("0" + taiwanTime.getHours()).slice(-2);
    const minute = ("0" + taiwanTime.getMinutes()).slice(-2);
    const second = ("0" + taiwanTime.getSeconds()).slice(-2);

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  };

  function buildLineSeries({
  subTitle,
  roomId,
  values,
  x_datetime,
  }) {
  const color = chartColors[roomId % chartColors.length];

  const merge_DateAndValues = x_datetime.map((t, i) => [
    t,
    values[i],
  ]);

  return {
    name: subTitle,
    type: "line",
    showSymbol: false,
    smooth: true,
    data: merge_DateAndValues,
    itemStyle: { color },

    markPoint: {
      data: [
        { type: "max", name: "Max" },
        { type: "min", name: "Min" },
      ],
    },

    markLine: {
      data: [
        { type: "average", name: "平均值" },
        [
          { symbol: "none", x: "90%", yAxis: "max" },
          {
            symbol: "circle",
            label: { position: "start", formatter: "Max" },
            type: "max",
            name: "最高点",
          },
        ],
      ],
    },
  };
}


  function generateOptionMultiSeries(
  subTitles = [],              // ["CR1B22", "CR1B24"]
  valuesMap = [],              // [[...], [...]]
  x_datetime = [],
  roomIds = []                 // [0, 1]
) {  
  const safeTitles = subTitles.filter(Boolean);
  const safeValues = valuesMap.slice(0, safeTitles.length);

  const series = safeValues.map((values, idx) =>
    
    buildLineSeries({
      subTitle: subTitles[idx]??`序號:${idx+1}`,
      roomId: roomIds[idx] ?? idx,
      values,
      x_datetime,
    })
  );

  const unit = singleChartMode ?'°C':'pa';

  return {
    title: {
      text: singleChartMode ?`冷凝器-即時數據` :`靜壓-即時數據`,
      left: "center",
    },

    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        const drop_datetime = params[0]?.data?.[0];
        

        return (
          params
            .map(
              (p) =>
                `${p.marker} ${p.seriesName}: ${Number(p.data[1]).toFixed(
                  4
                )} ${unit}`
            )
            .join("<br>") +
          "<br>" +
          `時間: ${drop_datetime}`
        );
      },
    },

    legend: {
      top: 30,
      data: subTitles,
    },

    emphasis: {
      focus: "series",
    },

    xAxis: {
      type: "time",
      boundaryGap: false,
      data: x_datetime,
    },

    yAxis: {
      type: "value",
      axisLabel: { formatter:
         (v) => `${v} ${unit}` 
    
    },
    },

    series,

    grid: {
      left: "3%",
      right: "7%",
      bottom: "7%",
      containLabel: true,
    },

    toolbox: {
      feature: {
        mark: { show: true },
        dataView: {
          show: true,
          readOnly: false,
          optionToContent: (opt) => {
            let table = `
              <div>
                <span style="display:inline-block; width:340px;">日期</span>
                ${opt.series
                  .map(
                    (s) =>
                      `<span style="display:inline-block; width:120px;">${s.name}</span>`
                  )
                  .join("")}
              </div>
            `;

            const length = opt.series[0]?.data?.length ?? 0;

            for (let i = 0; i < length; i++) {
              table += `
                <div>
                  <span style="display:inline-block; width:340px;">
                    ${opt.series[0].data[i][0]}
                  </span>
                  ${opt.series
                    .map(
                      (s) =>
                        `<span style="display:inline-block; width:120px;">
                          ${Number(s.data[i][1]).toFixed(4)}
                        </span>`
                    )
                    .join("")}
                </div>
              `;
            }

            return table;
          },
        },
        saveAsImage: { show: true },
      },
    },
  };
}

  // 使用 useMemo 生成 option template
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function generateOption(sub_title, room_id, values = [], x_datetime = []) {

    //後續使用下列做設定
    return generateOptionMultiSeries(
      [sub_title],
      [values],
      x_datetime,
      [room_id]
  );

    const color = chartColors[room_id % chartColors.length];

    // console.log(
    //   "generateOption 接收 x_datetime = " +
    //     Array.isArray(x_datetime) +
    //     " " +
    //     x_datetime
    // );

    // console.log("x_datetime日期長度 -> " + x_datetime.length);

    // console.log(
    //   "實際的資料content 組態ALL : " +
    //     JSON.stringify(values, null, 2) +
    //     "資料量為= " +
    //     values.length
    // );

    // 格式化后的数据，可以映射时间
    const merge_DateAndValues = x_datetime.map((t, i) => [t, values[i]]);
    // console.log(
    //   "重整後merge_DateAndValues : " +
    //     JSON.stringify(merge_DateAndValues, null, 2)
    // );

    return {
      //CR1B22,CR1B24 ( 1,2 室內)
      title: {
        text: `靜壓: (${sub_title}) 即時數據`,
        left: "center",
      },
      // tooltip: {
      //   trigger: "axis",
      //   formatter: (params) => {
      //     const p = params[0];
      //     return `${dayjs(p.data[0]).format(
      //       "YYYY-MM-DD HH:mm:ss"
      //     )} : ${p.data[1].toFixed(4)} Pa`;
      //   },
      // },

      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          console.log("工具彈跳data: " + JSON.stringify(params, null, 2));

          const drop_datetime = params[0].data[0]; // 根据索引获取对应的时间

          // console.log(
          //   "索引值為:" + index + " 根据索引获取对应的时间 = " + drop_datetime
          // );

          return (
            params
              .map(
                (p) =>
                  `${p.marker} ${p.seriesName}: ${Number(p.data[1]).toFixed(
                    4
                  )} Pa`
              )
              .join("<br>") +
            "<br>" +
            // `時間：${convertTimestamp(params[0].data[0])}`
            `時間: ${drop_datetime}`
          );
        },
      },
      emphasis: {
        focus: "series",
      },
      markPoint: {
        data: [
          {
            type: "max",
            name: "Max",
            // value: Math.max(
            //   ...y_seriesData.map((p) =>
            //     serialID === 0 ? p.toFixed(3) : p.toFixed(10)
            //   )
            // ), // 厚度保留3位小數,封口厚度保留10位小數
          },
          {
            type: "min",
            name: "Min",
            // value: Math.min(
            //   ...y_seriesData.map((p) =>
            //     serialID === 0 ? p.toFixed(3) : p.toFixed(10)
            //   )
            // ),
          },
        ],
      },

      xAxis: {
        type: "time",
        boundaryGap: false,
        // data: x_datetime.map((timestamp) => convertTimestamp(timestamp)), // 转换 x 轴时间戳
        data: x_datetime, // 转换 x 轴时间戳
      },

      yAxis: {
        type: "value",
        axisLabel: { formatter: (v) => `${v} Pa` },
      },
      series: [
        {
          name: sub_title,
          type: "line",
          showSymbol: false,
          //data: values.map((v, i) => [[i], v]), // 转换数据点时间戳
          data: merge_DateAndValues,
          smooth: true,
          itemStyle: { color },
          markPoint: {
            data: [
              { type: "max", name: "Max" },
              { type: "min", name: "Min" },
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
      ],
      grid: { left: "3%", right: "7%", bottom: "7%", containLabel: true },
      toolbox: {
        feature: {
          mark: { show: true },
          dataView: {
            show: true,
            readOnly: false,
            optionToContent: (opt) => {
              const serial_data = opt.series[0].data;

              // 建立欄位名稱:（两格）
              let table = `
              <div>
                <span style="display:inline-block; width:340px;">日期</span>
                <span style="display:inline-block; width:80px;">帕(Pa)</span>
              </div>
            `;

              // 建立数据列每筆數據
              table += serial_data
                .map(
                  (d) => `
                  <div>
                    <span style="display:inline-block; width:340px;">${d[0]}</span>
                    <span style="display:inline-block; width:80px;">${d[1]}</span>
                  </div>
                  `
                )
                .join("");

              return table;
            },
          },
          saveAsImage: { show: true, readOnly: false },
        },
      },
    };
  }

  const addSecondsToDuplicates = (datetimeList, base_second = 1) => {
    if (!Array.isArray(datetimeList)) return [];

    const seen = {}; // 用於記錄出現過的時間字串
    return datetimeList.map((dt, index) => {
      if (!dt) return null;

      // 去除前後空格，確保解析正確
      const dtClean = dt.trim();

      // 明確指定時區為台北，確保解析一致
      const t = moment.tz(dtClean, "YYYY-MM-DD HH:mm:ss", "Asia/Taipei");

      const key = t.format("YYYY-MM-DD HH:mm:ss"); // 只取到秒級作為 key

      // const t = moment(dt);

      // const key = t.format("YYYY-MM-DD HH:mm:ss"); // 只取到秒級作為 key

      //需要使用 clone()，並且累加次數應該從 1 開始（第一個重複 +1 秒） , t 原先 是同一個 moment 對象？有可能會因為 moment 克隆問題或累加被忽略。
      // 如果之前沒出現過，直接用原時間 + 0ms
      //累加應該從 1 開始，而不是第一次就加 0 秒，否則第一個重複還是原本秒數。
      if (!seen[key]) seen[key] = 0; // 第一次出現

      // 每次 clone，加上已出現次數 * base_second 秒
      const newSec = t
        .clone()
        .add(seen[key] * base_second, "seconds")
        .format("YYYY-MM-DD HH:mm:ss");

      seen[key] += base_second; // 重複累加秒

      // 每次 clone，並加上累加秒（第一次重複加 1 秒）
      return newSec;
    });
  };

  const handleToggle = () => {
    setFulldatedata((prev) => !prev);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
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
    } else if (name === "trip-record") {
      setSearchView_Date_record(value);
    }
    // console.log(`日期更改: ${name} = ${value}`);
  };

  // 即時模式/歷史模式 useEffect
  useEffect(() => {
    let intervalId = null , condenser_detec = [];

    const Detect_CleanRoomPresure_Realtime = async (e) => {
      try {
        const response = await axios.get(
         `${config.apiBaseUrl}/clean_roomdetect/detect_current_value`,
         // `http://localhost:3009/clean_roomdetect/detect_current_value`,
          {
            params: {
              current_date: searchview_date_record, // 偵測當前日期
              record_type: viewDetectype, //檢視新舊類型
            },
          }
        );

        console.log("回應資料:", response?.data);

        if (response && response.data) {
          // 檢查資料結構並正確設定
          const responseData = response.data;
          console.log("回應資料: " + JSON.stringify(responseData, null, 2));

          if (intervalId === null) {
            setdDtetime_ItemList([]);
            setPrcleanroom_detec_param_map([]);
          }

          // eslint-disable-next-line array-callback-return
          const RealDetec_PreSureList = Object.keys(responseData).map(
            (key, index) => {
              const rawData = response.data[key]; // 直接取欄位的 array

              // 每次 map 生成新的陣列
              let dataArray = [];

              if (key === "datetime" || key === "dtinfo" || key === "Time") {
                if (Array.isArray(rawData)) {
                  dataArray = rawData.map((dt) =>
                    dt && dayjs(dt).isValid()
                      ? dayjs(dt)
                          .tz("Asia/Taipei")
                          .format("YYYY-MM-DD HH:mm:ss")
                      : null
                  );
                } else {
                  console.warn(`datetime 欄位不是陣列:`, rawData);
                }
              } else {
                // 其他欄位直接取陣列，如果不是陣列，回傳空陣列
                dataArray = Array.isArray(rawData)
                  ? rawData.map((v) =>
                      v != null && !isNaN(v)
                        ? parseFloat(Number(v).toFixed(4))
                        : null
                    )
                  : [];
              }
              return {
                id:
                  key === "datetime" || key === "Time"
                    ? key
                    : `${key}_presure_${index}`,
                label: key,
                data: dataArray,
              };
            }
          );

          const datetimeItem = RealDetec_PreSureList.find(
            (item) => item.label === "datetime" || item.label === "Time"
          );
          const firstDatetime = datetimeItem?.data?.[0];
          const latestDatetime = datetimeItem?.data?.slice(-1)[0];

          // console.log(
          //   "全系列日期為:" +
          //     JSON.stringify(datetimeItem, null, 2) +
          //     " ~偵查第一筆 和 最後日期列為~: " +
          //     firstDatetime +
          //     " " +
          //     latestDatetime
          // );

          // 處理重複時間
          const datetimeWithSecond = addSecondsToDuplicates(
            datetimeItem?.data,
            1
          ); // 每筆重複增加 1s

          //沒有保留舊日期時間列
          setdDtetime_ItemList(datetimeWithSecond);

          // 設置到 state
          // setdDtetime_ItemList((prevState) => {
          //   return [...prevState, ...datetimeWithSecond];
          // });

          
          //舊方法走進以下▽
          if(!viewDetectype.includes("")){
              const CR1B22_1_Value = RealDetec_PreSureList.find(
              (item) => item.label === "CR1B22_1"
            );
            const CR1B22_2_Value = RealDetec_PreSureList.find(
              (item) => item.label === "CR1B22_2"
            );
            const CR1B24_1_Value = RealDetec_PreSureList.find(
              (item) => item.label === "CR1B24_1"
            );
            const CR1B24_2_Value = RealDetec_PreSureList.find(
              (item) => item.label === "CR1B24_2"
            );

            // console.log("無塵室內靜壓值: CR1B22_1_Value = " + CR1B22_1_Value?.data);
            // console.log("無塵室內靜壓值: CR1B24_2_Value = " + CR1B24_2_Value?.data);

            setPrcleanroom_detec_param_map([
              (CR1B22_1_Value?.data || [])
                .map((v) => parseFloat(v)?.toFixed(4))
                .map(Number),
              (CR1B22_2_Value?.data || [])
                .map((v) => parseFloat(v)?.toFixed(4))
                .map(Number),
              (CR1B24_1_Value?.data || [])
                .map((v) => parseFloat(v)?.toFixed(4))
                .map(Number),
              (CR1B24_2_Value?.data || [])
                .map((v) => parseFloat(v)?.toFixed(4))
                .map(Number),
            ]);
          }
          //靜壓帕,冷凝結溫度數據走進以下▽ ( pa_value ,condenser_detec)
          else{                        
              condenser_detec.length = 0;            
              RealDetec_PreSureList.filter(item => item.label !== "Time" &&  item.label !== "datetime")  //key 欄位同時不等於兩個日期時間
               .forEach((obj) => {
                 condenser_detec.push(Object.values(obj.data)); // 直接取欄位的 array
                }
              );

            //切換單圖或多圖(目前靜壓多圖 ,冷凝器單圖)
            !viewDetectype.includes("condenser")?setSingleChartMode(false):setSingleChartMode(true);            
            setPrcleanroom_detec_param_map(condenser_detec);
            // console.log("目前接收偵測資料量: "+ condenser_detec.length + " 結數據為結果為->" + JSON.stringify(condenser_detec,null,2) );
          }
          
          // 更新 state 時保留舊數據，並將新數據附加
          // setPrcleanroom_detec_param_map((prevState) => {
          //   const updatedState = [...prevState];

          //   // 這裡更新每個資料陣列
          //   RealDetec_PreSureList.forEach((item, index) => {
          //     // 只處理靜壓值的項目
          //     if (item.label !== "datetime" && item.label !== "dtinfo") {
          //       const existingItemIndex = updatedState.findIndex(
          //         (stateItem) => stateItem.label === item.label
          //       );

          //       // 處理每個項目的數據
          //       // const processData = (data) => {
          //       //   return (data || [])
          //       //     .map((v) => parseFloat(v)?.toFixed(4)) // 格式化數值
          //       //     .map(Number); // 轉換為數字
          //       // };

          //       // 確保 item.data 是陣列
          //       const DataPreSureList = Array.isArray(item.data)
          //         ? item.data
          //         : [];

          //       console.log(
          //         "DataPreSureList = " +
          //           DataPreSureList +
          //           "是否陣列:" +
          //           Array.isArray(item.data)
          //       );

          //       // 處理每個項目的數據
          //       // 格式化數據並保證是數字
          //       const processedData = DataPreSureList.map((v) =>
          //         parseFloat(v)?.toFixed(4)
          //       ) // 格式化數值
          //         .map(Number); // 轉換為數字

          //       // 如果 prevState 中已經有這個項目，則更新數據
          //       if (existingItemIndex !== -1) {
          //         const existingData = updatedState[existingItemIndex].data;

          //         // 比較舊的數據長度和新的數據長度
          //         if (processedData.length > existingData.length) {
          //           // 追加新數據
          //           const newItems = processedData.slice(existingData.length); // 取出新增的數據
          //           updatedState[existingItemIndex].data =
          //             existingData.concat(newItems); // 追加到舊數據中
          //         }
          //       } else {
          //         // 如果 prevState 中沒有這個項目，則直接新增
          //         updatedState.push([
          //           // {
          //           //   id: item.id,
          //           //   label: item.label,
          //           //   data: processedData, // 使用處理過的數據
          //           // },
          //           processedData,
          //         ]);
          //       }
          //     }
          //   });

          //   return updatedState;
          // });
        }
      } catch (error) {
        console.error("Error fetching absent data:", error);
      }
    };

    if (!isfulldatedata) {
      //偵測當前日期加數據(即時更新) , 立即更新一次
      // 切回即時模式 , 清除舊實例，保留 DOM refs
      chartInstances.current.forEach((chart) => chart?.dispose());
      chartInstances.current = [];

      Detect_CleanRoomPresure_Realtime();
      intervalId = setInterval(
        Detect_CleanRoomPresure_Realtime,
        FETCH_INTERVAL
      );
    } else {
      //當起始或結束日期 改變時執行的副作用
      if (
        !isValidDateFormat_dayafter(searchview_date_start, searchview_date_end)
      ) {
        console.error("日期格式不正確或起始日期晚於結束日期");
        return;
      }

      // 清除舊 chart 實例
      chartInstances.current.forEach((chart) => chart?.dispose());
      chartInstances.current = [];
      fetch_select_daterange();
    }

    //當 isfulldatedata 或日期變化時，清除舊 interval
    return () => clearInterval(intervalId);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isfulldatedata,
    searchview_date_start,
    searchview_date_end,
    searchview_date_record,
    viewDetectype,
  ]);

  useEffect(() => {
    if (!cleanroom_detec_param_map.length) return;
    if (!datetime_itemlist?.length) return;

    // console.log(
    //   "cleanroom_detec_param_map 整個數據為:" +
    //     JSON.stringify(cleanroom_detec_param_map, null, 2)
    // );

    //將無塵室壓力日期時間陣列重新顯示封裝處理
    // console.log("datetime_itemlist 初始格式: " + datetime_itemlist);
    const reset_itemlabel_list = Presure_clock_Define(
      1,
      datetime_itemlist,
      120
    );

    const requiredDomCount = singleChartMode ? 1 : cleanroom_detec_param_map.length;

    console.log("切換chart 數量為 ="+ requiredDomCount);

    // 💥 確保所有圖表容器都已經掛載到 DOM ,舊式判斷 當ref 的元素不會隨意更動數量
    // const allDomReady =
    //   chartRefs_realtime.current.filter(Boolean).length ===
    //   requiredDomCount;

    const allDomReady = Array.from({ length: requiredDomCount }).every(
       (_, idx) => chartRefs_realtime.current[idx]
    );

    if (!allDomReady) {
      console.log("⏳ 等待 DOM 掛載完成...");
      return;
    }
    
    // console.log(
    //   "將無塵室壓力日期時間陣列重新顯示封裝處理 = " + reset_itemlabel_list
    // );

    // //傳入參數列 --這邊回重新繪圖 not use this moment--
    // for (let id = 0; id < cleanroom_detec_param_map.length; id++) {
    //   const list = cleanroom_detec_param_map[id];
    //   const ref_set = ref_map_list[id];
    //   Provide_Coating_Presure_Diagram({
    //     item_valuelist: list,
    //     serialID: id,
    //     ref_serial: ref_set,
    //     display_datelist: reset_itemlabel_list,
    //   });
    // }

    ///---------------end-------------------------------

    //使用下列只針對新增的數據才做資料匯入
    for (let chartId = 0; chartId < requiredDomCount; chartId++) {
        const chartDom = chartRefs_realtime.current[chartId];
        if (!chartDom) return; // DOM 尚未掛載，跳過

        // 1️⃣ 初始化 chart
        if (!chartInstances.current[chartId]) {
          const chart = echarts.init(chartDom);
          chartInstances.current[chartId] = chart;
          const subTitles = singleChartMode ? titles_2 : titles; // 單圖或多圖

          if (singleChartMode) {
            chart.setOption(
              generateOptionMultiSeries(
                subTitles.map((item)=> item.join('-')), // 冷凝器名稱列
                cleanroom_detec_param_map,
                datetime_itemlist
              ),
              true
            );
          } else {            
            const safeValues = cleanroom_detec_param_map[chartId].map((v) =>
              typeof v === "number" && !isNaN(v) ? Number(v.toFixed(4)) : null
            );

            chart.setOption(
              generateOption(
                subTitles[chartId],
                chartId,
                safeValues,
                datetime_itemlist
              ),
              true
            );
          }

          chart._lastTimestamp = datetime_itemlist.at(-1);
          window.addEventListener("resize", chart.resize);
          continue;
        }

        // 增量 appendData (分以下模式做區別)
        if (singleChartMode) {
            const chart = chartInstances.current[0];
            const lastTimestamp = chart._lastTimestamp;

            cleanroom_detec_param_map.forEach((valueList, seriesIndex) => {
              const newData = [];

              valueList.forEach((v, i) => {
                const t = datetime_itemlist[i];
                if (
                  dayjs(t).isAfter(dayjs(lastTimestamp)) &&
                  typeof v === "number" &&
                  !isNaN(v)
                ) {
                  newData.push([t, Number(v.toFixed(4))]);
                }
              });

              if (newData.length) {
                chart.appendData({
                  seriesIndex,
                  data: newData,
                });
              }
            });

            chart._lastTimestamp = datetime_itemlist.at(-1);
         }else{
              const chart = chartInstances.current[chartId];
              const lastTimestamp = chart._lastTimestamp;

              const newData = [];

              cleanroom_detec_param_map[chartId].forEach((v, i) => {
                const t = datetime_itemlist[i];
                if (
                  dayjs(t).isAfter(dayjs(lastTimestamp)) &&
                  typeof v === "number" &&
                  !isNaN(v)
                ) {
                  newData.push([t, Number(v.toFixed(4))]);
                }
              });

              if (newData.length) {
                chart.appendData({
                  seriesIndex: 0,
                  data: newData,
                });
                chart._lastTimestamp = datetime_itemlist.at(-1);
              }
         }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanroom_detec_param_map, datetime_itemlist ,singleChartMode]);

  // 偵測 DOM 有改變 → 重建 chart
  useEffect(() => {

    const disposeCount = singleChartMode ? 1 : cleanroom_detec_param_map.length;

    for (let id = 0; id < disposeCount; id++) {
      const dom = chartRefs_realtime.current[id];
      const chart = chartInstances.current[id];
      if (!dom) return;

      // 💥 DOM 已變，銷毀舊 chart
      if (chart && dom && chart.getDom() !== dom) {
          chart.dispose();
          chartInstances.current[id] = null;
      }    
    }
  }, [chartRefs_realtime.current,singleChartMode]);

  const fetch_select_daterange = async (e) => {
    try {
      const body = {
        startDate: searchview_date_start.trim(),
        endDate: searchview_date_end.trim(),
        record_type: viewDetectype, //檢視新舊類型
      };

      const response = await axios.post(
       //  `http://localhost:3009/clean_roomdetect/detect_long_value`,
        `${config.apiBaseUrl}/clean_roomdetect/detect_long_value`,
        body,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      // console.log("fetch_select_daterange 回應資料:", response?.data);

      const cleanroom_list_number = viewDetectype.includes("before")
        ? response?.data?.datetime?.length
        : response?.data?.Time?.length;
      const filednumber = Object.keys(response.data).length;

      console.log(
        "搜尋 cleanroom list 資料數量為=:",
        Number(cleanroom_list_number) + " 總共幾組key = " + Number(filednumber)
      );
      console.log("數據列為:" + JSON.stringify(response.data, null, 2));

      //確保有5組數據回傳接收(日期 , 4組塗佈內室靜壓值)
      if (response.status === 200  ) {
        const get_data_length = Number(filednumber);
        if(get_data_length === 5 ){
          console.log(`確保有${get_data_length}數據回傳接收(日期 , ${get_data_length-1}組塗佈內室靜壓值)`);
        }else if(get_data_length === 7){
          console.log(`確保有${get_data_length}組數據回傳接收(日期 , ${get_data_length-1}組冷凝器溫度值)`);
        }

        //清空原先陣列
        setPresure_chartDataList([]);
        setdDtetime_ItemList([]);

        const formattedList = Object.keys(response.data).map((key, index) => {
          // const key = Object.keys(item || {})[0];
          const rawData = response.data[key]; // 直接取欄位的 array

          // 每次 map 生成新的陣列
          let dataArray = [];

          if (key === "datetime" || key === "Time") {
            if (Array.isArray(rawData)) {
              dataArray = rawData.map((dt) =>
                dt && dayjs(dt).isValid()
                  ? dayjs(dt).tz("Asia/Taipei").format("YYYY-MM-DD HH:mm:ss")
                  : null
              );
            } else {
              console.warn(`datetime 欄位不是陣列:`, rawData);
            }
          } else {
            // 其他欄位直接取陣列，如果不是陣列，回傳空陣列
            dataArray = Array.isArray(rawData)
              ? rawData.map((v) =>
                  v != null && !isNaN(v)
                    ? parseFloat(Number(v).toFixed(4))
                    : null
                )
              : [];
          }

          return {
            id:
              key === "datetime" || key === "Time"
                ? key
                : `${key}_presure_${index}`,
            label: key,
            data: dataArray,
          };
        });

        // console.log(
        //   "formattedList  型態為陣列array=" + Array.isArray(formattedList)
        // );

        // 更新狀態
        // console.log(
        //   "formattedList datetime 內容:",
        //   formattedList.find((f) => f.label === "datetime")?.data
        // );

        // console.log(
        //   "CR1B22_1 靜壓內容:",
        //   formattedList.find((f) => f.label === "CR1B22_1")?.data
        // );

        // console.log(
        //   "CR1B22_2 靜壓內容:",
        //   formattedList.find((f) => f.label === "CR1B22_2")?.data
        // );

        // console.log(
        //   "CR1B24_1 靜壓內容:",
        //   formattedList.find((f) => f.label === "CR1B24_1")?.data
        // );

        // console.log(
        //   "CR1B24_2 靜壓內容:",
        //   formattedList.find((f) => f.label === "CR1B24_2")?.data
        // );

        // const itemlabel_list_longdate = Presure_clock_Define(
        //   2,
        //   formattedList.find((f) => f.label === "datetime")?.data,
        //   120
        // );

        setdDtetime_ItemList(
          formattedList.find(
            (f) => f.label === "datetime" || f.label === "Time"
          )?.data
          //   (f) => ignore_Date_Fields.includes(f.label)
          // )?.data
        );

        setPresure_chartDataList(
          formattedList.filter(
            (item) => !item.id.includes("datetime") && !item.id.includes("Time")
            // (item) => !ignore_Date_Fields.includes(item.id)
          )
        );
      }
    } catch (error) {}
  };

  //當有接收到新的 presure_chartDataList 時，重新渲染所有圖表
  useEffect(() => {
    if (!presure_chartDataList || presure_chartDataList.length === 0) return;
    presure_chartDataList.forEach((item, index) => {
      // console.log("渲染圖表:", item.label, "索引:", index);
      render_Cleanrm_Presure_Chart({
        chartRef: { current: chartRefs_All.current[index] },
        chartData: item.data,
        charlabel: item.label,
        index,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presure_chartDataList, datetime_itemlist]);

  const render_Cleanrm_Presure_Chart = async ({
    chartRef,
    chartData,
    charlabel,
    index,
  }) => {
    let myChart;
    try {
      if (!chartRef.current) return;

      const allValues = Object.values(chartData);

      const max_target = Math.max(...allValues);
      const min_target = Math.min(...allValues);

      // console.log(`第"+${index}+ "資料為最大為:`+ max_target  + ` 最小為:` + min_target );

      // 初始化圖表
      myChart = echarts.init(chartRef.current, "dark", {
        renderer: "canvas",
        useDirtyRect: false,
      });

      const subTitles = viewDetectype === "condenser" ? titles_2 : titles;
      const check_istemperature = viewDetectype === "condenser";
      const param_name_text = viewDetectype === "condenser" ? "溫度(攝氏c)數據分佈":"靜壓(帕pa)數據分佈";

      const option = {
        title: {
          text: `${subTitles[index]} ${param_name_text}`,
          left: "center",
          top: 10,
          textStyle: {
            fontSize: 25,
            fontWeight: "bold",
          },
        },
        grid: {
          top: 100,
          left: 150,
          right: 250,
          height: "105%",
          bottom: "15%", // 拉大底部空間給 slider
        },
        tooltip: {
          trigger: "axis",
          axisPointer: {
            type: "cross",
            animation: false,
          },
          formatter: function (params) {
            console.log(`params 資料源= ` + JSON.stringify(params, null, 2));
            const tip_string = check_istemperature ? `溫度值: ${params[0].value} 攝氏(c)` :`靜壓值: ${params[0].value} 帕(pa)`; 
            return `日期/時間:${params[0].name} <br/> ${tip_string}`;
          },
          backgroundColor: "#daec35ff",
          borderColor: "#333333ff",
          borderWidth: 1,
          textStyle: {
            fontSize: 20,
            color: "#000",
          },
          rich: {
            time: {
              color: "#ff0000",
              fontSize: 14,
              fontWeight: "bold",
            },
            value: {
              color: "#0000ff",
              fontSize: 16,
            },
            br: {
              height: 10,
            },
          },
        },
        axisPointer: {
          link: [
            {
              xAxisIndex: "all",
            },
          ],
        },
        toolbox: {
          feature: {
            dataZoom: {
              yAxisIndex: "none",
            },
            restore: {},
            saveAsImage: {},
          },
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          axisLine: { onZero: true },
          data: datetime_itemlist,
          // axisLabel: {
          //   formatter: function (n) {
          //     return Math.round(n) + "";
          //   },
          // },
        },
        yAxis: {
          name: check_istemperature ? "溫度值(攝氏c)" :"靜壓值(帕Pa)",
          type: "value",
          max: viewDetectype === "realtime" ? 20 :
               viewDetectype === "condenser" ? max_target>150?150:max_target*1.2
               :70,
          min: viewDetectype === "realtime" ? -100 :
                viewDetectype === "condenser" ? -50
                :-300,
        },
        dataZoom: [
          {
            type: "slider",
            show: true,
            xAxisIndex: 0,
            height: 20,
            bottom: 5, // 下方位置
            start: 0, // 初始顯示 0% ~ 20%
            end: 20, // 設定成 20% 會讓畫面鬆很多
          },
          {
            type: "inside",
            xAxisIndex: 0,
            zoomLock: false,
          },
        ],

        legend: {
          show: true,
          data: [charlabel || "年全項目累積總量"],
          top: 30,
        },
        series: [
          {
            name: [charlabel || "年全項目累積總量"],
            type: "line",
            data: chartData || "無數據",
            smooth: true, // 線條更平滑
            showSymbol: false, // 不顯示點 → 避免太密
            lineStyle: {
              width: 2,
            },
            itemStyle: {
              color: function (param) {
                return index === 0
                  ? "#5470c6"
                  : index === 1
                  ? "#ff0000"
                  : "#00ff00";
              },
            },

            encode: {
              x: index === 0 ? 0 : 1, // index 0: name 在 x，index > 0: value 在 x
              y: index === 0 ? 1 : 0, // index 0: value 在 y，index > 0: name 在 y
            },

            label: {
              show: true,
              precision: 1,
              position: index === 0 ? "top" : "right",
              valueAnimation: true,
              fontFamily: "monospace",
              // position: "top", // ✅ 數值顯示在柱子頂部
            },
          },
        ],

        animationDuration: 0,
        animationDurationUpdate: updateFrequency,
        animationEasing: "linear",
        animationEasingUpdate: "linear",
        graphic: echarts.util.map(chartData, function (item, dataIndex) {
          return {
            type: "text",
            right: 160,
            top: 10,
            style: {
              // text: selectedYear,
              font: "bolder 50px monospace",
              fill: "rgba(100, 100, 100, 0.25)",
            },
            z: 100,
            onmousemove: echarts.util.curry(showTooltip, dataIndex),
            onmouseout: echarts.util.curry(hideTooltip, dataIndex),
          };
        }),
      };

      option && myChart.setOption(option);

      function showTooltip(dataIndex) {
        myChart.dispatchAction({
          type: "showTip",
          seriesIndex: 0,
          dataIndex: dataIndex,
        });
      }

      function hideTooltip(dataIndex) {
        myChart.dispatchAction({
          type: "hideTip",
        });
      }
    } catch (error) {
      console.error("圖表渲染錯誤", error);
    }
  };

  /**
   * 將 datalist 轉成指定時間間距的格式列表
   * @param {Array} datalist - UTC 時間字串陣列
   * @param {Number} intervalMinutes - 間距（10, 15, 30, 60 , 120 ,180）
   * @returns {Array}
   */
  const Presure_clock_Define = (action, datalist, intervalMinutes = 120) => {
    if (!Array.isArray(datalist) || datalist.length === 0) return [];

    //給即時監控日期時分秒刻度
    if (Number(action) === 1) {
      const intervalMs = intervalMinutes * 60 * 1000;
      let lastPickedTime = null;
      //這邊項目列表將透過 時間(HH:mm:ss)做區分

      return datalist
        .map((utcTime) => {
          const t = moment(utcTime).tz("Asia/Taipei");

          if (!lastPickedTime) {
            lastPickedTime = t; // 第一筆先存
          } else {
            if (t.diff(lastPickedTime) < intervalMs) return null; // 未滿 2 小時 → 跳過
            lastPickedTime = t; // 更新下一次比較
          }

          const time24 = t.format("HH:mm:ss"); // 24 小時制
          const hour = Number(t.format("HH"));
          const min_sign = Number(t.format("mm"));
          // //正確處理跨小時的大於 60 分鐘的間距
          // const totalMinutes = hour * 60 + min_sign;

          // if (totalMinutes % intervalMinutes !== 0) return null;

          // 自訂 AM / PM
          const ap = hour >= 12 ? "PM" : "AM";

          // 方案 1：回傳字串
          return `${time24} ${ap}`;

          // 方案 2：回傳陣列
          // return [`${time24} ${ap}`].filter(Boolean);
        })
        .filter(Boolean); //去掉NULL
    }
    //給歷史紀錄日期時分秒刻度
    else {
      const times = datalist.map((t) => moment(t).tz("Asia/Taipei"));
      const start = times[0].clone().startOf("hour"); // 向下取整到小時
      const end = times[times.length - 1].clone();

      const result = [];
      let cur = start.clone();

      while (cur <= end) {
        const time24 = cur.format("HH:mm:ss");
        const hour = Number(cur.format("HH"));
        const ap = hour >= 12 ? "PM" : "AM";

        result.push(`${time24} ${ap}`);

        cur.add(intervalMinutes, "minutes");
      }

      return result;
    }
  };

  const Provide_Coating_Presure_Diagram = async ({
    item_valuelist,
    serialID,
    ref_serial,
    display_datelist,
  }) => {
    // console.log(
    //   "接收 list = " +
    //     item_valuelist +
    //     "序號為: " +
    //     serialID +
    //     "chart_ref = " +
    //     ref_serial
    // );

    let allValues,
      myChart,
      view_display = { mode: "", type: "" };
    let sub_title =
      serialID < 1
        ? "無塵1B22-1室內"
        : serialID > 2
        ? "無塵1B24-2室內"
        : serialID === 1
        ? "無塵1B22-2室內"
        : "無塵1B24-1室內";

    if (serialID <= 1) {
      view_display.mode = "dark";
      view_display.type = "line";
    } else {
      view_display.mode = "light";
      view_display.type = "line";
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
    //   "狀態是否陣列allValues = " + Array.isArray(allValues),
    //   "序號:" + serialID
    // );

    const isLineChart = serialID <= 3;

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
      serialID <= 3
        ? [
            {
              //CR1B22,CR1B24 ( 1,2 室內)
              name: sub_title,
              type: view_display.type, // 使用 line 顯示
              data: allValues,
              itemStyle: {
                color:
                  serialID === 0
                    ? "#e0563eff"
                    : serialID === 1
                    ? "#42c449ff"
                    : serialID === 2
                    ? "#7ebaeeff"
                    : "#d6dd15ff",
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

    const Presure_General_Option = {
      title: {
        text: `靜壓:(${sub_title}) 即時數據`,
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
        show: true,
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

          magicType: isLineChart ? { type: ["line", "bar"] } : undefined,
          restore: {},

          feature: {
            mark: { show: true },
            dataView: { show: true, readOnly: false },
            saveAsImage: { show: true, readOnly: false },
          },
        },
      },

      xAxis: {
        type: "time",
        boundaryGap: false,
        //interval: 1000 * 60 * 60, // 每間格60分鐘靜壓值
        data: display_datelist,
      },
      yAxis: {
        type: "value",
        data: undefined,
        axisLabel: {
          formatter: function (value, index) {
            // 靜壓單位帕 Pa
            return `${value} ${"Pa"}`;
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

      if (
        Presure_General_Option &&
        typeof Presure_General_Option === "object"
      ) {
        console.log("清除echart並重新繪圖");
        myChart.clear(); // 清除前一張圖
        // 設定圖表選項

        myChart.setOption(Presure_General_Option, true); // 第二參數設為 true 表示 "notMerge"
      }

      window.addEventListener("resize", () => {
        if (myChart) myChart.resize();
      });
    } catch (error) {
      console.error("Error initializing chart:", error);
      return;
    }
  };

  return (
    <div className="clerm_presure">
      <h2
        style={{
          textAlign: "center",
          verticalAlign: "middle",
          fontSize: "50px",
        }}
      >
        {viewDetectype.includes("condenser")?"冷凝器-溫度監測數據圖":"塗佈-靜壓監測數據圖"}
      </h2>
      <div
        className="date-range"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginTop: "30px",
        }}
      >
        {/* <span>姓名:</span>
        <input type="text" /> <Button variant="primary">搜尋</Button> */}
        選擇檢視:
        <select
          onChange={(event) => setViewDetectype(event.target.value)}
          style={{
            width: "190px",
            fontSize: "1.6rem",
            backgroundColor: "#FFFF77",
          }}
        >
          {view_type_options.map((item, index) => (
            <option key={item.val} value={item.val}>
              {item.type}
            </option>
          ))}
        </select>
      </div>
      <br />
      {/* switch */}
      <div className="switch_wrapper">
        <input
          type="checkbox"
          id="switch"
          checked={isfulldatedata}
          onChange={handleToggle}
        />
        <label htmlFor="switch">
          <span className="switch-txt">
            {isfulldatedata
              ? "全年月日數據"
              : `日期:${searchview_date_record}即時數據`}
          </span>
        </label>
        {/* 檢視日期(record) 只在 isfulldatedata === false 顯示 */}
        {!isfulldatedata && (
          <div className="titlerange">
            <label htmlFor="record">檢視日期(record):</label>
            <input
              type="date"
              id="record"
              name="trip-record"
              value={searchview_date_record}
              max={dayjs().subtract(1, "day").format("YYYY-MM-DD")}
              onChange={handle_Date_Change}
            />
          </div>
        )}
      </div>
      {/* 內容區塊 */}
      {!isfulldatedata ? (
        <div style={styles.container(singleChartMode)}>    
          {(singleChartMode ? [0] : cleanroom_detec_param_map).map((_, idx) => (
            <div
              key={idx}              
              ref={(el) => (chartRefs_realtime.current[idx] = el)}
              style={styles.image(singleChartMode , idx)}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="titlerange">
            <label htmlFor="start">查詢日期(START):</label>
            <input
              type="date"
              id="start"
              name="trip-start"
              value={searchview_date_start}
              max={dayjs().subtract(1, "day").format("YYYY-MM-DD")}
              onChange={handle_Date_Change}
            />

            <label htmlFor="end" style={{ marginLeft: "10px" }}>
              查詢日期(END):
            </label>
            <input
              type="date"
              id="end"
              name="trip-end"
              value={searchview_date_end}
              max={dayjs().subtract(1, "day").format("YYYY-MM-DD")}
              onChange={handle_Date_Change}
            />
          </div>
          <br />
          <div>
            {presure_chartDataList.map((item, index) => (
              <React.Fragment key={item.label}>
                <span
                  style={{
                    fontWeight: "bold",
                    display: "block",
                    fontSize: "60px",
                    color: "#130f0fff",
                    textAlign: "center",
                    padding: "75px",
                    marginBottom: "10px",
                  }}
                >
                  {item.label} {"▽"}
                </span>
                <div
                  ref={(el) => (chartRefs_All.current[index] = el)}
                  style={{ width: "100%", height: "600px", marginTop: "12px" }}
                />
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default CleanRoom_Presure;
