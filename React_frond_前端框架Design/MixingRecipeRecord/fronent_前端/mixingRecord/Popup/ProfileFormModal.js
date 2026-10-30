// ProfileFormModal.js
import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import '../style.scss'; // 引入樣式檔案
import api from '../api'; // 引入 API 函數

function ProfileFormModal({ show, onBackSelect, onProfileSubmitted, selectedRole , centered , selectMixing , onShowMessage}) {
  
  const [employeeName01, setEmployeeName01] = useState(''); // 新增操作員1的姓名狀態
  const [employeeName02, setEmployeeName02] = useState(''); // 新增操作員2的姓名狀態
  const [employeeId01, setEmployeeId01] = useState(''); // 新增操作員1的員工編號狀態
  const [employeeId02, setEmployeeId02] = useState(''); // 新增操作員2的員工編號狀態

  
  const [error, setError] = useState('');
  const [errorText, setErrorText] = useState('');

  

  // 當 Modal 顯示時，重置表單和錯誤訊息
  useEffect(() => {
    if (show) {
      setEmployeeName01('');
      setEmployeeName02('')
      setEmployeeId01('');
      setEmployeeId02('');
      setError('');
    }
  }, [show]);

const handleOperationProfileSubmit = () => {
    setError(''); // 清除之前的錯誤訊息

    if (!employeeId01.trim() || !employeeId02.trim() ||!employeeName01.trim() || !employeeName02.trim()) {
      const errorMessage = '需填入兩位員工資訊！Login system must have two member info!';
      setError(errorMessage);
      setErrorText(errorMessage);
      if (onShowMessage) onShowMessage('error', errorMessage);
      return;
    }

    const profileData = {
      employeeName01,
      employeeId01,
      employeeName02,
      employeeId02,
      selectedRole
    };
    
    // 根據正負極 從 localStorage 中讀取並添加到 profileData 中
    let mixingData = ""
    if (String(selectMixing).trim() === "正極混漿") {
      mixingData = localStorage.getItem('mixing_Cathode') || '';
    } else if (String(selectMixing).trim() === "負極混漿") {
      mixingData = localStorage.getItem('mixing_Anode') || '';
    }
    console.log('mixingData:', mixingData);

    if (mixingData.length === 0 ) {
      const errorMessage = '請工程師先登入，才能提交操作員資料! Please log in as an engineer first to submit operator data.';
      setErrorText(errorMessage);
      if (onShowMessage) onShowMessage('error', errorMessage);
      return;
    }
    
    onProfileSubmitted(profileData); // 提交資料給父組件
    console.log('提交的操作員資料:', profileData);

  }


  // 處理會員名稱找尋
  const handleSearchName = async (e, roleToSearch) => {
    e.preventDefault();

    let employeeIdValue = ''; 
    let setEmployeeNameState = null; 

    // 根據傳入的角色判斷要處理哪個員工編號
    if (roleToSearch === 'employee01') {
        employeeIdValue = employeeId01;
        setEmployeeNameState = setEmployeeName01;
    } else if (roleToSearch === 'employee02') {
        employeeIdValue = employeeId02;
        setEmployeeNameState = setEmployeeName02;
    } else {
        const errorMessage = "請選擇要搜尋的操作員！ pls select the operator to search!";
        setErrorText(errorMessage);
        if (onShowMessage) onShowMessage('error', errorMessage);
        return;
    }

    // 檢查員工編號是否為空 (修正了判斷條件)
    if (!employeeIdValue.trim()) {
        const errorMessage = "員工編號不能為空! Employee ID cannot be empty!";
        setErrorText(errorMessage);
        if (onShowMessage) onShowMessage('error', errorMessage);
        setEmployeeNameState(''); 
        return;
    }

    const paddedEmployeeId = employeeIdValue.trim().padStart(3, '0');
    console.log(`正在搜尋 ${roleToSearch} 的工號:`, paddedEmployeeId);

    try {
        // 呼叫一次 API
        const apiResponse = await api.callgetEngineerName(paddedEmployeeId, onShowMessage);

        // 檢查 API 回傳的資料結構
        if (apiResponse?.data?.data && apiResponse.data.data.length > 0 && apiResponse.data.data[0]?.memberName) {
            setEmployeeNameState(apiResponse.data.data[0].memberName);
            console.log(`搜尋結果 - ${roleToSearch} 姓名:`, apiResponse.data.data[0].memberName);
            const successMessage = "查詢成功！ Search successful!";
            setErrorText(successMessage);
            if (onShowMessage) onShowMessage('success', successMessage);
        } else {
            // 如果 API 沒回傳資料或資料結構不符
            setEmployeeNameState(''); // 清空對應的姓名顯示
            const errorMessage = "沒有找到符合條件的人員！ No matching personnel found!";
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
            console.log(`
              搜尋結果 - ${roleToSearch}: 沒有找到
              No matching personnel found for ${roleToSearch}.
              `);
        }
    } catch (error) {
        console.error(`呼叫 API 搜尋 ${roleToSearch} 失敗:`, error);
        setEmployeeNameState(''); // 清空對應的姓名顯示
        const errorMessage = "搜尋失敗，請檢查網路或稍後再試！ Search failed, please check your network or try again later!";
        setErrorText(errorMessage);
        if (onShowMessage) onShowMessage('error', errorMessage);
    }
};

  return (
    <Modal show={show} onHide={onBackSelect} backdrop="static" keyboard={false} centered={centered}> 
      <Modal.Header closeButton >
        <Modal.Title className='title' style={{display: "flex", justifyContent: "center" ,flexDirection: "column" , alignItems: "center" , marginTop: "0.5rem",}}>
          <div style={{fontSize: "1.8rem" , justifyContent: "center"}}>操作員表單 | Operator login</div>
          <div style={{marginTop: "0.5rem", textAlign: "center"}}>{
             selectMixing === "正極混漿" ? (
              <div style={{fontSize: "1.4rem"}}>
                <div>【{selectMixing} | Cathode mixer】</div>
              </div>
             ): 
              (
                <div><div style={{fontSize: "1.4rem"}}>
                <div>【{selectMixing} | Anode mixer】</div>
              </div></div>
              )
            }</div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body >
        <Form style={{display: "flex", flexDirection: "column"}}>
          <Form.Group className="innerTitle">
            <Form.Label className='middleInto'>操作員姓名 (Operator Name) | 2 Floor</Form.Label>
            <Form.Control
              type="text"
              placeholder="Searching ... "
              value={employeeName01}
              onChange={(e) => setEmployeeName01(e.target.value)}
              autoFocus
              style={{ textAlign: "center" }}
              disabled
            />
          </Form.Group>
          <Form.Group className="innerTitle">
            <Form.Label style={{marginRight : "1rem"}}>員工編號 (employee number) |  2 Floor</Form.Label>
            <button className='searchButton' onClick={(e) => handleSearchName(e, 'employee01')}>  
              Search Name
            </button>
            <Form.Control
              type="text"
              placeholder="waiting for input..."
              value={employeeId01}
              onChange={(e) => setEmployeeId01(e.target.value)}
              style={{ textAlign: "center" }}
            />
          </Form.Group>
          <hr/>
          <Form.Group className="innerTitle" >
            <Form.Label>操作員姓名 (Operator Name) |  1 Floor</Form.Label>
            <Form.Control
              type="text"
              placeholder="Searching ... "
              value={employeeName02}
              onChange={(e) => setEmployeeName02(e.target.value)}
              autoFocus
              style={{ textAlign: "center" }}
              disabled
            />
          </Form.Group>
          <Form.Group className="innerTitle">
            <Form.Label>員工編號 (employee number) | 1 Floor</Form.Label>
            <button className='searchButton' onClick={(e) => handleSearchName(e, 'employee02')}>  
              Search Name
            </button>
            <Form.Control
              type="text"
              placeholder="waiting for input..."
              value={employeeId02}
              onChange={(e) => setEmployeeId02(e.target.value)}
              style={{ textAlign: "center" }}
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer  style={{ justifyContent: "center" }}>
        <Button variant="primary" onClick={()=> handleOperationProfileSubmit()}>提交 | Submit</Button>
        <Button variant="secondary" onClick={onBackSelect}>取消 | Cancel</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ProfileFormModal;
