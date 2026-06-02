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
  nameHe?: string;  // Hebrew name for bilingual support
  color: string;
  order: number;
  active: boolean;
  description?: string; // kept for data compat; no longer shown in UI
  createdAt: string;
  updatedAt: string;
}

export function getStageName(stage: Stage, isRtl: boolean): string {
  return (isRtl && stage.nameHe) ? stage.nameHe : stage.name;
}

export interface StageNoteAttachment {
  id: string;
  filename: string;
  mimeType: string;
  dataUrl?: string;
  driveFileId?: string;
  driveUrl?: string;
}

export interface StageNoteVersion {
  id: string;
  noteId: string;
  noteText: string;
  attachments?: StageNoteAttachment[];
  savedAt: string;
  savedBy: string;
  savedByName: string;
}

export interface StageNote {
  id: string;
  apartmentId: string;
  stageId: string;
  noteText: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
  // Legacy single-attachment fields (kept for backward compat read)
  attachmentFilename?: string;
  attachmentMimeType?: string;
  attachmentDataUrl?: string;
  attachmentDriveFileId?: string;
  attachmentDriveUrl?: string;
  // Multi-attachment support
  attachments?: StageNoteAttachment[];
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

export type TaskPriority = 'urgent' | 'normal' | 'low';

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
  priority?: TaskPriority;     // 'urgent' | 'normal' | 'low'
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
  attachmentDriveFileId?: string;  // Drive file ID for note attachments uploaded to Drive
  attachmentDriveUrl?: string;     // Drive web view link
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
  contractors?: Contractor[];
  contractorNotes?: ContractorNote[];
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

export type DriveExportFrequency = 'off' | 'hourly' | 'every5h' | 'every12h' | 'daily' | 'weekly';

export interface GeneralNoteVersion {
  id: string;
  apartmentId: string;
  noteText: string;
  savedAt: string;
  savedBy: string;
  savedByName: string;
}

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
  filterYesterday: string;
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
  filterYesterday: 'Yesterday',
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
  filterYesterday: 'אתמול',
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

// ─── Main Admin UI Strings ────────────────────────────────────────────────────

export interface MainUiStrings {
  isRtl: boolean;
  // Sidebar navigation
  navProject: string;
  navDashboard: string;
  navTasks: string;
  navAnalytics: string;
  navReports: string;
  navActivity: string;
  navSettings: string;
  // Page titles
  pageDashboard: string;
  pageProject: string;
  pageTasks: string;
  pageAnalytics: string;
  pageReports: string;
  pageActivity: string;
  pageSettings: string;
  // Dashboard
  totalUnits: string;
  notStarted: string;
  changes: string;
  withNotes: string;
  progressByStage: string;
  progressByBuilding: string;
  recentActivity: string;
  // Apartment drawer tabs
  tabDetails: string;
  tabTasks: string;
  tabNotes: string;
  tabHistory: string;
  tabPhotos: string;
  // Common actions
  save: string;
  cancel: string;
  add: string;
  delete: string;
  edit: string;
  // Settings tabs
  settingsStages: string;
  settingsUsers: string;
  settingsContractors: string;
  settingsApp: string;
  settingsLanguage: string;
  // Misc
  noActivity: string;
  noTasks: string;
  addTask: string;
  allContractors: string;
  selectContractor: string;
  selectApartment: string;
  stageOptional: string;
  taskDescriptionPlaceholder: string;
  // Common extras
  confirm: string;
  restore: string;
  download: string;
  upload: string;
  print: string;
  search: string;
  clearFilters: string;
  noResults: string;
  never: string;
  yes: string;
  no: string;
  all: string;
  off: string;
  overdue: string;
  today: string;
  tomorrow: string;
  daysLabel: string;
  urgentPriority: string;
  normalPriority: string;
  lowPriority: string;
  aptPrefix: string;
  floorPrefix: string;
  buildingPrefix: string;
  standard: string;
  notStartedOption: string;
  // Header
  syncSaving: string;
  syncSaved: string;
  searchTooltip: string;
  switchToDark: string;
  switchToLight: string;
  signOut: string;
  // Dashboard extras
  overdueTasks: string;
  pendingTasks: string;
  completedToday: string;
  overallStarted: string;
  changesUnits: string;
  unitsStarted: string;
  // Project Diagram
  searchApt: string;
  selectStagePlaceholder: string;
  applyTo: string;
  bulkSelected: string;
  bulkUnits: string;
  bulkNotStarted: string;
  inBulkMode: string;
  // Tasks Page
  newTask: string;
  bulkAdd: string;
  allStages: string;
  allPriorities: string;
  overdueOnly: string;
  dueFrom: string;
  dueTo: string;
  markComplete: string;
  markIncomplete: string;
  editTask: string;
  deleteTask: string;
  deleteTaskConfirm: string;
  taskDeleted: string;
  taskUpdated: string;
  noPriorityLabel: string;
  // Analytics
  totalApartments: string;
  residentialUnits: string;
  workStarted: string;
  notYetStarted: string;
  contractorsLabel: string;
  totalAssignments: string;
  tasksCompletedLabel: string;
  pendingLabel: string;
  completedLabel: string;
  stageCompletionsWeek: string;
  tasksCompletedWeek: string;
  contractorTasksSection: string;
  noContractorAssignments: string;
  // Activity Log
  activityLogPage: string;
  entriesLabel: string;
  userFilter: string;
  allUsers: string;
  actionTypeFilter: string;
  fromDate: string;
  toDate: string;
  allActions: string;
  stageFieldChange: string;
  noteAction: string;
  taskCreatedAction: string;
  taskCompletedAction: string;
  taskReopenedAction: string;
  taskDeletedAction: string;
  contractorUploadAction: string;
  contractorNoteAction: string;
  contractorCompletedAction: string;
  noLogsMatch: string;
  // Reports
  reportsPage: string;
  exportCsv: string;
  selectExportColumns: string;
  stageNotesColumns: string;
  requiredLabel: string;
  includeTasks: string;
  includeTasksHint: string;
  filtersSection: string;
  searchApartment: string;
  enterButton: string;
  classificationFilter: string;
  includeNotStarted: string;
  lastUpdatedFrom: string;
  clearDates: string;
  stagesEmptyAll: string;
  showingLabel: string;
  apartmentsLabel: string;
  unnamed: string;
  groundFloor: string;
  noApartmentsMatch: string;
  doneSuffix: string;
  // Settings Page
  pickColor: string;
  addNewStage: string;
  stageName: string;
  addNewUser: string;
  nameField: string;
  roleField: string;
  codeField: string;
  addNewContractor: string;
  fullNameField: string;
  emailField: string;
  copyLink: string;
  copied: string;
  noContractors: string;
  firebaseConnection: string;
  allSystemsGo: string;
  connectionIssue: string;
  runTest: string;
  runAgain: string;
  runningTests: string;
  forceSync: string;
  forceSyncUploading: string;
  forceSyncDone: string;
  forceSyncFailed: string;
  displayTheme: string;
  dark: string;
  light: string;
  activeLabel: string;
  hiddenLabel: string;
  accessCodes: string;
  accessCodesHint: string;
  enableAutoSnapshots: string;
  snapshotHint: string;
  snapshotHistoryLabel: string;
  noSnapshotsYet: string;
  confirmButton: string;
  driveFolderUrl: string;
  autoExportFreq: string;
  lastExport: string;
  exportNow: string;
  exportingLabel: string;
  manualBackup: string;
  manualBackupDesc: string;
  exportJson: string;
  importJson: string;
  exportLogLabel: string;
  moveUp: string;
  moveDown: string;
  changeColor: string;
  saveChanges: string;
  deleteStageTooltip: string;
  hideStage: string;
  activateStage: string;
  // Apartment Drawer
  familyName: string;
  familyNamePlaceholder: string;
  typeField: string;
  standardApt: string;
  hasModifications: string;
  currentStage: string;
  generalNotes: string;
  generalNotesPlaceholder: string;
  attachFiles: string;
  noteHistory: string;
  engineeringPlans: string;
  detecting: string;
  refreshButton: string;
  clickToExpand: string;
  fullView: string;
  lookingForPdf: string;
  noPdfFound: string;
  setPdfHint: string;
  saveChangesBtn: string;
  driveFolder: string;
  connectedUnit: string;
  linkedToApt: string;
  noConnection: string;
  linkMutualHint: string;
  noTasksAssigned: string;
  noPhotosYet: string;
  photosDesc: string;
  noDriveLinked: string;
  setDriveFolderHint: string;
  driveBackendNotConfigured: string;
  loadingPhotos: string;
  stageChangedModal: string;
  assignTaskQuestion: string;
  noJustSave: string;
  assignTaskBtn: string;
  unlinkApartments: string;
  unmergeQuestion: string;
  keepsData: string;
  stageWillBeCleared: string;
  bothKeepData: string;
  justRemovesLink: string;
  apartmentSaved: string;
  apartmentUnlinked: string;
  cannotMergeBldgs: string;
  alreadyMergedError: string;
  imageUnavailable: string;
  openDownload: string;
  // Stage Notes
  officeNotes: string;
  officeNotesFor: string;
  noteLabel: string;
  fileLabel: string;
  filesLabel: string;
  assignContractor: string;
  stageReached: string;
  editHistory: string;
  allContractorNotes: string;
  contractorNotesSection: string;
  attachFile: string;
  // Quick Add / Bulk Add
  pendingBadge: string;
  hideDone: string;
  driveWarning: string;
  createTask: string;
  selectAll: string;
  deselectAll: string;
  inView: string;
  normalDefault: string;
  keepAsData: string;
  keepAsDataDesc: string;
  eachAptDrive: string;
  eachAptDriveDesc: string;
  oneAptDrive: string;
  oneAptDriveDesc: string;
  driveMissingWarning: string;
  noDriveLink2: string;
  noEligibleApts: string;
  goBack: string;
  proceedAnyway: string;
  uploadToSelected: string;
  driveLinkedBadge: string;
  // Activity Section
  updatedStageNote: string;
  uploadedFile: string;
  addedNote: string;
  markedComplete: string;
  changedStage: string;
  changedClassification: string;
  updatedGeneralNotes: string;
  renamedApartment: string;
  noActivityYet2: string;
  revertConfirm: string;
  // Building Diagram
  groundCommercial: string;
  lobby: string;
  doneIndicator: string;
  // Login
  enterCode: string;
  pleaseEnterDigits: string;
  invalidCode: string;
  enterProject: string;
  footerText: string;
  // Settings Language tab chrome
  rtlLayoutLabel: string;
  rtlLayoutHint: string;
  langSearchPlaceholder: string;
  langFieldsMatch: string;
  langNoMatch: string;
  adminUiLangSection: string;
  contractorLangSection: string;
  saveAdminLang: string;
  saveLang: string;
  // Settings App chrome
  driveFolderSave: string;
  firebaseDesc: string;
  forcePushDesc: string;
}

export const DEFAULT_MAIN_UI_STRINGS: MainUiStrings = {
  isRtl: false,
  navProject: 'Project',
  navDashboard: 'Dashboard',
  navTasks: 'Tasks',
  navAnalytics: 'Analytics',
  navReports: 'Reports',
  navActivity: 'Activity',
  navSettings: 'Settings',
  pageDashboard: 'Project Dashboard',
  pageProject: 'Project Diagram',
  pageTasks: 'Tasks',
  pageAnalytics: 'Analytics',
  pageReports: 'Reports',
  pageActivity: 'Activity Log',
  pageSettings: 'Settings',
  totalUnits: 'Total Units',
  notStarted: 'Not Started',
  changes: 'Changes',
  withNotes: 'With Notes',
  progressByStage: 'Progress by Stage',
  progressByBuilding: 'Progress by Building',
  recentActivity: 'Recent Activity',
  tabDetails: 'Details',
  tabTasks: 'Tasks',
  tabNotes: 'Notes',
  tabHistory: 'History',
  tabPhotos: 'Photos',
  save: 'Save',
  cancel: 'Cancel',
  add: 'Add',
  delete: 'Delete',
  edit: 'Edit',
  settingsStages: 'Stages',
  settingsUsers: 'Users',
  settingsContractors: 'Contractors',
  settingsApp: 'App',
  settingsLanguage: 'Language',
  noActivity: 'No recent activity.',
  noTasks: 'No tasks yet. Add a task to get started.',
  addTask: 'Add Task',
  allContractors: 'All contractors',
  selectContractor: 'Select contractor *',
  selectApartment: 'Select apartment *',
  stageOptional: 'Stage (optional)',
  taskDescriptionPlaceholder: 'Task description *',
  // Common extras
  confirm: 'Confirm',
  restore: 'Restore',
  download: 'Download',
  upload: 'Upload',
  print: 'Print',
  search: 'Search',
  clearFilters: 'Clear filters',
  noResults: 'No results',
  never: 'Never',
  yes: 'Yes',
  no: 'No',
  all: 'All',
  off: 'Off',
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  daysLabel: 'days',
  urgentPriority: '🔴 Urgent',
  normalPriority: '⚪ Normal',
  lowPriority: '🟢 Low',
  aptPrefix: 'Apt',
  floorPrefix: 'Floor',
  buildingPrefix: 'Building',
  standard: 'Standard',
  notStartedOption: '— Not Started —',
  // Header
  syncSaving: 'Saving…',
  syncSaved: 'Saved ✓',
  searchTooltip: 'Search (⌘K)',
  switchToDark: 'Switch to dark theme',
  switchToLight: 'Switch to light theme',
  signOut: 'Sign out',
  // Dashboard extras
  overdueTasks: 'Overdue Tasks',
  pendingTasks: 'Pending Tasks',
  completedToday: 'Completed Today',
  overallStarted: 'Overall started',
  changesUnits: 'Changes units',
  unitsStarted: 'units started',
  // Project Diagram
  searchApt: 'Search apt...',
  selectStagePlaceholder: 'Select stage…',
  applyTo: 'Apply to',
  bulkSelected: 'selected — click apartments to select',
  bulkUnits: 'units',
  bulkNotStarted: 'not started',
  inBulkMode: 'in bulk mode',
  // Tasks Page
  newTask: 'New Task',
  bulkAdd: 'Bulk Add',
  allStages: 'All stages',
  allPriorities: 'All priorities',
  overdueOnly: 'Overdue only',
  dueFrom: 'Due from',
  dueTo: 'Due to',
  markComplete: 'Mark as complete',
  markIncomplete: 'Mark as incomplete',
  editTask: 'Edit task',
  deleteTask: 'Delete task',
  deleteTaskConfirm: 'Delete this task?',
  taskDeleted: 'Task deleted',
  taskUpdated: 'Task updated',
  noPriorityLabel: 'Priority (optional)',
  // Analytics
  totalApartments: 'Total Apartments',
  residentialUnits: 'Residential units',
  workStarted: 'Work Started',
  notYetStarted: 'not yet started',
  contractorsLabel: 'Contractors',
  totalAssignments: 'total assignments',
  tasksCompletedLabel: 'Tasks Completed',
  pendingLabel: 'Pending',
  completedLabel: 'Completed',
  stageCompletionsWeek: 'Stage Completions / Week',
  tasksCompletedWeek: 'Tasks Completed / Week',
  contractorTasksSection: 'Contractor Tasks',
  noContractorAssignments: 'No contractor assignments yet.',
  // Activity Log
  activityLogPage: 'Activity Log',
  entriesLabel: 'entries',
  userFilter: 'User',
  allUsers: 'All users',
  actionTypeFilter: 'Action type',
  fromDate: 'From',
  toDate: 'To',
  allActions: 'All actions',
  stageFieldChange: 'Stage/field change',
  noteAction: 'Note',
  taskCreatedAction: 'Task created',
  taskCompletedAction: 'Task completed',
  taskReopenedAction: 'Task re-opened',
  taskDeletedAction: 'Task deleted',
  contractorUploadAction: 'Contractor upload',
  contractorNoteAction: 'Contractor note',
  contractorCompletedAction: 'Contractor completed',
  noLogsMatch: 'No activity logs match current filters',
  // Reports
  reportsPage: 'Reports',
  exportCsv: 'Export CSV',
  selectExportColumns: 'Select Export Columns',
  stageNotesColumns: 'Stage Notes Columns',
  requiredLabel: '(required)',
  includeTasks: 'Include Tasks',
  includeTasksHint: '(adds Task 1–N columns: description, contractor, stage, due date, status, completion date)',
  filtersSection: 'Filters',
  searchApartment: 'Search apartment…',
  enterButton: 'Enter',
  classificationFilter: 'Classification',
  includeNotStarted: 'Include Not Started',
  lastUpdatedFrom: 'Last Updated — From',
  clearDates: 'Clear dates',
  stagesEmptyAll: 'Stages (empty = all)',
  showingLabel: 'Showing',
  apartmentsLabel: 'apartments',
  unnamed: 'Unnamed',
  groundFloor: 'G',
  noApartmentsMatch: 'No apartments match the current filters',
  doneSuffix: 'done',
  // Settings Page
  pickColor: 'Pick a color:',
  addNewStage: 'Add New Stage',
  stageName: 'Stage name...',
  addNewUser: 'Add New User',
  nameField: 'Name *',
  roleField: 'Role',
  codeField: '6-digit code *',
  addNewContractor: 'Add New Contractor',
  fullNameField: 'Full name *',
  emailField: 'Email address',
  copyLink: 'Copy link',
  copied: 'Copied!',
  noContractors: 'No contractors in this category.',
  firebaseConnection: 'Firebase Connection',
  allSystemsGo: 'All systems go',
  connectionIssue: 'Connection issue',
  runTest: 'Run Connection Test',
  runAgain: 'Run Again',
  runningTests: 'Running tests…',
  forceSync: 'Force Push Local → Cloud',
  forceSyncUploading: 'Uploading…',
  forceSyncDone: 'Pushed successfully',
  forceSyncFailed: 'Push failed — check console',
  displayTheme: 'Display Theme',
  dark: 'Dark',
  light: 'Light',
  activeLabel: 'Active',
  hiddenLabel: 'Hidden',
  accessCodes: 'Access Codes',
  accessCodesHint: 'Edit codes in the Users tab. Changes take effect on next login.',
  enableAutoSnapshots: 'Enable auto-snapshots',
  snapshotHint: 'Saves a restore point when data changes',
  snapshotHistoryLabel: 'Snapshot History',
  noSnapshotsYet: 'No snapshots yet — enable auto-snapshots to start saving restore points.',
  confirmButton: 'Confirm',
  driveFolderUrl: 'Drive folder URL',
  autoExportFreq: 'Auto-export frequency',
  lastExport: 'Last export:',
  exportNow: 'Export Now',
  exportingLabel: 'Exporting…',
  manualBackup: 'Manual Backup',
  manualBackupDesc: 'Export all data to a JSON file — apartments, stages, notes, contractors, photos, settings. Import to fully restore.',
  exportJson: 'Export JSON',
  importJson: 'Import JSON',
  exportLogLabel: 'Export Log',
  moveUp: 'Move up',
  moveDown: 'Move down',
  changeColor: 'Change color',
  saveChanges: 'Save changes',
  deleteStageTooltip: 'Delete stage',
  hideStage: 'Click to hide stage',
  activateStage: 'Click to activate stage',
  // Apartment Drawer
  familyName: 'Family Name',
  familyNamePlaceholder: 'Family name…',
  typeField: 'Type',
  standardApt: 'Standard apartment',
  hasModifications: 'Has modifications (Shinui)',
  currentStage: 'Current Stage',
  generalNotes: 'General Notes',
  generalNotesPlaceholder: 'General notes about this apartment…',
  attachFiles: 'Attach files to office notes',
  noteHistory: 'Note History',
  engineeringPlans: 'Engineering Plans',
  detecting: 'Detecting…',
  refreshButton: 'Refresh',
  clickToExpand: 'Click to expand',
  fullView: 'Full View',
  lookingForPdf: 'Looking for Plans PDF in Drive…',
  noPdfFound: 'No Plans PDF found. Click Refresh to retry, or set Drive folder below.',
  setPdfHint: 'Set the Drive folder in Settings below to auto-detect Plans PDF.',
  saveChangesBtn: 'Save Changes',
  driveFolder: 'Google Drive Folder',
  connectedUnit: 'Connected Unit (buyer-merged apartments)',
  linkedToApt: 'Linked to Apt',
  noConnection: '— No connection —',
  linkMutualHint: 'Linking is mutual — both apartments show the connection.',
  noTasksAssigned: 'No tasks assigned to this apartment.',
  noPhotosYet: 'No photos yet',
  photosDesc: 'Photos uploaded by contractors will appear here.',
  noDriveLinked: 'No Drive folder linked',
  setDriveFolderHint: 'Set the Drive folder in Details → Settings to load photos.',
  driveBackendNotConfigured: 'Drive backend not configured',
  loadingPhotos: 'Loading photos from Drive…',
  stageChangedModal: 'Stage Changed',
  assignTaskQuestion: 'Would you like to assign a contractor task for this stage?',
  noJustSave: 'No, just save',
  assignTaskBtn: 'Assign Task',
  unlinkApartments: 'Unlink Apartments',
  unmergeQuestion: 'Which apartment keeps the shared data (stage, drive link)?',
  keepsData: 'keeps the data',
  stageWillBeCleared: 'stage & drive link will be cleared',
  bothKeepData: 'Both keep their current data',
  justRemovesLink: 'Just removes the link — no data is cleared',
  apartmentSaved: 'Apartment details saved',
  apartmentUnlinked: 'Apartment unlinked',
  cannotMergeBldgs: 'Cannot merge apartments from different buildings',
  alreadyMergedError: 'That apartment is already merged with another unit',
  imageUnavailable: 'Image unavailable',
  openDownload: 'Open / Download',
  // Stage Notes
  officeNotes: 'Office Notes',
  officeNotesFor: 'Office notes for',
  noteLabel: 'Note',
  fileLabel: 'file',
  filesLabel: 'files',
  assignContractor: 'Assign Contractor',
  stageReached: 'Stage reached:',
  editHistory: 'Edit History',
  allContractorNotes: 'All Contractor Notes',
  contractorNotesSection: 'Contractor Notes',
  attachFile: 'Attach file',
  // Quick Add / Bulk Add
  pendingBadge: 'pending',
  hideDone: 'Hide done',
  driveWarning: 'Set a Google Drive folder in the Details tab before creating tasks.',
  createTask: 'Create Task',
  selectAll: 'Select all',
  deselectAll: 'Deselect all',
  inView: 'in view',
  normalDefault: 'Normal (default)',
  keepAsData: 'Keep as task data only',
  keepAsDataDesc: 'Files are stored as task attachments locally. No Google Drive upload.',
  eachAptDrive: 'Upload to each apartment\'s Drive',
  eachAptDriveDesc: 'Creates a separate copy in each apartment\'s Photos/Task Notes/ folder. Apartments without a Drive link will keep files locally.',
  oneAptDrive: 'Upload to one specific apartment\'s Drive',
  oneAptDriveDesc: 'You choose which apartment\'s folder to use. Other apartments keep a local copy.',
  driveMissingWarning: 'Drive link missing',
  noDriveLink2: 'No Drive link',
  noEligibleApts: 'No eligible apartments',
  goBack: 'Go back',
  proceedAnyway: 'Proceed anyway',
  uploadToSelected: 'Upload to selected apartment',
  driveLinkedBadge: 'Drive ✓',
  // Activity Section
  updatedStageNote: 'updated stage note',
  uploadedFile: 'uploaded file:',
  addedNote: 'added a note',
  markedComplete: 'marked task complete',
  changedStage: 'changed stage',
  changedClassification: 'changed classification:',
  updatedGeneralNotes: 'updated general notes',
  renamedApartment: 'renamed apartment to "',
  noActivityYet2: 'No activity yet',
  revertConfirm: 'Revert all data to this point?',
  // Building Diagram
  groundCommercial: 'Ground / Commercial',
  lobby: 'Lobby',
  doneIndicator: '✓ Done',
  // Login
  enterCode: 'Enter your access code',
  pleaseEnterDigits: 'Please enter all 6 digits.',
  invalidCode: 'Invalid code. Please try again.',
  enterProject: 'Enter Project',
  footerText: 'TzviAir Internal System',
  // Settings Language tab chrome
  rtlLayoutLabel: 'Right-to-Left (RTL) layout',
  rtlLayoutHint: 'Enable for Hebrew, Arabic, and other RTL languages.',
  langSearchPlaceholder: 'Search language fields…',
  langFieldsMatch: 'fields match',
  langNoMatch: 'No fields match',
  adminUiLangSection: 'Admin UI Language',
  contractorLangSection: 'Contractor Portal Language',
  saveAdminLang: 'Save Admin UI Language',
  saveLang: 'Save Language Settings',
  // Settings App chrome
  driveFolderSave: 'Save',
  firebaseDesc: 'Tests each service one by one — runs a live read/write to confirm Firestore works.',
  forcePushDesc: 'If cloud data looks out of date, push your current local state to overwrite it.',
};

export const HEBREW_MAIN_UI_STRINGS: MainUiStrings = {
  isRtl: true,
  navProject: 'פרויקט',
  navDashboard: 'לוח בקרה',
  navTasks: 'משימות',
  navAnalytics: 'ניתוח',
  navReports: 'דוחות',
  navActivity: 'פעילות',
  navSettings: 'הגדרות',
  pageDashboard: 'לוח בקרה',
  pageProject: 'תרשים הפרויקט',
  pageTasks: 'משימות',
  pageAnalytics: 'ניתוח נתונים',
  pageReports: 'דוחות',
  pageActivity: 'יומן פעילות',
  pageSettings: 'הגדרות',
  totalUnits: 'סה״כ יחידות',
  notStarted: 'טרם התחיל',
  changes: 'שינויים',
  withNotes: 'עם הערות',
  progressByStage: 'התקדמות לפי שלב',
  progressByBuilding: 'התקדמות לפי בניין',
  recentActivity: 'פעילות אחרונה',
  tabDetails: 'פרטים',
  tabTasks: 'משימות',
  tabNotes: 'הערות',
  tabHistory: 'היסטוריה',
  tabPhotos: 'תמונות',
  save: 'שמור',
  cancel: 'ביטול',
  add: 'הוסף',
  delete: 'מחק',
  edit: 'ערוך',
  settingsStages: 'שלבים',
  settingsUsers: 'משתמשים',
  settingsContractors: 'קבלנים',
  settingsApp: 'אפליקציה',
  settingsLanguage: 'שפה',
  noActivity: 'אין פעילות אחרונה.',
  noTasks: 'אין משימות עדיין.',
  addTask: 'הוסף משימה',
  allContractors: 'כל הקבלנים',
  selectContractor: 'בחר קבלן *',
  selectApartment: 'בחר דירה *',
  stageOptional: 'שלב (אופציונלי)',
  taskDescriptionPlaceholder: 'תיאור המשימה *',
  // Common extras
  confirm: 'אישור',
  restore: 'שחזור',
  download: 'הורדה',
  upload: 'העלאה',
  print: 'הדפסה',
  search: 'חיפוש',
  clearFilters: 'נקה מסננים',
  noResults: 'אין תוצאות',
  never: 'אף פעם',
  yes: 'כן',
  no: 'לא',
  all: 'הכל',
  off: 'כבוי',
  overdue: 'באיחור',
  today: 'היום',
  tomorrow: 'מחר',
  daysLabel: 'ימים',
  urgentPriority: '🔴 דחוף',
  normalPriority: '⚪ רגיל',
  lowPriority: '🟢 נמוך',
  aptPrefix: 'דירה',
  floorPrefix: 'קומה',
  buildingPrefix: 'בניין',
  standard: 'סטנדרטי',
  notStartedOption: '— טרם התחיל —',
  // Header
  syncSaving: 'שומר...',
  syncSaved: 'נשמר ✓',
  searchTooltip: 'חיפוש (⌘K)',
  switchToDark: 'עבור לנושא כהה',
  switchToLight: 'עבור לנושא בהיר',
  signOut: 'התנתק',
  // Dashboard extras
  overdueTasks: 'משימות באיחור',
  pendingTasks: 'משימות ממתינות',
  completedToday: 'הושלמו היום',
  overallStarted: 'סה״כ התחיל',
  changesUnits: 'יחידות שינויים',
  unitsStarted: 'יחידות שהתחילו',
  // Project Diagram
  searchApt: 'חפש דירה...',
  selectStagePlaceholder: 'בחר שלב...',
  applyTo: 'החל על',
  bulkSelected: 'נבחרו — לחץ על דירות לבחירה',
  bulkUnits: 'יחידות',
  bulkNotStarted: 'לא התחיל',
  inBulkMode: 'במצב עריכה מרובה',
  // Tasks Page
  newTask: 'משימה חדשה',
  bulkAdd: 'הוספה מרובה',
  allStages: 'כל השלבים',
  allPriorities: 'כל העדיפויות',
  overdueOnly: 'באיחור בלבד',
  dueFrom: 'תאריך יעד מ',
  dueTo: 'עד',
  markComplete: 'סמן כהושלם',
  markIncomplete: 'סמן כלא הושלם',
  editTask: 'ערוך משימה',
  deleteTask: 'מחק משימה',
  deleteTaskConfirm: 'למחוק משימה זו?',
  taskDeleted: 'משימה נמחקה',
  taskUpdated: 'משימה עודכנה',
  noPriorityLabel: 'עדיפות (אופציונלי)',
  // Analytics
  totalApartments: 'סה״כ דירות',
  residentialUnits: 'יחידות מגורים',
  workStarted: 'עבודה התחילה',
  notYetStarted: 'טרם התחיל',
  contractorsLabel: 'קבלנים',
  totalAssignments: 'סה״כ הקצאות',
  tasksCompletedLabel: 'משימות הושלמו',
  pendingLabel: 'ממתין',
  completedLabel: 'הושלם',
  stageCompletionsWeek: 'השלמות שלב / שבוע',
  tasksCompletedWeek: 'משימות שהושלמו / שבוע',
  contractorTasksSection: 'משימות קבלן',
  noContractorAssignments: 'אין הקצאות קבלן עדיין.',
  // Activity Log
  activityLogPage: 'יומן פעילות',
  entriesLabel: 'רשומות',
  userFilter: 'משתמש',
  allUsers: 'כל המשתמשים',
  actionTypeFilter: 'סוג פעולה',
  fromDate: 'מתאריך',
  toDate: 'עד תאריך',
  allActions: 'כל הפעולות',
  stageFieldChange: 'שינוי שלב / שדה',
  noteAction: 'הערה',
  taskCreatedAction: 'משימה נוצרה',
  taskCompletedAction: 'משימה הושלמה',
  taskReopenedAction: 'משימה נפתחה מחדש',
  taskDeletedAction: 'משימה נמחקה',
  contractorUploadAction: 'העלאת קבלן',
  contractorNoteAction: 'הערת קבלן',
  contractorCompletedAction: 'קבלן השלים',
  noLogsMatch: 'אין רשומות פעילות תואמות מסננים',
  // Reports
  reportsPage: 'דוחות',
  exportCsv: 'יצוא CSV',
  selectExportColumns: 'בחר עמודות לייצוא',
  stageNotesColumns: 'עמודות הערות שלב',
  requiredLabel: '(נדרש)',
  includeTasks: 'כלול משימות',
  includeTasksHint: '(מוסיף עמודות: תיאור, קבלן, שלב, תאריך יעד, סטטוס, השלמה)',
  filtersSection: 'מסננים',
  searchApartment: 'חפש דירה...',
  enterButton: 'חפש',
  classificationFilter: 'סיווג',
  includeNotStarted: 'כלול לא התחיל',
  lastUpdatedFrom: 'עודכן לאחרונה — מ',
  clearDates: 'נקה תאריכים',
  stagesEmptyAll: 'שלבים (ריק = הכל)',
  showingLabel: 'מציג',
  apartmentsLabel: 'דירות',
  unnamed: 'ללא שם',
  groundFloor: 'ק',
  noApartmentsMatch: 'אין דירות תואמות את המסננים הנוכחיים',
  doneSuffix: 'בוצע',
  // Settings Page
  pickColor: 'בחר צבע:',
  addNewStage: 'הוסף שלב חדש',
  stageName: 'שם שלב...',
  addNewUser: 'הוסף משתמש חדש',
  nameField: 'שם *',
  roleField: 'תפקיד',
  codeField: 'קוד 6 ספרות *',
  addNewContractor: 'הוסף קבלן חדש',
  fullNameField: 'שם מלא *',
  emailField: 'כתובת אימייל',
  copyLink: 'העתק קישור',
  copied: 'הועתק!',
  noContractors: 'אין קבלנים בקטגוריה זו.',
  firebaseConnection: 'חיבור Firebase',
  allSystemsGo: 'הכל תקין',
  connectionIssue: 'בעיית חיבור',
  runTest: 'בדוק חיבור',
  runAgain: 'בדוק שוב',
  runningTests: 'בודק...',
  forceSync: 'דחוף נתונים מקומיים → ענן',
  forceSyncUploading: 'מעלה...',
  forceSyncDone: 'הועלה בהצלחה',
  forceSyncFailed: 'העלאה נכשלה — בדוק קונסול',
  displayTheme: 'ערכת נושא',
  dark: 'כהה',
  light: 'בהיר',
  activeLabel: 'פעיל',
  hiddenLabel: 'מוסתר',
  accessCodes: 'קודי גישה',
  accessCodesHint: 'ערוך קודים בלשונית משתמשים. שינויים ייכנסו לתוקף בכניסה הבאה.',
  enableAutoSnapshots: 'הפעל תמונות מצב אוטומטיות',
  snapshotHint: 'שומר נקודת שחזור עם שינויי נתונים',
  snapshotHistoryLabel: 'היסטוריית תמונות מצב',
  noSnapshotsYet: 'אין תמונות מצב עדיין — הפעל תמונות מצב אוטומטיות כדי להתחיל.',
  confirmButton: 'אישור',
  driveFolderUrl: 'כתובת URL של תיקיית Drive',
  autoExportFreq: 'תדירות יצוא אוטומטי',
  lastExport: 'יצוא אחרון:',
  exportNow: 'יצוא עכשיו',
  exportingLabel: 'מייצא...',
  manualBackup: 'גיבוי ידני',
  manualBackupDesc: 'יצוא כל הנתונים לקובץ JSON. ייבוא לשחזור מלא.',
  exportJson: 'יצוא JSON',
  importJson: 'ייבוא JSON',
  exportLogLabel: 'יומן יצוא',
  moveUp: 'הזז למעלה',
  moveDown: 'הזז למטה',
  changeColor: 'שנה צבע',
  saveChanges: 'שמור שינויים',
  deleteStageTooltip: 'מחק שלב',
  hideStage: 'לחץ להסתרת שלב',
  activateStage: 'לחץ להפעלת שלב',
  // Apartment Drawer
  familyName: 'שם משפחה',
  familyNamePlaceholder: 'שם משפחה...',
  typeField: 'סוג',
  standardApt: 'דירה סטנדרטית',
  hasModifications: 'יש שינויים (שינוי)',
  currentStage: 'שלב נוכחי',
  generalNotes: 'הערות כלליות',
  generalNotesPlaceholder: 'הערות כלליות על דירה זו...',
  attachFiles: 'צרף קבצים להערות משרד',
  noteHistory: 'היסטוריית הערות',
  engineeringPlans: 'תוכניות הנדסה',
  detecting: 'מזהה...',
  refreshButton: 'רענן',
  clickToExpand: 'לחץ להרחבה',
  fullView: 'תצוגה מלאה',
  lookingForPdf: 'מחפש PDF תוכניות ב-Drive...',
  noPdfFound: 'לא נמצא PDF. לחץ רענן לנסות שוב, או הגדר תיקיית Drive למטה.',
  setPdfHint: 'הגדר תיקיית Drive בהגדרות למטה לזיהוי אוטומטי של PDF תוכניות.',
  saveChangesBtn: 'שמור שינויים',
  driveFolder: 'תיקיית Google Drive',
  connectedUnit: 'יחידה מקושרת (דירות משולבות)',
  linkedToApt: 'מקושר לדירה',
  noConnection: '— אין חיבור —',
  linkMutualHint: 'קישור הוא הדדי — שתי הדירות מציגות את החיבור.',
  noTasksAssigned: 'אין משימות לדירה זו.',
  noPhotosYet: 'אין תמונות עדיין',
  photosDesc: 'תמונות שהועלו על ידי קבלנים יופיעו כאן.',
  noDriveLinked: 'לא קושרה תיקיית Drive',
  setDriveFolderHint: 'הגדר תיקיית Drive בפרטים → הגדרות לטעינת תמונות.',
  driveBackendNotConfigured: 'Drive backend לא מוגדר',
  loadingPhotos: 'טוען תמונות מ-Drive...',
  stageChangedModal: 'השלב שונה',
  assignTaskQuestion: 'האם ברצונך להקצות משימת קבלן לשלב זה?',
  noJustSave: 'לא, רק שמור',
  assignTaskBtn: 'הקצה משימה',
  unlinkApartments: 'בטל קישור דירות',
  unmergeQuestion: 'איזו דירה שומרת את הנתונים המשותפים?',
  keepsData: 'שומרת את הנתונים',
  stageWillBeCleared: 'שלב וקישור Drive יימחקו',
  bothKeepData: 'שתיהן שומרות את הנתונים הנוכחיים',
  justRemovesLink: 'רק מסיר את הקישור — אין מחיקת נתונים',
  apartmentSaved: 'פרטי הדירה נשמרו',
  apartmentUnlinked: 'הדירה בוטלה קישור',
  cannotMergeBldgs: 'לא ניתן לאחד דירות מבניינים שונים',
  alreadyMergedError: 'הדירה כבר מאוחדת עם יחידה אחרת',
  imageUnavailable: 'תמונה לא זמינה',
  openDownload: 'פתח / הורד',
  // Stage Notes
  officeNotes: 'הערות משרד',
  officeNotesFor: 'הערות משרד ל',
  noteLabel: 'הערה',
  fileLabel: 'קובץ',
  filesLabel: 'קבצים',
  assignContractor: 'הקצה קבלן',
  stageReached: 'שלב הושג:',
  editHistory: 'היסטוריית עריכה',
  allContractorNotes: 'כל הערות הקבלן',
  contractorNotesSection: 'הערות קבלן',
  attachFile: 'צרף קובץ',
  // Quick Add / Bulk Add
  pendingBadge: 'ממתין',
  hideDone: 'הסתר הושלם',
  driveWarning: 'הגדר תיקיית Google Drive בלשונית הפרטים לפני יצירת משימות.',
  createTask: 'צור משימה',
  selectAll: 'בחר הכל',
  deselectAll: 'בטל בחירה',
  inView: 'בתצוגה',
  normalDefault: 'רגיל (ברירת מחדל)',
  keepAsData: 'שמור כנתוני משימה בלבד',
  keepAsDataDesc: 'קבצים מאוחסנים כקבצים מצורפים למשימה מקומית. ללא העלאה ל-Google Drive.',
  eachAptDrive: 'העלה ל-Drive של כל דירה',
  eachAptDriveDesc: 'יוצר עותק נפרד בתיקיית Photos/Task Notes/ של כל דירה.',
  oneAptDrive: 'העלה ל-Drive של דירה אחת ספציפית',
  oneAptDriveDesc: 'בוחר באיזו תיקיית דירה להשתמש. דירות אחרות שומרות עותק מקומי.',
  driveMissingWarning: 'קישור Drive חסר',
  noDriveLink2: 'אין קישור Drive',
  noEligibleApts: 'אין דירות כשירות',
  goBack: 'חזור',
  proceedAnyway: 'המשך בכל זאת',
  uploadToSelected: 'העלה לדירה שנבחרה',
  driveLinkedBadge: 'Drive ✓',
  // Activity Section
  updatedStageNote: 'עדכן הערת שלב',
  uploadedFile: 'העלה קובץ:',
  addedNote: 'הוסיף הערה',
  markedComplete: 'סומן כהושלם',
  changedStage: 'שינה שלב',
  changedClassification: 'שינה סיווג:',
  updatedGeneralNotes: 'עדכן הערות כלליות',
  renamedApartment: 'שינה שם דירה ל-"',
  noActivityYet2: 'אין פעילות עדיין',
  revertConfirm: 'לשחזר את כל הנתונים לנקודה זו?',
  // Building Diagram
  groundCommercial: 'קרקע / מסחרי',
  lobby: 'לובי',
  doneIndicator: '✓ הושלם',
  // Login
  enterCode: 'הכנס את קוד הגישה שלך',
  pleaseEnterDigits: 'יש להזין את כל 6 הספרות.',
  invalidCode: 'קוד שגוי. נסה שוב.',
  enterProject: 'כנס לפרויקט',
  footerText: 'מערכת פנימית של TzviAir',
  // Settings Language tab chrome
  rtlLayoutLabel: 'פריסת ימין לשמאל (RTL)',
  rtlLayoutHint: 'הפעל עבור עברית, ערבית ושפות RTL אחרות.',
  langSearchPlaceholder: 'חפש שדות שפה…',
  langFieldsMatch: 'שדות תואמים',
  langNoMatch: 'אין שדות תואמים',
  adminUiLangSection: 'שפת ממשק ניהול',
  contractorLangSection: 'שפת פורטל קבלנים',
  saveAdminLang: 'שמור שפת ממשק ניהול',
  saveLang: 'שמור הגדרות שפה',
  // Settings App chrome
  driveFolderSave: 'שמור',
  firebaseDesc: 'בודק כל שירות אחד אחד — מבצע קריאה/כתיבה חיה כדי לאשר ש-Firestore פועל.',
  forcePushDesc: 'אם נתוני הענן נראים לא מעודכנים, דחוף את המצב המקומי הנוכחי שלך כדי לדרוס אותם.',
};
