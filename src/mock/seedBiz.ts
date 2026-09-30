import type {
  CaseItem, Topic, Bounty, AssignmentType, AssignmentPeriod, AssignmentSubmit,
  ScoreCard, ScoreResult, Expert, ExpertSchedule, Booking, ExpertReview,
  AssetApply, Asset, PointRecord, ShopItem, ShopOrder, Board, Post, PostComment, WbUsage,
  TopicSelection, BoardConfig, SkillPackage, Attachment, Announcement, SceneCard,
} from './types';
import { USERS, mulberry32, deptName } from './seedOrg';

/** 演示基准日：届次进行中（W3 制作陪跑） */
export const DEMO_TODAY = '2026-09-25';

const rnd = mulberry32(20260925);
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;

const u = (name: string) => USERS.find((x) => x.name === name)!;

/* ============ M1 场景案例区（数据源：R6 大赛选题案例库 20 场景） ============ */
type CaseSeed = [string, CaseItem['track'], string, string, CaseItem['level'], string, string, string, string, string[], string, string[]];
const CASE_SEED: CaseSeed[] = [
  ['A1', '客户赋能', '客户月度经营体检报告', '账做完就发报表，客户看不懂也不回，续约时没话说。', '骨干层',
    '本月利润表 + 上月对比（Excel/截图）、客户行业、上月体检报告',
    '你是服务中小微企业的财税顾问。以下是 [客户名]（[行业]）本月经营数据与上月对比：<粘贴数据>。请输出：① 3 句话讲清本月经营状况；② 3 个最值得关注的数字变化，每项给 2-3 个可能原因（标注「需向客户确认」）和 1 条行动建议；③ 3 条下月建议按优先级排序。要求：全用白话，禁止会计科目名，金额换算成万元，总长 ≤ 600 字。',
    '一页体检报告（结论 3 句 + 异常 3 条 + 建议 3 条）',
    '① 找一个非财务同事读，他能说出「这个月是好是坏、坏在哪」；② 至少 2 条建议是具体动作；③ 连续做 3 个月，客户回复率有提升。',
    ['会计主管', '客户成功经理'], '30 分钟', ['客户经营', '数据分析']],
  ['A2', '客户赋能', '政策速递的客户化改写', '新政一出总部发原文，客户看不懂、不确定跟自己有没有关系，一线答不上来。', '骨干层',
    '政策原文、客户名单标签（行业 / 规模 / 纳税人类型）',
    '你是财税政策解读顾问。以下是新政原文：<粘贴原文>。请输出：① 一句话结论：影响哪类客户；② 影响拆解表（受影响客户特征 / 具体影响 / 生效时间 / 客户需配合动作）；③ 三版触达文案（微信 ≤100 字口语、短信 ≤60 字含行动指引、正式函件 ≤200 字）；④ 客户最可能追问的 5 个问题及标准应答。红线：适用范围、生效时间、数字口径必须忠于原文，不确定处标注【待总部确认】。',
    '政策解读卡 + 3 版触达文案 + 5 条应答',
    '① 适用范围与生效时间零错误（错一处即不合格）；② 微信版 5 秒内能判断「跟我有没有关系」；③ 5 条应答里至少 1 条是原文没写但客户一定会问的。',
    ['财税顾问', '运营'], '40 分钟', ['政策解读', '文案生成']],
  ['A3', '客户赋能', '客户拜访前准备卡', '拜访前临时翻聊天记录，问的问题客户答不上来，场面尴尬还浪费一次上门机会。', '干部层',
    '客户基础信息、近 3 次沟通纪要、上期服务报告',
    '你是资深财税顾问的助理。基于以下客户信息与近 3 次沟通纪要：<粘贴>。生成一页拜访准备卡：① 客户当前最可能的 3 个关切点（按可能性排序）；② 每个关切点的开场问法（一句话）；③ 本次要达成的 1 个明确目标；④ 需要客户确认的 2 个信息；⑤ 不要碰的 2 个话题（附理由）。',
    '一页准备卡（关切点 + 开场问法 + 目标 + 待确认 + 避坑）',
    '① 准备卡能在 3 分钟内读完；② 3 个关切点里有至少 1 个来自历史纪要；③ 走访后复盘：准备卡命中率 ≥ 2/3。',
    ['分公司负责人', '客户成功经理'], '20 分钟', ['拜访准备', '客户经营']],
  ['A4', '客户赋能', '客户沟通复盘与风险识别', '沟通完只记得「聊得还行」，风险信号没记下来，等客户流失才发现晚了。', '干部层',
    '本次沟通的录音转写 / 纪要、客户历史服务记录',
    '你是客户成功团队的复盘教练。以下是本次沟通纪要：<粘贴>。请输出：① 客户明确表达的诉求（原文引用）；② 3 个潜在流失风险信号及判断依据；③ 下一步跟进动作（含负责人建议与时间点）；④ 需要升级处理的事项（若有）。要求：风险信号必须引用纪要原文，不得臆测。',
    '复盘卡 + 跟进话术 + 风险标记',
    '① 每个风险信号都能对应到纪要中的具体表述；② 跟进动作含明确时间点；③ 团队周会可直接拿去用。',
    ['分公司负责人', '会计主管'], '25 分钟', ['复盘', '风险识别']],
  ['A6', '客户赋能', '流失风险预警与挽回包', '客户续约前一个月才发现要丢，临时抱佛脚，挽回成功率极低。', '骨干层',
    '近 6 个月服务记录、开票与收款记录、客诉记录、沟通频次',
    '你是客户留存分析专家。基于以下客户近 6 个月数据：<粘贴>。输出：① 流失风险分层（高 / 中 / 低）及分层依据；② 高风险客户的 3 个共性特征；③ 每档对应的挽回动作包（话术 + 动作 + 时间点 + 责任人）；④ 需要立即人工介入的名单。要求：分层规则可复用，不依赖单次人工判断。',
    '风险分层表 + 挽回动作包',
    '① 分层规则可写成公式，换一批客户也能跑；② 挽回动作包含明确话术与时间点；③ 试点后高风险客户挽回升率可统计。',
    ['运营', '客户成功经理'], '半天', ['留存', '数据分析']],
  ['A7', '客户赋能', '年度服务总结与续约弹药包', '续约谈判只会说「我们服务很好」，拿不出客户认可的价值证据。', '干部层',
    '全年服务记录、客户经营数据对比、关键事件时间线',
    '你要帮顾问写一份年度服务总结。基于以下全年服务记录与经营数据：<粘贴>。输出：① 一页年度价值报告（做了什么 / 带来什么变化 / 明年做什么）；② 3 条可直接对客户说的价值陈述（附数据支撑）；③ 2 个可能的客户异议及应对话术。要求：价值陈述必须可量化，禁止「服务质量显著提升」类空话。',
    '年度价值报告 + 3 条价值陈述 + 异议应对',
    '① 每条价值陈述都带具体数字；② 报告客户方负责人能直接看懂；③ 续约谈判可直接引用。',
    ['分公司负责人', '财税顾问'], '1 小时', ['续约', '价值呈现']],
  ['B1', '团队提效', '会议纪要 → 行动项清单', '会议开完纪要躺在文档里，谁做什么、什么时候做完没人跟，下次会还是老问题。', '干部层',
    '会议录音转写 / 手写纪要',
    '你是项目经理。以下是本次会议纪要：<粘贴>。输出：① 决策事项（已定、待定）；② 行动项清单（动作 / 责任人 / 截止时间 / 验收标准），责任人必须来自纪要中的真实姓名；③ 未决事项与下次讨论建议；④ 纪要中没有明确责任人的事项单独列出。要求：不得虚构责任人，无法识别的标注【待确认】。',
    '纪要 + 待办清单 + 未决事项',
    '① 行动项可直接导入待办工具；② 责任人全部来自纪要原文；③ 未决事项不遗漏。',
    ['分公司负责人', '运营'], '15 分钟', ['会议纪要', '任务拆解']],
  ['B2', '团队提效', '周报 / 月度经营简报汇总', '每周收十几份周报，人工汇总两小时，还经常漏掉关键风险。', '干部层',
    '本团队各成员周报、本月经营指标',
    '你是事业群经营分析助理。以下是本团队本周周报：<粘贴>。输出一页简报：① 本周关键进展 3 条；② 风险与卡点 2 条（附责任人与建议动作）；③ 需要上级决策的事项；④ 下周重点。要求：每条都标注来源人，篇幅控制在一页 A4。',
    '一页经营简报',
    '① 一页读完，不超过 800 字；② 每条可追溯到来源人；③ 风险项有明确建议动作。',
    ['分公司负责人', '大区总经理'], '30 分钟', ['经营简报', '汇总']],
  ['B5', '团队提效', '服务质量抽检与错题分析', '服务质量靠抽查，样本小、统计难，共性问题发现不了，培训没靶子。', '骨干层',
    '本月服务工单记录、客户评价、历史错题本',
    '你是质量管理专员。基于以下服务工单与评价数据：<粘贴>。输出：① 本月高频问题 TOP5（含出现次数与典型样例）；② 问题归因（能力 / 流程 / 工具）；③ 针对 TOP2 问题的改进建议；④ 更新后的错题本条目。要求：频次统计口径明确，样例需脱敏。',
    '抽检报告 + 错题本',
    '① TOP5 问题有准确计数与口径说明；② 归因可落到具体改进动作；③ 错题本可直接用于培训。',
    ['运营', '服务质量专员'], '半天', ['质量抽检', '错题本']],
  ['B6', '团队提效', '招聘面试题库与评估表', '面试靠临场发挥，不同面试官问的不一样，评价没有统一标尺。', '干部层',
    '岗位 JD、团队现有能力短板、历史面试反馈',
    '你是招聘负责人。基于以下岗位 JD 与团队短板：<粘贴>。输出：① 5 个维度的面试题库（每维 3 题，含追问）；② 统一评分表（维度 / 权重 / 评分标准档位）；③ 面试官使用说明。要求：题目考察点明确，评分标准可区分「能说」与「能做」。',
    '面试题库 + 评分表',
    '① 两名面试官用同一评分表打分差异 ≤ 1 分；② 题目能区分经验深浅；③ 可直接使用无需二次加工。',
    ['分公司负责人', 'HRBP'], '1 小时', ['招聘', '评估表']],
  ['C3', '销售提效', '客户画像与切入角度', '拿到线索不知道客户是什么类型，开口就推产品，命中率低。', '干部层',
    '客户工商/公开信息、行业特征、已有触达记录',
    '你是销售策略顾问。基于以下客户信息：<粘贴>。输出一页画像：① 客户类型判断（附依据）；② 3 个可能的切入点（每个含一句话开场白）；③ 最可能的 2 个异议及应对；④ 本次触达建议渠道与时机。要求：判断依据必须来自所给信息，禁止编造。',
    '一页画像 + 3 个切入点',
    '① 判断依据可追溯；② 开场白可直接说出口；③ 一线用完反馈「比自己想的准」。',
    ['销售经理', '客户成功经理'], '20 分钟', ['客户画像', '销售策略']],
  ['C5', '销售提效', '向上汇报的提纲与叙事结构', '汇报写了十页，领导只问一句「所以呢」，重点全埋没了。', '干部层',
    '原始数据 / 工作进展、汇报对象与时长',
    '你是高管助理。以下是汇报素材与汇报对象特征：<粘贴>。输出：① 一页汇报提纲（结论先行，3 个支撑点）；② 每页的一句话核心信息；③ 领导最可能追问的 3 个问题及准备答案；④ 需要领导决策的 1 个明确事项。要求：结论必须在第一句出现。',
    '汇报提纲 + 追问预案',
    '① 结论在第一句；② 3 个追问预案准备充分；③ 汇报时长可控制在预定时间内。',
    ['分公司负责人', '大区总经理'], '25 分钟', ['向上汇报', '结构化表达']],
  ['C6', '销售提效', 'Excel 数据清洗与异常识别', '每月几百行数据靠肉眼找异常，漏检率高，做完还不敢保证全对。', '干部层',
    '原始 Excel 数据（含重复值、空值、格式不一致）',
    '你是数据处理助手。以下是原始数据说明与样例：<粘贴>。请输出：① 清洗步骤清单（去重 / 补全 / 格式统一 / 异常标记），每步给出可执行的 Excel 操作或公式；② 异常识别规则（口径 + 阈值）；③ 清洗后的核对方法。要求：每一步都可复现，不依赖手工判断。',
    '清洗后表格 + 异常清单 + 可复用步骤',
    '① 步骤可复现，换人也能跑出同样结果；② 异常规则有明确阈值；③ 有核对方法能自检。',
    ['会计主管', '数据分析师'], '30 分钟', ['Excel', '数据清洗']],
  ['C7', '销售提效', '对外公文 / 通知 / 邮件起草润色', '通知写得又长又硬，客户看完不知道要做什么，还要反复改好几版。', '干部层',
    '事项要点、受众、期望动作、截止时间',
    '你是公文写作助手。基于以下要点：<粘贴>。输出：① 正式版（书面、可直接发送）；② 口语版（微信/短信）；③ 一句话摘要（用于标题或开头）。要求：受众读完知道「我要做什么、什么时候前做、不做会怎样」。',
    '可直接发送的文本（两版 + 摘要）',
    '① 无需修改即可发送；② 行动指引与截止时间明确；③ 语气符合渠道。',
    ['分公司负责人', '运营'], '10 分钟', ['公文', '文案润色']],
];

export const CASES: CaseItem[] = CASE_SEED.map((s, i) => ({
  id: s[0],
  track: s[1],
  title: s[2],
  summary: s[2],
  pain_point: s[3],
  level: s[4],
  input: s[5],
  prompt: s[6],
  output: s[7],
  acceptance: s[9] ? [] : [],
  tags: s[11],
  author_union_id: u(pick(['赵冰艳', '彭丽芳', '曾庆丰'])).union_id,
  author_name: pick(['赵冰艳', '彭丽芳', '曾庆丰']),
  like_count: int(8, 96),
  view_count: int(120, 1800),
  reuse_count: int(3, 60),
  duration: s[10],
  cover: ['📊', '📄', '🎯', '🔍', '⚠️', '📈', '📝', '📮', '🔬', '🧲', '🗣️', '🧹', '✉️'][i % 13],
  status: '已发布',
  created_at: `2026-09-${String(15 + (i % 8)).padStart(2, '0')} 10:00`,
}));
// 验收标准：按 3 条拆分
CASE_SEED.forEach((s, i) => {
  CASES[i].acceptance = s[8].split('；').map((x) => x.replace(/^[①②③]\s*/, '').trim()).filter(Boolean);
});

/* ============================================================
   V4.1：案例附加资源种子 —— 可直接安装的 Skill + 补充信息 / 附件
   两者均可选：未配置的案例对应区块不渲染（不出现空壳）
   ============================================================ */
type CaseExtraSeed = {
  skills: Omit<SkillPackage, 'id'>[];
  atts: Omit<Attachment, 'id'>[];
};
const CASE_EXTRA: Record<string, CaseExtraSeed> = {
  A1: {
    skills: [
      {
        type: 'UPLOAD', name: '客户经营体检助手', version: 'v1.2.0',
        file_name: 'customer-health-check-v1.2.0.zip', file_size: '168 KB',
        note: '解压后在 WorkBuddy「技能 › 导入本地技能包」选择该 zip；首次运行需填客户行业与规模。',
      },
      {
        type: 'LINK', name: '体检报告提示词包', version: 'v1.0.1',
        url: 'https://workbuddy.example.com/skills/customer-health-check',
        note: '点链接可直装；内网打不开时改用上面的压缩包。',
      },
    ],
    atts: [
      { name: '月度体检报告模板.xlsx', size: '42 KB', ext: 'xlsx', note: '填空即可出稿，含公式与万元换算' },
      { name: '客户数据脱敏样例.xlsx', size: '18 KB', ext: 'xlsx' },
    ],
  },
  A2: {
    skills: [
      {
        type: 'LINK', name: '政策解读改写助手', version: 'v2.1.0',
        url: 'https://workbuddy.example.com/skills/policy-rewrite',
        note: '适用于总部下发原文后的客户化改写；生效时间与适用范围会以原文为准二次校验。',
      },
    ],
    atts: [{ name: '三版触达文案范式.docx', size: '26 KB', ext: 'docx' }],
  },
  A3: {
    skills: [
      {
        type: 'UPLOAD', name: '拜访准备卡生成器', version: 'v1.1.0',
        file_name: 'visit-prep-card-v1.1.0.zip', file_size: '94 KB',
        note: '需配合近 3 次沟通纪要使用；纪要越完整，关切点命中率越高。',
      },
    ],
    atts: [],
  },
  B1: {
    skills: [
      {
        type: 'UPLOAD', name: '纪要转待办', version: 'v1.4.2',
        file_name: 'minutes-to-todo-v1.4.2.zip', file_size: '76 KB',
        note: '责任人必须来自纪要原文，识别不到会标【待确认】，不会凭空指派。',
      },
      {
        type: 'LINK', name: '纪要转待办（精简版）', version: 'v1.3.0',
        url: 'https://workbuddy.example.com/skills/minutes-to-todo-lite',
      },
    ],
    atts: [{ name: '会议纪要样例.txt', size: '6 KB', ext: 'txt', note: '用来试跑，跑通再换自己的纪要' }],
  },
  B2: {
    skills: [
      {
        type: 'LINK', name: '周报汇总助手', version: 'v1.0.3',
        url: 'https://workbuddy.example.com/skills/weekly-digest',
        note: '一次最多处理 20 份周报，超出请分批。',
      },
    ],
    atts: [{ name: '一页简报版式.pdf', size: '312 KB', ext: 'pdf' }],
  },
  B6: {
    skills: [
      {
        type: 'UPLOAD', name: '面试题库生成器', version: 'v0.9.1',
        file_name: 'interview-question-bank-v0.9.1.zip', file_size: '132 KB',
        note: 'Beta 版：评分表档位需 HRBP 复核后再用。',
      },
    ],
    atts: [
      { name: '统一评分表模板.xlsx', size: '34 KB', ext: 'xlsx' },
      { name: '岗位 JD 样例.docx', size: '21 KB', ext: 'docx' },
    ],
  },
};
CASE_SEED.forEach((s, i) => {
  const extra = CASE_EXTRA[s[0]];
  if (!extra) return;
  CASES[i].skill_packages = extra.skills.map((x, k) => ({ ...x, id: `SK-${s[0]}-${k + 1}` }));
  CASES[i].attachments = extra.atts.map((x, k) => ({ ...x, id: `AT-${s[0]}-${k + 1}` }));
});

/* ============ 选题池（32 选题清单抽样 20） ============ */
const TOPIC_TITLES: [string, CaseItem['track'], CaseItem['level'], string][] = [
  ['为 TOP10 客户做一份月度体检报告', '客户赋能', '骨干层', '一页体检报告 + 3 条建议'],
  ['把本季度新政改写成客户能懂的 3 版文案', '客户赋能', '骨干层', '解读卡 + 3 版文案'],
  ['给下周要拜访的 5 家客户各做一张准备卡', '客户赋能', '干部层', '5 张准备卡'],
  ['复盘本月 10 次客户沟通，输出风险清单', '客户赋能', '干部层', '复盘卡 + 风险清单'],
  ['整理高频客户异议，做成应对卡', '客户赋能', '骨干层', '异议应对卡（≥10 条）'],
  ['建一套流失风险分层规则 + 挽回动作包', '客户赋能', '骨干层', '分层表 + 动作包'],
  ['为 3 家待续约客户做年度价值报告', '客户赋能', '干部层', '年度价值报告 ×3'],
  ['把部门周会纪要做成行动项清单', '团队提效', '干部层', '行动项清单'],
  ['把 12 份周报汇总成一页经营简报', '团队提效', '干部层', '一页简报'],
  ['输出新人 30 天带教清单', '团队提效', '骨干层', '带教 SOP'],
  ['把老员工经验反推成岗位 SOP', '团队提效', '骨干层', '作业标准文档'],
  ['做本月服务质量抽检报告与错题本', '团队提效', '骨干层', '抽检报告 + 错题本'],
  ['建一套面试题库与统一评分表', '团队提效', '干部层', '题库 + 评分表'],
  ['把一门内训课做成课件提纲 + 试卷', '团队提效', '骨干层', '课件提纲 + 试卷'],
  ['生成一个月私域朋友圈内容', '销售提效', '干部层', '≥20 条文案'],
  ['给本月线索做分级与跟进节奏', '销售提效', '骨干层', '分级名单 + 节奏表'],
  ['为 5 个重点客户做画像与切入点', '销售提效', '干部层', '5 份画像'],
  ['起草一份服务建议书初稿', '销售提效', '干部层', '建议书初稿'],
  ['把季度汇报改成结论先行的一页提纲', '销售提效', '干部层', '汇报提纲'],
  ['清洗本月客户开票数据并标记异常', '销售提效', '干部层', '清洗表 + 异常清单'],
];
/** V4.0 CR-03：按赛道/关键词派生自选标签（确定性，保证演示可复现） */
const TOPIC_TAG_POOL: Record<string, string[]> = {
  客户赋能: ['对账', '续约', '风险', '画像', '建议书'],
  团队提效: ['周报', '纪要', '带教', 'SOP', '题库'],
  销售提效: ['线索', '汇报', '朋友圈', '清洗', '画像'],
};

export const TOPICS: Topic[] = TOPIC_TITLES.map((t, i) => ({
  id: `TP${String(i + 1).padStart(2, '0')}`,
  case_id: CASES[i % CASES.length].id,
  title: t[0],
  track: t[1],
  suggest_level: t[2],
  expected_output: t[3],
  difficulty: t[2] === '骨干层' ? pick(['中', '难'] as const) : pick(['易', '中'] as const),
  status: i < 4 ? '已被选' : '可选',
  picked_by: i < 4 ? ['郑雅琳', '梁伟强', '谢婉如', '韩小雨'][i] : undefined,
  /** @deprecated 见 types.ts：非排斥后不再作为唯一选中人 */
  tags: [t[1], ...(TOPIC_TAG_POOL[t[1]] ?? []).slice(i % 3, (i % 3) + 2)],
  select_limit: 0, // 0=不限（非排斥）；置 1 即回到 V3.0 排他
}));

/** V4.0 CR-03/CR-04：选题记录（非排斥：同一选题可多人选中） */
export const TOPIC_SELECTIONS: TopicSelection[] = [
  { id: 'TS01', topic_id: 'TP01', union_id: USERS.find((x) => x.name === '郑雅琳')!.union_id, selected_at: '2026-09-22 10:12', status: '已完成' },
  { id: 'TS02', topic_id: 'TP02', union_id: USERS.find((x) => x.name === '梁伟强')!.union_id, selected_at: '2026-09-22 15:30', status: '已提报' },
  { id: 'TS03', topic_id: 'TP03', union_id: USERS.find((x) => x.name === '谢婉如')!.union_id, selected_at: '2026-09-23 09:05', status: '已选' },
  { id: 'TS04', topic_id: 'TP04', union_id: USERS.find((x) => x.name === '韩小雨')!.union_id, selected_at: '2026-09-23 11:40', status: '已选' },
  { id: 'TS05', topic_id: 'TP01', union_id: USERS.find((x) => x.name === '曹国庆')!.union_id, selected_at: '2026-09-24 14:20', status: '已选' },
];

/* ============ M2 悬赏 ============ */
export const BOUNTIES: Bounty[] = [
  { id: 'B-001', title: '客户对账差异自动核对', pain_point: '每月对账要人工比对两套表，差异项靠肉眼找，平均耗时 3 小时/户，还经常漏。', expected_output: '一套可复用的差异核对流程（提示词 + 步骤说明），能处理 500 行以上数据', points: 300, track: '客户赋能', owner_union_id: u('赵冰艳').union_id, owner_name: '赵冰艳', source: '组织者发布', status: 'PUBLISHED', due_date: '2026-10-08', desensitized: true, created_at: '2026-09-21 10:00' },
  { id: 'B-002', title: '新人首月带教素材包', pain_point: '新人上手靠师傅带，带教内容因人而异，质量不稳定，出师周期长。', expected_output: '岗位带教清单 + 30 天节奏表 + 每周验收标准', points: 250, track: '团队提效', owner_union_id: u('赵冰艳').union_id, owner_name: '赵冰艳', source: '组织者发布', status: 'CLAIMED', claimant_union_id: u('周文静').union_id, claimant_name: '周文静', due_date: '2026-10-05', desensitized: true, created_at: '2026-09-21 10:20' },
  { id: 'B-003', title: '客户续约异议应对库', pain_point: '续约谈判遇到的问题高度重复，但没有沉淀，每个人都在重新踩坑。', expected_output: '≥15 条异议应对卡（异议 / 判断 / 话术 / 案例）', points: 200, track: '客户赋能', owner_union_id: u('梁伟强').union_id, owner_name: '梁伟强', source: '成员发布', status: 'PUBLISHED', due_date: '2026-10-10', desensitized: true, created_at: '2026-09-22 14:20' },
  { id: 'B-004', title: '政策原文的适用范围自动标注', pain_point: '新政要看适用范围，人工逐条比对客户特征，容易出错且慢。', expected_output: '可复用的标注规则 + 至少一个真实政策的验证结果', points: 350, track: '客户赋能', owner_union_id: u('谢婉如').union_id, owner_name: '谢婉如', source: '成员发布', status: 'PENDING_REVIEW', due_date: '2026-10-12', desensitized: true, created_at: '2026-09-24 11:12' },
  { id: 'B-005', title: '会议纪要转待办的准确率提升', pain_point: '纪要转待办经常漏掉没有明确责任人的事项，导致事情悬空。', expected_output: '提示词优化方案 + 前后对比（≥10 份纪要验证）', points: 180, track: '团队提效', owner_union_id: u('潘晓婷').union_id, owner_name: '潘晓婷', source: '成员发布', status: 'PENDING_REVIEW', due_date: '2026-10-09', desensitized: true, created_at: '2026-09-24 16:40' },
  { id: 'B-006', title: '客户风险信号自动提取', pain_point: '沟通纪要里的风险信号靠人读，样本一大就看不完。', expected_output: '风险信号词典 + 提取流程 + 20 份纪要的验证', points: 280, track: '客户赋能', owner_union_id: u('赵冰艳').union_id, owner_name: '赵冰艳', source: '组织者发布', status: 'SUBMITTED', claimant_union_id: u('曹国庆').union_id, claimant_name: '曹国庆', due_date: '2026-10-03', desensitized: true, created_at: '2026-09-21 11:00', solution: '已提交：风险词典 32 条 + 提取流程说明 + 22 份纪要验证结果，命中率 78%。' },
  { id: 'B-007', title: '月度经营简报一键汇总', pain_point: '每周汇总十几份周报要 2 小时，还经常漏关键风险。', expected_output: '可复用汇总模板 + 一页简报样例', points: 220, track: '团队提效', owner_union_id: u('赵冰艳').union_id, owner_name: '赵冰艳', source: '组织者发布', status: 'APPROVED', claimant_union_id: u('杜鹏飞').union_id, claimant_name: '杜鹏飞', due_date: '2026-09-30', desensitized: true, created_at: '2026-09-21 11:30', solution: '简报模板 + 样例，已在大区周会试用，汇总耗时由 2 小时降至 25 分钟。' },
  { id: 'B-008', title: '客户开票数据异常识别规则', pain_point: '开票数据异常靠肉眼找，漏检率高。', expected_output: '异常识别规则清单（含阈值）+ 验证结果', points: 200, track: '销售提效', owner_union_id: u('唐志明').union_id, owner_name: '唐志明', source: '成员发布', status: 'REJECTED', due_date: '2026-10-06', desensitized: true, created_at: '2026-09-23 09:50', reject_reason: '与已有案例 C6（Excel 数据清洗与异常识别）高度重合，建议先在案例基础上做本部门数据验证，产出差异化规则后再发起。' },
  { id: 'B-009', title: '服务质量抽检样本抽取方法', pain_point: '抽检样本靠人挑，样本偏差大，共性问题发现不了。', expected_output: '抽样方法 + 样本量建议 + 一次实操结果', points: 160, track: '团队提效', owner_union_id: u('杜鹏飞').union_id, owner_name: '杜鹏飞', source: '成员发布', status: 'PUBLISHED', due_date: '2026-10-11', desensitized: true, created_at: '2026-09-23 15:05' },
  { id: 'B-010', title: '向上汇报的一页纸模板', pain_point: '汇报写了十页没重点，领导看不到结论。', expected_output: '一页纸模板 + 2 个真实场景的填写样例', points: 150, track: '销售提效', owner_union_id: u('赵冰艳').union_id, owner_name: '赵冰艳', source: '组织者发布', status: 'EXPIRED', due_date: '2026-09-20', desensitized: true, created_at: '2026-09-21 12:00' },
];

/* ============ M5 评分卡 ============ */
export const SCORE_CARDS: ScoreCard[] = [
  {
    id: 'SC1', name: '大赛四维评分卡', version: 'v2', total_rule: '加权求和', pass_line: 60,
    ai_weight: 80, judge_weight: 20, status: '启用', bind_target: '作业类型：2026 Q4 AI 应用实践作业',
    updated_at: '2026-09-26 17:20',
    dimensions: [
      { id: 'D1', name: '真实性', weight: 30, max_score: 30, standard: '是否基于真实业务数据与真实场景，能否说明真实输入与过程', sort: 1, levels: [
        { level: '优秀', range: '25-30', desc: '真实业务数据完整，输入与过程可复现' },
        { level: '良好', range: '18-24', desc: '场景真实但数据链条有缺口' },
        { level: '合格', range: '12-17', desc: '场景真实但无数据支撑' },
        { level: '不合格', range: '0-11', desc: '疑似虚构或无法验证' }] },
      { id: 'D2', name: '业务价值', weight: 30, max_score: 30, standard: '是否解决真实痛点，是否能被他人直接用于业务', sort: 2, levels: [
        { level: '优秀', range: '25-30', desc: '解决高频痛点，他人可直接复用' },
        { level: '良好', range: '18-24', desc: '有价值但适用范围有限' },
        { level: '合格', range: '12-17', desc: '有改善但不显著' },
        { level: '不合格', range: '0-11', desc: '无实际业务价值' }] },
      { id: 'D3', name: '可复用性', weight: 25, max_score: 25, standard: '产出是否能沉淀为可复用资产（提示词 / Skill / 模板），复用门槛多低', sort: 3, levels: [
        { level: '优秀', range: '21-25', desc: '可打包为 Skill 包，他人零门槛使用' },
        { level: '良好', range: '15-20', desc: '提示词可复用，需少量修改' },
        { level: '合格', range: '8-14', desc: '思路可借鉴但难直接复用' },
        { level: '不合格', range: '0-7', desc: '一次性产出' }] },
      { id: 'D4', name: '呈现完整度', weight: 15, max_score: 15, standard: '材料是否齐全、表述是否清晰、是否可独立理解', sort: 4, levels: [
        { level: '优秀', range: '13-15', desc: '四件套齐全，无需追问即可理解' },
        { level: '良好', range: '9-12', desc: '基本齐全，细节有缺' },
        { level: '合格', range: '5-8', desc: '可理解但材料不全' },
        { level: '不合格', range: '0-4', desc: '材料缺失严重' }] },
    ],
  },
  {
    id: 'SC1', name: '大赛四维评分卡', version: 'v1', total_rule: '加权求和', pass_line: 60,
    ai_weight: 80, judge_weight: 20, status: '停用', bind_target: '历史提报（9-26 前提交）',
    updated_at: '2026-09-21 09:40',
    dimensions: [
      { id: 'D1', name: '真实性', weight: 30, max_score: 30, standard: '是否基于真实业务数据与真实场景', sort: 1, levels: [] },
      { id: 'D2', name: '业务价值', weight: 30, max_score: 30, standard: '是否解决真实痛点', sort: 2, levels: [] },
      { id: 'D3', name: '可复用性', weight: 25, max_score: 25, standard: '产出是否可沉淀复用', sort: 3, levels: [] },
      { id: 'D4', name: '呈现完整度', weight: 15, max_score: 15, standard: '材料是否齐全清晰', sort: 4, levels: [] },
    ],
  },
  {
    id: 'SC2', name: '终端评分卡', version: 'v0', total_rule: '加权求和', pass_line: 60,
    ai_weight: 80, judge_weight: 20, status: '草稿', bind_target: '未绑定（Q11 口径待补充）',
    updated_at: '2026-09-18 18:00',
    dimensions: [
      { id: 'D1', name: '待补充维度一', weight: 40, max_score: 40, standard: '待平台方提供口径后配置（Q11）', sort: 1, levels: [] },
      { id: 'D2', name: '待补充维度二', weight: 60, max_score: 60, standard: '待平台方提供口径后配置（Q11）', sort: 2, levels: [] },
    ],
  },
];

/* ============ M3 作业类型 / 期次 / 提报 ============ */
export const ASSIGNMENT_TYPES: AssignmentType[] = [
  {
    id: 'AT1', code: 'WB-A1', name: '2026 Q4 AI 应用实践作业', campaign_id: 'C2026Q4',
    target_scope: '标签：干部（39 人）', form_template: '双通道大赛模板',
    custom_fields: [{ name: '所用 Skill 名称', type: '文本', required: true }],
    allow_multi: true, max_times: 1, allow_override: false, late_rule: '允许迟交，每晚 1 天扣 5 分',
    score_card_id: 'SC1', score_card_version: 'v2', points_rule: '达标即得 50 分，≥85 分额外 +30',
    need_review: true, visible_scope: '本部门', version: 2, status: 'PUBLISHED', track: '客户赋能',
  },
  {
    id: 'AT2', code: 'WB-A2', name: '11 月主题作业 · 客户续约攻坚', campaign_id: 'C2026Q4',
    target_scope: '全员', form_template: '通用作业模板',
    custom_fields: [], allow_multi: false, max_times: 2, allow_override: true,
    late_rule: '不允许迟交', score_card_id: 'SC1', score_card_version: 'v2',
    points_rule: '完成即得 30 分', need_review: false, visible_scope: '全员', version: 1, status: 'DRAFT',
  },
  {
    id: 'AT3', code: 'WB-A3', name: '每周场景卡心得', campaign_id: 'C2026Q4',
    target_scope: '标签：骨干（12 人）', form_template: '通用作业模板',
    custom_fields: [], allow_multi: true, max_times: 99, allow_override: false,
    late_rule: '不允许迟交', score_card_id: 'SC1', score_card_version: 'v2',
    points_rule: '每篇 +5 分', need_review: false, visible_scope: '全员', version: 1, status: 'PUBLISHED',
  },
];

export const PERIODS: AssignmentPeriod[] = [
  { id: 'AT1-P1', type_id: 'AT1', seq: 1, start_at: '2026-09-21', end_at: '2026-10-13', status: 'OPEN' },
  { id: 'AT1-P2', type_id: 'AT1', seq: 2, start_at: '2026-11-01', end_at: '2026-11-30', status: 'UPCOMING' },
  { id: 'AT3-P1', type_id: 'AT3', seq: 1, start_at: '2026-09-21', end_at: '2026-10-13', status: 'OPEN' },
];

const SUBMIT_STATUSES: AssignmentSubmit['status'][] = [
  'SUBMITTED', 'AI_SCORED', 'REVIEWING', 'REVIEWED', 'PASSED', 'PUBLISHED',
  'ASSET_APPLYING', 'ASSET_ONLINE', 'DRAFT', 'SCORE_FAILED', 'REJECTED',
];
const SCENE_TITLES = [
  '为 TOP10 客户做月度经营体检', '新政客户化改写 · 三版触达文案', '客户拜访前准备卡（5 户）',
  '客户沟通复盘与风险识别', '流失风险分层与挽回动作包', '年度服务总结与续约弹药包',
  '会议纪要 → 行动项清单', '周报汇总一页经营简报', '服务质量抽检与错题本',
  '面试题库与统一评估表', '客户画像与 3 个切入点', '向上汇报一页纸提纲',
  'Excel 开票数据清洗与异常识别', '对外通知公文起草润色',
];

export const SUBMITS: AssignmentSubmit[] = Array.from({ length: 28 }).map((_, i) => {
  const author = USERS[i % 26];
  const status = SUBMIT_STATUSES[i % SUBMIT_STATUSES.length];
  const scored = ['AI_SCORED', 'REVIEWING', 'REVIEWED', 'PASSED', 'PUBLISHED', 'ASSET_APPLYING', 'ASSET_ONLINE'].includes(status);
  const reviewed = ['REVIEWED', 'PASSED', 'PUBLISHED', 'ASSET_APPLYING', 'ASSET_ONLINE'].includes(status);
  const ai = scored ? Math.round((18 + rnd() * 12) * 10) / 10 : undefined;
  const jg = reviewed ? Math.round((18 + rnd() * 12) * 10) / 10 : undefined;
  const final = scored ? Math.round(((ai ?? 0) * 0.8 + (jg ?? ai ?? 0) * 0.2) * 10) / 10 : undefined;
  return {
    id: `S${String(i + 1).padStart(3, '0')}`,
    code: `WB-A1-P1-${String(i + 1).padStart(4, '0')}`,
    type_id: 'AT1',
    period_id: 'AT1-P1',
    union_id: author.union_id,
    name: author.name,
    dept_name: deptName(author.dept_id_list[0]),
    seq_no: 1,
    track: pick(['客户赋能', '团队提效', '销售提效'] as const),
    channel: i % 3 === 0 ? '通道二·自建 Skill' : '通道一·用现成 Skill',
    title: SCENE_TITLES[i % SCENE_TITLES.length],
    scene_desc: '本月该场景在本部门重复出现 5 次以上，人工处理平均耗时 2 小时，且质量不稳定。已用企业知识库中的服务标准做约束。',
    before_after: i % 3 === 0 ? '使用前：人工 2 小时/次，漏检率约 15%；使用后：25 分钟/次，漏检率降至 3%。' : undefined,
    output_sample: '输出样例见附件（已脱敏，客户名已替换为 C001 等编号）。',
    skill_used: i % 3 === 0 ? '自建 Skill：客户体检报告生成器 v1.2' : '内置 Skill：文档理解 + 企业知识库',
    attachments: i % 3 === 0
      ? [{ name: 'customer-checkup-skill.zip', size: '1.8MB' }, { name: '产出样例.pdf', size: '640KB' }]
      : [{ name: '产出样例.pdf', size: '520KB' }],
    desensitized: true,
    visible_scope: '本部门',
    status,
    ai_score: ai,
    judge_score: jg,
    final_score: final,
    score_card_version: 'v2',
    submitted_at: `2026-09-${String(21 + (i % 5)).padStart(2, '0')} ${String(9 + (i % 9)).padStart(2, '0')}:${String(i * 7 % 60).padStart(2, '0')}`,
    late: i % 9 === 0,
    spot_check: ['PASSED', 'PUBLISHED', 'ASSET_APPLYING', 'ASSET_ONLINE'].includes(status)
      ? { q1: '真实输入为本部门 9 月客户开票数据与上月对比表', q2: '中途把「按金额排序」改为「按变化率排序」', q3: '同事反馈：一页读完能判断好坏，已开始复用', result: '通过', by: '王建国' }
      : undefined,
  };
});

export const SCORE_RESULTS: ScoreResult[] = SUBMITS.filter((s) => s.ai_score).slice(0, 12).flatMap((s) => [
  {
    id: `SR-${s.id}-AI`, target_type: 'submit' as const, target_id: s.id, card_id: 'SC1', card_version: 'v2',
    source: 'AI' as const,
    dim_scores: { 真实性: Math.round(s.ai_score! * 0.3), 业务价值: Math.round(s.ai_score! * 0.3), 可复用性: Math.round(s.ai_score! * 0.25), 呈现完整度: Math.round(s.ai_score! * 0.15) },
    total: s.ai_score!, reason: '真实业务数据完整，输入与过程可复现；产出可直接复用，建议补充复用门槛说明。',
    scorer_union_id: 'system', scorer_name: 'AI 评分（批量导入）', created_at: '2026-09-24 16:20',
  },
  ...(s.judge_score ? [{
    id: `SR-${s.id}-JD`, target_type: 'submit' as const, target_id: s.id, card_id: 'SC1', card_version: 'v2',
    source: 'JUDGE' as const,
    dim_scores: { 真实性: Math.round(s.judge_score! * 0.3), 业务价值: Math.round(s.judge_score! * 0.3), 可复用性: Math.round(s.judge_score! * 0.25), 呈现完整度: Math.round(s.judge_score! * 0.15) },
    total: s.judge_score!, reason: '场景真实，数据链条完整；建议把提示词沉淀为可复用模板。',
    scorer_union_id: u('王建国').union_id, scorer_name: '王建国', created_at: '2026-09-24 18:40',
  }] : []),
]);

/* ============ M4 专家门诊 ============ */
export const EXPERTS: Expert[] = [
  { id: 'E1', union_id: u('刘晓东').union_id, name: '刘晓东', dept_name: '中台支持中心/赋能中台', title: 'AI 应用专家', cert: ['官方认证', '上届获奖'], expertise_tags: ['提示词调优', 'Skill 打包', '智能体搭建'], intro: '上届大赛一等奖，主导 3 个企业级 Skill 入库，擅长把业务动作拆成可复用提示词。', rating_avg: 4.8, serve_count: 36, status: '接诊中', points: 720 },
  { id: 'E2', union_id: u('李慧敏').union_id, name: '李慧敏', dept_name: '中台支持中心/运营中台', title: '高级财税顾问', cert: ['官方认证'], expertise_tags: ['客户经营分析', '政策解读', '财税专业'], intro: '12 年财税服务经验，擅长把专业口径翻译成客户听得懂的话。', rating_avg: 4.9, serve_count: 41, status: '接诊中', points: 820 },
  { id: 'E3', union_id: u('周文静').union_id, name: '周文静', dept_name: '中台支持中心/运营中台', title: '数据分析师', cert: ['上届获奖'], expertise_tags: ['Excel 数据处理', '数据分析', '异常识别'], intro: '擅长 Excel 与数据清洗自动化，做过 20+ 个数据处理流程沉淀。', rating_avg: 4.6, serve_count: 28, status: '接诊中', points: 560 },
  { id: 'E4', union_id: u('杨丽华').union_id, name: '杨丽华', dept_name: '华东大区/上海分公司', title: '客户成功经理', cert: ['上届获奖'], expertise_tags: ['客户赋能', '续约谈判', '异议应对'], intro: '一线客户成功出身，连续 3 个季度续约率大区第一。', rating_avg: 4.7, serve_count: 22, status: '接诊中', points: 440 },
  { id: 'E5', union_id: u('吴海涛').union_id, name: '吴海涛', dept_name: '华南大区/深圳分公司', title: '销售主管', cert: [], expertise_tags: ['销售提效', '客户画像', '私域运营'], intro: '擅长一线销售场景的 AI 提效，做过私域内容批量生成流程。', rating_avg: 4.4, serve_count: 15, status: '接诊中', points: 300 },
  { id: 'E6', union_id: u('徐明霞').union_id, name: '徐明霞', dept_name: '西部大区/成都分公司', title: '财税顾问', cert: ['外部顾问'], expertise_tags: ['财税专业', '公文写作', '培训带教'], intro: '外部顾问，擅长公文与培训课件结构化生成。', rating_avg: 4.5, serve_count: 9, status: '停诊', points: 180 },
];

const SLOTS = ['09:00-09:30', '09:30-10:00', '10:00-10:30', '14:00-14:30', '14:30-15:00', '15:00-15:30', '16:00-16:30'];
export const SCHEDULES: ExpertSchedule[] = EXPERTS.flatMap((e, ei) =>
  Array.from({ length: 14 }).map((_, d) => {
    const date = `2026-09-${String(26 + d).padStart(2, '0')}`;
    const slot = SLOTS[(d + ei) % SLOTS.length];
    const capacity = (d + ei) % 5 === 0 ? 8 : 1;
    const booked = e.status === '停诊' ? 0 : int(0, capacity);
    return {
      id: `ES-${e.id}-${d}`, expert_id: e.id, date, slot, capacity, booked,
      type: capacity > 1 ? '直播' : '1v1',
      place_or_link: capacity > 1 ? '钉钉直播（会议号 872 334 991）' : '钉钉视频 / 线下 3 号会议室',
      status: e.status === '停诊' ? 'HOLIDAY' : booked >= capacity ? 'FULL' : (d % 7 === 6 ? 'CLOSED' : 'OPEN'),
    } as ExpertSchedule;
  })
);

export const BOOKINGS: Booking[] = [
  { id: 'BK1', schedule_id: 'ES-E1-2', expert_id: 'E1', expert_name: '刘晓东', union_id: u('郭美玲').union_id, name: '郭美玲', question: '自建的 Skill 包上传后提示结构校验失败，manifest.yaml 不知道哪里写错了。', date: '2026-09-28', slot: '10:00-10:30', type: '1v1', status: '待就诊', reviewed: false },
  { id: 'BK2', schedule_id: 'ES-E1-3', expert_id: 'E1', expert_name: '刘晓东', union_id: u('郑雅琳').union_id, name: '郑雅琳', question: '提示词跑出来的体检报告太像财报，怎么让输出更白话？', date: '2026-09-29', slot: '14:00-14:30', type: '1v1', status: '已完成', reviewed: true },
  { id: 'BK3', schedule_id: 'ES-E2-1', expert_id: 'E2', expert_name: '李慧敏', union_id: u('韩小雨').union_id, name: '韩小雨', question: '新政原文改写成客户文案，适用范围总是拿不准，怕写错。', date: '2026-09-27', slot: '09:30-10:00', type: '1v1', status: '已完成', reviewed: false },
  { id: 'BK4', schedule_id: 'ES-E3-4', expert_id: 'E3', expert_name: '周文静', union_id: u('傅明杰').union_id, name: '傅明杰', question: '500 行开票数据怎么快速找出异常？Excel 公式还是让 AI 处理？', date: '2026-09-30', slot: '15:00-15:30', type: '1v1', status: '待就诊', reviewed: false },
  { id: 'BK5', schedule_id: 'ES-E4-0', expert_id: 'E4', expert_name: '杨丽华', union_id: u('卢伟民').union_id, name: '卢伟民', question: '续约谈判客户说「再考虑一下」，怎么判断是真犹豫还是已流失？', date: '2026-09-26', slot: '09:00-09:30', type: '1v1', status: '已完成', reviewed: true },
  { id: 'BK6', schedule_id: 'ES-E1-8', expert_id: 'E1', expert_name: '刘晓东', union_id: u('孙立新').union_id, name: '孙立新', question: '大区想做一次 AI 培训，内容怎么分层？', date: '2026-10-04', slot: '10:00-10:30', type: '1v1', status: '待就诊', reviewed: false },
  { id: 'BK7', schedule_id: 'ES-E2-6', expert_id: 'E2', expert_name: '李慧敏', union_id: u('叶春燕').union_id, name: '叶春燕', question: '客户问的税务问题我拿不准，能不能让 AI 直接用知识库回答？', date: '2026-10-02', slot: '14:30-15:00', type: '1v1', status: '已取消', reviewed: false },
  { id: 'BK8', schedule_id: 'ES-E5-5', expert_id: 'E5', expert_name: '吴海涛', union_id: u('蔡国庆').union_id, name: '蔡国庆', question: '私域朋友圈内容一周要发 20 条，怎么批量生成又不重样？', date: '2026-10-01', slot: '16:00-16:30', type: '1v1', status: '爽约', reviewed: false },
  { id: 'BK9', schedule_id: 'ES-E1-12', expert_id: 'E1', expert_name: '刘晓东', union_id: u('梁伟强').union_id, name: '梁伟强', question: 'Skill 包要不要做成通用版？还是只解决我自己的场景？', date: '2026-10-08', slot: '09:00-09:30', type: '1v1', status: '待就诊', reviewed: false },
  { id: 'BK10', schedule_id: 'ES-E3-1', expert_id: 'E3', expert_name: '周文静', union_id: u('潘晓婷').union_id, name: '潘晓婷', question: '抽检样本怎么抽才科学？现在靠人挑。', date: '2026-09-27', slot: '14:00-14:30', type: '1v1', status: '已完成', reviewed: true },
];

export const EXPERT_REVIEWS: ExpertReview[] = [
  { id: 'R1', booking_id: 'BK2', expert_id: 'E1', rater_union_id: u('郑雅琳').union_id, dim_scores: { 专业度: 5, 响应速度: 5, 解决问题程度: 5 }, rating: 5, comment: '一个问题就点破了「让 AI 扮演非财务角色」这个关键，改完输出完全不一样。', anonymous: false, created_at: '2026-09-29 15:20' },
  { id: 'R2', booking_id: 'BK5', expert_id: 'E4', rater_union_id: u('卢伟民').union_id, dim_scores: { 专业度: 5, 响应速度: 4, 解决问题程度: 5 }, rating: 4.7, comment: '给了三个判断信号，第二天就用在真实客户上了，很实用。', anonymous: false, created_at: '2026-09-26 10:40' },
  { id: 'R3', booking_id: 'BK10', expert_id: 'E3', rater_union_id: u('潘晓婷').union_id, dim_scores: { 专业度: 4, 响应速度: 5, 解决问题程度: 4 }, rating: 4.3, comment: '抽样方法讲得很清楚，还帮我算了样本量。', anonymous: false, created_at: '2026-09-27 15:10' },
  { id: 'R4', booking_id: 'BK2', expert_id: 'E1', rater_union_id: u('唐志明').union_id, dim_scores: { 专业度: 5, 响应速度: 5, 解决问题程度: 4 }, rating: 4.7, comment: '排班很好约，问题解决得快。', anonymous: true, created_at: '2026-09-30 09:15' },
  { id: 'R5', booking_id: 'BK3', expert_id: 'E2', rater_union_id: u('韩小雨').union_id, dim_scores: { 专业度: 5, 响应速度: 5, 解决问题程度: 5 }, rating: 5, comment: '政策口径把关很严，明确告诉我哪些不能推测，安全感很强。', anonymous: false, created_at: '2026-09-27 11:05' },
  { id: 'R6', booking_id: 'BK5', expert_id: 'E4', rater_union_id: u('曹国庆').union_id, dim_scores: { 专业度: 4, 响应速度: 3, 解决问题程度: 4 }, rating: 3.7, comment: '内容有用，但迟到 8 分钟。', anonymous: true, created_at: '2026-09-26 18:30' },
  { id: 'R7', booking_id: 'BK10', expert_id: 'E3', rater_union_id: u('杜鹏飞').union_id, dim_scores: { 专业度: 5, 响应速度: 5, 解决问题程度: 5 }, rating: 5, comment: '把 Excel 步骤写成了可复现清单，换人也能跑。', anonymous: false, created_at: '2026-09-28 16:00' },
  { id: 'R8', booking_id: 'BK3', expert_id: 'E2', rater_union_id: u('谢婉如').union_id, dim_scores: { 专业度: 5, 响应速度: 4, 解决问题程度: 5 }, rating: 4.7, comment: '三版文案的差别讲透了，直接能用。', anonymous: false, created_at: '2026-09-28 09:40' },
];

/* ============ M7 资产 ============ */
export const ASSET_APPLIES: AssetApply[] = [
  { id: 'AA1', submit_id: 'S001', submit_title: '为 TOP10 客户做月度经营体检', applicant_union_id: u('郑雅琳').union_id, applicant_name: '郑雅琳', status: '已入库', reviewer_union_id: u('曾庆丰').union_id, visible_scope: '全员', apply_reason: '已在苏南分公司 3 个小组复用，月均节省 6 小时/人。', created_at: '2026-09-23 09:00' },
  { id: 'AA2', submit_id: 'S004', submit_title: '客户沟通复盘与风险识别', applicant_union_id: u('梁伟强').union_id, applicant_name: '梁伟强', status: '待上架', reviewer_union_id: u('曾庆丰').union_id, visible_scope: '全员', apply_reason: '风险词典可复用，已在部门周会使用。', created_at: '2026-09-24 14:30' },
  { id: 'AA3', submit_id: 'S007', submit_title: '会议纪要 → 行动项清单', applicant_union_id: u('潘晓婷').union_id, applicant_name: '潘晓婷', status: '待初审', visible_scope: '全员', apply_reason: '提示词已稳定跑通 20+ 份纪要，待确认是否可公开。', created_at: '2026-09-25 10:20' },
  { id: 'AA4', submit_id: 'S010', submit_title: '面试题库与统一评估表', applicant_union_id: u('林素芬').union_id, applicant_name: '林素芬', status: '已驳回', reviewer_union_id: u('赵冰艳').union_id, visible_scope: '本部门', apply_reason: '含内部薪酬带宽，不适合全员可见。', created_at: '2026-09-23 16:10' },
  { id: 'AA5', submit_id: 'S013', submit_title: 'Excel 开票数据清洗与异常识别', applicant_union_id: u('周文静').union_id, applicant_name: '周文静', status: '待上架', visible_scope: '全员', apply_reason: '清洗步骤可复现，已在中台使用。', created_at: '2026-09-25 11:40' },
];

export const ASSETS: Asset[] = [
  // V4.0 CR-10：reuse_count 保留为 fallback（展示为「估算」）；reuse_source 决定展示策略，无 synced_at = 「待测」
  { id: 'AS1', apply_id: 'AA1', name: '客户月度体检报告生成器', type: 'Skill 包', version: 'v1.2', author_name: '郑雅琳', author_dept: '华东大区/苏南分公司', track: '客户赋能', visible_scope: '全员', reuse_count: 186, reuse_user_count: 34, reuse_source: 'WB_BACKEND', reuse_synced_at: '2026-09-25 08:00', online_at: '2026-09-23', status: '已上架', restricted: false },
  { id: 'AS2', apply_id: 'AA2', name: '客户风险信号词典与提取流程', type: '提示词模板', version: 'v1.0', author_name: '梁伟强', author_dept: '华东大区/苏南分公司', track: '客户赋能', visible_scope: '全员', reuse_count: 92, reuse_user_count: 21, reuse_source: 'WB_BACKEND', reuse_synced_at: '2026-09-25 08:00', online_at: '2026-09-24', status: '已上架', restricted: false },
  { id: 'AS3', apply_id: 'AA3', name: '政策解读三版文案生成器', type: 'Skill 包', version: 'v1.1', author_name: '李慧敏', author_dept: '中台支持中心/运营中台', track: '客户赋能', visible_scope: '全员', reuse_count: 143, reuse_user_count: 28, reuse_source: 'MANUAL', reuse_synced_at: '2026-09-24 17:30', online_at: '2026-09-22', status: '已上架', restricted: false },
  { id: 'AS4', apply_id: 'AA5', name: 'Excel 清洗与异常识别流程', type: '提示词模板', version: 'v1.0', author_name: '周文静', author_dept: '中台支持中心/运营中台', track: '销售提效', visible_scope: '全员', reuse_count: 77, reuse_user_count: 19, reuse_source: 'LEGACY', online_at: '2026-09-25', status: '已上架', restricted: false },
  { id: 'AS5', apply_id: 'AA4', name: '面试题库与评估表（含薪酬带宽）', type: '提示词模板', version: 'v0.9', author_name: '林素芬', author_dept: '华北大区/天津分公司', track: '团队提效', visible_scope: '本部门', reuse_count: 12, reuse_user_count: 4, reuse_source: 'LEGACY', online_at: '2026-09-23', status: '已上架', restricted: true },
  { id: 'AS6', apply_id: 'AA2', name: '客户续约年度价值报告模板', type: '智能体', version: 'v1.0', author_name: '杨丽华', author_dept: '华东大区/上海分公司', track: '客户赋能', visible_scope: '全员', reuse_count: 58, reuse_user_count: 13, reuse_source: 'LEGACY', online_at: '2026-09-26', status: '已上架', restricted: false },
];

/** V4.0 CR-06：看板默认配置 = V3.0 §11.1 分区（改坏了可一键还原） */
export const BOARD_CONFIGS: BoardConfig[] = [
  {
    campaign_id: 'C2026Q4', version: '1.0', updated_by: '系统默认', updated_at: '2026-09-21 00:00',
    cards: [
      { id: 'c1', title: '应参与人数', metric: 'scopeCount', scope: 'TAG:CADRE', chart: 'number', unit: '人', order: 1, enabled: true },
      { id: 'c2', title: '已激活人数', metric: 'activated', scope: 'TAG:CADRE', chart: 'progress', unit: '人', order: 2, enabled: true },
      { id: 'c3', title: '已提交人数', metric: 'submitted', scope: 'TAG:CADRE', chart: 'progress', unit: '人', order: 3, enabled: true },
      { id: 'c4', title: '有效作业', metric: 'validWorks', scope: 'TAG:CADRE', chart: 'number', unit: '份', order: 4, enabled: true },
      { id: 'c5', title: '入库资产', metric: 'assets', scope: 'ALL', chart: 'number', unit: '个', order: 5, enabled: true },
      { id: 'c6', title: '坐诊场次', metric: 'schedules', scope: 'ALL', chart: 'number', unit: '场', order: 6, enabled: true },
      { id: 'c7', title: '部门提交率排行', metric: 'deptRank', scope: 'TAG:CADRE', chart: 'bar', order: 7, enabled: true },
      { id: 'c8', title: '赛道分布', metric: 'trackDist', scope: 'ALL', chart: 'bar', order: 8, enabled: true },
      { id: 'c9', title: '评分进度', metric: 'scoreProgress', scope: 'ALL', chart: 'line', order: 9, enabled: true },
      { id: 'c10', title: '优秀作业 TOP10', metric: 'top10', scope: 'ALL', chart: 'rank', order: 10, enabled: true },
    ],
  },
];

/* ============ M8 积分与商城 ============ */
export const POINT_RECORDS: PointRecord[] = [
  { id: 'P1', union_id: u('郑雅琳').union_id, name: '郑雅琳', source: '作业达标', points: 50, campaign_id: 'C2026Q4', remark: 'WB-A1-P1-0001 得分 82.4', created_at: '2026-09-24 16:20' },
  { id: 'P2', union_id: u('郑雅琳').union_id, name: '郑雅琳', source: '作品入库', points: 100, campaign_id: 'C2026Q4', remark: '客户月度体检报告生成器 入库', created_at: '2026-09-23 10:35' },
  { id: 'P3', union_id: u('曹国庆').union_id, name: '曹国庆', source: '悬赏通过', points: 280, campaign_id: 'C2026Q4', remark: 'B-006 客户风险信号自动提取', created_at: '2026-09-24 09:12' },
  { id: 'P4', union_id: u('刘晓东').union_id, name: '刘晓东', source: '专家接诊', points: 20, campaign_id: 'C2026Q4', remark: '接诊 1 次', created_at: '2026-09-29 15:30' },
  { id: 'P5', union_id: u('梁伟强').union_id, name: '梁伟强', source: '社区精华帖', points: 10, campaign_id: 'C2026Q4', remark: '帖子被加精', created_at: '2026-09-24 17:00' },
  { id: 'P6', union_id: u('杜鹏飞').union_id, name: '杜鹏飞', source: '悬赏通过', points: 220, campaign_id: 'C2026Q4', remark: 'B-007 月度经营简报一键汇总', created_at: '2026-09-22 11:20' },
  { id: 'P7', union_id: u('韩小雨').union_id, name: '韩小雨', source: '兑换扣减', points: -3200, campaign_id: 'C2026Q4', remark: '兑换 无线降噪耳机', created_at: '2026-09-23 14:05' },
  { id: 'P8', union_id: u('郭美玲').union_id, name: '郭美玲', source: '作业达标', points: 50, campaign_id: 'C2026Q4', remark: 'WB-A1-P1-0016 得分 76.8', created_at: '2026-09-25 10:00' },
  { id: 'P9', union_id: u('周文静').union_id, name: '周文静', source: '专家接诊', points: 20, campaign_id: 'C2026Q4', remark: '接诊 1 次', created_at: '2026-09-27 15:20' },
  { id: 'P10', union_id: u('潘晓婷').union_id, name: '潘晓婷', source: '社区发帖', points: 2, campaign_id: 'C2026Q4', remark: '发布经验分享帖', created_at: '2026-09-24 09:40' },
  { id: 'P11', union_id: u('谢婉如').union_id, name: '谢婉如', source: '作业达标', points: 50, campaign_id: 'C2026Q4', remark: 'WB-A1-P1-0023 得分 71.2', created_at: '2026-09-25 11:30' },
  { id: 'P12', union_id: u('唐志明').union_id, name: '唐志明', source: '兑换扣减', points: -800, campaign_id: 'C2026Q4', remark: '兑换 定制保温杯', created_at: '2026-09-24 13:15' },
];

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'I1', name: '无线降噪耳机', cover: '🎧', desc: '品牌无线降噪耳机，线下领取。有效期至 2026-12-31。', points: 3200, stock: 20, limit_per_user: 1, scope: '全员', on_sale_at: '2026-09-23', off_sale_at: '2026-12-31', status: '上架', verify_type: '线下领取', exchanged_count: 3 },
  { id: 'I2', name: '定制保温杯', cover: '☕', desc: '公司 LOGO 定制保温杯 500ml，线下领取。', points: 800, stock: 60, limit_per_user: 2, scope: '全员', on_sale_at: '2026-09-23', off_sale_at: '2026-12-31', status: '上架', verify_type: '线下领取', exchanged_count: 11 },
  { id: 'I3', name: 'AI 课程年卡', cover: '🎓', desc: '在线学习平台年卡，线上发放卡券码。', points: 2400, stock: 15, limit_per_user: 1, scope: '全员', on_sale_at: '2026-09-23', off_sale_at: '2026-11-30', status: '上架', verify_type: '线上发放', exchanged_count: 4 },
  { id: 'I4', name: '带薪学习假半天', cover: '🌴', desc: '可申请半天带薪学习假，需主管审批。', points: 1500, stock: 30, limit_per_user: 1, scope: '标签：干部', on_sale_at: '2026-09-23', off_sale_at: '2026-12-31', status: '上架', verify_type: '线下领取', exchanged_count: 6 },
  { id: 'I5', name: '机械键盘', cover: '⌨️', desc: '客制化机械键盘，邮寄到家。', points: 2800, stock: 8, limit_per_user: 1, scope: '全员', on_sale_at: '2026-09-23', off_sale_at: '2026-12-31', status: '上架', verify_type: '邮寄', exchanged_count: 2 },
  { id: 'I6', name: '星巴克礼品卡 200 元', cover: '🎁', desc: '电子礼品卡，线上发放卡券码。', points: 1200, stock: 0, limit_per_user: 2, scope: '全员', on_sale_at: '2026-09-23', off_sale_at: '2026-12-31', status: '售罄', verify_type: '线上发放', exchanged_count: 25 },
  { id: 'I7', name: '总裁午餐会名额', cover: '🍽️', desc: '与事业群总裁共进午餐，名额有限。', points: 5000, stock: 5, limit_per_user: 1, scope: '标签：核心39人', on_sale_at: '2026-10-01', off_sale_at: '2026-12-31', status: '下架', verify_type: '线下领取', exchanged_count: 0 },
  { id: 'I8', name: 'AI 工具周边礼包', cover: '🛍️', desc: '含帆布袋、贴纸、鼠标垫，线下领取。', points: 500, stock: 100, limit_per_user: 1, scope: '全员', on_sale_at: '2026-09-23', off_sale_at: '2026-12-31', status: '上架', verify_type: '线下领取', exchanged_count: 18 },
];

export const SHOP_ORDERS: ShopOrder[] = [
  { id: 'O1', item_id: 'I1', item_name: '无线降噪耳机', union_id: u('韩小雨').union_id, name: '韩小雨', points_cost: 3200, status: '待核销', code: 'VF-8K3M2P', created_at: '2026-09-23 14:05' },
  { id: 'O2', item_id: 'I2', item_name: '定制保温杯', union_id: u('唐志明').union_id, name: '唐志明', points_cost: 800, status: '已核销', code: 'VF-2Q9X4L', verify_by: '赵冰艳', verify_at: '2026-09-24 15:20', created_at: '2026-09-24 13:15' },
  { id: 'O3', item_id: 'I3', item_name: 'AI 课程年卡', union_id: u('郑雅琳').union_id, name: '郑雅琳', points_cost: 2400, status: '已核销', code: 'VF-7H1N6B', verify_by: '彭丽芳', verify_at: '2026-09-24 16:40', created_at: '2026-09-24 10:30' },
  { id: 'O4', item_id: 'I4', item_name: '带薪学习假半天', union_id: u('郭美玲').union_id, name: '郭美玲', points_cost: 1500, status: '待核销', code: 'VF-5R2T8C', created_at: '2026-09-25 09:10' },
  { id: 'O5', item_id: 'I8', item_name: 'AI 工具周边礼包', union_id: u('卢伟民').union_id, name: '卢伟民', points_cost: 500, status: '已取消', code: 'VF-3D7F1A', created_at: '2026-09-24 17:50' },
  { id: 'O6', item_id: 'I5', item_name: '机械键盘', union_id: u('周文静').union_id, name: '周文静', points_cost: 2800, status: '待核销', code: 'VF-9P4W5E', created_at: '2026-09-25 14:20' },
];

/* ============ M11 社区 ============ */
export const BOARDS: Board[] = [
  { id: 'BD1', name: '经验分享', intro: '把做成的东西、踩过的坑发出来，让同事少走弯路', icon: '💡', sort: 1, status: '启用', only_organizer_post: false },
  { id: 'BD2', name: '问题求助', intro: '卡住了就问，坐诊之外的一对多答疑', icon: '🙋', sort: 2, status: '启用', only_organizer_post: false },
  { id: 'BD3', name: '作品晒场', intro: '晒出你的产出，接受点赞与吐槽', icon: '🏆', sort: 3, status: '启用', only_organizer_post: false },
  { id: 'BD4', name: '公告区', intro: '组织者发布，仅组织者可发帖', icon: '📢', sort: 4, status: '启用', only_organizer_post: true },
];

const POST_SEED: [string, string, string, string[], boolean, string][] = [
  ['BD1', '让 AI 输出「人话」的关键：先给它一个角色，再给它一个读者', '试了十几版才明白：光说「用白话写」没用，AI 不知道白话是对谁白话。后来改成「你是资深顾问，读这份东西的是个开餐馆的老板，他只关心赚没赚钱」，输出质量直接上一个台阶。附带一个可直接抄的开头模板。', ['提示词', '客户赋能'], false, '梁伟强'],
  ['BD1', 'Skill 包结构校验总失败，90% 是 manifest.yaml 的缩进问题', '卡了两天，最后发现是 YAML 缩进用了 Tab。分享一个自查清单：① SKILL.md 必须在根目录；② manifest.yaml 用空格缩进；③ 字段名不要拼错。附空白模板下载。', ['Skill 打包', '踩坑'], false, '郑雅琳'],
  ['BD1', '把「验收标准」写进提示词，返工率直接降一半', '以前先让 AI 输出，再自己挑毛病改。现在把验收标准（3 条）直接写进提示词，一次成型率明显提升。举了个体检报告的例子。', ['提示词', '提效'], false, '李慧敏'],
  ['BD2', '客户数据能不能直接贴给 AI？脱敏到什么程度算安全？', '想做客户经营分析，但不确定能不能把客户名和金额贴进去。目前我的做法是全替换成编号，但想知道公司有没有明确口径。', ['合规', '数据安全'], false, '韩小雨'],
  ['BD2', '有没有人成功让 AI 处理 500 行以上的 Excel？', '我这边超过 300 行就开始丢数据，试过分段也不太行。求一个可靠做法。', ['Excel', '数据处理'], true, '傅明杰'],
  ['BD2', '匿名问一下：基层同事普遍不用，是嫌麻烦还是真用不上？', '我们团队 8 个人只有 2 个在用，想知道是我推动方式的问题，还是场景没选对。不好实名问，匿了。', ['推广', '团队管理'], true, '谢婉如'],
  ['BD3', '晒一个：客户拜访前准备卡，5 分钟生成 5 户', '用企业知识库里的服务标准做约束，输出一页纸。这周拜访命中率明显提高，附上提示词和一张样例（已脱敏）。', ['客户赋能', '作品'], false, '杨丽华'],
  ['BD3', '晒一个：把周报汇总从 2 小时压到 25 分钟', '做了个汇总模板，直接吃十几份周报出一页简报。已在华东大区周会试用两周。', ['团队提效', '作品'], false, '杜鹏飞'],
  ['BD3', '晒一个：政策解读三版文案生成器（已入库）', '微信/短信/正式函件三版一次生成，适用范围强制标注【待总部确认】。已在企业 Skill 库，欢迎复用。', ['客户赋能', '作品'], false, '李慧敏'],
  ['BD1', '别让 AI 替你做判断：把「原因」写成假设，不要写成结论', '踩过一个坑：AI 给的分析看起来很专业，但原因其实是猜的。现在我强制要求「每条原因标注需向客户确认」，输出靠谱多了。', ['踩坑', '提示词'], false, '曹国庆'],
  ['BD4', '【公告】W3 制作陪跑开始，本周坐诊排期已放出', '本周刘晓东、李慧敏、周文静三位专家坐诊，号源已放出，可在专家门诊预约。第 1 期作业 10-13 18:00 截止。', ['公告'], false, '赵冰艳'],
  ['BD4', '【公告】积分商城上新：无线降噪耳机 / 机械键盘', '3,200 积分起兑，库存有限，先到先得。核销请联系组织者。', ['公告'], false, '赵冰艳'],
  ['BD1', '一个笨办法：把常用提示词存成手机快捷指令', '我建了 6 个常用场景的快捷指令，打开就能粘贴。适合不常在电脑前的同事。', ['提效', '技巧'], false, '吴海涛'],
  ['BD2', 'AI 生成的对客文案，合规上有哪些红线必须自己把关？', '政策适用范围、生效时间我知道要核，还有别的吗？希望组织者能出一个清单。', ['合规', '文案'], false, '林素芬'],
];

export const POSTS: Post[] = POST_SEED.map((s, i) => {
  const author = u(s[5]);
  return {
    id: `PT${String(i + 1).padStart(2, '0')}`,
    board_id: s[0],
    board_name: BOARDS.find((b) => b.id === s[0])!.name,
    union_id: author.union_id,
    author_name: author.name,
    anon_no: s[4] ? `匿名用户#${String.fromCharCode(65 + (i % 26))}${(i * 37 % 9000 + 1000).toString(16).toUpperCase().slice(0, 3)}` : undefined,
    title: s[1],
    content: s[2],
    tags: s[3],
    anonymous: s[4],
    status: i === 13 ? '审核中' : '正常',
    like_count: int(2, 68),
    comment_count: int(0, 14),
    view_count: int(60, 1200),
    pinned: i === 10,
    featured: [0, 2, 6].includes(i),
    created_at: `2026-09-${String(21 + (i % 5)).padStart(2, '0')} ${String(9 + (i % 10)).padStart(2, '0')}:${String(i * 11 % 60).padStart(2, '0')}`,
    report_count: i === 4 ? 3 : 0,
  };
});

export const COMMENTS: PostComment[] = [
  { id: 'C1', post_id: 'PT01', union_id: u('郭美玲').union_id, author_name: '郭美玲', content: '这个「给读者」的思路太关键了，我今天就用上了。', anonymous: false, created_at: '2026-09-21 11:20' },
  { id: 'C2', post_id: 'PT01', union_id: u('唐志明').union_id, author_name: '唐志明', content: '补充一个：再加一句「不要出现 XX 类专业术语」，效果更好。', anonymous: false, created_at: '2026-09-21 14:05' },
  { id: 'C3', post_id: 'PT02', union_id: u('刘晓东').union_id, author_name: '刘晓东', content: '补充第 4 条：yaml 里冒号后面必须有空格，这个也经常踩。', anonymous: false, created_at: '2026-09-22 09:30' },
  { id: 'C4', post_id: 'PT02', parent_id: 'C3', union_id: u('郑雅琳').union_id, author_name: '郑雅琳', content: '对，我就是这个也错了，一起加上。', anonymous: false, created_at: '2026-09-22 09:45' },
  { id: 'C5', post_id: 'PT04', union_id: u('董春生').union_id, author_name: '董春生', content: '口径：客户名、金额、联系方式一律替换成编号再输入，这是硬性要求。', anonymous: false, created_at: '2026-09-23 10:15' },
  { id: 'C6', post_id: 'PT05', union_id: u('周文静').union_id, author_name: '周文静', content: '分批处理 + 明确字段名，我这边 800 行跑通过。晚点发个贴细说。', anonymous: false, created_at: '2026-09-23 15:40' },
  { id: 'C7', post_id: 'PT06', union_id: u('潘晓婷').union_id, author_name: '潘晓婷', content: '我们团队也是，后来发现是场景选太大了，换成小场景后开始有人用。', anonymous: true, created_at: '2026-09-24 08:50' },
  { id: 'C8', post_id: 'PT07', union_id: u('卢伟民').union_id, author_name: '卢伟民', content: '样例脱敏做得挺干净，直接抄了。', anonymous: false, created_at: '2026-09-24 10:20' },
  { id: 'C9', post_id: 'PT08', union_id: u('孙立新').union_id, author_name: '孙立新', content: '这个模板华东全员推一下，@赵冰艳 看能不能进资产库。', anonymous: false, created_at: '2026-09-24 11:05' },
  { id: 'C10', post_id: 'PT09', union_id: u('韩小雨').union_id, author_name: '韩小雨', content: '已复用，输出很稳，感谢！', anonymous: false, created_at: '2026-09-25 09:15' },
  { id: 'C11', post_id: 'PT10', union_id: u('李慧敏').union_id, author_name: '李慧敏', content: '这条应该写进提示词规范，强烈认同。', anonymous: false, created_at: '2026-09-25 09:50' },
  { id: 'C12', post_id: 'PT13', union_id: u('蔡国庆').union_id, author_name: '蔡国庆', content: '求一个安卓的快捷指令配置方法。', anonymous: false, created_at: '2026-09-25 13:30' },
  { id: 'C13', post_id: 'PT03', union_id: u('叶春燕').union_id, author_name: '叶春燕', content: '把验收标准写进提示词这招真的有效，一次成型。', anonymous: false, created_at: '2026-09-25 14:10' },
  { id: 'C14', post_id: 'PT05', union_id: u('傅明杰').union_id, author_name: '傅明杰', content: '等周老师的帖子，蹲一个。', anonymous: false, created_at: '2026-09-25 15:00' },
  { id: 'C15', post_id: 'PT06', union_id: u('于海燕').union_id, author_name: '于海燕', content: '同感，我们也是从小场景切入才起来的。', anonymous: true, created_at: '2026-09-25 16:20' },
  { id: 'C16', post_id: 'PT11', union_id: u('马晓峰').union_id, author_name: '马晓峰', content: '华南这边也同步传达了，本周开始推。', anonymous: false, created_at: '2026-09-25 17:05' },
];

/* ============ V6.0 CR-13 公告（独立实体，与社区帖子解耦） ============ */
/**
 * 迁移映射：社区 BD4「公告区」帖子 → announcement（按帖子 id 去重，帖子本身不删）。
 * CR-28 落地后由内容管理直接新建的公告无 source_post_id，两类共存于同一实体。
 * 注：首页公告条以本实体为唯一数据源，不再直接读 posts。
 */
export const ANNOUNCEMENTS: Announcement[] = [
  ...POSTS.filter((p) => p.board_id === 'BD4').map<Announcement>((p) => ({
    id: `AN-${p.id}`,
    title: p.title.replace(/^【公告】/, ''),
    content: p.content,
    status: 'PUBLISHED',
    pinned: p.pinned,
    published_at: p.created_at,
    created_by: p.author_name,
    source_post_id: p.id,
    created_at: p.created_at,
  })),
  {
    id: 'AN-9001',
    title: '第 1 期作业提报截止前 48 小时提醒',
    content: '请在 10-13 18:00 前完成提报；逾期视为本期不参与，不影响下期参与资格。',
    status: 'PUBLISHED',
    pinned: true,
    published_at: '2026-09-24 09:00',
    created_by: '赵冰艳',
    created_at: '2026-09-24 09:00',
  },
];

/**
 * V6.0 CR-28：每周场景卡（此前由 `cases.slice(0,6)` 派生，无实体无法 CRUD）。
 * 种子数据由首页原本展示的前 6 条案例迁移而来并保留 `source_case_id`，
 * 保证改造前后首页场景卡区块的观感完全一致（只增不改）。
 */
export const SCENE_CARDS: SceneCard[] = CASES.slice(0, 6).map<SceneCard>((c, i) => ({
  id: `SC${i + 1}`,
  title: c.title,
  summary: c.summary || `${c.track}场景 · ${c.duration}上手`,
  content: c.prompt || `${c.pain_point}\n\n输入：${c.input}\n\n产出：${c.output}`,
  track: c.track,
  emoji: c.cover || '💡',
  status: 'PUBLISHED',
  tags: c.tags,
  week: '2026-W39',
  view_count: c.view_count,
  published_at: `${DEMO_TODAY} 09:00`,
  created_by: c.author_name,
  created_at: c.created_at,
  source_case_id: c.id,
}));

/* ============ M12 管理员数据 ============ */
export const WB_USAGE: WbUsage[] = USERS.map((usr, i) => {
  const active = i % 9 === 0 ? 0 : int(0, 26);
  return {
    id: `WU${i}`, union_id: usr.union_id, name: usr.name,
    dept_name: deptName(usr.dept_id_list[0]),
    stat_date: '2026-09-24',
    auth_status: i % 11 === 0 ? '未授权' : i % 7 === 0 ? '待确认' : '已授权',
    active_days: active,
    sessions: active === 0 ? 0 : int(1, 120),
    tokens: active === 0 ? 0 : int(2000, 480000),
    skill_calls: active === 0 ? 0 : int(0, 260),
    last_active: active === 0 ? '从未使用' : `2026-09-${String(24 - (i % 4)).padStart(2, '0')}`,
  };
});
