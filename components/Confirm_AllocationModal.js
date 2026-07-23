import React, { useState, useEffect } from "react";
import Button from "react-bootstrap/Button";
//成功提示套件
import { toast } from "react-toastify";


// 按鈕確認组件
const Confirm_AllocationModal = ({ show, onHide, distribute_info , centered }) => {

  const { final_weight, final_sum_calculation, all_allocate_packet , diff_tolence_val, g_unitText_type ,name,memberID ,radiomethod} = distribute_info || {};
  const [loading_allocation, setloading_allocation] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!show || !distribute_info) return null; // 不顯示時直接 return null

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
  width: 350,
};


  return (
    <>
     {(
        <div style={overlayStyle}>
            <div style={modalStyle}>
            <h3 style={{ color: "#3384b9" }}>※ 分配提交確認</h3>
            <p>
                採購單號總量(合計)為：<b>{final_weight}{g_unitText_type}</b>
                <br />
                最後要提交總量(合計)為 <b>{(radiomethod  === "normal")?final_weight:final_sum_calculation }{g_unitText_type}</b>
                   <br />
                配發量為: <b>{all_allocate_packet}包</b>
                   <br />
                與實際採購誤差量: <b>{(radiomethod  === "normal")?Number("0").toFixed(2):diff_tolence_val}{g_unitText_type}</b>
                   <br />
                操作人/工號: {name}/{memberID}
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                {/* <button onClick={() => setShowConfirm(false)} disabled={loading_allocation}> */}
               <button onClick={() => onHide("No")} disabled={loading_allocation}>
                取消
                </button>
                <button
                style={{ backgroundColor: "#5ec554", color: "white" }}
                disabled={loading_allocation}
                onClick={async () => {
                    
                    try {                        
                        setloading_allocation(true);                                            
                        onHide("Yes"); // ✅ 成功後通知父層關閉 Modal , Yes為通知父階層字串             
                        // setShowConfirm(false);
                    } catch (err) {
                        toast.error("提交失敗: " + err.message);
                    } finally {
                        setloading_allocation(false);                                                 
                    }
                }}
                >
                {loading_allocation ? "分配中..." : "確定分配"}
                </button>
            </div>
        </div>
      </div>
    )}
  </>
 );
};

export default Confirm_AllocationModal;