import express from "express";
import { MesPurpleService } from "../src/modules/mes-purple/mes-purple.service";

const router = express.Router();

/**
 * 取得 MesPurpleService 實例（優先使用 NestJS 依賴注入建立的單例）
 */
function getMesPurpleService(): MesPurpleService {
  if (MesPurpleService.instance) {
    return MesPurpleService.instance;
  }
  return new MesPurpleService();
}

/**
 * Socket.IO 連線處理器綁定（供 modules/socket/reportModule.ts 調用）
 */
export const bindMesPurpleSocketHandlers = (options: { io: any; redis: any; roomKey: string }) => {
  const service = getMesPurpleService();
  return service.bindSocketHandlers(options);
};

/**
 * 向下相容 Express 舊路由 /mesPurple/main_FrontSet_Page_socket_status
 * （新架構中亦由 NestJS 的 MesPurpleController 統一提供）
 */
router.get("/main_FrontSet_Page_socket_status", async (_req, res) => {
  try {
    const service = getMesPurpleService();
    const result = await service.getSocketStatus();
    res.status(200).json(result);
  } catch (error: any) {
    console.error("[mesPurple] socket status API error:", error);
    res.status(500).json({
      message: "socket 狀態查詢失敗",
      error: error.message,
      details: error.stack,
    });
  }
});

Object.assign(router, {
  bindMesPurpleSocketHandlers,
});

module.exports = router;