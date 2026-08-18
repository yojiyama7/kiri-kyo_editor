# State Variable Audit

確認日: 2026-08-17

## 削除・統合した状態

- `pendingCursor`, `pendingSlot`, `pendingGroupId`, `pendingGroupSlot`: 同じ保留入力先を重複表現していたため、slot参照形式の `pendingRef` へ統合。
- `verbalEditingSide`, `verbalEditingBuffer`, `verbalEditingOriginal`: 開始関数が一度も呼ばれない到達不能状態だったため、関連関数・描画分岐・CSSとともに削除。
- `historyRestoring`: 同期的な復元処理の途中をイベントハンドラから観測できず、履歴抑止に寄与していなかったため削除。
- `tokenSentence`: `sentenceRanges` から常に導出できる重複キャッシュだったため削除。

## 維持した文書状態

- `tokens`, `sentenceRanges`: 入力をtoken列と改行単位へ正規化した編集モデル。
- `workSlots`, `verbals`, `groups`, `gaps`, `boundarySlots`, `arrows`: ユーザーが作成する構造そのもの。`boundarySlots` は `[` / `<` の文字位置に対応するsingle slot。
- `nextGroupId`: group削除後もIDを不用意に再利用しないための単調増加値。

## 維持した操作状態

- `mode`: NORMAL / INSERT。
- `cursor`, `cursorSlot`: token側の現在位置。
- `groupCursorId`, `groupCursorSlot`, `groupCursorTarget`: groupの下線、single slot、T左右を区別する現在位置。
- `pendingKeys`, `pendingRef`: 複数キー標識入力の途中経過と、開始時点の入力先。
- `numericPending`: `-`の後に数字を待つ状態。`pendingKeys`とは表示・確定規則が異なる。
- `directEditing`: `/`入力用DOM、対象ref、履歴開始点。
- `arrowDraft`, `arrowHistoryBefore`: 矢印終点選択と、複数キー操作を1履歴にまとめる開始点。
- `gapMode`, `gapCursor`: 境界編集モードと境界位置。
- `boundaryCursor`: NORMALで選択中の `[` / `<` 境界slot参照。
- `groupSelection`: V選択の固定済みpath列 `paths`、activeなslot列 `path`、選択中フラグ。
- `markUndoStack`, `markRedoStack`, `inputHistoryBefore`: undo/redoとtextarea入力の履歴境界。

## 文書外キャッシュ

- `slotMeasureCanvas`: 文字幅計測用canvasの再利用キャッシュ。編集状態ではない。

トップレベルDOM参照と関数内の局所変数は、状態ではなく表示・計算中だけ使う値として維持する。
