/* eslint-disable react-hooks/rules-of-hooks */
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import dayjs from "dayjs";
import config from "../../config.js";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import gsap from "gsap";
import moment from "moment";
import { group_Mes_Error_Status } from "../../mes_remak_data.jsx";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Container, Row, Col, Card } from "react-bootstrap";
import "./index.scss";

const DATE_PAGE_SIZE = 6; // 每頁顯示6個日期 (3列 × 2行)
const ITEM_PAGE_SIZE = 5; // 每日期顯示 5 筆錯誤

const cardVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const Mes_Error_StatusView = () => {
  const { sideoption } = useParams();
  const [select_error, setSelectedError] = useState(["All全部"]);
  const [runlogDate, setRunLogDate] = useState(
    // moment(new Date()).local("zh-tw").format("YYYY-MM-DD")
    ""
  );
  const [mes_error_data, setmes_error_data] = useState([]);
  const [allowedDates, set_allowedDates] = useState([]);
  const [error_group_pages, set_error_group_pages] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [inputPage, setInputPage] = useState(""); // 新增輸入頁狀態
  const [itemPageIndexMap, setItemPageIndexMap] = useState({});
  const navigate = useNavigate();

  const current_group_error_options = sideoption ? `${sideoption}_Error` : [];

  // 取出對應的群組資料
  const currentGroup = useMemo(() => {
    // 根據 sideoption 動態生成對應的群組鍵名

    return group_Mes_Error_Status.find((g) => g[current_group_error_options]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideoption]);

  const error_options = currentGroup
    ? currentGroup[current_group_error_options]
    : [];

  const formatDate_local = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // 檢查是否是可選日期
  const isAllowedDate = (date) =>
    allowedDates.some(
      (d) =>
        d.getFullYear() === date.getFullYear() &&
        d.getMonth() === date.getMonth() &&
        d.getDate() === date.getDate()
    );

  // Checkbox 行為邏輯（包含 All全部）
  const handleCheckboxChange = (value) => {
    //偵測是否有選 All全部，有的話先移除
    setSelectedError((prev) => {
      let checkset = [...prev];

      if (value === "All全部") {
        // 若目前已選中 → 嘗試取消時需防止全空
        if (prev.includes("All全部")) {
          toast.error(`請至少保留一個錯誤類型`);
          return prev; // 不取消
        }
        // 若原本未選 → 清空其他並勾選 All
        if (runlogDate !== "") setRunLogDate(""); // ← 清空日期選擇
        return ["All全部"];
      }

      // ✅ 若原本有 "All全部"，切換到個別選項時移除它
      if (prev.includes("All全部")) {
        if (runlogDate !== "") setRunLogDate(""); // ← 清空日期選擇
        checkset = [value];
        return checkset;
      }

      // ✅ 一般勾選 / 取消邏輯
      if (prev.includes(value)) {
        // 嘗試取消勾選
        checkset = prev.filter((v) => v !== value);
      } else {
        // 新增勾選
        checkset = [...prev, value];
      }

      // ❗ 防止全部被取消 , 在使用者嘗試把最後一個勾勾取消時，直接忽略那次操作
      if (checkset.length === 0) {
        //alert("請至少保留一個錯誤類型。");
        toast.error(`請至少保留一個錯誤類型`);
        return prev; // 不更新 state
      }

      //判定改變前後是否相同
      const isChanged =
        prev.length !== checkset.length ||
        prev.some((v, i) => v !== checkset[i]);

      if (isChanged && runlogDate !== "") {
        setRunLogDate(""); // ← 清空
      }

      return checkset;
    });
  };

  const getFilteredGroupedData = (data, canlender_logDate) => {
    const grouped = data.reduce((acc, item) => {
      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      return acc;
    }, {});

    if (canlender_logDate && grouped[canlender_logDate]) {
      return { [canlender_logDate]: grouped[canlender_logDate] };
    }
    return grouped;
  };

  useEffect(() => {
    fetchError_fromMesDB_or_Log();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [select_error, runlogDate]);

  useEffect(() => {
    // console.log("全部error日期列 =", allowedDates);
    // console.log("error數據庫數量 =", mes_error_data.length);
    // console.log("mes_error_data =", JSON.stringify(mes_error_data, null, 2));

    //將資料依日期分組
    const groupedData = getFilteredGroupedData(mes_error_data, runlogDate);

    set_error_group_pages(groupedData);

    // 如果當前頁面超過總頁數，則調整當前頁面

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes_error_data, allowedDates]);

  // ======== 分頁函式（每頁 6 筆） ========
  function paginate(arr = [], size = ITEM_PAGE_SIZE) {
    // arr = [] 確保永遠不 undefined
    const pages = [];
    for (let i = 0; i < arr.length; i += size) {
      pages.push(arr.slice(i, i + size));
    }
    return pages;
  }

  // 計算所有日期 + 分頁
  const groupsWithPages = useMemo(() => {
    return Object.keys(error_group_pages).map((date) => {
      const items = error_group_pages[date] || []; // 確保不會 undefined
      const pages = paginate(items, ITEM_PAGE_SIZE); // 永遠是 array（至少 []）

      return {
        date,
        pages, // <-- 每日期的 items 分頁
        totalPages: pages.length,
        // pageIndex: 0, // <-- 每個日期自己的分頁 index
      };
    });
  }, [error_group_pages]);

  const handleErrorDateChange = (event) => {
    const { name, value } = event.target;

    setRunLogDate(value);
  };

  const fetchError_fromMesDB_or_Log = async () => {
    console.log("實際異常選擇日期為: " + runlogDate);
    try {
      const response = await axios.get(
        //`${config.apiBaseUrl}/instructionalflow/ng_record_content`,
        `http://localhost:3009/instructionalflow/ng_record_content`,
        {
          params: {
            errorstatus: encodeURIComponent(
              Array.isArray(select_error)
                ? select_error.join("/")
                : select_error || "All全部"
            ),
            runlogDate: runlogDate,
            sideoption: sideoption,
          },
        }
      );

      // console.log(
      //   "回傳異常資訊:",
      //   JSON.stringify(response.data.allinfo, null, 2)
      // );
      // console.log("log紀錄日期列:", response.data.log_date);

      if (!response.data?.allinfo?.length) {
        toast.info("查無資料，請調整選單或日期");
        setmes_error_data([]);
        set_allowedDates([]);
        return;
      }

      // 將字串日期轉成 Date 物件陣列
      const error_record_Dates = response.data.log_date
        .map((d) => new Date(d))
        .filter((d) => !isNaN(d));

      setmes_error_data(response.data.allinfo || []);
      set_allowedDates(error_record_Dates || []);
    } catch (error) {
      console.error("Error fetch api route for ng_record_content :", error);
      toast.error("發生錯誤，請稍後再試");
      return null;
    }
  };

  const allDates = useMemo(
    () => Object.keys(error_group_pages).sort(),
    [error_group_pages]
  );
  const totalPages = Math.ceil(groupsWithPages.length / DATE_PAGE_SIZE);

  // 目前頁要顯示的日期
  const currentDates = groupsWithPages.slice(
    (currentPage - 1) * DATE_PAGE_SIZE,
    currentPage * DATE_PAGE_SIZE
  );

  console.log("groupsWithPages =", groupsWithPages);
  console.log("currentDates =", currentDates);
  console.log("currentDates.length = " + currentDates.length);
  console.log("totalPages =", totalPages);

  // 外層換頁
  const goToDatePage = (page) => {
    // 防止超出範圍
    page > totalPages
      ? setCurrentPage(totalPages)
      : page < 1
      ? setCurrentPage(1)
      : setCurrentPage(page);
    setInputPage(""); // 清空 input
  };

  const goToPage = (page) => {
    // 防止超出範圍
    page > totalPages
      ? setCurrentPage(totalPages)
      : page < 1
      ? setCurrentPage(1)
      : setCurrentPage(page);
    setInputPage(""); // 清空 input
  };

  // 換頁事件
  const nextPage = () => setCurrentPage((p) => Math.min(p + 1, totalPages));
  const prevPage = () => setCurrentPage((p) => Math.max(p - 1, 1));

  // 切換某個日期內的 items 分頁 ,內層換頁（每個日期）
  const change_ItemPage = (date, newPageIndex, MaxPage) => {
    //若使用下列----start----方式，會導致無法正確rerender
    // const updated = [...itemPageIndexMap];
    // updated[dateIdx] = Math.max(0, Math.min(newPageIndex, currentDates[dateIdx].totalPages - 1));
    // setItemPageIndexMap(updated);
    // const updated = [...currentDates];
    // const item = updated[dateIdx];

    // item.pageIndex = Math.max(0, Math.min(newPageIndex, item.totalPages - 1));
    // // 強制 rerender：不改 reference 不會 rerender
    // setCurrentPage((p) => p + 0);
    //----- end -----

    //避免「切換頁面時 currentDates 還在重算」而導致 index 不一致

    setItemPageIndexMap((prev) => ({
      ...prev,
      [date]: Math.max(0, Math.min(newPageIndex, MaxPage - 1)),
    }));
  };

  // 若沒有匹配的群組，顯示提示
  if (!currentGroup || !error_options) {
    return (
      <div style={{ padding: 20, color: "gray" }}>
        ⚠️ 找不到對應群組：「{current_group_error_options}」
      </div>
    );
  }

  return (
    <div className="mes_error_statusview">
      <div
        style={{
          display: "flex",
          justifyContent: "center", // 水平置中
          alignItems: "center", // 垂直置中
          height: "10vh", // 撐滿整個視窗高度（可依需求調整）
          paddingTop: "90px",
          fontSize: "3.5rem",
          fontWeight: "900",
          fontFamily: "微軟正黑體",
          margin: "0 0 5vh",
          gap: "5px",
        }}
      >
        MES:{sideoption}站異常狀態查詢
      </div>
      <br />
      {/* 換行區塊 */}

      <div
        style={{
          marginTop: "12px",
          paddingInline: "10px",
          fontSize: "1.9rem",
          color: "#cb3437ff",
          border: "1px solid #ccccccff",
          borderRadius: "8px",
          backgroundColor: "#e7e5d0ff",
          width: "fit-content",
        }}
      >
        <strong>目前選擇：</strong>{" "}
        {/* {select_error.length ? select_error.join("/ ") : "（無）"} */}
        <div
          style={{
            backgroundColor: "rgba(221, 246, 234, 1)", // 灰底
            border: "1px solid #ccc", // 外框
            borderRadius: "28px",
            fontSize: "1.6rem",
            padding: "2px 5px",
            marginTop: "1px",
            display: "flex",
            flexWrap: "wrap", // ✅ 允許自動換行
            gap: "10px", // 每個項目的間距
          }}
        >
          {error_options.map((opt) => (
            <label key={opt} style={{ display: "block", marginLeft: 16 }}>
              <input
                type="checkbox"
                checked={select_error.includes(opt)}
                onChange={() => handleCheckboxChange(opt)}
              />
              {opt}
            </label>
          ))}
          {/* 日期區塊 */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              marginLeft: "auto",
              alignContent: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                marginRight: "20px",
                color: "#0a1986ff",
                fontSize: "1.7rem",
              }}
            >
              <label htmlFor="start" style={{ marginRight: "20px" }}>
                <div
                  style={{
                    textWrap: "nowrap",
                    paddingLeft: "101px",
                    marginBlock: "3px",
                  }}
                >
                  異常產生日期查閱
                </div>
                {/* <div style={{ paddingLeft: "25px" }}>logdate</div> */}
              </label>
              <DatePicker
                id="run_date"
                selected={runlogDate}
                onChange={(date) => {
                  setRunLogDate(date ? formatDate_local(date) : "");
                  if (date !== "") {
                    setCurrentPage(1); // 自動切回第一頁
                  }
                }}
                includeDates={allowedDates} // ✅ 僅允許這些日期
                dateFormat="yyyy-MM-dd"
                placeholderText="選擇異常產出日期"
                dayClassName={(date) =>
                  isAllowedDate(date) ? "allowed-day" : "disabled-day"
                }
                display
                popperPlacement="bottom"
              />
            </div>
          </div>
        </div>
      </div>
      {/* 顯示異常訊息版 */}
      <div className="p-6 w-full flex flex justify-center items-center">
        <div className="grid grid-cols-3 grid-rows-2 gap-6 w-full">
          {currentDates.slice(0, 6).map((group, idx) => {
            const pageIndex = itemPageIndexMap[group.date] ?? 0; // 預設第 0 頁
            const currentItems = group.pages[pageIndex] || [];
            return (
              <div
                key={group.date}
                className="bg-white shadow border border-gray-300 rounded-xl p-5 space-y-4"
              >
                {/* 日期標題 */}
                <h2 className="text-lg font-bold text-gray-800">
                  {group.date}（
                  {group.pages.reduce((sum, page) => sum + page.length, 0)} 筆）
                </h2>

                {/* 錯誤列表 */}
                <div className="space-y-2">
                  {currentItems.map((item, i) => (
                    <div
                      key={i}
                      className="p-3 bg-gray-50 rounded border border-gray-200"
                    >
                      <div className="text-sm font-medium text-gray-800">
                        {item.filename} {"    :"}
                        {item.error_status}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 日期內 item 分頁控制 */}
                {group.totalPages > 1 && (
                  <div className="flex justify-between items-center mt-3">
                    <button
                      onClick={() =>
                        change_ItemPage(
                          group.date,
                          pageIndex - 1,
                          group.totalPages
                        )
                      }
                      disabled={pageIndex === 0}
                      className="px-2 py-1 bg-gray-200 rounded disabled:opacity-40"
                    >
                      上一筆
                    </button>

                    <span className="text-sm text-gray-600">
                      {pageIndex + 1} / {group.totalPages}
                    </span>

                    <button
                      onClick={() =>
                        change_ItemPage(
                          group.date,
                          pageIndex + 1,
                          group.totalPages
                        )
                      }
                      disabled={pageIndex === group.totalPages - 1}
                      className="px-2 py-1 bg-gray-200 rounded disabled:opacity-40"
                    >
                      下一筆
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 分頁圓點 */}
      <div className="flex justify-center mt-4 space-x-2 flex-wrap">
        {Array.from({ length: totalPages }).map((_, idx) => {
          const page = idx + 1;
          return (
            <button
              key={page}
              onClick={() => goToPage(page)}
              className={`w-3 h-3 rounded-full transition-all ${
                currentPage === page ? "bg-blue-600 scale-110" : "bg-gray-400"
              }`}
            />
          );
        })}
      </div>

      {/* 點擊頁碼 */}
      <div className="flex justify-center mt-4 space-x-2 flex-wrap">
        {Array.from({ length: totalPages }).map((_, idx) => {
          const page = idx + 1;
          return (
            <button
              key={page}
              onClick={() => goToPage(page)}
              className={`px-3 py-1 rounded transition-colors ${
                currentPage === page
                  ? "bg-blue-600 text-white scale-110"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {page}
            </button>
          );
        })}
      </div>

      {/* 上下頁 + 直接跳頁 */}
      <div className="flex justify-center items-center gap-4 mt-6 flex-wrap">
        <button
          onClick={prevPage}
          disabled={currentPage === 1}
          className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
        >
          ⬅ 上一頁
        </button>

        <span>
          第 {currentPage} / {totalPages} 頁
        </span>

        <button
          onClick={nextPage}
          disabled={currentPage === totalPages}
          className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
        >
          下一頁 ➡
        </button>

        <input
          type="number"
          placeholder="頁數"
          value={inputPage}
          onChange={(e) => setInputPage(e.target.value)}
          className="w-16 px-2 py-1 border rounded"
          onKeyDown={(e) => e.key === "Enter" && goToPage(Number(inputPage))}
        />
        <button
          onClick={() => goToPage(Number(inputPage))}
          className="px-3 py-1 bg-blue-500 text-white rounded"
        >
          跳轉
        </button>
      </div>
    </div>
  );
};

export default Mes_Error_StatusView;
