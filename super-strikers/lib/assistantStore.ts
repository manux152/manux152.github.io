// Keeps the conversation while you move around the app (cleared when you press New chat or reload).
export type ChatMsg = { role: 'user' | 'assistant'; text: string; links?: { label: string; route: string }[]; error?: boolean; ai?: boolean };
export const chatStore: { messages: ChatMsg[] } = { messages: [] };
