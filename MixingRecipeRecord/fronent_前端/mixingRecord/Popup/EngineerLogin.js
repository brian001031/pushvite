// ProfileFormModal.js
import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import '../style.scss'; // 引入樣式檔案
import { Suspense } from 'react';
import { use } from 'react';
import api from '../api'; // 確保引入正確的 API 模組

function EngineerLogin({ show, onBacTo , onProfileSubmitted , selectMixing ,centered, onShowMessage }) {
  
  const [dataFormInner, setDataFormInner] = useState({});
  const [error, setError] = useState('');
  const [errorText, setErrorText] = useState('');
  

  const profileSubmit = async (e) => {
    e.preventDefault();
    setError(''); // 清除之前的錯誤訊息

    // 檢查必填欄位是否填寫
    if (!dataFormInner.engineerName || !dataFormInner.engineerNo || !dataFormInner.engineerPsw) {
      const errorMessage = "請填寫所有必填欄位！Please fill in all required fields !";
      setErrorText(errorMessage);
      if (onShowMessage) onShowMessage('error', errorMessage);
      return;
    }


    // if (dataFormInner.engineerPsw.length < 6) {
    //   toast.error("密碼長度不能小於6字元！ Password must be at least 6 characters long!");
    //   return;
    // }

    const response = await api.callgetMixprocess_Login(
      dataFormInner.engineerNo,
      dataFormInner.engineerName,
      dataFormInner.engineerPsw,
      selectMixing
    )
    
    console.log("API 回應:", response);
    
    // 檢查API回應和狀態碼
    if (!response) {
      console.error('API 請求失敗:', response);
      const errorMessage = "網路連線失敗，請確認連線狀態！Network connection failed, please check connection status!";
      setErrorText(errorMessage);
      if (onShowMessage) onShowMessage('error', errorMessage);
      return;
    }

    if (response.EngineerLoginStaus === "false"){
      return(
        setErrorText("登入失敗，請檢查工號、姓名和密碼是否正確！Login failed, please check if the employee number, name, and password are correct!")
      )
    }

    // 根據不同的 status 顯示錯誤或處理成功
    switch(response.status) {
        case 401:
            {
                const errorMessage = "登入失敗，工號或姓名不正確！Login failed, employee number or name is incorrect!";
                setErrorText(errorMessage);
                if (onShowMessage) onShowMessage('error', errorMessage);
            }
            break;
        case 402:
            {
                const errorMessage = "登入失敗，密碼不正確！Login failed, password is incorrect!";
                setErrorText(errorMessage);
                if (onShowMessage) onShowMessage('error', errorMessage);
            }
            break;
        case 200: 
            {
                // 提交資料給父組件
                onProfileSubmitted(dataFormInner);
                console.log('提交的工程師資料:', dataFormInner);
            }
            break;
        default:
            {
                const errorMessage = "登入失敗，請檢查工號、姓名和密碼是否正確！Login failed, please check if the employee number, name, and password are correct!";
                setErrorText(errorMessage);
                if (onShowMessage) onShowMessage('error', errorMessage);
            }
    }

  }
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setDataFormInner({
      ...dataFormInner,
      [name]: value,
    });
  };
  // console.log("輸入的數據:", dataFormInner);

  return (
    <Modal show={show} onHide={onBacTo} backdrop="static" centered={centered} className="engineerLoginModal"> 
      <Modal.Header closeButton>
        <Modal.Title className='title' style={{display: "flex", justifyContent: "center" ,flexDirection: "column" , alignItems: "center"}}>
          <div style={{fontSize: "1.6rem" , justifyContent: "center"}}>工程師表單 | Engineer Login</div>
          <div>
            {
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
            }

          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="innerTitle">
            <Form.Label>姓名 (Name)</Form.Label>
            <Form.Control
              type="text"
              placeholder="waiting for input..."
              name="engineerName"
              value={dataFormInner.engineerName || ''}
              onChange={handleInputChange}
              autoFocus
              style={{ textAlign: "center" }}
            />
          </Form.Group>
          <Form.Group className="innerTitle">
            <Form.Label>工號 (employee number)</Form.Label>
            <Form.Control
              type="text"
              placeholder="waiting for input..."
              name="engineerNo"
              value={dataFormInner.engineerNo || ''}
              onChange={handleInputChange}
              style={{ textAlign: "center" }}
            />
          </Form.Group>
          <Form.Group className="innerTitle">
            <Form.Label>密碼 (password)</Form.Label>
            <Form.Control
              type="password"
              placeholder="waiting for input..."
              name="engineerPsw"
              onChange={handleInputChange}
              style={{ textAlign: "center" }}
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer style={{ justifyContent: "center" }}>
        <Button variant="primary" onClick={profileSubmit}>提交 | Submit</Button>
        <Button variant="secondary" onClick={onBacTo}>取消 | Cancel</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default EngineerLogin;