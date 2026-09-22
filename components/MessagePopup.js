import React, { useEffect } from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import Spinner from 'react-bootstrap/Spinner';
import './MessagePopup.scss';

const MessagePopup = ({ 
    show, 
    onHide, 
    type = 'info', // 'success', 'error', 'warning', 'info' , 'loading'
    title,
    message,
    autoClose = false,
    autoCloseDelay = 3000
}) => {
    useEffect(() => {
        if (show && autoClose) {
            const timer = setTimeout(() => {
                onHide && onHide();
            }, autoCloseDelay);
            
            return () => clearTimeout(timer);
        }
    }, [show, autoClose, autoCloseDelay, onHide]);

    const handleClose = () => {
        if (onHide) {
            onHide();
        }
    };

    const getIconByType = () => {
        switch (type) {
            case 'success':
                return '✅';
            case 'error':
                return '❌';
            case 'warning':
                return '⚠️';
            case 'loading':
                return null; 
            default:
                return 'ℹ️';
        }
    };

    const getVariantByType = () => {
        switch (type) {
            case 'success':
                return 'success';
            case 'error':
                return 'danger';
            case 'warning':
                return 'warning';
            case 'loading':
                return 'primary';
            default:
                return 'info';
        }
    };
    
    const getVariantByType_outLine = () => {
        switch (type) {
            case 'success':
                return 'outline-success';
            case 'error':
                return 'outline-danger';
            case 'warning':
                return 'outline-warning';
            default:
                return 'outline-info';
        }
    }

    const getDefaultTitle = () => {
        switch (type) {
            case 'success':
                return '操作成功';
            case 'error':
                return '發生錯誤';
            case 'warning':
                return '注意';
            case 'loading':
                return '資料處理中';
            default:
                return '提示';
        }
    };

    return (
        <Modal 
            show={show} 
            // onHide={handleClose}
            onHide={type === "loading" ? undefined : handleClose} //當使用loading狀態,不能按 ESC 或點背景關閉
            centered
            backdrop="static"
            keyboard={false}
            backdropClassName="message-popup-backdrop"
            className={`message-popup message-popup-${type}`}
        >
            <Modal.Header className={`bg-${getVariantByType()} text-white`}>
                <Modal.Title className="d-flex align-items-center">
                    <span className="me-2" style={{ fontSize: '1.5rem' }}>
                        {getIconByType()}
                    </span>
                    {title || getDefaultTitle()}
                </Modal.Title>
            </Modal.Header>
            
            <Modal.Body className="py-4">
                <Alert variant={getVariantByType()} className="mb-0 border-0 bg-transparent">
                    <div className="text-center">
                        <div className="message-icon mb-3">
                             {type === "loading" ? (
                                    <Spinner
                                        animation="border"
                                        variant="primary"
                                        style={{
                                            width: "4rem",
                                            height: "4rem"
                                        }}
                                    />
                                ) : (
                                    <span style={{ fontSize: '3rem' }}>
                                        {getIconByType()}
                                    </span>	
                                )
                            }                           
                        </div>
                        <div className="message-text" style={{ fontSize: '1.1rem', lineHeight: '1.6' }}>
                            {message}
                        </div>
                    </div>
                </Alert>
            </Modal.Body>
            {/*Loading以外狀態才顯示關閉按鈕工具*/}
            {type !== "loading" && (
                <Modal.Footer className="justify-content-center">
                    <Button 
                        variant={getVariantByType()} 
                        onClick={handleClose}
                        size="lg"
                        className="px-4"
                    >
                        <i className="fas fa-check me-2"></i>
                        確定
                    </Button>
                    <Button 
                        variant= "secondary" 
                        onClick={handleClose}
                        size="lg"
                        className="px-4"
                    >
                        <i className="fas fa-check me-2"></i>
                        關閉
                    </Button>
                </Modal.Footer>
            )}
        </Modal>
    );
};

export default MessagePopup;
