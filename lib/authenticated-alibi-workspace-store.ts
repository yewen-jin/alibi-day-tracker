"use client";

import {
  deleteBlock,
  getActiveTimer,
  getActiveTimerBlock,
  getCalendarData,
  getCategories,
  resumeBlock,
  saveActiveTimerDetails,
  saveBlock,
  startTimer,
  stopTimer,
} from "@/app/actions/timer";
import type {
  AlibiWorkspaceStore,
  AlibiTrackerSnapshot,
} from "@/lib/alibi-workspace-store";
import { FALLBACK_CATEGORIES } from "@/lib/time-block-display";

export function createAuthenticatedAlibiWorkspaceStore(): AlibiWorkspaceStore {
  return {
    capabilities: {
      mode: "authenticated",
      canImportDemo: true,
      canSyncCalendar: true,
      supportsVoice: true,
    },
    async loadTracker(todayRange) {
      const [timerResult, activeBlockResult, calendarResult, categoriesResult] =
        await Promise.all([
          getActiveTimer(),
          getActiveTimerBlock(),
          getCalendarData(todayRange),
          getCategories(),
        ]);

      const snapshot: AlibiTrackerSnapshot = {
        activeTimer: null,
        activeTimeBlock: null,
        timeBlocks: [],
        categories: FALLBACK_CATEGORIES,
      };

      if (timerResult.type === "loaded") {
        snapshot.activeTimer = timerResult.activeTimer;
      } else {
        return timerResult;
      }

      if (activeBlockResult.type === "loaded") {
        snapshot.activeTimeBlock = activeBlockResult.timeBlock;
      } else {
        return activeBlockResult;
      }

      if (calendarResult.type === "loaded") {
        snapshot.timeBlocks = calendarResult.timeBlocks;
      } else {
        return calendarResult;
      }

      if (categoriesResult.type === "loaded") {
        snapshot.categories =
          categoriesResult.categories.length > 0
            ? categoriesResult.categories
            : FALLBACK_CATEGORIES;
      } else {
        return categoriesResult;
      }

      return {
        type: "loaded",
        ...snapshot,
      };
    },
    startTimer,
    stopTimer,
    saveActiveTimerDetails,
    saveBlock,
    deleteBlock,
    resumeBlock,
    loadCategories: getCategories,
  };
}
