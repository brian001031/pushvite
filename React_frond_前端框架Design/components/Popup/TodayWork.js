import React, { useEffect, useState } from "react";
import { Modal, Form, Button, Alert, Row, Col } from "react-bootstrap";
import { toast } from "react-toastify";
import { useAuth } from "../../context/GlobalProvider";
import axios from "axios";
import config from "../../config";
import { FormattedMessage, useIntl } from "react-intl";
import { EquipmentOption } from '../../mes_remak_data'
import moment from "moment/moment";


const TodayWork = ({ show, onHide, centered }) => {
  const { user, login } = useAuth();
  const intl = useIntl();
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [dataState, setDataState] = useState({
    reg_schedulename: user ? user.reg_schedulename : "",
    memberID: user ? user.memberID : "",
    shift: user ? user.shift : "",
  });
  const [filteredOptions, setFilteredOptions] = useState([]);
  const [searchInput, setSearchInput] = useState(""); // 輸入框的搜尋文字
  const [selectedEquipment, setSelectedEquipment] = useState(""); // 實際選擇的設備

  const equipmentOption = EquipmentOption;
  const [hasSelect, setHasSelect] = useState(false);

  console.log("equipment", equipmentOption);
  console.log("selectedEquipment", selectedEquipment);

  const filterOption = (searchInput) => {
    searchInput = searchInput.toLowerCase().trim();

    if (searchInput) {
      const filtered = equipmentOption.filter(option => {
        const optionStr = (option || '').toLowerCase();
        return optionStr.includes(searchInput);
      });
      setFilteredOptions(filtered);
    }
  }

  // 初始化時顯示所有選項
  useEffect(() => {
    handleCheckIfSelect();
    setFilteredOptions(equipmentOption);
  }, []);

  const handleCheckIfSelect = async () => {
    setIsLoading(true);

    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/schedule/checkIfSelectWorkPlace`,
        // `http://localhost:3009/schedule/checkIfSelectWorkPlace`,
        {
          params: {
            memberNumber: dataState.memberID,
          }
        }
      );

      console.log("Check if select response:", response.data);

      if (response.data.success === true) {
        setIsLoading(false);
        setHasSelect(true);
        // API 返回的設備在 data.data.equipment 中
        setSelectedEquipment(response.data.data?.equipment || "");
      } else {
        setIsLoading(false);
        setHasSelect(false);
      }

    } catch (error) {
      console.error("Today not set workplace yet", error);
      setHasSelect(false);
    }
  }


  const handleUpdate = async (e) => {
    e.preventDefault();
    let now = new Date();

    try {
      // 修正：正確的 axios.post 格式
      const response = await axios.post(
        `${config.apiBaseUrl}/schedule/selectWorkPlace`,
        // `http://localhost:3009/schedule/selectWorkPlace`,
        {
          memberNumber: dataState.memberID,
          memberName: dataState.reg_schedulename,
          shift: dataState.shift,
          equipment: selectedEquipment,
          date: moment(now).local('zh-tw').format('YYYY-MM-DD HH:mm:ss')
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log("Registration response:", response.data);

      if (response.status === 200) {
        setFeedback(true);
        toast.success("資料更新成功！");
        login(dataState);
        onHide(); // 關閉彈窗
        // 重置表單
      }

      // toast.success('註冊成功！');
    } catch (error) {
      console.error("Today work update error:", error);
    }
  };

  const handleClose = () => {
    onHide();
  };

  return (
    <>
      {isLoading && (
        <div
          className="loading-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999
          }}
        >
          <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      )}
      <Modal
        show={show}
        onHide={handleClose}
        centered={centered}
        size="md"
        backdrop="static"
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title
            style={{
              display: "flex",
              fontSize: "3rem",
              fontWeight: "bold",
              color: "white",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <i className="bi bi-person-circle me-2"></i>
            <FormattedMessage id="workArea" defaultMessage="選擇工作區域" />

          </Modal.Title>
        </Modal.Header>

        <Modal.Body className="px-4 py-4">
          {/* 註冊表單 */}
          <Form onSubmit={handleUpdate}>
            <Form.Group className="mb-3">
              <Form.Label
                className="fw-bold w-100"
                style={{ fontSize: "1.2rem", fontWeight: "bold" }}
              >
                <i className="bi bi-person me-2"></i>
                <FormattedMessage id="Login.id" defaultMessage="工號" />
              </Form.Label>
              <Form.Control
                type="text"
                placeholder={intl.formatMessage({
                  id: "Regis.erqlempl_ID",
                  defaultMessage: "請輸入工號",
                })}
                value={dataState.memberID}
                onChange={(e) =>
                  setDataState({ ...dataState, memberID: e.target.value.trim() })
                }
                size="lg"
                disabled
                required
                autoFocus
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label
                className="fw-bold w-100"
                style={{ fontSize: "1.2rem", fontWeight: "bold" }}
              >
                <i className="bi bi-person me-2"></i>
                <FormattedMessage id="Update.name" defaultMessage="姓名" />
              </Form.Label>
              <Form.Control
                type="text"
                placeholder="請輸入工號"
                value={dataState.reg_schedulename}
                onChange={(e) =>
                  setDataState({ ...dataState, memberID: e.target.value.trim() })
                }
                size="lg"
                disabled
                required
                autoFocus
              />
            </Form.Group>

            {
              hasSelect ? (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label
                      className="fw-bold w-100"
                      style={{ fontSize: "1.2rem", fontWeight: "bold" }}
                    >
                      <i className="bi bi-person me-2"></i>
                      <FormattedMessage id="selectTodayWork" defaultMessage="選擇今天作業機器" />
                    </Form.Label>
                    <Form.Control
                      type="text"
                      placeholder={selectedEquipment}
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                      }}
                      onBlur={(e) => {
                        filterOption(searchInput);
                      }}
                      size="lg"
                      disabled={isLoading}
                      autoFocus
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label
                      className="fw-bold w-100"
                      style={{ fontSize: "1.2rem", fontWeight: "bold" }}
                    >
                      <i className="bi bi-check-circle me-2"></i>
                      <FormattedMessage id="pleaseSelect" defaultMessage="請選擇作業設備" />
                    </Form.Label>
                    <Form.Select
                      size="lg"
                      value={selectedEquipment}
                      onChange={(e) => {
                        setSelectedEquipment(e.target.value);
                      }}
                      disabled={isLoading}
                    >
                      <option value="">
                        <FormattedMessage id="selectWhenInput" defaultMessage="-- 請從下拉選單選擇設備 --" />
                      </option>
                      {filteredOptions.map((option, index) => (
                        <option key={index} value={option}>
                          {option}
                        </option>
                      ))}
                    </Form.Select>
                    {filteredOptions.length === 0 && searchInput && (
                      <Form.Text className="text-warning d-block mt-2">
                        ⚠ no option match for「{searchInput}」 】
                      </Form.Text>
                    )}
                    {!searchInput && (
                      <Form.Text className="text-muted d-block mt-2">
                        💡 Please enter a keyword above, the system will filter options automatically.
                      </Form.Text>
                    )}
                    {selectedEquipment && (
                      <Form.Text className="text-success d-block mt-2">
                        ✓ SELECT {selectedEquipment}
                      </Form.Text>
                    )}
                  </Form.Group>
                </>
              ) : (

                <>
                  <Form.Group className="mb-3">
                    <Form.Label
                      className="fw-bold w-100"
                      style={{ fontSize: "1.2rem", fontWeight: "bold" }}
                    >
                      <i className="bi bi-person me-2"></i>
                      <FormattedMessage id="alreadySelected" defaultMessage="已經選擇的作業設備" />
                    </Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="輸入關鍵字搜尋設備（輸入完畢後點擊其他地方）..."
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                      }}
                      onBlur={(e) => {
                        filterOption(searchInput);
                      }}
                      size="lg"
                      disabled={isLoading}
                      autoFocus
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label
                      className="fw-bold w-100"
                      style={{ fontSize: "1.2rem", fontWeight: "bold" }}
                    >
                      <i className="bi bi-check-circle me-2"></i>

                      <FormattedMessage id="reselectWorkArea" defaultMessage="重新選擇作業設備" />
                    </Form.Label>
                    <Form.Select
                      size="lg"
                      value={selectedEquipment}
                      onChange={(e) => {
                        setSelectedEquipment(e.target.value);
                      }}
                      disabled={isLoading}
                    >
                      <option value="">-- 請從下拉選單選擇設備 --</option>
                      {filteredOptions.map((option, index) => (
                        <option key={index} value={option}>
                          {option}
                        </option>
                      ))}
                    </Form.Select>
                    {filteredOptions.length === 0 && searchInput && (
                      <Form.Text className="text-warning d-block mt-2">
                        ⚠ no option match for「{searchInput}」
                      </Form.Text>
                    )}
                    {!searchInput && (
                      <Form.Text className="text-muted d-block mt-2">
                        💡 Please enter a keyword above, the system will filter options automatically.
                      </Form.Text>
                    )}
                    {selectedEquipment && (
                      <Form.Text className="text-success d-block mt-2">
                        ✓ SELECT {selectedEquipment}
                      </Form.Text>
                    )}
                  </Form.Group>
                </>

              )
            }

            {/* 分隔線 */}
            <div className="text-center mb-4">
              <hr
                style={{
                  border: "none",
                  borderTop: "2px solid #dee2e6",
                  margin: "0 20%",
                }}
              />
            </div>

            {/* 按鈕區域 */}
            <Row className="g-2">
              <Col xs={6}>
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-100"
                  onClick={handleClose}
                  disabled={isLoading}
                >
                  <FormattedMessage id="Regis.cancel" defaultMessage="取消" />
                </Button>
              </Col>
              <Col xs={6}>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-100"
                  disabled={isLoading || !selectedEquipment}
                >
                  {isLoading ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      更新中...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-person-plus me-2"></i>
                      <FormattedMessage
                        id="confirm"
                        defaultMessage="確認"
                      />
                    </>
                  )}
                </Button>
              </Col>
            </Row>
          </Form>
        </Modal.Body>
      </Modal>
    </>
  );
};

export default TodayWork;
