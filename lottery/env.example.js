/* =============================================================================
 * LotteryAutoScript  env.js  ——  账号与推送配置（类人类作息优化版）
 * -----------------------------------------------------------------------------
 * ⚠️  本文件由 cookie-sync 自动维护 COOKIE 字段，请勿手动改 cookie。
 *     你只需配置推送渠道（TG/钉钉/邮件等）与高级开关。
 *
 * 类人类作息理念：
 *   * 不追求 24h 高频挂机，而是早中晚各跑一次（见 crontab-lottery）
 *   * 多账号依次执行，账号间留出等待时间，避免 IP 风控
 *   * 日志等级 Info，便于排查又不过度刷屏
 *   * 上游：https://github.com/shanmiteko/LotteryAutoScript
 * ========================================================================== */
module.exports = Object.freeze({

    /* -------------------------------------------------------------------------
     * 账号参数
     *  COOKIE        由 cookie-sync 自动填入（来自 BiliBiliTool 面板扫码）
     *  NOTE          账号备注，方便多账号区分
     *  NUMBER        第几个账号
     *  CLEAR         是否启用清理功能
     *  ACCOUNT_UA    账号 UA（保持与真实浏览器一致更稳）
     *
     *  高级：
     *  ENABLE_CHAT_CAPTCHA_OCR  评论验证码识别（需自建 OCR 接口）
     *  ENABLE_AI_JUDGE          AI 判断过滤过期抽奖（需在 my_config 配 API）
     *  ENABLE_AI_COMMENTS       AI 生成评论（需在 my_config 配 API）
     *
     *  调试：
     *  LOTTERY_LOG_LEVEL  Error0<Warn1<Notice2<Info3<Debug4
     *  NOT_GO_LOTTERY     关闭抽奖行为（仅观察）
     *
     *  多账号：
     *  ENABLE_MULTIPLE_ACCOUNT  cookie-sync 同步多账号时会置 true
     *  WAIT                    下一个账号运行前等待(毫秒)，模拟人类换号间隙
     * ----------------------------------------------------------------------- */
    account_parm: {
        COOKIE: '',                       // ← cookie-sync 自动写入，勿手填
        NOTE: '',
        NUMBER: 1,
        CLEAR: true,
        ACCOUNT_UA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

        ENABLE_CHAT_CAPTCHA_OCR: false,
        CHAT_CAPTCHA_OCR_URL: 'http://127.0.0.1:9898/ocr/url/text',
        ENABLE_AI_JUDGE: false,
        ENABLE_AI_COMMENTS: false,

        ENABLE_MULTIPLE_ACCOUNT: false,   // ← cookie-sync 多账号时自动置 true
        MULTIPLE_ACCOUNT_PARM: '',

        LOTTERY_LOG_LEVEL: 3,             // Info
        NOT_GO_LOTTERY: ''
    },

    /* -------------------------------------------------------------------------
     * 多账号参数模板 —— cookie-sync 同步多账号时填充此数组
     * WAIT=90s：换号间隔，模拟人类休息，降低风控风险
     * ----------------------------------------------------------------------- */
    multiple_account_parm: [
        {
            COOKIE: '',
            NOTE: '',
            NUMBER: 1,
            CLEAR: true,
            WAIT: 90 * 1000,             // 账号间等待 90 秒
            ACCOUNT_UA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            PROXY_HOST: '',
            PROXY_PORT: '',
            PROXY_USER: '',
            PROXY_PASS: '',
        }
    ],

    /* -------------------------------------------------------------------------
     * 推送参数 —— 任选其一或多。中奖通知会发到这里。
     *   TG_BOT_TOKEN/TG_USER_ID  Telegram（推荐，最稳）
     *   DD_BOT_TOKEN/DD_BOT_SECRET  钉钉机器人
     *   PUSH_PLUS_TOKEN  pushplus(微信)
     *   SMTP_*  邮件
     * ----------------------------------------------------------------------- */
    push_parm: {
        SCKEY: '',            // server酱(已下线)
        SENDKEY: '',          // server酱 Turbo
        QQ_SKEY: '',          // 酷推
        QQ_MODE: '',
        BARK_PUSH: '',        // BARK(iOS)
        BARK_SOUND: '',
        PUSHDEER_URL: '',
        PUSHDEER_PUSHKEY: '',
        TG_BOT_TOKEN: '',     // 例: 123456:ABC-DEF
        TG_USER_ID: '',       // 例: 987654321
        TG_PROXY_HOST: '',
        TG_PROXY_PORT: '',
        DD_BOT_TOKEN: '',     // 钉钉 access_token
        DD_BOT_SECRET: '',    // 钉钉 加签 SEC...
        QYWX_AM: '',          // 企业微信应用
        QYWX_KEY: '',         // 企业微信机器人
        IGOT_PUSH_KEY: '',
        PUSH_PLUS_TOKEN: '',  // pushplus
        PUSH_PLUS_USER: '',
        QMSG_SOCKET: '',
        QMSG_KEY: '',
        QMSG_QQ: '',
        SMTP_HOST: '',        // 例: smtp.qq.com
        SMTP_PORT: '',        // 例: 465
        SMTP_USER: '',
        SMTP_PASS: '',
        SMTP_TO_USER: '',
        GOTIFY_URL: '',
        GOTIFY_APPKEY: '',
        FS_BOT_WEBHOOK: '',   // 飞书
        FS_BOT_SECRET: ''
    },

    /* -------------------------------------------------------------------------
     * AI 鉴权（OpenAI 兼容接口）—— 仅 ENABLE_AI_* 打开时才用到
     * ----------------------------------------------------------------------- */
    ai_parm: {
        AI_API_KEY: '',
    }
});
