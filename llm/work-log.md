# Work Log

## 2026-08-17

ユーザー指示:

> エディタがある。webで動作する。これの仕様を把握して。llmというディレクトリを作ってメモや指示の記録をすること。

実施内容:

- `C:\Users\yojiy\program\web\kiri-kyo_editor` を対象リポジトリとして確認。
- 実体は `index.html` の単一ファイル Web アプリ。
- アプリ内ヘルプ、内部 JSON 生成、主要キーハンドラ、group / gap / arrow 周辺処理を読み、仕様を [spec.md](./spec.md) に記録。

次回以降の注意:

- 作業前にこの `llm` ディレクトリを読む。
- 仕様変更や実装方針を決めたら、このディレクトリに追記する。
- 見た目に関わる変更では、下線 `#groupLayer` と矢印 `#arrowLayer` の座標が崩れていないかブラウザで確認する。
- `index.html` は単一ファイルなので、変更範囲が大きくなった場合は分割方針を先に記録してから進める。

## 2026-08-17 V選択テスト追加方針

ユーザー指示:

> Vでの選択において、灰色のカーソルがただしく表示されていないし、移動も上手くいっていない。まずは機能のテストを書こう。それぞれのキーについて全てそれぞれブラウザでテストをするようにして。その後なかの構造を整理しよう。

方針:

- 先にブラウザ自動テストを追加する。
- 単一 HTML なので、Playwright で `file://.../index.html` を開いてキー操作を直接検証する。
- V選択は `.slot-group-selecting-active`, `.slot-group-selecting-fixed`, `.slot-group-selection-cursor` と内部 JSON の両方を見る。
- 構造整理・修正はテスト追加後に行う。

実施内容:

- `tests/browser/key-tests.mjs` を追加し、主要キー操作を Playwright でブラウザ検証するようにした。
- Playwright 標準ブラウザが未導入でも、標準パスの Chrome / Edge を使って起動できるようにした。
- V選択中、二重slotやT slotで本来見えない通常single slotにも選択クラスが付く問題をテストで検出。
- `index.html` の render 処理で、実際に選択対象として表示されるslotにだけV選択クラスを付けるよう修正。
- V選択クラス生成を `groupSelectionClassNames()` に集約。
- ブラウザテスト結果: 40 passed。

## 2026-08-17 functional core 分離

- DOM非依存の純粋状態層として `editor-core.js` を追加。
- 状態生成、文解析、immutable更新、入力同期、slot有効状態の再計算、矢印整合性処理をcoreへ分離。
- `index.html` 側の状態交換を `readEditorState()` / `writeEditorState()` / `applyEditorTransition()` に集約。
- V選択、境界編集、モード切替、標識設定、二重slot化、T化の主要更新をimmutable遷移へ変更。
- 既存テストは維持し、coreが入力を変更せず決定的であることだけ追加検証。
- ブラウザテスト結果: 43 passed。

## 2026-08-17 状態変数監査

- トップレベル状態変数を宣言、読み取り、書き込み、状態スナップショットの各観点で全件確認。
- 保留入力先4変数を `pendingRef` へ統合。
- 到達不能なT直接編集状態3変数と関連コードを削除。
- 実行中に観測されない `historyRestoring` を削除。
- `sentenceRanges` と重複していた `tokenSentence` を削除。
- 詳細は `state-audit.md` に記録。

## 2026-08-17 slot cursor geometry 統合

- 分散していた `requiredSlotWidth`, `requiredTWidth`, `requiredDoubleWidth` を削除。
- `editor-core.js` に純粋関数 `calculateSlotGeometry()` を追加。
- 通常、double、T、group、下線、V選択の全slotカーソルを同じgeometryへ接続。
- 全layoutでslot高さを20pxへ統一し、幅は共通の最小幅・文字幅・利用可能幅から算出。
- 7種のカーソル実寸と純粋性をブラウザテストへ追加。
- ブラウザテスト結果: 46 passed。

## 2026-08-17 通常移動とV選択移動の統合

- V選択中の `h` / `l` が `selectionDisplayOrder()` の配列indexで隣へ進み、通常移動と異なる問題を修正。
- DOM非依存の純粋関数 `calculateHorizontalTarget()` を `editor-core.js` に追加。
- 通常カーソルとV選択カーソルの双方が `horizontalMoveTarget()` を通り、同じ隣接判定を使う構造へ変更。
- 空のgroupへ横から入る場合は、どちらのモードでも内部の空slotではなくgroup下線を選ぶ。
- 通常移動との一致をブラウザ操作で再現する回帰テストと、共通計算の純粋性テストを追加。
- ブラウザテスト結果: 49 passed。

## 2026-08-17 group横線の等間隔配置

- 内側groupの実表示下端と段番号を重ねて加算していたため、通常下線とTの高さの差が段間隔へ累積する問題を修正。
- 包含されるgroupを優先して上へ置き、包含関係がない場合は論理長の短いgroupを上へ置く。
- 重なるgroupを連結成分に分け、成分ごとの共通基準線から27pxの固定ピッチで下線・T横線を配置。
- 3重包含の最短groupをTにしたブラウザテストで、順序、長さ、27px間隔、Tと次段の非衝突を検証。
- ブラウザテスト結果: 50 passed。

## 2026-08-17 V選択候補のpath化

- `anchor` と `head` の間を表示順で埋める選択管理を廃止。
- 選択中は、カーソルが実際に経由したslot参照を `groupSelection.path` に保持する。
- 移動先が既にpath内にある場合はそこまで戻し、通常の左右往復で選択候補が縮むようにした。
- 固定済み部分は `groupSelection.paths` にslot列のまま保持する。
- `Enter` 確定時だけ、選択slot集合を表示順上で隣接する区間へ圧縮してgroupのsegmentsへ変換する。
- 空groupを横断するケースについて、選択表示、戻り操作、確定ranges、純粋関数をブラウザテストで検証。
- ブラウザテスト結果: 53 passed。

## 2026-08-17 inner_json / display_json 分離と下線共有判定

- 先に3基礎slotの非空部分集合7個・全21組を検査する網羅テストを追加し、新API未実装エラーを確認してから実装。
- inner_jsonを意味構造の正規形かつセーブ形式に変更。非表示の元slot内容、T、group members、境界、矢印を保持する。
- groupの正本を直接選択slot列 `members` とし、`segments`, token外接範囲、色、高さを保存対象から除外。
- `state -> inner_json -> state -> inner_json` の完全一致と、実エディタAPIでのsave/load/DOM復元をテスト。
- display_jsonは基礎slot集合を子groupへ再帰展開し、共有、包含、構造深さ、level、27px offset、表示色を導出。
- 共有groupは必ず別level。内包されるgroupを上にし、包含関係がなければ基礎slot数の短いgroupを上にする全順序へ変更。
- 再帰的に同じ領域を共有する子・親・第三groupについて、実ブラウザでも別段表示を検証。
- ブラウザテスト結果: 58 passed。

## 2026-08-17 localStorageセーブ

- ツールバーへ「保存」「保存削除」を追加。
- inner_json version 1を `kiri-kyo-editor:inner-json:v1` に保存し、次回起動時に自動復元。
- 保存削除はlocalStorageだけを消し、現在の編集状態は維持。
- 保存、ページ再読み込み後の復元、削除、削除後の編集状態維持をブラウザテストで検証。
- ブラウザテスト結果: 59 passed。

## 2026-08-17 内部カーソルより下への下線配置

- 下線内slotのカーソル表示を、通常、double、T、group、V選択中、固定済み、現在位置の全classについて一つの判定へ集約。
- slot本体だけでなく `::before` / `::after` とoutlineの張り出しを含む可視下端を算出し、下線クラスタの共通基準へ反映。
- 空slot上のV選択について、灰色・選択中・固定済みの各表示より下線が下に来るブラウザ回帰テストを追加。
- 追加テストが修正前に失敗することを確認し、修正後のブラウザテスト結果: 60 passed。

## 2026-08-17 葉slotによる下線分割

- token indexおよび直接memberの隣接による下線分割を表示の正本として使わないよう変更。
- 通常slot、double左右、T左右から文内の葉slot全順序を作り、group memberを子groupまで再帰展開した葉集合を連続runへ分割。
- `display_json` のgroup layoutへ純粋な導出値 `underlineSegments` を追加し、`inner_json.members` と保存形式は変更していない。
- 描画、高さ計算、区間端点、分割間の同色接続マークが同じ `underlineSegments` を使うよう統一。
- 非連続な子groupを1 memberとして持つ親も同じ位置で2本に分かれること、連続する子groupと隣接葉は1本になることを検証。
- T左右、double左右、通常slot、再帰展開、接続マークを含むブラウザテスト結果: 62 passed。

## 2026-08-17 全カーソルborderの保証

- double slotはborder-colorだけがありborder-styleがなく、通常青カーソルの枠が表示されない問題を修正。
- 固定済みオレンジは先に指定したborder-colorが後方の透明borderに上書きされる問題を修正し、全slotへ2px solidのオレンジ枠を確定。
- 固定済みgroup下線には `::before` でオレンジ枠を追加。`::after` の灰色現在位置と同時表示できるようレイヤーを分離。
- 通常single、double、token T、group下線、group mark、group Tと、固定済みsingle、double、token T、group下線、group Tのcomputed styleをブラウザで検査。
- ブラウザテスト結果: 64 passed。

## 2026-08-17 下線内横移動と選択中の階層移動

- 下線内部の `h` / `l` は、同じ下線が移動方向に含む次の葉slotを優先するよう変更。非連続区間も未所属slotを飛ばして移動する。
- 当初残した「完全に空なら下線へ戻る」という分岐は誤仕様だったため削除。空slotだけの下線でも通常・V選択の双方で内部を横移動する。
- 同一下線内の候補選択を純粋関数 `calculateContainedHorizontalTarget()` として抽出し、入力非変更を検証。
- `j` / `k` をV選択中にも受け付け、固定済みオレンジ区間を維持したGROUP GAP中と、新しいactive区間の選択中の双方で移動可能にした。
- 入れ子の上下移動は葉数ではなく `structuralDepth` で最内側・直接親を決め、`k` は直接memberへ一段だけ降りる。
- オレンジ枠はsingle、double、token T、group下線、group Tの全形状で20pxの縦幅を検証。
- 4重入れ子の往復とactive pathの伸縮を含むブラウザテスト結果: 66 passed。

## 2026-08-17 下線削除の残留修正

- 内部slot上の `U` が同じ葉集合を持つ入れ子groupをID順で選び、意図した最内側ではない下線を削除する問題を修正。
- 削除対象は現在refを含むgroupを `structuralDepth` 順に選び、最内側から一段ずつ削除。
- 子group削除後に親memberへ削除済みgroup参照が残り、inner_jsonから親が脱落する一方で古いsegmentsのDOM下線だけ残る問題を修正。
- 純粋関数 `removeGroup()` が親の対象参照を削除groupの直接membersへ展開し、表示segmentsを再導出させる。
- V選択中に遮断されていた `U` を有効化し、灰色・オレンジカーソル表示中でも既存下線を削除可能にした。
- 4重入れ子を最内側から4回で完全削除、DOMとinner_jsonの一致、純粋性を検証。ブラウザテスト結果: 68 passed。

## 2026-08-17 子groupから兄弟slotへの横移動

- `His carrer culminated in his being elected President.` の提供inner_jsonをそのまま回帰テストへ追加。
- group 5から `k` で子group 4へ降り、`l` するとPresidentではなく親group 5下線へ戻るループを再現。
- 横移動では同じ親groupの直接membersを一般のgroup入場判定より先に探索するよう変更。
- group 4下線とPresident slotを `l` / `h` で直接往復可能にし、elected slotからの通常移動・V選択移動も検証。
- ブラウザテスト結果: 69 passed。

## 2026-08-17 外側カーソルによる子下線の移動防止

- 提供inner_jsonでPresidentを選択すると、領域共有クラスタの共通基準へカーソル下端を混ぜていたため、カーソルを含まないgroup 3（being elected）まで下がる問題を再現。
- 内容に基づく静的クラスタ基準と、カーソルに基づくgroup別最小Yを分離。
- カーソル補正は実際にカーソルslotを含むgroupだけへ適用し、内側groupの押し下げだけを外側へ27px間隔で伝播。外側から内側への逆伝播を廃止。
- President選択前後でgroup 3のY座標が不変で、group 5はカーソル下端より下にあることをブラウザで検証。
- ブラウザテスト結果: 70 passed。

## 2026-08-17 最上位group標識間の横移動

- mark `C` のgroup 4とmark `V` のgroup 5を持つ提供inner_jsonを回帰テストへ追加。
- V選択はgroup参照へ到達できる一方、通常移動は最上位groupを兄弟と見なさず、group 4から内側group 3へ入る差を再現。
- 文ごとの非包含group列を暗黙rootの直接membersとして横移動候補へ追加し、CとVを1回の `l` / `h` で往復可能にした。
- 非T group参照の通常表示targetを、markありなら `single`、markなしなら `underline` に統一。
- 通常移動とV選択移動を同じJSONで検証。ブラウザテスト結果: 71 passed。

## 2026-08-18 2次元グリッド移動

- 葉slotを左から `col_idx` へ割り当て、複数の葉を含むgroup slotは再帰的な含有列の最小値を採用。
- 左右移動は同じ構造階層の候補から、現在行以下で最大の `row_idx` を優先し、その行の方向側で最寄りの要素を選択。
- 最後の左右移動で選んだ列を一時的に保持し、`j` / `k` は直接の親子構造をその列のまま移動。外側に包含要素がない `j` は次文へ移動しない。
- 座標候補選択を純粋関数 `calculateGridHorizontalTarget()` と `calculateColumnPreservingTarget()` に抽出し、決定性と入力非変更を検証。
- 通常移動とV選択、4重入れ子、非連続下線、T表示を含むブラウザテスト結果: 74 passed。

## 2026-08-18 同じ表示高の兄弟group slotへの横移動

- `being elected` の子group slotとPresident slotが外側groupの直接membersである状態を、子groupのmarkを空にして回帰テスト化。
- Presidentから `h` した際、表示行フィルタで同じ高さの子group slotを落として内側の右葉slotへ入る問題を再現してから修正。
- 親groupの直接membersは局所グリッド上で同じ表示高として扱い、非T子groupはmarkが空でも下線ではなく空の `single` 標識slotを選択。
- 移動前後のカーソルがともに20px高で、中心Y差が下線厚由来の2px以内であることをブラウザ上で検証。
- 通常移動とV選択の双方を検証。ブラウザテスト結果: 75 passed。

## 2026-08-18 境界疑似トークン

- 境界記号とは独立した `gapTokens` stateを追加。疑似トークンは表面文字列とsingle slotを1つ持つ。
- `b` の境界編集モードで `/` を押すと表面文字列を直接入力し、Enter確定後は疑似トークンslotへ通常カーソルを移す。
- 通常tokenと同じ3段レイアウトで表示し、標識キーと通常の `/` によるslot編集、左右の通常tokenとの `h` / `l` 往復に対応。
- inner_jsonのsentenceごとの `pseudoTokens`へローカル境界index、表面文字列、slotを保存し、読込・display_json・localStorage・undo/redoのsemantic stateへ含めた。
- 作成、`S`設定、横移動、inner_json往復をブラウザで検証。ブラウザテスト結果: 76 passed。

## 2026-08-18 疑似トークンの通常token同等化

- 疑似トークン選択時も直前の通常tokenに青カーソルが残る問題を、全通常カーソル条件へ `gapTokenCursor` 排他条件を加えて修正。
- 疑似トークンの表面文字列を臙脂色 `#800020` で表示。
- `{gapToken:index}` 参照をV選択順、グリッド列、sentence判定、group member、inner_json変換、primitive leaf順、下線端点へ追加。
- group memberはinner_jsonで `{pseudoToken:index,port:'single'}`、display primitiveは `pseudo-token:<index>:single` として通常tokenと同じ集合演算へ参加。
- V選択から通常tokenと一緒に下線を確定し、group Tで内部slotが隠れて解除で戻ること、`j/k`で同じ列へ往復できることをブラウザで検証。ブラウザテスト結果: 76 passed。

## 2026-08-18 疑似トークンのクリック選択修正

- 通常tokenのクリックはNORMALへ戻る一方、疑似トークンはINSERTのまま内部カーソルだけを変更していたため、青カーソルが描画されず選択不可に見える問題を再現。
- 疑似トークンのクリックも `setMode('NORMAL')` を通し、モードと表示カーソルを同期。
- 文頭・単語間・文末、空slot・非空slotについて、クリックと `h/l` の選択を網羅。INSERT中のクリックでNORMALへ戻ることも検証。ブラウザテスト結果: 77 passed。

## 2026-08-18 group端から疑似トークンへの横移動

- `in his` のgroup slotと `being elected` のgroup slotの間に疑似トークン `int` がある画像の状態をinner_jsonで再現。
- groupから外へ出るフォールバックが `start/end` に隣接する通常tokenへ直接移動し、境界疑似トークンを飛ばす問題を失敗テストで確認。
- groupの左右端境界に、group自身の内部memberではない疑似トークンがあれば、通常tokenより先に `h/l` の移動先として選択。
- `in his` からの `l`、`being elected` からの `h`、V選択中の `l` をブラウザで検証。ブラウザテスト結果: 78 passed。

## 2026-08-18 疑似トークン作成直後の二重カーソル

- group cursorを選択したまま `b` `/` で疑似トークンを作ると、`groupCursorId`を保持したまま`gapTokenCursor`も設定され、青カーソルが2つ出る状態を再現。
- BORDER開始時と疑似トークン確定時にgroup cursor stateを解除。
- group下線、group mark、group T左右の描画条件にも `gapTokenCursor` と `gapMode` の排他条件を追加。
- 全青カーソルclassをまとめて数え、作成確定直後に疑似トークンslotの1個だけであることをブラウザで検証。ブラウザテスト結果: 79 passed。

## 2026-08-18 BORDERでの疑似トークン横断

- BORDERのカーソルが元token間の境界indexだけを移動し、境界上の疑似トークンを1要素として数えていない状態をブラウザテストで再現。新規テストだけが失敗し、既存79件の通過を確認してから修正。
- 純粋関数 `calculateBorderPositions()` が、通常tokenと疑似トークンをそれぞれ1回で跨ぐ表示境界位置列を生成するようにした。
- 疑似トークンのある境界を `before` / `after` の2位置として描画し、`h/l` で両方向に1要素ずつ移動可能にした。境界記号と疑似トークンの保存先は従来どおり意味上の境界indexへ対応づける。
- ブラウザテスト結果: 80 passed。

## 2026-08-18 連続疑似トークン

- 1境界1疑似トークンだった `gapTokens` を境界ごとの配列へ変更し、参照へ `gapTokenIndex`、inner_jsonへ `pseudoIndex` を追加。旧単一object形式はindex 0として読み込む互換性を維持。
- BORDER中の `/` は現在の境界内位置へ必ず新規挿入し、確定後もBORDERを維持して挿入要素の直後へ移動するよう変更。
- BORDER中の `Backspace` は直前の疑似トークン1個を削除。純粋関数 `insertPseudoToken()` / `removePseudoToken()` が同じ境界のgroup・矢印・選択参照indexを補正する。
- 既存疑似トークンの表面文字列はNORMALで選択して `e`、single slot内容は従来どおり `/` と役割を分離。
- 連続作成、両方向のBORDER移動、NORMAL `h/l`、V選択、1個削除、`e`編集、inner_json往復、構造参照補正を検証。ブラウザテスト結果: 82 passed。

## 2026-08-18 通常・疑似トークン列の共通化

- 通常トークンと疑似トークンの順序を純粋関数 `createTokenSequence()` へ抽出。要素型を `{kind:'token',index}` / `{kind:'pseudo-token',gap,index}` に統一。
- BORDER位置を共通列の要素間から導出し、境界ごとの独自走査を廃止。
- 下線primitive順、V選択順、ナビゲーション葉順、横移動の隣接判定、文内表示候補、描画対象順を共通列へ移行。
- 通常トークン固有のsingle/double/T slot展開は列の後段に限定し、順序モデルとslotモデルを分離。
- 既存テストの期待値を変更せず、ブラウザテスト結果: 82 passed。

## 2026-08-18 上下移動の行フォールバック

- 構造のない2行で `k` が次行へ移動しない失敗をブラウザテストで確認。
- 構造上の移動先がない場合、`k` は次行、`j` は前行の表示Xが最も近いslotへ移動するよう `moveCursor()` の終了箇所を共通フォールバックへ接続。
- V選択は文を跨ぐgroupを作れないため、選択中は既存どおり行フォールバックしない。
- 2列それぞれの往復を検証。ブラウザテスト結果: 83 passed。

## 2026-08-18 連続疑似トークンの部分選択

- 1slot groupを許可する変更は要件の誤読だったため取り消し、従来どおり合計2slot以上を維持。
- 通常トークン1個と、連続疑似トークン3個の中央1個だけを離れた2区間として選択するケースへテストを修正。
- inner_json member、display primitive、DOMの疑似トークンgroup所属が選択した `pseudoIndex` 1件だけで、隣接疑似トークンを含まないことを検証。
- ブラウザテスト結果: 84 passed。

## 2026-08-18 トークンgroup所属の独立性

- 通常トークン3個と連続疑似トークン2個を共通列の5要素とし、要素数2以上の全26部分集合を実ブラウザのV操作で作る性質テストを追加。
- 各subsetでinner_json members、display primitive集合、underline segmentのprimitive和集合、下線本数、DOMのgroup所属が選択集合と完全一致することを検証。
- 全26ケースが追加時点で成功し、意味構造上の独立性を固定。ただし、この時点の検証は下線本数までで実座標を含まず、後続の提供ケースで描画幅だけが未選択要素へ伸びる問題が判明。
- ブラウザテスト結果: 85 passed。

## 2026-08-18 同一境界の疑似トークン下線端点

- 提供inner_jsonをそのまま読み込み、`test2`から`test3`をV選択する回帰テストを追加。
- membersとdisplay primitiveは`pseudoIndex` 1,2だけで正しい一方、描画シェルの `refOrderKey()` が境界内indexを無視し、`test`も同じ位置と判定。下線左端が`test2`の537.6pxではなく479.8pxまで伸びる失敗を確認。
- DOM側の疑似トークン順序値にもcoreと同じ `gapTokenIndex` を加え、包含矩形と下線端点を正確なslotへ限定。
- 下線左端が`test2`より左へ出ず、未選択`test`と交差せず、右端が`test3`を越えないことを実座標で検証。
- ブラウザテスト結果: 86 passed。

## 2026-08-18 疑似トークンgroup端からの横移動

- 提供inner_jsonの`test2-test3` groupを選択し、`h`で直前の`test`ではなく通常token `his`まで飛ぶ問題をブラウザテストで再現。修正前は1 failed, 86 passed。
- 原因はgroup端の探索が`group.start/end`の境界番号だけを使い、同じ境界内の`pseudoIndex`順を失っていたこと。group内の候補を除外した後、その境界より外の通常tokenへフォールバックしていた。
- groupが再帰的に含む葉を共通トークン列へ投影し、方向ごとの端indexの直隣を返す`tokenSequenceNeighborOfRefs()`を追加。
- 通常時とV選択中の両方で、`test2-test3`から左へ移動すると`test`へ着地することを検証。ブラウザテスト結果: 87 passed。

## 2026-08-18 行移動のj/k方向修正

- 行フォールバックだけが通常のVim方向と逆で、`k`が次行、`j`が前行へ移動していた。
- 先に2列の往復テストを`j=次行`、`k=前行`へ修正し、`j`でword 0からword 2へ移れない失敗を確認。修正前は1 failed, 86 passed。
- `moveToAdjacentSentence()`へ渡す符号を、`down`で`+1`、`up`で`-1`へ変更。
- 最上位groupで下方向の構造候補が尽きた場合も、`j`で次行へ移る期待に更新。
- ブラウザテスト結果: 87 passed。

## 2026-08-18 文ad標識

- `sad`入力が`文ad`にならず`S`になる失敗をブラウザテストで確認。修正前は1 failed, 87 passed。
- `s`の保留入力へ`sa`分岐を追加し、続く`d`で`文ad`を確定するよう変更。`s`と`s'`の既存入力は維持。
- 画面内のショートカット一覧と操作ガイドへ`sad`を追加。
- ブラウザテスト結果: 88 passed。

## 2026-08-18 疑似トークンを修飾先に指定

- `a`のslotで`r`を開始して疑似トークンをクリックすると、矢印始点の`arrowDraft`が消えて確定できない問題をブラウザテストで再現。修正前は1 failed, 88 passed。
- 疑似トークンのクリック時に終点選択を取り消さず、現在位置だけを疑似トークンへ移すよう変更。
- クリックと`h/l`の両経路で、終点が`{pseudoToken:1,pseudoIndex:0,port:'single'}`としてinner_jsonへ保存されることを検証。当時のSVG検証はmarker定義内のpathも数える広すぎるselectorで、矢印本体の欠落を検出できていなかった。
- ブラウザテスト結果: 89 passed。

## 2026-08-18 下線内の空slotへの矢印先端

- 下線group内の空single slotを`r`の終点にしたケースをブラウザで再現。slot上端52px、下端72pxに対して矢印先端が73pxとなり、見えないslotの下端を指す失敗を確認。修正前は1 failed, 89 passed。
- 終点がgroup参照ではなく、表示値が空で、通常下線groupに再帰的に含まれる場合を`arrowTargetUsesTop()`で判定。
- 該当時だけSVG pathの最終Yをslotの`top-1`へ変更。通常の終点は従来の`bottom+1`を維持。
- 実座標で矢印先端がslot上端の1px上に一致し、下端ではないことを検証。ブラウザテスト結果: 90 passed。

## 2026-08-18 文末疑似Vへの矢印・行単位移動・BORDER復帰

- 提供inner_jsonの要点を再現し、第1行末`didn’t`のdouble右`ad`から文末疑似トークン`do`の`V`へ`r l Enter`しても矢印を確定できないテストを追加。
- あわせて、第2行上の`0/$`が文書全体の先頭・末尾へ飛ぶ問題、疑似トークン直前のBORDERを終了しても通常tokenへ戻る問題を追加。修正前は3 failed, 90 passed。
- 純粋関数`sentenceIndexForGap()`を追加。改行共有境界は描画位置と同じ左側の行へ所属させ、矢印の同一文判定、group判定、inner_json保存で共通利用。
- `0/$`は現在行に所属する共通token列の最初・最後を選ぶよう変更。通常tokenのdouble/T slotと行端疑似トークンも共通の横移動targetへ変換する。
- BORDER終了時は境界の`gap/offset`から直右の共通token列要素を求め、疑似トークンなら`gapTokenCursor`へ復帰。BORDERへの入場位置とBackspace規則は維持。
- ブラウザテスト結果: 93 passed。

## 2026-08-18 分割token内部と隣接疑似トークンの移動順

- double tokenの直右に疑似トークンがある状態で、左slotから`l`を押すと右slotを飛ばして疑似トークンへ移る失敗を確認。修正前は1 failed, 93 passed。
- 原因は共通token列の隣接疑似トークンを、double/T内部の左右移動判定より前に早期返却していたこと。
- 左から右、右から左へtoken内部を移動する場合は疑似トークン早期返却を抑止し、既存の共通横移動計算へ渡すよう変更。外側slotから次に進む場合は従来どおり疑似トークンを選ぶ。
- 文末疑似Vの回帰テストも提供データ同様に共有境界の両sentenceへ`pseudoTokens`がある形へ強化し、`r $ Enter`で文跨ぎエラーが出ず第1文の矢印として保存されることを検証。
- ブラウザテスト結果: 94 passed。

## 2026-08-18 +標識

- NORMALで`+`を押しても空slotのままになる失敗をブラウザテストで確認。修正前は1 failed, 94 passed。
- `+`を単独キーで即時確定する標識として`simpleMarkMap`とNORMALの標識キー受付へ追加。
- ショートカット一覧と操作ガイドへ追加。ブラウザテスト結果: 95 passed。

## 2026-08-18 疑似トークン終点の矢印描画

- 提供inner_jsonには`didn’t`右`ad`から行末疑似`V`への矢印が正しく保存されていたが、画面に矢印本体が表示されない状態を確認。
- テストselectorを`#arrowLayer path`から矢印本体だけを表す`#arrowLayer > path[marker-end]`へ修正し、marker定義用pathによる誤検知を除去。修正前は2 failed, 93 passed。
- 原因は`makeArrowLayout()`が疑似トークンにもword indexを要求し、行indexが`-1`になってlayoutを破棄していたこと。疑似トークンは実DOMの`.word`矩形から表示行を求めるよう変更。
- 矢印の前後判定に使う`flattenedDisplayOrder()`も共通token列へ移し、行末疑似トークンを直前tokenの右側として扱う。
- inner_json保存、`r l Enter`、既存矢印の再描画、実際のmarker付きSVG path生成を検証。ブラウザテスト結果: 95 passed。
