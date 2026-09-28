/**
 * Simplified → Traditional (Hong Kong) pairs for economics prose. Each key is a
 * Simplified-only character with one Traditional form; characters that are also valid
 * Traditional (易 源 干 后 里 面 台 只 余 系 准 并 于 与 发 佣 户 强 却 …) or map to several
 * (尽 盡/儘, 获 獲/穫, 汇 匯/彙, 复, 历, 制 …) are left out by construction, and a test proves
 * no key occurs in the glossary or the app's Chinese.
 */
const PAIRS =
  '这這们們个個为為说說时時会會国國经經济濟价價产產场場进進实實际際应應业業费費务務动動对對' +
  '关關开開长長让讓电電过過还還没沒样樣现現问問题題学學员員资資边邊税稅币幣银銀货貨贸貿' +
  '给給买買卖賣劳勞减減损損设設计計统統数數线線图圖总總从從来來两兩条條决決认認识識议議论論' +
  '证證词詞语語读讀请請调調谈談讨討训訓试試评評课課谁誰该該详詳误誤质質负負贵貴贷貸购購赚賺' +
  '赢贏败敗财財责責项項额額预預领領频頻顾顧类類纳納约約级級纪紀红紅织織结結绝絕维維综綜绩績' +
  '续續网網组組细細终終练練纸紙编編缩縮钱錢铁鐵销銷错錯链鏈键鍵镇鎮门門间間闻聞阅閱闭閉车車' +
  '转轉轮輪较較输輸辆輛软軟马馬驱驅验驗鱼魚鸟鳥页頁顺順见見观觀规規视視觉覺览覽贝貝东東乐樂' +
  '书書乡鄉亏虧争爭亚亞亩畝亲親仅僅仓倉众眾优優传傳伤傷侧側侨僑俭儉债債倾傾储儲兴興养養写寫' +
  '军軍农農况況净淨击擊则則刚剛创創删刪别別办辦势勢劝勸区區医醫华華协協单單卫衛压壓厂廠县縣' +
  '参參双雙变變号號吗嗎听聽启啟响響围圍园園圆圓坏壞块塊坚堅垄壟报報处處备備头頭审審导導将將' +
  '层層属屬岁歲师師带帶帮幫广廣库庫废廢弃棄张張归歸当當录錄态態恶惡惯慣战戰扩擴护護担擔' +
  '择擇换換断斷无無旧舊显顯权權极極构構标標检檢欧歐气氣测測涨漲润潤满滿滞滯点點热熱状狀独獨' +
  '环環础礎确確积積称稱稳穩竞競简簡粮糧紧緊缴繳罚罰职職联聯节節营營虽雖补補订訂记記许許' +
  '译譯话話谓謂贫貧贴貼趋趨轻輕达達运運远遠违違连連选選释釋钢鋼队隊阶階陆陸险險随隨难難风風' +
  '饮飲鲜鮮专專临臨举舉义義乱亂亿億偿償兑兌冻凍';

const CHARS = [...PAIRS];
export const SIMPLIFIED_PAIRS: ReadonlyMap<string, string> = new Map(
  Array.from({ length: CHARS.length / 2 }, (_, i) => [CHARS[2 * i], CHARS[2 * i + 1]] as const),
);

/** Simplified characters found, in order, each once. */
export function simplifiedChars(text: string): string[] {
  return [...new Set([...text].filter((ch) => SIMPLIFIED_PAIRS.has(ch)))];
}

export function toTraditional(text: string): string {
  return [...text].map((ch) => SIMPLIFIED_PAIRS.get(ch) ?? ch).join('');
}
