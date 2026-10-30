import React, { useEffect, useCallback, useState, lazy, Suspense } from "react";
import {
    Modal,
    Button,
    Form,
    Table,
    Pagination,
    Row,
    Col
} from 'react-bootstrap';
import moment from "moment";
import 'moment-timezone';
import config from '../../../config';

import MessagePopup from '../../../components/MessagePopup';

import { io } from 'socket.io-client';

export const apiBaseUrl = config.apiBaseUrl;

interface ProducingOperatorProps {
    show: boolean;
    onHide: () => void;
    centered?: boolean;
}


const EachStock = lazy(() => import('./pickUpNtransfer/eachStock'));
const AllocatedMaterialCollection = lazy(() => import('./pickUpNtransfer/allocatedMaterialCollection'));
const ReceivedMaterialRequest = lazy(() => import('./pickUpNtransfer/receivedMaterialRequest'));
const MaterialUseRecord = lazy(() => import('./pickUpNtransfer/materialUseRecord'));


const ProducingOperator: React.FC<ProducingOperatorProps> = ({ show, onHide, centered }) => {

    const [messagePopup, setMessagePopup] = useState({
        show: false,
        type: 'info', // 'success', 'error', 'warning', 'info'
        title: '',
        message: '',
        autoClose: false,
        autoCloseDelay: 3000
    })

    const [openPopup, setOpenPopup] = useState({
        eachStock: false, // 部門庫存查詢
        allocatedMaterialCollection: false, // 已配料之物料領取
        receivedMaterialRequest: false, // 收到之調料申請
        materialUseRecord: false, // 已用盡料品紀錄
    });

    const handlePopupOpen = (option: string) => {
        switch (option) {
            case 'eachStock':
                setOpenPopup({
                    allocatedMaterialCollection: false, // 已配料之物料領取
                    receivedMaterialRequest: false, // 收到之調料申請
                    materialUseRecord: false, // 已用盡料品紀錄
                    eachStock: true
                })
                break;
            case 'allocatedMaterialCollection':
                setOpenPopup({
                    eachStock: false, // 部門庫存查詢
                    allocatedMaterialCollection: true, // 已配料之物料領取
                    receivedMaterialRequest: false, // 收到之調料申請
                    materialUseRecord: false, // 已用盡料品紀錄
                })
                break;
            case 'receivedMaterialRequest':
                setOpenPopup({
                    eachStock: false, // 部門庫存查詢
                    allocatedMaterialCollection: false, // 已配料之物料領取
                    receivedMaterialRequest: true, // 收到之調料申請
                    materialUseRecord: false, // 已用盡料品紀錄
                })
                break;
            case 'materialUseRecord':
                setOpenPopup({
                    eachStock: false, // 部門庫存查詢
                    allocatedMaterialCollection: false, // 已配料之物料領取
                    receivedMaterialRequest: false, // 收到之調料申請
                    materialUseRecord: true, // 已用盡料品紀錄
                })
                break;
            default:
                break;
        }
    }
    const handleClose = (option: string) => {
        setOpenPopup({
            ...openPopup,
            [option]: false
        })
    }

    const handlePopupClose = () => {
        setMessagePopup(prev => ({
            ...prev,
            show: false
        }))
    }

    return (
        <>
            {
                messagePopup.show && (
                    <MessagePopup
                        show={messagePopup.show}
                        onHide={handlePopupClose}
                        type={messagePopup.type}
                        title={messagePopup.title}
                        message={messagePopup.message}
                        autoClose={messagePopup.autoClose}
                        autoCloseDelay={messagePopup.autoCloseDelay}
                    />
                )
            }
            {show &&
                !openPopup.eachStock &&
                !openPopup.allocatedMaterialCollection &&
                !openPopup.receivedMaterialRequest &&
                !openPopup.materialUseRecord &&
                (
                    <Modal show={show} onHide={onHide} centered={centered} size="xl" backdrop="static">
                        <Modal.Header closeButton>
                            <Modal.Title className="title_Albert">各部門領料&退料&調撥</Modal.Title>
                        </Modal.Header>
                        <Modal.Body className="p-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            <Row className="g-4">
                                <Col xs={12} md={6}>
                                    <button
                                        className="operator-card-button"
                                        onClick={() => {
                                            handlePopupOpen('eachStock')
                                        }}
                                    >
                                        部門庫存查詢
                                    </button>
                                </Col>
                                <Col xs={12} md={6}>
                                    <button
                                        className="operator-card-button"
                                        onClick={() => {
                                            handlePopupOpen('allocatedMaterialCollection')
                                        }}
                                    >
                                        已配料之物料領取
                                    </button>
                                </Col>
                                <Col xs={12} md={6}>
                                    <button
                                        className="operator-card-button"
                                        onClick={() => {
                                            handlePopupOpen('receivedMaterialRequest')
                                        }}
                                    >
                                        收到之調料申請
                                    </button>
                                </Col>
                                <Col xs={12} md={6}>
                                    <button
                                        className="operator-card-button"
                                        onClick={() => {
                                            handlePopupOpen('materialUseRecord')
                                        }}
                                    >
                                        已用盡料品紀錄
                                    </button>
                                </Col>
                            </Row>
                        </Modal.Body>
                        <Modal.Footer>
                            <Button variant="secondary" onClick={onHide}>
                                關閉
                            </Button>
                        </Modal.Footer>
                    </Modal>
                )}
            {
                openPopup.eachStock && (
                    <Suspense fallback={<div>Loading...</div>}>
                        <EachStock
                            show={show}
                            onHide={() => handleClose('eachStock')}
                            centered={centered}
                        />
                    </Suspense>
                )
            }
            {
                openPopup.allocatedMaterialCollection && (
                    <Suspense fallback={<div>Loading...</div>}>
                        <AllocatedMaterialCollection
                            show={show}
                            onHide={() => handleClose('allocatedMaterialCollection')}
                            centered={centered}
                        />
                    </Suspense>
                )
            }
            {
                openPopup.receivedMaterialRequest && (
                    <Suspense fallback={<div>Loading...</div>}>
                        <ReceivedMaterialRequest
                            show={show}
                            onHide={() => handleClose('receivedMaterialRequest')}
                            centered={centered}
                        />
                    </Suspense>
                )
            }
            {
                openPopup.materialUseRecord && (
                    <Suspense fallback={<div>Loading...</div>}>
                        <MaterialUseRecord
                            show={show}
                            onHide={() => handleClose('materialUseRecord')}
                            centered={centered}
                        />
                    </Suspense>
                )
            }
        </>
    )
}


export default React.memo(ProducingOperator);