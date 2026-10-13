import sprites from "../../desktop_pet_resources/video_sprites/animations.json";
import { actions, type PetAction } from "./protocol";

const names: Record<PetAction, string> = {
  idle: "normal_duck",
  thinking: "thinking_duck",
  working: "work_duck",
  waiting: "box_duck",
  success: "cool_duck2",
  error: "tired_duck",
  celebrating: "music_duck",
  sleeping: "sleep_duck",
  speaking: "normal_speak",
  box_speaking: "box_speak",
};
export interface PetAnimation {
  name: string;
  frameCount: number;
  fps: number;
  durationMs: number;
}
// This small manifest is bundled into both browser and bridge. It does not
// decode or preload any sprite pages, and keeps their default timing shared.
export const animationCatalog = Object.fromEntries(actions.map((action) => {
  const sprite = sprites.find((item) => item.name === names[action]);
  if (!sprite || sprite.frameCount < 1 || sprite.fps <= 0)
    throw new Error(`Missing animation metadata for ${action}`);
  return [action, { name: sprite.name, frameCount: sprite.frameCount,
    fps: sprite.fps, durationMs: Math.ceil(sprite.frameCount / sprite.fps * 1000) }];
})) as Record<PetAction, PetAnimation>;
