import React, { useEffect, useCallback, useState } from "react";
import {
    Modal,
    Button,
    Form,
    Table,
    Pagination
} from 'react-bootstrap';
import moment from "moment";
import 'moment-timezone';
import config from '../../../config';

import MessagePopup from '../../../components/MessagePopup';

import { io } from 'socket.io-client';

export const apiBaseUrl = config.apiBaseUrl;

interface CommanOperatorProps {
    show: boolean;
    onHide: () => void;
    centered?: boolean;
}

const commanOperator: React.FC<CommanOperatorProps> = ({ show, onHide, centered }) => {
    return (
        <Modal show={show} onHide={onHide} centered={centered} size="lg" backdrop="static">
            <Modal.Header closeButton>
                <Modal.Title>通用品領取&退料&調撥</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <h1>CommanOperator</h1>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>
                    關閉
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default commanOperator;