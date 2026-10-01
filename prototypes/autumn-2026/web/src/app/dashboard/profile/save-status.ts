export type SaveState = "idle" | "pending" | "saving" | "draft-saved" | "submitted" | "error";

export function profileSavePresentation(state: SaveState, submitted: boolean, draft: boolean, dirty: boolean) {
  if (state === "error") return { label: "保存失败", detail: "修改尚未保存，请重试后再离开。", tone: "error" };
  if (state === "saving") return { label: "正在保存…", detail: "正在自动保存，请稍候。", tone: "pending" };
  if (dirty || state === "pending") return { label: "有修改待保存", detail: "停止输入后会自动保存，无需点击提交。", tone: "pending" };
  if (draft || state === "draft-saved") return { label: "草稿已自动保存", detail: submitted ? "请补全必答项；匹配仍使用上次完整资料。" : "请补全必答项，完整资料才会用于匹配。", tone: "draft" };
  if (submitted || state === "submitted") return { label: "全部修改已保存", detail: "资料完整，将用于后续轮次的算法匹配。", tone: "saved" };
  return { label: "尚未填写", detail: "开始填写后自动保存，可随时回来继续。", tone: "draft" };
}
