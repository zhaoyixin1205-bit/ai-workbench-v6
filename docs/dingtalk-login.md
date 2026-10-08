# 钉钉免登配置说明（V8.3-10.08 需求①）
#
# ⚠️ 本文件只是**说明**，请勿把真实 Secret 写进仓库。
#    真实值请配置到服务器：/data/ai-workbench/.env （权限 600，owner=root）
#
# 1) 取得参数（钉钉开放平台 → 你的企业内部应用 → 应用信息）
#    Client ID     = 原 AppKey / SuiteKey
#    Client Secret = 原 AppSecret / SuiteSecret   ← 保密，只放服务器
#    Agent ID      = 原 AgentId（可选，仅用于日志排查）
#
# 2) 服务器 .env 内容（DINGTALK_CLIENT_SECRET 换成你的完整值）
#
#    DINGTALK_CLIENT_ID=dingxxxxxxxxxxxxxxxx
#    DINGTALK_CLIENT_SECRET=你的完整Secret
#    DINGTALK_AGENT_ID=4975335984
#    DINGTALK_REDIRECT_URI=https://aihrbp.yunzhangfang.com/auth/dingtalk/callback
#
# 3) 生效：systemctl restart ai-workbench
#    自检：curl -s https://aihrbp.yunzhangfang.com/api/auth/dingtalk/config
#          返回 {"ok":true,"enabled":true,"clientId":"dingxxx"} 即为已启用
#
# 4) 未配置时系统**不会坏**：前端自动降级为「按角色选身份」的登录页，
#    本地开发与演示照常可用。
#
# 5) 钉钉后台需登记的「登录回调地址」必须与 DINGTALK_REDIRECT_URI 完全一致。