import React, { useState, useEffect, useCallback, useRef } from "react";
import debounce from "lodash.debounce";
import config from "../../config";
import { Form, Button } from "react-bootstrap";
import axios from "axios";
import dayjs from "dayjs";
import Table from "react-bootstrap/Table";
import "./index_popform.scss";
//成功提示套件
import { toast } from "react-toastify";
const Popform = ({ FormRawtable, RadioValue, closeModal }) => {
  const [pursaleinvencolumn, view_pursaleinvencolumn] = useState([]);
  const [pursaleinvenItems, view_pursaleinvenItems] = useState([]);
  const [filenameList, setFileNameList] = useState([
    {
      queryfile: "",
      isManual: true,
      mode: "input",
      candidates: [],
      originalCandidates: [],
    },
  ]);
  const [visibleRows, setVisibleRows] = useState(20); // Initially show 20 rows
  const [exist_ID, have_exist_ID] = useState(false); // 布林判斷是否有column ID
  const [exist_NewID, have_exist_NEWID] = useState(false); // 布林判斷是否有自行鍵入NEWID
  const [PFCC1andCC2, setPFCC1andCC2] = useState(false); // 布林判斷是否切換到 PF或CC1andCC2 mergy table
  const [OverRaw_default, setOverRaw_default] = useState(false);
  const [SendFileName_search, setSendFileName_search] = useState(false);
  const [raw_search_method, setraw_search_method] = useState(0);
  const [Rowcatch_num, setRowcatch_num] = useState(0);
  const [Start_ID, setStart_ID] = useState("");
  const [End_ID, setEnd_ID] = useState("");
  const [First_ID, setFirst_ID] = useState(0);
  const [Last_ID, setLast_ID] = useState(0);
  const [st_FrontID, set_stFrontID] = useState(0);
  const [ed_Backend_ID, set_edBackend_ID] = useState(0);
  const [ColViewID, setColViewID] = useState("");
  const [csvUrl, setCsvUrl] = useState(null);
  const [check_ID_run, setcheck_ID_run] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);

  const [popvalues, setpopValues] = useState({
    ID_head: "",
    ID_end: "",
  });

  const latestQueryRef = useRef(null);

  //最多增加檔案搜尋Max數量
  const filecount_Max = 7;

  const toggleInputMode = (index, mode) => {
    setFileNameList((prevList) => {
      const updated = [...prevList];
      updated[index].mode = mode;
      return updated;
    });
  };

  //  包裝 debounce function，確保不重建
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchPFCC_FileName = useCallback(
    debounce(async (KeyFilelist, index) => {
      // console.log("PFCC搜尋list =", JSON.stringify(KeyFilelist, null, 2));
      console.log(" 查詢 index:", index, "→", KeyFilelist);
      if (!KeyFilelist || !KeyFilelist.queryfile) return;
      try {
        const response = await axios.get(
          //`${config.apiBaseUrl}/purchsaleinvtory/query_FileName`,
          "http://localhost:3009/purchsaleinvtory/query_FileName",
          {
            params: {
              RadioValue,
              Rawtable: FormRawtable,
              FileName_titleKey: KeyFilelist,
            },
          }
        );

        if (response.status === 200) {
          // console.log("回傳成功:", response.data);

          // const converted = response.data.map((item) => ({
          //   queryfile: item.FileName,
          //   isManual: false,
          // }));

          const converted = response.data.map((item) => item.FileName);

          // setFileNameList((prevList) => {
          //   const newList = [...prevList];
          //   // 可選：若你想保留原始手動輸入那一筆
          //   const manualInput = { ...newList[index] };
          //   newList.splice(index, 1, ...converted);
          //   // 移除 index 那一筆，插入多筆新資料（+可選手動那筆）,不想保留原手動輸入那筆，就把 manualInput 拿掉，
          //   // newList.slice(index, 1, manualInput, ...converted);
          //   // newList.splice(index + 1, 0, ...converted); // 插入在當前輸入欄位後
          //   // newList[index] = { queryfile: converted[0]?.queryfile || "" };
          //   //return newList.slice(0, 14); // 限制最多 14 筆
          //   return newList;
          // });

          setFileNameList((prevList) => {
            const newList = [...prevList];

            // 保險檢查，防止 index 不存在時 set 錯
            if (!newList[index]) return newList;

            newList[index] = {
              ...newList[index],
              candidates: converted,
              //queryfile: converted[0] || "", // 預設第一筆為選中值
              // queryfile: "", // 不預選
              // isManual: false,
              queryfile: newList[index].queryfile || "", // 如果已有值就保留
              isManual: newList[index].queryfile
                ? newList[index].isManual
                : false,
              mode: "select", // 初始顯示 dropdown
            };
            return newList;
          });

          // setFileNameList((prevList) => [...prevList, ...converted]);
          //setFileNameList(converted);
          //確定要傳到後端搜尋
          setSendFileName_search(true);
        }
      } catch (err) {
        console.error("API 錯誤:", err);
      }
    }, 300),
    [RadioValue, FormRawtable]
  );

  const Get_FileName_RawData = async (queryfile) => {
    console.log("queryfile = " + queryfile);
    try {
      const response = await axios.get(
        // `${config.apiBaseUrl}/purchsaleinvtory/view_FileName_raw`,
        "http://localhost:3009/purchsaleinvtory/view_FileName_raw",
        {
          params: {
            FormRawtable: FormRawtable ?? "",
            RadioValue: RadioValue ?? "",
            File: queryfile ?? "",
          },
        }
      );

      const row_count = response.data.count;
      const content_AllData = response.data.rawdata;
      const column_list = response.data.colname;

      if (response.status === 200) {
        // console.log(
        //   "有接收view_rangeID_raw 回傳data = " +
        //     JSON.stringify(response.data, null, 2)
        // );
        // console.log(row_count);
        // console.log(content_AllData);
        // console.log(column_list);
        setraw_search_method(2);
        view_pursaleinvencolumn(column_list);
        view_pursaleinvenItems(content_AllData);
        setRowcatch_num(row_count);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
    }
  };

  const renderCell = (colName, value) => {
    if (value === null || value === undefined) return "";

    // 對圖片欄位：只顯示文字，不渲染圖片
    if (["photo_path", "recycle_photo"].includes(colName)) {
      if (typeof value === "string" && value.trim() !== "") {
        return "[圖片路徑] " + value; // 或僅回傳 value
      }
      if (typeof value === "object") {
        return "[圖片資料] " + JSON.stringify(value);
      }
      return "無圖";
    }

    // 日期時間欄位格式化
    if (
      ["created_at", "recyclefix_time", "submittime"].includes(colName) &&
      typeof value === "string"
    ) {
      const date = new Date(value);
      return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}/${String(date.getDate()).padStart(2, "0")} ${String(
        date.getHours()
      ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    }

    // 若是一般物件（非圖片）
    if (typeof value === "object") {
      if (value.type === "Buffer" && Array.isArray(value.data)) {
        if (!Number.isNaN(value.data)) {
          console.log("此" + colName + "判定為數字->" + value.data);
          return value.data;
        } else {
          //統一將格式轉為字串
          const text = new TextDecoder().decode(new Uint8Array(value.data));
          return text; // 顯示解碼後的字串，例如 "Hello" or  ex:" 9 516.."
        }
      }

      return JSON.stringify(value);
    }

    return value;
  };

  // ✅ 查詢動作：抽成函式
  const handleFileSelection = () => {
    const queryfileList = filenameList
      .filter((item) => item.mode === "input" && !!item.queryfile)
      .map((item) => item.queryfile);

    if (queryfileList.length > 0) {
      const queryfile_param = `(${queryfileList
        .map((f) => `'${f}'`)
        .join(", ")})`;

      Get_FileName_RawData(queryfile_param); // API 請求
    }
  };

  //確認FileNamelist 狀況
  useEffect(() => {
    if (filenameList.length > 0 && SendFileName_search) {
      // console.log(
      //   "確認FileNamelist 最終狀況 = " + JSON.stringify(filenameList, null, 2)
      // );csv

      handleFileSelection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filenameList, SendFileName_search]);

  const clearViewItems = (event) => {
    // 清空以下儲存內容數據
    view_pursaleinvencolumn([...pursaleinvencolumn]);
    view_pursaleinvenItems([...pursaleinvenItems]);
    // setRowcatch_num(0); // 若需要重設
    // setFirst_ID(0); // 若需要重設
    // setLast_ID(0); // 若需要重設
  };

  const isPositiveInteger = (value) => {
    const num = Number(value);
    return Number.isInteger(num) && num > 0;
  };

  const isLarge_compare_ID = (ST_ID, ED_ID) => {
    const start_ID = Number(ST_ID);
    const end_ID = Number(ED_ID);
    // console.log("比較大小 Start_ID = " + start_ID + " End_ID =  " + end_ID);
    return end_ID >= start_ID;
  };

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setpopValues({
      ...popvalues,
      [name]: value,
    });

    if (name === "ID_head") {
      setStart_ID(value);
    } else if (name === "ID_end") {
      setEnd_ID(value);
    }
  };

  useEffect(() => {
    //判斷是否為正整數
    // const S_id = Start_ID.replace(/[^\d]/);
    // const E_id = End_ID.replace(/[^\d]/);

    //這邊判斷 開始ID和結束ID是否異常(正常為 開始S_id < 結束E_id 或 相等皆可查詢)
    if (Start_ID.trim() || End_ID.trim()) {
      if (Start_ID.toString() !== "" && End_ID.toString() !== "") {
        if (!isPositiveInteger(Start_ID)) {
          toast.error(`開始ID輸入 ${Start_ID} 非數字!`);
          return;
        } else if (!isPositiveInteger(End_ID)) {
          toast.error(`結束ID輸入 ${End_ID} 非數字!`);
          return;
        } else {
          //console.log("wait for fix 待處理");
          //比對結束ID是否大於開始ID
          if (!isLarge_compare_ID(Start_ID, End_ID)) {
            toast.error(`開始ID: ${Start_ID} 需要小於 結束ID ${End_ID}`);
            return;
          } //當輸入起始ID 或 結束ID 不是當下資料庫的索引範圍,這邊攔截不往下
          else if (
            parseInt(Start_ID) < First_ID ||
            (OverRaw_default === false && parseInt(End_ID) > Last_ID)
          ) {
            toast.error(`請確認目前輸入序號的範圍是否為此表單可搜尋!`);
            return;
          } else {
            //先清除原先暫存數據,再向後端擷取新索引
            clearViewItems();
            //----------更新查詢 頭和後 ID----------------
            have_exist_NEWID(true);
            set_stFrontID(Start_ID);
            set_edBackend_ID(End_ID);
            setcheck_ID_run(true);
            //-------------end----------------
            Get_Specify_rangeID_RawData();
          }
        }
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Start_ID, End_ID, OverRaw_default]);

  const Get_Specify_rangeID_RawData = async (e) => {
    try {
      const response = await axios.get(
        // `${config.apiBaseUrl}/purchsaleinvtory/view_rangeID_raw`,
        "http://localhost:3009/purchsaleinvtory/view_rangeID_raw",
        {
          params: {
            FormRawtable: FormRawtable ?? "",
            RadioValue: RadioValue ?? "",
            Start_ID: Start_ID ?? "",
            End_ID: End_ID ?? "",
            ColViewID: ColViewID ?? "",
          },
        }
      );

      const row_count = response.data.count;
      const content_AllData = response.data.rawdata;
      const column_list = response.data.colname;

      if (response.status === 200) {
        // console.log(
        //   "有接收view_rangeID_raw 回傳data = " +
        //     JSON.stringify(response.data, null, 2)
        // );
        // console.log(row_count);
        // console.log(content_AllData);
        // console.log(column_list);
        setraw_search_method(1);
        view_pursaleinvencolumn(column_list);
        view_pursaleinvenItems(content_AllData);
        setRowcatch_num(row_count);
        // console.log("row_count ID擷取數量= " + row_count);
        // console.log(
        //   "content_AllData 擷取範圍數據DATA = " +
        //     JSON.stringify(content_AllData, null, 2)
        // );
        // console.log("全部建名稱LIST: " + JSON.stringify(column_list, null, 2));
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
    }
  };

  const handleScroll = (e) => {
    // console.log(
    //   e.target.scrollHeight,
    //   e.target.scrollTop,
    //   e.target.clientHeight
    // );

    const bottom =
      e.target.scrollTop + 5 + e.target.clientHeight >= e.target.scrollHeight;

    if (bottom) {
      console.log("Reached the bottom");
      setVisibleRows((prevVisibleRows) => prevVisibleRows + 20); // Load next 20 rows
    }
  };

  const triggerQuery = (list) => {
    const queryfileList = list
      .filter((item) => item.mode === "input" && !!item.queryfile)
      .map((item) => item.queryfile);

    if (queryfileList.length > 0) {
      const queryfile_param = `(${queryfileList
        .map((f) => `'${f}'`)
        .join(", ")})`;
      Get_FileName_RawData(queryfile_param);
    }
  };

  const exportToCSV = (columns, data, filename, delimiter = ",") => {
    const headers = columns.map((col) => col.COLUMN_NAME);

    //先行將不合法或空行過濾掉
    const vaildData = data.filter((row, index) => {
      // 過濾條件：row 是物件、且至少一欄有資料（非 null/undefined/空字串）
      if (!row || typeof row !== "object") return false;

      // 假設 trayID 在 headers 中的欄位名稱是 trayID
      const trayID = row["trayID"]; // 根據實際欄位名稱來調整
      // 檢查 trayID 格式是否包含 '-'
      const trayIDHasDash = typeof trayID === "string" && trayID.includes("-");

      // 檢查 trayID 是否符合兩個字母 + `-` 格式
      // const isTrayIDValid = /^[A-Za-z]{2}-/.test(trayIDPrefix);

      const rowIndexKey = headers[0];
      const rowIndexVal = row[rowIndexKey];

      const isEmptyRow =
        rowIndexVal === 0 &&
        headers.slice(1).every((key) => {
          const cell = row[key];
          return cell === null || cell === undefined || cell === "";
        });

      // 如果 trayID 不符合格式，且該行是空行（row[0] === 0 且後續為空），則跳過該行
      if (isEmptyRow) {
        return false;
      }

      // 過濾條件：檢查 row[0] 是否為 0 且其他欄位全為空，若是則跳過此行
      // const isEmptyRow =
      //   row[0] === 0 &&
      //   Object.values(row)
      //     .slice(1) // 忽略 row[0]，檢查其餘欄位
      //     .every((cell) => cell === null || cell === undefined || cell === "");

      //過濾條件： 檢查 row[0] 是否為 0 且索引大於 0 的欄位全為空"",若是則跳過此行
      // if (
      //   row[index] === 0 &&
      //   Object.values(row)
      //     .slice(1)
      //     .every((cell) => cell === null || cell === undefined || cell === "")
      // ) {
      //   return false;
      // }

      // 檢查是否有至少一個欄位有值（非 null/undefined/空字串）
      // return typeof row === "object" && Object.keys(row).length > 0;
      const hasAnyValidValue = headers.some((h) => {
        const val = row[h];
        return val !== null && val !== undefined && val !== "";
      });

      return hasAnyValidValue;

      // return headers.some((h) => {
      //   const val = row[h];
      //   return val !== null && val !== undefined && val !== "";
      // });
    });

    //重整rows 結構,對應column 是否有mapping
    const rows = vaildData.map((row) =>
      headers
        .map((h) => {
          let cell = row[h] !== undefined ? row[h] : "";
          // 處理 Buffer 格式
          if (
            cell &&
            typeof cell === "object" &&
            cell.type === "Buffer" &&
            Array.isArray(cell.data)
          ) {
            if (!Number.isNaN(cell.data) && cell.data.length === 1) {
              // 單一 byte，可用作數值或字元
              cell = cell.data[0]; // 或 String.fromCharCode(cell.data[0])
            } else {
              // 將 Buffer 轉成字串（UTF-8）
              cell = new TextDecoder().decode(new Uint8Array(cell.data));
            }
          }

          return typeof cell === "string" && /[",\n]/.test(cell)
            ? `"${cell.replace(/"/g, '""')}"`
            : cell;
        })
        .join(delimiter)
    );

    //將欄位 和數據 一起打包
    const csvContent = [headers.join(delimiter), ...rows].join("\n");

    //重新自定義檔案名稱
    //一開始ferch數據
    if (raw_search_method === 0) {
      filename = FormRawtable + "_export_all.csv";
    } //指定ID 範圍
    else if (raw_search_method === 1) {
      filename = `${FormRawtable}_export_${Start_ID}_${End_ID}.csv`;
    } //指定檔案名稱範圍
    else if (raw_search_method === 2) {
      const prefix = filenameList[0].queryfile.slice(0, 3).toString();
      //console.log("經過調整取頭前3字元為:" + prefix);
      filename = `${FormRawtable}_export_${prefix}.csv`;
    }

    const BOM = "\uFEFF"; // UTF-8 BOM 確保 Excel 顯示中文正常
    const blob = new Blob([BOM + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = () => {
    const url = exportToCSV(
      pursaleinvencolumn,
      pursaleinvenItems,
      "export.csv"
    );
    setCsvUrl(url);
    toast.success("已產出csv");
  };

  // ✅ 使用者點選某項（即便是 index 0）
  const onSelectItem = (index) => {
    // // 你也可以依 index 改變 filenameList 狀態
    // const updatedList = filenameList.map((item, i) => ({
    //   ...item,
    //   mode: i === index ? "input" : "none",
    // }));

    // setFileNameList(updatedList);
    setSelectedIndex(index);
    setSendFileName_search(true);
    handleFileSelection(); // ✅ 確保立即觸發資料查詢
  };

  const handleFileChange = (e, index) => {
    const { name, value } = e.target;
    const list = [...filenameList];
    const currentItem = list[index];
    const upperValue = value.toUpperCase();

    setSendFileName_search(false);

    // 防呆：index 不存在
    if (!list[index]) return;

    //防止後續找尋ID範圍失效
    if (!check_ID_run) {
      toast.error("麻煩先行確認ID搜尋有無正常,TKS!");
      return;
    }

    //reduce 用來找出 最後一個非空白的 queryfile 的 index
    // 使用者只能輸入在 下一筆（lastFilledIndex + 1）或以前的欄位；
    // 當所有欄位是空白時，lastFilledIndex = -1，允許輸入 index 0
    const lastFilledIndex = [...list]
      .map((item) => item.queryfile.trim())
      .reduce((last, val, i) => (val ? i : last), -1);

    if (index > lastFilledIndex + 1) {
      toast.error("請依序輸入，不能跳過中間的欄位！");
      return;
    }

    // if (!value) {
    //   if (index <= 13) {
    //     // 保留 index 0~13，但設為空
    //     list[index][name] = "";
    //   } else {
    //     // index > 13 就移除
    //     list.splice(index, 1);
    //   }
    //   setFileNameList(list);
    //   return;
    // }

    // 如果是 select 下拉選擇，就直接更新值，不重新搜尋
    //若有候選清單，且目前是 dropdown 模式，切換為 input 模式
    if (
      currentItem?.candidates?.includes(value) &&
      currentItem.mode === "select"
    ) {
      console.log("select 有這邊調整 value =" + value);
      // list[index][name] = value;
      list[index] = {
        ...currentItem,
        [name]: value,
        isManual: false, // ⬅️ 明確轉為手動輸入模式 / 從 select 選擇，不是手動輸入
        mode: "input",
        candidates: [], // ⬅️ 直接重設成空，清除 dropdown
      };

      // 清除候選清單 → 鎖定為 input 顯示
      //delete list[index].candidates;
      triggerQuery(list); // ⬅️ 立刻查詢
      setFileNameList(list);
      return;
    }

    // ▼ 空值處理：只保留第 0 筆或單一欄位，其他刪除
    // if (!value) {
    //   // 空值：清空欄位，不刪除 index
    //   if (list.length === 1 || index === 0) {
    //     // 第 0 筆或最後一筆就保留，只清空內容
    //     // list[0] = { queryfile: "", isManual: true };
    //     // list[index][name] = "";

    //     list[index] = {
    //       ...list[index],
    //       queryfile: "",
    //       isManual: true,
    //       mode: "input",
    //     };
    //     delete list[index].candidates;
    //   } else {
    //     list.splice(index, 1);
    //   }

    //   // setFileNameList(
    //   //   list.length === 1
    //   //     ? [{ queryfile: "", isManual: true, mode: "input" }]
    //   //     : list
    //   // );
    //   setFileNameList(list);
    //   return;
    // }

    // 空值：清空欄位，不刪除 index
    if (!value) {
      list[index] = {
        queryfile: "",
        isManual: true,
        mode: "input",
        candidates: [],
      };
      //delete list[index].candidates;
      setFileNameList(list);
      return;
    }

    // ▼ Dropdown 選擇後，轉回 readonly input
    // ▼ 有輸入就更新值

    // 僅在已經是 input 模式時才允許更新值
    if (currentItem.mode === "input") {
      list[index] = {
        ...currentItem,
        queryfile: value,
        isManual: false, // 表示是手動輸入
      };
      setFileNameList(list);
    }

    //當有值keyin偵測
    const rules = {
      testmerge_pf: ["P", "K"],
      testmerge_cc1orcc2: ["C", "H"],
    };

    const isSearch_Valid = (rules[FormRawtable] || []).some((prefix) =>
      upperValue.startsWith(prefix)
    );

    if (!isSearch_Valid) {
      // eslint-disable-next-line no-unused-expressions
      FormRawtable === "testmerge_pf"
        ? toast.error(`請輸入P或K開頭!`)
        : toast.error(`請輸入C或H開頭!`);
      return;
    }

    //最新資料 list[index] ,不要用舊資料 filenameList[index]
    fetchPFCC_FileName(list[index], index);

    // console.log(
    //   "filenameList目前狀態為:" + filenameList.length,
    //   filenameList
    // );
  };

  const handleFileRemove = (index) => {
    // const list = [...filenameList];
    // list.splice(index, 1);
    // setFileNameList(list);

    setFileNameList((prevList) => {
      if (index < 0 || index >= prevList.length) return prevList; // 防呆
      const Fix_updated = [...prevList];
      Fix_updated.splice(index, 1);

      // 至少保留一筆空白欄位
      if (Fix_updated.length === 0) {
        return [
          {
            queryfile: "",
            isManual: true,
            mode: "input",
            candidates: [],
          },
        ];
      }

      return Fix_updated;
      // return Fix_updated.length === 0
      //   ? [
      //       {
      //         queryfile: "",
      //         isManual: true,
      //         mode: "input",
      //         candidates: [],
      //       },
      //     ] // 保底至少一欄存在
      //   : Fix_updated;
    });
  };

  const handleFileAdd = () => {
    // setFileNameList([...filenameList, { queryfile: "" }]);
    setFileNameList((prevList) => {
      if (prevList.length >= parseInt(filecount_Max)) {
        toast.error(`最多只能新增 ${filecount_Max} 筆！`);
        return prevList;
      }
      return [
        ...prevList,
        {
          queryfile: "",
          isManual: true,
          mode: "input",
          candidates: [], // optional，可省略
        },
      ];
    });
  };

  const handleCancel = () => {
    if (csvUrl) {
      URL.revokeObjectURL(csvUrl);
      setCsvUrl(null);
      console.log(`已經清除${csvUrl},已取消匯出/釋放資源`);
    }
    closeModal();

    // // 重置表單（假設你有使用 useRef 取得 form DOM）
    // formRef.current?.reset();
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    // console.log("Form Data Submitted:", FormRawtable);
    //清空flag
    have_exist_ID(false);
    setPFCC1andCC2(false);
    closeModal(); // Close the modal after submission
  };

  useEffect(() => {
    const fetchtable_row = async () => {
      try {
        const response = await axios.get(
          // `${config.apiBaseUrl}/purchsaleinvtory/view_schematicraw`,
          "http://localhost:3009/purchsaleinvtory/view_schematicraw",
          {
            params: { FormRawtable: FormRawtable, RadioValue: RadioValue },
          }
        );
        // console.log(JSON.stringify(response.data, null, 2));

        // console.log(
        //   "recycle_photo typeof:",
        //   typeof response.data.rawdata[0].recycle_photo,
        //   response.data.rawdata[0].recycle_photo
        // );

        view_pursaleinvencolumn(response.data.colname);
        view_pursaleinvenItems(response.data.rawdata);
        setRowcatch_num(response.data.count);
        //將搜尋ID 範圍 flag 啟動,原先 exist_ID 為原始 ID 範圍
        have_exist_NEWID(false);
      } catch (error) {
        console.error("取得資料錯誤", error);
      }
    };

    fetchtable_row();
  }, []);

  useEffect(() => {
    // console.log("總鍵名:", pursaleinvencolumn);
    // console.log("總數據:", pursaleinvenItems);

    if (!pursaleinvenItems?.[0]) {
      return;
    }

    //判斷是否有ID欄位
    pursaleinvencolumn.forEach((item) => {
      if (item.COLUMN_NAME === "ID" || item.COLUMN_NAME === "id") {
        have_exist_ID(true);
        const col_idorID = item.COLUMN_NAME; // 使用變數ID或id指向相應屬性
        const first_ID = pursaleinvenItems[0][col_idorID];
        const last_ID =
          pursaleinvenItems[pursaleinvenItems.length - 1][col_idorID];

        // console.log("數據first 最前頭ID號碼為:" + first_ID);
        // console.log("數據last  最後尾ID號碼為:" + last_ID);
        //將ID鍵名 name 存入
        setColViewID(col_idorID);

        //當頁面第一次刷新資料設定或若搜尋有超出以下範圍,之後搜尋都不在改變原項目ID
        if (!exist_NewID) {
          setFirst_ID(first_ID);
          setLast_ID(last_ID);
        }

        if (Rowcatch_num >= 150000) setOverRaw_default(true);
      }
    });

    // 判斷目前tablename 是否為PF或CC1andCC2
    if (
      FormRawtable === "testmerge_pf" ||
      FormRawtable === "testmerge_cc1orcc2"
    ) {
      setPFCC1andCC2(true); // 切換到PF或CC1andCC2
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pursaleinvenItems, pursaleinvencolumn, Rowcatch_num]);

  useEffect(() => {
    if (csvUrl) {
      toast.success("已產出csv");
    } else {
      console.log("已經清除csvUrl,已取消匯出/釋放資源");
    }
  }, [csvUrl]);

  return (
    <div className="popform_display">
      <form onSubmit={handleSubmit}>
        <div className="modal-overlay">
          <div className="modal-container">
            <div style={{ display: "flex", justifyContent: "center" }}>
              <label
                style={{
                  fontWeight: "bold",
                  fontStyle: "normal",
                  paddingRight: "180px",
                  paddingTop: "20px",
                  fontSize: "41px",
                  // marginInline: "10px",
                }}
              >
                <div>
                  資料量:
                  {parseInt(Rowcatch_num) === 150000
                    ? "超過150000筆資料"
                    : Rowcatch_num}
                  {exist_ID && (
                    <span style={{ paddingLeft: "28px" }}>
                      總序號(首):{First_ID} , 總序號(最後):{Last_ID}
                    </span>
                  )}
                </div>
                {exist_NewID && (
                  <div className="alt1">
                    <span>查序號(首):{st_FrontID} , </span>
                    <span>查序號(最後):{ed_Backend_ID}</span>
                  </div>
                )}
              </label>

              <h3
                style={{
                  // justifycontent: "center",
                  // marginRight: "120px",
                  // paddingTop: "25px",
                  // fontSize: "45px",
                  // fontfamily: "Bungee Spice",
                  // color: "#FFFF00",
                  // backgroundColor: "#0000E3	",
                  marginTop: "35px",
                  marginRight: "120px",
                  paddingTop: "25px",
                  paddingLeft: "12px",
                  fontSize: "41px",
                  fontFamily: "Bungee Spice", // ← 注意這裡要大寫 F
                  color: "#FFFF00",
                  backgroundColor: "#0000E3",
                }}
              >
                {FormRawtable} 表單當前資料數據▼
              </h3>
              <br />
              <button type="button" className="csv-btn" onClick={handleExport}>
                確認產出csv
              </button>
              <button
                type="button"
                style={{ marginLeft: "200px", backgroundColor: "red" }}
                onClick={handleCancel}
              >
                取消
              </button>
            </div>
            <div
              style={{
                maxHeight: "1000px",
                overflowY: "auto",
                display: "block",
                width: "100%", // Optional, set width if needed
              }}
            >
              <Table
                style={{
                  textAlign: "center",
                  verticalAlign: "middle",
                  width: "100%",
                }}
                striped
                bordered
                hover
              >
                <thead>
                  <tr>
                    {pursaleinvencolumn.map((col, index) => (
                      <th key={index}>{col.COLUMN_NAME}</th>
                    ))}
                  </tr>
                </thead>
              </Table>

              <div
                style={{
                  maxHeight: "1000px",
                  overflowY: "auto",
                  display: "block",
                  width: "100%", // Optional, set width if needed
                }}
                onScroll={handleScroll} // Scroll event handler
              >
                <Table
                  style={{
                    textAlign: "center",
                    verticalAlign: "middle",
                    width: "100%",
                  }}
                  striped
                  bordered
                  hover
                >
                  <tbody
                    style={{
                      maxHeight: "300px",
                      overflowY: "auto",
                      flexDirection: "column",
                    }}
                    onScroll={handleScroll}
                  >
                    {pursaleinvenItems
                      .slice(0, visibleRows)
                      .map((item, rowIndex) => (
                        <tr key={rowIndex}>
                          {pursaleinvencolumn.map((col, colIndex) => (
                            <td key={colIndex}>
                              {renderCell(
                                col.COLUMN_NAME,
                                item[col.COLUMN_NAME]
                              )}
                            </td> // Use COLUMN_NAME to access item values
                          ))}
                          ;
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </div>
            </div>

            {exist_ID && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "15px",
                  justifyContent: "center",
                }}
              >
                <label>ID 開始:</label>
                <input
                  type="text"
                  name="ID_head"
                  value={popvalues.ID_head}
                  onChange={handleChange}
                  placeholder="輸入數字(首筆)"
                  style={{ marginLeft: "5px", maxWidth: "130px" }}
                />
                <br />
                <label>ID 結束:</label>
                <input
                  type="text"
                  name="ID_end"
                  value={popvalues.ID_end}
                  onChange={handleChange}
                  placeholder="輸入數字(截止)"
                  style={{ marginLeft: "5px", maxWidth: "130px" }}
                />
              </div>
            )}
            <br />
            <br />
            {PFCC1andCC2 && (
              <div>
                <label>使用CSV分析原數據</label>
                <div className="file-entry-container">
                  {filenameList.map((singlequeryfile, index) => {
                    // const isLastManual =
                    //   singlequeryfile.isManual &&
                    //   filenameList.filter((f) => f.isManual).slice(-1)[0] ===
                    //     singlequeryfile;
                    const manualEmptyInputs = filenameList
                      .map((f, idx) => ({ ...f, idx }))
                      .filter((f) => f.isManual && !f.queryfile);

                    const isLastEmptyInput =
                      manualEmptyInputs.length &&
                      manualEmptyInputs[manualEmptyInputs.length - 1].idx ===
                        index;

                    const showAddButton =
                      isLastEmptyInput && filenameList.length < filecount_Max;

                    return (
                      <div key={index} className="file-entry">
                        <div className="file-input">
                          {singlequeryfile.mode === "select" &&
                          singlequeryfile.candidates &&
                          singlequeryfile.candidates.length > 0 ? (
                            <>
                              <select
                                name="queryfile"
                                value={singlequeryfile.queryfile}
                                className={`query-select ${
                                  singlequeryfile.isManual
                                    ? "manual-style"
                                    : "auto-style"
                                } select-large`}
                                onChange={(e) => {
                                  handleFileChange(e, index); // ⬅ 原本處理 input 值改變
                                  onSelectItem(index); // ⬅ 加入觸發資料查詢
                                }}
                              >
                                {singlequeryfile.candidates.map((option, i) => (
                                  <option key={i} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => toggleInputMode(index, "input")}
                              >
                                手動輸入
                              </button>
                            </>
                          ) : (
                            <>
                              <input
                                name="queryfile"
                                type="text"
                                id="queryfile"
                                // readOnly={!singlequeryfile.isManual}
                                className={`query-input ${
                                  singlequeryfile.isManual
                                    ? "manual-style"
                                    : "auto-style"
                                }`}
                                placeholder={
                                  FormRawtable === "testmerge_pf"
                                    ? "請輸入P或K開頭!"
                                    : "請輸入C或H開頭!"
                                }
                                value={singlequeryfile.queryfile}
                                onChange={(e) => handleFileChange(e, index)}
                                required
                              />
                              {singlequeryfile.candidates &&
                                singlequeryfile.candidates.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleInputMode(index, "select")
                                    }
                                  >
                                    選擇檔案
                                  </button>
                                )}
                            </>
                          )}
                          {showAddButton &&
                            filenameList.length < filecount_Max && (
                              <button
                                type="button"
                                name="addbtn"
                                onClick={handleFileAdd}
                                className="add-btn"
                              >
                                <span>增加</span>
                              </button>
                            )}
                        </div>
                        <div className="remove-btn-container">
                          {filenameList.length !== 1 && (
                            <button
                              type="button"
                              onClick={() => handleFileRemove(index)}
                              className="remove-btn"
                            >
                              <span>移除</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  ;
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default Popform;
