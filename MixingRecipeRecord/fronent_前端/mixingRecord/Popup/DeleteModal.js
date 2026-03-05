import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import '../style.scss';

// 刪除確認 Modal 組件
function DeleteModal({ show, onHide, centered, onDeleteConfirm , onShowMessage }) {
    const [deleteReason, setDeleteReason] = useState('');

    const handleClick = () => {
        onHide();
    };

    const handleConfirm = () => {
        if (!deleteReason.trim()) {
            onShowMessage('請輸入刪除理由');
            return;
        }
        
        // 🔥 修正：使用重新命名的 prop
        if (typeof onDeleteConfirm === 'function') {
            onDeleteConfirm(deleteReason);
        }
        
        setDeleteReason('');
        onHide();
    };

    const handleCancel = () => {
        setDeleteReason('');
        onHide();
    };

    return (
        <Modal 
            show={show} 
            onHide={handleCancel} 
            backdrop="static" 
            centered={centered} 
            className="engineerLoginModal"
        > 
            <Modal.Header closeButton>
                <Modal.Title 
                    className='title' 
                    style={{
                        display: "flex", 
                        justifyContent: "center", 
                        flexDirection: "column", 
                        alignItems: "center"
                    }}
                >
                    <div style={{ textAlign: "center", fontSize: "1.5rem" }}>
                        <div>請輸入刪除理由</div>
                        <div style={{wordWrap:"break-word"}}>
                            Please enter the reason for deletion
                        </div>
                    </div>
                </Modal.Title>
            </Modal.Header>
            
            <Modal.Body>
                <Form>
                    <Form.Group controlId="deleteReason">
                        <Form.Label>
                            刪除理由 | Reason for Deletion
                        </Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={3}
                            placeholder="請輸入刪除理由..."
                            value={deleteReason}
                            onChange={e => setDeleteReason(e.target.value)}
                            required
                        />
                    </Form.Group>
                </Form>
            </Modal.Body>
            
            <Modal.Footer style={{ justifyContent: "center" }}>
                <Button 
                    variant="danger" 
                    onClick={handleConfirm}
                    disabled={!deleteReason.trim()}
                >
                    確認刪除 | Confirm Delete
                </Button>
                <Button 
                    variant="secondary" 
                    onClick={handleCancel}
                >
                    取消 | Cancel
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

export default DeleteModal;