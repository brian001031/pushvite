// MixingSelection.js
// 引入 Material-UI Select 和 MenuItem
import { Select, MenuItem } from "@mui/material";
import React, { useState, useEffect, useRef, useCallback } from "react";
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
  const [sideoption, setSideoption] = useState("");
  const [mes_source, setmes_source] = useState({});
  const [mes_series, setmes_series] = useState([]);
  const [count, setCount] = useState(0);
  const [scaledMax, setscaledMax] = useState(0);

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
      setchartresponse_amont({});
      setmes_series([]);
      setscaledMax(0);
      setCount(0);
      // 重置 sideoption 避免殘留
      setSideoption("");
    }
  }, [mes_side, show]); // 添加 show 依賴

  const fetch_MesAmount_AllData = useCallback(async () => {
    console.log("check 一開始 狀態:" + typeof show + show);

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

      const source = Object.entries(response.data).map(
        ([machineName, value]) => ({
          [sideoption]: machineName,
          [dateStr]: value,
        })
      );

      if (Object.keys(response.data)?.length) {
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
      if (chartRef.current) {
        try {
          const chartInstance = echarts.getInstanceByDom(chartRef.current);
          if (chartInstance && !chartInstance.isDisposed()) {
            chartInstance.dispose();
          }
        } catch (error) {
          console.warn("組件卸載時清理圖表發生錯誤:", error);
        }
      }
    };
  }, [show, sideoption]); // 移除 fetch_MesAmount_AllData 依賴

  // 取消按鈕的處理函數
  const handleBack = () => {
    console.log("handleBack 被調用 - 開始清理");

    // 清理所有狀態
    setmes_source({});
    setchartresponse_amont({});
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

    console.log("handleBack 清理完成 - 調用 onHide");
    // 讓 React-Bootstrap 處理所有 Modal 狀態管理
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
    }

    // 其他情況
    console.warn("未匹配到任何 API 函式，請檢查 sideoption:", sideoption);
    // 如果沒有符合的條件，返回 null

    return null; // 沒有符合就回傳 null
  };

  useEffect(() => {
    // // 只有在有資料且 Modal 是開啟狀態時才更新圖表
    // if (!show || !sideoption || Object.keys(mes_source).length === 0) {
    //   return;
    // }

    const dateStr = startDate.format("YYYY-MM-DD"); // e.g. "2025-07-03"

    const sourceArray = Object.entries(mes_source).map(([stacking, value]) => ({
      stacking,
      [dateStr]: value,
    }));

    const validValues = sourceArray
      .map((item) => {
        const val = item[dateStr]?.[dateStr];
        return val != null ? Number(val) : NaN;
      })
      .filter((v) => !isNaN(v));

    const maxValue = Math.max(...validValues);
    console.log("maxValue = " + maxValue);
    const scaledMax = Math.ceil(maxValue * 1.1); // 或用 Math.round / Math.floor 看需求
    setscaledMax(scaledMax);

    const series = Object.values(mes_source).map((item, index) => ({
      name: item[sideoption], // ✅ 動態取出欄位
      type: "bar",
      data: [item[dateStr]], // dateStr = "2025-07-03"
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
    }));

    setmes_series(series);

    // 使用 setTimeout 來避免頻繁更新
    const timeoutId = setTimeout(() => {
      ReflashMesAmount_Chart();
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [chartresponse_amont, mes_source, sideoption]);

  useEffect(() => {
    console.log("最終serial 組態為= " + JSON.stringify(mes_series, null, 2));

    console.log("scaledMax = " + scaledMax);
  }, [mes_series, scaledMax]);

  const ReflashMesAmount_Chart = async (e) => {
    if (!chartRef.current) return;

    let myChart;

    try {
      // 檢查是否已經存在圖表實例，避免重複創建
      myChart = echarts.getInstanceByDom(chartRef.current);

      // 如果不存在，則創建新實例
      if (!myChart) {
        myChart = echarts.init(chartRef.current, "dark");
      }

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
            return `<div>${params.seriesName}<br/> 日期:${params.name}<br/><b style="color:#930093">產能:${params.value}</div>`;
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
          axisLabel: {
            formatter: function (n) {
              return Math.round(n) + "";
            },
          },
          animationDuration: 200,
          animationDurationUpdate: 300,
        },

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
      onHide={handleBack}
      keyboard={false}
      centered={centered}
      size="xl"
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
        <Button variant="secondary" onClick={handleBack}>
          回主畫面
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default PopupAllInfo;
