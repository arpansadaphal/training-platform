// Repository layer for Goal / GoalProfileDefinition.
//
// Phase 1 only needs read access to GoalProfileDefinition (for the seed
// reconciliation and later Assessment). Goal rows themselves are created
// when a user picks a Program's goal — that flow arrives in a later phase.

import { type Prisma } from "@prisma/client";
import { prisma } from "../client";

export interface GoalProfileDefinitionRecord {
  id: string;
  key: string;
  displayName: string;
  configVersion: string;
  thresholds: unknown; // GoalProfileConfig — intentionally unvalidated in Phase 1
  validated: boolean;
  sourceNote: string;
  createdAt: Date;
}

export interface GoalRecord {
  id: string;
  goalProfileId: string;
  params: unknown;
  createdAt: Date;
}

const PROFILE_SELECT = {
  id: true,
  key: true,
  displayName: true,
  configVersion: true,
  thresholds: true,
  validated: true,
  sourceNote: true,
  createdAt: true,
} as const;

const GOAL_SELECT = {
  id: true,
  goalProfileId: true,
  params: true,
  createdAt: true,
} as const;

export async function findGoalProfileByKey(
  key: string,
): Promise<GoalProfileDefinitionRecord | null> {
  return prisma.goalProfileDefinition.findUnique({
    where: { key },
    select: PROFILE_SELECT,
  });
}

export async function listGoalProfiles(): Promise<
  GoalProfileDefinitionRecord[]
> {
  return prisma.goalProfileDefinition.findMany({
    select: PROFILE_SELECT,
    orderBy: { key: "asc" },
  });
}

export async function createGoal(input: {
  goalProfileId: string;
  params?: unknown;
}): Promise<GoalRecord> {
  return prisma.goal.create({
    data: {
      goalProfileId: input.goalProfileId,
      params: (input.params ?? {}) as Prisma.InputJsonValue,
    },
    select: GOAL_SELECT,
  });
}

export async function findGoalById(
  id: string,
): Promise<GoalRecord | null> {
  return prisma.goal.findUnique({
    where: { id },
    select: GOAL_SELECT,
  });
}