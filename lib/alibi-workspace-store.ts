import type {
  ActiveTimer,
  DeleteBlockInput,
  DeleteBlockResult,
  GetCalendarDataInput,
  ResumeBlockInput,
  ResumeBlockResult,
  SaveBlockInput,
  SaveBlockResult,
  StartTimerInput,
  StartTimerResult,
  StopTimerInput,
  StopTimerResult,
  TimeBlock,
  TimeBlockCategoryRecord,
} from "@/lib/types";

export interface AlibiTrackerSnapshot {
  activeTimer: ActiveTimer | null;
  activeTimeBlock: TimeBlock | null;
  timeBlocks: TimeBlock[];
  categories: TimeBlockCategoryRecord[];
}

export interface AlibiWorkspaceCapabilities {
  canImportDemo?: boolean;
  canSyncCalendar?: boolean;
  supportsVoice?: boolean;
  mode: "authenticated" | "demo";
}

export interface AlibiWorkspaceStore {
  capabilities: AlibiWorkspaceCapabilities;
  loadTracker(todayRange: GetCalendarDataInput): Promise<
    | ({
        type: "loaded";
      } & AlibiTrackerSnapshot)
    | {
        type: "error";
        message: string;
      }
  >;
  startTimer(input?: StartTimerInput): Promise<StartTimerResult>;
  stopTimer(input?: StopTimerInput): Promise<StopTimerResult>;
  saveActiveTimerDetails?(input: StopTimerInput): Promise<SaveBlockResult>;
  saveBlock(input: SaveBlockInput): Promise<SaveBlockResult>;
  deleteBlock(input: DeleteBlockInput): Promise<DeleteBlockResult>;
  resumeBlock(input: ResumeBlockInput): Promise<ResumeBlockResult>;
  loadCategories(): Promise<
    | {
        type: "loaded";
        categories: TimeBlockCategoryRecord[];
      }
    | {
        type: "error";
        message: string;
      }
  >;
}
