import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Form, Button, Card, Row, Col } from 'react-bootstrap';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useAuth } from '../../../context/GlobalProvider';
import moment from 'moment';
import axios from 'axios';
import config from '../../../config';

const MessagePopup = React.lazy(() => import('../../../components/MessagePopup'));

interface HandOverProps {
  id: string;
  selectWork?: string;
  shift: string;
  createAt: Date;
  managerName: string;
  managerNumber: number;
  errorCarryOnTime: number;
  coatingMachine_Meter: number;
  producingMeter?: number;
  producingMeter_achieveRate?: number;
  producingMeter_targetRate?: number;
  innerText: string;
  productionStatus: string;
  station?: string;
}

interface showMessage {
  show: boolean;
  type: string;
  title: string;
  message: string;
}

const HandOver: React.FC = (props: any) => {
  const [startDate, setStartDate] = useState<Date | null>(moment().subtract(1, 'days').toDate());
  const [endDate, setEndDate] = useState<Date | null>(moment().endOf('day').toDate());
  const [dataFormSet, setDataFormSet] = useState<HandOverProps[]>([]); // 儲存多筆表單資料
  const [count , setCount] = useState<number>(0);
  const [messagePopup, setMessagePopup] = useState<showMessage>({
    show: false,
    type: '',
    title: '',
    message: '',
  });
  const { user } = useAuth();
  const [page , setPage] = useState<number>(1);
  const [totalPages , setTotalPages] = useState<number>(1);
  
  

  // 內嵌新增，不再使用彈窗表單


  // 隱藏 Message
  const hideMessage = () => {
    setMessagePopup((prev) => ({ ...prev, show: false }));
  }

  // 日期選擇限制
  const dateSelectLimit = (): void => {
    if (startDate && endDate && endDate < startDate) {
      setMessagePopup({
        show: true,
        type: 'error',
        title: '時間範圍錯誤',
        message: '結束時間需大於起始時間',
      });
    }
  };

  useEffect(() => {
    dateSelectLimit();
  }, [startDate, endDate]);

  // 綁定單一欄位
  const dataForm = useCallback((index: number, field: keyof HandOverProps, value: any): void => {
    setDataFormSet((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated: HandOverProps = { ...item, [field]: value } as HandOverProps;
        // 動態計算（僅針對新行 id === ''）
        if (updated.id === '') {
          const cm = Number(updated.coatingMachine_Meter) || 0;
          const et = Number(updated.errorCarryOnTime) || 0;
          const pm = Number(updated.producingMeter) || 0;
          if (cm > 0 && et > 0) {
            const achieveRate = countProducingAchieve(cm, et, pm);
            const targetRate = countTargetAchieve(cm, pm);
            updated.producingMeter_achieveRate = Number(achieveRate);
            updated.producingMeter_targetRate = Number(targetRate);
          } else {
            updated.producingMeter_achieveRate = 0;
            updated.producingMeter_targetRate = 0;
          }
        }
        return updated;
      })
    );
  }, []);

  const fetchData = useCallback(async (): Promise<void> => {

    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/coatingRecord/getHandOverRecord`,
        // `http://localhost:3009/coatingRecord/getHandOverRecord`, 
        {
          params: {
            startTime: startDate ? moment(startDate).format('YYYY-MM-DD HH:mm:ss') : undefined,
            endTime: endDate ? moment(endDate).format('YYYY-MM-DD HH:mm:ss') : undefined,
            page: page,
          }
        }
      );
      
  

  const records = response.data || [];
  console.log('getHandOverRecord records :', records);

  setCount(records.data.length);
  setDataFormSet(records.data);
  setPage(response.data.page); 
  setTotalPages(response.data.totalPages);

    } catch (error) {
      console.error('獲取資料失敗:', error);
    }
  }, [page , startDate , endDate]);

  useEffect(() => {
    fetchData();
    handNotNewAdd();
  }, [fetchData , page , startDate , endDate]);

  // 新增空白列（限制一次只新增一筆）
  const addForm = (): void => {
    if (dataFormSet.some(r => r.id === '')) return;
    const newRow: HandOverProps = {
      id: '',
      selectWork: 'coating',
      station: String(props.station_Origin) || '',
      shift: '',
      createAt: new Date(),
      managerName: user?.reg_schedulename || '',
      managerNumber: user?.memberID || 0,
      errorCarryOnTime: 0,
      coatingMachine_Meter: 0,
      producingMeter: 0,
      producingMeter_achieveRate: 0,
      producingMeter_targetRate: 0,
      innerText: '',
      productionStatus: '',
    };
    setDataFormSet(prev => [...prev, newRow]);
  };


  // 刪除指定列
  const minusForm = (index: number): void => {
    setDataFormSet((prev) => prev.filter((_, i) => i !== index));
  };

  // 送出所有表單列（整包送 API）
  const handleSubmit = async (): Promise<void> => {
    const newRecord = dataFormSet.find(r => r.id === '');
    if (!newRecord) {
      setMessagePopup({ show: true, type: 'error', title: '送出失敗', message: '請確認填寫內容正確性' });
      return;
    }
    if (!newRecord.shift || !newRecord.innerText) {
      setMessagePopup({ show: true, type: 'error', title: '送出失敗', message: '請先填寫新增的交接紀錄' });
      return;
    }

    // 送出前再計算一次比率
    const cm = Number(newRecord.coatingMachine_Meter) || 0;
    const et = Number(newRecord.errorCarryOnTime) || 0;
    const pm = Number(newRecord.producingMeter) || 0;
    const recordToSend = {
      ...newRecord,
      createAt: moment(newRecord.createAt).format('YYYY-MM-DD HH:mm:ss'),
      producingMeter_achieveRate: cm > 0 && et > 0 ? Number(countProducingAchieve(cm, et, pm)) : 0,
      producingMeter_targetRate: cm > 0 ? Number(countTargetAchieve(cm, pm)) : 0,
    };

    try {
      const payload = {
        records: recordToSend,
        startTime: startDate ? moment(startDate).locale('zh-tw').format('YYYY-MM-DD HH:mm:ss') : undefined,
        endTime: endDate ? moment(endDate).locale('zh-tw').format('YYYY-MM-DD HH:mm:ss') : undefined,
      };

      await axios.post(
        `${config.apiBaseUrl}/coatingRecord/sendHandOverRecord`,
        // `http://localhost:3009/coatingRecord/sendHandOverRecord`,
        { payload },
        { headers: { 'Content-Type': 'application/json' } }
      );

      setMessagePopup({ show: true, type: 'success', title: '送出成功', message: '資料已成功送出！' });
      // 清除新增行並重新載入
      setDataFormSet(prev => prev.filter(item => item.id !== ''));
      await fetchData();
    } catch (error) {
      console.error('提交失敗:', error);
      setMessagePopup({ show: true, type: 'error', title: '送出失敗', message: '提交資料時發生錯誤，請稍後再試。' });
    }
  };

  // 計算生產達成率
  const countProducingAchieve = (
    coatingMachine_Meter: number, 
    errorCarryOnTime: number,
    producingMeter: number
  ): any => {
    if (coatingMachine_Meter === 0 || errorCarryOnTime === 0) {
      return 0;
    }

    let allDayHour = 720 // min
    let realProducingTime = allDayHour - errorCarryOnTime; // 真正生產時間
    let targetProducingMeter = realProducingTime * coatingMachine_Meter;
    let finalAchieveRate = (producingMeter / targetProducingMeter) * 10000; // 將比例放大100倍以符合百分比表示

    console.log('計算生產達成率:', finalAchieveRate);

    return finalAchieveRate.toFixed(2);
  }

  // 計算目標達成率
  const countTargetAchieve = (
    coatingMachine_Meter: number,
    producingMeter : number
  ): any => {
    let allDayHour = 720 // min
    let commonMeter = allDayHour * coatingMachine_Meter;
    let finalTargetRate = (producingMeter / commonMeter) * 10000; // 將比例放大100倍以符合百分比表示

    console.log('計算目標達成率:', finalTargetRate);

    return finalTargetRate.toFixed(2);
  }

  const handNotNewAdd = (): boolean => {
    // 判斷是否有舊資料（id 不為空）
    return dataFormSet.some(item => item.id !== '');
  }

  return (
    <>
      <Form.Group className="mb-3">
        <React.Suspense fallback={<div />}>
          <MessagePopup
            show={messagePopup.show}
            type={messagePopup.type}
            title={messagePopup.title}
            message={messagePopup.message}
            onHide={hideMessage}
            autoClose={messagePopup.type === 'success'}
            autoCloseDelay={3000}
          />
        </React.Suspense>

        {/* <hr style={{ margin: '24px 0' }} /> */}
        <Row className="g-3 mb-3">
          <Col xl={2} lg={4} md={6} sm={6} xs={12}>
            <Form.Label className="mb-1">起始時間 | Start Time</Form.Label>
            <DatePicker 
              selected={startDate} 
              onChange={(date: any) => setStartDate(date)} 
              className="form-control w-100"
            />
          </Col>
          <Col xl={2} lg={4} md={6} sm={6} xs={12}>
            <Form.Label className="mb-1">結束時間 | End Time</Form.Label>
            <DatePicker 
              selected={endDate} 
              onChange={(date: any) => setEndDate(date)} 
              className="form-control w-100"
            />
          </Col>
          <Col xl={2} lg={4} md={12} sm={12} xs={12} className="d-flex align-items-end">
            <Button variant="primary" size="sm" className="w-100" onClick={fetchData}>
              查詢
            </Button>
          </Col>
        </Row>
      </Form.Group>
      
      <Row className="g-2 align-items-center mb-3">
        <Col md={6} sm={12} xs={12}>
          <Form.Label style={{ fontSize: '2rem', fontWeight: 'bold' }} className="mb-0">
            交接記錄 | Handover Record
          </Form.Label>
        </Col>
        <Col md={6} sm={12} xs={12} className="d-flex justify-content-md-end justify-content-start gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={addForm}
            disabled={Number(user?.authStatus) < 1 || dataFormSet.some(r => r.id === '')}
          >
            新增欄位
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={
              !dataFormSet.some(r => r.id === '') || 
              dataFormSet.find(r => r.id === '')?.shift === "" || 
              dataFormSet.find(r => r.id === '')?.station === "" ||
              Number(user?.authStatus) < 1 
              }
          >
            送出新增
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.location.href = '/productResearching/coatingSearch'}
          >
            返回戰報表
          </Button>
        </Col>
      </Row>
      
      <div style={{ display: 'grid', gap: '16px' }}>
        {(dataFormSet || [])
          .sort((a, b) => {
            if (a.id === '' && b.id !== '') return -1;
            if (a.id !== '' && b.id === '') return 1;
            return 0;
          })
          .map((item, index) => (
            <Card key={item.id || `new-${index}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <Card.Header style={{ background: '#f0f6ff' }}>
                <Row className="g-2 align-items-center">
                  <Col md={2} sm={12} xs={12}>
                    <Form.Label>站別選擇 | Station Selection</Form.Label>
                  </Col>
                  <Col md={10} sm={12} xs={12}>
                    <Form.Select
                      value={item.station}
                      onChange={(e) => dataForm(index, 'station', e.target.value)}
                      disabled={item.id !== ''}
                    >
                      <option value="">請選擇</option>
                      <option value="coaterCathode">正極塗佈</option>
                      <option value="coaterAnode">負極塗佈</option>
                    </Form.Select>
                  </Col>
                </Row>
                <Row className="g-2 align-items-center">
                  <Col md={3} sm={6} xs={12}>
                    <Form.Label className="mb-1">提交時間 | Submit Time</Form.Label>
                    {item.id !== '' ? (
                      <Form.Control
                        type="text"
                        value={item.createAt ? moment(item.createAt).locale('zh-tw').format('YYYY-MM-DD HH:mm') : ''}
                        disabled
                      />
                    ) : (
                      <Form.Control
                        type="datetime-local"
                        value={moment(item.createAt).locale('zh-tw').format('YYYY-MM-DDTHH:mm')}
                        onChange={(e) => dataForm(index, 'createAt', new Date(e.target.value))}
                        disabled
                      />
                    )}
                  </Col>
                  <Col md={3} sm={6} xs={12}>
                    <Form.Label className="mb-1">班別 | Shift</Form.Label>
                    <Form.Select
                      value={item.shift}
                      onChange={(e) => dataForm(index, 'shift', e.target.value)}
                      disabled={item.id !== ''}
                    >
                      <option value="">請選擇</option>
                      <option value="Shift_MA">早班A</option>
                      <option value="Shift_MB">早班B</option>
                      <option value="Shift_NA">晚班A</option>
                      <option value="Shift_NB">晚班B</option>
                    </Form.Select>
                  </Col>
                  <Col md={3} sm={6} xs={12}>
                    <Form.Label className="mb-1">領班名稱 | Supervisor</Form.Label>
                    <Form.Control
                      type="text"
                      value={`${item.managerName}(${item.managerNumber})`}
                      disabled
                    />
                  </Col>
                  <Col md={3} sm={6} xs={12}>
                    <Form.Label className="mb-1">異常處理時間(min)</Form.Label>
                    <Form.Control
                      type="number"
                      value={item.errorCarryOnTime}
                      onChange={(e) => dataForm(index, 'errorCarryOnTime', Number(e.target.value))}
                      disabled={item.id !== ''}
                      min={0}
                    />
                  </Col>
                </Row>
              </Card.Header>
              <Card.Body>
                <Row className="g-3">
                  <Col md={3} sm={6} xs={12}>
                    <Form.Label className="mb-1">塗佈機米數</Form.Label>
                    <Form.Control
                      type="number"
                      value={item.coatingMachine_Meter || ""}
                      onChange={(e) => dataForm(index, 'coatingMachine_Meter', Number(e.target.value))}
                      disabled={item.id !== ''}
                      min={0}
                    />
                  </Col>
                  <Col md={3} sm={6} xs={12}>
                    <Form.Label className="mb-1">生產米數</Form.Label>
                    <Form.Control
                      type="number"
                      value={item.producingMeter || ""}
                      onChange={(e) => dataForm(index, 'producingMeter', Number(e.target.value))}
                      disabled={item.id !== ''}
                      min={0}
                    />
                  </Col>
                  <Col md={3} sm={6} xs={12}>
                    <Form.Label className="mb-1">生產達成率</Form.Label>
                    <Form.Control
                      type="text"
                      value={
                        item.producingMeter_achieveRate !== undefined && item.producingMeter_achieveRate !== null
                          ? `${item.producingMeter_achieveRate}%`
                          : '0%'
                      }
                      disabled
                    />
                  </Col>
                  <Col md={3} sm={6} xs={12}>
                    <Form.Label className="mb-1">目標達成率</Form.Label>
                    <Form.Control
                      type="text"
                      value={
                        item.producingMeter_targetRate !== undefined && item.producingMeter_targetRate !== null
                          ? `${item.producingMeter_targetRate}%`
                          : '0%'
                      }
                      disabled
                    />
                  </Col>
                </Row>
                <Row className="g-3 mt-1">
                  <Col md={6} xs={12}>
                    <Form.Label className="mb-1">交接內容</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={item.innerText}
                      onChange={(e) => dataForm(index, 'innerText', e.target.value)}
                      disabled={item.id !== ''}
                    />
                  </Col>
                  <Col md={6} xs={12}>
                    <Form.Label className="mb-1">生產狀況</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={item.productionStatus}
                      onChange={(e) => dataForm(index, 'productionStatus', e.target.value)}
                      disabled={item.id !== ''}
                    />
                  </Col>
                </Row>
              </Card.Body>
              <Card.Footer className="d-flex justify-content-between align-items-center">
                <span className="badge" style={{ backgroundColor: item.id === '' ? '#dc3545' : '#0d6efd' }}>
                  {item.id === '' ? '新增' : '舊資料'}
                </span>
                {item.id === '' && (
                  <Button variant="outline-danger" size="sm" onClick={() => minusForm(index)}>
                    刪除這筆
                  </Button>
                )}
              </Card.Footer>
            </Card>
          ))}
      </div>
      <div style= {{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style= {{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px' }}>
          <Button variant="primary" onClick={() => setPage(Number(page) - 1)} disabled={Number(page) === 1}>
            上一頁 | Previous
          </Button>
          <div>第 {page} 頁，共 {totalPages} 頁</div>
          <Button variant="primary" onClick={() => setPage(Number(page) + 1)} disabled={Number(page) === totalPages}>
            下一頁 | Next
          </Button>
        </div>
        
      </div>
    </>
  );
};

export default HandOver;
