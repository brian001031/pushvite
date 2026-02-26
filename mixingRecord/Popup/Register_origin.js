import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import '../style.scss';
import api from '../api';
import { faAlignCenter } from '@fortawesome/free-solid-svg-icons';

const Register = ({ show, onback, reg_Login ,onShowMessage }) => {
    const [confirmPsw, setConfirmPsw] = useState('');
    const [formData, setFormData] = useState({
        engineerName: '',
        engineerNo: '',
        engineerPsw: '',
    });
    const [ifSend, setIfSend] = useState(false);
    const [errorText, setErrorText] = useState('');

    const handleChange = (e) => {
        e.preventDefault();
        setFormData({
            ...formData,
            [e.target.name]: String(e.target.value).trim(),
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData?.engineerPsw !== confirmPsw) {
            const errorMessage = '兩次輸入密碼不一致，請重新確認！ PAsswords do not match, please check again!';
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
            return;
        }
        if (formData?.engineerPsw.length < 6) {
            const errorMessage = '密碼長度不能小於6位，請重新確認！ Password must be at least 6 characters long, please check again!';
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
            return;
        }
        console.log("註冊表單提交:", formData);

        try {
         const response = await api.callpostMixproccess_Register(
            formData.engineerNo,
            formData.engineerName,
            formData.engineerPsw
        );

    console.log("API 回應:", response);

    // 根據不同的 status 顯示錯誤
    switch(response.status) {
        case 401:
            {
                const errorMessage = '註冊失敗, 不符合註冊條件! Registration failed, does not meet the registration conditions!';
                setErrorText(errorMessage);
                if (onShowMessage) onShowMessage('error', errorMessage);
            }
            break;
        case 402:
            {
                const errorMessage = '註冊失敗, 工號已存在! Registration failed, employee number already exists!';
                setErrorText(errorMessage);
                if (onShowMessage) onShowMessage('error', errorMessage);
            }
            break;
        case 200: 
            {
                reg_Login(formData);
                setIfSend(true);
                const successMessage = '註冊成功！ Registration successful!';
                if (onShowMessage) onShowMessage('success', successMessage);
            }
            break;
        default:
            {
                const errorMessage = `註冊失敗, 錯誤訊息: ${response.statusText} Registration failed, error message: ${response.statusText}`;
                setErrorText(errorMessage);
                if (onShowMessage) onShowMessage('error', errorMessage);
            }
            break;
        }
    } catch (error) {
    console.error("API 請求錯誤:", error);
    const errorMessage = `註冊失敗, 錯誤訊息: ${error.message} Registration failed, error message: ${error.message}`;
    setErrorText(errorMessage);
    if (onShowMessage) onShowMessage('error', errorMessage);
}
    };

    return (
        <Modal show={show} onHide={onback} centered >
            <Modal.Header closeButton>
                <Modal.Title className='title' style={{ display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center' }}>
                    <div className='subtitle'>工程師註冊</div>
                    <div className='subtitle' style={{fontSize: "1.4rem"}}>【Engineer Register】</div>
                </Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ maxHeight: '340vh', overflowY: 'auto' }}>
                <Form onSubmit={handleSubmit}>
                    <Form.Group className="mb-3">
                        <Form.Label className='innerTitle'>姓名 (Name)</Form.Label>
                        <Form.Control
                            type="text"
                            name="engineerName"
                            value={formData.engineerName}
                            onChange={handleChange}
                            placeholder="waiting for input..."
                            style={{ textAlign: 'center' }}
                            required
                        />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label className='innerTitle'>工號 (Employee No.)</Form.Label>
                        <Form.Control
                            type='text'
                            name="engineerNo"
                            value={formData.engineerNo}
                            onChange={handleChange}
                            placeholder="waiting for input..."
                            style={{ textAlign: 'center' }}
                            required
                        />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label className='innerTitle'>密碼 (Password)</Form.Label>
                        <Form.Control
                            type="password"
                            name="engineerPsw"
                            value={formData.engineerPsw}
                            onChange={handleChange}
                            placeholder="waiting for input..."
                            style={{ textAlign: 'center' }}
                            required
                        />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label className='innerTitle'>再次確認密碼 (Password Confirm)</Form.Label>
                        <Form.Control
                            type="password"
                            name="repassword"
                            value={confirmPsw}
                            placeholder="waiting for input..."
                            style={{ textAlign: 'center' }}
                            onChange={(e) => setConfirmPsw(e.target.value)}
                        />
                    </Form.Group>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                        <Button variant="primary" type='submit' >提交 | Submit</Button>
                        <Button variant="secondary" onClick={onback}>取消 | Cancel</Button>
                    </div>
                </Form>
            </Modal.Body>
        </Modal>
    );
};

export default Register;