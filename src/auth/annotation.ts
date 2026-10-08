import { useStore } from '@/store/store';
import { NOTE_ROLES, isNoteRole } from '@/auth/noteRoles';

/**
 * V8.6-10.08：口径 / 规则 / 实现注解的可见性收口。
 *
 * 只有运营方（组织者 / 技能管理员 / 系统管理员）需要知道
 * 「为什么这么算、数据来源是哪、开关叫什么、更新日期是哪天」；
 * 其余角色（普通成员 / 团队负责人 / 评委 / 问诊专家 / 观众）只看结论。
 *
 * 用法：
 *   const note = useNoteVisible();
 *
 *   {note && <Alert ... />}                       // 整块注解
 *   <PageHeader desc={note ? 'AI 分 + 评委分合成' : undefined} />   // 字符串属性
 *
 * 判定本身在 @/auth/noteRoles（纯函数，冒烟脚本直接打包校验）。
 */
export { NOTE_ROLES, isNoteRole };

/** 页内 hook：当前登录身份是否展示口径 / 规则类注解 */
export function useNoteVisible(): boolean {
  const { me } = useStore();
  return isNoteRole(me?.roles);
}
