/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-expressions */
import "./index.scss";
import "./MarqueeInput.scss";
import "./BlinkingIndicator.scss";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Card from "react-bootstrap/Card";
import dayjs from "dayjs";
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
import { FormattedMessage, IntlProvider, FormattedDate } from "react-intl";
import { PulseLoader } from "react-spinners";
import {
  mes_injection,
  mes_assembly,
  mes_stacking,
  mes_chemosynthesis,
  mes_capacity,
  mes_HR_TEMP_Aging,
  mes_Cutting_Cathode,
  mes_Cutting_Anode,
  mes_edge,
  mes_oven,
  mes_coating_all,
  mes_sulting,
  change_injection_realtimefield,
  change_injection2_realtimefield,
  change_assembly_realtimefield,
  //新增入殼assembly分三區塊---start-----------
  group_assembly_fields,
  //---end-----------
  change_stacking_realtimefield,
  temp_chemosANDcapacity_batchfield,
  change_chemosANDcapacity_batchfield,
  change_HRT_Aging_batchfield,
  change_Cutting_Cathode_field,
  change_Cutting_Anode_field,
  change_edge_field,
  change_oven_field,
  //新增真空烘箱oven分兩區塊---start-----------
  group_oven_fields,
  //---end-----------
  //
  // //塗佈分類  -- start
  group_coating_realtime_c, // 正極塗佈
  group_coating_realtime_a, // 負極塗佈
  //塗佈分類  -- end
  change_sulting_fields,
  group_sulting_fields,
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
  const [group_items, setgroup_items] = useState([]); // 保存所有MES站區分群組項目資訊
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
  const [textParamfront, setTextParamfront] = useState("");
  const [textParambackend, setTextParambackend] = useState("");
  const [startaccumuladate, setStartAccumulaDate] = useState(
    dayjs().format("YYYY-MM-DDTHH:mm")
  );

  const [culstartdate, setculStartDate] = useState(""); //選取累積產能的起始日期
  //const textparam = "設備參數更新約10秒鐘左右！"; // 要顯示的字串
  // 正則表達式，匹配 % 開頭和結尾的所有字串
  const regex = /%([^%]+)%/;
  const updateseconds = 10;
  const animationrun_seconds = 5;
  const accumulation_seconds = (updateseconds + animationrun_seconds) / 2;
  const testdata_animation = "等待計算...";
  const aniLength = testdata_animation.length;
  // const textparam = "設備參數更新約" + updateseconds.toString() + "秒鐘左右！"; // 要顯示的字串
  const textparam = updateseconds.toString(); // 要顯示的更新秒數
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
  const [batch_edge, setbatch_edge] = useState([]); // 即時batch table 存放區

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
  const [stacking_machnenum, setstacking_machnenum] = useState(0); //設定疊片站選擇機台序號ID號碼\
  const [cutting_machine_cathanode, setcutting_machine_cathanode] =
    useState(""); //設定五金模切站選擇正負極判斷

  const [previousData, setPreviousData] = useState({});
  const [highlightedItems, setHighlightedItems] = useState(new Set());

  //reponse key 取得值, 這邊為手動設定值
  const [inputValues, setInputValues] = useState({});

  //這邊for 疊片站預設選一期第三台
  const [selectedStacking, setSelectedStacking] = useState("");

  //這邊運用為JSON設定檔修改及讀取
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  //設定語系狀態
  const languages = [
    { code: "cn-mes", label: "中文(繁)" },
    { code: "en-mes", label: "English" },
    { code: "jp-mes", label: "日本語" },
  ];
  const [lang, setLang] = useState("cn");
  const [locale, setLocale] = useState(null);
  const LOCAL_STORAGE_KEY = "manual_input_settings";
  const STORAGE_KEY_PREFIX = "manual_input_settings_";

  const normalizeKey = (str) => str.replace(/\s*-->\s*$/, "").trim();

  // 用一個對象來管理所有的 isCheckAllMesMachine 狀態 (首頁機台選單)
  const [isCheckAllMesMachine, setisCheckAllMesMachine] = useState({
    is_assembly: false,
    is_injection: false,
    is_stacking: false,
    is_chemosynthesis: false,
    is_capacity: false,
    is_htaging: false,
    is_rtaging: false,
    is_cuttingcathode: false,
    is_cuttinganode: false,
    is_edgefolding: false,
    is_oven: false,
    is_coating_c: false,
    is_coating_a: false,
    is_sulting: false,
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
    //正極五金模切
    is_cutting_cathode: false,
    //負極五金模切
    is_cuttting_anode: false,
    // 精封站
    is_edge_folding_01: false,
    is_edge_folding_02: false,
    //電芯-大烘箱/極片-小烘箱)
    is_oven_cellbaking: false,
    //正極塗佈
    is_coating_realtime_c_01: false,
    //負極塗佈
    is_coating_realtime_a_01: false,
    //分選判別
    is_sulting_cc2: false,
  });

  let machine_remark = [];
  let save_option = 0;
  const numberOfLights = 2; // 調整燈的數量
  const numberOfStack = 9; // 調整疊片機台的數量

  function isNumeric(value) {
    return !isNaN(value) && isFinite(value);
  }

  function OpenStack_CheckList_pdf(side_option) {
    let view_pdf_Url;

    if (side_option.toString().includes(optionskeyArray[0])) {
      //   "32sc",
      // view_pdf_Url = process.env.;
    } else if (side_option.toString().includes(optionskeyArray[1])) {
      //   "coating",
      view_pdf_Url = process.env.REACT_APP_Anode_coating_CL;
    } else if (side_option.toString().includes(optionskeyArray[2])) {
      //   "injection",
      view_pdf_Url = process.env.REACT_APP_Filling_station; //
    } else if (side_option.toString().includes(optionskeyArray[3])) {
      //   "assembly",
      view_pdf_Url = process.env.REACT_APP_Assembly_station;
    } else if (side_option.toString().includes(optionskeyArray[4])) {
      //   "pack2",
      // view_pdf_Url = process.env.; //
    } else if (side_option.toString().includes(optionskeyArray[5])) {
      //   "stacking",
      view_pdf_Url = process.env.REACT_APP_Stacking_station_CL;
    } else if (side_option.toString().includes(optionskeyArray[6])) {
      //   "chemosynthesis",
      view_pdf_Url = process.env.REACT_APP_Formation; //
    } else if (side_option.toString().includes(optionskeyArray[7])) {
      //   "capacity",
      view_pdf_Url = process.env.REACT_APP_Capacity_Check;
    } else if (side_option.toString().includes(optionskeyArray[8])) {
      //   "ht_aging",
      view_pdf_Url = process.env.REACT_APP_H.T._Aging; //
    } else if (side_option.toString().includes(optionskeyArray[9])) {
      //   "rt_aging",
      view_pdf_Url = process.env.REACT_APP_R.T._Aging;
    } else if (side_option.toString().includes(optionskeyArray[10])) {
      //   "cutting_cathode",
      view_pdf_Url = process.env.REACT_APP_Cathode_Molding_cutting__CL; //
    } else if (side_option.toString().includes(optionskeyArray[11])) {
      //   "cutting_anode",
      view_pdf_Url = process.env.REACT_APP_Anode_Molding_cutting__CL;
    } else if (side_option.toString().includes(optionskeyArray[12])) {
      //   "edgeFolding",
      view_pdf_Url = process.env.REACT_APP_Edge_Folding; //
    } else if (side_option.toString().includes(optionskeyArray[13])) {
      //   "oven",
      view_pdf_Url = process.env.REACT_APP_Oven_station; //
    } else if (side_option.toString().includes(optionskeyArray[14])) {
      //   "mixingCathode",
      view_pdf_Url = process.env.REACT_APP_Mixer_Cathode_CL; //
    } else if (side_option.toString().includes(optionskeyArray[15])) {
      //   "mixingAnode",
      view_pdf_Url = process.env.REACT_APP_Anode_Mixer_CL; //
    } else if (side_option.toString().includes(optionskeyArray[16])) {
      //   "sulting",
      view_pdf_Url = process.env.REACT_APP_Sulting_station; //
    }
    // } else if (side_option.toString().includes(optionskeyArray[17])) {
    //   view_pdf_Url = process.env.; //
    // } else if (side_option.toString().includes(optionskeyArray[18])) {
    //   view_pdf_Url = process.env.; //
    // } else if (side_option.toString().includes(optionskeyArray[19])) {
    //   view_pdf_Url = process.env.; //
    // }

    if (!view_pdf_Url) {
      console.error(`找不到 PDF:  ${view_pdf_Url}  路徑，請檢查 .env 設定。`);
      return;
    }

    console.log(
      "目前PDF要執行的站點為:" + side_option + "開啟pdf檔名為:" + view_pdf_Url
    );

    window.open(view_pdf_Url, "_blank"); // 在新分頁開啟
  }

  function splitString(responseData) {
    // 假設響應數據格式為 "(abc|def)"
    // 去掉括號
    const trimmed = responseData.replace(/^\(|\)$/g, "");
    // 根據分隔符拆分字符串
    const [currentmp_qty, shiftgroup, shiftclassNanme, totalaccumulation_qty] =
      trimmed.split("|");

    // 後端資料對應
    // makeproduce_num +
    // "|" +
    // searchclass.toString() +
    // "|" +
    // searchclassname.toString() +
    // "|" +
    // makeproduce_accumulation_num;

    console.log("currentmp_qty:", currentmp_qty);
    console.log("shiftgroup:", shiftgroup);
    console.log("shiftclassNanme:", shiftclassNanme);
    console.log("totalaccumulation_qty:", totalaccumulation_qty);

    return {
      currentmp_qty,
      shiftgroup,
      shiftclassNanme,
      totalaccumulation_qty,
    };
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
    "cutting_cathode",
    "cutting_anode",
    "edgeFolding",
    "oven",
    "mixingCathode",
    "mixingAnode",
    "sulting",
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

  const mes_cutting_Cathode_site = "正極五金模切";
  const mes_cutting_Anode_site = "負極五金模切";

  const mes_product_status = ["良品", "不良品", "報廢品"];

  let side_field_group;

  //累積總產量數字長度宣告
  let accmountnumHRT_lengrh, accmountnum_lengrh;

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

  const AllowDisplaySubKey = (subKey) => {
    const excludeKeywords = [
      "操作人員工號-->",
      "總生產數量-->",
      "站辨識碼-->",
      "ID",
      "最新工作序號 -->",
      "工作序號-->",
      "站辨識碼-->",
      "最新工作序號-->",
      "站辨識碼-->",
      "放捲速度-->",
      "放捲直徑-->",
      "全生產線總長-->",
      "總生產件數-->",
      "操作機台OP工號-->",
      "本日產能-->",
      "生產總量-->",
      "電池序號-->",
      "製令-->",
      "人員編號-->",
      "PLC偵錯碼-->",
      "設備運作狀態-->",
      "封裝後重量-->",
      "異常電芯序號-->",
      "packedWeight9_CE-->",
    ];

    return !excludeKeywords.some((keyword) => subKey.includes(keyword));
  };

  function getStorageKey(station) {
    return `manual_input_settings_${station}`;
  }

  // 存取設定取用JSON 各站title名稱
  const MesJson_SideTitle = (() => {
    if (optionkey === "injection") return "";
    if (optionkey === "assembly") return "group_assembly_fields";
    if (optionkey === "stacking") return "change_stacking_realtimefield";
    if (optionkey === "oven") return "group_oven_fields";
    if (optionkey === "sulting") return "group_sulting_fields";
    return "";
  })();

  useEffect(() => {
    const Key_Storage_Machine = STORAGE_KEY_PREFIX + optionkey;

    // localStorage.removeItem(Key_Storage_Machine);
    const saved = localStorage.getItem(Key_Storage_Machine);

    console.log("save typedef = " + typeof saved);
    // eslint-disable-next-line valid-typeof
    if (saved !== null) {
      console.log("Loaded from localStorage");
      setSettings(JSON.parse(saved));
      setLoading(false);
    } else {
      console.log("Fetching from server...");
      //這邊用optionkey 判斷站別mesXXX.json名稱
      if (optionkey.toString().localeCompare("injection") === 0) {
        //無group
        side_field_group = "";
      } else if (optionkey.toString().localeCompare("assembly") === 0) {
        //有group代表目前有
        side_field_group = "group_assembly_fields";
      } else if (optionkey.toString().localeCompare("stacking") === 0) {
        //無group
        side_field_group = "change_stacking_realtimefield";
      } else if (optionkey.toString().localeCompare("oven") === 0) {
        //有group
        side_field_group = "group_oven_fields";
      } else if (optionkey.toString().localeCompare("sulting") === 0) {
        //有group
        side_field_group = "group_sulting_fields";
      }

      const fetchSettings = async () => {
        try {
          const res = await fetch(
           // `http://localhost:3009/equipment/mes_manual_settings?section=${side_field_group}`
             `${config.apiBaseUrl}/equipment/mes_manual_settings?section=${side_field_group}`
          );
          if (!res.ok) throw new Error("載入設定失敗");
          const data = await res.json();
          console.log("手動設定值接收為:" + JSON.stringify(data, null, 2));
          //setSettings(data);

          // 根據是否為 group 結構，轉換 inputValues
          let groupedInput = {};

          // const isGrouped = Object.values(data).every(
          //   (val) => typeof val === "object" && !Array.isArray(val)
          // );
          const isGrouped = Object.values(data).some(
            (val) =>
              typeof val === "object" &&
              val !== null &&
              !Array.isArray(val) &&
              Object.values(val).every(
                (v) => typeof v === "string" || typeof v === "number"
              )
          );

          if (isGrouped) {
            // 是群組：像 { "區塊名稱": { "欄位": "值" } }
            // 資料為群組結構
            Object.entries(data).forEach(([groupName, groupFields]) => {
              groupedInput[groupName] = {};
              Object.entries(groupFields).forEach(([field, value]) => {
                groupedInput[groupName][field] = value;
              });
            });
          } else {
            // 非群組：直接就是 { "欄位": "值" }
            // 單層結構，塞到 default group（可命名為 "default" 或其他）

            const cleaned = {};
            Object.entries(data).forEach(([key, val]) => {
              cleaned[normalizeKey(key)] = val;
            });
            groupedInput[side_field_group] = cleaned;

            // groupedInput[side_field_group] = { ...data };
          }

          console.log("✅ groupedInput before setSettings:", groupedInput);

          //將手動設定值直接存入即將渲染空間區
          setSettings(groupedInput);
          setInputValues(groupedInput);
        } catch (err) {
          console.error("❌ Fetch failed", err);
        } finally {
          setLoading(false);
        }
      };

      fetchSettings();
    }
  }, []);

  useEffect(() => {
    // console.log(
    //   "setSettings 被觸發，最新設定為:",
    //   JSON.stringify(settings, null, 2)
    // );
    //console.log("settings[side_field_group]:", settings?.[side_field_group]);
    console.log("📦 settings keys =", Object.keys(settings || {}));
  }, [settings]);

  //更新目前手動設定
  const update_manual_settings = (
    inputValues,
    originalSettings,
    mation_option
  ) => {
    const updated = JSON.parse(JSON.stringify(originalSettings));

    // console.log("mation_option目前設定為= " + mation_option);
    // console.log("group_items 長度= " + group_items.length);

    //有group 區分
    if (group_items.length > 0) {
      Object.entries(inputValues).forEach(([key, value]) => {
        if (typeof value === "object" && value !== null) {
          //入殼站擷取
          if (mes_assembly.includes(mation_option) && updated[key]) {
            console.log("有分區group,目前為入殼站處理中");
            Object.entries(value).forEach(([subKey, subVal]) => {
              if (subKey in updated[key]) {
                updated[key][subKey] = subVal;
              }
            });
          } //真空烘箱擷取
          else if (mes_oven.includes(mation_option) && updated[key]) {
            console.log("有分區group,目前為真空烘箱處理中");
            Object.entries(value).forEach(([subKey, subVal]) => {
              if (subKey in updated[key]) {
                updated[key][subKey] = subVal;
              }
            });
          } //分選判別擷取
          else if (mes_sulting.includes(mation_option) && updated[key]) {
            console.log("有分區group,目前為分選判別處理中");
            Object.entries(value).forEach(([subKey, subVal]) => {
              if (subKey in updated[key]) {
                updated[key][subKey] = subVal;
              }
            });
          }
        }
      });
    } //無 group
    else {
      // Object.entries(inputValues).forEach(([key, value]) => {
      //   //疊片站擷取
      //   if (mes_stacking.includes(mation_option) && key in updated) {
      //     console.log("無group,目前為疊片站處理中");
      //     updated[key] = value;
      //   }
      // });

      // 假設 inputValues 本身就含有 group，例如 change_stacking_realtimefield
      //把整個小設定物件寫進了自己內部，變成錯誤巢狀結構。
      if (
        mes_stacking.includes(mation_option) &&
        inputValues.change_stacking_realtimefield &&
        updated.change_stacking_realtimefield
      ) {
        console.log("無group,目前為疊片站處理中");

        Object.entries(inputValues.change_stacking_realtimefield).forEach(
          ([key, value]) => {
            if (key in updated.change_stacking_realtimefield) {
              updated.change_stacking_realtimefield[key] = value;
            }
          }
        );
      }
    }

    return updated;
  };

  const handleSaveInput = () => {
    //取得有改變設定的值欄位
    const changed = getChangedValues(inputValues, settings);

    if (Object.keys(changed).length === 0) {
      toast.info("⚠️ 沒有變更的內容需要儲存");
      return;
    }

    // 更新 localStorage
    const updated = update_manual_settings(
      inputValues,
      settings,
      machineoption
    );
    //localStorage.setItem("manual_input_settings", JSON.stringify(updated));
    localStorage.setItem(getStorageKey(optionkey), JSON.stringify(updated));
    setSettings(updated);

    // console.log("儲存setting machineoption = " + machineoption);
    // console.log("改變setting value = " + changed);

    // 傳送差異資料到後端
    fetch(
      //"http://localhost:3009/equipment/save_settings",
      `${config.apiBaseUrl}/equipment/save_settings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machinefield: machineoption,
          changedValues: changed,
        }),
      }
    )
      .then(async (res) => {
        const data = await res.json();
        //後端回傳前端 為 res.status(210).json({ updated: true });
        if (res.status === 210 && data.updated) {
          toast.success("✅ 參數設定已儲存！");
        } else {
          console.log("狀態碼:", res.status);
          console.log("回傳資料:", data);
          toast.warning("⚠️ 後端回應異常，請確認設定是否正確");
        }
      })
      .catch((err) => {
        // console.error(" 儲存失敗", err);
        toast.error(" 儲存失敗，請稍後再試");
      });
  };

  const getChangedValues = (newVals, oldVals) => {
    const changed = {};
    const isGrouped =
      typeof Object.values(newVals)[0] === "object" && newVals !== null;

    //有group組態
    if (isGrouped) {
      Object.entries(newVals).forEach(([group, fields]) => {
        Object.entries(fields).forEach(([field, newVal]) => {
          const oldVal = oldVals?.[group]?.[field] ?? "";

          //當新輸入值與舊設定不一致
          if (newVal !== oldVal) {
            if (!changed[group]) changed[group] = {};
            changed[group][field] = newVal;
          }
        });
      });
    } else {
      // 處理無 group 的情況
      Object.entries(newVals).forEach(([field, newVal]) => {
        const oldVal = oldVals?.[field] ?? "";

        if (newVal !== oldVal) {
          changed[field] = newVal;
        }
      });
    }

    return changed;
  };

  // 工具函數：比對兩 JSON 的差異（簡易差異比較）
  const getDifference = (original, modified) => {
    try {
      const originalObj = JSON.parse(original);
      const modifiedObj = JSON.parse(modified);
      const diff = {};

      for (const key in originalObj) {
        if (originalObj[key] !== modifiedObj[key]) {
          diff[key] = {
            before: originalObj[key],
            after: modifiedObj[key],
          };
        }
      }

      return JSON.stringify(diff, null, 2);
    } catch (error) {
      return "格式錯誤或非 JSON";
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const resp = await fetch(`/lang/${lang}.json`);

        if (!resp.ok) {
          throw new Error(`Failed to fetch current select ${lang}.json!`);
        }
        const data = await resp.json(); // 正確的解析 json
        // console.log("目前切換語系為: " + JSON.stringify(data));
        setLocale(data); // 設置 locale
      } catch (error) {
        console.error("Error loading language file:", error);
      }
    };
    fetchData();
  }, [lang]);

  useEffect(() => {
    const fetchParam = async () => {
      try {
        console.log("有觸發: = " + textParamfront, textParambackend);
      } catch (error) {
        console.error("Error ", error);
      }
    };
    fetchParam();
  }, [textParamfront, textParambackend]);

  useEffect(() => {
    const FetchOptionKey = async () => {
      console.log("已收到optionkey:" + optionkey);
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
            setmachineoption(mes_stacking[2]); //Stack3 疊片機第一期第三台
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
        //正極五金模切站
        else if (optionkey.toString().localeCompare("cutting_cathode") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_cuttingcathode: true, // 選擇的 is_cuttingcathode 為 true
          }));

          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_Cutting_Cathode[0]); // 正極五金模切自動機器
          }
        }
        //負極五金模切站
        else if (optionkey?.toString().localeCompare("cutting_anode") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_cuttinganode: true, // 選擇的 is_cuttinganode 為 true
          }));

          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_Cutting_Anode[0]); // 負極五金模切自動機器
          }
        }
        //精封站
        else if (optionkey?.toString().localeCompare("edgeFolding") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_edgefolding: true, // 選擇的 is_edgefolding 為 true
          }));

          const machine_log = options.toString();
          console.log("machine_log = " + machine_log);

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_edge[0]); // 精封一期預設
          }
        } // 真空烤箱站
        else if (optionkey.toString().localeCompare("oven") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_oven: true, // 選擇的 is_oven 為 true
          }));

          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_oven[0]); // 真空烤箱預設第一筆選單
          }
        }
        //+正極塗佈coating_c
        else if (optionkey.toString().localeCompare("mixingCathode") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_coating_c: true, // 選擇的 is_coating_c 為 true
          }));

          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_coating_all[0]); // +正極塗佈預設第一筆選單
          }
        }
        //-負極塗佈coating_a
        else if (optionkey.toString().localeCompare("mixingAnode") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_coating_a: true, // 選擇的 is_coating_a 為 true
          }));

          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_coating_all[1]); // -負極塗佈預設第二筆選單
          }
        } //分選判別sulting
        else if (optionkey.toString().localeCompare("sulting") === 0) {
          setisCheckAllMesMachine((prevState) => ({
            ...prevState,
            is_sulting: true, // 選擇的 is_sulting 為 true
          }));

          const machine_log = options.toString();

          //這邊判斷當首次登入頁面將預設option第一個當顯示----start
          if (machine_log === "" || machine_log === undefined) {
            setmachineoption(mes_sulting[0]); // 分選判別預設第一筆選單
          }
        }
      } else {
        //代表傳送的optionkey不在廠內目前規範,不執行MES戰情資料搜尋
        console.log("optionkey 不在廠內目前規範,不執行MES戰情資料搜尋");
      }
    };

    FetchOptionKey();
  }, [optionkey]);

  // useEffect(() => {
  //   if (isCheckAllMesMachine.is_stacking && mes_stacking.length >= 3) {
  //     setSelectedStacking(mes_stacking[2]); // Stack3預設選中
  //   }
  // }, [isCheckAllMesMachine.is_stacking, mes_stacking]);

  useEffect(() => {
    // console.log("Dynamic options updated:", save_option);
    //console.log("machineoption 目前選擇:", machineoption);
    // eslint-disable-next-line no-const-assign
    const getdate_day = dayjs(startaccumuladate)
      .format("YYYY-MM-DD")
      .toString();
    // console.log("startaccumuladate 目前選擇日期時間:" + getdate_day);

    setculStartDate(getdate_day);
  }, [dynamicOptions, machineoption, startaccumuladate]); // 监听 dynamicOptions 的变化

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
          if (
            shiftinfoHRT.totalaccumulation_qty === undefined &&
            shiftinfo.totalaccumulation_qty === undefined
          ) {
            setUpdateparam(testdata_animation.slice(0, Se2conds)); // 更新顯示的文字 用預設值
          } else {
            //這裡判斷是高常溫站(MSSQL) 或是 其他站 (MYSQL)
            //高常溫站(MSSQL)
            if (
              shiftinfoHRT.totalaccumulation_qty &&
              shiftinfo.totalaccumulation_qty === undefined
            ) {
              accmountnumHRT_lengrh = shiftinfoHRT.totalaccumulation_qty.length;
              const accmountqty_mssql = shiftinfoHRT.totalaccumulation_qty;
              // console.log(
              //   "高常溫站(MSSQL)累積產量目前已經切換 = " +
              //     parseInt(shiftinfoHRT.totalaccumulation_qty) +
              //     "-" +
              //     parseInt(accmountqty_mssql)
              // );
              setUpdateparam(accmountqty_mssql.slice(0, Se2conds)); // 更新顯示的文字 用計算值
            } //其他站 (MYSQL)
            else if (
              shiftinfoHRT.totalaccumulation_qty === undefined &&
              shiftinfo.totalaccumulation_qty
            ) {
              accmountnum_lengrh = shiftinfo.totalaccumulation_qty.length;
              const accmountqty_mysql = shiftinfo.totalaccumulation_qty;
              // console.log(
              //   "入殼疊注PFCC站(MYSQL)累積產量目前已經切換 = " +
              //     parseInt(shiftinfo.totalaccumulation_qty) +
              //     "-" +
              //     parseInt(accmountqty_mysql)
              // );
              setUpdateparam(accmountqty_mysql.slice(0, Se2conds)); // 更新顯示的文字 用計算值
            }
          }

          set2Seconds(Se2conds + 1);

          if (
            (shiftinfoHRT.totalaccumulation_qty === "" ||
              shiftinfo.totalaccumulation_qty === "") &&
            Se2conds >= aniLength
          ) {
            //預設
            set2Seconds(0); // 如果顯示到結尾，重置索引
            setUpdateparam(testdata_animation);
          } else if (
            shiftinfoHRT.totalaccumulation_qty !== "" &&
            Se2conds >= accmountnumHRT_lengrh
          ) {
            //高常溫站(MSSQL)
            set2Seconds(0); // 如果顯示到結尾，重置索引
            setUpdateparam(shiftinfoHRT.totalaccumulation_qty);
          } else if (
            shiftinfo.totalaccumulation_qty !== "" &&
            Se2conds >= accmountnum_lengrh
          ) {
            //其他站 (MYSQL)
            set2Seconds(0); // 如果顯示到結尾，重置索引
            setUpdateparam(shiftinfo.totalaccumulation_qty);
          }
        } else {
          shiftinfoHRT.totalaccumulation_qty === "" ||
          shiftinfo.totalaccumulation_qty === ""
            ? setUpdateparam(testdata_animation)
            : shiftinfo.totalaccumulation_qty
            ? setUpdateparam(shiftinfo.totalaccumulation_qty) // 其他各站
            : setUpdateparam(shiftinfoHRT.totalaccumulation_qty); // 高常溫靜置站
        }
        //顯示動態字串顯示一個字一個字顯示----end
      } else {
        //setSeconds(Seconds + 1);
        //window.location.reload(); // 重新載入頁面
        //HOW get data OUT of a Promise object
        //-------方法1: Using .then(): start-------
        // const urldeloy = new URL(`${config.apiBaseUrl}/equipment/updatepage`);
        // urldeloy.searchParams.append("machineoption", machineoption);

        // const urlloacl = new URL("http://localhost:3009/equipment/updatepage");
        // urlloacl.searchParams.append("machineoption", machineoption);

        // const PromiseResult = fetch(
        //   // urldeloy,
        //   urlloacl
        // );

        // PromiseResult.then((response) => response.json())
        //   .then((data) => {
        //     console.log(data[0]); // 取設備生產資訊此陣列即可,陣列位置為0
        //   })
        //   .catch((error) => {
        //     console.error("Error:", error);
        //   });
        // setSeconds(updateseconds);

        //-------方法1 結束---------------

        //-------方法2: Using async/await:  start-------
        const axios_equimentItems = async () => {
          try {
            // const encodedMachineOption = encodeURIComponent(machineoption);

            const response = await axios.get(
              `${config.apiBaseUrl}/equipment/updatepage`,
              //"http://localhost:3009/equipment/updatepage",
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
              // console.log("取得即時資料: ");
              // console.log(realtime_table.realtable[0]);
              // console.log("取得批次資料: ");
              // console.log(batch_table.batchtable[0]);
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
                //高常溫靜置站一樣沒有realtime table,這邊以下做輔助應用,一次回傳兩個後續做merge結合畫面
                setrealtime_HTR_Aging(realtime_table.realtable[0]);
                setbatch_HTR_Aging(batch_table.batchtable[0]);
              }
            } else {
              const data = await response.data[0]; /// 取設備生產資訊此陣列即可,陣列位置為0

              // console.log(data.ID, data.MachineNO, data.MachineStatus);
              console.log(Object?.keys(data).length);
              console.log("data回傳為:" + JSON.stringify(data));
              setEqipmentData(data);
            }

            // setdaynightshow(true); //開啟班別畫面

            //目前若為"大小烘箱"或"前段站別"以外站別才開啟班別資訊畫面
            if (!machineoption.includes("真空電芯大烘箱_極片小烘箱")) {
              setdaynightshow(true); //開啟班別畫面
            }

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
            if (machineoption.trim()?.includes("c正極塗佈")) {
              console.log("machineoption  :", machineoption);
              setisCheckAllMesMachine((prevState) => ({
                ...prevState,
                is_coating_realtime_c: true, // 選擇的 is_coating_realtime_c 為 true
              }));
            }
            if (machineoption.trim()?.includes("a負極塗佈")) {
              console.log("machineoption  :", machineoption);
              setisCheckAllMesMachine((prevState) => ({
                ...prevState,
                is_coating_realtime_a: true, // 選擇的 is_coating_realtime_a 為 true
              }));
            }
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
      Object?.keys(realtime_pfcc12).length > 0 &&
      Object?.keys(batch_pfcc12).length > 0
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
        transformedArray_realtime = Object?.keys(realtime_pfcc12)
          .map((key, index) => {
            return {
              [temp_chemosANDcapacity_batchfield[index]]: realtime_pfcc12[key],
            };
          })
          .filter((key, index) => {
            // 取出對象的值
            const value = Object?.values(key)[0];
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
        transformedArray_batch = Object?.keys(batch_pfcc12)
          .map((key, index) => {
            return {
              [change_chemosANDcapacity_batchfield[index]]: batch_pfcc12[key],
            };
          })
          .filter((key, index) => {
            // 取出對象的值
            const value = Object?.values(key)[0];
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
      Object?.keys(realtime_HTR_Aging).length > 0 &&
      Object?.keys(batch_HTR_Aging).length > 0
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
            const value = Object?.values(key)[0];
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
            const value = Object?.values(key)[0];
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
    if (eqipmentdata && Object?.keys(eqipmentdata).length > 0) {
      let transformedArray, groupedData;
      if (machineoption === "注液機出料自動寫入") {
        setisCurrentprodcapacity((prevState) => ({
          ...prevState,
          is_rt_injection1: true, // 選擇的 is_rt_injection1 為 true
        }));

        transformedArray = Object?.keys(eqipmentdata)
          .map((key, index) => {
            return {
              [change_injection_realtimefield[index]]: eqipmentdata[key],
            };
          })
          .filter((item) => {
            // 取出對象的值
            const value = Object?.values(item)[0];
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
            const value = Object?.values(item)[0];
            return value !== null; // 過濾掉值為 null 的項目
          });
        // setcheckinjection_One(false);
        setOpNumber(parseInt(eqipmentdata.PARAMA02));
        //設定注液機確認查閱號碼
        setinjection_machnenum(2);
        // console.log("注液機二期目前產能為=" + eqipmentdata.PARAMB33);
        console.log("注液機二期切換鍵值!");
      } else if (
        machineoption === "自動組立機" ||
        machineoption === "自動組立機二期"
      ) {
        setisCurrentprodcapacity((prevState) => ({
          ...prevState,
          is_rt_assembly: true, // 選擇的 is_rt_assembly 為 true
        }));

        transformedArray = Object?.keys(eqipmentdata)
          .map((key, index) => {
            if (!change_assembly_realtimefield[index]) return null;
            return {
              [change_assembly_realtimefield[index]]: eqipmentdata[key],
            };
          })
          .filter((item) => {
            // 取出對象的值
            const value = Object?.values(item)[0];
            return value !== null; // 過濾掉值為 null 的項目
          });

        // 動態分組
        groupedData = Object?.entries(group_assembly_fields).reduce(
          (acc, [groupName, fields]) => {
            acc[groupName] = transformedArray.filter((item) => {
              const key = Object?.keys(item)[0]; //取得該對象的鍵名
              return fields.includes(key); //核對是否在指定分組內
            });
            return acc;
          },
          {}
        );

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

            transformedArray = Object?.keys(eqipmentdata)
              .map((key, index) => {
                return {
                  [change_stacking_realtimefield[index]]: eqipmentdata[key],
                };
              })
              .filter((key, index) => {
                // 取出對象的值
                const value = Object?.values(key)[0];
                return value !== null; // 過濾掉值為 null 的項目
              });

            //暫時設定顯示"尚未產出",之後正常後可註解掉-----start
            const updatedWONOData = Object?.entries(eqipmentdata).map(
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
      } //正負極五金模切站
      else if (
        machineoption[1].toString().includes("%") &&
        machineoption[2].toString().includes("_")
      ) {
        if (machineoption.includes("C%")) {
          setisCurrentprodcapacity((prevState) => ({
            ...prevState,
            is_cutting_cathode: true, // 選擇的 is_cutting_cathode 為 true
          }));

          //取代 cutting_realtime_c key鍵值
          transformedArray = Object?.keys(eqipmentdata)
            .map((key, index) => {
              return {
                [change_Cutting_Cathode_field[index]]: eqipmentdata[key],
              };
            })
            .filter((key, index) => {
              // 取出對象的值
              const value = Object?.values(key)[0];
              return value !== null; // 過濾掉值為 null 的項目
            });

          setcutting_machine_cathanode("+");
          console.log("正極五金模切站轉換鍵值!");
        } else if (machineoption.includes("B%")) {
          setisCurrentprodcapacity((prevState) => ({
            ...prevState,
            is_cuttting_anode: true, // 選擇的 is_cuttting_anode 為 true
          }));

          //取代 cutting_realtime_a key鍵值
          transformedArray = Object?.keys(eqipmentdata)
            .map((key, index) => {
              return {
                [change_Cutting_Anode_field[index]]: eqipmentdata[key],
              };
            })
            .filter((key, index) => {
              // 取出對象的值
              const value = Object?.values(key)[0];
              return value !== null; // 過濾掉值為 null 的項目
            });

          setcutting_machine_cathanode("-");
          console.log("負極五金模切站轉換鍵值!");
        }
        //先暫時預設電化學表單目前有的員工工號,因realtimetablec realtimetablea 皆無工號可參考
        setOpNumber(parseInt(eqipmentdata.Curr_OK_Pieces));
        // setOpNumber(parseInt("188"));
      }
      // 精封站一期輸出資料並以KEY VALUE 方式對應到 change_edge_field
      else if (
        machineoption.includes("精封機出料自動化寫入") &&
        machineoption.indexOf("二期") === -1
      ) {
        setisCurrentprodcapacity((prevState) => ({
          ...prevState,
          is_edge_folding_01: true, // 選擇的 is_edge_folding_01 為 true
        }));
        transformedArray = Object?.keys(eqipmentdata)
          .slice(0, 7)
          .map((key, index) => {
            console.log(eqipmentdata[key]);
            return {
              [change_edge_field[index]]: eqipmentdata[key],
            };
          })
          .filter((item) => {
            // 取出對象的值
            const value = Object?.values(item)[0];
            return value !== null || value !== "" || value !== undefined; // 過濾掉值為 null 的項目
          });
        setOpNumber(parseInt(33)); //員工編號寫死 33 對應到電化學班表
        console.log("精封站一期寫入切換鍵值!");
      }
      // 精封站二期輸出資料並以KEY VALUE 方式對應到 change_edge_field
      else if (machineoption.includes("精封機出料自動化寫入二期")) {
        setisCurrentprodcapacity((prevState) => ({
          ...prevState,
          is_edge_folding_02: true, // 選擇的 is_edge_folding_02 為 true
        }));
        transformedArray = Object?.keys(eqipmentdata)
          .slice(0, 7)
          .map((key, index) => {
            return {
              [change_edge_field[index]]: eqipmentdata[key],
            };
          })
          .filter((item) => {
            // 取出對象的值
            const value = Object?.values(item)[0];
            return value !== null || value !== "" || value !== undefined; // 過濾掉值為 null 的項目
          });
        setOpNumber(parseInt(33)); //
        console.log("精封站二期寫入切換鍵值!");
      }
      // 大小烘箱
      else if (
        machineoption.includes("真空電芯大烘箱") &&
        machineoption.includes("極片小烘箱")
      ) {
        setisCurrentprodcapacity((prevState) => ({
          ...prevState,
          is_oven_cellbaking: true, // 選擇的 is_oven_cellbaking 為 true
        }));

        transformedArray = Object?.keys(eqipmentdata)
          .map((key, index) => {
            return {
              [change_oven_field[index]]: eqipmentdata[key],
            };
          })
          .filter((item) => {
            // 取出對象的值
            const value = Object?.values(item)[0];
            return value !== null && value !== undefined; // 過濾掉值為 null 的項目
          });

        // 動態分組
        groupedData = Object.entries(group_oven_fields).reduce(
          (acc, [groupName, fields]) => {
            acc[groupName] = transformedArray.filter((item) => {
              const key = Object.keys(item)[0]; //取得該對象的鍵名
              return fields.includes(key); //核對是否在指定分組內
            });
            return acc;
          },
          {}
        );
      } else if (
        machineoption.includes("c") &&
        machineoption.includes("c正極塗佈")
      ) {
        setisCurrentprodcapacity((prevState) => ({
          ...prevState,
          is_coating_c: true, // 選擇的 is_coating_anode 為 true
        }));

        transformedArray = Object?.keys(group_coating_realtime_c)
          .map((key, index) => {
            return {
              [group_coating_realtime_c[key]]: eqipmentdata[key],
            };
          })
          .filter((item) => {
            // 取出對象的值
            const value = Object?.values(item)[0];
            return value !== null; // 過濾掉值為 null 的項目
          });
      } else if (
        machineoption.includes("a") &&
        machineoption.includes("a負極塗佈")
      ) {
        setisCurrentprodcapacity((prevState) => ({
          ...prevState,
          is_coating_a: true, // 選擇的 is_coating_anode 為 true
        }));

        transformedArray = Object?.keys(group_coating_realtime_a)
          .map((key) => {
            return {
              [group_coating_realtime_a[key]]: eqipmentdata[key]
                ? eqipmentdata[key]
                : "尚未產生", // 如果值為 null，則顯示 "尚未產生"
            };
          })
          .filter((item) => {
            // 取出對象的值
            const value = Object?.values(item)[0];
            return value !== null; // 過濾掉值為 null 的項目
          });
      } //分選判別站
      else if (
        machineoption.includes("分選判別") &&
        machineoption.endsWith("CC2")
      ) {
        setisCurrentprodcapacity((prevState) => ({
          ...prevState,
          is_sulting_cc2: true, // 選擇的 is_sulting_cc2 為 true
        }));

        transformedArray = Object?.keys(eqipmentdata)
          .map((key, index) => {
            const rawValue = eqipmentdata[key];
            const cleanedValue = String(rawValue)
              .replace(/[\r\n\t]/g, "")
              .trim();
            return {
              [change_sulting_fields[index]]: cleanedValue,
            };
          })
          .filter((item) => {
            // 取出對象的值
            const value = Object?.values(item)[0];

            const count_match_CC = (value.match(/CC/g) || []).length;
            //有tray-id CC 開頭
            if (count_match_CC === 2) {
              return value !== "";
            } else {
              return value !== null && value !== undefined; // 過濾掉值為 null 的項目
            }
          });

        // 動態分組
        groupedData = Object.entries(group_sulting_fields).reduce(
          (acc, [groupName, fields]) => {
            acc[groupName] = transformedArray.filter((item) => {
              const key = Object.keys(item)[0]; //取得該對象的鍵名
              return fields.includes(key); //核對是否在指定分組內
            });
            return acc;
          },
          {}
        );

        //設定分選判別站目前OP號碼
        setOpNumber(parseInt(eqipmentdata.Para));
      }
      console.log(
        "目前區分groupedData:" + JSON.stringify(groupedData, null, 2)
      );

      //將轉換的數據資料存取後續觸發使用
      setMergedArray(transformedArray);
      //存取各站區分組別數據
      if (groupedData) {
        setgroup_items(
          Object?.entries(groupedData).map(([group, items]) => ({
            groupName: group,
            data: items,
          }))
        );
      }
    }
  }, [eqipmentdata]); // 當 data 改變時觸發

  useEffect(() => {
    const newHighlighted = new Set();

    group_items.forEach((group) => {
      group.data.forEach((item) => {
        const key = Object.keys(item)[0]; // 取得屬性名稱
        const newValue = item[key];

        if (previousData[key] !== undefined && previousData[key] !== newValue) {
          newHighlighted.add(key); // 記錄變更的項目
        }
      });
    });

    setHighlightedItems(newHighlighted);

    // 設定恢復背景的計時器
    const timeout = setTimeout(() => {
      setHighlightedItems(new Set());
    }, 5000);

    return () => clearTimeout(timeout);
  }, [group_items]);

  useEffect(() => {
    // 每次 `group_items` 更新時存儲新的數據
    const newData = {};
    group_items.forEach((group) => {
      group.data.forEach((item) => {
        const key = Object.keys(item)[0];
        newData[key] = item[key];
      });
    });
    setPreviousData(newData);
  }, [group_items]);

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
      const accmount_stdate = culstartdate;

      // console.log("切換選擇日期為 =" + accmount_stdate);
      // console.log("現況機器操作工號 = " + equipmentID);
      try {
        //MSSQL微軟 走以下 API (目前站台:高常溫靜置)
        if (
          isCurrentprodcapacity.is_rt_HT_Aging ||
          isCurrentprodcapacity.is_rt_RT_Aging_1 ||
          isCurrentprodcapacity.is_rt_RT_Aging_2
        ) {
          const response = await axios.get(
            `${config.apiBaseUrl}/equipment/groupname_capacitynum_for_MSSQL`,
            //"http://localhost:3009/equipment/groupname_capacitynum_for_MSSQL",
            {
              params: {
                equipmentID: equipmentID,
                shiftclass: shiftclass,
                machineoption: machineoption,
                accmount_stdate: accmount_stdate,
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
            `${config.apiBaseUrl}/equipment/groupname_capacitynum`,
            //"http://localhost:3009/equipment/groupname_capacitynum",
            {
              params: {
                equipmentID: equipmentID,
                shiftclass: shiftclass,
                machineoption: machineoption,
                accmount_stdate: accmount_stdate,
              },
            }
          );

          const equipment_workdata = splitString(response.data);
          setshiftinfo(equipment_workdata);

          console.log("equipment_workdata = " + equipment_workdata);
          console.log("目前生產量: " + shiftinfo.currentmp_qty);

          // console.log("組別: " + shiftinfo.shiftgroup);
          //區分組別(A或B)

          //已經擷取班別名稱並後續針對畫面做控制
        }
      } catch (error) {
        console.error("groupname_capacitynum 取得資料錯誤", error);
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

      //當後端更新最後一筆有以下情形,先預設A班防止畫面crash
      if (onlinegroup === "" || onlinegroup === undefined) {
        onlinegroup = groupkeyword[0];
      }

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
    let keyword, containing;
    let replacement = [
      "化成PF",
      "分容CC1",
      "分容CC2",
      "常溫倉一",
      "常溫倉二",
      "正極(+)模切",
      "負極(-)模切",
      "精封站一",
      "精封站二",
    ];
    const product_containing = ["良品", "不良品", "報廢品"];

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
    } else if (text.indexOf("C%") !== -1 || text.indexOf("B%") !== -1) {
      //正負極五金模切站取代兩個關鍵字

      const split_keyword = text.split("_");

      //手工 (ex: C%_M_PASS)
      if (split_keyword.length === 3 && split_keyword[1].includes("M")) {
        if (split_keyword[0].includes("C%")) {
          keyword = "正極(+)手工-";
        } else if (split_keyword[0].includes("B%")) {
          keyword = "負極(-)手工-";
        }

        if (split_keyword[2].includes("PASS")) {
          containing = product_containing[0].toString();
        } else if (split_keyword[2].includes("NG")) {
          containing = product_containing[1].toString();
        } else {
          containing = product_containing[2].toString();
        }
      } //機器 (ex: B%_SCRAP)
      else {
        if (split_keyword[0].includes("C%")) {
          keyword = "正極(+)自動-";
        } else if (split_keyword[0].includes("B%")) {
          keyword = "負極(-)自動-";
        }

        if (split_keyword[1].includes("PASS")) {
          containing = product_containing[0].toString();
        } else if (split_keyword[1].includes("NG")) {
          containing = product_containing[1].toString();
        } else {
          containing = product_containing[2].toString();
        }
      }
      //五金模切站直接將解析後的字串回傳,不用取代字串的方式
      return keyword + containing;
    } else {
      console.log("此字串:" + text + "不符合PF/CC/常溫倉站/正負極五金模切站");
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
    } else if (event.target.name === "accumula_starttime") {
      setStartAccumulaDate(event.target.value);
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
    } else if (machineoption.includes("C%") || machineoption.includes("B%")) {
      machine_log = replaceKeyword(machineoption);
    } else if (machineoption.indexOf("精封機出料自動化寫入") !== -1) {
      if (machineoption.indexOf("二期") === -1) {
        machine_log = "精封一期";
      } else {
        machine_log = "精封二期";
      }
    } else if (
      machineoption.includes("自動組立機") ||
      machineoption.includes("分選判別")
    ) {
      machine_log = machineoption.toString().trim();
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
        //"http://localhost:3009/EquipmentProInfo/pushconfirm",
        `${config.apiBaseUrl}/EquipmentProInfo/pushconfirm`,
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
      <IntlProvider messages={locale}>
        <div className="mes_equipmentinfo">
          <div className="header">
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
                {/* 機台生產進度(即時訊息):&emsp; */}
                <p style={{ whiteSpace: "nowrap" }}>
                  <FormattedMessage
                    id="mes.progress"
                    defaultMessage="機台生產進度(即時訊息):"
                  />
                  <span style={{ marginLeft: "0.5em" }}>
                    <FormattedMessage
                      id="mes.datetime"
                      defaultMessage="日期/時分:"
                    />
                  </span>
                  {dateTime.format("YYYY-MM-DD HH:mm:ss")}
                  {/* <FormattedDate
                    value={new Date()}
                    year="numeric"
                    month="long"
                    day="numeric"
                    weekday="long"
                  /> */}
                </p>
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
                  // mes_stacking.map((item, index) => (
                  //   // <option key={item.id} value={item.label + "出料自動寫入"}>
                  //   <option key={index} value={item}>
                  //     {index <= 4 &&
                  //       mes_stacking_oneperiod + parseInt(index + 1)}
                  //     {index > 4 &&
                  //       mes_stacking_twoperiod + parseInt(index + 1)}
                  //   </option>
                  //  ))
                  mes_stacking
                    .filter((_, index) => index >= 2) // 過濾 index < 2
                    .map((item, index) => (
                      <option key={index} value={item}>
                        {index + 3 <= 5 // index 是從 0 起，但實際是原來 index+2
                          ? mes_stacking_oneperiod + (index + 3) // index+2+1
                          : mes_stacking_twoperiod + (index + 3)}
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

                {/* 正極五金模切站選單 */}
                {isCheckAllMesMachine.is_cuttingcathode &&
                  mes_Cutting_Cathode.length > 0 &&
                  mes_Cutting_Cathode.map((item, index) =>
                    index === 0 || index === 2 ? (
                      <option key={index} value={item}>
                        {mes_cutting_Cathode_site + "-"}
                        {index === 2 ? "手動" : ""}
                        {mes_product_status[0]}
                      </option>
                    ) : index === 1 || index === 3 ? (
                      <option key={index} value={item}>
                        {mes_cutting_Cathode_site + "-"}
                        {index === 3 ? "手動" : ""}
                        {mes_product_status[1]}
                      </option>
                    ) : (
                      <option key={index} value={item}>
                        {mes_cutting_Cathode_site + "-" + mes_product_status[2]}
                      </option>
                    )
                  )}

                {/* 負極五金模切站選單 */}
                {isCheckAllMesMachine.is_cuttinganode &&
                  mes_Cutting_Anode.length > 0 &&
                  mes_Cutting_Anode.map((item, index) =>
                    index === 0 || index === 2 ? (
                      <option key={index} value={item}>
                        {mes_cutting_Anode_site + "-"}
                        {index === 2 ? "手動" : ""}
                        {mes_product_status[0]}
                      </option>
                    ) : index === 1 || index === 3 ? (
                      <option key={index} value={item}>
                        {mes_cutting_Anode_site + "-"}
                        {index === 3 ? "手動" : ""}
                        {mes_product_status[1]}
                      </option>
                    ) : (
                      <option key={index} value={item}>
                        {mes_cutting_Anode_site + "-" + mes_product_status[2]}
                      </option>
                    )
                  )}
                {/* 精封站 選單 */}
                {isCheckAllMesMachine.is_edgefolding &&
                  mes_edge.length > 0 &&
                  mes_edge.map((item, index) => (
                    <option key={index} value={item}>
                      {item}
                    </option>
                  ))}
                {/* 電芯-大烘箱/極片-小烘箱站 選單 */}
                {isCheckAllMesMachine.is_oven &&
                  mes_oven.length > 0 &&
                  mes_oven.map((item, index) => (
                    <option key={index} value={item}>
                      {item}
                    </option>
                  ))}
                {/* 正極塗佈選單 */}
                {isCheckAllMesMachine?.is_coating_realtime_c && (
                  <option key={0} value={mes_coating_all[0]}>
                    {mes_coating_all[0]}
                  </option>
                )}
                {/* 負極塗佈選單 */}

                {isCheckAllMesMachine?.is_coating_realtime_a && (
                  <option key={0} value={mes_coating_all[1]}>
                    {mes_coating_all[1]}
                  </option>
                )}
                {/* 分選判別選單 */}
                {isCheckAllMesMachine.is_sulting &&
                  mes_sulting.length > 0 &&
                  mes_sulting.map((item, index) => (
                    <option key={index} value={item}>
                      {item}
                    </option>
                  ))}
              </Form.Select>
            </Form.Group>
          </div>
          <div className="column">
            <div className="goal">
              <Card>
                <Card.Header className="custom-card-header">
                  <p>
                    <FormattedMessage
                      id="mes.productlabel"
                      defaultMessage="生產資訊標籤"
                    />
                  </p>
                </Card.Header>
                <Card.Body>
                  {
                    // <Card.Text>
                    //   機台架動率:90% <br />
                    //   良率:95% <br />
                    //   NG率:5%
                    // </Card.Text>
                    <Card.Text>
                      <span style={Device_Span}>
                        <p>
                          <FormattedMessage
                            id="mes.equipmentnumber"
                            defaultMessage="●設備編號:"
                          />
                        </p>
                      </span>
                      <h2 class="titlelabeinfo">
                        {(isCheckAllMesMachine.is_chemosynthesis ||
                          isCheckAllMesMachine.is_capacity) &&
                        realtime_pfcc12.MachineNO !== undefined ? (
                          realtime_pfcc12.MachineNO
                        ) : (isCheckAllMesMachine.is_htaging ||
                            isCheckAllMesMachine.is_rtaging) &&
                          realtime_HTR_Aging.MachineNO !== undefined ? (
                          realtime_HTR_Aging.MachineNO
                        ) : (isCurrentprodcapacity.is_edge_folding_01 ||
                            isCurrentprodcapacity.is_edge_folding_02) &&
                          eqipmentdata.cellNO !== undefined ? (
                          <div>{eqipmentdata.cellNO.toString()}</div>
                        ) : isCheckAllMesMachine.is_sulting &&
                          eqipmentdata.EnddateD !== undefined ? (
                          <div>{eqipmentdata.EnddateD}</div>
                        ) : (
                          <div>讀取中...</div>
                        )}
                      </h2>
                      <br />
                      <span style={Device_Span}>
                        <p>
                          <FormattedMessage
                            id="mes.status"
                            defaultMessage="●目前狀態:"
                          />
                        </p>
                      </span>
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
                        ) : (isCurrentprodcapacity.is_cutting_cathode ||
                            isCurrentprodcapacity.is_cuttting_anode) &&
                          eqipmentdata.Curr_NG_Pieces === undefined ? (
                          <div>查詢中...</div>
                        ) : (isCurrentprodcapacity.is_cutting_cathode ||
                            isCurrentprodcapacity.is_cuttting_anode) &&
                          eqipmentdata.Curr_NG_Pieces !== undefined ? (
                          <div>{eqipmentdata.Curr_NG_Pieces}</div>
                        ) : // 精封站 目前狀態資訊
                        (isCurrentprodcapacity.is_edge_folding_01 ||
                            isCurrentprodcapacity.is_edge_folding_02) &&
                          eqipmentdata.boxNO !== undefined ? (
                          <div>{eqipmentdata.boxNO}</div>
                        ) : isCurrentprodcapacity.is_sulting_cc2 &&
                          eqipmentdata.analysisDT !== undefined ? (
                          <div>{eqipmentdata.analysisDT}</div>
                        ) : null}
                      </h2>
                      <br />
                      <span style={Device_Span}>
                        <p>
                          <FormattedMessage
                            id="mes.productperson"
                            defaultMessage="●目前生產人員:"
                          />
                        </p>
                      </span>
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
                        {(isCurrentprodcapacity.is_cutting_cathode ||
                          isCurrentprodcapacity.is_cuttting_anode) &&
                          "( " +
                            eqipmentdata.Curr_OK_Pieces +
                            " " +
                            (shiftinfo.shiftclassNanme === undefined
                              ? "待切換"
                              : shiftinfo.shiftclassNanme) +
                            " )"}

                        {/* 精封站 目前生產人員資訊 */}
                        {(isCurrentprodcapacity.is_edge_folding_01 ||
                          isCurrentprodcapacity.is_edge_folding_02) &&
                          "( " +
                            eqipmentdata.CurrentEdgeOP +
                            " " +
                            (shiftinfo.shiftclassNanme === undefined
                              ? "待切換"
                              : shiftinfo.shiftclassNanme) +
                            " )"}
                        {isCurrentprodcapacity.is_sulting_cc2 &&
                          "( " +
                            eqipmentdata.Para +
                            " " +
                            (shiftinfo.shiftclassNanme === undefined
                              ? "待切換"
                              : shiftinfo.shiftclassNanme) +
                            " )"}
                      </h2>

                      <br />
                      <span style={Device_Span}>
                        <p>
                          <FormattedMessage
                            id="mes.wo"
                            defaultMessage="●目前工單號:"
                          />
                        </p>
                      </span>
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
                        ) : isCurrentprodcapacity.is_cutting_cathode ||
                          isCurrentprodcapacity.is_cuttting_anode ? (
                          <div>尚未產生</div>
                        ) : // 精封站目前工單號資訊
                        (isCurrentprodcapacity.is_edge_folding_01 ||
                            isCurrentprodcapacity.is_edge_folding_02) &&
                          eqipmentdata.stageID === undefined ? (
                          <div>資料回傳中 ...</div>
                        ) : (isCurrentprodcapacity.is_edge_folding_01 ||
                            isCurrentprodcapacity.is_edge_folding_02) &&
                          eqipmentdata.stageID !== undefined ? (
                          <div>{eqipmentdata.stageID}</div>
                        ) : isCurrentprodcapacity.is_sulting_cc2 &&
                          eqipmentdata.FileName !== undefined ? (
                          <div>{eqipmentdata.FileName}</div>
                        ) : null}
                      </h2>
                      <br />
                      <span style={Device_Span}>
                        <p style={{ whiteSpace: "nowrap" }}>
                          <FormattedMessage
                            id="mes.productamount"
                            defaultMessage="●目前產能:"
                          />
                        </p>
                      </span>
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
                        ) : //正負極五金模切站
                        isCurrentprodcapacity.is_cutting_cathode &&
                          eqipmentdata.Total_Pieces_produced === undefined ? (
                          <div>等待數據回傳...</div>
                        ) : isCurrentprodcapacity.is_cutting_cathode ? (
                          <div>
                            Qty: {eqipmentdata.Total_Pieces_produced} PCS{" "}
                          </div>
                        ) : isCurrentprodcapacity.is_cuttting_anode &&
                          eqipmentdata.Total_Pieces_produced === undefined ? (
                          <div>等待數據回傳...</div>
                        ) : isCurrentprodcapacity.is_cuttting_anode ? (
                          <div>
                            Qty: {eqipmentdata.Total_Pieces_produced} PCS{" "}
                          </div>
                        ) : // 精封站 目前產能資訊
                        (isCurrentprodcapacity.is_edge_folding_01 ||
                            isCurrentprodcapacity.is_edge_folding_02) &&
                          eqipmentdata.Time === undefined ? (
                          <div>資料回傳中 ...</div>
                        ) : (isCurrentprodcapacity.is_edge_folding_01 ||
                            isCurrentprodcapacity.is_edge_folding_02) &&
                          eqipmentdata.Time !== undefined ? (
                          <div>Qty: {eqipmentdata.Time} PCS </div>
                        ) : isCurrentprodcapacity.is_sulting_cc2 &&
                          eqipmentdata.StartDateD !== undefined ? (
                          <div>Qty: {eqipmentdata.StartDateD} PCS </div>
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

                      <Form.Group>
                        <Form.Label htmlFor="date" style={Device_Span}>
                          <p style={{ whiteSpace: "nowrap" }}>
                            <FormattedMessage
                              id="mes.searchsartt_dt"
                              defaultMessage="●查詢起始日期:"
                            />
                          </p>
                        </Form.Label>
                        <Form.Control
                          name="accumula_starttime"
                          type="datetime-local"
                          value={startaccumuladate}
                          onChange={handleInputChange}
                        />
                      </Form.Group>
                      <span style={Device_Span}>
                        <p style={{ whiteSpace: "nowrap" }}>
                          <FormattedMessage
                            id="mes.Cumpcapacityamount"
                            defaultMessage="●累積產能Qty:"
                          />
                        </p>
                      </span>

                      <h2 class="titlelabeinfo"> {Updateparam} PCS</h2>
                      <br />
                      <span style={Device_Span}>
                        <p style={{ whiteSpace: "nowrap" }}>
                          <FormattedMessage
                            id="mes.equipmentnumbermaintain"
                            defaultMessage="●設備維護員:"
                          />
                        </p>
                      </span>
                      <h2 class="titlelabeinfo">{"OP2"}</h2>
                    </Card.Text>
                  }
                  <div>
                    <span style={Device_Span}>
                      <p style={{ whiteSpace: "nowrap" }}>
                        <FormattedMessage
                          id="mes.changelang"
                          defaultMessage="●語言切換:"
                        />
                      </p>
                    </span>
                    <select
                      value={lang}
                      style={{
                        position: "realtive",
                        padding: "5px 125px",
                        fontSize: "20px",
                        fontweight: "bold",
                        textAlign: "center",
                      }}
                      onChange={(e) => {
                        console.log(e.target.value);
                        setLang(e.target.value);
                      }}
                    >
                      {languages.map((language) => (
                        <option
                          style={{
                            fontSize: "30px",
                            fontweight: "bold",
                            textAlign: "left",
                            backgroundColor: "#D7FFEE	",
                            fontfamily: "Arial",
                            letterspacing: "3px",
                            position: "realtive",
                            padding: "20px 125px",
                          }}
                          key={language.code}
                          value={language.code}
                        >
                          {language.label}
                        </option>
                      ))}
                    </select>
                  </div>
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
                  <p style={{ whiteSpace: "nowrap" }}>
                    <FormattedMessage
                      id="mes.equipmentpdparam"
                      defaultMessage="設備生產參數"
                    />
                  </p>
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
                    <span>
                      <FormattedMessage
                        id="mes.equipmentfront"
                        defaultMessage="設備參數更新約"
                        values={{ onUpdate: setTextParamfront }} // 通過 values 來更新 textParam
                      />
                    </span>
                    <textarea
                      value={`${textParamfront}${textparam}${textParambackend}`}
                      readOnly
                      rows={1}
                      className="marquee-text"
                      style={{
                        width: "50px",
                        textAlign: "center",
                        backgroundColor: "#B7FF4A",
                        position: "realtive",
                        padding: "1px 2px",
                      }}
                    />

                    <span style={{ position: "realtive", padding: "0px 55px" }}>
                      <FormattedMessage
                        id="mes.equipmentbackend"
                        defaultMessage="秒鐘左右！"
                        values={{ onUpdate: setTextParambackend }} // 通過 values 來更新 textParam
                      />
                    </span>
                  </div>

                  <br />

                  <Button
                    variant="primary"
                    style={{
                      display: "inline-block",
                      marginBottom: "16px",
                      marginLeft: "165px",
                    }}
                    onClick={() => handleSaveInput()}
                  >
                    存取設定參數
                  </Button>

                  {/*當使用新batchtable走下面這段顯示,(目前PF,CC,H.T,R.T)*/}
                  {(isCheckAllMesMachine.is_chemosynthesis ||
                    isCheckAllMesMachine.is_capacity ||
                    isCheckAllMesMachine.is_htaging ||
                    isCheckAllMesMachine.is_rtaging) &&
                    Object.entries(mergedArray2).map(([key, value], index) => {
                      // {mergedArray.map((key, input) => (
                      return (
                        <div
                          key={index}
                          className="form-group custom-notice"
                          style={{ marginBottom: "12px" }}
                        >
                          <div className="input-row">
                            {/* 多欄位資料顯示 */}
                            <textarea
                              className="form-control eqmentparam-textarea"
                              value={Object.entries(value)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join("\n")}
                              readOnly
                              style={{ cursor: "text", marginBottom: "5px" }}
                            />

                            {/* 對每個子欄位判斷是否為數值型，依此加上輸入與差值欄位 */}
                            {Object.entries(value).map(
                              ([subKey, subValue], i) => {
                                const numeric = isNumeric(subValue);
                                const inputVal =
                                  inputValues[key]?.[subKey] ?? "";
                                const difference =
                                  numeric && inputVal !== ""
                                    ? Number(inputVal) - Number(subValue)
                                    : "";

                                return numeric && AllowDisplaySubKey(subKey) ? (
                                  <div
                                    key={i}
                                    style={{
                                      display: "flex",
                                      gap: "8px",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    <input
                                      type="number"
                                      className="form-control eqmentparam-input"
                                      placeholder={`輸入新值`}
                                      value={inputVal}
                                      onChange={(e) =>
                                        setInputValues((prev) => ({
                                          ...prev,
                                          [key]: {
                                            ...(prev[key] || {}),
                                            [subKey]: e.target.value,
                                          },
                                        }))
                                      }
                                      style={{ marginBottom: "5px" }}
                                    />

                                    <input
                                      type="text"
                                      className="form-control eqmentparam-diff"
                                      value={
                                        difference !== ""
                                          ? `差值: ${difference}`
                                          : ""
                                      }
                                      readOnly
                                      style={{
                                        backgroundColor:
                                          difference === ""
                                            ? "#f5f5f5"
                                            : Number(difference) > 0
                                            ? "#28FF28" // 正數
                                            : "#FF5809", // 負數
                                        fontStyle: "italic",
                                        marginBottom: "10px",
                                      }}
                                    />
                                  </div>
                                ) : null;
                              }
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {/* 分區塊資料顯示 */}
                  {isCheckAllMesMachine?.is_assembly ||
                  isCheckAllMesMachine?.is_oven ||
                  isCheckAllMesMachine?.is_sulting ? (
                    <div>
                      {group_items.map((group) => (
                        <div
                          key={group.groupName}
                          style={{
                            backgroundColor: highlightedItems.has(
                              group.groupName
                            )
                              ? "#FFD700"
                              : "#99ffff",
                            padding: "10px",
                            borderRadius: "5px",
                            marginBottom: "10px",
                          }}
                        >
                          <h3>{group.groupName}</h3>
                          <ul>
                            {group.data &&
                              group.data.map((item, index) => {
                                const key = Object.keys(item)[0];
                                const value = item[key];
                                const numeric = isNumeric(value);
                                // const userInput = inputValues[key] ?? "";
                                const userInput =
                                  inputValues?.[group.groupName]?.[key] ??
                                  settings?.[group.groupName]?.[key] ??
                                  "";
                                const difference =
                                  numeric && userInput !== ""
                                    ? Number(userInput) - Number(value)
                                    : "";

                                return (
                                  <div
                                    key={index}
                                    className="form-group custom-notice"
                                    style={{ marginBottom: "12px" }}
                                  >
                                    {/* 原始資料 */}
                                    <textarea
                                      className={`form-control eqmentparam-textarea ${
                                        highlightedItems.has(key)
                                          ? "highlight"
                                          : ""
                                      }`}
                                      value={`${key}: ${value}`}
                                      readOnly
                                    />

                                    {/* 若為數值型態，顯示輸入與差值欄位 */}
                                    {numeric && AllowDisplaySubKey(key) && (
                                      <>
                                        <input
                                          type="number"
                                          className="form-control eqmentparam-input"
                                          placeholder="輸入新值"
                                          value={userInput}
                                          onChange={(e) =>
                                            setInputValues((prev) => ({
                                              ...prev,
                                              [group.groupName]: {
                                                ...(prev[group.groupName] ||
                                                  {}),
                                                [key]: e.target.value,
                                              },
                                            }))
                                          }
                                          style={{
                                            marginTop: "5px",
                                            marginBottom: "5px",
                                          }}
                                        />

                                        <input
                                          type="text"
                                          className="form-control eqmentparam-diff"
                                          value={
                                            difference !== ""
                                              ? `差值: ${difference}`
                                              : ""
                                          }
                                          readOnly
                                          style={{
                                            backgroundColor:
                                              difference === ""
                                                ? "#f5f5f5"
                                                : Number(difference) > 0
                                                ? "#28FF28" // 正數
                                                : "#FF5809", // 負數
                                            fontStyle: "italic",
                                          }}
                                        />
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {/* 通用資料顯示 mergedArray */}
                  {
                    !isCheckAllMesMachine?.is_assembly &&
                      !isCheckAllMesMachine?.is_oven &&
                      !isCheckAllMesMachine?.is_sulting &&
                      mergedArray &&
                      // eslint-disable-next-line array-callback-return
                      mergedArray?.map((entry, index) => {
                        const rawKey = Object.keys(entry)[0]; // 例如 "最新工作序號--> "
                        const subValue = entry[rawKey]; // 例如 3772109
                        const cleanedKey = normalizeKey(rawKey); // 變成 "最新工作序號"

                        const fromSettings =
                          settings?.[MesJson_SideTitle]?.[cleanedKey];

                        console.log("fromSettings = " + fromSettings);

                        // const inputVal =
                        //   inputValues?.change_stacking_realtimefield?.[
                        //     cleanedKey
                        //   ] ??
                        //   settings?.change_stacking_realtimefield?.[
                        //     cleanedKey
                        //   ] ??
                        //   "";

                        const inputVal =
                          inputValues?.[MesJson_SideTitle]?.[cleanedKey] ??
                          settings?.[MesJson_SideTitle]?.[cleanedKey] ??
                          "";

                        const difference =
                          isNumeric(subValue) && inputVal !== ""
                            ? Number(inputVal) - Number(subValue)
                            : "";

                        return (
                          <div
                            key={index}
                            className="form-group custom-notice"
                            style={{ marginBottom: "12px" }}
                          >
                            <div className="input-row">
                              <textarea
                                className="form-control eqmentparam-textarea"
                                value={`${rawKey}: ${subValue}`}
                                readOnly
                                style={{ cursor: "text", marginBottom: "5px" }}
                              />

                              {isNumeric(subValue) &&
                              AllowDisplaySubKey(rawKey) ? (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "8px",
                                    marginBottom: "4px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    className="form-control eqmentparam-input"
                                    placeholder={`輸入 ${rawKey} 的新值`}
                                    value={inputVal}
                                    onChange={(e) =>
                                      // setInputValues((prev) => ({
                                      //   ...prev,
                                      //   change_stacking_realtimefield: {
                                      //     ...(prev.change_stacking_realtimefield ||
                                      //       {}),
                                      //     [cleanedKey]: e.target.value,
                                      //   },
                                      // }))
                                      setInputValues((prev) => ({
                                        ...prev,
                                        [MesJson_SideTitle]: {
                                          ...(prev[MesJson_SideTitle] || {}),
                                          [cleanedKey]: e.target.value,
                                        },
                                      }))
                                    }
                                    style={{ marginBottom: "5px" }}
                                  />

                                  <input
                                    type="text"
                                    className="form-control eqmentparam-diff"
                                    value={
                                      difference !== ""
                                        ? `差值: ${difference}`
                                        : ""
                                    }
                                    readOnly
                                    style={{
                                      backgroundColor:
                                        difference === ""
                                          ? "#f5f5f5"
                                          : Number(difference) > 0
                                          ? "#28FF28"
                                          : "#FF5809",
                                      fontStyle: "italic",
                                      marginBottom: "10px",
                                    }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })

                    // Object.entries(mergedArray).map(([key, value], index) => {
                    //   // console.log(
                    //   //   "mergedArray 結構",
                    //   //   JSON.stringify(mergedArray, null, 2)
                    //   // );

                    //   return (
                    //     <div
                    //       key={index}
                    //       className="form-group custom-notice"
                    //       style={{ marginBottom: "12px" }}
                    //     >
                    //       <div className="input-row">
                    //         {/* 原始多欄位資料顯示 */}
                    //         <textarea
                    //           className="form-control eqmentparam-textarea"
                    //           value={Object.entries(value)
                    //             .map(([key, value]) => `${key}: ${value}`)
                    //             .join("\n")}
                    //           readOnly
                    //           style={{ cursor: "text", marginBottom: "5px" }}
                    //         />

                    //         {/* 對每個子欄位判斷是否為數值型，依此加上輸入與差值欄位 */}
                    //         {Object.entries(value).map(
                    //           ([subKey, subValue], i) => {
                    //             const numeric = isNumeric(subValue);
                    //             // const inputVal =
                    //             //   inputValues[key]?.[subKey] ?? "";
                    //             const inputVal =
                    //               inputValues?.[key]?.[subKey] ??
                    //               settings?.[key]?.[subKey] ??
                    //               "";
                    //             const difference =
                    //               numeric && inputVal !== ""
                    //                 ? Number(inputVal) - Number(subValue)
                    //                 : "";
                    //             return numeric && AllowDisplaySubKey(subKey) ? (
                    //               <div
                    //                 key={i}
                    //                 style={{
                    //                   display: "flex",
                    //                   gap: "8px",
                    //                   marginBottom: "4px",
                    //                 }}
                    //               >
                    //                 <input
                    //                   type="number"
                    //                   className="form-control eqmentparam-input"
                    //                   placeholder={`輸入 ${subKey} 的新值`}
                    //                   // placeholder={`輸入新值`}
                    //                   value={inputVal}
                    //                   onChange={(e) =>
                    //                     setInputValues((prev) => ({
                    //                       ...prev,
                    //                       [key]: {
                    //                         ...(prev[key] || {}),
                    //                         [subKey]: e.target.value,
                    //                       },
                    //                     }))
                    //                   }
                    //                   style={{ marginBottom: "5px" }}
                    //                 />

                    //                 <input
                    //                   type="text"
                    //                   className="form-control eqmentparam-diff"
                    //                   value={
                    //                     difference !== ""
                    //                       ? `差值: ${difference}`
                    //                       : ""
                    //                   }
                    //                   readOnly
                    //                   style={{
                    //                     backgroundColor:
                    //                       difference === ""
                    //                         ? "#f5f5f5"
                    //                         : Number(difference) > 0
                    //                         ? "#28FF28" // 正數
                    //                         : "#FF5809", // 負數
                    //                     fontStyle: "italic",
                    //                     marginBottom: "10px",
                    //                   }}
                    //                 />
                    //               </div>
                    //             ) : null;
                    //           }
                    //         )}
                    //       </div>
                    //     </div>
                    //   );
                    // })
                  }
                </Card.Body>
              </Card>
            </div>
            <div className="nameList">
              <Card>
                <Card.Header></Card.Header>
                <Card.Body>
                  <Card.Text>
                    <p style={{ whiteSpace: "nowrap" }}>
                      <FormattedMessage
                        id="mes.Short-term-goals"
                        defaultMessage=" 1.短期目標:"
                      />
                    </p>
                    <br /> <br /> <br /> <br />
                    <p style={{ whiteSpace: "nowrap" }}>
                      <FormattedMessage
                        id="mes.long-term-goals"
                        defaultMessage="2.長期目標:"
                      />
                    </p>
                    <br />
                  </Card.Text>
                </Card.Body>
              </Card>
              <Card>
                <Card.Header className="custom-card-detial">
                  <span>
                    <FormattedMessage
                      id="mes.Detailspageentry"
                      defaultMessage="細節分頁進入"
                    />
                  </span>
                </Card.Header>
                <Card.Body>
                  <br />
                  <div align="center">
                    <Button
                      className="button1"
                      style={{ verticalAlign: "middle" }}
                    >
                      <span>
                        <FormattedMessage
                          id="mes.Routinemaintenanceinterface"
                          defaultMessage="例行性保養介面"
                        />
                      </span>
                    </Button>
                    <br />
                    <Button
                      className="button2"
                      style={{ verticalAlign: "middle" }}
                    >
                      <span>
                        <FormattedMessage
                          id="mes.Consumablesreplacementrecord"
                          defaultMessage="耗材更換紀錄"
                        />
                      </span>
                    </Button>
                    <br />
                    <Button
                      className="button3"
                      style={{ verticalAlign: "middle" }}
                      /* {onClick={OpenStack_CheckList_pdf(optionkey)}*}*/
                      onClick={() => OpenStack_CheckList_pdf(optionkey)}
                    >
                      <span>
                        <FormattedMessage
                          id="mes.Checklist"
                          defaultMessage="檢點表"
                        />
                      </span>
                    </Button>
                    <br />
                    <Button
                      className="button4"
                      style={{ verticalAlign: "middle" }}
                    >
                      <span>
                        <FormattedMessage
                          id="mes.errorrecord"
                          defaultMessage="異常紀錄"
                        />
                      </span>
                    </Button>
                    <br />
                    <Button
                      className="button5"
                      style={{ verticalAlign: "middle" }}
                    >
                      <span>
                        <FormattedMessage
                          id="mes.extrainfo"
                          defaultMessage="SOP、SIP、教學影片"
                        />
                      </span>
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
      </IntlProvider>
    </Form>
  );
};

export default MES_EquipmentProInfo;
