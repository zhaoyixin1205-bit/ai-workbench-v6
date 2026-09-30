#!/usr/bin/env bash
# ============================================================
# V6.0 一键推送 GitHub（SSH）
#
# 用法：
#   bash scripts/push-github.sh                  # 推到 ai-workbench-v6
#   bash scripts/push-github.sh my-repo-name     # 推到指定新仓库
#
# 前置条件（只需做一次）：
#   1. 把 ~/.ssh/id_ed25519.pub 的内容加到 GitHub → Settings → SSH and GPG keys
#   2. 在 GitHub 新建一个【空】仓库（不要勾 README / .gitignore / License）
#
# 说明：本机 HTTPS 到 github.com 被网络阻断（直连超时、代理 502），
#       故统一走 SSH 22 端口。
# ============================================================
set -euo pipefail

GH_USER="zhaoyixin1205-bit"

# 参数解析：仓库名（默认 ai-workbench-v6）+ 可选 --wait
NEW_REPO="ai-workbench-v6"
WAIT_MODE=0
for a in "$@"; do
  case "$a" in
    --wait) WAIT_MODE=1 ;;
    *) NEW_REPO="$a" ;;
  esac
done

# 路径含空格，一律引号包裹
CODE_DIR="D:/工作/AI工具/Work Buddy 项目文件/企业版空间/AI 赋能/AI赋能工作台/ai-workbench"
DOC_DIR="D:/工作/AI工具/Work Buddy 项目文件/企业版空间/AI 赋能/ai-workbench-repo"

echo "==> [0/4] 校验 SSH 认证"
SSH_OUT="$(ssh -T git@github.com 2>&1 || true)"
if ! echo "$SSH_OUT" | grep -q "successfully authenticated"; then
  echo "✗ SSH 未认证。请先到 GitHub → Settings → SSH and GPG keys 添加公钥："
  echo "  $(cat ~/.ssh/id_ed25519.pub 2>/dev/null || echo '（未找到 ~/.ssh/id_ed25519.pub）')"
  echo "原始输出：$SSH_OUT"
  exit 1
fi
echo "✓ SSH 认证通过：$SSH_OUT"

if [ "$WAIT_MODE" = "1" ]; then
  echo "==> [0.5/4] 等待仓库 ${GH_USER}/${NEW_REPO} 被创建（最多 15 分钟，每 10 秒探测一次）"
  FOUND=0
  for i in $(seq 1 90); do
    if git ls-remote "git@github.com:${GH_USER}/${NEW_REPO}.git" >/dev/null 2>&1; then
      echo "✓ 仓库已就绪（第 ${i} 次探测）"
      FOUND=1
      break
    fi
    sleep 10
  done
  if [ "$FOUND" = "0" ]; then
    echo "✗ 15 分钟内未检测到仓库 ${GH_USER}/${NEW_REPO}。若你用了别的名字，执行："
    echo "    bash scripts/push-github.sh 你的仓库名"
    exit 1
  fi
fi

echo "==> [1/4] 推送活跃代码库 → ${GH_USER}/${NEW_REPO}"
cd "$CODE_DIR"
git remote remove origin 2>/dev/null || true
git remote add origin "git@github.com:${GH_USER}/${NEW_REPO}.git"
git push -u origin main
echo "✓ 代码库已推送：https://github.com/${GH_USER}/${NEW_REPO}"

echo "==> [2/4] 提交参考仓库的 V6.0 文档"
cd "$DOC_DIR"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "docs(v6.0): 增量 PRD 与融合实施方案 + P12-P16 实施进度"
else
  echo "· 无待提交内容，跳过"
fi

echo "==> [3/4] 参考仓库改用 SSH 并推送"
git remote set-url origin "git@github.com:${GH_USER}/ai-workbench.git"
git push origin main
echo "✓ 文档库已推送：https://github.com/${GH_USER}/ai-workbench"

echo "==> [4/4] 完成"
git -C "$CODE_DIR" log --oneline -1
