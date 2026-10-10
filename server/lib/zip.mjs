/**
 * 极简 ZIP 读取器（零依赖，仅用 node:zlib）
 *
 * 为什么自己写：接入 unzipper / adm-zip 之类的包要新增依赖，而服务端这里只需要
 * 「解包看一眼里面有什么文件」这一个能力 —— 为它引入一个依赖不划算，且多一个
 * 供应链风险点。这里只实现真实需要的部分：
 *   ① 从 End Of Central Directory 定位中央目录；
 *   ② 遍历目录项拿到文件名 + 压缩方式 + 本地头偏移；
 *   ③ 按需 inflateRaw 取出内容。
 * 不支持 zip64（>4GB 或 >65535 项）——Skill 压缩包不可能到这个量级，命中即明确报错。
 */

import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

/** 从尾部往前找 EOCD（末尾可能有注释，最多扫 64KB + 22 字节） */
function findEOCD(buf) {
  const max = Math.min(buf.length, 22 + 65535);
  for (let i = buf.length - 22; i >= buf.length - max; i -= 1) {
    if (i >= 0 && buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/**
 * 列出包内文件（目录项以 / 结尾）。
 * @param {Buffer} buf
 * @returns {string[]} 包内相对路径清单
 */
export function listZipEntries(buf) {
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error('不是有效的 zip 文件（找不到中央目录）');

  const total = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const names = [];

  for (let i = 0; i < total; i += 1) {
    if (buf.readUInt32LE(offset) !== CDH_SIG) break; // 目录已读完（或多分区包，不支持）
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
    names.push(name);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/**
 * 读取包内某个文件的内容（文本）。找不到返回 null。
 * @param {Buffer} buf
 * @param {string} want 目标文件名（支持仅比较 basename，兼容包内带一层目录的情况）
 */
export function readZipText(buf, want) {
  const eocd = findEOCD(buf);
  if (eocd < 0) return null;
  const total = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < total; i += 1) {
    if (buf.readUInt32LE(offset) !== CDH_SIG) break;
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const lfh = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);

    const base = name.split('/').pop();
    if (base === want) {
      if (buf.readUInt32LE(lfh) !== LFH_SIG) return null;
      const lNameLen = buf.readUInt16LE(lfh + 26);
      const lExtraLen = buf.readUInt16LE(lfh + 28);
      const start = lfh + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compSize);
      // method 0 = 存储，8 = deflate；其余方式明确报错，不静默返回空内容
      if (method === 0) return raw.toString('utf8');
      if (method === 8) return inflateRawSync(raw).toString('utf8');
      throw new Error(`zip 内 ${name} 使用了不支持的压缩方式（method=${method}）`);
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/**
 * Skill 包结构校验（CR-31 的真实校验，取代此前的「模拟校验通过」）。
 * 规则（2026-10-10 运营方拍板放宽）：包内只需含 SKILL.md（允许位于包内任意层级，
 * 大小写不敏感）—— manifest.yaml 不再强制。裸 .md 文件（非 zip）不经过本校验，
 * 天然满足「.md 文档本身也可以」的口径。
 */
export const SKILL_REQUIRED = ['SKILL.md'];

export function validateSkillZip(buf) {
  const names = listZipEntries(buf);
  const bases = new Set(names.map((n) => n.split('/').pop().toLowerCase()));
  const missing = SKILL_REQUIRED.filter((f) => !bases.has(f.toLowerCase()));
  return { ok: missing.length === 0, missing, entries: names };
}
