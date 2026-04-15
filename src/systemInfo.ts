import os from "node:os";

/** Single-line OS description for agent system prompts (server machine). */
export function getOsInfoBlock(): string {
  return `OS: ${os.platform()} ${os.arch()} (${os.release()})`;
}
