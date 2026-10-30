import React, { useState, useRef, lazy, Suspense } from "react";
import { z } from "zod";
import MessagePopup from '../../../components/MessagePopup';
import config from '../../../config';
import { Modal, Button, Row, Col } from "react-bootstrap";

// ==================== 1. Zod Schemas & Types ====================

// A. 彈出視窗選項 Schema
export const PopupOptionSchema = z.enum(["authTransfer", "fundTransfer", "record"]);
export type PopupOption = z.infer<typeof PopupOptionSchema>;

// B. 彈出視窗開關狀態 Schema
export const SelectPopupSchema = z.object({
  authTransfer: z.boolean(),
  fundTransfer: z.boolean(),
  record: z.boolean(),
});
export type SelectPopupState = z.infer<typeof SelectPopupSchema>;

// C. Session User 資料 Schema
export const UserSchema = z.object({
  userNumber: z.string().optional().default(""),
  userName: z.string().optional().default(""),
  userDept: z.string().optional().default(""),
});
export type UserData = z.infer<typeof UserSchema>;

// D. MessagePopup 狀態 Schema
export const MessagePopupStateSchema = z.object({
  show: z.boolean().default(false),
  type: z.enum(["info", "success", "error", "warning"]).default("info"),
  title: z.string().default(""),
  message: z.string().default(""),
  autoClose: z.boolean().optional().default(false),
  autoCloseDelay: z.number().optional().default(3000),
});
export type MessagePopupState = z.infer<typeof MessagePopupStateSchema>;

// ==================== 2. Component Props ====================

interface TransferAuditProps {
  show: boolean;
  onHide: () => void;
  centered?: boolean;
}

const AuthTransfer = lazy(() => import('./authPart/authTransfer'));
const FundTransfer = lazy(() => import('./authPart/fundTransfer'));
const RecordPopup = lazy(() => import('./authPart/record'));

const TransferAudit: React.FC<TransferAuditProps> = ({ show, onHide, centered }) => {
  const apiBaseUrl = config.apiBaseUrl;

  // 使用 Zod 安全解析 sessionStorage 中的使用者資料
  const parseUserSession = (): UserData => {
    try {
      const rawUser = JSON.parse(sessionStorage.getItem('user') || '{}');
      return UserSchema.parse(rawUser);
    } catch {
      return UserSchema.parse({});
    }
  };

  const user = parseUserSession();
  const userNumber = useRef<string>(user.userNumber);
  const userName = useRef<string>(user.userName);
  const userDept = useRef<string>(user.userDept);

  const [messagePopup, setMessagePopup] = useState<MessagePopupState>(
    MessagePopupStateSchema.parse({ show: false })
  );

  const [selectPopup, setSelectPopup] = useState<SelectPopupState>({
    authTransfer: false,
    fundTransfer: false,
    record: false,
  });

  // 使用 Zod 驗證並開啟 Popup
  const handlePopupOpen = (option?: string) => {
    const parseResult = PopupOptionSchema.safeParse(option);

    if (!parseResult.success) {
      console.warn("無效的 Popup 選項:", option);
      return;
    }

    const validOption = parseResult.data;
    setSelectPopup({
      authTransfer: validOption === "authTransfer",
      fundTransfer: validOption === "fundTransfer",
      record: validOption === "record",
    });
  };

  // 使用 Zod 驗證並關閉 Popup
  const handleClose = (option: string) => {
    const parseResult = PopupOptionSchema.safeParse(option);
    if (parseResult.success) {
      setSelectPopup(prev => ({
        ...prev,
        [parseResult.data]: false
      }));
    }
  };

  return (
    <>
      {messagePopup.show && (
        <MessagePopup
          show={messagePopup.show}
          onHide={() => setMessagePopup(prev => ({ ...prev, show: false }))}
          type={messagePopup.type}
          title={messagePopup.title}
          message={messagePopup.message}
          autoClose={messagePopup.autoClose}
          autoCloseDelay={messagePopup.autoCloseDelay}
        />
      )}
      {show &&
        !selectPopup.authTransfer &&
        !selectPopup.fundTransfer &&
        !selectPopup.record && (
          <Modal show={show} onHide={onHide} centered={centered} size="xl" backdrop="static">
            <Modal.Header closeButton>
              <Modal.Title className="title_Albert">調撥、退料審核</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <Row className="g-4">
                <Col xs={12} md={4}>
                  <button
                    className="operator-card-button"
                    onClick={() => handlePopupOpen('authTransfer')}
                  >
                    調撥審核
                  </button>
                </Col>
                <Col xs={12} md={4}>
                  <button
                    className="operator-card-button"
                    onClick={() => handlePopupOpen('fundTransfer')}
                  >
                    退料審核
                  </button>
                </Col>
                <Col xs={12} md={4}>
                  <button
                    className="operator-card-button"
                    onClick={() => handlePopupOpen('record')}
                  >
                    審核紀錄
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

      {selectPopup.authTransfer && (
        <Suspense fallback={<div>Loading...</div>}>
          <AuthTransfer
            show={show}
            onHide={() => handleClose('authTransfer')}
            centered={centered}
          />
        </Suspense>
      )}
      {selectPopup.fundTransfer && (
        <Suspense fallback={<div>Loading...</div>}>
          <FundTransfer
            show={show}
            onHide={() => handleClose('fundTransfer')}
            centered={centered}
          />
        </Suspense>
      )}
      {selectPopup.record && (
        <Suspense fallback={<div>Loading...</div>}>
          <RecordPopup
            show={show}
            onHide={() => handleClose('record')}
            centered={centered}
          />
        </Suspense>
      )}
    </>
  );
};

export default React.memo(TransferAudit);
