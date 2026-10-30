import React from "react";

import { Modal, Button } from "react-bootstrap";

interface TransferAuditListProps {
  show: boolean;
  onHide: () => void;
  centered?: boolean;
}

const TransferAuditList: React.FC<TransferAuditListProps> = ({ show, onHide, centered }) => {
  return (
    <Modal show={show} onHide={onHide} centered={centered} size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>調撥、退料審核列表</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h2>調撥、退料審核列表</h2>
        <p style={{ color: "#666", fontSize: "16px" }}>此功能尚在建置中...</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          關閉
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default React.memo(TransferAuditList);
