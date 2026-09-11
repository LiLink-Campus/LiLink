"use client";
import { usePathname } from "next/navigation";
import { VISUAL_PREVIEW } from "@/lib/visual-preview/mode";
import styles from "./visual-preview-tools.module.css";
const pages = [["/login", "登录"], ["/register", "注册方式"], ["/register/school", "学校邮箱"], ["/register/personal", "普通邮箱"], ["/forgot-password", "找回密码"], ["/dashboard", "用户首页"], ["/dashboard/profile", "我的资料"], ["/dashboard/match", "我的匹配"], ["/dashboard/me", "个人中心"], ["/dashboard/referrals", "邀请好友"], ["/dashboard/coupons", "优惠券"]];
export function VisualPreviewTools() {
  const pathname = usePathname();
  if (!VISUAL_PREVIEW) return null;
  return <details className={styles.tools} key={pathname}>
    <summary>视觉预览</summary>
    <div className={styles.menu}>
      <p>表单可直接继续 · 使用虚拟资料</p>
      <nav aria-label="视觉预览页面">{pages.map(([href, label]) => <a key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</a>)}</nav>
      <label>匹配展示状态<select defaultValue="" onChange={event => { document.cookie = `lilink_visual_state=${event.target.value}; path=/; SameSite=Lax`; window.location.href = "/dashboard/match"; }}>
        <option value="" disabled>选择状态</option><option value="waitingNoResult">等待揭晓</option><option value="matchedNotIntroduced">匹配成功</option><option value="introducedContactCompleted">已交换联系方式</option><option value="lastRoundUnmatched">本轮未匹配</option>
      </select></label>
      <small>只影响当前副本；刷新后恢复示例资料。</small>
    </div>
  </details>;
}
