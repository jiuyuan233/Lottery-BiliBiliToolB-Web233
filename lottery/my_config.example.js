/* =============================================================================
 * LotteryAutoScript  my_config.js  ——  抽奖行为配置（类人类作息优化版）
 * -----------------------------------------------------------------------------
 * 上游：https://github.com/shanmiteko/LotteryAutoScript
 * 本文件在上游 my_config.example.js 基础上：
 *   1) 优化注释，逐项说明含义与取值
 *   2) 调整各项间隔为「类人类作息」——不追求高频，模拟真人阅读/操作节奏
 *   3) 默认开启更稳妥的防风控设置
 *   4) 抽奖策略（详见下方两条）：
 *      ① 避免黑号：三连（点赞/投币/收藏/看视频）由 BiliBiliToolPro 日常任务
 *        负责，两个工具混合启动即可向 B 站证明是活人，无需在此额外发随机动态。
 *      ② 多参加非官方抽奖：官方抽奖中奖难度高、风控严，工具人中的几乎
 *        都是非官方抽奖。故 model 设为 '01'（只转非官抽），首推荐置顶抽奖。
 * ========================================================================== */
module.exports = Object.freeze({

    /* 默认设置（公用）；单账号设置区会覆盖同名项 */
    default_config: {

        /** 监视转发的用户 uid 列表 */
        UIDs: [],
        /** 监视的话题 tag 列表 */
        TAGs: [],
        /** 监视的专栏关键词 */
        Articles: [],

        /**
         * 抽奖信息来源（按 LotteryOrder 顺序检索）：
         *   "file://xxx.json" 本地文件
         *   "https://..."     API 接口
         */
        APIs: ['file://lottery_info_1.json'],

        /** lottery_dyids 目录下的动态 id 文件名，一行一个 dyid */
        TxT: ['dyids.txt'],

        /**
         * 抽奖参与顺序：0=UIDs 1=TAGs 2=Articles 3=APIs 4=TxT
         */
        LotteryOrder: [2, 0, 1, 3],

        /** 是否把抽奖信息保存到文件（多账号时账号1开、后续账号读） */
        save_lottery_info_to_file: false,

        /** 上传抽奖信息的 API 地址（留空=不上传） */
        set_lottery_info_url: '',

        /** 动态关键词正则（须同时满足） */
        key_words: [
            '[抽奖送揪]|福利',
            '[转关评粉]|参与'
        ],

        /** AI 判断抽奖参数（OpenAI 兼容接口） */
        ai_judge_parm: { url: '', body: {}, prompt: '' },

        /**
         * 自动转发：'00'关 '10'只官抽 '01'只非官抽 '11'都转
         * 策略②：设为 '01' 只转非官方抽奖——官方抽奖中奖难度高、风控严，
         * 工具人中的几乎都是非官方抽奖。如想兼顾官方可改回 '11'。
         */
        model: '01',

        /**
         * 自动评论：'00'关 '10'只官抽 '01'只非官抽 '11'都评
         * 与 model 保持一致，只评论非官方抽奖。
         */
        chatmodel: '01',

        /** 不参与预约抽奖 */
        disable_reserve_lottery: false,
        /** 不转关预约抽奖（预约可能与转发并存） */
        is_not_relay_reserve_lottery: false,

        /**
         * 重复转发检查：
         *  -1 不检查 | 0 点赞判断 | 1 检索本地 dyids | 2 不点赞+检索 | 3 点赞+检索
         */
        check_if_duplicated: 1,

        /** 偷塔模式（临近开奖才参与），此时不检查重复 */
        sneaktower: true,

        /** 屏蔽动态类型：1转发 2图文 4纯文字 8视频 512番剧 2048活动 64专栏 */
        block_dynamic_type: [0],

        /** 只参与多少天内创建的动态 */
        max_create_time: 60,

        /** 不加判断地转发所监视 uid 转发的动态 */
        is_imitator: false,

        /** uid/tag/专栏 检索页数 */
        uid_scan_page: 3,
        tag_scan_page: 3,
        article_scan_page: 3,
        /** 专栏创建距今最大天数 */
        article_create_time: 7,
        /** 不检查专栏是否看过（false=检查，提高效率） */
        not_check_article: false,
        /** 开奖距今最大天数（Infinity=不限） */
        maxday: Infinity,

        /** 各阶段循环结束后的休眠(毫秒) */
        lottery_loop_wait: 0,
        check_loop_wait: 0,
        clear_loop_wait: 0,

        /**
         * 转发间隔(毫秒)，上下浮动 50%。
         * 类人类作息：45s（上游默认 30s），更像真人阅读后再转发
         */
        wait: 45 * 1000,

        /** 检索动态间隔 —— 5s（上游 2s），降低请求频率 */
        search_wait: 5000,
        /** 读取私信下一页间隔 */
        get_session_wait: 4000,
        /** 已读私信间隔 */
        update_session_wait: 2000,
        /** 读取关注列表间隔 */
        get_partition_wait: 4000,
        /** 获取动态细节间隔 */
        get_dynamic_detail_wait: 4000,
        /** 过滤间隔（开奖时间/粉丝数） */
        filter_wait: 2000,
        /** 随机动态间隔 */
        random_dynamic_wait: 4000,
        /** 预约抽奖间隔 */
        reserve_lottery_wait: 8000,

        /** up 主最低粉丝数（过滤小号抽奖） */
        minfollower: 1000,
        /** 只转发已关注的 up */
        only_followed: false,

        /**
         * 发随机动态防被开奖机过滤。
         * 策略①说明：三连（点赞/投币/收藏/看视频）由 BiliBiliToolPro 日常任务
         * 负责，两个工具混合启动即可向 B 站证明是活人，无需在此额外开启。
         */
        create_dy: false,

        /** 随机动态类型：0自定义 1推荐视频 -1混合 */
        create_dy_type: 0,

        /** 结束时发几条随机动态 */
        create_dy_num: 1,

        /** 随机动态内容 */
        dy_contents: ['[doge]', '[doge][doge]'],

        /** 每转发 x 条发 y 条随机动态 [[转发数],[随机数]] */
        create_dy_mode: [[0], [0]],

        /** 转发时 @ 的用户 [[名称, uid]] */
        at_users: [['转发抽奖娘', 294887687], ['你的工具人老公', 100680137]],

        /** 黑名单 dyid/uid，英文逗号分隔 */
        blacklist: '',
        /** 屏蔽词 */
        blockword: ['脚本', '抽奖号', '钓鱼'],

        /** 转发并评论（评论=转发语） */
        is_repost_then_chat: false,

        /** 转发评语，支持 ${uname} */
        relay: ['转发动态'],

        /** 评论内容池，支持 ${uname} */
        chat: [
            '[OK]', '[星星眼]', '[歪嘴]', '[喜欢]', '[偷笑]', '[笑]', '[喜极而泣]', '[辣眼睛]', '[吃瓜]', '[奋斗]',
            '永不缺席 永不中奖 永不放弃！', '万一呢', '在', '冲吖~', '来了', '万一', '[保佑][保佑]', '从未中，从未停',
            '来力', '秋梨膏', '[呲牙]', '从不缺席', '分子', '可以', '恰', '不会吧', '1', '好',
            'rush', '来来来', 'ok', '冲', '凑热闹', '我要我要[打call]', '我还能中！让我中！！！',
            '大家都散了吧，已经抽完了，是我的', '我是天选之子', '给我中一次吧！',
            '坚持不懈，迎难而上，开拓创新！', '[OK][OK]', '我来抽个奖', '中中中中中中', '[doge][doge][doge]', '我我我',
        ],

        /** AI 评论参数（OpenAI 兼容） */
        ai_comments_parm: { url: '', body: {}, prompt: '' },

        /** 抄热评 */
        is_copy_chat: false,
        /** 热评屏蔽词 */
        copy_blockword: ['三不原则'],

        /** 抽奖 UP 分组 id（自动获取） */
        partition_id: 0,
        /** 不为抽奖 UP 单独建分组 */
        is_not_create_partition: false,

        is_exception: false,
        is_outof_maxfollow: false,

        /** 中奖通知关键词（满足其一即推送；~ 开头为黑名单） */
        notice_key_words: [
            '~预约成功|预约主题',
            '中奖|获得|填写|写上|提供|收货地址|支付宝账号|码|大会员',
            '~你的账号在新设备或平台登录成功',
            '~你预约的直播已开始'
        ],
        /** 发送运行状态通知 */
        notice_running_state: false,

        /** 检查私信页数 */
        check_session_pages: 16,

        /** 清理白名单 uid/dyid */
        clear_white_list: '',
        /** 取关分区（默认临时关注分区） */
        clear_partition: '',
        /** 清理多少天前的动态/关注 */
        clear_max_day: 30,
        /** 快速取关（不加判断） */
        clear_quick_remove_attention: false,
        /** 快速取关：粉丝数小于此值的才取 */
        clear_quick_remove_attention_fans_number_smallest: Infinity,
        /** 是否移除动态 */
        clear_remove_dynamic: true,
        /** 是否移除关注 */
        clear_remove_attention: true,
        /** 清除延时(毫秒) */
        clear_remove_delay: 8000,
        /** 清除动态类型 */
        clear_dynamic_type: [1],
    },

    /* 针对账号1的特别设置（覆盖 default_config 同名项） */
    config_1: {
        /** 手动添加抽奖号 uid（二级小号） */
        UIDs: [],
        TAGs: [],
        Articles: ['抽奖合集'],
        APIs: [],
        /** 账号1 开启 AI 判断（示例用 DeepSeek 兼容接口，按需改） */
        ai_judge_parm: {
            url: 'https://api.deepseek.com/chat/completions',
            body: { 'model': 'deepseek-chat' },
            prompt: '你是一个B站用户，需要判断动态内容是否是抽奖动态，以及参与条件，以json格式输出，仅需包含key:has_key_words(bool),needAt(bool),needTopic(string),drawtime(number),more(string)。回答不要包含markdown标记，输出纯json。'
        },
        ai_comments_parm: {
            url: 'https://api.deepseek.com/chat/completions',
            body: { 'model': 'deepseek-chat' },
            prompt: '你是一个B站用户，请根据以下内容直接生成一条模拟真实用户的评论，不要使用表情，无需说明，不包含敏感词。'
        },
        save_lottery_info_to_file: true,
    },

    /** 后续账号从文件提取抽奖信息转抽 */
    config_2: {},
    config_3: {}
});
