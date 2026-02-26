import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import api from '../api';
import { use } from 'react';


function ListNoSet (
   {
    show , 
    onHide,
    centered,
    selectMixing,
   }
){

    const [data, setData] = useState(null);
    const [newListNo , setNewListNo] = useState(null);
    const [employeeId , setEmployeeId] = useState(null);
    
    console.log("selectMixing  :", selectMixing);
    console.log("data  :", data);


    useEffect(() => {
    }, [selectMixing]);

    const localStorageNow = () => {
        let dataNow = "";
        if (selectMixing === "正極混漿") {
            dataNow = localStorage.getItem('mixing_Cathode');
        } else if (selectMixing === "負極混漿") {
            dataNow = localStorage.getItem('mixing_Anode');
        } else {
            console.error("未知的 selectMixing:", selectMixing);
            return null;
        }
        try {
            return JSON.parse(dataNow);
        } catch (error) {
            console.error("解析 localStorage 資料失敗:", error);
        }
    }

    const handleClick = async() => {
        const dataNow = localStorageNow();

        let mixingKey = "";
        switch(selectMixing){
            case "正極混漿":
                mixingKey = 'mixing_Cathode';
                break;
            case "負極混漿":
                mixingKey = 'mixing_Anode';
                break;
            default:
                // Handle default case
                return;
        }
        localStorage.setItem(mixingKey, JSON.stringify({ ...dataNow, ListNo: newListNo }));
        onHide();

    try {
        const response = await api?.call_postLotNoNotify_backend(
            selectMixing,
            newListNo,
            employeeId
        );

        console.log("lotNoNotify_backend response  :", response);
    } catch (error) {
        console.error("lotNoNotify_backend error:", error);
    }
    }
        

    return (
         <Modal show={show} onHide={onHide} backdrop="static" centered={centered} className="engineerLoginModal"> 
            <Modal.Header closeButton>
                <Modal.Title className='w-100 text-center'>
                    <div className='fs-1 fw-bolder '>
                        New list No. setting
                    </div>
                </Modal.Title>
            </Modal.Header>
            
            <Modal.Body>
                <div>
                    <Form.Label className="w-100 text-center fw-bolder fs-5">List No.</Form.Label>
                    <Form.Control 
                        className='mb-2'
                        type="text" 
                        placeholder="輸入新的List No." 
                        value={newListNo || ''} 
                        onChange={(e) => setNewListNo(e.target.value)} 
                    />
                    <Form.Label className="mb-2 w-100 text-center fw-bolder fs-5">Update Employee ID</Form.Label>
                    <Form.Control 
                        type="text" 
                        placeholder="輸入更新人員工號" 
                        value={employeeId || ''} 
                        onChange={(e) => setEmployeeId(e.target.value)} 
                    />
                </div>
            </Modal.Body>
            
            <Modal.Footer style={{ justifyContent: "center" }}>
                <Button 
                    variant="primary" 
                    onClick={handleClick}
                    disabled={!newListNo || !newListNo.trim()}
                >
                    確認 | Confirm
                </Button>
                <Button variant="secondary" onClick={onHide}>
                    取消 | Cancel
                </Button>
            </Modal.Footer>
        </Modal>
    )
}

export default ListNoSet;