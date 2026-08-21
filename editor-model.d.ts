export as namespace KiriEditorModel;

export type Mark =
  | "s" | "v" | "o" | "c" | "con" | "pre" | "ap" | "a" | "ad"
  | "1" | "2" | "3" | "4" | "5" | "-3" | "-4" | "-5"
  | string;

export type SlotId = number;

export type AtomicSlot = {
  id: SlotId;
  kind: "atomic_slot";
  mark: Mark;
};

export type DoubleSlot = {
  id: SlotId;
  kind: "double_slot";
  lslot: AtomicSlot;
  rslot: AtomicSlot;
};

export type TSlot = {
  id: SlotId;
  kind: "t_slot";
  pre_slot: AtomicSlot;
  post_slot: AtomicSlot;
};

export type Slot = AtomicSlot | DoubleSlot | TSlot;

export type WordSlot = {
  kind: "word_slot";
  slot: Slot;
};

export type UnderlineGroup = {
  kind: "underline_group";
  child_ids: SlotId[];
  slot: Slot;
};

export type TokenId = number;

export type Token = {
  id: TokenId;
  word_slot: WordSlot;
};

export type SentenceState = {
  tokens: Record<TokenId, Token>;
  token_chain: TokenId[];
  underline_groups: UnderlineGroup[];
  cursor: number;
};

export type SentenceStateValidation = {
  slot_ids: SlotId[];
  token_ids: TokenId[];
};

export function isMark(value: unknown): value is Mark;
export function validateSentenceState(state: SentenceState): SentenceStateValidation;
export function createSentenceState(state: SentenceState): SentenceState;
export function replaceWordSlotWithT(
  state: SentenceState,
  token_id: TokenId,
  t_slot: { id: SlotId; post_slot: AtomicSlot }
): SentenceState;
export function restoreWordSlotFromT(
  state: SentenceState,
  token_id: TokenId
): SentenceState;
