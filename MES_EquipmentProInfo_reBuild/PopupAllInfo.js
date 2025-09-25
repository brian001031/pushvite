/* eslint-disable no-sparse-arrays */
// MixingSelection.js
// 引入 Material-UI Select 和 MenuItem
import { Select, MenuItem } from "@mui/material";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Modal, Button } from "react-bootstrap";
import { json, Route } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import "./styles.scss";
import config from "../../config";
import api from "./api.js";
import Form from "react-bootstrap/Form";
import axios from "axios";
import moment from "moment";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DatasetComponent,
  LegendComponent,
} from "echarts/components";
import { SVGRenderer, CanvasRenderer } from "echarts/renderers";
import jsQR from "jsqr";
import dayjs from "dayjs";

echarts.use([SVGRenderer, CanvasRenderer]);
echarts.use([
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DatasetComponent,
  LegendComponent,
  BarChart,
  CanvasRenderer,
]);

const countryColors = {
  Australia: "#2444b9ff",
  Finland: "#008022ff",
  Canada: "#f00",
  China: "#ffde00",
  Cuba: "#002a8f",
  France: "#ed2939",
  Germany: "#000",
  Iceland: "#003897",
  India: "#f93",
  Japan: "#bc002d",
  NorthKorea: "#024fa2",
  SouthKorea: "#000",
  NewZealand: "#00247d",
  Norway: "#ef2b2d",
  Poland: "#dc143c",
  Russia: "#d52b1e",
  Turkey: "#e30a17",
  UnitedKingdom: "#00247d",
  UnitedStates: "#b22234",
};

const updateFrequency = 3000;
const dimension = 2;
let option, option2;
let dimensions = [];
const percent_error_heat = parseFloat("0.001");

//這邊若有有動態的溫度,自行調整
const dynamic_show = false;

function PopupAllInfo({ show, onHide, mes_side, centered }) {
  const chartRef = useRef(null); // 创建 ref 来引用 DOM 元素
  const chartRef2 = useRef(null); // 创建 ref2 来引用 DOM 元素
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(moment().locale("zh-tw"));
  const [chartresponse_amont, setchartresponse_amont] = useState([]); // api update page 資料
  const [chartresponse_heat, setchartresponse_heat] = useState([]); // api update heat page 資料
  const [sideoption, setSideoption] = useState("");
  const [mes_source, setmes_source] = useState({});
  const [mes_source2, setmes_source2] = useState({});
  const [mes_series, setmes_series] = useState([]);
  const [mes_series_heat, setmes_series_heat] = useState([]);
  const [mes_amount_shift, setmes_amount_shift] = useState([]); //設置儲存各班別總產能
  const [count, setCount] = useState(0);
  const [scaledMax, setscaledMax] = useState(0);
  const [scaledMax_HeatTemp, setscaledMax_HeatTemp] = useState(0);

  useEffect(() => {
    console.log("Popup show 狀態變化:", show);
    // 只在 mes_side 改變時設定 sideoption，避免循環觸發
    if (mes_side && Object.keys(mes_side).length > 0) {
      const newSideoption = Object.values(mes_side)[0];
      setSideoption(newSideoption);
    }

    // 當 Modal 關閉時，清理所有狀態
    if (!show) {
      console.log("Modal 關閉 - 清理所有狀態");
      setmes_source({});
      setmes_source2({});
      setchartresponse_amont({});
      setmes_series([]);
      setscaledMax(0);
      setCount(0);
      // 重置 sideoption 避免殘留
      setSideoption("");
    }
  }, [mes_side, show]); // 添加 show 依賴

  const direct_shift_databetween = (shift_info, now_date) => {
    const current = dayjs(now_date);

    if (shift_info.includes("昨晚班")) {
      return (
        current.subtract(1, "day").format("YYYY-MM-DD") +
        " 20:00:00 ~ " +
        current.format("YYYY-MM-DD") +
        " 08:00:00"
      );
    } else if (shift_info.includes("今早班")) {
      return (
        current.format("YYYY-MM-DD") +
        " 08:00:00 ~ " +
        current.format("YYYY-MM-DD") +
        " 20:00:00"
      );
    } else if (shift_info.includes("今晚班")) {
      return (
        current.format("YYYY-MM-DD") +
        " 20:00:00 ~ " +
        current.add(1, "day").format("YYYY-MM-DD") +
        " 08:00:00"
      );
    } else {
      return now_date;
    }
  };

  const fetch_MesAmount_AllData = useCallback(async () => {
    console.log("check 一開始 狀態:" + typeof show + show);
    let source, source2, date_range_amount;
    try {
      if (!show) {
        console.log("Not Open PopupAllInfo!");
        return;
      }

      const executeApiFunc = messide_match_callallapi(sideoption);

      if (!executeApiFunc) {
        console.warn("無符合的 API 函式");
        setchartresponse_amont({});
        return;
      }

      // 每次調用時重新獲取當前日期，避免依賴 startDate 狀態
      const dateStr = moment().format("YYYY-MM-DD");
      const response = await executeApiFunc(dateStr);

      //因烘箱站需要多顯示加熱溫度折現圖,這邊多判斷
      if (sideoption.includes("oven")) {
        // console.log("烘箱Popup接收組態為:" + JSON.stringify(response, null, 2));
        source = Object.entries(response.data[1].All_OVEN_CELL_NUM).map(
          ([machineName, value]) => ({
            [sideoption]: machineName,
            [dateStr]: value,
          })
        );

        source2 = Object.entries(response.data[0].temp_address).map(
          ([heat, value]) => ({
            [sideoption]: heat,
            [dateStr]: value,
          })
        );
      } else {
        source = Object.entries(response.data).map(([machineName, value]) => ({
          [sideoption]: machineName,
          [dateStr]: value,
        }));

        //存取各班別總產能
        // console.log("各班別總產能:" + JSON.stringify(response.Total_capacity_shift));
        if (
          typeof response.Total_capacity_shift !== "undefined" &&
          Object.keys(response.Total_capacity_shift)?.length
        ) {
          date_range_amount = Object.entries(response.Total_capacity_shift).map(
            ([dtrange, value]) => ({
              [sideoption]: dtrange,
              [dateStr]: value,
            })
          );
        }
      }

      if (Object.keys(response.data)?.length) {
        setmes_source(source);
        setchartresponse_amont(source);

        if (
          typeof response.Total_capacity_shift !== "undefined" &&
          Object.keys(response.Total_capacity_shift)?.length
        ) {
          setmes_amount_shift(date_range_amount);
        }

        if (sideoption.includes("oven")) {
          setmes_source2(source2);
          setchartresponse_heat(source2);
        }
      } else {
        setmes_source({});
        setchartresponse_amont({});
        setmes_amount_shift({});
        if (sideoption.includes("oven")) {
          setmes_source2({});
          setchartresponse_heat({});
        }
      }
    } catch (error) {
      console.error("call fetch_MesAmount_AllData API 錯誤:", error);
      setmes_source({});
      setchartresponse_amont({});
      setmes_amount_shift({});
      setmes_source2({});
      setchartresponse_heat({});
      setmes_amount_shift({});
    }
  }, [sideoption]);

  useEffect(() => {
    if (!sideoption) {
      setchartresponse_amont({});
      return;
    }

    let intervalId;

    // 只有在 show === true 時才執行 API 調用
    if (show) {
      // 立即執行一次
      fetch_MesAmount_AllData();
      setCount((prev) => prev + 1);

      // 設定定時器
      intervalId = setInterval(() => {
        fetch_MesAmount_AllData();
        setCount((prev) => prev + 1);
      }, 3000); // 3秒刷新資料
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }

      // 組件卸載時安全清理圖表
      //(1)產能
      if (chartRef.current) {
        try {
          const chartInstance = echarts.getInstanceByDom(chartRef.current);
          if (chartInstance && !chartInstance.isDisposed()) {
            chartInstance.dispose();
          }
        } catch (error) {
          console.warn("組件卸載時清理圖表(產能)發生錯誤:", error);
        }
      }

      //(2)加熱點
      if (chartRef2.current) {
        try {
          const chartInstance = echarts.getInstanceByDom(chartRef2.current);
          if (chartInstance && !chartInstance.isDisposed()) {
            chartInstance.dispose();
          }
        } catch (error) {
          console.warn("組件卸載時清理圖表(加熱點)發生錯誤:", error);
        }
      }
    };
  }, [show, sideoption]); // 移除 fetch_MesAmount_AllData 依賴

  // 取消按鈕的處理函數
  const handleBack = () => {
    console.log("handleBack 被調用 - 開始清理");

    // 清理所有狀態
    setmes_source({});
    setmes_source2({});
    setchartresponse_amont({});
    setchartresponse_heat({});
    setmes_series([]);
    setscaledMax(0);
    setCount(0);

    // 清理圖表實例
    if (chartRef.current) {
      try {
        const chartInstance = echarts.getInstanceByDom(chartRef.current);
        if (chartInstance && !chartInstance.isDisposed()) {
          chartInstance.dispose();
        }
      } catch (error) {
        console.warn("清理圖表時發生錯誤:", error);
      }
    }

    if (chartRef2.current) {
      try {
        const chartInstance = echarts.getInstanceByDom(chartRef2.current);
        if (chartInstance && !chartInstance.isDisposed()) {
          chartInstance.dispose();
        }
      } catch (error) {
        console.warn("組件卸載時清理圖表(加熱點)發生錯誤:", error);
      }
    }

    console.log("handleBack 清理完成 - 調用 onHide");
    // 讓 React-Bootstrap 處理所有 Modal 狀態管理
    onHide();
  };

  const classColors = (idx) => {
    const classColors = ["#8aafcdff", "#9bd79dff", "#c5a3a1ff"]; // 藍、綠、紅（晚班 → 早班 → 晚班）

    return classColors[idx % classColors.length];
  };

  const getColorByIndex = (index) => {
    const hue = (index * 45) % 360; // 每次偏移 45 度色相
    return `hsl(${hue}, 70%, 60%)`; // 飽和度、亮度可自調
  };

  const messide_match_callallapi = (sideoption) => {
    //疊片站
    if (String(sideoption).includes("stacking")) {
      return api.callStacking_todayfullmachinecapacity; // 傳回All函式
    } //入殼站
    else if (String(sideoption).includes("assembly")) {
      return api.callAssembly_todayfullmachinecapacity;
    } // 正極模切
    else if (String(sideoption).includes("cuttingCathode")) {
      return api.callCuttingCathode_todayfullmachinecapacity;
    } // 負極模切
    else if (String(sideoption).includes("cuttingAnode")) {
      return api.callCuttingAnode_todayfullmachinecapacity;
    } // 注液機
    else if (String(sideoption).includes("injection")) {
      return api.callinjection_todayfullmachinecapacity;
    } // 精封站
    else if (String(sideoption).includes("edgefold")) {
      return api.callEdgeFolding_todayfullmachinecapacity;
    } // 常溫站
    else if (String(sideoption).includes("rtaging")) {
      return api.callRTAging_todayfullmachinecapacity;
    } // 真空大小烘箱站
    else if (String(sideoption).includes("oven")) {
      return api.callOven_todayfullmachinecapacity;
    }

    // 其他情況
    console.warn("未匹配到任何 API 函式，請檢查 sideoption:", sideoption);
    // 如果沒有符合的條件，返回 null

    return null; // 沒有符合就回傳 null
  };

  useEffect(() => {
    let cumulative = parseInt(0);
    let scatterSeries;
    // 累加邏輯 + 動態設定顏色
    // // 只有在有資料且 Modal 是開啟狀態時才更新圖表
    // if (!show || !sideoption || Object.keys(mes_source).length === 0) {
    //   return;
    // }

    // //確認各班別總產能
    // console.log(
    //   "各班別數量:" +
    //     Object.entries(mes_amount_shift).length +
    //     " 各班別總產能:" +
    //     JSON.stringify(mes_amount_shift, null, 2)
    // );

    if (
      typeof mes_amount_shift !== "undefined" &&
      Object.entries(mes_amount_shift).length > 0
    ) {
      scatterSeries = mes_amount_shift
        .map((item, idx) => {
          const shift_dtrange = item.stacking;
          const dateKey = Object.keys(item).find((k) => k !== "stacking");
          const value = item[dateKey];

          if (isNaN(value) || value < 0) return null;
          cumulative += parseInt(value);
          // console.log(
          //   "第" +
          //     idx +
          //     "筆累積總產能為->" +
          //     cumulative +
          //     " 型態為:" +
          //     typeof cumulative
          // );
          const shift_dtrange_name = shift_dtrange.slice(
            4,
            shift_dtrange.length
          );

          return {
            name: shift_dtrange_name,
            type: "bar",
            barWidth: 15, // 數值單位是像素，越小越細
            symbolSize: 2 * idx * 0.5,
            symbolOffset: [100, -10 * idx],
            barGap: "200%",
            data: [
              {
                name: shift_dtrange_name,
                value: [dateKey, value],
                // ✅ 把 x 軸改為 0 (因為只有一筆分類資料)
                // value: [0, cumulative],
                label: {
                  show: true,
                  position: idx === 1 ? "top" : idx === 0 ? "bottom" : "right",
                  symbolOffset: [0, -20], // 上移 20px
                  //formatter: `${shift_dtrange_name}: ${value}`,
                  formatter: () =>
                    // `${shift_dtrange_name}: ${value}\n累積: ${cumulative}`,
                    `${shift_dtrange_name}: ${value}`,
                  fontSize: 12,
                  fontWeight: "bold",
                },
                itemStyle: {
                  color: classColors(idx) || "#999",
                },
              },
            ],
            z: 100,
          };
        })
        .filter(Boolean); //移除Null
    }

    const dateStr = startDate.format("YYYY-MM-DD"); // e.g. "2025-07-03"

    const sourceArray = Object.entries(mes_source).map(([stacking, value]) => ({
      stacking,
      [dateStr]: value,
    }));

    const validValues = sourceArray.map((item) => {
      const val = item[dateStr]?.[dateStr];
      return val != null ? Number(val) : NaN;
    });

    const maxValue = Math.max(...validValues);
    console.log("maxValue = " + maxValue);
    const scaledMax = Math.ceil(maxValue * 1.1); // 或用 Math.round / Math.floor 看需求
    setscaledMax(scaledMax);

    let series = Object.values(mes_source).map((item, index, array) => {
      const isLast = index === array.length - 1;
      return {
        name: item[sideoption], // ✅ 動態取出欄位
        type: "bar",
        data: [Number(item[dateStr])], // dateStr = "2025-07-03"
        itemStyle: {
          color: getColorByIndex(index),
        },
        label: {
          show: true,
          position: "top",
          fontFamily: "monospace",
          fontSize: 30, // ← 調整這裡的字體大小
          color: "#e7ddddff", // ← 可選：設置顏色
          fontWeight: "bold", // ← 可選：加粗
        },

        // ...(isLast && {
        //   markLine: {
        //     symbol: "none",
        //     silent: false,
        //     data: markLines,
        //   },
        // }),
      };
    });

    // series.push({
    //   name: "標線系列",
    //   type: "line", // 或 'scatter'
    //   data: [null, null, null], // 空數據或 [null,null,...]
    //   markLine: {
    //     symbol: "none",
    //     data: [
    //       { yAxis: 10, name: "標線1" },
    //       { yAxis: 30, name: "標線2" },
    //       { yAxis: 50, name: "標線3" },
    //     ],
    //     lineStyle: {
    //       color: "red",
    //       width: 2,
    //       type: "dashed",
    //     },
    //     label: {
    //       show: true,
    //       fontSize: 12,
    //       fontWeight: "bold",
    //     },
    //   },
    //   silent: true, // 不響應事件，避免干擾
    //   animation: false,
    // });

    // console.log("scatterSeries 是:", JSON.stringify(scatterSeries, null, 2));

    const finalSeries =
      typeof mes_amount_shift !== "undefined" &&
      Object.entries(mes_amount_shift).length > 0
        ? [...series, ...scatterSeries]
        : series; // 直接是單層陣列

    // console.log(
    //   "預先查詢finalSeries組態為:" + JSON.stringify(finalSeries, null, 2)
    // );

    setmes_series(finalSeries);

    // 使用 setTimeout 來避免頻繁更新
    const timeoutId = setTimeout(() => {
      ReflashMesAmount_Chart();
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [chartresponse_amont, mes_source, sideoption]);

  //初始加熱點chart
  const init_HeatChart = async () => {
    const dateStr = startDate.format("YYYY-MM-DD"); // e.g. "2025-07-03"
    const OverLimit_OvenPosition = [];
    const OverLimit_Values = [];
    const mergedRanges = [];
    let start;
    let end;

    //將多組物件轉換arraylist
    const mes_source2_array = Object.values(mes_source2);
    const Oven_Heat_Position = mes_source2_array.map((item) => item.oven);

    const Heat_ArrayValues = mes_source2_array.map((item) => {
      const val = item[dateStr];
      const randomOffset = parseFloat((Math.random() * 1300 - 650).toFixed(1)); // 產生 -5.5 到 +5.5 的小數，保留1位小數
      const merge_val = dynamic_show
        ? parseFloat(val) + randomOffset
        : parseFloat(val);

      return isNaN(merge_val) ? null : merge_val;
    });

    // 🧠 防呆：資料為空不渲染
    if (
      !Oven_Heat_Position.length ||
      !Heat_ArrayValues.length ||
      Heat_ArrayValues.every((v) => v === null)
    ) {
      console.warn("📛 加熱點資料為空，取消渲染");
      return;
    } else {
      console.log("Heat_ArrayValues整理後的:" + Heat_ArrayValues);
    }

    const maxValue = Math.max(...Heat_ArrayValues);
    const diff_radio_value =
      (parseInt(maxValue) - parseInt(Math.min(...Heat_ArrayValues))) / 2;

    const scaledMax_Heat = Math.ceil(maxValue * 1.1); // 或用 Math.round / Math.floor 看需求
    setscaledMax_HeatTemp(scaledMax_Heat);

    const maxValue_close = maxValue * (1 - percent_error_heat);

    const styledData = Heat_ArrayValues.map((val) => ({
      value: val,
      itemStyle: {
        color: val >= maxValue_close ? "#ff5e5e" : "#0040ffff",
      },
    }));

    const pureData = Heat_ArrayValues.map((val) => val ?? 0); // 純數字陣列

    // 計算警告門檻
    const warningThreshold = maxValue * (1 - percent_error_heat);

    // 過濾出接近最大值的警告項目,並將存入
    const warningValues = Heat_ArrayValues.forEach((val, index) => {
      const checkOverlimit = val >= warningThreshold;
      if (checkOverlimit) {
        OverLimit_OvenPosition.push("加熱點-" + (index + 1)); // 從加熱點-1 開始
        OverLimit_Values.push(val); // 儲存值
      }
    });

    // console.log(
    //   "warningValues接近溫度警告% =" + warningValues,
    //   "共有" + warningValues.length + "過溫度點位:" + OverLimit_OvenPosition
    // );

    // console.log("過溫度值list:" + OverLimit_Values);
    // console.log("過溫度點位:" + OverLimit_OvenPosition);

    const validValues = Heat_ArrayValues.filter(
      (v) => typeof v === "number" && !isNaN(v)
    );
    const temp_avg =
      validValues.length > 0
        ? validValues.reduce((sum, val) => sum + val, 0) / validValues.length
        : 0;

    console.log(
      "最大最小標準差平均值:" +
        diff_radio_value +
        " 平均溫度為 = " +
        temp_avg +
        " 溫度type = " +
        typeof temp_avg
    );

    //設置Y軸最小刻度為0
    const force_min_scale_zero =
      diff_radio_value !== 0 && diff_radio_value < temp_avg / 2;

    // 合併連續的點成區塊範圍
    //轉成純數字，並排序
    const sortedPoints = OverLimit_OvenPosition.map((name) =>
      parseInt(name.replace("加熱點-", ""))
    ).sort((a, b) => a - b);

    start = sortedPoints[0];
    end = sortedPoints[0];

    for (let i = 1; i < sortedPoints.length; i++) {
      if (sortedPoints[i] === end + 1) {
        // 還是連續
        end = sortedPoints[i];
      } else {
        // 不連續，存區塊，重置
        mergedRanges.push([start, end]);
        start = end = sortedPoints[i];
      }
    }
    mergedRanges.push([start, end]); // 最後一組也加入

    // ✅ 轉換成 ECharts markArea 格式
    const markAreaData = mergedRanges.map(([start, end]) => [
      { name: "過溫區塊", xAxis: `加熱點-${start}` },
      { xAxis: `加熱點-${end}` },
    ]);

    console.log("markAreaData = " + JSON.stringify(markAreaData, null, 2));

    //總Heat e-chart 選染參數設置
    const Option_Serial = {
      title: {
        text: `${sideoption}大烘箱-加熱點溫度分佈數據圖  紅柱接近:${maxValue}°F(Max)`,
        left: "center",
        top: "5%",
      },

      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
        },
      },
      toolbox: {
        show: true,
        feature: {
          saveAsImage: {},
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: true,
        // prettier-ignore
        data: Oven_Heat_Position,
      },
      yAxis: {
        type: "value",
        min: force_min_scale_zero ? 0 : scaledMax_Heat * 0.65,
        max: scaledMax_Heat,
        axisLabel: {
          formatter: function (n) {
            return Math.round(n) + "°F";
          },
        },
        // animationDuration: 5000,
        // animationDurationUpdate: 8000,
        animation: false,
        axisPointer: {
          snap: true,
        },
      },
      visualMap: {
        show: false,
        dimension: 1,
        pieces: [
          {
            lte: 6,
            color: "green",
          },
          {
            gt: 6,
            lte: 8,
            color: "red",
          },
          {
            gt: 8,
            lte: 14,
            color: "green",
          },
          {
            gt: 14,
            lte: 17,
            color: "red",
          },
          {
            gt: 17,
            color: "green",
          },
        ],
      },
      dataZoom: [
        {
          type: "slider",
          show: true,
          start: 0,
          end: 100,
          filterMode: "none", // ← 這行是關鍵
        },
        {
          type: "inside",
          start: 0,
          end: 100,
          filterMode: "none", // ← 這也要
        },
      ],
      series: [
        {
          name: "真空大烘箱",
          type: "bar",
          smooth: true,
          connectNulls: true,
          // prettier-ignore
          data: styledData,
          barWidth: 10,
          lineStyle: {
            color: "yellow", // 防止深色主題看不到
            width: 3,
          },
          label: {
            show: true,
            position: "top",
            fontSize: 12,
            formatter: function (params) {
              return params.dataIndex % 5 === 0 ? params.value : "";
            },
          },
          markArea: {
            itemStyle: {
              color: "rgba(255, 173, 177, 0.4)",
            },
            z: 5,
            data: markAreaData,
          },
          // markArea: {
          //   silent: true,
          //   itemStyle: {
          //     color: "rgba(255, 255, 147, 0.3)",
          //   },
          //   label: {
          //     show: true,
          //     formatter: () => `平均值：${temp_avg.toFixed(2)}°F`,
          //     position: "insideEnd",
          //     color: "#FFFF93",
          //     fontWeight: "bold",
          //   },
          //   data: [[{ yAxis: temp_avg - 1 }, { yAxis: temp_avg + 1 }]],
          // },
          markPoint: {
            data: OverLimit_Values.map((val, idx) => ({
              name: OverLimit_OvenPosition[idx],
              coord: [OverLimit_OvenPosition[idx], val],
              value: val,
              symbol: "pin",
              symbolSize: 50,
              itemStyle: {
                color: "red",
              },
              label: {
                show: true,
                formatter: "{b}\n{c}°F",
                fontSize: 12,
                position: "insideTop",
                color: "rgba(199, 169, 172, 1)",
              },
            })),
          },
        },
      ],
    };

    //存取filter資料後續渲染使用
    echarts.dispose(chartRef2.current); // 重置 DOM

    let myChart = echarts.getInstanceByDom(chartRef2.current);

    if (!myChart) {
      myChart = echarts.init(chartRef2.current, "dark");
    }

    console.log(
      "🔄 重新繪製 Heat 圖表" + JSON.stringify(Option_Serial, null, 2)
    );

    try {
      myChart.clear(); // ✅ 先清掉前一次圖
      myChart.setOption(Option_Serial, true); // ✅ 強制不合併
      myChart.resize();
    } catch (err) {
      console.error("🔥 ECharts setOption 發生錯誤", err);
    }

    const resizeHandler = () => {
      myChart.resize();
    };

    // ✅ 正確綁定
    window.addEventListener("resize", resizeHandler);

    // ✅ 清理時正確移除 handler
    return () => {
      window.removeEventListener("resize", resizeHandler);
      myChart?.dispose();
    };
  };

  useEffect(() => {
    if (!String(sideoption).includes("oven") || !show) {
      return;
    }

    const chartDom = chartRef2.current;

    if (!chartDom) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          console.log("init_HeatChart DOM 大小正常，再初始化圖表");
          // DOM 大小正常，再初始化圖表
          init_HeatChart(); // 你 chart 初始化邏輯封裝在這裡
          observer.disconnect(); // 初始化完成後移除觀察
        }
      }
    });

    observer.observe(chartDom);

    return () => {
      observer.disconnect();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes_source2, chartresponse_heat, , sideoption, show]);

  useEffect(() => {
    // console.log("最終serial 組態為= " + JSON.stringify(mes_series, null, 2));

    console.log("scaledMax = " + scaledMax);

    // console.log(
    //   "大烘箱溫度點e-chart 資料組態為:" +
    //     JSON.stringify(mes_series_heat, null, 2)
    // );

    // console.log(
    //   "等待觸發執行------------------------" +
    //     "各班別數量:" +
    //     Object.entries(mes_amount_shift).length +
    //     " 各班別總產能:" +
    //     JSON.stringify(mes_amount_shift, null, 2)
    // );
  }, [mes_series, scaledMax, mes_series_heat, mes_amount_shift]);

  const ReflashMesAmount_Chart = async (e) => {
    let cumulative = parseInt(0);
    if (!chartRef.current) return;

    let myChart;

    try {
      // 檢查是否已經存在圖表實例，避免重複創建
      myChart = echarts.getInstanceByDom(chartRef.current);

      // 如果不存在，則創建新實例
      if (!myChart) {
        myChart = echarts.init(chartRef.current, "dark");
      }

      //(1)先行定義markLines
      // const markLines = Object.entries(mes_amount_shift)
      //   .filter(([_, value]) => !isNaN(value) && Number(value) >= 0)
      //   .map(([shift_dtrange, value], idx) => {
      //     cumulative += parseInt(value);
      //     console.log(
      //       "第" +
      //         idx +
      //         "筆總產能為->" +
      //         cumulative +
      //         " 型態為:" +
      //         typeof cumulative
      //     );
      //     const name = shift_dtrange.slice(4, shift_dtrange.length);
      //     return {
      //       name,
      //       type: "value",
      //       yAxis: cumulative,
      //       label: {
      //         formatter: `${name}: ${value}\n累積: ${cumulative}`,
      //         // formatter: (param) => `${param.name}: ${param.value}`,
      //         fontSize: 14,
      //         fontWeight: "bold",
      //       },
      //       lineStyle: {
      //         type: "dashed",
      //         color: "#4caf50",
      //         width: 5,
      //         z: 10,
      //       },
      //     };
      //   });

      option = {
        title: {
          text: `${sideoption}-全機台全天產量`,
          left: "center", // 可選：讓標題置中
          top: 50, // 可選：調整上下位置
          textStyle: {
            fontSize: 14,
            fontWeight: "bold",
          },
        },
        grid: {
          top: 120,
          bottom: 100,
          left: 150,
          right: 250,
          // top: 80,
          // bottom: 50,
          // left: 60,
          // right: 40,
        },
        tooltip: {
          order: "valueDesc",
          // trigger: "axis",
          trigger: "item",
          axisPointer: {
            type: "cross",
            textStyle: {
              align: "left",
            },
          },
          formatter: function (params, dataIndex) {
            console.log("取得params:" + JSON.stringify(params, null, 2));

            let date = "";
            let value = "";

            if (Array.isArray(params.value)) {
              // Scatter: value = [date, value]
              //date = params.value[0];
              //目前有早晚班架構
              date = direct_shift_databetween(
                params.name,
                params.data.value[0]
              );
              value = params.value[1];
            } else if (typeof params.data === "object" && params.data.value) {
              // 可能是自定義 bar with object
              if (Array.isArray(params.data.value)) {
                //目前有早晚班架構
                date = direct_shift_databetween(
                  params.name,
                  params.data.value[0]
                );
                value = params.data.value[1];
              } else {
                date = params.name;
                value = params.data.value;
              }
            } else {
              // 普通 bar
              date = params.name;
              value = params.value;
            }

            return `<div>${params.seriesName}<br/> 日期: ${date}<br/><b style="color:#930093">產能:${value}</div>`;
          },
        },

        xAxis: {
          type: "category",
          data: [startDate.format("YYYY-MM-DD")], // 只有一個時間點分類
        },

        yAxis: {
          type: "value",
          name: "產能量(Qty)",
          inverse: false,
          min: 0,
          max: scaledMax,
          boundaryGap: false, // ✅ 強烈建議加上這行
          axisLabel: {
            formatter: function (n) {
              return Math.round(n) + "";
            },
          },
          // animationDuration: 200,
          // animationDurationUpdate: 300,
        },

        series: mes_series,
        legend: {
          show: true,
        },
        // Disable init animation.
        // animationDuration: 0,
        // animationDurationUpdate: updateFrequency,
        // animationEasing: "linear",
        // animationEasingUpdate: "linear",
        animation: false,
        graphic: echarts.util.map(
          chartresponse_amont,
          function (item, dataIndex) {
            return {
              type: "text",
              right: 160,
              bottom: 1,
              style: {
                text: "",
                font: "bolder 80px monospace",
                fill: "rgba(100, 100, 100, 0.25)",
              },
              z: 100,
              onmousemove: echarts.util.curry(showTooltip, dataIndex),
              onmouseout: echarts.util.curry(hideTooltip, dataIndex),
            };
          }
        ),
      };

      option && myChart.setOption(option, true);

      // convertToPixel 要在 myChart.setOption(option) 之後呼叫
      // 否則你會得到 undefined，因為圖表尚未初始化。

      //(2)再定義graphics
      // const graphics = markLines.map((item) => {
      //   const yPixel = myChart.convertToPixel(
      //     { yAxisIndex: 0 },
      //     item.cumulative
      //   );

      //   const fixname = item.name.slice(4, item.name.length);

      //   return [
      //     // 畫水平線
      //     {
      //       type: "line",
      //       shape: {
      //         x1: 60, // grid.left 對應
      //         y1: yPixel,
      //         x2: 800, // 根據圖表寬度調整
      //         y2: yPixel,
      //       },
      //       style: {
      //         stroke: "#4caf50",
      //         lineWidth: 2,
      //         lineDash: [5, 5],
      //       },
      //       z: 10,
      //     },
      //     // 畫文字
      //     {
      //       type: "text",
      //       left: 70,
      //       top: yPixel - 20, // 稍微往上提
      //       style: {
      //         text: `${fixname}: ${item.value}\n累積: ${item.cumulative}`,
      //         fill: "#4caf50",
      //         font: "bold 14px monospace",
      //       },
      //       z: 11,
      //     },
      //   ];
      // });

      // //(3)最後初始化完再引入graphic
      // myChart.setOption({ graphic: graphics.flat() });
    } catch (error) {
      console.error("取得資料錯誤", error);
    }

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
  };

  const ReflashHeatTemp_forOven_Chart = async (e) => {
    if (!chartRef2.current) return;

    let myChart = echarts.getInstanceByDom(chartRef2.current);

    if (!myChart) {
      myChart = echarts.init(chartRef2.current, "dark");
    }

    if (mes_series_heat && typeof mes_series_heat === "object") {
      myChart.clear(); // ✅ 先清掉前一次圖
      myChart.setOption(mes_series_heat, true); // ✅ 強制不合併
    }
  };

  useEffect(() => {
    if (
      show &&
      String(sideoption).includes("oven") &&
      Object.keys(mes_source2).length > 0
    ) {
      console.log("📈 資料更新，重繪 Heat Chart");
      console.log("🧪 chartRef2.current 是否存在？", chartRef2.current);
      init_HeatChart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes_source2]);

  return (
    <Modal
      show={show}
      onHide={handleBack}
      keyboard={false}
      centered={centered}
      size="xl"
      // onEntered={() => {
      //   console.log("✅ Modal 完全打開 onEntered");
      //   if (String(sideoption).includes("oven")) {
      //     init_HeatChart(); // 👈 改成這裡執行
      //   }
      // }}
    >
      <Modal.Header className="justify-content-center">
        <Modal.Title
          style={{
            fontSize: "2.5rem",
            fontWeight: "bold",
            width: "100%",
            textAlign: "center",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div>全設備產能數據圖</div>
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="d-grid p-20">
          <div className="text-center mb-4">即時bar生產量</div>
          <div ref={chartRef} style={{ width: "100%", height: "600px" }}></div>
        </div>
      </Modal.Body>
      {String(sideoption).includes("oven") && (
        <Modal.Body>
          <div className="d-grid p-20">
            <div className="text-center mb-4">即時bar生產量</div>
            <div
              ref={chartRef2}
              style={{ width: "100%", height: "600px" }}
            ></div>
          </div>
        </Modal.Body>
      )}

      <Modal.Footer className="justify-content-center">
        <Button variant="secondary" onClick={handleBack}>
          回主畫面
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default PopupAllInfo;
