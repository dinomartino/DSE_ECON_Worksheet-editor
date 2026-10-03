// Film v2's seed content: original HKDSE-style Economics questions (no past-paper items),
// in English and Traditional Chinese (HK usage). Built into stored documents by
// seed-docs.test.ts; clips find the documents by these names.

/**
 * The paper the marking-scheme and check-terms clips open. Two deliberate slips for Check
 * terms to find: 消費者剩餘 (Q1 D) and 供給 (Q4), mainland wording for 消費者盈餘 and 供應.
 */
export const PAPER = {
  name: 'S5 Government Intervention Test',
  title: ['S5 Government Intervention Test', '中五 政府干預測驗'],
  classes: ['5A', '5B'],
  satOn: '2026-09-25',
  mcqs: [
    {
      tags: ['C.intervention'],
      stem: [
        'The government sets a legal maximum price for face masks below the equilibrium price. Which of the following will result?',
        '政府為口罩設定低於均衡價格的法定最高價格。以下哪項會出現？',
      ],
      options: [
        ['A surplus of face masks', '口罩出現過剩'],
        ['A shortage of face masks', '口罩出現短缺'],
        ['An increase in the quantity supplied', '供應量增加'],
        ['Consumer surplus of all buyers rises', '所有買家的消費者剩餘增加'],
      ],
      answer: 1,
      rationale: [
        ['A surplus needs a price set above equilibrium.', '過剩只會在價格高於均衡時出現。'],
        ['At the lower price, quantity demanded exceeds quantity supplied.', '在較低價格下，需求量大於供應量。'],
        ['A lower price reduces the quantity supplied.', '價格下降令供應量減少。'],
        ['Buyers who cannot buy lose their surplus.', '買不到口罩的買家失去其盈餘。'],
      ],
    },
    {
      tags: ['C.ped'],
      stem: [
        'When the price of bubble tea rises by 10%, the quantity demanded falls by 5%. The demand for bubble tea is',
        '當珍珠奶茶的價格上升 10%，其需求量下跌 5%。珍珠奶茶的需求是',
      ],
      options: [
        ['perfectly inelastic.', '完全缺乏彈性。'],
        ['relatively inelastic.', '相對缺乏彈性。'],
        ['unitarily elastic.', '單一彈性。'],
        ['relatively elastic.', '相對富於彈性。'],
      ],
      answer: 1,
      rationale: [
        ['Quantity demanded still changes.', '需求量仍有改變。'],
        ['|Ed| = 5% ÷ 10% = 0.5, less than 1.', '|Ed| = 5% ÷ 10% = 0.5，小於 1。'],
        ['Unitary elasticity needs equal percentage changes.', '單一彈性需要兩者百分比變動相同。'],
        ['Elastic demand needs |Ed| greater than 1.', '富於彈性需要 |Ed| 大於 1。'],
      ],
    },
    {
      tags: ['C.intervention', 'C.ped'],
      stem: [
        'A per-unit tax is imposed on a good whose demand is perfectly inelastic. The tax burden falls',
        '政府向一種需求完全缺乏彈性的物品徵收從量稅。稅負',
      ],
      options: [
        ['entirely on consumers.', '全由消費者承擔。'],
        ['entirely on producers.', '全由生產者承擔。'],
        ['equally on consumers and producers.', '由消費者和生產者平均承擔。'],
        ['on the government.', '由政府承擔。'],
      ],
      answer: 0,
      rationale: [
        ['Price rises by the full tax; quantity does not change.', '價格上升的幅度等於稅額，交易量不變。'],
        ['Producers could only bear it if supply were perfectly inelastic.', '只有供應完全缺乏彈性時，稅負才全由生產者承擔。'],
        ['An equal split needs equal elasticities.', '平均分擔需要兩者彈性相同。'],
        ['The government receives the tax; it bears none of it.', '政府收取稅款，並不承擔稅負。'],
      ],
    },
    {
      tags: ['C.intervention', 'J.trade'],
      stem: [
        'An import quota on frozen beef is tightened, reducing the supply of beef. Which of the following will happen in the local market?',
        '政府收緊冷藏牛肉的進口配額，令牛肉的供給減少。本地市場會出現以下哪項？',
      ],
      options: [
        ['The price falls and imports rise.', '價格下跌，進口量增加。'],
        ['The price falls and imports fall.', '價格下跌，進口量減少。'],
        ['The price rises and imports rise.', '價格上升，進口量增加。'],
        ['The price rises and imports fall.', '價格上升，進口量減少。'],
      ],
      answer: 3,
      rationale: [
        ['A tighter quota cuts supply, so the price cannot fall.', '配額收緊令供應減少，價格不會下跌。'],
        ['Imports fall, but the price rises.', '進口量減少，但價格上升。'],
        ['The quota caps imports at a lower level.', '配額把進口量限制在較低水平。'],
        ['Supply decreases: the price rises and imports fall to the quota.', '供應減少：價格上升，進口量降至配額水平。'],
      ],
    },
  ],
  structured: {
    tags: ['C.intervention', 'E.efficiency'],
    stem: [
      'The government introduces a minimum wage of $45 per hour for security guards. Before the policy, the equilibrium wage was $40 per hour.',
      '政府為保安員設定每小時 $45 的最低工資。在政策實施前，均衡工資為每小時 $40。',
    ],
    parts: [
      {
        text: ['Is the minimum wage effective? Explain.', '該最低工資是否有效？試加以解釋。'],
        marks: 2,
        points: [
          ['Effective', '有效', 1],
          ['because it is set above the equilibrium wage of $40', '因為它高於 $40 的均衡工資', 1],
        ],
      },
      {
        text: [
          'Explain how the minimum wage affects the number of security guards employed.',
          '解釋該最低工資如何影響受僱保安員的人數。',
        ],
        marks: 3,
        points: [
          ['At $45 the quantity of labour demanded falls', '在 $45 時，勞工需求量下降', 1],
          ['while the quantity of labour supplied rises', '而勞工供應量上升', 1],
          ['Employment falls to the quantity demanded; a surplus of labour (unemployment) appears', '僱用人數降至勞工需求量，出現勞工過剩（失業）', 1],
        ],
      },
    ],
  },
  diagram: {
    tags: ['C.intervention'],
    stem: [
      'The market for plastic bags is in equilibrium. The government imposes a per-unit tax on plastic bags.',
      '膠袋市場處於均衡。政府向膠袋徵收從量稅。',
    ],
    part: [
      'With the help of the diagram below, show the effect of the tax on the price and quantity transacted of plastic bags.',
      '試以下圖顯示該稅項對膠袋價格和交易量的影響。',
    ],
    marks: 4,
    template: 'per-unit-tax',
    points: [
      ['Supply curve shifts upward by the tax', '供應曲線按稅額向上移', 1],
      ['New equilibrium: price rises from P0 to P1', '新均衡：價格由 P0 上升至 P1', 1],
      ['Quantity transacted falls from Q0 to Q1', '交易量由 Q0 下降至 Q1', 1],
      ['Correct labels', '標示正確', 1],
    ],
  },
  essay: {
    tags: ['E.equity', 'C.intervention'],
    stem: [
      'Some people suggest that the government should cap the rent of subdivided flats. Discuss the economic effects of such a rent ceiling on tenants and on the rental market.',
      '有人建議政府為劏房租金設定上限。試討論這項租金上限對租客及租務市場的經濟影響。',
    ],
    marks: 8,
    points: [
      ['Effective only if set below the equilibrium rent', '上限須低於均衡租金才有效'],
      ['Tenants who find a flat pay less: their surplus rises', '租到單位的租客付較少租金，消費者盈餘增加'],
      ['Shortage: quantity supplied falls, some tenants cannot rent', '出現短缺：供應量下降，部分租客租不到單位'],
      ['Non-price allocation: queuing, key money, poorer upkeep', '以非價格方式分配：排隊、鞋金、維修變差'],
      ['Deadweight loss; inefficiency', '出現無謂損失，缺乏效率'],
    ],
    levels: [
      [1, 2, 'Few relevant effects, little explanation.', '只有少量相關影響，解釋不足。'],
      [3, 4, 'Effects on tenants and the market explained, one side only.', '能解釋對租客及市場的影響，但只論一方面。'],
      [5, 6, 'Balanced discussion with a reasoned conclusion.', '討論全面，結論有理據。'],
    ],
  },
};

/** The answer-layer clip's document: PAPER's tax question alone. */
export const ANSWER_DOC = {
  name: 'S5 Tax Diagram Practice',
  title: ['S5 Tax Diagram Practice', '中五 稅項圖解練習'],
};

/** The answer-draw and shade-area clips' document: demand and supply given, nothing else. */
export const SHIFT_DOC = {
  name: 'S4 Heater Market Practice',
  title: ['S4 Heater Market Practice', '中四 電暖爐市場練習'],
  tags: ['C.equilibrium'],
  template: 'supply-demand',
  stem: [
    'Hong Kong has an unusually cold winter. The diagram shows the market for electric heaters before the cold spell.',
    '香港今年冬天特別寒冷。下圖顯示寒流來臨前電暖爐的市場。',
  ],
  part: [
    'Show on the diagram the effect of the cold weather on the market for electric heaters.',
    '在圖中顯示寒冷天氣對電暖爐市場的影響。',
  ],
  marks: 3,
};

/**
 * The bank's library: tagged worksheets across the DSE topics, each sat by classes on a
 * date, so the 題庫 shows full topic cards and coverage bars. `q` rows are MCQs
 * [tags, stem en, stem zh, [4 options en/zh], answer] or structured
 * [tags, stem en, stem zh, [[part en, part zh, marks], …]].
 */
export const LIBRARY = [
  {
    name: 'S4 Basic Economic Concepts Quiz',
    title: ['S4 Basic Economic Concepts Quiz', '中四 基本經濟概念測驗'],
    classes: ['4A', '4B'],
    satOn: '2026-09-11',
    q: [
      [['A.scarcity'], 'Which of the following best describes scarcity?', '以下哪項最能描述稀少性？',
        [['Goods are expensive', '物品價格昂貴'], ['Wants exceed the resources to satisfy them', '慾望多於可滿足它們的資源'], ['Goods are out of stock', '物品缺貨'], ['Incomes are low', '收入偏低']], 1],
      [['A.scarcity'], 'Ming spends an evening revising instead of working a $300 shift or watching a film he values at $200. His opportunity cost is', '阿明用一個晚上溫習，而沒有去做一更 $300 的兼職，或看一套他認為值 $200 的電影。他的機會成本是',
        [['$200', '$200'], ['$300', '$300'], ['$500', '$500'], ['zero', '零']], 1],
      [['A.positive-normative'], 'Which of the following is a positive statement?', '以下哪項是實證性陳述？',
        [['The minimum wage should be raised.', '應提高最低工資。'], ['Rents in Hong Kong are too high.', '香港的租金太高。'], ['A rise in bus fares reduces the number of passengers.', '巴士車費上升會減少乘客人數。'], ['The government ought to subsidise tutoring.', '政府應該資助補習。']], 2],
      [['A.circular-flow'], 'Households in a two-sector economy', '在兩部門經濟中，住戶',
        [['buy factors from firms.', '向廠商購買生產要素。'], ['sell factor services to firms.', '向廠商出售生產要素服務。'], ['pay taxes to the government.', '向政府繳稅。'], ['export goods.', '出口物品。']], 1],
      [['A.basic-problems'], 'Which of the following is a "for whom to produce" problem?', '以下哪項屬於「為誰生產」的問題？',
        [['Should the school buy laptops or books?', '學校應購買手提電腦還是書本？'], ['Should robots replace cleaners?', '應否以機械人取代清潔工？'], ['Who should get the limited public housing flats?', '有限的公屋單位應分配給誰？'], ['How many masks should be produced?', '應生產多少口罩？']], 2],
    ],
  },
  {
    name: 'S4 Firms and Production Worksheet',
    title: ['S4 Firms and Production Worksheet', '中四 廠商與生產工作紙'],
    classes: ['4A'],
    satOn: '2026-09-18',
    q: [
      [['B.ownership'], 'Which form of business ownership has unlimited liability and only one owner?', '以下哪種擁有權形式只有一位東主，並須負無限責任？',
        [['Sole proprietorship', '獨資經營'], ['Partnership', '合夥經營'], ['Private limited company', '私人有限公司'], ['Public limited company', '公眾有限公司']], 0],
      [['B.production-types'], 'A bakery buys flour from a mill. This is an example of', '一間麵包店向麵粉廠購買麵粉。這是',
        [['primary production.', '第一級生產。'], ['secondary production.', '第二級生產。'], ['tertiary production.', '第三級生產。'], ['direct service.', '直接服務。']], 1],
      [['B.costs', 'B.factors'], 'A café owner adds a fourth barista to the same machine and output rises by less than before. This illustrates the', '一間咖啡店在同一部咖啡機旁加聘第四位咖啡師，產量的增幅較之前少。這說明了',
        [['law of demand.', '需求定律。'], ['law of diminishing marginal returns.', '邊際報酬遞減定律。'], ['economies of scale.', '規模經濟。'], ['division of labour.', '分工。']], 1],
      [['B.division-of-labour'], 'A fast-food restaurant splits ordering, cooking and packing among different workers.', '一間快餐店把點餐、烹調和包裝分配給不同員工負責。',
        [['State ONE advantage of this division of labour to the restaurant.', '列出這種分工對餐廳的一項好處。', 2], ['Explain ONE possible disadvantage to the workers.', '解釋這對員工的一項可能壞處。', 2]]],
    ],
  },
  {
    name: 'S4 Demand and Supply Test',
    title: ['S4 Demand and Supply Test', '中四 需求與供應測驗'],
    classes: ['4A', '4B', '4C'],
    satOn: '2026-10-02',
    q: [
      [['C.law-of-demand'], 'Which of the following causes a movement along the demand curve for rice?', '以下哪項會令白米的需求曲線上出現沿線移動？',
        [['A rise in incomes', '收入上升'], ['A fall in the price of rice', '白米價格下跌'], ['A rise in the price of noodles', '麵條價格上升'], ['A larger population', '人口增加']], 1],
      [['C.market-supply'], 'A new machine lowers the cost of making phone cases. The supply of phone cases', '新機器降低了製造手機殼的成本。手機殼的供應',
        [['increases.', '增加。'], ['decreases.', '減少。'], ['does not change.', '不變。'], ['becomes perfectly elastic.', '變得完全富於彈性。']], 0],
      [['C.equilibrium'], 'Demand for umbrellas increases while supply decreases. The equilibrium price will', '雨傘的需求增加而供應減少。均衡價格會',
        [['rise.', '上升。'], ['fall.', '下跌。'], ['stay the same.', '不變。'], ['change in an uncertain direction.', '變動方向不能確定。']], 0],
      [['C.surplus'], 'Kit is willing to pay $60 for a concert ticket that costs $45. His consumer surplus is', '阿傑願意為一張 $45 的音樂會門票付 $60。他的消費者盈餘是',
        [['$15', '$15'], ['$45', '$45'], ['$60', '$60'], ['$105', '$105']], 0],
      [['C.equilibrium', 'C.price-functions'], 'A typhoon destroys part of the vegetable crop from the Mainland.', '颱風摧毀了部分內地蔬菜收成。',
        [['With the help of a diagram, explain the effect on the price of vegetables in Hong Kong.', '試以圖解釋這對香港蔬菜價格的影響。', 4], ['Explain how the price change helps to allocate the vegetables.', '解釋價格變動如何協助分配蔬菜。', 2]]],
    ],
  },
  {
    name: 'S5 Elasticity Worksheet',
    title: ['S5 Elasticity Worksheet', '中五 彈性工作紙'],
    classes: ['5A'],
    satOn: '2026-09-15',
    q: [
      [['C.ped'], 'If the demand for MTR rides is price-inelastic, a fare rise will', '如港鐵乘車的需求缺乏價格彈性，車費上升會',
        [['reduce total revenue.', '減少總收益。'], ['raise total revenue.', '增加總收益。'], ['leave total revenue unchanged.', '令總收益不變。'], ['raise the quantity demanded.', '增加需求量。']], 1],
      [['C.pes'], 'The supply of land in Hong Kong in the short run is', '香港土地在短期內的供應是',
        [['perfectly elastic.', '完全富於彈性。'], ['relatively elastic.', '相對富於彈性。'], ['unitarily elastic.', '單一彈性。'], ['perfectly inelastic.', '完全缺乏彈性。']], 3],
      [['C.ped'], 'A cinema raises its ticket price from $80 to $100 and sales fall from 500 to 300 tickets a night.', '一間戲院把門票價格由 $80 提高至 $100，每晚銷量由 500 張下跌至 300 張。',
        [['Calculate the price elasticity of demand (initial-value method).', '以起始值計算需求價格彈性。', 2], ['Is the cinema’s total revenue higher or lower after the change? Show your working.', '價格改變後，戲院的總收益是增加還是減少？列出計算步驟。', 2]]],
    ],
  },
  {
    name: 'S5 Market Structure Quiz',
    title: ['S5 Market Structure Quiz', '中五 市場結構測驗'],
    classes: ['5A', '5B'],
    satOn: '2026-09-22',
    q: [
      [['D.structure'], 'Which of the following is a feature of a perfectly competitive market?', '以下哪項是完全競爭市場的特徵？',
        [['Few sellers', '賣家數目少'], ['Differentiated products', '產品有差異'], ['Free entry and exit', '可自由進出市場'], ['Price makers', '價格決定者']], 2],
      [['D.structure', 'EL1.pricing'], 'A monopolist can earn profit in the long run mainly because of', '壟斷者能在長期賺取利潤，主要是因為',
        [['barriers to entry.', '入市障礙。'], ['perfect information.', '完全資訊。'], ['a large number of buyers.', '買家數目眾多。'], ['a horizontal demand curve.', '水平的需求曲線。']], 0],
      [['D.structure'], 'Supermarkets in Hong Kong are dominated by a few large chains.', '香港的超級市場由少數大型連鎖集團主導。',
        [['Name the market structure of the supermarket market.', '指出超級市場的市場結構。', 1], ['Explain TWO features of this market structure shown by supermarkets.', '解釋超級市場所顯示的這種市場結構的兩項特徵。', 4]]],
    ],
  },
  {
    name: 'S5 National Income Worksheet',
    title: ['S5 National Income Worksheet', '中五 國民收入工作紙'],
    classes: ['5B'],
    satOn: '2026-09-29',
    q: [
      [['F.national-income'], 'Which of the following is counted in Hong Kong’s GDP?', '以下哪項會計入香港的本地生產總值？',
        [['A second-hand flat sold this year', '今年售出的二手樓宇'], ['Unpaid housework', '無償家務'], ['Haircuts sold by local salons', '本地髮型屋提供的理髮服務'], ['Government transfer payments', '政府轉移支付']], 2],
      [['F.price-level'], 'The CPI rises from 104 to 107. The inflation rate is about', '消費物價指數由 104 上升至 107。通脹率約為',
        [['1.03%', '1.03%'], ['2.9%', '2.9%'], ['3%', '3%'], ['7%', '7%']], 1],
      [['F.unemployment'], 'A graduate who is still searching for her first job is', '一名仍在尋找第一份工作的畢業生屬於',
        [['frictionally unemployed.', '摩擦性失業。'], ['structurally unemployed.', '結構性失業。'], ['cyclically unemployed.', '周期性失業。'], ['underemployed.', '就業不足。']], 0],
      [['F.national-income', 'F.hk-trends'], 'Hong Kong’s nominal GDP rose last year while its real GDP fell.', '香港去年的名義本地生產總值上升，但實質本地生產總值下跌。',
        [['Explain how this could happen.', '解釋這情況如何出現。', 2], ['Give ONE limitation of using real GDP per capita to compare living standards.', '指出以人均實質本地生產總值比較生活水平的一項限制。', 2]]],
    ],
  },
  {
    name: 'S6 Money and Banking Revision',
    title: ['S6 Money and Banking Revision', '中六 貨幣與銀行溫習'],
    classes: ['6A', '6B'],
    satOn: '2026-09-08',
    q: [
      [['H.money'], 'Which function of money is shown when a shop prices goods in dollars?', '商店以元標示貨品價格，顯示了貨幣的哪項功能？',
        [['Medium of exchange', '交易媒介'], ['Unit of account', '記賬單位'], ['Store of value', '價值儲藏'], ['Standard of deferred payment', '延期支付的標準']], 1],
      [['H.money-supply', 'H.banks'], 'The required reserve ratio is 20% and a bank receives a new deposit of $1,000. The maximum increase in deposits in the banking system is', '法定儲備比率為 20%，一間銀行收到 $1,000 新存款。銀行體系存款的最大增幅是',
        [['$200', '$200'], ['$1,000', '$1,000'], ['$4,000', '$4,000'], ['$5,000', '$5,000']], 3],
      [['H.interest'], 'An increase in money demand, other things equal, will', '在其他條件不變下，貨幣需求增加會',
        [['lower the interest rate.', '令利率下降。'], ['raise the interest rate.', '令利率上升。'], ['raise the money supply.', '令貨幣供應增加。'], ['leave the interest rate unchanged.', '令利率不變。']], 1],
      [['H.financial-centre'], 'Hong Kong operates a linked exchange rate system.', '香港實行聯繫匯率制度。',
        [['Explain why Hong Kong cannot use monetary policy to fight a recession.', '解釋為何香港不能以貨幣政策對抗經濟衰退。', 3], ['Give ONE benefit of the system to Hong Kong as a financial centre.', '指出這制度對香港作為金融中心的一項好處。', 2]]],
    ],
  },
  {
    name: 'S6 Macro Policies Test',
    title: ['S6 Macro Policies Test', '中六 宏觀經濟政策測驗'],
    classes: ['6A'],
    satOn: '2026-09-30',
    q: [
      [['G.ad'], 'Which of the following increases aggregate demand?', '以下哪項會增加總需求？',
        [['A rise in income tax', '入息稅上升'], ['A fall in exports', '出口下跌'], ['A rise in government spending', '政府開支增加'], ['A rise in interest rates', '利率上升']], 2],
      [['I.fiscal'], 'Electricity subsidies paid to households are an example of', '向住戶發放電費補貼是',
        [['expansionary fiscal policy.', '擴張性財政政策。'], ['contractionary fiscal policy.', '收縮性財政政策。'], ['expansionary monetary policy.', '擴張性貨幣政策。'], ['a trade barrier.', '貿易障礙。']], 0],
      [['I.inflation'], 'Which group gains from unanticipated inflation?', '以下哪類人會從未預期的通貨膨脹中得益？',
        [['Lenders with fixed-rate loans', '提供定息貸款的借出者'], ['Borrowers with fixed-rate loans', '借入定息貸款的借款人'], ['Retirees on fixed pensions', '收取固定退休金的退休人士'], ['Holders of cash', '持有現金的人']], 1],
      [['J.trade', 'J.exchange-rate'], 'The Hong Kong dollar appreciates against the yen.', '港元兌日圓升值。',
        [['Explain the effect on Hong Kong’s imports from Japan.', '解釋這對香港從日本進口的影響。', 2], ['Explain the effect on Hong Kong’s aggregate demand.', '解釋這對香港總需求的影響。', 3]]],
    ],
  },
  {
    name: 'S6 Trade, Growth and Equity Quiz',
    title: ['S6 Trade, Growth and Equity Quiz', '中六 貿易、增長與公平測驗'],
    classes: ['6B'],
    satOn: '2026-09-24',
    q: [
      [['J.trade'], 'Country A can produce a tonne of rice at a lower opportunity cost than Country B. Country A has', 'A 國生產一公噸白米的機會成本較 B 國低。A 國在生產白米方面具有',
        [['an absolute advantage in rice.', '絕對優勢。'], ['a comparative advantage in rice.', '比較優勢。'], ['a trade deficit.', '貿易逆差。'], ['a quota on rice.', '配額。']], 1],
      [['EL2.growth'], 'Which of the following is most likely to raise an economy’s long-run growth?', '以下哪項最可能提高一個經濟體的長期增長？',
        [['A one-off cash handout', '一次性派發現金'], ['More investment in education', '增加教育投資'], ['A higher import tariff', '提高進口關稅'], ['A fall in the savings rate', '儲蓄率下降']], 1],
      [['EL2.trade-theory'], 'Terms of trade improve when', '貿易條件改善是指',
        [['export prices rise relative to import prices.', '出口價格相對進口價格上升。'], ['import volumes rise.', '進口量上升。'], ['the currency depreciates.', '貨幣貶值。'], ['tariffs are removed.', '取消關稅。']], 0],
      [['E.equity'], 'A progressive income tax means that', '累進入息稅是指',
        [['everyone pays the same amount.', '每人繳交相同稅款。'], ['the tax rate rises as income rises.', '稅率隨收入上升而上升。'], ['the poor pay a higher rate.', '窮人的稅率較高。'], ['only firms pay tax.', '只有廠商需要繳稅。']], 1],
      [['G.equilibrium', 'G.as'], 'A rise in oil prices reduces short-run aggregate supply.', '油價上升令短期總供應減少。',
        [['With the help of an AD-AS diagram, explain the effect on the general price level and real output.', '試以總需求—總供應圖，解釋這對一般物價水平和實質產出的影響。', 4]]],
      [['EL1.competition-policy', 'E.policy'], 'Two cement suppliers in Hong Kong agree to charge the same price.', '香港兩間水泥供應商協議收取相同價格。',
        [['Name this anti-competitive behaviour.', '指出這種反競爭行為。', 1], ['Explain how it may harm consumers.', '解釋這可能如何損害消費者。', 3]]],
    ],
  },
];

/** Every seeded document, newest first, for pinning ages relative to the film's "now". */
export const AGE_HOURS = {
  [PAPER.name]: 0.3,
  [ANSWER_DOC.name]: 0.6,
  [SHIFT_DOC.name]: 0.9,
  'S6 Macro Policies Test': 30,
  'S4 Demand and Supply Test': 54,
  'S5 National Income Worksheet': 75,
  'S5 Market Structure Quiz': 120,
  'S6 Trade, Growth and Equity Quiz': 140,
  'S4 Firms and Production Worksheet': 170,
  'S5 Elasticity Worksheet': 210,
  'S4 Basic Economic Concepts Quiz': 260,
  'S6 Money and Banking Revision': 300,
};
