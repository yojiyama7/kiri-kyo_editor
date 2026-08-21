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
  id: GroupId;
  kind: "underline_group";
  child_ids: SlotId[];
  slot: Slot;
};

export type TokenId = number;
export type GroupId = number;

export type Token = {
  id: TokenId;
  text: string;
  word_slot: WordSlot;
};

export type LogicalCursor = {
  x: number;
  y: number;
};

export type PseudoToken = {
  text: string;
  word_slot: WordSlot;
};

export type BoundaryItemId = number;
export type BoundarySymbol = "[" | "]" | "<" | ">" | "(" | ")";

export type BoundaryItem = {
  id: BoundaryItemId;
  kind: "boundary_item";
  symbol: BoundarySymbol;
  slot: AtomicSlot | null;
};

export type ArrowEndpoint =
  | { kind: "slot"; slot_id: SlotId }
  | { kind: "boundary"; boundary_id: BoundaryItemId };

export type Arrow = {
  from: ArrowEndpoint;
  to: ArrowEndpoint;
};

export type SentenceState = {
  tokens: Record<TokenId, Token>;
  token_chain: TokenId[];
  pseudo_tokens: Record<number, PseudoToken[]>;
  boundary_items: Record<number, BoundaryItem[]>;
  underline_groups: UnderlineGroup[];
  arrows: Arrow[];
  cursor: LogicalCursor | null;
};

export type SentenceStateValidation = {
  slot_ids: SlotId[];
  token_ids: TokenId[];
  group_ids: GroupId[];
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
export function replaceWordSlotWithDouble(state: SentenceState, token_id: TokenId): SentenceState;
export function restoreWordSlotFromDouble(state: SentenceState, token_id: TokenId): SentenceState;
export function buildSlotIndex(state: SentenceState): Map<SlotId, {
  kind: "token" | "pseudo_token" | "boundary" | "underline_group";
  port: "single" | "left" | "right";
  token_id?: TokenId;
  group_id?: GroupId;
  gap?: number;
  index?: number;
}>;
export function createUnderlineGroup(
  state: SentenceState,
  child_ids: SlotId[],
  group_id?: GroupId
): SentenceState;
export function setUnderlineGroupChildIds(
  state: SentenceState,
  group_id: GroupId,
  child_ids: SlotId[]
): SentenceState;
export function setUnderlineGroupMark(
  state: SentenceState,
  group_id: GroupId,
  port: "single" | "left" | "right",
  mark: Mark
): SentenceState;
export function removeSlotReferences(state: SentenceState, slot_ids: SlotId[]): SentenceState;
export function appendBoundaryItem(
  state: SentenceState,
  gap: number,
  symbol: BoundarySymbol
): SentenceState;
export function removeBoundaryItem(
  state: SentenceState,
  gap: number,
  index: number
): SentenceState;
export function clearBoundaryItems(state: SentenceState, gap: number): SentenceState;
export function setBoundaryMark(
  state: SentenceState,
  boundary_id: BoundaryItemId,
  mark: Mark
): SentenceState;
export function addArrow(state: SentenceState, from: ArrowEndpoint, to: ArrowEndpoint): SentenceState;
export function removeArrowsFrom(state: SentenceState, from: ArrowEndpoint): SentenceState;
export function replaceUnderlineGroupSlotWithT(state: SentenceState, group_id: GroupId): SentenceState;
export function restoreUnderlineGroupSlotFromT(state: SentenceState, group_id: GroupId): SentenceState;
export function replaceUnderlineGroupSlotWithDouble(state: SentenceState, group_id: GroupId): SentenceState;
export function restoreUnderlineGroupSlotFromDouble(state: SentenceState, group_id: GroupId): SentenceState;
export function removeUnderlineGroup(state: SentenceState, group_id: GroupId): SentenceState;
export function markToDisplay(mark: Mark): string;
export function displayToMark(display: string): Mark;
