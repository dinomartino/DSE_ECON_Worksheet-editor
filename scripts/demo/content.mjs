// ============================================================================
//  DEMO CONTENT: edit this file to change what the demo types.
//  Every string is original example text. Never paste HKEAA past-paper items.
//  [English, 中文] pairs; `answer` is the option letter; `lines` = dotted lines.
// ============================================================================

/**
 * The worksheet the demo builds, in page order: Section A MCQs, then Section B. `topic`
 * is the DSE topic the screenshots tag each question with (its name in the picker).
 */
export const QUIZ_NAME = 'S4 Demand and Supply Quiz';
/** Its printed title (Setup), for the website screenshots. */
export const QUIZ_TITLE = ['S4 Demand and Supply Quiz', '中四 需求與供應測驗'];

export const MCQS = [
  {
    stem: ['Which of the following is a positive statement?', '以下哪一項是實證性陳述？'],
    options: [
      ['The government should raise the minimum wage.', '政府應該提高最低工資。'],
      ['Rent control is unfair to landlords.', '租金管制對業主不公平。'],
      ['A higher tobacco tax will reduce cigarette consumption.', '提高煙草稅會減少香煙的消費量。'],
      ['University education ought to be free.', '大學教育應該免費。'],
    ],
    answer: 'C',
    topic: 'Positive and normative statements',
  },
  {
    stem: [
      'Which of the following would shift the demand curve for umbrellas to the right?',
      '以下哪一項會令雨傘的需求曲線向右移？',
    ],
    options: [
      ['A fall in the price of umbrellas', '雨傘價格下跌'],
      ['A forecast of a week of heavy rain', '天文台預測未來一星期有大雨'],
      ['A rise in the cost of making umbrellas', '製造雨傘的成本上升'],
      // Keep EN+中 under 75 characters, or the Kahoot export shows a length warning.
      ['Better technology for making umbrellas', '製造雨傘的技術改進'],
    ],
    answer: 'B',
    topic: 'Market demand',
  },
  {
    stem: ['Which of the following is an example of a free good?', '以下哪一項是免費物品的例子？'],
    options: [
      ['Seawater at a beach', '海灘上的海水'],
      ['Tap water in Hong Kong', '香港的自來水'],
      ['A free sample of shampoo', '免費的洗頭水樣本'],
      ['Books in a public library', '公共圖書館的書籍'],
    ],
    answer: 'A',
    topic: 'Types of goods and services',
  },
];

export const STRUCTURED = {
  topic: 'Market intervention',
  stem: ['The government imposes a per-unit tax on sugary drinks.', '政府向含糖飲品徵收從量稅。'],
  parts: [
    {
      text: [
        'With the aid of a diagram, explain how the tax affects the equilibrium price and quantity of sugary drinks.',
        '試以圖解釋該稅項如何影響含糖飲品的均衡價格和數量。',
      ],
      marks: 4,
      lines: 6,
      scheme: [
        'Supply falls (shifts left) by the amount of the tax; equilibrium price rises and quantity falls. Diagram with labelled axes and both equilibria.',
        '供應減少（向左移），幅度等於稅額；均衡價格上升，均衡數量下降。圖表須標示坐標軸及兩個均衡點。',
      ],
    },
    {
      text: [
        'If the demand for sugary drinks is price-inelastic, do consumers or producers bear the larger share of the tax? Explain.',
        '若含糖飲品的需求缺乏價格彈性，消費者還是生產者承擔較大部分的稅款？試解釋。',
      ],
      marks: 3,
      lines: 5,
      scheme: [
        'Consumers. Demand is price-inelastic, so the price rises by more than half the tax and buyers bear the larger share.',
        '消費者。需求缺乏價格彈性，價格上升幅度大於稅額的一半，故消費者承擔較大部分。',
      ],
    },
  ],
};

/** Extra saved documents, so the start screen shows a library: [template, name]. */
export const LIBRARY = [
  ['Paper 1 mock · MCQ', 'S6 Mock Exam Paper 1'],
  ['Paper 2 mock · booklet', 'S6 Mock Exam Paper 2'],
  ['LQ worksheet', 'S5 Market Failure LQ'],
];

/**
 * The website screenshots' seeded library (`site-seed.test.ts`): worksheets written
 * earlier, so the start screen, the 題庫 bank and the marking scheme have real content.
 * Questions are [English, 中文]; `tags` are topic codes (`src/model/topics.ts`), on the
 * question for an MCQ and per part for a structured question. `points` are HKEAA
 * marking points: [English, 中文, marks]. `diagram` is a model-answer diagram template.
 * `daysAgo` dates each document. The seed test fails on any term the EDB glossary flags.
 */
export const SITE = {
  /** Typed into the New worksheet dialog for its screenshot (never created). */
  newName: 'S5 Price Elasticity Practice',
  papers: [
    {
      id: 'site-market-intervention',
      name: 'S5 Market Intervention Test',
      title: ['S5 Market Intervention Test', '中五 市場干預測驗'],
      classes: ['5A', '5B'],
      daysAgo: 2,
      mcqs: [
        {
          stem: ['The government sets a price ceiling for flour below its equilibrium price. Which of the following will result?', '政府為麵粉設定低於均衡價格的價格上限。以下哪一項會因此出現？'],
          options: [
            ['A surplus of flour', '麵粉過剩'],
            ['A rise in the quantity supplied of flour', '麵粉的供應量上升'],
            ['A shortage of flour', '麵粉短缺'],
            ['A rise in the market price of flour', '麵粉的市場價格上升'],
          ],
          answer: 'C',
          tags: ['C.intervention'],
        },
        {
          stem: ['When bus fares rise by 10%, the quantity demanded of bus rides falls by 4%. The demand for bus rides is', '巴士車費上升10%，巴士服務的需求量下降4%。巴士服務的需求'],
          options: [
            ['price-inelastic.', '缺乏價格彈性。'],
            ['price-elastic.', '富於價格彈性。'],
            ['unitarily price-elastic.', '具單一價格彈性。'],
            ['perfectly price-inelastic.', '完全缺乏價格彈性。'],
          ],
          answer: 'A',
          tags: ['C.ped'],
        },
        {
          stem: ['Mary gives up a part-time job paying $80 an hour to attend a two-hour course with a fee of $100. What is the cost of attending the course?', '瑪麗放棄時薪80元的兼職，去上一節收費100元、為時兩小時的課程。上課的成本是多少？'],
          options: [['$100', '$100'], ['$160', '$160'], ['$260', '$260'], ['$340', '$340']],
          answer: 'C',
          tags: ['A.scarcity'],
        },
        {
          stem: ['Consumer surplus is the difference between', '消費者盈餘是以下兩者之差：'],
          options: [
            ['the price paid by buyers and the price received by sellers.', '買家支付的價格與賣家收取的價格。'],
            ['the maximum amount buyers are willing to pay and the amount they actually pay.', '買家願意支付的最高金額與實際支付的金額。'],
            ['the quantity demanded and the quantity supplied.', '需求量與供應量。'],
            ['the total revenue and the total cost of sellers.', '賣家的總收入與總成本。'],
          ],
          answer: 'B',
          tags: ['C.surplus'],
        },
        {
          stem: ['A tariff on imported rice will, other things being equal,', '在其他條件不變下，向進口大米徵收關稅會'],
          options: [
            ['increase the quantity of rice imported.', '增加大米的進口量。'],
            ['lower the output of local rice producers.', '減少本地大米生產者的產量。'],
            ['lower the government’s tariff revenue to zero.', '令政府的關稅收入降至零。'],
            ['raise the price of rice in the domestic market.', '提高本地市場的大米價格。'],
          ],
          answer: 'D',
          tags: ['J.trade'],
        },
        {
          stem: ['Which of the following is a function of prices?', '以下哪一項是價格的功能？'],
          options: [
            ['Guaranteeing an equal income for everyone', '保證人人收入相等'],
            ['Rationing scarce goods among buyers', '在買家之間分配稀有物品'],
            ['Removing scarcity', '消除稀少性'],
            ['Fixing the quantity supplied', '固定供應量'],
          ],
          answer: 'B',
          tags: ['C.price-functions'],
        },
      ],
      structured: [
        {
          stem: ['The government sets a minimum wage above the equilibrium wage in the market for cleaners.', '政府在清潔工人市場設定高於均衡工資的最低工資。'],
          parts: [
            {
              text: ['With the aid of a diagram, explain the effect of the minimum wage on the employment of cleaners.', '試以圖解釋最低工資對清潔工人就業量的影響。'],
              marks: 4,
              lines: 6,
              tags: ['C.intervention'],
              diagram: 'minimum-wage',
              points: [
                ['Correct diagram: labour demand and supply, minimum wage set above the equilibrium wage', '正確的圖：勞工的需求和供應，最低工資高於均衡工資', 2],
                ['Quantity demanded of labour falls, so employment falls', '勞工的需求量下降，因此就業量下降', 1],
                ['A surplus of labour (unemployment) appears', '出現勞工過剩（失業）', 1],
              ],
            },
            {
              text: ['Is the minimum wage efficient? Explain.', '最低工資是否有效率？試加以解釋。'],
              marks: 3,
              lines: 4,
              tags: ['E.efficiency'],
              points: [
                ['Not efficient', '沒有效率', 1],
                ['At the new employment level, the marginal benefit of labour is greater than its marginal cost', '在新的就業量下，勞工的邊際利益大於其邊際成本', 1],
                ['A deadweight loss arises', '出現效率損失', 1],
              ],
            },
          ],
        },
        {
          stem: ['When the bus fare rises from $8 to $10, the number of bus rides falls from 2,000 to 1,800 a day.', '當巴士車費由8元上升至10元，每日乘車次數由2,000次下降至1,800次。'],
          parts: [
            {
              text: ['Calculate the price elasticity of demand for bus rides, using the original price and quantity as the base.', '以原來的價格和數量為基數，計算巴士服務的需求價格彈性。'],
              marks: 2,
              lines: 3,
              tags: ['C.ped'],
              points: [
                ['Quantity demanded falls by 10% while the price rises by 25%', '需求量下降10%，而價格上升25%', 1],
                ['Price elasticity of demand = 0.4', '需求價格彈性 = 0.4', 1],
              ],
            },
            {
              text: ['Will the total revenue of the bus company rise or fall? Explain.', '巴士公司的總收入會上升還是下降？試加以解釋。'],
              marks: 2,
              lines: 3,
              tags: ['C.ped'],
              points: [
                ['Total revenue rises', '總收入上升', 1],
                ['Demand is price-inelastic: quantity falls by a smaller percentage than price rises', '需求缺乏價格彈性：需求量下降的百分率小於價格上升的百分率', 1],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'site-macro-revision',
      name: 'S6 Macroeconomics Revision',
      title: ['S6 Macroeconomics Revision', '中六 宏觀經濟溫習'],
      classes: ['6C'],
      daysAgo: 4,
      mcqs: [
        {
          stem: ['Which of the following is counted in the GDP of Hong Kong?', '以下哪一項會計算在香港的本地生產總值內？'],
          options: [
            ['The purchase of a second-hand flat', '購買二手住宅單位'],
            ['The salary of a domestic helper working in Hong Kong', '在香港工作的家務助理的薪金'],
            ['Unpaid housework done by a parent', '父母所做的無償家務'],
            ['Old age allowance paid by the government', '政府發放的高齡津貼'],
          ],
          answer: 'B',
          tags: ['F.national-income'],
        },
        {
          stem: ['Which of the following would shift the aggregate demand curve to the right?', '以下哪一項會令總需求曲線向右移？'],
          options: [
            ['A rise in interest rates', '利率上升'],
            ['A fall in exports', '出口下降'],
            ['A rise in salaries tax', '薪俸稅上升'],
            ['A rise in government expenditure', '政府開支上升'],
          ],
          answer: 'D',
          tags: ['G.ad'],
        },
        {
          stem: ['A shop marks the prices of all its goods in Hong Kong dollars. Which function of money does this show?', '一間商店以港元標示所有貨品的價格。這顯示了貨幣的哪一項功能？'],
          options: [
            ['Unit of account', '記賬單位'],
            ['Medium of exchange', '交易媒介'],
            ['Store of value', '價值儲藏'],
            ['Standard of deferred payment', '延期支付的標準'],
          ],
          answer: 'A',
          tags: ['H.money'],
        },
        {
          stem: ['Who gains from unanticipated inflation?', '誰會從非預期通脹中得益？'],
          options: [
            ['Lenders of fixed-rate loans', '以固定利率放款的貸款人'],
            ['Workers on fixed money wages', '貨幣工資固定的工人'],
            ['Borrowers with fixed-rate loans', '以固定利率借款的借款人'],
            ['Retirees on fixed pensions', '領取固定退休金的退休人士'],
          ],
          answer: 'C',
          tags: ['I.inflation'],
        },
        {
          stem: ['Which of the following is an expansionary fiscal policy?', '以下哪一項是擴張性財政政策？'],
          options: [
            ['Raising interest rates', '提高利率'],
            ['Cutting salaries tax', '減低薪俸稅'],
            ['Cutting government expenditure', '削減政府開支'],
            ['Raising profits tax', '提高利得稅'],
          ],
          answer: 'B',
          tags: ['I.fiscal'],
        },
      ],
      structured: [],
    },
    {
      id: 'site-paper1-practice',
      name: 'S5 Paper 1 Practice Set',
      title: ['S5 Paper 1 Practice Set', '中五 卷一練習'],
      classes: ['5A'],
      daysAgo: 1,
      mcqs: [
        {
          stem: ['Which of the following is a feature of a sole proprietorship?', '以下哪一項是獨資企業的特點？'],
          options: [
            ['It is owned by shareholders.', '它由股東擁有。'],
            ['The owner has unlimited liability.', '東主負無限債務責任。'],
            ['It must publish its accounts.', '它必須公開賬目。'],
            ['It is a separate legal entity.', '它是獨立的法人。'],
          ],
          answer: 'B',
          tags: ['B.ownership'],
        },
        {
          stem: ['Which of the following is an advantage of division of labour?', '以下哪一項是分工的好處？'],
          options: [
            ['Workers become more skilful through repetition.', '工人透過重複工作而變得更熟練。'],
            ['Work becomes less monotonous.', '工作變得較不單調。'],
            ['Workers depend less on one another.', '工人之間較少互相依賴。'],
            ['Output is unaffected when one worker is absent.', '一名工人缺勤不會影響產量。'],
          ],
          answer: 'A',
          tags: ['B.division-of-labour'],
        },
        {
          stem: ['Which of the following is a fixed cost of a bakery in the short run?', '以下哪一項是麵包店在短期內的固定成本？'],
          options: [
            ['The cost of flour', '麵粉的成本'],
            ['The wages of workers paid by the hour', '按時薪計算的工人工資'],
            ['The electricity used by the ovens', '焗爐所用的電費'],
            ['The rent of the shop', '店舖的租金'],
          ],
          answer: 'D',
          tags: ['B.costs'],
        },
        {
          stem: ['Which of the following is a feature of a perfectly competitive market?', '以下哪一項是完全競爭市場的特點？'],
          options: [
            ['There are barriers to entry.', '存在加入行業的障礙。'],
            ['Products are differentiated.', '產品有差異。'],
            ['Firms are price takers.', '廠商是受價者。'],
            ['There is only one seller.', '只有一個賣家。'],
          ],
          answer: 'C',
          tags: ['D.structure'],
        },
        {
          stem: ['Which of the following markets is closest to a monopoly?', '以下哪一個市場最接近壟斷？'],
          options: [
            ['Restaurants in Mong Kok', '旺角的餐廳'],
            ['Water supply in Hong Kong', '香港的食水供應'],
            ['Hair salons in Sha Tin', '沙田的髮型屋'],
            ['Fruit stalls in a wet market', '街市的生果檔'],
          ],
          answer: 'B',
          tags: ['D.structure'],
        },
        {
          stem: ['Product differentiation is a feature of', '產品差異化是以下哪一種市場的特點？'],
          options: [
            ['perfect competition.', '完全競爭。'],
            ['a market with a single seller.', '只有一個賣家的市場。'],
            ['every market structure.', '所有市場結構。'],
            ['monopolistic competition.', '壟斷性競爭。'],
          ],
          answer: 'D',
          tags: ['D.structure'],
        },
        {
          stem: ['Which of the following measures the inequality of income distribution?', '以下哪一項量度收入分配的不平均程度？'],
          options: [
            ['The Gini coefficient', '堅尼系數'],
            ['The unemployment rate', '失業率'],
            ['The inflation rate', '通脹率'],
            ['The growth rate of real GDP', '實質本地生產總值的增長率'],
          ],
          answer: 'A',
          tags: ['E.equity'],
        },
        {
          stem: ['Free primary education mainly aims to promote', '免費小學教育主要是為了促進'],
          options: [
            ['efficiency.', '效率。'],
            ['economic growth.', '經濟增長。'],
            ['equity.', '公平。'],
            ['price stability.', '物價穩定。'],
          ],
          answer: 'C',
          tags: ['E.policy'],
        },
        {
          stem: ['The CPI rises from 100 to 103 in a year. The inflation rate is', '消費物價指數在一年內由100上升至103。通脹率是'],
          options: [
            ['103%.', '103%。'],
            ['3%.', '3%。'],
            ['0.3%.', '0.3%。'],
            ['30%.', '30%。'],
          ],
          answer: 'B',
          tags: ['F.price-level'],
        },
        {
          stem: ['Which of the following people is counted as unemployed?', '以下哪一位會被計算為失業人士？'],
          options: [
            ['A retired teacher', '已退休的教師'],
            ['A full-time student', '全日制學生'],
            ['A homemaker', '料理家務者'],
            ['A graduate who is looking for a job', '正在找工作的畢業生'],
          ],
          answer: 'D',
          tags: ['F.unemployment'],
        },
        {
          stem: ['A rise in production costs will, other things being equal, shift the', '在其他條件不變下，生產成本上升會令'],
          options: [
            ['short-run aggregate supply curve to the right.', '短期總供應曲線向右移。'],
            ['aggregate demand curve to the left.', '總需求曲線向左移。'],
            ['short-run aggregate supply curve to the left.', '短期總供應曲線向左移。'],
            ['aggregate demand curve to the right.', '總需求曲線向右移。'],
          ],
          answer: 'C',
          tags: ['G.as'],
        },
        {
          stem: ['The economy is at full employment. If aggregate demand rises, in the long run', '經濟處於充分就業。若總需求上升，在長期'],
          options: [
            ['the price level rises and real output is unchanged.', '物價水平上升，而實質產出不變。'],
            ['real output rises and the price level is unchanged.', '實質產出上升，而物價水平不變。'],
            ['both real output and the price level rise.', '實質產出和物價水平都上升。'],
            ['both real output and the price level are unchanged.', '實質產出和物價水平都不變。'],
          ],
          answer: 'A',
          tags: ['G.equilibrium'],
        },
        {
          stem: ['Which of the following is a function of a commercial bank?', '以下哪一項是商業銀行的功能？'],
          options: [
            ['Issuing Hong Kong coins', '發行香港硬幣'],
            ['Accepting deposits', '接受存款'],
            ['Fixing the exchange rate', '釐定匯率'],
            ['Collecting salaries tax', '徵收薪俸稅'],
          ],
          answer: 'B',
          tags: ['H.banks'],
        },
        {
          stem: ['Which of the following is included in M1?', '以下哪一項包括在貨幣供應M1內？'],
          options: [
            ['Savings deposits', '儲蓄存款'],
            ['Time deposits', '定期存款'],
            ['Shares', '股票'],
            ['Demand deposits', '活期存款'],
          ],
          answer: 'D',
          tags: ['H.money-supply'],
        },
        {
          stem: ['Under the Linked Exchange Rate System, Hong Kong\'s interest rates mainly follow those of', '在聯繫匯率制度下，香港的利率主要跟隨'],
          options: [
            ['the United States.', '美國。'],
            ['the Mainland.', '內地。'],
            ['Japan.', '日本。'],
            ['the United Kingdom.', '英國。'],
          ],
          answer: 'A',
          tags: ['I.monetary'],
        },
        {
          stem: ['Spending by Mainland tourists in Hong Kong is recorded in Hong Kong\'s', '內地旅客在香港的消費記錄在香港的'],
          options: [
            ['imports of services.', '服務輸入。'],
            ['exports of goods.', '貨物出口。'],
            ['exports of services.', '服務輸出。'],
            ['financial account.', '金融賬。'],
          ],
          answer: 'C',
          tags: ['J.bop'],
        },
        {
          stem: ['If the yen depreciates against the Hong Kong dollar, other things being equal,', '在其他條件不變下，若日圓兌港元貶值，'],
          options: [
            ['Hong Kong exports to Japan rise.', '香港輸往日本的出口上升。'],
            ['travelling to Japan becomes cheaper for Hong Kong residents.', '香港居民前往日本旅遊變得較便宜。'],
            ['Japanese goods become dearer in Hong Kong.', '日本貨品在香港變得較貴。'],
            ['fewer Hong Kong residents travel to Japan.', '較少香港居民前往日本旅遊。'],
          ],
          answer: 'B',
          tags: ['J.exchange-rate'],
        },
        {
          stem: ['A monopolist maximises its profit at the output where', '壟斷者在以下哪個產量下取得最大利潤？'],
          options: [
            ['marginal revenue equals marginal cost.', '邊際收入等於邊際成本。'],
            ['price equals marginal cost.', '價格等於邊際成本。'],
            ['total revenue is at its maximum.', '總收入最大。'],
            ['average cost is at its minimum.', '平均成本最低。'],
          ],
          answer: 'A',
          tags: ['EL1.pricing'],
        },
        {
          stem: ['Which of the following is an anti-competitive behaviour?', '以下哪一項是反競爭行為？'],
          options: [
            ['A shop offers a student discount', '商店提供學生優惠'],
            ['A shop opens for longer hours', '商店延長營業時間'],
            ['A firm advertises on television', '廠商在電視上賣廣告'],
            ['Rival firms agree to fix their prices', '競爭對手協議訂定價格'],
          ],
          answer: 'D',
          tags: ['EL1.competition-policy'],
        },
        {
          stem: ['A country should specialise in producing the good in which it has', '一個國家應專門生產它具有以下哪一項的物品？'],
          options: [
            ['an absolute disadvantage.', '絕對劣勢。'],
            ['the highest price.', '最高的價格。'],
            ['a comparative advantage.', '比較優勢。'],
            ['the largest number of workers.', '最多的工人。'],
          ],
          answer: 'C',
          tags: ['EL2.trade-theory'],
        },
        {
          stem: ['Which of the following would raise a country\'s long-run economic growth?', '以下哪一項會提高一個國家的長期經濟增長？'],
          options: [
            ['A rise in the inflation rate', '通脹率上升'],
            ['More investment in education', '增加教育投資'],
            ['A fall in the saving rate', '儲蓄率下降'],
            ['Higher trade barriers', '提高貿易障礙'],
          ],
          answer: 'B',
          tags: ['EL2.growth'],
        },
        {
          stem: ['Choosing between building more hospitals and more schools answers which basic economic problem?', '在興建更多醫院和更多學校之間作出選擇，是回答哪一個基本經濟問題？'],
          options: [
            ['How to produce', '如何生產'],
            ['For whom to produce', '為誰生產'],
            ['How much money to print', '要印製多少貨幣'],
            ['What to produce', '生產甚麼'],
          ],
          answer: 'D',
          tags: ['A.basic-problems'],
        },
        {
          stem: ['Compared with a perfectly competitive industry, a monopoly usually', '與完全競爭行業相比，壟斷通常'],
          options: [
            ['produces more at a lower price.', '以較低價格生產較多。'],
            ['produces the same at the same price.', '以相同價格生產相同數量。'],
            ['produces less at a higher price.', '以較高價格生產較少。'],
            ['produces more at a higher price.', '以較高價格生產較多。'],
          ],
          answer: 'C',
          tags: ['EL1.pricing'],
        },
        {
          stem: ['Which of the following is commonly used to compare living standards across countries?', '以下哪一項常用作比較不同國家的生活水平？'],
          options: [
            ['Total population', '總人口'],
            ['Nominal GDP', '名義本地生產總值'],
            ['The money supply', '貨幣供應'],
            ['Real GDP per capita', '人均實質本地生產總值'],
          ],
          answer: 'D',
          tags: ['EL2.growth'],
        },
      ],
      structured: [],
    },
  ],
  /** Saved graphs (Graphs 圖表庫): [template id, name, days ago]. */
  graphs: [
    ['per-unit-tax', 'Sugar tax: tax incidence', 1],
    ['price-ceiling', 'Rent control: shortage', 2],
    ['minimum-wage', 'Minimum wage for cleaners', 2],
    ['monopoly', 'MTR as a monopoly', 3],
    ['deflationary-gap', 'Deflationary gap, 2020', 4],
    ['tariff-welfare', 'Tariff on imported rice', 6],
  ],
};

/** Typed into the Send feedback dialog for its screenshot (never sent). */
export const FEEDBACK = {
  kind: 'Idea',
  message:
    'It would help if the answer key could also list the syllabus topic for each question, so I can see which topics the class found hardest.',
};

/**
 * The diagram film (`npm run demo:diagrams`): a worksheet seeded off camera, and the
 * supply-and-demand diagram drawn on camera from blank axes. `draw` is unit space
 * (0–1 along each axis, y up); the seed projects it to canvas pixels with `diagramPlot`.
 */
export const DIAGRAMS = {
  title: 'S5 Market Intervention: Diagrams',
  stem: 'The government imposes a per-unit tax of $t on each packet of cigarettes sold.',
  part: {
    text: 'With the aid of a diagram, explain the effect of the tax on the price paid by buyers, the quantity traded and total welfare.',
    marks: 6,
    lines: 6,
  },
  draw: {
    demand: { label: 'D', from: { x: 0.1, y: 0.9 }, to: { x: 0.86, y: 0.14 } },
    supply: { label: 'S', from: { x: 0.1, y: 0.14 }, to: { x: 0.8, y: 0.78 } },
    /** S moved up by this share of the price axis: the tax. Its copy must stay on the plot. */
    taxPercent: 20,
  },
};

/**
 * The ✦ AI film (`npm run demo:ai`): a bilingual worksheet seeded off camera with some
 * 中文 missing. `zh: null` is a text whose 中文 is missing; `fill` is the 中文 the canned
 * provider returns for it (EDB glossary terms: the seed test proves they all check).
 * `planted` is the one teacher-written 中文 term Check terms flags, and its EDB fix.
 * Layout: part (c) must sit high enough on the page (no instructions line, one answer
 * line for (a) and (b)) for the page to scroll it to the middle, so its finding card
 * clears the AI bar at the foot of the window; the film fails if it does not.
 */
export const AI = {
  title: ['S4 Economics: Rent Control', '中四經濟：租金管制'],
  mcq: {
    stem: {
      en: 'The government sets a price ceiling on rents below the equilibrium rent. Which of the following will result?',
      zh: null,
      fill: '政府為租金設定低於均衡租金的價格上限。以下哪一項會因此出現？',
    },
    options: [
      ['A shortage of flats for rent', '出租單位短缺'],
      ['More flats offered for rent', '更多單位放租'],
      ['A fall in the demand for flats', '單位的需求下降'],
      ['A higher rent paid by tenants', '租客支付更高的租金'],
    ],
    answer: 0,
  },
  structured: {
    stem: [
      'Under rent control, the rent of a flat may not exceed $8,000 a month, below the equilibrium rent of $10,000.',
      '在租金管制下，單位的月租不得超過8,000元，低於10,000元的均衡租金。',
    ],
    parts: [
      {
        en: 'Explain why rent control leads to a shortage of flats.',
        zh: null,
        fill: '解釋為何租金管制會導致單位短缺。',
        marks: 2,
        lines: 1,
      },
      {
        en: 'Suggest a way, other than price, that landlords may use to choose tenants.',
        zh: null,
        fill: '除價格外，建議一個業主可用以挑選租客的方法。',
        marks: 2,
        lines: 1,
      },
      {
        en: 'How does rent control affect consumer surplus? Explain.',
        zh: '租金管制對消費者剩餘有何影響？試加以解釋。',
        marks: 4,
        lines: 3,
      },
    ],
  },
  planted: { wrong: '消費者剩餘', fix: '消費者盈餘' },
};
