// טיפוסים משותפים לרכיבי צ׳אט הצוות.

export type ChatContact = {
  id: string;
  name: string | null;
  role: string; // "מנהלת" | "מזכירה" | "מטפל/ת"
};

export type ConversationParticipant = {
  id: string;
  name: string | null;
  role: string;
};

export type ConversationSummary = {
  id: string;
  type: "DIRECT" | "GROUP";
  isTeamChannel: boolean;
  title: string;
  participants: ConversationParticipant[];
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  body: string;
  senderId: string;
  senderName: string | null;
  isAnnouncement: boolean;
  createdAt: string;
  editedAt: string | null;
};
