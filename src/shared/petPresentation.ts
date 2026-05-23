import type { CodexSessionRecord, PetStage, PetState } from "./types";

export function visualStageForPet(
  petState: PetState,
  sessions: CodexSessionRecord[],
): PetStage {
  void sessions;
  return petState.stage;
}
