import type { DropPoint } from "../lib/block-drop";
export type BlockHandleProps = {
  label: string;
  disabled: boolean;
  grabbed: boolean;
  keyboardGrabbed: boolean;
  begin: (point: DropPoint) => void;
  move: (point: DropPoint) => void;
  finish: () => void;
  cancel: () => void;
  keyboard: (key: string) => boolean;
  shift: (direction: -1 | 1) => void;
};
