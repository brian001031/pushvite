/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-expressions */
import "./index.scss";
import "./MarqueeInput.scss";
import "./BlinkingIndicator.scss";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Card from "react-bootstrap/Card";
// import dayjs from "dayjs";
import config from "../../config";
import React, { useState, useEffect } from "react";
import moment from "moment";
import axios from "axios";
import {
  FaCheckCircle,
  FaExclamationCircle,
  FaMagento,
  FaMapMarker,
  FaTools,
} from "react-icons/fa";
import Table from "react-bootstrap/Table";
import CountdownTimer from "../../components/CountdownTimer";
import { useParams } from "react-router-dom";

//成功提示套件
import { toast } from "react-toastify";
import { PulseLoader } from "react-spinners";
import {
  mes_injection,
  mes_assembly,
  mes_stacking,
  mes_chemosynthesis,
  mes_capacity,
  mes_HR_TEMP_Aging,
  change_injection_realtimefield,
  change_injection2_realtimefield,
  change_assembly_realtimefield,
  change_stacking_realtimefield,
  temp_chemosANDcapacity_batchfield,
  change_chemosANDcapacity_batchfield,
  change_HRT_Aging_batchfield,
} from "../../mes_remak_data";
import { NULL } from "sass";

const MES_EquipmentProInfo = () => {
  const { optionkey } = useParams(); // 获取 :optionkey 参数
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [inputText, setinputText] = useState("");
  const [inputTexts, setinputTexts] = useState([]);
  const [currentTime, setcurrentTime] = useState("");
  const [date, setDate] = useState("");
  const [cardItems, setCardItems] = useState([]); // 保存所有時間項目
  const [memberName, setmemberName] = useState(""); //更新組件獲取的員工姓名
  const [precautions, setprecautions] = useState(""); //保存注意交班工作事項
  const [options, setOptions] = useState([]); //站台的下拉選項
  const [buttonClicked, setButtonClicked] = useState(null);
  const [editnum, seteditnum] = useState(0); //更新編號
  const [type, settype] = useState(""); //更新編號
  const [confirmdt, setconfirmdt] = useState([]); //保存確認日期時間
  const [confirmname, setconfirmname] = useState([]); //已經確認員工姓名
  const [Count, setCount] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [resetTimer, setResetTimer] = useState(false);
  const [dateTime, setDateTime] = useState(moment());
  const [WONOData, setWONOData] = useState("");

  //const textparam = "設備參數更新約10秒鐘左右！"; // 要顯示的字串
  // 正則表達式，匹配 % 開頭和結尾的所有字串
  const regex = /%([^%]+)%/;
  const updateseconds = 10;
  const animationrun_seconds = 5;
  const accumulation_seconds = (updateseconds + animationrun_seconds) / 2;
  const testdata_animation = "10950501";
  const aniLength = testdata_animation.length;
  const textparam = "設備參數更新約" + updateseconds.toString() + "秒鐘左右！"; // 要顯示的字串
  const textLength = textparam.length;
  const delayTime = 500; // 每次請求之間延遲  0.5秒
  const [Updateparam, setUpdateparam] = useState(" 等待計算...");
  const [Seconds, setSeconds] = useState(updateseconds);
  const [Se2conds, set2Seconds] = useState(0);
  const [eqipmentdata, setEqipmentData] = useState([]); //確認機器設備一開始DB資訊
  const [realtime_pfcc12, setrealtime_pfcc12] = useState([]); //即時realtime table 存放區
  const [batch_pfcc12, setbatch_pfcc12] = useState([]); // 即時batch table 存放區
  const [realtime_HTR_Aging, setrealtime_HTR_Aging] = useState([]); //即時realtime table 存放區
  const [batch_HTR_Aging, setbatch_HTR_Aging] = useState([]); // 即時batch table 存放區
  const [filteredData, setFilteredData] = useState([]);
  const [isday_night, setday_night] = useState(true); // true 為預設早班
  const [isdaynightshow, setdaynightshow] = useState(false); // false 為預設關閉班別畫面
  const [workGroup, setworkGroup] = useState(0);
  const [mergedArray, setMergedArray] = useState([]);
  const [mergedArray2, setMergedArray2] = useState([]);
  const [mergedArray3, setMergedArray3] = useState([]);
  const [mergedArray4, setMergedArray4] = useState([]);
  const [judgmentshift, setjudgmentshift] = useState("");
  const [machineoption, setmachineoption] = useState("");
  const [shiftinfo, setshiftinfo] = useState([]);
  const [shiftinfoHRT, setshiftinfoHRT] = useState([]);
  const [isclassA_shift, setclassA_shift] = useState(false); // false 為預設關閉A班別畫面
  const [isclassB_shift, setclassB_shift] = useState(false); // false 為預設關閉B班別畫面
  const [isweekday_shift, setweekday_shift] = useState(false); // false 為預設關閉常日班別畫面

  const [lightLoading, setlightLoading] = useState(0); //作業中指示燈loading

  const [ischeckinjection, setcheckinjection] = useState(false); // false 為預設關閉injection
  const [ischeckinjection_One, setcheckinjection_One] = useState(false); // false 為預設關閉injectionOne
  const [OpNumber, setOpNumber] = useState(0); //預設操作機台員工工號0
  const [injection_machnenum, setinjection_machnenum] = useState(0); //設定注液站選擇機台序號ID號碼
  const [stacking_machnenum, setstacking_machnenum] = useState(0); //設定疊片站選擇機台序號ID號碼

  // 用一個對象來管理所有的 isCheckAllMesMachine 狀態 (首頁機台選單)
  const [isCheckAllMesMachine, setisCheckAllMesMachine] = useState({
    is_assembly: false,
    is_injection: false,
    is_stacking: false,
    is_chemosynthesis: false,
    is_capacity: false,
    is_htaging: false,
    is_rtaging: false,
  });

  // 用一個對象來管理所有的 isCurrentprodcapacity 狀態 (目前產能狀態) 1:一期 2:二期
  const [isCurrentprodcapacity, setisCurrentprodcapacity] = useState({
    //入殼機
    is_rt_assembly: false,
    // 注液機(一,二期)
    is_rt_injection1: false,
    is_rt_injection2: false,
    // 疊片機(一期:編號 1 ~5 , 二期:編號 6 ~ 9)
    is_rt_stacking1: false,
    is_rt_stacking2: false,
    // 化成機(一,二期)
    is_rt_chemosynthesis_1: false,
    is_rt_chemosynthesis_2: false,
    // 分容機CC1(一,二期)
    is_rt_capacity_CC1_1: false,
    is_rt_capacity_CC1_2: false,
    // 分容機CC2(一,二期)
    is_rt_capacity_CC2_1: false,
    is_rt_capacity_CC2_2: false,
    //高溫機站
    is_rt_HT_Aging: false,
    // 常溫機站(一,二期)
    is_rt_RT_Aging_1: false,
    is_rt_RT_Aging_2: false,
  });

  let machine_remark = [];
  let save_option = 0;
  const numberOfLights = 2; // 調整燈的數量
  const numberOfStack = 9; // 調整疊片機台的數量

  function splitString(responseData) {
    // 假設響應數據格式為 "(abc|def)"
    // 去掉括號
    const trimmed = responseData.replace(/^\(|\)$/g, "");
    // 根據分隔符拆分字符串
    const [currentmp_qty, shiftgroup, shiftclassNanme] = trimmed.split("|");
    return { currentmp_qty, shiftgroup, shiftclassNanme };
  }

  const optionskeyArray = [
    "32sc",
    "coating",
    "injection",
    "assembly",
    "pack2",
    "stacking",
    "chemosynthesis",
    "capacity",
    "ht_aging",
    "rt_aging",
  ];
  const groupkeyword = ["A", "B"];
  const rest_group = "輪休中";

  const mes_stacking_oneperiod = "疊片機一期-";
  const mes_stacking_twoperiod = "疊片機二期-";

  const mes_chemosynthesis_oneperiod = "PF-化成機一期";
  const mes_chemosynthesis_twoperiod = "PF-化成機二期";

  const mes_capacity_CC1_oneperiod = "CC1-分容機一期";
  const mes_capacity_CC1_twoperiod = "CC1-分容機二期";
  const mes_capacity_CC2_oneperiod = "CC2-分容機一期";
  const mes_capacity_CC2_twoperiod = "CC2-分容機二期";

  const mes_HT_Aging_period = "高溫倉靜置";
  const mes_RT_Aging_period = "常溫倉靜置";

  const interpretation_shiftgroup = (str, keyword, qty) => {
    // const parts = str.split(new RegExp(`(${keyword})`, "gi")); // 分割字符串，並高亮關鍵字
    const parts = str.split(""); // 分割字符串，並高亮關鍵字

    //console.log("parts = " + parts);
    // eslint-disable-next-line array-callback-return

    // eslint-disable-next-line no-unused-expressions

    // eslint-disable-next-line no-unused-expressions
    return parts.map((part, index) => {
      parts[index] === keyword ? (
        <>
          <span style={Taskclass_Span}>●早班A:</span>
          <h2 class="tasklabeinfo">{"Qty: " + { qty } + " pcs"}</h2>
          <br />
        </>
      ) : (
        // <span key={index} style={{ backgroundColor: "yellow" }}>
        //   {part}
        // </span>
        { rest_group }
      );
    });
  };

  useEffect(() => {
    const FetchOptionKey = async () => {
      //console.log("已收到optionkey:" + optionkey);
      //擷取option 比對 再產生相對應機台編號(期數)名稱

      if (optionkey && optionskeyArray.includes(optionkey)) {
        // 注液站
        if (optionkey.toString().localeCompare("injection") === 0) {
          // save_option = mes_injection.map((item, index) => ({
          //   id: `option-${index + 1}`, // 使用索引生成唯一的 id
          //   label: item,
          // }));

          // setDynamicOptions((prevOptions) => [...prevOptions, save_option]);
          // setcheckinjection(true);

          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_injection: true, // 選擇的 is_injection 為 true
          }));

          //初始化機器編碼為0
          setinjection_machnenum(0);
          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_injection[0] + "出料自動寫入");
          }

          //----注液站end--------------------------------------------
        }
        // 入殼站
        else if (optionkey.toString().localeCompare("assembly") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_assembly: true, // 選擇的 is_assembly 為 true
          }));

          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_assembly[0]);
          }
        }
        // Z疊片站
        else if (optionkey.toString().localeCompare("stacking") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_stacking: true, // 選擇的 is_stacking 為 true
          }));

          //初始化機器編碼為0
          setinjection_machnenum(0);
          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_stacking[0]); //Stack1 疊片機第一期第一台
          }
        }
        //化成站
        else if (optionkey.toString().localeCompare("chemosynthesis") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_chemosynthesis: true, // 選擇的 is_chemosynthesis 為 true
          }));

          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_chemosynthesis[0]); //chemosynthesis 化成機第一期
          }
        }
        //分容站
        else if (optionkey.toString().localeCompare("capacity") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_capacity: true, // 選擇的 is_capacity 為 true
          }));

          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_capacity[0]); // CC1分容機第一期
          }
        }
        //高溫倉靜置站
        else if (optionkey.toString().localeCompare("ht_aging") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_htaging: true, // 選擇的 is_htaging 為 true
          }));

          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_HR_TEMP_Aging[0]); // 高溫倉一期
          }
        }
        //常溫倉靜置站
        else if (optionkey.toString().localeCompare("rt_aging") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_rtaging: true, // 選擇的 is_rtaging 為 true
          }));

          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_HR_TEMP_Aging[1]); // 常溫倉一期
          }
        }
      } else {
        //代表傳送的optionkey不在廠內目前規範,不執行MES戰情資料搜尋
      }
    };

    FetchOptionKey();
  }, [optionkey]);

  useEffect(() => {
    // console.log("Dynamic options updated:", save_option);
    //console.log("machineoption 目前選擇:", machineoption);
  }, [dynamicOptions, machineoption]); // 监听 dynamicOptions 的变化

  useEffect(() => {
    // 設置每秒更新一次時間
    const timer = setInterval(() => {
      setDateTime(moment());
      setlightLoading((prevIndex) => {
        const nextIndex = prevIndex + (1 % numberOfLights);
        return nextIndex < numberOfLights ? nextIndex : 0; // 循環回到第一個燈
      });
    }, 1000); // 每6小時执行一次(1000毫秒X21600)

    // 清除計時器
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (Seconds > 0) {
        setSeconds(Seconds - 1);

        //確認累積數量
        if (Seconds === Math.trunc(accumulation_seconds)) {
          //等待補向後台get API
          //........................
        }

        //顯示動態字串顯示一個字一個字顯示----start
        if (Seconds <= animationrun_seconds) {
          setUpdateparam(testdata_animation.slice(0, Se2conds)); // 更新顯示的文字
          set2Seconds(Se2conds + 1);

          if (Se2conds >= aniLength) {
            set2Seconds(0); // 如果顯示到結尾，重置索引
            setUpdateparam(testdata_animation);
          }
        } else {
          setUpdateparam(testdata_animation);
        }
        //顯示動態字串顯示一個字一個字顯示----end
      } else {
        //setSeconds(Seconds + 1);
        //window.location.reload(); // 重新載入頁面
        //HOW get data OUT of a Promise object
        //-------方法1: Using .then(): start-------
        // const PromiseResult = fetch(
        //   // `${config.apiBaseUrl}/equipment/updatepage`,
        //   "http://localhost:3009/equipment/updatepage"
        // );

        // PromiseResult.then((response) => response.json())
        //   .then((data) => {
        //     console.log(data[0]); // 取設備生產資訊此陣列即可,陣列位置為0
        //   })
        //   .catch((error) => {
        //     console.error("Error:", error);
        //   });
        //setSeconds(updateseconds);

        //-------方法1 結束---------------

        //-------方法2: Using async/await:  start-------
        const axios_equimentItems = async () => {
          try {
            const response = await axios.get(
              // `${config.apiBaseUrl}/equipment/updatepage`,
              "http://localhost:3009/equipment/updatepage",
              {
                params: {
                  machineoption: machineoption,
                },
              }
            );

            if (
              machineoption.includes("%023%") ||
              machineoption.includes("%010%") ||
              machineoption.includes("%017%") ||
              machineoption.includes("H%") ||
              machineoption.includes("N%") ||
              machineoption.includes("N2%")
            ) {
              const realtime_table = await response.data[0]; /// 取設備生產資訊此陣列即可,陣列位置為0
              const batch_table = await response.data[1];
              console.log("取得即時資料: ");
              console.log(realtime_table.realtable[0]);
              console.log("取得批次資料: ");
              console.log(batch_table.batchtable[0]);
              // console.log(Object.keys(realtime_table.realtable[0]).length);
              // console.log(Object.keys(batch_table.batchtable[0]).length);

              if (
                machineoption.includes("%023%") ||
                machineoption.includes("%010%") ||
                machineoption.includes("%017%")
              ) {
                //因化成分容站初期無realtime table,這邊以下做輔助應用,一次回傳兩個後續做merge結合畫面
                setrealtime_pfcc12(realtime_table.realtable[0]);
                setbatch_pfcc12(batch_table.batchtable[0]);
              } else {
                setrealtime_HTR_Aging(realtime_table.realtable[0]);
                setbatch_HTR_Aging(batch_table.batchtable[0]);
              }
            } else {
              const data = await response.data[0]; /// 取設備生產資訊此陣列即可,陣列位置為0
              // console.log(data.ID, data.MachineNO, data.MachineStatus);
              console.log(Object.keys(data).length);
              console.log(data);
              setEqipmentData(data);
            }

            setdaynightshow(true); //開啟班別畫面

            // for (let k = 0; k < Object.keys(data).length; k++) {
            //   if (
            //     k === 1 ||
            //     k === 2 ||
            //     (k >= 45 && k <= 57) ||
            //     k === 59 ||
            //     k === 60 ||
            //     (k >= 63 && k <= 86)
            //   )
            //     removeItemByIndex(k);
            // }

            // 過濾不需要的 key-value

            // const newFilteredData = data.map((item) => {
            //   // 使用 reduce 來過濾掉不需要的 key
            //   return Object.keys(item).reduce((acc, key) => {
            //     if (!eqipmentToRemove.includes(key)) {
            //       acc[key] = item[key]; // 只保留需要的 key
            //     }
            //     return acc;
            //   }, {});
            // });

            // setFilteredData(newFilteredData);
          } catch (error) {
            console.error("取得資料錯誤", error);
          }
        };
        axios_equimentItems();

        //重新計算更新機器設備時間
        setSeconds(updateseconds);
        //-------方法2 結束---------------
      }
    }, 1000); // 每秒更新

    return () => clearInterval(timer); // 清除計時器
  }, [Seconds]);

  //初期無系統realtime table,後續自己定義產生跟原先batch兩個table觸發走以下這段
  useEffect(() => {
    //確認有搜到後端回傳資料數據
    if (
      Object.keys(realtime_pfcc12).length > 0 &&
      Object.keys(batch_pfcc12).length > 0
    ) {
      let transformedArray_realtime, transformedArray_batch;

      //化成和分容站機台判斷以下
      if (machineoption.startsWith("%")) {
        //再依序判斷machineoption 字尾格式(ex: %_1 或 %_2 ...)
        const sub_Chemos_Cap_machine = machineoption.slice(
          1,
          machineoption.length - 3
        );

        //目前期別數字都是在ex: %0XX%_ 之後
        const key_period = machineoption.slice("%0XX%_".length);

        // 023是PF
        if (sub_Chemos_Cap_machine.indexOf("023") !== -1) {
          //一期
          if (parseInt(key_period) === 1) {
            setisCurrentprodcapacity((prevState) => ({
              ...prevState,
              is_rt_chemosynthesis_1: true, // 選擇的 is_rt_chemosynthesis_1 為 true
            }));

            console.log("PF一期切換鍵值!");
          } //二期
          else if (parseInt(key_period) === 2) {
            setisCurrentprodcapacity((prevState) => ({
              ...prevState,
              is_rt_chemosynthesis_2: true, // 選擇的 is_rt_chemosynthesis_2 為 true
            }));
            console.log("PF二期切換鍵值!");
          }
        }
        // CC1是010
        else if (sub_Chemos_Cap_machine.indexOf("010") !== -1) {
          //一期
          if (parseInt(key_period) === 1) {
            setisCurrentprodcapacity((prevState) => ({
              ...prevState,
              is_rt_capacity_CC1_1: true, // 選擇的 is_rt_capacity_CC1_1 為 true
            }));

            console.log("CC1一期切換鍵值!");
          } //二期
          else if (parseInt(key_period) === 2) {
            setisCurrentprodcapacity((prevState) => ({
              ...prevState,
              is_rt_capacity_CC1_2: true, // 選擇的 is_rt_capacity_CC1_2 為 true
            }));
            console.log("CC1二期切換鍵值!");
          }
        }
        // CC2是017
        else if (sub_Chemos_Cap_machine.indexOf("017") !== -1) {
          //一期
          if (parseInt(key_period) === 1) {
            setisCurrentprodcapacity((prevState) => ({
              ...prevState,
              is_rt_capacity_CC2_1: true, // 選擇的 is_rt_capacity_CC2_1 為 true
            }));

            console.log("CC2一期切換鍵值!");
          } //二期
          else if (parseInt(key_period) === 2) {
            setisCurrentprodcapacity((prevState) => ({
              ...prevState,
              is_rt_capacity_CC2_2: true, // 選擇的 is_rt_capacity_CC2_2 為 true
            }));
            console.log("CC2二期切換鍵值!");
          }
        }

        //取代 realtime key鍵值
        transformedArray_realtime = Object.keys(realtime_pfcc12)
          .map((key, index) => {
            return {
              [temp_chemosANDcapacity_batchfield[index]]: realtime_pfcc12[key],
            };
          })
          .filter((key, index) => {
            // 取出對象的值
            const value = Object.values(key)[0];
            //將原先日期及設備運作狀態移除,batchtable有提供這邊給予忽略
            return value !== null && index !== 0 && index !== 1 && index !== 5; // 過濾掉值為 null 的項目
          });

        //暫時設定顯示"尚未產出",之後正常後可註解掉-----start
        //  const update_filterData = Object.entries(realtime_pfcc12).map(
        //   ([key, value], index) => {
        //     // 疊片站WONO製令如果值是null，則修改顯示為尚未產生，否則保持原值
        //     if (index === 4 && (value === null || value === "")) {
        //       return [key, "尚未產生"]; // 可以根據需求修改為其他值
        //     }
        //     return [key, value]; // 保持原來的值
        //   }
        // );
        // const temporaryWONOValue = updatedWONOData[4];
        //-----end-------------------------------

        //取代 batchtable key鍵值
        transformedArray_batch = Object.keys(batch_pfcc12)
          .map((key, index) => {
            return {
              [change_chemosANDcapacity_batchfield[index]]: batch_pfcc12[key],
            };
          })
          .filter((key, index) => {
            // 取出對象的值
            const value = Object.values(key)[0];
            return value !== null; // 過濾掉值為 null 的項目
          });

        // console.log(transformedArray);
        //暫時因資料庫無OP號碼參考,先預先抓表單有成員作驗證
        // setOpNumber(parseInt("273"));
        setOpNumber(parseInt(realtime_pfcc12.OP));
      }

      //將轉換的數據資料存取後續觸發使用
      setMergedArray(transformedArray_realtime);
      setMergedArray2(transformedArray_batch);
    }
  }, [realtime_pfcc12, batch_pfcc12]); // 當 化成分容 data 改變時觸發

  useEffect(() => {
    //確認有搜到後端回傳資料數據
    if (
      Object.keys(realtime_HTR_Aging).length > 0 &&
      Object.keys(batch_HTR_Aging).length > 0
    ) {
      let transformed_HRT_realtime, transformed_HRT_batch;

      // H.T高 R.T常溫倉靜置站判斷以下
      if (machineoption.endsWith("%")) {
        //高溫倉
        if (machineoption.indexOf("H")) {
          setisCurrentprodcapacity((prevState) => ({
            ...prevState,
            is_rt_HT_Aging: true, // 選擇的 is_rt_HT_Aging 為 true
          }));

          console.log("高溫倉切換鍵值!");
        } //常溫倉
        else if (machineoption.indexOf("N")) {
          const two_period = /N2%$/;

          //一期
          if (!two_period.test(machineoption)) {
            setisCurrentprodcapacity((prevState) => ({
              ...prevState,
              is_rt_RT_Aging_1: true, // 選擇的 is_rt_RT_Aging_1 為 true
            }));

            console.log("常溫倉一期切換鍵值!");
          } //二期
          else {
            setisCurrentprodcapacity((prevState) => ({
              ...prevState,
              is_rt_RT_Aging_2: true, // 選擇的 is_rt_RT_Aging_2 為 true
            }));

            console.log("常溫倉二期切換鍵值!");
          }
        }

        //取代 realtime key鍵值
        transformed_HRT_realtime = Object.keys(realtime_HTR_Aging)
          .map((key, index) => {
            return {
              [temp_chemosANDcapacity_batchfield[index]]:
                realtime_HTR_Aging[key],
            };
          })
          .filter((key, index) => {
            // 取出對象的值
            const value = Object.values(key)[0];
            //將原先日期及設備運作狀態移除,batchtable有提供這邊給予忽略
            return value !== null && index !== 0 && index !== 1 && index !== 5; // 過濾掉值為 null 的項目
          });

        //取代 batchtable key鍵值
        transformed_HRT_batch = Object.keys(batch_HTR_Aging)
          .map((key, index) => {
            return {
              [change_HRT_Aging_batchfield[index]]: batch_HTR_Aging[key],
            };
          })
          .filter((key, index) => {
            // 取出對象的值
            const value = Object.values(key)[0];
            return (
              value !== null && index !== 10 && index !== 11 && index !== 17
            ); // 過濾掉值為 null 的項目
          });

        //暫時因資料庫無OP號碼參考,先預先抓表單有成員作驗證
        // setOpNumber(parseInt("273"));
        setOpNumber(parseInt(realtime_HTR_Aging.OP));
      }

      //將轉換的數據資料存取後續觸發使用
      setMergedArray(transformed_HRT_realtime);
      setMergedArray2(transformed_HRT_batch);
    }
  }, [realtime_HTR_Aging, batch_HTR_Aging]); // 當 高常溫靜置 data 改變時觸發

  useEffect(() => {
    // if (!mergedArray || typeof mergedArray !== "object") {
    //   return <div>mergedArray No data available</div>;
    // }

    // 當 eqipmentdata 更新時，進行合併
    if (Object.keys(eqipmentdata).length > 0) {
      let transformedArray;

      if (machineoption === "注液機出料自動寫入") {
        setisCurrentprodcapacity((prevState) => ({
          ...prevState,
          is_rt_injection1: true, // 選擇的 is_rt_injection1 為 true
        }));

        transformedArray = Object.keys(eqipmentdata)
          .map((key, index) => {
            return {
              [change_injection_realtimefield[index]]: eqipmentdata[key],
            };
          })
          .filter((item) => {
            // 取出對象的值
            const value = Object.values(item)[0];
            return value !== null; // 過濾掉值為 null 的項目
          });

        // setcheckinjection_One(true);
        setOpNumber(parseInt(eqipmentdata.PARAM39));

        //設定注液機確認查閱號碼
        setinjection_machnenum(1);

        console.log("注液機一期切換鍵值!");
      } else if (machineoption === "注液機二期出料自動寫入") {
        setisCurrentprodcapacity((prevState) => ({
          ...prevState,
          is_rt_injection2: true, // 選擇的 is_rt_injection2 為 true
        }));

        transformedArray = Object.keys(eqipmentdata)
          .map((key, index) => {
            return {
              [change_injection2_realtimefield[index]]: eqipmentdata[key],
            };
          })
          .filter((item) => {
            // 取出對象的值
            const value = Object.values(item)[0];
            return value !== null; // 過濾掉值為 null 的項目
          });
        // setcheckinjection_One(false);
        setOpNumber(parseInt(eqipmentdata.PARAMA02));
        //設定注液機確認查閱號碼
        setinjection_machnenum(2);
        // console.log("注液機二期目前產能為=" + eqipmentdata.PARAMB33);
        console.log("注液機二期切換鍵值!");
      } else if (machineoption === "自動組立機") {
        setisCurrentprodcapacity((prevState) => ({
          ...prevState,
          is_rt_assembly: true, // 選擇的 is_rt_assembly 為 true
        }));

        transformedArray = Object.keys(eqipmentdata)
          .map((key, index) => {
            return {
              [change_assembly_realtimefield[index]]: eqipmentdata[key],
            };
          })
          .filter((item) => {
            // 取出對象的值
            const value = Object.values(item)[0];
            return value !== null; // 過濾掉值為 null 的項目
          });
        setOpNumber(parseInt(eqipmentdata.OPNO));
        console.log("入殼自動組立機切換鍵值!");
      } else if (machineoption.includes("Stack")) {
        const sub_stackmachine = machineoption.slice("Stack".length);

        //疊片機1期 (Stack1~Stack5),疊片機2期( Stack5 之後....)
        for (let n = 0; n < numberOfStack; n++) {
          const stacknumber = parseInt(n + 1).toString();

          if (sub_stackmachine.matchAll(stacknumber)) {
            // console.log("選擇的疊片機台:Stack" + stacknumber);
            //疊片機一期
            if (n >= 0 && n <= 4) {
              setisCurrentprodcapacity((prevState) => ({
                ...prevState,
                is_rt_stacking1: true, // 選擇的 is_rt_stacking1 為 true
              }));
              console.log("疊片機一期切換鍵值!");
            } //疊片機二期
            else {
              setisCurrentprodcapacity((prevState) => ({
                ...prevState,
                is_rt_stacking2: true, // 選擇的 is_rt_stacking2 為 true
              }));
              console.log("疊片機二期切換鍵值!");
            }

            transformedArray = Object.keys(eqipmentdata)
              .map((key, index) => {
                return {
                  [change_stacking_realtimefield[index]]: eqipmentdata[key],
                };
              })
              .filter((key, index) => {
                // 取出對象的值
                const value = Object.values(key)[0];
                return value !== null; // 過濾掉值為 null 的項目
              });

            //暫時設定顯示"尚未產出",之後正常後可註解掉-----start
            const updatedWONOData = Object.entries(eqipmentdata).map(
              ([key, value], index) => {
                // 疊片站WONO製令如果值是null，則修改顯示為尚未產生，否則保持原值
                if (index === 4 && (value === null || value === "")) {
                  return [key, "尚未產生"]; // 可以根據需求修改為其他值
                }
                return [key, value]; // 保持原來的值
              }
            );
            const temporaryWONOValue = updatedWONOData[4];
            setWONOData(temporaryWONOValue[1]);
            //-----end-------------------------------
            //設定疊片機確認查閱號碼
            setstacking_machnenum(n + 1);
            setOpNumber(parseInt(eqipmentdata.OPNO));
            break;
          }
        }
        // setOpNumber(parseInt(eqipmentdata.OPNO));
        // console.log("疊片機切換鍵值!");

        // 合併物件轉換的陣列與外部陣列
        // const newMergedArray = dataAsArray.concat(initialeqipment);
        // console.log("切換鍵值:" + transformedArray);
      }

      //將轉換的數據資料存取後續觸發使用
      setMergedArray(transformedArray);
    }
  }, [eqipmentdata]); // 當 data 改變時觸發

  // 判斷目前為早班或晚班->   早班:當天日期full (08:01~20:00) /  晚班:當天日期(20:01~23:59) ~ 隔天日期(00:00~0800)
  // 目前用時分(H)做區分,mm 用原來minutes,ss 用原來seconds
  useEffect(() => {
    const nowhour = dateTime.format("H");
    const nowminutes = dateTime.minutes();
    const secondcheck = dateTime.seconds();

    if (nowhour >= 8 && nowhour <= 20) {
      //以上時段為早班
      //  20:00 整點之後屬於晚班
      if (parseInt(nowhour) === 20 && nowminutes >= 0 && secondcheck >= 0) {
        setjudgmentshift("晚班");
        setday_night(false);
      } else {
        setjudgmentshift("早班");
        setday_night(true);
      }
    } else if (
      //以下時段為晚班
      (nowhour > 20 && nowhour <= 23) ||
      (nowhour >= 0 && nowhour < 8)
    ) {
      setjudgmentshift("晚班");
      setday_night(false);
    }

    //後續透過公司工號查詢既有XLS 判斷目前此作業員是隸屬在哪個組別
    const search_equipment_workgroup = async () => {
      const equipmentID = parseInt(OpNumber);
      const shiftclass = judgmentshift;

      // console.log("現況機器操作工號 = " + equipmentID);
      try {
        //MSSQL微軟 走以下 API (目前站台:高常溫靜置)
        if (
          isCurrentprodcapacity.is_rt_HT_Aging ||
          isCurrentprodcapacity.is_rt_RT_Aging_1 ||
          isCurrentprodcapacity.is_rt_RT_Aging_2
        ) {
          const response = await axios.get(
            // `${config.apiBaseUrl}/equipment/groupname_capacitynum_for_MSSQL`,
            "http://localhost:3009/equipment/groupname_capacitynum_for_MSSQL",
            {
              params: {
                equipmentID: equipmentID,
                shiftclass: shiftclass,
                machineoption: machineoption,
              },
            }
          );

          const equipment_workdata = splitString(response.data);
          setshiftinfoHRT(equipment_workdata);

          // console.log("目前HRT生產量: " + shiftinfoHRT.currentmp_qty);
          // console.log("組別: " + shiftinfoHRT.shiftgroup);
          //區分組別(A或B)

          //已經擷取班別名稱並後續針對畫面做控制
        } //MYSQL SQL80走以下 API
        else {
          const response = await axios.get(
            // `${config.apiBaseUrl}/equipment/groupname_capacitynum`,
            "http://localhost:3009/equipment/groupname_capacitynum",
            {
              params: {
                equipmentID: equipmentID,
                shiftclass: shiftclass,
                machineoption: machineoption,
              },
            }
          );

          const equipment_workdata = splitString(response.data);
          setshiftinfo(equipment_workdata);

          console.log("目前生產量: " + shiftinfo.currentmp_qty);
          // console.log("組別: " + shiftinfo.shiftgroup);
          //區分組別(A或B)

          //已經擷取班別名稱並後續針對畫面做控制
        }
      } catch (error) {
        console.error("取得資料錯誤", error);
      }
    };

    search_equipment_workgroup();
  }, [
    eqipmentdata,
    realtime_pfcc12,
    batch_pfcc12,
    realtime_HTR_Aging,
    batch_HTR_Aging,
  ]); // 當早晚班時間改變時觸發,條件如上式函式

  useEffect(() => {
    function Classification() {
      let onlinegroup;

      if (
        isCurrentprodcapacity.is_rt_HT_Aging ||
        isCurrentprodcapacity.is_rt_RT_Aging_1 ||
        isCurrentprodcapacity.is_rt_RT_Aging_2
      ) {
        onlinegroup = shiftinfoHRT.shiftgroup;
      } else {
        onlinegroup = shiftinfo.shiftgroup;
      }

      console.log("onlinegroup ===== " + onlinegroup);

      // A組
      if (onlinegroup === groupkeyword[0] || onlinegroup === "新") {
        console.log("A組有進來!");
        setclassA_shift(true);
        setclassB_shift(false);

        //判斷常日班啟動與否,這邊預設歸類A組畫面顯示
        onlinegroup === "新" ? setweekday_shift(true) : setweekday_shift(false);
      } //B組
      else if (onlinegroup === groupkeyword[1]) {
        console.log("B組有進來!");
        console.log("");
        setclassA_shift(false);
        setclassB_shift(true);
        setweekday_shift(false);
      }
    }

    Classification();
  }, [shiftinfo, shiftinfoHRT]);

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const handleClick = (buttonId) => {
    setButtonClicked(buttonId);
  };

  const replaceKeyword = (text) => {
    let keyword;
    let replacement = ["化成PF", "分容CC1", "分容CC2", "常溫倉一", "常溫倉二"];
    let last_textment;

    if (text.indexOf("%023%") !== -1) {
      keyword = "%023%";
      last_textment = replacement[0].toString();
    } else if (text.indexOf("%010%") !== -1) {
      keyword = "%010%";
      last_textment = replacement[1].toString();
    } else if (text.indexOf("%017%") !== -1) {
      keyword = "%017%";
      last_textment = replacement[2].toString();
    } else if (text.indexOf("N%") !== -1) {
      keyword = "N%";
      last_textment = replacement[3].toString();
    } else if (text.indexOf("N2%") !== -1) {
      keyword = "N2%";
      last_textment = replacement[4].toString();
    } else {
      console.log("此字串:" + text + "不符合PF/CC/常溫倉站");
    }

    // 使用 replace 方法將 "React" 替換為 "React.js"
    return text.replace(new RegExp(keyword, "g"), last_textment);
  };

  const handleInputChange = (event) => {
    if (event.target.name === "input_id") {
      setinputText(event.target.value);
    } else if (event.target.name === "input_equipmentparam") {
      setprecautions(event.target.value);
    } else if (event.target.name === "machineschange") {
      setOptions(event.target.value);
      setmachineoption("");
      setmachineoption(event.target.value);
    }

    // const { name, value } = event.target;
    // setFormData((prevState) => ({
    //   ...prevState,
    //   [name]: value,
    // }));
  };

  useEffect(() => {
    // console.log("選擇為:", options);

    let machine_log = "";

    //如果是多台機(例如:超過2台以上),目前疊片佔有符合此狀況
    if (machineoption.includes("Stack")) {
      machine_log = "疊片機-" + options.toString();
    } else if (machineoption.includes("%0")) {
      machine_log = replaceKeyword(machineoption) + "期";
    } else if (machineoption.endsWith("%")) {
      machine_log = replaceKeyword(machineoption) + "期";
    } else {
      machine_log = options.toString().slice(0, options.length - 2);
    }

    const machine_log_check = machine_log === "" ? "首次全部" : machine_log;
    // setmachineoption(machine_log_check);

    toast.success(`切換檢視: ${machine_log_check}機台`);
  }, [options]); // 依赖项是 options，意味着每次 options 更新时都会触发该函数

  useEffect(() => {
    // handleAddinputText();
    if (buttonClicked !== null) {
      switch (buttonClicked) {
        case "confirmID":
          //handleAddinputText();
          break;
        case "saveexcel":
          // handleDumpExcellog();
          break;
        case "notifyline":
          // Notifyline_EquipmentProInfomsg();
          break;
        default:
          break;
      }
      // 清除或重置 buttonClicked，避免 effect 重複執行
      setButtonClicked(null);
    }
  }, [buttonClicked]);

  //顯示動態字串顯示有無切換顯示-----start
  // useEffect(() => {
  //   if (Seconds <= animationrun_seconds) {
  //     const anirun = setInterval(() => {
  //       if (Seconds % 2 === 0) {
  //         setUpdateparam(testdata_animation.slice(0, aniLength)); // 更新全顯示的文字
  //       } else {
  //         //  setUpdateparam("QTY: " + testdata_animation.slice(0, 0) + " PCS"); // 更新顯示的文字
  //         setUpdateparam(""); // 更新顯示的文字
  //       }
  //     }, 500); // 每500毫秒更新一次

  //     return () => clearInterval(anirun); // 清理 timer
  //   }
  // }, [Seconds]);
  //顯示動態字串顯示有無切換顯示-----end

  const removeItemByIndex = (index) => {
    const newInputs = [...eqipmentdata]; // 創建 inputs 的副本
    newInputs.splice(index, 1); // 刪除指定索引的項目
    setEqipmentData(newInputs); // 更新狀態
  };

  // 定义一个函数来发送 POST 请求
  async function sendPostRequest(data) {
    try {
      const response = await fetch(
        "http://localhost:3009/EquipmentProInfo/pushconfirm",
        // `${config.apiBaseUrl}/EquipmentProInfo/pushconfirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok && response.status !== 201) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }

      // 延遲到下一個請求
      await delay(delayTime);
      return response.status; // 处理响应数据
    } catch (error) {
      console.error(`Error fetching ${data}:`, error);
    }
  }

  const cleardisplayItems = (event) => {
    // 清空以下儲存內容數據
    setCardItems([]);
    setinputTexts([]);
    setconfirmdt([]);
    setCount(0);
    // setprecautions(event.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const promises = cardItems.map((item) => sendPostRequest(item));
      const results = await Promise.all(promises);

      //接收機制成功
      if (results.length >= 1 && results[results.length - 1] === 201) {
        // if (results.length > 1 && results[results.length - 1] !== 201) {
        //   throw new Error(`Network response was not ok`);
        // }
        // 這裡可以加上顯示成功訊息的邏輯，例如彈出提示框或顯示在畫面上
        // toast.success(results.JSON.message);
        cleardisplayItems();
        //toast.success("資料保存成功");
        // console.log("交接資料保存完畢");

        // 延遲到下一個請求
        await delay(delayTime * 2);
        //直接做log存檔於EquipmentProInfo.xls
      } else {
        toast.error("資料保存失敗");
        // console.log("保存失敗!回應狀態碼:");
      }

      setIsActive(true); // 激活倒计时器
      setResetTimer((prevReset) => !prevReset); // 切换重置状态以重新开始倒计时
    } catch (error) {
      console.error("Error uploading data:", error);
      toast.error("資料保存失敗");
      console.log("保存失敗!回應狀態碼:", error);
    }
  };

  const Device_Span = {
    fontWeight: "bold",
    color: "black",
    fontSize: "26px",
    textAlign: "center",
    display: "block",
    backgroundColor: "yellow",
  };

  const Taskclass_Span = {
    fontWeight: "bold",
    color: "white",
    fontSize: "20px",
    display: "block",
    backgroundColor: "#8F4586",
    paddingLeft: "5px",
    textAlign: "center",
  };

  return (
    <Form onSubmit={handleSubmit}>
      <div className="mes_equipmentinfo">
        <div className="header">
          {/* <fieldset>
            <legend>入榖站</legend>
            設備編號:Aa_0000
          </fieldset>
           */}

          <Form.Group>
            <Form.Label
              style={{
                fontSize: "35px", // 字型大小
                color: "#007bff", // 顏色
                textAlign: "center", // 位置
                display: "block", // 確保顯示在新行
                fontStyle: "bold",
              }}
            >
              機台生產進度(即時訊息):&emsp;
              {/* {"日期: " + moment().format("YYYY-MM-DD")} */}
              {"日期/時分: " + dateTime.format("YYYY-MM-DD HH:mm:ss")}
              {/* {"目前小時: " +
                dateTime.hours() +
                "目前分鐘: " +
                dateTime.minutes()} */}
            </Form.Label>

            <Form.Select
              name="machineschange"
              value={options}
              onChange={handleInputChange}
            >
              {/* <option value="手動選擇設備">-- 手動選擇設備 --</option>
              {/* 使用 map 动态生成 option */}
              {/* 注液站選單 */}
              {isCheckAllMesMachine.is_injection &&
                mes_injection.length > 0 &&
                mes_injection.map((item, index) => (
                  // <option key={item.id} value={item.label + "出料自動寫入"}>
                  <option key={index} value={item + "出料自動寫入"}>
                    {item}
                  </option>
                ))}
              {/* 入殼站選單 */}
              {isCheckAllMesMachine.is_assembly &&
                mes_assembly.length > 0 &&
                mes_assembly.map((item, index) => (
                  // <option key={item.id} value={item.label + "出料自動寫入"}>
                  <option key={index} value={item}>
                    {" "}
                    {/*自動組立機*/}
                    {item}
                  </option>
                ))}
              {/* 疊片站選單 */}
              {isCheckAllMesMachine.is_stacking &&
                mes_stacking.length > 0 &&
                mes_stacking.map((item, index) => (
                  // <option key={item.id} value={item.label + "出料自動寫入"}>
                  <option key={index} value={item}>
                    {index <= 4 && mes_stacking_oneperiod + parseInt(index + 1)}
                    {index > 4 && mes_stacking_twoperiod + parseInt(index + 1)}
                  </option>
                ))}

              {/* 化成站選單 */}
              {isCheckAllMesMachine.is_chemosynthesis &&
                mes_chemosynthesis.length > 0 &&
                mes_chemosynthesis.map((item, index) => (
                  // <option key={item.id} value={item.label + "出料自動寫入"}>
                  <option key={index} value={item}>
                    {index === 0 && mes_chemosynthesis_oneperiod}
                    {index === 1 && mes_chemosynthesis_twoperiod}
                  </option>
                ))}

              {/* 分容站選單 */}
              {isCheckAllMesMachine.is_capacity &&
                mes_capacity.length > 0 &&
                mes_capacity.map((item, index) => (
                  // <option key={item.id} value={item.label + "出料自動寫入"}>
                  <option key={index} value={item}>
                    {index === 0 && mes_capacity_CC1_oneperiod}
                    {index === 1 && mes_capacity_CC1_twoperiod}
                    {index === 2 && mes_capacity_CC2_oneperiod}
                    {index === 3 && mes_capacity_CC2_twoperiod}
                  </option>
                ))}

              {/* 高溫倉靜置站選單 */}
              {isCheckAllMesMachine.is_htaging &&
                mes_HR_TEMP_Aging.length > 0 &&
                mes_HR_TEMP_Aging.map((item, index) =>
                  index === 0 ? (
                    <option key={index} value={item}>
                      {mes_HT_Aging_period}
                    </option>
                  ) : null
                )}

              {/* 常溫倉靜置站選單 */}
              {isCheckAllMesMachine.is_rtaging &&
                mes_HR_TEMP_Aging.length > 0 &&
                mes_HR_TEMP_Aging.map((item, index) =>
                  index >= 1 ? (
                    <option key={index} value={item}>
                      {mes_RT_Aging_period + "-" + parseInt(index) + "期"}
                    </option>
                  ) : null
                )}
            </Form.Select>
          </Form.Group>
        </div>
        <div className="column">
          <div className="goal">
            <Card>
              <Card.Header className="custom-card-header">
                生產資訊標籤
              </Card.Header>
              <Card.Body>
                {
                  // <Card.Text>
                  //   機台架動率:90% <br />
                  //   良率:95% <br />
                  //   NG率:5%
                  // </Card.Text>
                  <Card.Text>
                    <span style={Device_Span}>●設備編號:</span>
                    <h2 class="titlelabeinfo">
                      {(isCheckAllMesMachine.is_chemosynthesis ||
                        isCheckAllMesMachine.is_capacity) &&
                      realtime_pfcc12.MachineNO !== undefined
                        ? realtime_pfcc12.MachineNO
                        : (isCheckAllMesMachine.is_htaging ||
                            isCheckAllMesMachine.is_rtaging) &&
                          realtime_HTR_Aging.MachineNO !== undefined
                        ? realtime_HTR_Aging.MachineNO
                        : eqipmentdata.MachineNO}
                    </h2>
                    <br />
                    <span style={Device_Span}>●目前狀態:</span>
                    <h2 class="titlelabeinfo">
                      {isCurrentprodcapacity.is_rt_assembly &&
                      eqipmentdata.MachineStatusCode === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_assembly ? (
                        <div>{eqipmentdata.MachineStatusCode} </div>
                      ) : isCurrentprodcapacity.is_rt_injection1 &&
                        eqipmentdata.MachineStatus === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_injection1 ? (
                        <div>{eqipmentdata.MachineStatus} </div>
                      ) : isCurrentprodcapacity.is_rt_injection2 &&
                        eqipmentdata.MachineStatus === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_injection2 ? (
                        <div>{eqipmentdata.MachineStatus} </div>
                      ) : isCurrentprodcapacity.is_rt_stacking1 &&
                        eqipmentdata.MachineStatusCode === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_stacking1 ? (
                        <div>{eqipmentdata.MachineStatusCode} </div>
                      ) : isCurrentprodcapacity.is_rt_stacking2 &&
                        eqipmentdata.MachineStatusCode === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_stacking2 ? (
                        <div>{eqipmentdata.MachineStatusCode} </div>
                      ) : // 化成機PF(一,二期)
                      isCurrentprodcapacity.is_rt_chemosynthesis_1 &&
                        realtime_pfcc12.MachineStatus === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_chemosynthesis_1 ? (
                        <div>{realtime_pfcc12.MachineStatus} </div>
                      ) : isCurrentprodcapacity.is_rt_chemosynthesis_2 &&
                        realtime_pfcc12.MachineStatus === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_chemosynthesis_2 ? (
                        <div>{realtime_pfcc12.MachineStatus} </div>
                      ) : // 分容機CC1(一,二期)
                      isCurrentprodcapacity.is_rt_capacity_CC1_1 &&
                        realtime_pfcc12.MachineStatus === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC1_1 ? (
                        <div>{realtime_pfcc12.MachineStatus} </div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC1_2 &&
                        realtime_pfcc12.MachineStatus === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC1_2 ? (
                        <div>{realtime_pfcc12.MachineStatus} </div>
                      ) : // 分容機CC2(一,二期)
                      isCurrentprodcapacity.is_rt_capacity_CC2_1 &&
                        realtime_pfcc12.MachineStatus === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC2_1 ? (
                        <div>{realtime_pfcc12.MachineStatus} </div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC2_2 &&
                        realtime_pfcc12.MachineStatus === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC2_2 ? (
                        <div>{realtime_pfcc12.MachineStatus} </div>
                      ) : isCurrentprodcapacity.is_rt_HT_Aging &&
                        realtime_HTR_Aging.MachineStatus === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_HT_Aging ? (
                        <div>{realtime_HTR_Aging.MachineStatus} </div>
                      ) : isCurrentprodcapacity.is_rt_RT_Aging_1 &&
                        realtime_HTR_Aging.MachineStatus === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_RT_Aging_1 ? (
                        <div>{realtime_HTR_Aging.MachineStatus} </div>
                      ) : isCurrentprodcapacity.is_rt_RT_Aging_2 &&
                        realtime_HTR_Aging.MachineStatus === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_RT_Aging_2 ? (
                        <div>{realtime_HTR_Aging.MachineStatus} </div>
                      ) : null}
                    </h2>
                    <br />
                    <span style={Device_Span}>●目前生產人員:</span>
                    <h2 class="titlelabeinfo">
                      {isCurrentprodcapacity.is_rt_assembly &&
                        "( " +
                          eqipmentdata.OPNO +
                          " " +
                          (shiftinfo.shiftclassNanme === undefined
                            ? "待切換"
                            : shiftinfo.shiftclassNanme) +
                          " )"}
                      {injection_machnenum === 1 &&
                        isCurrentprodcapacity.is_rt_injection1 &&
                        "( " +
                          eqipmentdata.PARAM39 +
                          " " +
                          (shiftinfo.shiftclassNanme === undefined
                            ? "待切換"
                            : shiftinfo.shiftclassNanme) +
                          " )"}
                      {injection_machnenum === 2 &&
                        isCurrentprodcapacity.is_rt_injection2 &&
                        "( " +
                          eqipmentdata.PARAMA02 +
                          " " +
                          (shiftinfo.shiftclassNanme === undefined
                            ? "待切換"
                            : shiftinfo.shiftclassNanme) +
                          " )"}
                      {stacking_machnenum >= 1 &&
                        stacking_machnenum <= 5 &&
                        isCurrentprodcapacity.is_rt_stacking1 &&
                        "( " +
                          eqipmentdata.OPNO +
                          " " +
                          (shiftinfo.shiftclassNanme === undefined
                            ? "待切換"
                            : shiftinfo.shiftclassNanme) +
                          " )"}
                      {stacking_machnenum >= 6 &&
                        stacking_machnenum <= parseInt(numberOfStack) &&
                        isCurrentprodcapacity.is_rt_stacking2 &&
                        "( " +
                          eqipmentdata.OPNO +
                          " " +
                          (shiftinfo.shiftclassNanme === undefined
                            ? "待切換"
                            : shiftinfo.shiftclassNanme) +
                          " )"}
                      {(isCurrentprodcapacity.is_rt_chemosynthesis_1 ||
                        isCurrentprodcapacity.is_rt_chemosynthesis_2 ||
                        isCurrentprodcapacity.is_rt_capacity_CC1_1 ||
                        isCurrentprodcapacity.is_rt_capacity_CC1_2 ||
                        isCurrentprodcapacity.is_rt_capacity_CC2_1 ||
                        isCurrentprodcapacity.is_rt_capacity_CC2_2) &&
                        "( " +
                          realtime_pfcc12.OP +
                          " " +
                          (shiftinfo.shiftclassNanme === undefined
                            ? "待切換"
                            : shiftinfo.shiftclassNanme) +
                          " )"}
                      {(isCurrentprodcapacity.is_rt_HT_Aging ||
                        isCurrentprodcapacity.is_rt_RT_Aging_1 ||
                        isCurrentprodcapacity.is_rt_RT_Aging_2) &&
                        "( " +
                          realtime_HTR_Aging.OP +
                          " " +
                          (shiftinfoHRT.shiftclassNanme === undefined
                            ? "待切換"
                            : shiftinfoHRT.shiftclassNanme) +
                          " )"}
                    </h2>
                    <br />
                    <span style={Device_Span}>●目前工單號:</span>
                    <h2 class="titlelabeinfo">
                      {isCurrentprodcapacity.is_rt_assembly &&
                      eqipmentdata.WONO === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_assembly ? (
                        <div>{eqipmentdata.WONO} </div>
                      ) : isCurrentprodcapacity.is_rt_injection1 &&
                        eqipmentdata.WO === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_injection1 ? (
                        <div>{eqipmentdata.WO} </div>
                      ) : isCurrentprodcapacity.is_rt_injection2 &&
                        eqipmentdata.WO === undefined ? (
                        <div>查詢中...</div>
                      ) : isCurrentprodcapacity.is_rt_injection2 ? (
                        <div>{eqipmentdata.WO} </div>
                      ) : isCurrentprodcapacity.is_rt_stacking1 &&
                        WONOData !== "" ? (
                        <div>{WONOData} </div>
                      ) : isCurrentprodcapacity.is_rt_stacking1 &&
                        eqipmentdata.WONO === undefined ? (
                        <div>查詢中... </div>
                      ) : isCurrentprodcapacity.is_rt_stacking1 ? (
                        <div>{eqipmentdata.WONO} </div>
                      ) : isCurrentprodcapacity.is_rt_stacking2 &&
                        eqipmentdata.WONO === undefined ? (
                        <div>查詢中... </div>
                      ) : isCurrentprodcapacity.is_rt_stacking2 ? (
                        <div>{eqipmentdata.WONO}</div>
                      ) : isCurrentprodcapacity.is_rt_chemosynthesis_1 ||
                        isCurrentprodcapacity.is_rt_chemosynthesis_2 ||
                        isCurrentprodcapacity.is_rt_capacity_CC1_1 ||
                        isCurrentprodcapacity.is_rt_capacity_CC1_2 ||
                        isCurrentprodcapacity.is_rt_capacity_CC2_1 ||
                        isCurrentprodcapacity.is_rt_capacity_CC2_2 ? (
                        <div>{realtime_pfcc12.WO}</div>
                      ) : isCurrentprodcapacity.is_rt_HT_Aging ||
                        isCurrentprodcapacity.is_rt_RT_Aging_1 ||
                        isCurrentprodcapacity.is_rt_RT_Aging_2 ? (
                        <div>{realtime_HTR_Aging.WO}</div>
                      ) : null}
                    </h2>
                    <br />
                    <span style={Device_Span}>●目前產能:</span>
                    <h2 class="titlelabeinfo">
                      {/* {ischeckinjection_One === true
                        ? eqipmentdata.PARAM42 === undefined
                          ? "等待數據回傳..."
                          : "Qty: " + eqipmentdata.PARAM42 + " PCS"
                        : eqipmentdata.PARAMB33 === undefined
                        ? "等待數據回傳..."
                        : "Qty: " + eqipmentdata.PARAMB33 + " PCS"} */}

                      {/*入殼站, 注液站一二期機台, 疊片站一二期機台*/}
                      {isCurrentprodcapacity.is_rt_assembly &&
                      eqipmentdata.REMARK === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : isCurrentprodcapacity.is_rt_assembly ? (
                        <div>Qty: {eqipmentdata.REMARK} PCS</div>
                      ) : injection_machnenum === 1 &&
                        isCurrentprodcapacity.is_rt_injection1 &&
                        eqipmentdata.PARAM42 === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : injection_machnenum === 1 &&
                        isCurrentprodcapacity.is_rt_injection1 ? (
                        <div>Qty: {eqipmentdata.PARAM42} PCS</div>
                      ) : injection_machnenum === 2 &&
                        isCurrentprodcapacity.is_rt_injection2 &&
                        eqipmentdata.PARAMB33 === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : injection_machnenum === 2 &&
                        isCurrentprodcapacity.is_rt_injection2 ? (
                        <div>Qty: {eqipmentdata.PARAMB33} PCS</div>
                      ) : stacking_machnenum >= 1 &&
                        stacking_machnenum <= 5 &&
                        isCurrentprodcapacity.is_rt_stacking1 ? (
                        <div>Qty: {eqipmentdata.PLCErrorCode} PCS</div>
                      ) : stacking_machnenum >= 6 &&
                        stacking_machnenum <= parseInt(numberOfStack) &&
                        isCurrentprodcapacity.is_rt_stacking2 ? (
                        <div>Qty: {eqipmentdata.PLCErrorCode} PCS</div>
                      ) : // 化成機PF(一,二期)
                      isCurrentprodcapacity.is_rt_chemosynthesis_1 &&
                        batch_pfcc12.ErrorCode === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : isCurrentprodcapacity.is_rt_chemosynthesis_1 ? (
                        <div>Qty: {batch_pfcc12.ErrorCode} PCS </div>
                      ) : isCurrentprodcapacity.is_rt_chemosynthesis_2 &&
                        batch_pfcc12.ErrorCode === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : isCurrentprodcapacity.is_rt_chemosynthesis_2 ? (
                        <div>Qty: {batch_pfcc12.ErrorCode} PCS </div>
                      ) : // 分容機CC1(一,二期)
                      isCurrentprodcapacity.is_rt_capacity_CC1_1 &&
                        batch_pfcc12.ErrorCode === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC1_1 ? (
                        <div>Qty: {batch_pfcc12.ErrorCode} PCS </div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC1_2 &&
                        batch_pfcc12.ErrorCode === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC1_2 ? (
                        <div>Qty: {batch_pfcc12.ErrorCode} PCS </div>
                      ) : // 分容機CC2(一,二期)
                      isCurrentprodcapacity.is_rt_capacity_CC2_1 &&
                        batch_pfcc12.ErrorCode === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC2_1 ? (
                        <div>Qty: {batch_pfcc12.ErrorCode} PCS </div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC2_2 &&
                        batch_pfcc12.ErrorCode === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : isCurrentprodcapacity.is_rt_capacity_CC2_2 ? (
                        <div>Qty: {batch_pfcc12.ErrorCode} PCS </div>
                      ) : // 高溫靜置站
                      isCurrentprodcapacity.is_rt_HT_Aging &&
                        batch_HTR_Aging.CREATE_TYPE === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : isCurrentprodcapacity.is_rt_HT_Aging ? (
                        <div>Qty: {batch_HTR_Aging.CREATE_TYPE} PCS </div>
                      ) : // 常溫靜置站(一,二期)
                      isCurrentprodcapacity.is_rt_RT_Aging_1 &&
                        batch_HTR_Aging.CREATE_TYPE === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : isCurrentprodcapacity.is_rt_RT_Aging_1 ? (
                        <div>Qty: {batch_HTR_Aging.CREATE_TYPE} PCS </div>
                      ) : isCurrentprodcapacity.is_rt_RT_Aging_2 &&
                        batch_HTR_Aging.CREATE_TYPE === undefined ? (
                        <div>等待數據回傳...</div>
                      ) : isCurrentprodcapacity.is_rt_RT_Aging_2 ? (
                        <div>Qty: {batch_HTR_Aging.CREATE_TYPE} PCS </div>
                      ) : null}
                    </h2>
                    <br />
                    {isdaynightshow && (
                      <>
                        {isday_night && isclassA_shift && (
                          <>
                            <span style={Taskclass_Span}>
                              {isweekday_shift
                                ? "●常日班-生產中"
                                : "●早班A-生產中:"}
                              {/* <PulseLoader
                                className="custom-blink"
                                color={"#9AFF02"}
                                loading={true}
                              /> */}
                              <div
                                className={`light ${
                                  lightLoading > 0 ? "active" : ""
                                }`}
                              />
                            </span>
                            <h2 class="tasklabeinfo">
                              {isCurrentprodcapacity.is_rt_HT_Aging ||
                              isCurrentprodcapacity.is_rt_RT_Aging_1 ||
                              isCurrentprodcapacity.is_rt_RT_Aging_2 ? (
                                <div>
                                  Qty: {shiftinfoHRT.currentmp_qty} PCS{" "}
                                </div>
                              ) : (
                                <div>Qty: {shiftinfo.currentmp_qty} PCS </div>
                              )}
                            </h2>
                            <br />
                            {/* {interpretation_shiftgroup(
                              shiftinfo.shiftgroup.toString(),
                              groupkeyword[0],
                              shiftinfo.currentmp_qty
                            )} */}
                          </>
                        )}
                        {!isday_night && isclassA_shift && (
                          <>
                            <span style={Taskclass_Span}>
                              ●晚班A-生產中:
                              {/* <PulseLoader
                                className="custom-blink"
                                color={"#9AFF02"}
                                loading={true}
                              /> */}
                              <div
                                className={`light ${
                                  lightLoading > 0 ? "active" : ""
                                }`}
                              />
                            </span>
                            <h2 class="tasklabeinfo">
                              {isCurrentprodcapacity.is_rt_HT_Aging ||
                              isCurrentprodcapacity.is_rt_RT_Aging_1 ||
                              isCurrentprodcapacity.is_rt_RT_Aging_2 ? (
                                <div>
                                  Qty: {shiftinfoHRT.currentmp_qty} PCS{" "}
                                </div>
                              ) : (
                                <div>Qty: {shiftinfo.currentmp_qty} PCS </div>
                              )}
                            </h2>
                            <br />
                          </>
                        )}
                        {isday_night && isclassB_shift && (
                          <>
                            <span style={Taskclass_Span}>
                              ●早班B-生產中:
                              {/* <PulseLoader
                                className="custom-blink"
                                color={"#9AFF02"}
                                loading={true}
                              /> */}
                              <div
                                className={`light ${
                                  lightLoading > 0 ? "active" : ""
                                }`}
                              />
                            </span>
                            <h2 class="tasklabeinfo">
                              {isCurrentprodcapacity.is_rt_HT_Aging ||
                              isCurrentprodcapacity.is_rt_RT_Aging_1 ||
                              isCurrentprodcapacity.is_rt_RT_Aging_2 ? (
                                <div>
                                  Qty: {shiftinfoHRT.currentmp_qty} PCS{" "}
                                </div>
                              ) : (
                                <div>Qty: {shiftinfo.currentmp_qty} PCS </div>
                              )}
                            </h2>
                            <br />
                          </>
                        )}
                        {!isday_night && isclassB_shift && (
                          <>
                            <span style={Taskclass_Span}>
                              ●晚班B-生產中:
                              {/* <PulseLoader
                                className="custom-blink"
                                color={"#9AFF02"}
                                loading={true}
                              /> */}
                              <div
                                className={`light ${
                                  lightLoading > 0 ? "active" : ""
                                }`}
                              />
                            </span>
                            <h2 class="tasklabeinfo">
                              {isCurrentprodcapacity.is_rt_HT_Aging ||
                              isCurrentprodcapacity.is_rt_RT_Aging_1 ||
                              isCurrentprodcapacity.is_rt_RT_Aging_2 ? (
                                <div>
                                  Qty: {shiftinfoHRT.currentmp_qty} PCS{" "}
                                </div>
                              ) : (
                                <div>Qty: {shiftinfo.currentmp_qty} PCS </div>
                              )}
                            </h2>
                            <br />
                          </>
                        )}
                      </>
                    )}
                    <span style={Device_Span}>●累積產能:</span>
                    <h2 class="titlelabeinfo">QTY: {Updateparam} PCS</h2>
                    <br />
                    <span style={Device_Span}>●設備維護員:</span>
                    <h2 class="titlelabeinfo">{"OP2"}</h2>
                  </Card.Text>
                }
              </Card.Body>
            </Card>
          </div>
          <div className="goal">
            {/* <Card>
              <Card.Header style={{ backgroundColor: "red", color: "white" }}>
                注意事項
              </Card.Header>
              <Card.Body>
                <Card.Text></Card.Text>
              </Card.Body>
            </Card> */}
            <Card style={{ width: "500px" }}>
              <Card.Header className="custom-card-param">
                設備生產參數
              </Card.Header>
              <Card.Body>
                {/* <div class="form-group ">
                  <textarea
                    class="form-control"
                    id="runtext"
                    name="input_runtext"
                    rows={1}
                    // style={{ width: "100%", resize: "none", direction: "rtl" }} // 右到左顯示
                    style={{ width: "100%", resize: "none" }} // 左到右顯示
                    value={Updateparam}
                  ></textarea>
                </div> */}

                <div className="marquee-container">
                  <textarea
                    value={textparam}
                    readOnly
                    rows={1}
                    className="marquee-text"
                    style={{
                      width: "250px",
                      textAlign: "center",
                      backgroundColor: "#B7FF4A",
                    }}
                  />
                </div>

                <br />

                {/*當使用新batchtable走下面這段顯示,(目前PF,CC,H.T,R.T)*/}
                {(isCheckAllMesMachine.is_chemosynthesis ||
                  isCheckAllMesMachine.is_capacity ||
                  isCheckAllMesMachine.is_htaging ||
                  isCheckAllMesMachine.is_rtaging) &&
                  Object.entries(mergedArray2).map(([key, value], index) => (
                    // {mergedArray.map((key, input) => (
                    <div class="form-group custom-notice">
                      <textarea
                        class="form-control eqmentparam-textarea"
                        id="equipmentparam"
                        name="input_equipmentparam"
                        // placeholder="待更新"
                        value={(JSON.stringify(key), JSON.stringify(value))}
                        readOnly
                        style={{ cursor: "text" }} // 可選取時顯示文本游標
                      ></textarea>
                    </div>
                  ))}

                {/*通用全部都會走這段 */}
                {Object.entries(mergedArray).map(([key, value], index) => (
                  // {mergedArray.map((key, input) => (
                  <div class="form-group custom-notice">
                    <textarea
                      class="form-control eqmentparam-textarea"
                      id="equipmentparam"
                      name="input_equipmentparam"
                      // placeholder="待更新"
                      value={(JSON.stringify(key), JSON.stringify(value))}
                      readOnly
                      style={{ cursor: "text" }} // 可選取時顯示文本游標
                    ></textarea>
                  </div>
                ))}
              </Card.Body>
            </Card>
          </div>
          <div className="nameList">
            <Card>
              <Card.Header></Card.Header>
              <Card.Body>
                <Card.Text>
                  1.短期目標:
                  <br /> <br /> <br /> <br />
                  2.長期目標:
                  <br />
                </Card.Text>
              </Card.Body>
            </Card>
            <Card>
              <Card.Header className="custom-card-detial">
                細節分頁進入
              </Card.Header>
              <Card.Body>
                <br />
                <div align="center">
                  <Button
                    className="button1"
                    style={{ verticalAlign: "middle" }}
                  >
                    <span>例行性保養介面</span>
                  </Button>
                  <br />
                  <Button
                    className="button2"
                    style={{ verticalAlign: "middle" }}
                  >
                    <span>耗材更換紀錄</span>
                  </Button>
                  <br />
                  <Button
                    className="button3"
                    style={{ verticalAlign: "middle" }}
                  >
                    <span>檢點表</span>
                  </Button>
                  <br />
                  <Button
                    className="button4"
                    style={{ verticalAlign: "middle" }}
                  >
                    <span>異常紀錄</span>
                  </Button>
                  <br />
                  <Button
                    className="button5"
                    style={{ verticalAlign: "middle" }}
                  >
                    <span>SOP、SIP、教學影片</span>
                  </Button>
                  <br />
                  {/* <CountdownTimer isActive={isActive} resetTimer={resetTimer} /> */}
                </div>

                <div align="right" className="countdown">
                  {/* <CountdownTimer initialSeconds={10}/>{"秒再重新確認"} */}
                </div>
              </Card.Body>
            </Card>
          </div>
        </div>
      </div>
    </Form>
  );
};

export default MES_EquipmentProInfo;
