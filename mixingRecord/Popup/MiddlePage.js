// ProfileFormModal.js
import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import '../style.scss'; // 引入樣式檔案
import { Suspense } from 'react';
import { use } from 'react';
import api from '../api'; 

function MiddlePage({ show, onHide , centered , openEngineerDetail , onShowMessage}) {
    
    const [checktoClick , setChecktoClick] = useState(false);

    const handleClick = () => {
        setChecktoClick(true);
        openEngineerDetail();
        onHide();
    }
    
    return (
        <Modal show={show} onHide={onHide} backdrop="static" centered={centered} className="engineerLoginModal"> 
            <Modal.Header closeButton>
                <Modal.Title className='title' style={{display: "flex", justifyContent: "center" ,flexDirection: "column" , alignItems: "center"}}>
                    <div style={{ textAlign: "center" , fontSize: "1.5rem" }}>
                        <div>是否跳回工程師設定頁面?</div>
                        <div style={{wordWrap:"break-word"}}>Do you want return to Engineer Settings page?</div>
                    </div>
                </Modal.Title>
            </Modal.Header>
            <Modal.Footer style={{ justifyContent: "center" }}>
                <Button variant="primary" onClick={handleClick}>確認 | Confirm</Button>
                <Button variant="secondary" onClick={onHide}>取消 | Cancel</Button>
            </Modal.Footer>
        </Modal>
    );
    }

export default MiddlePage;