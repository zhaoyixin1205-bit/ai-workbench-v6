#!/usr/bin/env bash
# AI赋能工作台 · PostgreSQL 每日备份
# 部署位置：/data/ai-workbench/scripts/pg-backup.sh（0700）
# 触发方式：cron 每日 03:00
# 口令来源：从 systemd unit 的 DATABASE_URL 解析，不在本脚本内硬编码
set -euo pipefail

UNIT="${UNIT:-/etc/systemd/system/ai-workbench.service}"
BACKUP_DIR="${BACKUP_DIR:-/data/backup/postgres}"
CONTAINER="${CONTAINER:-postgres}"
DB_NAME="${DB_NAME:-ai_workbench}"
DB_USER="${DB_USER:-wb}"
KEEP_DAYS="${KEEP_DAYS:-14}"
LOG="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; }

# 解析连接口令
DATABASE_URL="$(grep -oP '(?<=Environment=DATABASE_URL=).*' "$UNIT" | head -1 || true)"
if [ -z "$DATABASE_URL" ]; then
  log "ERROR 无法从 $UNIT 解析 DATABASE_URL"
  exit 1
fi
export PGPASSWORD="$(printf '%s' "$DATABASE_URL" | sed -E 's#^postgres://[^:]+:([^@]+)@.*#\1#')"

TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME}_${TS}.sql.gz"
TMP="$OUT.part"

log "开始备份 -> $OUT"

if docker exec -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
     pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges 2>>"$LOG" | gzip > "$TMP"; then
  SIZE="$(stat -c %s "$TMP" 2>/dev/null || echo 0)"
  if [ "$SIZE" -lt 1024 ]; then
    log "ERROR 备份文件异常（${SIZE} bytes），保留现场待排查：$TMP"
    exit 1
  fi
  mv "$TMP" "$OUT"
  log "备份完成 $(basename "$OUT")（${SIZE} bytes，gzip）"
else
  rm -f "$TMP"
  log "ERROR pg_dump 执行失败"
  exit 1
fi

# 保留最近 N 天
DELETED="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}_*.sql.gz" -mtime +"$KEEP_DAYS" -print -delete | wc -l)"
log "清理过期备份（>${KEEP_DAYS}天）：${DELETED} 个"

# 容量告警（>5G 提示）
USED="$(du -sm "$BACKUP_DIR" | cut -f1)"
if [ "$USED" -gt 5120 ]; then
  log "WARN 备份目录已占 ${USED} MB，请检查保留策略或磁盘"
fi

log "当前备份目录占用：${USED} MB / 文件数：$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql.gz' | wc -l)"
exit 0
