import { GoogleGenAI } from "@google/genai";

// The client gets the API key from the environment variable `GEMINI_API_KEY`.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY})



export async function anny_holidayAutowrite_WithGemini() {
  const targetYear = new Date().getFullYear();
  console.log(`開始執行 ${targetYear} 年度假期自動抓取任務...`);
  const groundingTool = {googleSearch: {}};
  const config = { 
    tools: [groundingTool],
    systemInstruction: [
        'You are a very professional human resource expert.'
      ],
  }


  const prompt = `
        任務步驟：
        1. 先確認目標年度為西元 ${targetYear} 年之所有假日日期。
        2. 搜尋台灣行政院人事行政總處官網 (https://www.dgpa.gov.tw)，尋找「${targetYear}年政府行政機關辦公日曆表」的正式公告。
        3. 依據網頁提供之資料，提取所有國定假日。
        4. 依據先前搜索到的周末日期排除假期中所有週末（星期六、星期日）。
        5. 特別注意農曆春節假期，確認其具體日期範圍（從除夕到初五），並計算該假期的總天數。
        6. 將所有假期整理成 JSON 陣列格式輸出。

        關鍵校對：
       1. 搜尋並確認西元 ${targetYear} 年的農曆春節（除夕到初五）具體日期。
       2. 確認農曆春節連假長度與日期。

       需排除假期 : 
       1. 不包含週末（星期六、星期日）。
        
        輸出規範：
        - 必須嚴格遵守 JSON 陣列格式，不要任何解釋文字。
        - 格式：[["假名", "日期", "日期" , "若非連假也需列出1 , 若為連假列出排除周末之天數"], ["假名", "日期", "日期" , "若非連假也需列出1 , 若為連假列出排除周末之天數"], ...]
        - 日期格式：YYYY-MM-DD
        - 範例：[["農曆春節", "${targetYear}-01-17", "${targetYear}-01-25" , "1"]]

    `;

  try{
    const model = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents : prompt,
      config : config
    });

    const modelResponse = model.text;
    console.log("模型回應內容：", modelResponse);
    
    let holidays;
    console.log("開始解析假期資料...", modelResponse , "| typeof modelResponse:", typeof modelResponse);
    
    try{
      const jsonMatch = modelResponse.match(/\[\s*\[.*\]\s*\]/s);
      holidays = JSON.parse(jsonMatch[0]);
    }
    catch(parseError){
      console.log("無法解析假期資料，請確認模型輸出格式是否正確。");
      throw parseError;
    }
    console.log("解析後的假期資料：", holidays);
    return holidays;
      
    }catch(error){
      console.log("任務執行失敗。");
      throw error;
    }
}