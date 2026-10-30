export type Role = "owner" | "support" | "viewer";

export type PersonStatus = "active" | "blocked" | "invited";

export type Device = { label: string; lastUsedAt: number };

export type Person = {
  id: string;
  name: string;
  phone: string;
  timeZone: string;
  status: PersonStatus;
  verifiedAt: number | null;
  lastSeenAt: number | null;
  rotaAllowed: boolean;
  whatsappNotes: boolean;
  devices: Device[];
  adminNote: string;
};

export type KhatmaKind = "pool" | "rota";
export type KhatmaStatus = "active" | "paused" | "archived";
export type MemberStatus = "active" | "blocked" | "former";

export type KhatmaMember = {
  personId: string;
  status: MemberStatus;
  joinedAt: number;
  /** A rotating khatma participant who never signed in: their number stays hidden. */
  phoneHidden?: boolean;
};

export type RotaParticipant = {
  id: string;
  name: string;
  phone: string;
  /** Null for someone who reads on WhatsApp without a Wirdak account. */
  personId: string | null;
  joinedAt: number | null;
  stoppedAt: number | null;
  silencedAt: number | null;
  silentDays: number;
  /** Imported from a pool khatma: the organizer never sees this number. */
  phoneHidden?: boolean;
};

export type RotaRead = {
  juz: number;
  holderId: string | null;
  readerId: string | null;
  doneAt: number | null;
  doneByOrganizer: boolean;
  reassigned: boolean;
  notYet: boolean;
};

export type RotaMessages = {
  dayAt: number;
  reminder: { at: number; on: boolean };
  unread: { at: number; on: boolean };
  summary: { at: number; on: boolean };
};

export type RotaState = {
  number: number;
  cycle: number;
  /** Who owns each of the 30 slots, in slot order. */
  slots: (string | null)[];
  participants: RotaParticipant[];
  today: RotaRead[];
  joinRequests: { id: string; name: string | null; phone: string; at: number }[];
  joinCode: string;
  daysLabel: string;
  firstDate: string;
  endDate: string | null;
  timeZone: string;
  messages: RotaMessages;
  pausedAt: number | null;
  pauseDates: string[];
  setupDone: boolean;
  /** An admin set it up for someone who hasn't joined yet. */
  pendingOrganizer: boolean;
};

export type Khatma = {
  id: string;
  name: string;
  kind: KhatmaKind;
  status: KhatmaStatus;
  organizerId: string;
  inviteCode: string;
  schedule: string;
  completed: number;
  createdAt: number;
  members: KhatmaMember[];
  rota?: RotaState;
};

export type HelpStatus = "open" | "answered" | "closed";

export type HelpMessage = {
  id: string;
  from: "person" | "team";
  text: string;
  at: number;
  attachment?: "screenshot" | "voice";
};

export type HelpRequest = {
  id: string;
  personId: string | null;
  visitorName: string | null;
  khatmaId: string | null;
  status: HelpStatus;
  createdAt: number;
  lastMessageAt: number;
  context: { path: string; appVersion: string; device: string };
  messages: HelpMessage[];
};

export type WaStatus = "delivered" | "read" | "failed" | "skipped";

export type WaMessage = {
  id: string;
  personId: string;
  khatmaId: string | null;
  template: string;
  status: WaStatus;
  reason: string | null;
  at: number;
};

export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  targetKind: "person" | "khatma" | "help" | "setting" | "admin" | "phone";
  targetId: string;
  targetLabel: string;
  before: string | null;
  after: string | null;
  note: string | null;
  at: number;
  /** Set when the change came through the assistant or Claude (MCP). */
  via?: "agent" | "mcp";
};

export type Admin = {
  id: string;
  name: string;
  phone: string;
  role: Role;
  addedAt: number;
  lastActiveAt: number;
  notifyHelp: boolean;
  notifySummary: boolean;
  notifyMilestones: boolean;
};

export type SettingGroup = "switches" | "pace" | "notifications" | "help" | "limits" | "sessions" | "rota";

export type SettingSpec = {
  group: SettingGroup;
  kind: "int" | "number" | "duration" | "hour" | "time" | "bool" | "text" | "version" | "grace";
  min?: number;
  max?: number;
  maxLength?: number;
};

export type GraceMap = Record<string, { value: number; unit: "minutes" | "hours" | "days" }>;
export type SettingValue = boolean | number | string | null | GraceMap;

export type Setting = {
  key: string;
  group: SettingGroup;
  section: string;
  sectionLabel: string;
  label: string;
  what: string;
  why: string;
  spec: SettingSpec;
  value: SettingValue;
  defaultValue: SettingValue;
};

export type Reading = {
  id: string;
  personId: string;
  khatmaId: string;
  juz: number;
  status: "reading" | "finished" | "released";
  takenAt: number;
  finishedAt: number | null;
};

export type DayStat = {
  day: number;
  ajza: number;
  members: number;
  khatmas: number;
};

export type Db = {
  people: Person[];
  khatmas: Khatma[];
  help: HelpRequest[];
  messages: WaMessage[];
  reading: Reading[];
  audit: AuditEntry[];
  admins: Admin[];
  settings: Setting[];
  stats: DayStat[];
  /** Tools the owner turned off for the assistant and Claude. */
  disabledTools: string[];
};

export type Route =
  | { page: "overview" | "people" | "khatmas" | "messages" | "team" | "agent" }
  | { page: "settings"; key?: string }
  | { page: "audit"; id?: string }
  | { page: "help"; id?: string }
  | { page: "person"; id: string }
  | { page: "khatma"; id: string };
