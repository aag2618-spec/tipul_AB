// Type definitions for the application

export type UserRole = 'USER' | 'MANAGER' | 'ADMIN';

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  phone: string | null;
  license: string | null;
  role?: UserRole;
}

export interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthDate: Date | null;
  address: string | null;
  status: ClientStatus;
  medicalHistory: Record<string, unknown> | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  therapistId: string;
}

export type ClientStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface TherapySession {
  id: string;
  startTime: Date;
  endTime: Date;
  status: SessionStatus;
  type: SessionType;
  price: number;
  notes: string | null;
  location: string | null;
  isRecurring: boolean;
  createdAt: Date;
  updatedAt: Date;
  therapistId: string;
  clientId: string;
  client?: Client;
  sessionNote?: SessionNote;
  payment?: Payment;
  recordings?: Recording[];
}

export type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type SessionType = 'IN_PERSON' | 'ONLINE' | 'PHONE';

export interface SessionNote {
  id: string;
  content: string;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
  sessionId: string;
}

export interface Recording {
  id: string;
  audioUrl: string;
  durationSeconds: number;
  type: RecordingType;
  status: RecordingStatus;
  createdAt: Date;
  updatedAt: Date;
  clientId: string | null;
  sessionId: string | null;
  transcription?: Transcription;
}

export type RecordingType = 'INTAKE' | 'SESSION';
export type RecordingStatus = 'PENDING' | 'TRANSCRIBING' | 'TRANSCRIBED' | 'ANALYZED' | 'ERROR';

export interface Transcription {
  id: string;
  content: string;
  language: string;
  confidence: number | null;
  timestamps: TranscriptSegment[] | null;
  createdAt: Date;
  updatedAt: Date;
  recordingId: string;
  analysis?: Analysis;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface Analysis {
  id: string;
  summary: string;
  keyTopics: string[] | null;
  emotionalMarkers: EmotionalMarker[] | null;
  recommendations: string[] | null;
  nextSessionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  transcriptionId: string;
}

export interface EmotionalMarker {
  emotion: string;
  intensity: 'low' | 'medium' | 'high';
  context: string;
}

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  receiptUrl: string | null;
  notes: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  clientId: string;
  sessionId: string | null;
}

export type PaymentMethod = 'CASH' | 'CREDIT_CARD' | 'BANK_TRANSFER' | 'CHECK' | 'OTHER';
export type PaymentStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED';

export interface Document {
  id: string;
  name: string;
  type: DocumentType;
  fileUrl: string;
  signed: boolean;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  therapistId: string;
  clientId: string | null;
}

export type DocumentType = 'CONSENT_FORM' | 'INTAKE_FORM' | 'TREATMENT_PLAN' | 'REPORT' | 'OTHER';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  status: NotificationStatus;
  scheduledFor: Date | null;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
  userId: string;
}

export type NotificationType = 'MORNING_SUMMARY' | 'EVENING_SUMMARY' | 'PENDING_TASKS' | 'PAYMENT_REMINDER' | 'SESSION_REMINDER' | 'EMAIL_SENT' | 'CANCELLATION_REQUEST' | 'CUSTOM';
export type NotificationStatus = 'PENDING' | 'SENT' | 'READ' | 'DISMISSED';

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: Date | null;
  relatedEntityId: string | null;
  relatedEntity: string | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

export type TaskType = 'WRITE_SUMMARY' | 'COLLECT_PAYMENT' | 'SIGN_DOCUMENT' | 'SCHEDULE_SESSION' | 'REVIEW_TRANSCRIPTION' | 'FOLLOW_UP' | 'CUSTOM';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

// Form types
export interface ClientFormData {
  name: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  address?: string;
  notes?: string;
}

export interface SessionFormData {
  clientId: string;
  startTime: string;
  endTime: string;
  type: SessionType;
  price: number;
  location?: string;
  notes?: string;
  isRecurring?: boolean;
}

// Calendar event type for FullCalendar
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps?: {
    clientId: string;
    clientName: string;
    status: SessionStatus;
    type: SessionType;
  };
}

// Dashboard statistics
export interface DashboardStats {
  totalClients: number;
  activeClients: number;
  sessionsThisWeek: number;
  sessionsThisMonth: number;
  pendingPayments: number;
  pendingTasks: number;
  upcomingToday: TherapySession[];
  recentRecordings: Recording[];
}













