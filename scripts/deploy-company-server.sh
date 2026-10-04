#!/usr/bin/env bash
# ============================================================
# 一键同步公司云服务器（底层铁律 #0：GitHub + 公司服务器双同步）
#
# 用法（需能连通 146.56.249.120:22，公司网络常需先连 VPN）：
#   bash scripts/deploy-company-server.sh
#
# 真实部署结构（2026-10-04 实测校正，勿再按旧结构写）：
#   服务器 /data/ai-workbench/
#     dist/            ← 前端构建产物（vite 顶层 dist，NOT 03-frontend-*/dist）
#     server/index.mjs ← V6.0 CR-31 文件服务（不是 server.js）
#     server/lib/      ← fileRepo / stateStore / zip
#     scripts/         ← pg-backup.sh / push-github.sh / *_smoke.mjs
#     package.json     ← 根依赖（node_modules 在服务器上已装）
#   systemd: ai-workbench.service，DIST_DIR=/data/ai-workbench/dist，PORT=8080
#   nginx:   https://aihrbp.yunzhangfang.com 反代 127.0.0.1:8080
#
# 前置：
#   1. 本机已 npm run build（dist 为最新）；
#   2. 本机公钥已加入 ubuntu@146.56.249.120 的 authorized_keys。
#
# 安全边界（血泪：严禁把其它版本的 dist 推上来，会把线上降级）：
#   - 只覆盖 dist / server / scripts / package.json；
#   - 绝不触碰 .env、server/data（state.json 是活数据）、postgres；
#   - 重启前把被覆盖项备份到 .bak/<时间戳>/。
# ============================================================
set -euo pipefail

HOST="${WB_HOST:-146.56.249.120}"
USER="${WB_USER:-ubuntu}"
REMOTE_DIR="${WB_REMOTE_DIR:-/data/ai-workbench}"
SERVICE="${WB_SERVICE:-ai-workbench}"
SITE="${WB_SITE:-https://aihrbp.yunzhangfang.com}"

LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "==> 0. 前置检查"
ssh -o StrictHostKeyChecking=no "${USER}@${HOST}" \
  "test -d ${REMOTE_DIR} || { echo '!! 远端目录不存在：${REMOTE_DIR}'; exit 1; }"
[ -f "${LOCAL_ROOT}/dist/index.html" ] || { echo "!! 本地 dist 不存在，请先 npm run build"; exit 1; }

LOCAL_JS="$(grep -oE 'assets/index[^\"]+\.js' "${LOCAL_ROOT}/dist/index.html" | head -1)"
echo "    本地 dist 指纹：${LOCAL_JS}"

echo "==> 1. 打包（dist + server + scripts + package.json）"
TAR="$(mktemp /tmp/wb-sync-XXXX.tar.gz)"
tar -czf "$TAR" -C "$LOCAL_ROOT" dist server scripts package.json package-lock.json
echo "    $(du -h "$TAR" | cut -f1) -> $(basename "$TAR")"

echo "==> 2. 上传"
scp -q "$TAR" "${USER}@${HOST}:/tmp/wb-sync.tar.gz"

echo "==> 3. 远端备份 + 解压 + 重启"
ssh -o StrictHostKeyChecking=no "${USER}@${HOST}" "set -e
  cd '${REMOTE_DIR}'
  mkdir -p '.bak/${STAMP}'
  echo '    备份到 .bak/${STAMP}/'
  cp -r dist '.bak/${STAMP}/dist'
  cp -r server '.bak/${STAMP}/server'
  cp package.json '.bak/${STAMP}/package.json' 2>/dev/null || true
  tar -xzf /tmp/wb-sync.tar.gz -C '${REMOTE_DIR}'
  rm -f /tmp/wb-sync.tar.gz
  # 依赖变化时才重装（node_modules 保留在服务器上，避免每次全量安装）
  if ! diff -q package.json package-lock.json >/dev/null 2>&1 && [ -f package.json ]; then
    if ! cmp -s package.json ".bak/${STAMP}/package.json" 2>/dev/null; then
      echo '    package.json 有变化，npm install --omit=dev'
      npm install --omit=dev --no-audit --no-fund
    fi
  fi
  sudo systemctl restart '${SERVICE}'
  sleep 3
  systemctl is-active '${SERVICE}' | sed 's/^/    服务状态: /'
  curl -s -o /dev/null -w '    容器自检 http://127.0.0.1:8080 -> %{http_code}\n' http://127.0.0.1:8080/ || true
  echo \"    远端 dist 指纹: \$(grep -oE 'assets/index[^\"]+\.js' '${REMOTE_DIR}/dist/index.html' | head -1)\"
"
rm -f "$TAR"

echo "==> 4. 外部验证（${SITE}）"
sleep 2
curl -s -o /dev/null -w "    %{http_code}\n" --max-time 20 "${SITE}/"
REMOTE_JS="$(curl -s --max-time 20 "${SITE}/" | grep -oE 'assets/index[^\"]+\.js' | head -1)"
echo "    线上 ${REMOTE_JS}"
[ "${LOCAL_JS}" = "${REMOTE_JS}" ] && echo "✅ 同步完成，指纹一致" \
  || echo "⚠️ 指纹不一致，检查 nginx 缓存 / Cloudflare / 解压路径"
