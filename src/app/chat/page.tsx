import type { Metadata } from "next";
import ChatPanel from "./ChatPanel";

export const metadata: Metadata = {
  title: "自由对话 · Rehearse",
  description: "与面试追问助手进行实时对话练习。",
};

export default function ChatPage() {
  return <ChatPanel />;
}
