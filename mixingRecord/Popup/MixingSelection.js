// MixingSelection.js
// 引入 Material-UI Select 和 MenuItem
import { Select, MenuItem } from '@mui/material'; 
import React, { useState, useEffect } from 'react';
import { Modal, Button } from 'react-bootstrap'; // 不再需要 Form, Alert
import { Route } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import '../style.scss'; // 引入樣式檔案


function MixingSelection({ show, onHide, onMixingSelected, centered, onShowMessage  }) {
  const navigate = useNavigate();
  
  const [selectedMixing, setSelectedMixing] = useState("");
  const [errorText, setErrorText] = useState("");
  const roles = ['正極混漿', '負極混漿'];

  useEffect(() => {
    if (show) {
      setSelectedMixing("");
    }
  }, [show]);

  // 處理選擇變更的函數
  const handleSelectChange = (event) => {
    setSelectedMixing(event.target.value);
    console.log('選擇正負極 :', event.target.value);
  };
  
  // 確認按鈕的處理函數
  const handleConfirm = () => {
    if (selectedMixing) {
      onMixingSelected(selectedMixing);
      onHide();
    } else {
      const errorMessage = '請選擇正負極！ Please select a cathode or anode mixer!';
      setErrorText(errorMessage);
      if (onShowMessage) onShowMessage('error', errorMessage);
    }
  };

  // 取消按鈕的處理函數
  const handleBack = () => {
   navigate("/allRecordWork")
  }

  return (
    <Modal show={show} onHide={onHide} backdrop="static" keyboard={false} centered={centered} >
      <Modal.Header className="justify-content-center">
        <Modal.Title
          style={{
            fontSize: '2.5rem',
            fontWeight: 'bold',
            width: '100%',
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div>選擇混漿生產紀錄</div>
            <div style={{fontSize: "1.4rem"}}>【Select Mixing Record Page】</div>
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="d-grid p-20">
          <Select
            value={selectedMixing}
            onChange={handleSelectChange}
            displayEmpty
            className='w-full p-2 border border-gray-300 rounded-lg text-center'
            sx={{
              fontSize: { xs: '1.5rem', sm: '1.5rem', md: '1.5rem', lg: '1.5rem' },
              textAlign: 'center',
            }}
          >
            <MenuItem value="" disabled sx={{ textAlign: 'center', justifyContent: 'center' }}>
            <div style={{fontSize: "1.3rem" , fontWeight: "600"}}>選擇正負極 | Choose Selection</div>
            </MenuItem>
            {roles.map((role) => (
              <MenuItem
                key={role}
                value={role}
                sx={{
                  fontSize: { xs: '1.5rem', sm: '1.5rem', md: '1.5rem', lg: '1.5rem' , fontWeight: "600"},
                  textAlign: 'center',
                  justifyContent: 'center',
                }}
              >
                {
                  role === '正極混漿' ? (
                    <div style={{ fontSize: '1.3rem', fontWeight: '600' }}>
                      {role} | Cathode Mixer
                    </div>
                  ) : (
                    <div style={{ fontSize: '1.3rem', fontWeight: '600' }}>
                      {role} | Anode Mixer
                    </div>
                  )
                }
              </MenuItem>
            ))}
          </Select>
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-content-center">
        <Button variant="primary" onClick={handleConfirm} className="mr-2">確認</Button>
        <Button variant="secondary" onClick={() => handleBack()}>取消</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default MixingSelection;