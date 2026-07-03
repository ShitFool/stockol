// FB股份 - 随机事件文案库
// 单独维护所有新闻消息和破产故事文案
//
// 字段说明：
//   msg:    新闻消息文本（展示给玩家）
//   normal: 正常结局描述
//   twist:  突发反转描述
//   type:   'public' = 公开消息(正常率80%) / 'rumor' = 小道消息(正常率60%)
//   s:      'bullish' = 利多 / 'bearish' = 利空 / 'neutral' = 中性

const NEWS_DB = [
  // ==================== 公开消息 · 利多 ====================
  { msg: '老师说这股票能涨。',                       normal: '老师确实有证书，但不是金融行业的。',   twist: '老师被约谈了，因为无照经营。',               type: 'public', s: 'bullish' },
  { msg: 'FB股份入选年度创新企业榜单。',             normal: '股价小幅上涨。',                   twist: '榜单是企业自己花钱办的。',               type: 'public', s: 'bullish' },
  { msg: '公司宣布大规模招聘。',                     normal: '业务扩张信号，股价上涨。',         twist: '招的是裁员谈判专员。',                     type: 'public', s: 'bullish' },
  { msg: 'FB股份获机构大额增持。',                   normal: '机构看好，股价大涨。',             twist: '机构是员工自己凑钱买的，为了护盘。',       type: 'public', s: 'bullish' },
  { msg: '火灾现场乐队新专辑预告发布。',             normal: '粉丝狂喜，股价上涨。',             twist: '预告片是个恶作剧视频，只有15秒猫叫。',         type: 'public', s: 'bullish' },
  { msg: 'FB股份获得行业大奖。',                     normal: '奖项含金量高，股价上涨。',         twist: '奖杯是3D打印的，底座还印着「淘宝同款」。', type: 'public', s: 'bullish' },
  { msg: '公司宣布员工持股计划。',                   normal: '员工信心十足，股价上涨。',         twist: '员工拿到股票当天就全卖了，套现去旅游。',   type: 'public', s: 'bullish' },
  { msg: 'FB股份新总部大楼落成。',                   normal: '实力展现，股价小涨。',             twist: '新楼是租的，租约只签了三个月。',           type: 'public', s: 'bullish' },
  { msg: '财报超预期，利润翻倍。',                   normal: '业绩亮眼，股价大涨。',             twist: '利润翻倍是因为去年亏太多，基数太小。',     type: 'public', s: 'bullish' },
  { msg: '公司品牌升级，发布全新logo。',             normal: '品牌焕新，市场看好。',             twist: '新logo和竞争对手撞了，正在被起诉。',       type: 'public', s: 'bullish' },
  { msg: 'FB股份拿下政府补贴。',                     normal: '政策利好，股价上涨。',             twist: '补贴是垃圾分类奖励，金额280元。',          type: 'public', s: 'bullish' },
  { msg: '火灾现场乐队巡回演唱会门票秒罄。',         normal: '票房火爆，股价大涨。',             twist: '秒罄是因为只放了50张票，剩下的全给黄牛了。', type: 'public', s: 'bullish' },
  { msg: 'FB股份旗下音乐培训学员暴增。',             normal: '培训业务增长，股价上涨。',         twist: '学员暴增是因为隔壁健身房倒闭了，会员全转过来了。', type: 'public', s: 'bullish' },
  { msg: '公司签下国际乐器品牌独家代理。',           normal: '乐器销售打开新局面，股价上涨。',   twist: '独家代理的乐器是口琴，利润还没运费高。',   type: 'public', s: 'bullish' },
  { msg: '火灾现场乐队获格莱美提名。',               normal: '国际认可，股价暴涨。',             twist: '提名的是「最佳专辑封面设计」，封面是主唱随手画的火柴人。', type: 'public', s: 'bullish' },
  { msg: 'FB股份艺人经纪板块签约新星。',             normal: '人才储备增强，股价上涨。',         twist: '新星是CEO的外甥，唱歌跑调但颜值在线。',   type: 'public', s: 'bullish' },
  { msg: '公司与知名音乐节达成战略合作。',           normal: '演出资源扩张，股价上涨。',         twist: '合作内容是FB负责音乐节的垃圾分类和厕所清洁。', type: 'public', s: 'bullish' },
  { msg: '火灾现场乐队周边产品全线售罄。',           normal: '粉丝经济爆发，股价大涨。',         twist: '售罄是因为工厂只生产了200件，补货要三个月。', type: 'public', s: 'bullish' },
  { msg: 'FB股份线上音乐课程登顶热门榜。',           normal: '知识付费风口，股价上涨。',         twist: '热门是因为课程标题叫「三天学会火灾现场乐队所有歌」，实际是教你打退堂鼓的。', type: 'public', s: 'bullish' },
  { msg: '公司获批新建录音棚。',                     normal: '制作能力提升，股价小涨。',         twist: '录音棚建在CEO家地下室，隔音靠棉被。',     type: 'public', s: 'bullish' },
  { msg: '火灾现场乐队受邀跨年晚会压轴。',           normal: '国民度飙升，股价大涨。',           twist: '压轴是因为前面节目全被毙了，只剩他们。',   type: 'public', s: 'bullish' },
  { msg: 'FB股份乐器销量季度环比翻倍。',             normal: '乐器业务起飞，股价上涨。',         twist: '翻倍是因为上季度只卖了一把尤克里里。',   type: 'public', s: 'bullish' },

  // ==================== 公开消息 · 利空 ====================
  { msg: '小道消息说要跌。',                         normal: '确实有内部人士抛售。',             twist: '抛售是因为要换车，不是不看好。',           type: 'public', s: 'bearish' },
  { msg: '公司官网被黑，股价大跌。',                 normal: '黑客要求支付赎金。',               twist: '黑客是实习生，误删了首页图片。',           type: 'public', s: 'bearish' },
  { msg: '原材料价格上涨，成本增加。',               normal: '利润受压，股价小跌。',             twist: '公司早有囤货，反而赚了一笔。',             type: 'public', s: 'bearish' },
  { msg: 'FB股份宣布进军餐饮业。',                  normal: '跨界失败典型案例，股价大跌。',     twist: '公司食堂太好吃了，外卖平台主动来求合作。', type: 'public', s: 'bearish' },
  { msg: '火灾现场乐队演出时设备故障中断。',         normal: '演出事故影响口碑，股价大跌。',     twist: '即兴清唱片段意外爆火，视频播放量破亿。',       type: 'public', s: 'bearish' },
  { msg: '高管集体减持股票。',                       normal: '不看好公司前景，股价大跌。',       twist: '高管们在凑钱买团体意外险，不是减持。',     type: 'public', s: 'bearish' },
  { msg: 'FB股份被剔除出行业指数。',                normal: '被机构抛售，股价下跌。',           twist: '是因为指数编制规则调整，不是公司问题。',   type: 'public', s: 'bearish' },
  { msg: '公司班车突然取消。',                       normal: '福利缩水，股价小跌。',             twist: '班车取消是因为全员远程办公了，反而省了一大笔油钱。', type: 'public', s: 'bearish' },
  { msg: 'FB股份被投诉虚假宣传。',                   normal: '品牌受损，股价下跌。',             twist: '投诉的是竞品水军，反查后竞品自己跌了。',   type: 'public', s: 'bearish' },
  { msg: '火灾现场乐队核心成员被对手挖角。',         normal: '核心资产流失，股价大跌。',         twist: '挖角方是FB股份的子公司，左手倒右手。',       type: 'public', s: 'bearish' },
  { msg: '公司年报延迟发布。',                       normal: '可能数据难看，股价下跌。',         twist: '是财务总监的Excel卡死了，算了一晚上没算完。', type: 'public', s: 'bearish' },
  { msg: '新专辑首日销量远低于预期。',               normal: '市场不买账，股价大跌。',           twist: '因为物流问题大部分CD还在仓库里，预购数据明天才合并。', type: 'public', s: 'bearish' },
  { msg: 'FB股份办公室漏水停工一天。',              normal: '运营中断，股价小跌。',             twist: '漏水淹了隔壁律所的案卷，对方反而赔了FB股份一笔。', type: 'public', s: 'bearish' },
  { msg: '火灾现场乐队巡演多地取消。',               normal: '票房受损，股价大跌。',             twist: '取消是因为主唱嫌酒店没浴缸拒绝出行。',     type: 'public', s: 'bearish' },
  { msg: '公司艺人经纪板块核心经纪人离职。',         normal: '人才流失，股价下跌。',             twist: '经纪人离职后自己开了个直播号，带货比做经纪赚十倍。', type: 'public', s: 'bearish' },
  { msg: 'FB股份音乐培训遭学员集体投诉。',           normal: '口碑崩塌，股价大跌。',             twist: '投诉原因竟是「教得太好，孩子天天练琴家长受不了噪音」。', type: 'public', s: 'bearish' },
  { msg: '乐器销售部仓库着火。',                     normal: '库存损失，股价大跌。',             twist: '着火烧掉的全是滞销款，保险公司全额赔付，还腾出了仓库。', type: 'public', s: 'bearish' },
  { msg: '火灾现场乐队新歌被指抄袭。',               normal: '版权纠纷，股价大跌。',             twist: '指控方是主唱的前女友，歌里引用了她发过的微信语音。', type: 'public', s: 'bearish' },
  { msg: 'FB股份专辑发行渠道被平台下架。',           normal: '发行受阻，股价大跌。',             twist: '下架原因是平台系统升级bug，所有F开头的公司都被下了。', type: 'public', s: 'bearish' },
  { msg: '公司演出策划活动遭踩踏事故。',             normal: '安全事故，股价暴跌。',             twist: '踩踏发生在抢限量周边时，反而证明粉丝热情极高。', type: 'public', s: 'bearish' },
  { msg: 'FB股份被曝艺人经纪合同存在霸王条款。',     normal: '信任危机，股价下跌。',             twist: '霸王条款是「艺人每天必须按时吃饭」，网友纷纷点赞。', type: 'public', s: 'bearish' },
  { msg: '火灾现场乐队成员集体食物中毒。',           normal: '演出取消，股价大跌。',             twist: '中毒是因为庆功宴吃太撑，第二天全员满血复活。', type: 'public', s: 'bearish' },
  { msg: '公司音乐培训扩张过度资金链紧张。',         normal: '扩张风险，股价下跌。',             twist: '紧张是因为把钱全砸在装修上了，但新校区确实好看。', type: 'public', s: 'bearish' },
  { msg: 'FB股份乐器销售遭竞品价格战。',             normal: '利润挤压，股价小跌。',             twist: '竞品降完价发现自己亏更多，率先涨回去了。', type: 'public', s: 'bearish' },
  { msg: '火灾现场乐队主唱恋情曝光。',               normal: '粉丝脱粉，股价小跌。',             twist: '恋爱对象是乐队的吉他手，CP粉反而狂欢。',   type: 'public', s: 'bearish' },
  { msg: '公司年报显示演出策划业务毛利率下滑。',     normal: '盈利能力减弱，股价下跌。',         twist: '毛利率下滑是因为这次巡演给粉丝送了太多免费荧光棒。', type: 'public', s: 'bearish' },

  // ==================== 小道消息 · 利多 ====================
  { msg: '重磅！公司签下超级大单，股价暴涨！',       normal: '大单属实，全年营收有着落了。',     twist: '大单是给公司全员工买奶茶，为期一年。',     type: 'rumor', s: 'bullish'  },
  { msg: '内幕消息：FB股份即将被收购！',             normal: '收购方已进场尽职调查。',           twist: '尽调结果是「不建议收购，建议直接收购员工食堂」。', type: 'rumor', s: 'bullish' },
  { msg: '火灾现场乐队要来公司开私人演唱会！',       normal: '员工福利，股价小涨。',             twist: '乐队是来要债的，去年公司赞助了演唱会但没给钱。', type: 'rumor', s: 'bullish' },
  { msg: '传闻CEO要和火灾现场乐队主唱合作出歌。',   normal: '跨界营销，股价小涨。',             twist: '合作是真的，歌名叫《杠杆杠杆再杠杆》。',   type: 'rumor', s: 'bullish' },
  { msg: '听说FB股份要和某科技巨头合作！',           normal: '合作框架已签，股价暴涨。',         twist: '合作内容是互相关注对方的公众号。',         type: 'rumor', s: 'bullish' },
  { msg: '传公司拿到独家牌照！',                     normal: '行业准入壁垒，股价大涨。',         twist: '牌照是楼下停车场的月卡。',                 type: 'rumor', s: 'bullish' },
  { msg: '据可靠消息，公司下季度利润将暴增。',       normal: '业绩预期强劲，股价暴涨。',         twist: '利润暴增是因为把亏损部门卖给了自己人。',   type: 'rumor', s: 'bullish' },
  { msg: '消息人士称FB股份即将拆分上市。',           normal: '拆分增值预期，股价大涨。',         twist: '拆的是公司工会的活动经费，不是业务。',     type: 'rumor', s: 'bullish' },
  { msg: '内部群流出截图：公司拿下国家队订单！',     normal: '国家级合作，股价暴涨。',           twist: '国家队是公司楼下公园的太极拳队，订单是定制队服。', type: 'rumor', s: 'bullish' },
  { msg: '猛料！火灾现场乐队要和顶级rapper合作！',   normal: '跨界引流，股价暴涨。',             twist: '合作曲全长30秒，其中20秒是火灾现场乐队的吉他solo。', type: 'rumor', s: 'bullish' },
  { msg: '消息人士：FB股份正在洽谈海外巡演！',       normal: '国际化预期，股价大涨。',           twist: '海外是东南亚某小镇的华人社区中秋晚会。',   type: 'rumor', s: 'bullish' },
  { msg: '内部流出：公司要收购一家唱片公司！',       normal: '纵向整合，股价暴涨。',             twist: '唱片公司只有一间办公室和三个签了约的广场舞大妈。', type: 'rumor', s: 'bullish' },
  { msg: '重磅！火灾现场乐队要上春晚！',             normal: '国民级曝光，股价暴涨。',           twist: '上的是社区春晚，在小区花园搭台那种。',     type: 'rumor', s: 'bullish' },
  { msg: '据传FB股份乐器业务要引入AI调音！',         normal: '科技赋能，股价上涨。',             twist: 'AI调音就是让Siri听一下说「听起来不错」。', type: 'rumor', s: 'bullish' },
  { msg: '听说公司签了位神秘大咖！',                 normal: '期待值拉满，股价暴涨。',           twist: '神秘大咖是楼下保安大爷，每天用口哨吹火灾现场乐队的歌。', type: 'rumor', s: 'bullish' },
  { msg: '传FB股份音乐培训要开直播课！',             normal: '线上化转型，股价上涨。',           twist: '直播课的老师是火灾现场乐队的鼓手，上课全程打鼓不说话。', type: 'rumor', s: 'bullish' },
  { msg: '知情者：公司即将获得一笔巨额融资！',       normal: '资金面改善，股价暴涨。',           twist: '融资来自主唱老妈，条件是年底必须回家相亲。', type: 'rumor', s: 'bullish' },
  { msg: '内幕：火灾现场乐队要出周边盲盒！',         normal: '衍生品爆款预期，股价大涨。',       twist: '盲盒隐藏款是主唱的秃头造型，粉丝拆到后集体破防又回购。', type: 'rumor', s: 'bullish' },

  // ==================== 小道消息 · 利空 ====================
  { msg: '突发！公司涉嫌造假，股价暴跌！',           normal: '造假属实，多个项目数据注水。',     twist: '水是真的，注的是饮料机的水。',             type: 'rumor', s: 'bearish' },
  { msg: '重磅！收购方突然退出！',               normal: '收购失败，股价暴跌。',             twist: '退出是因为收购方老板觉得FB股份名字不好听。', type: 'rumor', s: 'bearish' },
  { msg: '内部人士透露公司账上没钱了！',             normal: '现金流断裂，股价暴跌。',           twist: '没钱是因为全买了理财产品，下周才到期。',   type: 'rumor', s: 'bearish' },
  { msg: '传监管要来查FB股份！',                     normal: '合规风险，股价暴跌。',             twist: '来查的是消防，因为食堂油烟太大。',         type: 'rumor', s: 'bearish' },
  { msg: '据说最大客户要解约！',                     normal: '营收受创，股价大跌。',             twist: '大客户是公司自己的马甲号，解约是为了重签更便宜的合同。', type: 'rumor', s: 'bearish' },
  { msg: '传闻火灾现场乐队成员内讧打起来了！',       normal: '团队分裂，股价暴跌。',             twist: '打的是乒乓球比赛，队长输了请全员喝奶茶。',   type: 'rumor', s: 'bearish' },
  { msg: '知情人士爆料：CEO被边控了！',             normal: '高层动荡，股价暴跌。',             twist: '边控是小区物业的，因为CEO养狗不牵绳。',   type: 'rumor', s: 'bearish' },
  { msg: '传火灾现场乐队主唱嗓子出问题无法演出！',   normal: '票房预期腰斩，股价大跌。',         twist: '感冒声反而更沧桑了，粉丝疯狂买单，门票秒罄。', type: 'rumor', s: 'bearish' },
  { msg: '独家！火灾现场乐队要解散！',               normal: '核心资产归零，股价暴跌。',         twist: '解散的是乐队内部的王者荣耀战队，不是乐队本身。', type: 'rumor', s: 'bearish' },
  { msg: '知情人士：公司账目有重大问题！',           normal: '财务造假嫌疑，股价暴跌。',         twist: '重大问题是出纳的小数点点错了两位，多报了三块钱。', type: 'rumor', s: 'bearish' },
  { msg: '传主唱要单飞！',                           normal: '团队瓦解风险，股价大跌。',         twist: '单飞是坐飞机去外地演出，商务舱。',         type: 'rumor', s: 'bearish' },
  { msg: '重磅！FB股份遭大客户天价索赔！',           normal: '巨额赔偿风险，股价暴跌。',         twist: '天价是88.88元，大客户是公司团购的奶茶店。', type: 'rumor', s: 'bearish' },
  { msg: '据传公司艺人经纪板块被挖角！',             normal: '核心团队动摇，股价下跌。',         twist: '被挖的是保洁阿姨，但她的离开确实让办公环境一落千丈。', type: 'rumor', s: 'bearish' },
  { msg: '内部消息：火灾现场乐队新专辑要跳票！',     normal: '发行延迟，股价大跌。',             twist: '跳票是因为混音师太追求完美，一首歌调了八百遍。', type: 'rumor', s: 'bearish' },
  { msg: '传FB股份音乐培训涉嫌无证办学！',           normal: '合规风险，股价暴跌。',             twist: '缺的证是消防验收，其他资质齐全，补办只需三天。', type: 'rumor', s: 'bearish' },
  { msg: '据可靠消息，公司乐器供应商断供！',         normal: '供应链断裂，股价大跌。',           twist: '断供是因为供应商老板追火灾现场乐队巡演去了，下周回来。', type: 'rumor', s: 'bearish' },
];

// 破产故事（结果页随机展示）
const BUST_STORIES = [
  '据说在天桥底下摆摊，专给人算股票涨跌，一卦五块。',
  '债主堵门拉横幅，连夜收拾行李去了泰国种榴莲。',
  '资产归零，只剩一张纸条：「杠杆有风险，入市需谨慎」。',
  '正在火灾现场乐队的演出现场卖荧光棒还债。',
  '住在朋友家沙发上，每天靠泡面度日，手机屏保还是FB的K线图。',
  '开了个自媒体账号，专门教人「如何精准抄底」，粉丝3个。',
  '在公司楼下支了个烧烤摊，招牌写着「杠杆烤串——越烤越短」。',
  '去应聘FB股份的保洁岗位，面试时被前对手认出来了。',
  '把最后的钱买了彩票，中奖号码和FB的股票代码差了一位。',
  '在地铁站拉横幅：「专业股票分析，只需一碗牛肉面的价格」。',
];

module.exports = { NEWS_DB, BUST_STORIES };
