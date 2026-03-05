import React, { useState, Suspense, useCallback } from 'react';
import { Container, Card, Alert, Button } from 'react-bootstrap';
// 導入 MessagePopup 組件
import MessagePopup from '../../components/MessagePopup';
import { use } from 'react';

// Lazy-loaded components
const MixingSelection = React.lazy(() => import('./Popup/MixingSelection'));
const RoleSelectionModal = React.lazy(() => import('./Popup/RoleSelectionModal'));
const ProfileFormModal = React.lazy(() => import('./Popup/ProfileFormModal'));
const EngineerLogin = React.lazy(() => import('./Popup/EngineerLogin'));
const Register = React.lazy(() => import('./Popup/Register'));
const EngineerDetail = React.lazy(() => import('./Popup/EngineerDetail'));
const MiddlePage = React.lazy(() => import('./Popup/MiddlePage'));
const ListNoSet = React.lazy(() => import('./Popup/ListNoSet'));

const Anode = React.lazy(() => import('./mixing/Anode'));
const AnodeCheck = React.lazy(() => import('./Popup/AnodeCheck'));
const Cathode = React.lazy(() => import('./mixing/Cathode'));
const CathodeCheck = React.lazy(() => import('./Popup/CathodeCheck'));


function MixingRecord() {
  // 單一 Modal 狀態管理
  const [modalState, setModalState] = useState({
    mixing: true,
    role: false,
    engineerLogin: false,
    operator: false,
    register: false,
    engineerDetail: false,
    
  });

  const [selectMixing, setSelectMixing] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [login, setLogin] = useState(null);
  const [engineerDetail, setEngineerDetail] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [operatorProfile, setOperatorProfile] = useState(null);

  const [operatorRoleSet, setOperatorRoleSet] = useState({
    operator1F: false,
  })

  const [storeSelectListNo , setStoreMixingSelect] = useState(null);
  const user = JSON.parse(localStorage.getItem("user"));

  const [changeListNotify, setChangeListNotify] = useState(false);
  const [listNoTrigger, setListNoTrigger] = useState(0);

  // MessagePopup 狀態管理
  const [messagePopup, setMessagePopup] = useState({
    show: false,
    type: 'info',
    title: '',
    message: ''
  });

  // 顯示訊息的函數
  const showMessage = useCallback((type, message, title = '') => {
    setMessagePopup({
      show: true,
      type,
      title,
      message
    });
  }, []);

  // 關閉訊息的函數
  const hideMessage = useCallback(() => {
    setMessagePopup(prev => ({ ...prev, show: false }));
  }, []);

  const openModal = useCallback((key) => setModalState(prev => ({ ...prev, [key]: true })), []);
  const closeModal = useCallback((key) => setModalState(prev => ({ ...prev, [key]: false })), []);

  
  
  // Step 1: 正負極選擇完成
  const handleCloseMixingSelection = () => {

    closeModal('mixing');
    if (!selectMixing) {
      setErrorMsg('您尚未選擇正負極，請重新整理頁面進行選擇！');
    }
    openModal('role');
  };

    // 返回正負極選擇
    const handleBackToMixing = () => {
      openModal('mixing');
      closeModal('role');
      setSelectedRole(null);
      setErrorMsg('');
  };

  // Step 2: 角色選擇完成
  const handleRoleSelected = (role) => {
    console.log('handleRoleSelected called with role:', role);
    closeModal('role');
    setSelectedRole(role);
    setErrorMsg('');

    // 檢查是否為特定的工程師 ID（有資料的用戶）
    const engineerIDs = ["349", "109", "003", "292" , "255" , "374" , "389"];
    const hasData = engineerIDs.find(id => id === String(user?.memberID));

    switch (role) {
      case 'engineerLogin':
        if (hasData) {
          // 有資料的用戶直接跳到 engineerDetail，並設置 login 資料
          const mockLoginData = {
            engineerNo: user.memberID,
            engineerName: user.reg_schedulename || user.name || '工程師',
            engineerPsw : user?.originalpasswd 
          };
          setLogin(mockLoginData);
          openModal('engineerDetail');
        } else {
          // 沒有資料的用戶需要先登入
          openModal('engineerLogin');
        }
        break;
      case 'operator':
        closeModal("role")
        break;
      case 'register':
        openModal('register');
        break;
      default:
        setErrorMsg('未知的角色選擇，請重新選擇。');
    }
  };

  // 返回角色選擇
  const handleBackToRole = () => {
    openModal('role');
    closeModal('engineerLogin');
    closeModal('operator');
    closeModal('register');
    setModalState(prev => ({
      ...prev,
      engineerLogin: false,
      operator: false,
      register: false,
    }));
    setSelectedRole(null);
    setErrorMsg('');
  };
  
  const handleBackToLogin = () =>{
    openModal('engineerLogin');
    closeModal('engineerDetail');
    setEngineerDetail(null);
    setErrorMsg('');
  }

  // Step 3: 工程師登入成功
  const handleLoginSuccess = (loginData) => {
    
    if (modalState.engineerLogin === true){
      closeModal('engineerLogin');
      openModal('engineerDetail');
      setLogin(loginData)
    }
    else if (modalState.register === true){
      closeModal('register');
      openModal('engineerDetail');
      setLogin(loginData);
    }else if (modalState.middlePage === true){
      closeModal('middlePage');
      openModal('engineerDetail');
    }
    setErrorMsg('');
    
  }

  // Register 到 EngineerDetail 的資料連接
  const handleLinkToDetailSet = (formData) => {
    closeModal('register');
    openModal('engineerDetail');
    setLogin(formData)
    console.log("有觸發FUNCTION handleLinkToDetailSet", formData);
  }
  
  // EngineerDetail 提交資料
  const handleEngineerDetailSubmit =  (detail) => {
    closeModal('engineerDetail');
    closeModal('engineerLogin');
    setEngineerDetail(detail);
    setErrorMsg('');
    console.log("有觸發FUNCTION handleEngineerDetailSubmit", detail);
  }

  const handleProfileSubmitted = (profileData) => {
    closeModal('operator');
    setOperatorProfile(profileData);
    setErrorMsg('');
    console.log ("operator 登入 !", profileData);
  }

  const handleOpenMiddlePage = useCallback(() => {
    openModal('middlePage');
    console.log("開啟MiddlePage");
  }, [openModal]);

  const handleCloseMiddlePage = useCallback(() => {
    closeModal('middlePage');
  }, [closeModal]);

  const handleOpen_ListNoSet = useCallback(() => {
    setStoreMixingSelect(selectMixing);
    openModal('listNoSet');
  }, [selectMixing, openModal]);
  const handleClose_ListNoSet = useCallback(() => {
    console.log('handleClose_ListNoSet called');
    closeModal('listNoSet');
    setChangeListNotify(true);
    setListNoTrigger(prev => prev + 1); // 每次關閉時增加，觸發變化
  }, [closeModal]);

  // 切換 Modal 的處理函數
  const handleSwitch = () =>{
    switch (true) {
      case modalState.mixing:
        return (
          <Suspense fallback={<div>載入中...</div>}>
            <MixingSelection
              size="xl"
              show
              onHide={handleCloseMixingSelection}
              onMixingSelected={setSelectMixing}
              selectMixing={selectMixing}
              onShowMessage={showMessage}
              centered
            />
          </Suspense>
        );
      case modalState.role:
        return (
          <Suspense fallback={<div>載入中...</div>}>
            <RoleSelectionModal
              show
              onHide={handleBackToMixing}
              onRoleSelected={handleRoleSelected}
              onCancel={handleBackToMixing}
              centered
            />
          </Suspense>
        );
      case modalState.operator:
        return (
          <Suspense fallback={<div>載入中...</div>}>
            <ProfileFormModal
              show
              onBackSelect={handleBackToRole}
              onProfileSubmitted={handleProfileSubmitted}
              selectedRole={selectedRole}
              selectMixing={selectMixing}
              onShowMessage={showMessage}
              centered
            />
          </Suspense>
        );
      case modalState.register:
        return (
          <Suspense fallback={<div>載入中...</div>}>
            <Register
              show
              onback={handleBackToRole}
              reg_Login={handleLoginSuccess}
              selectMixing={selectMixing}
              onShowMessage={showMessage}
              centered
            />
          </Suspense>
        );
      case modalState.engineerLogin:
        return (
          <Suspense fallback={<div>載入中...</div>}>
            <EngineerLogin
              show
              onBacTo={handleBackToRole}
              onProfileSubmitted={handleLoginSuccess}
              selectMixing={selectMixing}
              onShowMessage={showMessage}
              centered
            />
          </Suspense>
        );
      case modalState.engineerDetail:
        return (
          <Suspense fallback={<div>載入中...</div>}>
            <EngineerDetail
              show
              EngineerDetail={engineerDetail}
              onBackLogin={handleBackToLogin}
              centered
              login={login}
              selectMixing={selectMixing}
              handleDataAll =  {handleEngineerDetailSubmit}
              onShowMessage={showMessage}
            />
          </Suspense>
        );
      case modalState.middlePage:
        return (
          <Suspense fallback={<div>載入中...</div>}>
            <MiddlePage
              show
              onHide={handleCloseMiddlePage}
              centered
              openEngineerDetail={handleBackToLogin}
              onShowMessage={showMessage}
            />
          </Suspense>
        );
        case modalState.listNoSet:
        return (
          <Suspense fallback={<div>載入中...</div>}>
            <ListNoSet
              show
              onHide={handleClose_ListNoSet}
              centered
              selectMixing={storeSelectListNo}
              onShowMessage={showMessage}
            />
          </Suspense>
        );
      default:
        break;
    }
  }

  return (
    <div className="p-0 m-2" style={{ width: '100vw'}}>
      <div  className="text-center mb-4 w-100">
         {selectMixing && selectMixing === "正極混漿" && operatorRoleSet.operator1F === true ? (
              <Suspense fallback={<div>載入中...</div>}>
                  <CathodeCheck 
                    engineerDetail={engineerDetail}
                    // operatorProfile={operatorProfile}
                    openMiddle={handleOpenMiddlePage}
                    MixingSelect={selectMixing}
                    onShowMessage={showMessage}
                  />
              </Suspense>
          ) : selectMixing && selectMixing === "負極混漿" && operatorRoleSet.operator1F === true ? (
              <Suspense fallback={<div>載入中...</div>}>
                  <AnodeCheck 
                    engineerDetail={engineerDetail}
                    // operatorProfile={operatorProfile}
                    openMiddle={handleOpenMiddlePage}
                    MixingSelect={selectMixing}
                    onShowMessage={showMessage}
                  />
              </Suspense>
          ) : selectMixing && selectMixing === "正極混漿" ? (
              <Suspense fallback={<div>載入中...</div>}>
                  <Cathode
                      engineerDetail={engineerDetail}
                      // operatorProfile={operatorProfile}
                      openMiddle={handleOpenMiddlePage}
                      MixingSelect={selectMixing}
                      onShowMessage={showMessage}
                      ListNo_set={handleOpen_ListNoSet}
                      onChangeListNotify={handleClose_ListNoSet}
                      listNoTrigger={listNoTrigger}
                  />
              </Suspense>
          ) : selectMixing && selectMixing === "負極混漿" ? (
              <Suspense fallback={<div>載入中...</div>}>
                  <Anode
                      engineerDetail={engineerDetail}
                      // operatorProfile={operatorProfile}
                      openMiddle={handleOpenMiddlePage}
                      MixingSelect={selectMixing}
                      onShowMessage={showMessage}
                      ListNo_set={handleOpen_ListNoSet}
                      onChangeListNotify={handleClose_ListNoSet}
                      listNoTrigger={listNoTrigger}
                  />
              </Suspense>
          ) : (
              <Card className="text-center">
                  <Card.Body>
                      <h2>請選擇正負極混漿</h2>
                      {errorMsg && <Alert variant="danger">{errorMsg}</Alert>}
                  </Card.Body>
              </Card>
          )}
      </div>
      <Suspense fallback={<div>載入中...</div>}>
        {handleSwitch()}
      </Suspense>

      {/* MessagePopup 組件 */}
      <MessagePopup
        show={messagePopup.show}
        type={messagePopup.type}
        title={messagePopup.title}
        message={messagePopup.message}
        onHide={hideMessage}
        autoClose={messagePopup.type === 'success'}
        autoCloseDelay={3000}
      />

      
    </div>
  );
}

export default MixingRecord;
