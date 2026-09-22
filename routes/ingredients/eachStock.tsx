import { handleRedisDataCahch, handleUpdateRedisData, prismaMes, prismaHr, getPythonApiUrl } from './Ingredients';
const axios = require("axios");
const path = require("path");


const envPath = path.resolve(__dirname, "../../.env");
require("dotenv").config({ path: envPath });

type ioSetting = {
    io: any,
    redis: any,
    room: string
}

export const bindWarehouseHandlers = ({
    io, redis, room = 'Ingredients_EachDepartment_management_room'
}: ioSetting) => {
    io.on('connection', (socket: any) => {
        const currentRoomKey = socket.handshake?.query?.roomKey as string | undefined;
        if (currentRoomKey !== room) {
            return;
        }

        console.log(`[eachStock Socket] 使用者連線成功 ${socket.id}，已配對至房間 ${room}`)

        const tryJoinRoom = (incomingRoomKey?: string) => {
            const resolvedRoomKey = typeof incomingRoomKey === 'string' && incomingRoomKey.length > 0
                ? incomingRoomKey
                : currentRoomKey

            if (resolvedRoomKey === room) {
                socket.join(room)
                console.log(`[eachStock Socket] 使用者 ${socket.id} 加入 ${room}`)
                return true
            }

            console.warn(`[eachStock Socket] 使用者 ${socket.id} 嘗試加入房間 ${resolvedRoomKey}，但預期為 ${room}`)
            return false
        }

        tryJoinRoom(currentRoomKey)

        socket.on('joinRoom', (payload: any) => {
            const incomingRoomKey = typeof payload === 'string' ? payload : payload?.room;
            tryJoinRoom(incomingRoomKey)
        })

        socket.on('disconnect', () => {
            console.log('[eachStock Socket] room', room, '使用者斷線 , 斷線ID :', socket.id)
        })

        socket.on('Ingredients:getData', async (payload: any, ack: any) => {
            const { searchMaterialName, department, page, pageSize, userNumber, userDepartment } = payload as any | null

            let parsedPage = parseInt(page as unknown as string, 10);
            let parsedPageSize = parseInt(pageSize as unknown as string, 10);
            if (isNaN(parsedPage) || parsedPage < 1) {
                parsedPage = 1;
            }
            if (isNaN(parsedPageSize) || parsedPageSize < 1) {
                parsedPageSize = 10;
            }

            let nameMaterial = ''
            if (searchMaterialName && searchMaterialName !== '') {
                nameMaterial = searchMaterialName.trim()
            }


            let dept = ''

            if (department && department !== '部門選擇' && department !== 'default' && department !== 'all') {
                dept = department
            } else {
                // 當選擇「部門選擇」時，由後端確認該使用者擁有哪些 positionArea
                try {
                    let userDepts: string[] = [];

                    if (userNumber) {
                        const checkAuthPosition = await prismaHr.scheduleRegInfo.findMany({
                            select: {
                                positionArea: true,
                                authPosition: true,
                                managerRoster: {
                                    select: {
                                        positionArea: true,
                                        authPosition: true
                                    }
                                }
                            },
                            where: {
                                memberID: String(userNumber)
                            }
                        });

                        checkAuthPosition.forEach((item: any) => {
                            if (item.positionArea) {
                                userDepts.push(...String(item.positionArea).replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean));
                            }
                            if (item.authPosition) {
                                userDepts.push(...String(item.authPosition).replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean));
                            }
                            if (item.managerRoster) {
                                const m = item.managerRoster;
                                if (m.positionArea) userDepts.push(...String(m.positionArea).replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean));
                                if (m.authPosition) userDepts.push(...String(m.authPosition).replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean));
                            }
                        });
                    }

                    if (userDepts.length === 0 && userDepartment) {
                        if (typeof userDepartment === 'string') {
                            userDepts = userDepartment.replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
                        } else if (Array.isArray(userDepartment)) {
                            userDepts = userDepartment.flatMap((d: any) => String(d).replace(/[\[\]'"]/g, '').split(',')).map((s: string) => s.trim()).filter(Boolean);
                        }
                    }

                    const uniqueDepts = Array.from(new Set(userDepts));
                    if (uniqueDepts.length > 0) {
                        dept = uniqueDepts.join(',');
                    }
                    // console.log('當選擇 default 時，使用者所屬 positionArea 查出 :', dept);
                } catch (err: any) {
                    console.error('查詢使用者 positionArea 錯誤 :', err?.message || err);
                }
            }

            try {

                // console.log('確認 department , parsedPage , pageSize, searchMaterialName 資訊  :', `(${dept})`, page, pageSize, nameMaterial)
                const checkDepartmentStock = await axios.get(`${getPythonApiUrl('/api/ingredients/checkDepartmentStock')}`, {
                    params: {
                        department: String(dept),
                        searchMaterialName: nameMaterial || undefined,
                        page: parsedPage,
                        pageSize: parsedPageSize
                    }
                })

                // console.log('確認 checkDepartmentStock 回傳 : ', checkDepartmentStock.data)

                if (typeof ack === 'function') {
                    ack({
                        success: true,
                        data: checkDepartmentStock.data
                    })
                }




            } catch (error: any | null) {
                console.log('[eachStock Socket] Ingredients:getData error :', error?.message || error)
                if (typeof ack === 'function') {
                    ack({
                        success: false,
                        message: error?.message || error
                    })
                }
            }
        })

        socket.on('Ingredients:updateStockBalance', async (payload: any, ack: any) => {
            try {
                const updateRes = await axios.post(`${getPythonApiUrl('/api/ingredients/updateDepartmentStockBalance')}`, payload);

                if (updateRes.data.success) {
                    // 更新成功，廣播給同房間與全域 (包含已用盡料品紀錄 Modal)
                    io.to(room).emit('Ingredients:pickUp');
                    io.to(room).emit('Ingredients:getExhaustData');
                    io.emit('Ingredients:pickUp');
                    io.emit('Ingredients:getExhaustData');
                    if (typeof ack === 'function') ack({ success: true, data: updateRes.data });
                } else {
                    // 後端傳回衝突/失敗原因，通知當前使用者
                    if (typeof ack === 'function') ack({ success: false, message: updateRes.data.message });
                }
            } catch (error: any) {
                const errorMsg = error?.response?.data?.message || error?.response?.data?.detail || error?.message;
                if (typeof ack === 'function') ack({ success: false, message: errorMsg });
            }
        });
    })
}
