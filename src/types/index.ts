export type Classification = 'standard' | 'shinui';

export type BuildingId = 'A1' | 'A2' | 'A3';

export interface User {
  id: string;
  name: string;
  role: string;
  code: string;
  active: boolean;
  createdAt: string;
}

export interface Building {
  id: BuildingId;
  name: string;
  displayOrder: number;
}

export interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
  active: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface StageNote {
  id: string;
  apartmentId: string;
  stageId: string;
  noteText: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
}

export interface Apartment {
  id: string;
  buildingId: BuildingId;
  apartmentNumber: string;
  displayName: string;
  floor: number;
  colPosition: number;  // 1-4 within the 4-col building grid
  colSpan: number;      // 1 = single col, 2 = spans left or right half
  isDuplexApt: boolean; // true for apts 55-56 (shown on 2 floors)
  currentStageId: string | null;
  classification: Classification;
  shinuiDetails: null; // kept for data compat, form removed from UI
  generalNotes: string;
  isUnnamed: boolean;
  mergedWith?: string; // id of partner apartment when buyer physically connected two units
  stageDates?: Record<string, string>; // stageId → ISO timestamp of when that stage was first set
  driveLink?: string; // Google Drive folder URL for this apartment's files
  plansPdfLink?: string; // Google Drive link to the Engineering Plans PDF
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  buildingId: string;
  apartmentId: string;
  apartmentNumber: string;
  actionType: string;
  fieldChanged: string;
  previousValue: string;
  newValue: string;
  stageId: string;
  createdAt: string;
}

export interface AppSettings {
  loginCodes: { code: string; userId: string }[];
}

// ─── Contractors ───────────────────────────────────────────────────────────────

export type ContractorCategory = 'drywall' | 'ac' | 'general';

export interface Contractor {
  id: string;
  name: string;
  email: string;
  category: ContractorCategory;
  token: string; // 24-char random alphanumeric — used in shareable /c/:token URL
  active: boolean;
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  filename: string;
  mimeType: string;
  dataUrl: string;       // base64 preview (empty when driveFileId is set)
  driveFileId?: string;  // Google Drive file ID after upload
  driveUrl?: string;     // Google Drive web view link
}

export interface ContractorAssignment {
  id: string;
  contractorId: string;
  apartmentId: string;
  buildingId: BuildingId;
  taskDescription: string;
  dueDate: string | null;      // ISO date string (YYYY-MM-DD)
  stageId: string | null;      // links to a Stage
  completedAt: string | null;  // null = pending
  createdAt: string;
  createdBy: string;
  createdByName: string;
  attachments?: TaskAttachment[];
}

export interface ContractorNote {
  id: string;
  assignmentId: string;
  apartmentId: string;
  contractorId: string;
  text: string;
  authorType: 'contractor' | 'office';
  authorId: string;
  authorName: string;
  createdAt: string;
  attachmentDataUrl?: string;
  attachmentFilename?: string;
  attachmentMimeType?: string;
}

export interface DataSummary {
  apartments: number;
  stages: number;
  contractors: number;
  tasks: number;
  completedTasks: number;
  photos: number;
  notes: number;
  activityLogs: number;
}

export interface BackupSnapshot {
  id: string;
  activityLogId: string;
  createdAt: string;
  label: string;
  apartmentStates: {
    id: string;
    currentStageId: string | null;
    classification: string;
    generalNotes: string;
    driveLink?: string;
    plansPdfLink?: string;
    displayName: string;
    mergedWith?: string;
  }[];
  stageNotes: StageNote[];
  contractorAssignments: ContractorAssignment[];
}

export interface ContractorPhoto {
  id: string;
  assignmentId: string;
  apartmentId: string;
  contractorId: string;
  dataUrl: string;       // base64 fallback — empty when storageUrl or driveUrl is set
  filename: string;
  fileType?: 'image' | 'video' | 'file'; // default: 'image' (for backward compat)
  mimeType?: string;
  uploadedAt: string;
  fileSizeBytes?: number;  // original file size for quota tracking
  storageUrl?: string;     // Firebase Storage download URL (primary remote store)
  storagePath?: string;    // Firebase Storage path (needed for deletion)
  driveFileId?: string;    // Google Drive file ID (legacy/fallback)
  driveUrl?: string;       // Google Drive web view link (legacy/fallback)
}

export interface OfficeNoteFile {
  id: string;
  apartmentId: string;
  dataUrl: string;       // base64 (empty when driveFileId is set)
  filename: string;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  uploadedByName: string;
  driveFileId?: string;
  driveUrl?: string;
}

export type BackupFrequency = 'activity' | 'daily' | 'weekly' | 'monthly';

export interface BackupLogEntry {
  id: string;
  filename: string;
  sizeKB: number;
  driveUploaded: boolean;
  triggeredBy: 'manual' | 'scheduled';
  createdAt: string;
}

export interface ContractorUiStrings {
  isRtl: boolean;
  linkNotFound: string;
  linkInvalid: string;
  myTasks: string;
  buildingMap: string;
  noAssignments: string;
  noAssignmentsHint: string;
  filterAll: string;
  filterOverdue: string;
  filterToday: string;
  filterTomorrow: string;
  filterThisWeek: string;
  mapHint: string;
  sectionTask: string;
  fromOffice: string;
  engineeringPlans: string;
  completed: string;
  undo: string;
  filesAndPhotos: string;
  uploading: string;
  addFile: string;
  tapToAddMedia: string;
  requiredBeforeComplete: string;
  sectionNotes: string;
  yourNotes: string;
  addNote: string;
  addMediaBeforeComplete: string;
  markCompletePrompt: string;
  markCompleteHint: string;
  cancel: string;
  confirmComplete: string;
  markingComplete: string;
  markAsComplete: string;
  noApartmentsAssigned: string;
  tapToExpand: string;
  viewOnDrive: string;
  hide: string;
  view: string;
  download: string;
  taskSingular: string;
  taskPlural: string;
  doneLabel: string;
  duePrefix: string;
}

export const DEFAULT_CONTRACTOR_UI_STRINGS: ContractorUiStrings = {
  isRtl: false,
  linkNotFound: 'Link not found',
  linkInvalid: 'This link is invalid or has been deactivated. Contact your project manager.',
  myTasks: 'My Tasks',
  buildingMap: 'Building Map',
  noAssignments: 'No assignments yet',
  noAssignmentsHint: 'Your project manager will assign tasks here.',
  filterAll: 'All',
  filterOverdue: 'Overdue',
  filterToday: 'Today',
  filterTomorrow: 'Tomorrow',
  filterThisWeek: 'This Week',
  mapHint: 'Highlighted apartments are your assignments. Tap to open task.',
  sectionTask: 'Task',
  fromOffice: 'From Office',
  engineeringPlans: 'Engineering Plans',
  completed: 'Completed',
  undo: 'Undo',
  filesAndPhotos: 'Files & Photos',
  uploading: 'Uploading…',
  addFile: 'Add File',
  tapToAddMedia: 'Tap to add photos, videos, or files',
  requiredBeforeComplete: 'Required before marking complete',
  sectionNotes: 'Notes',
  yourNotes: 'Your Notes',
  addNote: 'Add a note…',
  addMediaBeforeComplete: 'Add at least one photo or file to mark this task complete.',
  markCompletePrompt: 'Mark this task as complete?',
  markCompleteHint: 'This will notify the office. You can undo afterwards.',
  cancel: 'Cancel',
  confirmComplete: 'Confirm Complete',
  markingComplete: 'Marking complete…',
  markAsComplete: 'Mark as Complete',
  noApartmentsAssigned: 'No apartments assigned yet.',
  tapToExpand: 'Tap to expand',
  viewOnDrive: 'View on Drive',
  hide: 'Hide',
  view: 'View',
  download: 'Download',
  taskSingular: 'task',
  taskPlural: 'tasks',
  doneLabel: 'done',
  duePrefix: 'Due',
};

export const HEBREW_CONTRACTOR_UI_STRINGS: ContractorUiStrings = {
  isRtl: true,
  linkNotFound: 'הקישור לא נמצא',
  linkInvalid: 'קישור זה אינו תקין או שהושבת. פנו למנהל הפרויקט.',
  myTasks: 'המשימות שלי',
  buildingMap: 'מפת הבניין',
  noAssignments: 'אין משימות עדיין',
  noAssignmentsHint: 'מנהל הפרויקט שלך יקצה משימות כאן.',
  filterAll: 'הכל',
  filterOverdue: 'באיחור',
  filterToday: 'היום',
  filterTomorrow: 'מחר',
  filterThisWeek: 'השבוע',
  mapHint: 'הדירות המודגשות הן המשימות שלך. הקש לפתיחה.',
  sectionTask: 'משימה',
  fromOffice: 'מהמשרד',
  engineeringPlans: 'תוכניות הנדסיות',
  completed: 'הושלם',
  undo: 'בטל',
  filesAndPhotos: 'קבצים ותמונות',
  uploading: 'מעלה...',
  addFile: 'הוסף קובץ',
  tapToAddMedia: 'הקש להוסיף תמונות, סרטונים או קבצים',
  requiredBeforeComplete: 'נדרש לפני סימון כהושלם',
  sectionNotes: 'הערות',
  yourNotes: 'ההערות שלך',
  addNote: 'הוסף הערה...',
  addMediaBeforeComplete: 'הוסף לפחות תמונה או קובץ אחד לפני סימון המשימה כהושלמה.',
  markCompletePrompt: 'לסמן משימה זו כהושלמה?',
  markCompleteHint: 'פעולה זו תודיע למשרד. ניתן לבטל לאחר מכן.',
  cancel: 'ביטול',
  confirmComplete: 'אישור הושלם',
  markingComplete: 'מסמן כהושלם...',
  markAsComplete: 'סמן כהושלם',
  noApartmentsAssigned: 'לא הוקצו דירות עדיין.',
  tapToExpand: 'הקש להרחיב',
  viewOnDrive: 'הצג ב-Drive',
  hide: 'הסתר',
  view: 'הצג',
  download: 'הורד',
  taskSingular: 'משימה',
  taskPlural: 'משימות',
  doneLabel: 'הושלם',
  duePrefix: 'תאריך יעד',
};
