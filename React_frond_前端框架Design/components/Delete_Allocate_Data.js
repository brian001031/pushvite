import React, { useState, useEffect } from "react";
import Button from "react-bootstrap/Button";
import dayjs from "dayjs";
//成功提示套件
import { toast } from "react-toastify";

//輸出成 YYYY-MM-DD hh:mm:ss AM/PM
function formatDate(dateStr) {
    const date = new Date(dateStr);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    let hour = date.getHours();
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");

    const ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;

    return `${year}-${month}-${day} ${String(hour).padStart(2, "0")}:${minute}:${second} ${ampm}`;
}

// 按鈕確認组件
const Delete_Allocate_Data = ({ show, onHide, del_notifyinfo , centered }) => {

  const { id , form_id , product_name ,product_model, created_at, already_locate_number} = del_notifyinfo || {};
  const [delete_uniform, set_delete_uniform] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!show || !del_notifyinfo) return null; // 不顯示時直接 return null

// 若不仰賴父階層控制則使用以下
//   useEffect(() => {
//     if(distribute_info !==null)
//         setShowConfirm(true);
//   }, [distribute_info]);


  const overlayStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
};

const modalStyle = {
  background: "white",
  padding: 20,
  borderRadius: 8,
  width: 550,
};


  return (
    <>
     {(
        <div style={overlayStyle}>
            <div style={modalStyle}>
            <h3 style={{ color: "#d591b6" }}>※ 將刪除已入庫配料記錄確認</h3>
            <p>
                 採購工序及單號為：<b>{id}{"-"}{form_id}</b>
                 <br />
				 物料名與規格: <b>{product_name}{"/"}{product_model}</b>
                 <br />
                 入庫記帳分配量: <b>{already_locate_number}包</b>
                 <br />
                 入庫日期時間: {formatDate(created_at)}
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                {/* <button onClick={() => setShowConfirm(false)} disabled={delete_uniform}> */}
               <button onClick={() => onHide("No")} disabled={delete_uniform}>
                取消
                </button>
                <button
                style={{ backgroundColor: "#2f8bc8", color: "white" }}
                disabled={delete_uniform}
                onClick={async () => {
                    
                    try {                        
                        set_delete_uniform(true);                                            
                        onHide("Yes"); // ✅ 成功後通知父層關閉 Modal , Yes為通知父階層字串             
                        // setShowConfirm(false);
                    } catch (err) {
                        toast.error("提交失敗: " + err.message);
                    } finally {
                        set_delete_uniform(false);                                                 
                    }
                }}
                >
                {delete_uniform ? "等待中..." : "確定刪除"}
                </button>
            </div>
        </div>
      </div>
    )}
  </>
 );
};

export default Delete_Allocate_Data;