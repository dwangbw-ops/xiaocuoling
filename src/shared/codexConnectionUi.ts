export function codexConnectionPrimaryAction(): {
  label: string;
  description: string;
} {
  return {
    label: "一键读取全部 Codex 使用过程",
    description: "读取本机 Codex session 元数据、安装全局捕获脚本、生成成长分析。",
  };
}
