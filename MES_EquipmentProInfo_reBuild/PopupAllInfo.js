// MixingSelection.js
// 引入 Material-UI Select 和 MenuItem
import { Select, MenuItem } from "@mui/material";
import React, { useState, useEffect, useRef } from "react";
import { Modal, Button } from "react-bootstrap";
import { Route } from "react-router-dom";
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
  Australia: "#00008b",
  Canada: "#f00",
  China: "#ffde00",
  Cuba: "#002a8f",
  Finland: "#003580",
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
let option;
let dimensions = [];

function PopupAllInfo({ show, onHide, mes_side, centered }) {
  const chartRef = useRef(null); // 创建 ref 来引用 DOM 元素
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(moment().locale("zh-tw"));
  const [chartresponse_amont, setchartresponse_amont] = useState([]); // api update page 資料
  const [sideoption, setSideoption] = useState(Object.values(mes_side));
  const [mes_source, setmes_source] = useState({});
  const [mes_series, setmes_series] = useState([]);
  const [count, setCount] = useState(0);
  const [scaledMax, setscaledMax] = useState(0);

  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    console.log("Popup show 狀態變化:", show);
  }, [show]);

  useEffect(() => {
    if (!sideoption) {
      setchartresponse_amont({});
      return;
    }

    setShowModal(show);
    let intervalId;
    let timeoutId;

    const fetch_MesAmount_AllData = async () => {
      // console.log("mes_side 透過pump 接收: " + sideoption);
      const check = show;

      console.log("check 一開始 狀態:" + typeof check + check);

      if (!check) {
        console.log("Not Open PopupAllInfo!");
        return;
      }

      try {
        const executeApiFunc = messide_match_callallapi(sideoption);

        if (!executeApiFunc) {
          console.warn("無符合的 API 函式");
          setchartresponse_amont({});
          return;
        }

        // console.log(
        //   "要執行的api name = " +
        //     String(executeApiFunc) +
        //     "今日日期 = " +
        //     startDate.format("YYYY-MM-DD")
        // );
        const dateStr = startDate.format("YYYY-MM-DD");
        const response = await executeApiFunc(dateStr); // <--- 傳"今日日期"參數給函式

        const source = Object.entries(response.data).map(
          ([machineName, value]) => ({
            [sideoption]: machineName,
            [dateStr]: value,
          })
        );

        // console.log(
        //   "回傳全部機台產能數據 :" + JSON.stringify(response.data, null, 2)
        // );

        if (Object.keys(response.data)?.length) {
          // console.log("API response (EdgeFolding):", response[0]);
          // console.log(
          //   "後端Object回傳資料量:" + Object.keys(response.data).length
          // );
          setmes_source(source);
          setchartresponse_amont(source);
        } else {
          setmes_source({});
          setchartresponse_amont({});
        }
      } catch (error) {
        console.error("call fetch_MesAmount_AllData API 錯誤:", error);
        setmes_source({});
        setchartresponse_amont({});
      }
    };

    fetch_MesAmount_AllData();
    setCount((prev) => prev + 1);

    // ⚠️ 只有在 show === true 才執行
    if (show) {
      timeoutId = setTimeout(() => {
        intervalId = setInterval(() => {
          fetch_MesAmount_AllData();
          setCount((prev) => prev + 1);
        }, 3000); //30秒刷新資料count
      }, 1000); //延遲 1 秒後才開始 30 秒輪詢
    }

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, sideoption]);

  // 取消按鈕的處理函數
  const handleBack = () => {
    onHide();
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
    }

    //...其他

    return null; // 沒有符合就回傳 null
  };

  useEffect(() => {
    const dateStr = startDate.format("YYYY-MM-DD"); // e.g. "2025-07-03"
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // console.log(
    //   "mes_source typdef = " +
    //     typeof mes_source +
    //     " e-chart機台提供數據重組為: ," +
    //     JSON.stringify(mes_source, null, 2)
    // );

    const sourceArray = Object.entries(mes_source).map(([stacking, value]) => ({
      stacking,
      [dateStr]: value,
    }));

    // console.log("sourceArray = " + JSON.stringify(sourceArray, null, 2));

    const validValues = sourceArray
      .map((item) => item[dateStr]?.[dateStr]) // 抽出數值，如 210、275
      .filter((v) => typeof v === "number" && !isNaN(v));

    //mes_source 是物件（如 { "疊片機台3": 120, "疊片機台4": 150, ... }）
    // const maxValue = Math.max(...Object.values(mes_source));
    const maxValue = Math.max(...validValues);
    console.log("maxValue = " + maxValue);
    const scaledMax = Math.ceil(maxValue * 2); // 或用 Math.round / Math.floor 看需求
    setscaledMax(scaledMax);

    // const mes_source_array = Object.entries(mes_source).map(
    //   ([machineName, value]) => ({
    //     [sideoption]: machineName,
    //     [dateStr]: value,
    //   })
    // );

    const series = Object.values(mes_source).map((item, index) => ({
      name: item[sideoption], // ✅ 動態取出欄位
      type: "bar",
      data: [item[dateStr]], // dateStr = "2025-07-03"
      // itemStyle: {
      //   color: barColors[index % barColors.length], // 循環使用顏色
      // },
      itemStyle: {
        color: getColorByIndex(index),
      },
      label: {
        show: true,
        position: "top",
        fontFamily: "monospace",
      },
    }));

    setmes_series(series);

    ReflashMesAmount_Chart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartresponse_amont, mes_source]);

  useEffect(() => {
    console.log("最終serial 組態為= " + JSON.stringify(mes_series, null, 2));

    console.log("scaledMax = " + scaledMax);
  }, [mes_series, scaledMax]);

  const ReflashMesAmount_Chart = async (e) => {
    let myChart;

    try {
      // 初始化图表
      myChart = echarts.init(chartRef.current, "dark");

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
          top: 100,
          bottom: 100,
          left: 150,
          right: 250,
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
          // },
          // formatter: function (param) {
          //   let htmlStr = "";
          //   for (let i = 0; i < param.length; i++) {
          //     const xName = param[i].name;
          //     const seriesName = param[i].seriesName;
          //     const value = param[i].value;
          //     const color = param[i].color;

          //     if (i === 0) {
          //       htmlStr += xName + "<br/>";
          //     }

          //     htmlStr += "<div>";

          //     htmlStr += '<div style="board:1px solid #FFEB3B"></div>';
          //     htmlStr += "年總累積量:" + value / 1000 + " 公噸(tonne)/單位";
          //     htmlStr += '<div style="board:1px solid #FFEB3B"></div>';
          //     htmlStr += "</div>";
          //   }
          //   return htmlStr;
          // },

          formatter: function (params, dataIndex) {
            // return (
            //   "<div>" +
            //   params[0].name +
            //   params[0].marker +
            //   params[0].seriesname +
            //   ":" +
            //   '<span style="color: #00B83F;">' +
            //   params[0].value +
            //   "</span>公斤/單位" +
            //   "</div>"
            // );
            return `<div>${params.seriesName}<br/> 日期:${params.name}<br/><b style="color:#930093">產能:${params.value}</div>`;
            // return `${params.series}`;
            // return (
            //   // "X: " +
            //   // params.data[0].toFixed(3) +
            //   // "<br />Y: " +
            //   "<br /> 年總累積量: " + params.series.data[dataIndex].toFixed(3)
            // );
          },
        },
        // dataset: {
        //   //鎖定mes站 及 日期
        //   // dimensions: ["product", "2015"],
        //   dimensions: [sideoption, startDate.format("YYYY-MM-DD")],
        //   source: mes_source,
        //   // { product: "Matcha Latte", 2015: 43.3 },
        //   // { product: "Milk Tea", 2015: 83.1 },
        //   // { product: "Cheese Cocoa", 2015: 86.4 },
        //   // { product: "Walnut Brownie", 2015: 72.4 },
        // },
        xAxis: {
          type: "category",
          data: [startDate.format("YYYY-MM-DD")], // 只有一個時間點分類
        },
        // dataset: {
        //   source: data.slice(1).filter(function (d) {
        //     return d[4] === startYear;
        //   }),
        // },

        yAxis: {
          type: "value",
          // data: ["A", "B", "C", "D", "E"],
          name: "產能量(Qty)",
          inverse: false,
          min: 0,
          max: scaledMax,
          axisLabel: {
            formatter: function (n) {
              return Math.round(n) + "";
            },
          },
          animationDuration: 200,
          animationDurationUpdate: 300,
        },
        // series: [
        //   {
        //     realtimeSort: true,
        //     seriesLayoutBy: "column",
        //     name: "年全項目累積總量",
        //     type: "bar",
        //     data: chartresponse_amont,
        //     itemStyle: {
        //       color: function (param) {
        //         return countryColors[param.value[0]] || "#5470c6";
        //       },
        //     },
        //     encode: {
        //       x: dimension,
        //       y: 5,
        //     },
        //     label: {
        //       show: true,
        //       precision: 2,
        //       position: "right",
        //       valueAnimation: true,
        //       fontFamily: "monospace",
        //     },
        //   },
        // ],
        series: mes_series,
        legend: {
          show: true,
        },
        // Disable init animation.
        animationDuration: 0,
        animationDurationUpdate: updateFrequency,
        animationEasing: "linear",
        animationEasingUpdate: "linear",
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

      // myChart.setOption(option);
      // for (let i = startIndex; i < years.length - 1; ++i) {
      //   (function (i) {
      //     setTimeout(function () {
      //       updateYear(years[i + 1]);
      //     }, (i - startIndex) * updateFrequency);
      //   })(i);
      // }
      // function updateYear(year) {
      //   let source = data.slice(1).filter(function (d) {
      //     return d[4] === year;
      //   });
      //   option.series[0].data = source;
      //   option.graphic.elements[0].style.text = year;
      //   myChart.setOption(option);
      // }

      option && myChart.setOption(option);
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

  return (
    <Modal
      show={show}
      onHide={onHide}
      backdrop="static"
      keyboard={false}
      centered={centered}
      size="xl"
      dialogClassName="zoomed-modal"
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
      <Modal.Footer className="justify-content-center">
        {/* <Button
          variant="primary"
          className="mr-2"
          onClick={() => console.log("確認疊片機總資訊")}
        >
          確認
        </Button> */}
        <Button variant="secondary" onClick={() => handleBack()}>
          回主畫面
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default PopupAllInfo;
