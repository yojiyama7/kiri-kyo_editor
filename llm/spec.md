# リー教・構造図ミニエディタ 仕様メモ

最終確認日: 2026-08-21

## 概要

`index.html` だけで動作する、リー教の英文構造図を作るためのブラウザ内ミニエディタ。
外部ビルド手順や依存パッケージはなく、HTML を直接ブラウザで開けば動く構成。

active規則の完全な列挙は `llm/rules.json` を正本とし、`llm/rule-audit.md` と `llm/rule-pair-audit.csv` はそこから生成する。

画面は以下で構成される。

- 英文入力 `textarea#input`
- 構造図表示・編集領域 `#workspace`
- 下線描画レイヤ `#groupLayer`
- 矢印描画 SVG `#arrowLayer`
- リアルタイム内部表現 `textarea#internalJson`
- 標識ボタンのツールバー
- 操作ガイド

## 入力と文分割

- 入力テキストは空白区切りで token 化される。
- 改行は文境界として扱う。
- 下線 group、T、矢印は文境界を跨げない。
- 英文を編集すると、同じ index にある既存の標識や構造は可能な範囲で維持される。
- token / range の番号は内部 JSON では文ごとに 0 から振り直される。

## 主要な内部状態

- 文ごとの`SentenceState`が通常token、疑似token、全境界記号、UnderlineGroup、矢印、論理cursorを所有する。
- `SentenceState.tokens`と`token_chain`が通常tokenの正本である。
- `pseudo_tokens`と`boundary_items`が文内の補助surfaceを所有する。
- `underline_groups`がV下線groupの正本であり、global `groups[]`は置かない。
- `arrows`が文内の矢印をSlotIdまたはBoundaryItemId端点で所有し、global `arrows[]`は置かない。
- undo/redo履歴にはSentenceStateを保存し、境界・疑似token・矢印の並行配列や旧group projectionは保存しない。編集中の選択と矢印draftだけをcontrollerが管理する。

## 型付きSentenceStateモデル

段階移行用の構造モデルを `editor-model.d.ts` と `editor-model.js` に分離している。

- `editor-model.d.ts` は `Mark`, Slot群, Token群, `BoundaryItem`, `ArrowEndpoint`, `Arrow`, `UnderlineGroup`, `SentenceState` の型定義の正本。
- `editor-model.js` はブラウザで同じモデルを検証する実行時層。`window.KiriEditorData.model` から参照できる。
- `Mark`は既知literalと`string`のunionで、任意入力文字列も保持する。既知コード`o/c/con/pre/ap`はそれぞれ画面表示の`O/C/接/前/同格`へ対応する。
- `createSentenceState()` は入力を検証して複製し、呼び出し元の値と状態を共有しない。
- `Token`は`id`, `text`, `word_slot`を持ち、表面文字列とslotを直接所有する。
- `validateSentenceState()` はTokenId、GroupId、文内SlotId・BoundaryItemIdの一意性、token chain、疑似token、全境界記号、矢印端点、groupの`child_ids`、group参照の非循環性、論理cursorを検査する。
- `token_chain` は全tokenを重複なくちょうど1回含む。
- composite slot自身と内部atomic slotは、それぞれ独立したSlotIdを持つ。
- `TSlot.pre_slot`と`post_slot`は設計上どちらも必ず`AtomicSlot`であり、この不変条件を互換都合で拡張しない。`replaceWordSlotWithT()`はAtomicSlotだけをT化し、DoubleSlotは拒否する。`restoreWordSlotFromT()`はpre_slotをWordSlotへ戻す。
- T解除時、T本体を参照していたgroup memberは復元slotへ移し、消滅する`post_slot`へのgroup参照は削除する。
- underline groupのidentityはSlotIdと別名前空間の`GroupId`で表す。親groupは子group全体を`childGroup.slot.id`で参照する。

runtimeのtoken、疑似token、境界、group、矢印はSentenceStateだけを正本とする。inner_json version 1の位置参照は読込・保存adapterでSlotId／BoundaryItemIdと相互変換する。

## Slot モデル

通常tokenは`Token.word_slot.slot`に次のいずれか1つを保持する。

```ts
AtomicSlot | DoubleSlot | TSlot
```

- `AtomicSlot`: 1つの内部markコードを持つ。
- `DoubleSlot`: 元Atomicを`lslot`として保持し、独立した`rslot`を持つ。
- `TSlot`: 元Atomicを`pre_slot`として保持し、独立した`post_slot`を持つ。
- `tokens[]`, `workSlots[]`, `verbals[]`の並行配列はruntime stateに置かない。表示上のword indexは`token_chain`から導出し、token状態の正本にしない。
- 既知markは内部コードで保存し、描画時に`S/V/O/C/接/前/同格`などへ変換する。未知の任意文字列はそのまま表示する。
- `enabled`はword slotへ保存せず、外側group Tの包含関係から導出する。
- Atomic→Double/Tでは元AtomicのSlotIdを維持し、解除時にそのAtomic自身をWordSlotへ戻す。生存tokenと後続tokenのIDは振り直さない。
- inner_json version 1のsingle/double/verbal構造は読込・保存adapterで新Slot unionと相互変換する。旧Tが隠し元標識と表示左標識に異なる値を持つ場合は、表示左標識を`pre_slot`へ正規化する。

### 共通トークン列

- 通常トークンと疑似トークンの表示順は、純粋関数 `createTokenSequence()` が返す1本の列を正本とする。
- 通常トークン要素は `{kind:'token', index}`、疑似トークン要素は `{kind:'pseudo-token', gap, index}`。
- V選択順、ナビゲーション葉順、横移動の隣接判定、文内表示候補、BORDER位置、下線primitive順、描画順はこの列から導出する。
- 通常トークンのsingle/double/T左右への展開は、共通列上の通常トークン要素を得た後に行う。要素の並びとslot構造を同じ関数で扱わない。
- 通常トークンと疑似トークンを個別に走査して同じ表示順を再構築する関数を追加しない。

### Slot geometry

- 全slotカーソルの矩形は `editor-core.js` の純粋関数 `calculateSlotGeometry()` で算出する。
- 入力は layout、side、左右の文字幅、利用可能幅、最小幅、padding、共通高さ。
- layout は `single`, `double-pair`, `t-pair`, `underline`。
- 戻り値は slot の `width`, `minWidth`, `height`, `left` と `containerWidth`。
- DOM側は文字幅だけを計測し、`slotGeometry()` で純粋関数へ渡し、`applySlotGeometry()` で結果を反映する。
- 通常slot、double左右、token T左右、group標識、group T左右、V下線、V選択カーソルは同じ経路を使う。
- BORDER位置カーソルと文末ダミーはslotではないため、このgeometryの対象外。`[` の境界slotはsingle geometryを使う。

token Tとgroup Tの表示上の左・右は、それぞれ`pre_slot`と`post_slot`である。groupのSlot変換は外側SlotIdを維持する。

## V 下線 group

V下線groupは文ごとの`SentenceState.underline_groups`に保持する。

```ts
type UnderlineGroup = {
  id: GroupId;
  kind: "underline_group";
  child_ids: SlotId[];
  slot: Slot;
};
```

- `child_ids`は同じ文に存在するtoken、疑似token、境界、子groupのSlotIdを参照する。
- 重複、不明ID、自己参照、循環参照を拒否し、複数親から同じ子groupを参照することは許可する。
- group標識とT状態は`group.slot`だけを正本とする。
- 旧`members`、`segments`、`start/end`、`mark`、`verbal`は保存しない。v1 member参照と描画regionはSlotIndexから導出する。
- 文書レベルの参照は`sentence_idx`とGroupIdまたはSlotIdを組にする。GroupIdとSlotIdは文内一意であり、別文の同じ数値を区別する。
- 描画viewは`childRefs`、`regions`、`startWord/endWord`、`slot`をSentenceStateから導出するだけで、状態・履歴・保存形式には含めない。
- underlineとAtomic group slotは同一論理cellである。markが空なら下線上、markがあればmark位置へカーソルを表示する。
- 連続範囲なら 1 本の下線、非連続範囲なら複数下線として描画される。
- 非連続groupの対応色はdisplay_jsonで決め、文書状態には保持しない。
- 重なり、包含、同一範囲の group を許す。
- group 自体も single slot を持ち、標識を付けられる。
- V groupは従来どおり合計2slot以上で確定する。連続疑似トークンの一部だけを複数slot groupへ含めた場合、選択した境界内indexだけをmemberとし、隣接する未選択疑似トークンを含めない。
- 合計2slot以上というgroup全体の条件を除き、共通トークン列の各通常トークン・疑似トークンは互いに独立してinclude/excludeできる。group所属は選択した正確なslot参照との一致で決め、開始・終了rangeや同一境界、近接関係から補完しない。
- 混在する5表示要素では、要素数2以上の全26部分集合について、inner_json members、display primitive、underline segments、DOM所属が選択集合と一致することをブラウザで検証する。
- 同一境界の疑似トークン順序を比較するときは `gapTokenIndex` まで含める。下線の実座標は選択した最初・最後の疑似slotに一致し、同一境界の未選択疑似トークン領域へ伸ばさない。
- group を `t` で T 化すると左右 slot を持つ V 下線 T になる。
- `X` は V 下線 T なら T だけ外し、通常 V 下線なら group 自体を削除する。
- `U` は現在 group を解除して削除する。
- 重なるgroupは、包含されるgroupを上、包含関係がなければ短いgroupを上に配置する。
- 下線とV下線Tの横線は、重なるgroup群で共通の基準線を使い、上から27pxの固定間隔で配置する。
- 1つの下線区間が表示上の複数行へ折り返す場合、各行の線はその行のtoken・実標識・可視カーソルの局所下端を基準に置く。group全体の最下行Yを全行へ流用しない。包含・重なりによる27pxのlevel差は各行でも維持する。

## 境界記号

`SentenceState.boundary_items[localGap]`はtoken境界に置く境界記号の順序付き配列である。

各BoundaryItemは文内一意で安定したBoundaryItemIdを持つ。`[`だけがAtomicSlotを所有し、その他の`< > ( ) [ ]`は`slot:null`とする。inner_json v1保存時だけ記号列を`boundaries`へ連結し、`[`のslotを`boundarySlots[localGap][boundaryIndex]`へ投影する。`<`はslotを持たないが矢印端点になれる。

疑似tokenの正本は`SentenceState.pseudo_tokens`であり、identityには外側`word_slot.slot.id`を使う。1つの境界に疑似トークンを0個以上連続して置け、inner_jsonでは各sentenceの`pseudoTokens`へ保存する。旧形式の単一値はindex 0の配列として読み込む。

- 改行を挟む共有境界の疑似トークンは、実際に描画される改行前の行へ所属する。矢印の文判定とinner_json保存先も同じ規則を使う。

- 疑似トークンの表面文字列は臙脂色 `#800020` で表示する。
- 色以外は通常tokenのsingle slotと同じ選択対象として扱う。通常カーソルは同時に1つだけ表示し、`h/l`、V選択path、group member、再帰的な葉slot、下線区間、group T包含、`j/k`列移動へ参加する。
- 疑似トークンをクリックした場合は通常tokenのクリックと同じくNORMALへ戻してslotを選択する。INSERTやBORDERなど直前のモードによって青カーソルを抑止してはならない。
- 疑似token・`[`の選択も論理`cursor.x/y`から解決する。専用の`gapTokenCursor`／`boundaryCursor`は保持せず、青カーソルは常に1つだけにする。
- group slotの外側に隣接する境界疑似トークンは、groupの端から `h/l` で外へ移動するとき通常tokenより先に選ぶ。ただし、その疑似トークンがgroup自身の再帰的な内部memberなら横移動で外部候補とはみなさない。
- group memberのinner_json参照は `{pseudoToken: localBoundaryIndex, pseudoIndex: indexWithinBoundary, port:'single'}`、純粋コアのprimitive keyは `pseudo-token:<boundary>:<pseudoIndex>:single` とする。

- 境界位置 0 は文頭。
- 境界位置 `tokens.length` は文末。
- NORMALでは開き記号 `[ < (` を現在単語の左境界、閉じ記号 `) ] >` を現在単語の右境界へ追加する。BORDERでは選択中の境界へ6記号をそのまま追加する。
- NORMALで `[` を作成した直後は、その境界slotを通常カーソルで選択する。クリックでも選択でき、通常の標識キー列で働きの標識を入力できる。
- `<` はslotを持たず、通常slot移動の対象にもならない。BORDERで現在境界に `<` があるとき `r` を押すと、その境界文字自体を始点にして矢印選択へ移る。同じ境界に複数ある場合は文字列内で最後の `<` を使う。
- `b` で境界編集モードに入り、`h/l/0/$` で境界を移動できる。
- 境界編集モードの表示順では通常tokenと疑似トークンをどちらも1要素として数える。疑似トークンがn個ある境界には前・間・後のn+1位置があり、`h/l` 1回で疑似トークン1個を跨ぐ。
- 境界編集モード中の `/` は現在位置へ新しい疑似トークンを挿入する。確定後もBORDERに留まり、カーソルは挿入した疑似トークンの直後へ移る。
- 境界編集モード中の `Backspace` はカーソル直前が疑似トークンならその1個だけを削除する。groupのSlotId参照と矢印のEndpoint参照は位置indexに依存せず、削除対象を参照するものだけを同じ純粋操作で整理する。
- 境界編集モードを終了したときは現在境界の直右のsurface tokenへ戻る。直右が疑似トークンならその正確な境界内indexを選択し、右側要素がない文書末だけ最後のsurface tokenへ戻る。
- NORMALで疑似トークンを選択中の `e` は表面文字列を編集する。通常の `/` は従来どおり疑似トークンのsingle slot内容を編集する。
- 境界編集モードでは `x`/`Delete` で現在境界の境界記号を全削除する。

## 修飾矢印

`SentenceState.arrows`は同じ文内の`{from,to}`配列である。通常token、疑似token、group、T/Double内部port、`[`は`{kind:'slot',slot_id}`、slotなし境界は`{kind:'boundary',boundary_id}`で参照する。

- 始点にできるのは、表示値が `a`, `ad`, `副詞的目的格`, `同格` の slot、またはBORDERの `r` で指定したslotなしの `<` 境界文字。
- `r` で矢印作成を開始し、移動後 `Enter` で確定。
- 終点には通常トークン、疑似トークン、groupの有効なslotを指定できる。疑似トークンはクリックまたは `h` / `l` 移動で選択し、inner_jsonでは `{pseudoToken, pseudoIndex, port:'single'}` として保存する。
- 疑似トークンを端点とする矢印の表示行は、word indexではなく疑似トークンDOMが属する実際の表示行から求める。矢印の左右順は通常・疑似トークン共通列を使う。
- 終点が通常の下線groupに含まれる空slotの場合、見えないslotの下端ではなく上端の1px上へ矢印の先端を置く。標識文字のあるslot、下線外のslot、group slotは従来どおり下端を使う。
- 1 つの始点から保持できる矢印は 1 本。新規確定時に既存矢印は付け替えられる。
- 文境界を跨げない。
- `R` で現在 slot を始点とする矢印を削除する。
- slot が無効化されたり、始点標識が対象外になった場合は `cleanupArrows()` で削除される。
- `arrowDraft`は`{sentence_idx,endpoint}`だけを持つcontrollerの一時状態で、保存・履歴・現在位置の正本にはしない。

## inner_json / display_json

`Core.createInnerJson()` が表示情報を含まないセーブ用のinner_jsonを作る。
`Core.stateFromInnerJson()` で編集状態へ復元でき、再度inner_jsonへ変換すると同じ正規形になる。

トップレベル:

```json
{
  "text": "入力全文",
  "sentences": []
}
```

各文の主要部分:

```json
{
  "tokens": [
    {"slot": {"kind": "single", "text": "S"}}
  ],
  "structures": [],
  "boundaries": {},
  "arrows": []
}
```

inner_jsonの構造:

- 単語 T: `{kind:"verbal", token, form:"T", slots:{left,right}}`
- V 下線 group: `{id, kind:"group", members, form:"underline"|"T", mark, slots?}`
- `ranges`, 高さ、level、offset、色はinner_jsonへ入れない。
- 文文字列とtoken文字列はトップレベル`text`から一意に復元できるため重複保存しない。
- single slotは`{kind:"single",text}`、double slotは`{kind:"double",left,right}`だけを持つ。

参照:

- token slot: `{token: 0, port: "single"|"left"|"right"}`
- group slot: `{structure: groupId, port: "single"|"left"|"right"}`
- boundary slot: `{boundary: localBoundaryIndex, boundaryIndex: indexWithinBoundaryString, port: "single"}`

空の構造、空の境界、空の矢印など任意フィールドは JSON に出さない。token・疑似tokenの必須slotは内容が空でも保持する。

`Core.createDisplayJson(innerJson)` はinner_jsonを複製し、各文へ次の表示情報を追加する。

- `primitiveSlots`: group自身と子groupが再帰的に含む基礎slot集合
- `sharesWith`: 基礎slot集合に共通部分があるgroup ID
- `contains`: 基礎slot集合の真包含または構造上の子孫group ID
- `structuralDepth`: 子group包含の深さ
- `level`, `lineOffset`: 下線の段と27px単位の高さoffset
- `linkColor`: 非連続下線の表示色

基礎slotは通常tokenのsingle slot、`d`のleft/right、tokenまたはgroup Tのleft/right。groupの`single`参照は子groupが含む基礎slot集合へ再帰展開する。ただしgroup Tの`left`/`right`参照は再帰展開せず、それぞれ独立した基礎slotとして保持する。

## 主要キーボード操作

モード:

- `NORMAL`: 構造編集
- `i`: INSERT へ移行
- `Esc`: NORMAL へ戻る、または保留・選択をキャンセル

移動:

- `h` / `l`: 表示 slot を左右移動。同じ表示高の隣tokenの実slot、親groupの直接兄弟、同じ連続下線区間の葉slotという優先関係を使う。同じ連続区間の探索段階では、方向側に葉slotがあれば内容が空でも優先する。
- 非連続下線の区間端から区間間gapの方向へ `h/l` すると、別区間へ直接飛ばず、表示上隣接する未所属slotへ空でも移動する。たとえば `is` と `taking` が同じ非連続groupで `she` が未所属なら、`is` の `l` と `taking` の `h` はともに `she` へ移る。
- `h` / `l` が行境界を跨ぐ場合、移動先行の境界tokenに実表示slotがあれば、そのtokenを内包するgroupのslotより境界token自身を優先する。たとえば次行先頭からの `h` は前行末tokenの表示slotへ戻る。
- double/Tの左右slotを持つtokenに隣接して疑似トークンがあっても、token内部の移動を先に行う。左slotから`l`で右slot、右slotから`h`で左slotへ移動し、外側slotからさらに進んだときだけ隣接疑似トークンへ出る。
- `j`: 下移動。現在列を保ったまま、内側 slot から包含 V 下線へ一段ずつ移動。構造上の移動先がなければ次の行へ移動する。
- `k`: 上移動。現在列を保ったまま、V 下線からその列を再帰的に含む直接の子groupまたは内部slotへ一段ずつ移動。構造上の移動先がなければ前の行へ移動する。
- 行を跨ぐ `j/k` は移動前slotと表示Xが最も近いslotを選ぶ。文を跨ぐgroupを作れないV選択中は行フォールバックを行わない。
- `0`: 現在行の最初のsurface token。行頭疑似トークンも含む。
- `$`: 現在行の最後のsurface token。行末疑似トークンも含む。

標識:

- `s`: S
- `s'`: S'
- `v`: V
- `o`: O
- `c`: C。ただし `con` で 接
- `m`: M
- `pre`: 前
- `a`: a
- `ad`: ad
- `ado`: 副詞的目的格
- `ap`: 同格
- `sad`: 文ad
- `ead`: 誘導ad
- `ac`: aC
- `aux`: aux
- `nc`: nC
- `+`: +
- `1`..`5`: `(1)`..`(5)`
- `-` + `3`..`5`: `-(3)`..`-(5)`
- `/`: 任意文字列を直接入力
- `x`: 現在 slot の標識を削除

構造:

- `d`: 通常 slot と左右二重 slot を切り替え
- `t`: token または V 下線を T 化
- `X`: 選択中 T / V 下線構造を 1 段削除
- `V`: V 下線範囲選択開始、選択中は部分範囲固定
- `Enter`: V 下線選択または矢印選択を確定
- `U`: V 下線 group を解除
- `b`: 境界編集モード
- `[ < (`: NORMALでは現在単語の左境界へ追加
- `) ] >`: NORMALでは現在単語の右境界へ追加
- `r`: NORMALではa / ad / 副詞的目的格 / 同格slot、BORDERでは現在境界の `<` から矢印作成開始
- `R`: 現在 slot 始点の矢印削除

履歴:

- `u`: undo
- `Ctrl-r`: redo
- カーソル移動だけの操作は履歴に入らない。

保存:

- ツールバーの「保存」は現在のinner_jsonをlocalStorageへ保存する。
- 保存キーは `kiri-kyo-editor:inner-json:v1`。
- 起動時にversion 1の保存データがあれば自動復元する。
- 「保存削除」はlocalStorageの保存データだけを削除し、現在編集中の文書は変更しない。
- 不正JSONまたは未対応versionは自動復元せず、初期文書で起動する。

## 実装上の注意

- `editor-core.js` は DOM を参照しない functional core。状態を入力として受け取り、新しい状態を返す。
- `index.html` は描画、イベント、フォーカス、スクロールと、core の返した状態を画面へ適用する imperative shell。
- 文書全体は `splitSentenceStates()` で改行単位の `sentence_state` に分割する。各stateは文内token、境界・疑似token、group、矢印、global word offsetを持ち、layout・navigation・下線・矢印処理はこの1文stateを引数に取る。
- groupの文所属は一時的な描画segmentではなく、保存されるmembersを子groupまで再帰展開して決める。矢印は両端が同じ文stateに属する場合だけそのstateへ入る。
- logical navigation snapshotは現在文のcellだけを保持する。文数が増えても1回の文内移動で走査するcell数を文書全体のcell数へ比例させない。
- `h/l` と `j/k` はまず現在文だけで移動先を決める。文内候補がない場合だけdocument shellの行間adapterを呼び、`h/l`は隣文の表面端、`j/k`は隣文の最も近い論理xへ接続する。V選択中は文境界を跨がない。
- core の `evolve()` は入力を複製してから遷移を実行するため、呼び出し元の状態を変更しない。
- 状態の UI への読み書きは `readEditorState()` / `writeEditorState()` に集約する。
- 外部依存は見当たらない。
- DOM は `render()` で再構築され、下線と矢印はその後に描画される。
- 下線や矢印は DOM の `getBoundingClientRect()` に依存して配置されるため、見た目変更時はブラウザでの表示確認が重要。
- `syncFromInput()` は入力編集後に構造を可能な限り保持しつつ、文境界を跨いだ group や不正矢印を除去する。
- T 化・二重 slot 化・group 化は矢印の参照妥当性に影響する。変更時は `cleanupArrows()` の条件も確認する。
- enabled の再計算と矢印整合性処理は pure core の `refreshEnabled()` / `cleanupArrows()` を使う。
- `inner_json`欄の直下に主要操作の更新時間を表示する。計測区間はeditor内のkeydown開始から、その操作が予約したDOM・下線・矢印・navigation snapshot更新後の次taskまでとする。同じキーでも入力時のモードを区別し、通常移動、V選択開始、V選択中の移動、境界編集、矢印終点選択などの操作別に平均・直近・最大・回数を集計して平均の重い順に表示する。計測値は診断情報であり、SentenceState・履歴・保存形式へ含めない。
- V選択の開始・横移動・区間固定はSentenceStateを変更しないUI操作として扱う。本文DOMを再構築せず、既存slotの選択classを差分更新して現在文のgroup overlayだけを再配置する。V選択pathの包含判定は変更時に生成するSetを使い、slotごとにpathを線形探索しない。
- overlay描画は状態を変更してはならない。Slotのenabledや参照切れ矢印は構造から導出または編集操作内で整理し、描画のたびに文書状態をcloneしない。矢印previewを開始するときも、renderが予約するoverlay描画を同期的に重複実行しない。
- 現在位置の唯一の正本は、省略前の論理grid上の `navigationCursor={x,y}` である。semantic ref、token index、group ID、slot side、region、`display_y`、DOM要素、pixel座標および旧cursorフィールドは文書構造と論理座標から導出する情報であり、移動先を決める正本として参照しない。
- 文ごとのlogical gridが生成する全semantic refは`sentence_idx`を持つ。group cursorの描画対象は論理cursorから導出した`sentence_idx + GroupId + port`で照合し、文修飾されていない`renderGroupId`を複数文のDOMへ直接照合しない。通常青カーソルは文書全体で常に1つだけ表示する。
- 論理xは表面要素ごとの整数を基準とする。通常AtomicSlotは整数x、DoubleSlotの左右とTSlotのpre/postは `x` / `x+0.5` を使い、次の表面要素は次の整数xを使う。double/Tへの切替だけで後続要素を振り直さない。
- 論理yは1始まりとし、token・疑似token・境界のatomic slotを1、最内側groupを2、その親を3とする。構造参照が明示する親子関係は表示layoutのlevelへ反映されていなくても論理yへ反映する。
- group cellは再帰展開したatomic xを占める。非連続groupは、実在xを昇順に並べた軸上で連続する部分ごとにregionへ分ける。数値差1を連続性の定義にしない。
- 同一論理 `(x,y)` には高々1つのselectable cellだけを置く。構造編集後に衝突が生じた場合は不正なlogical gridとして検出する。
- 描画ごとに論理cellから `display_y` を導出する。空で非選択のatomicは0、標識・通常/V/固定cursor・編集中表示のあるatomicは1とする。groupは現在regionの直下論理段がすべて空なら `logical_y-1`、1つでも占有されていれば `logical_y` とする。省略量はcellごとに最大1で祖先へ累積しない。
- 矢印との衝突回避でgroupが通常配置より押し下げられた場合、その離散段数を `arrowRowOffset` としてgroupの `display_y`へ加える。押し下げが重なり・包含groupへ伝播して実際の描画位置も下がった場合は、そのgroupにも実際の差分段数を加える。矢印回避offsetを論理cursorのyへ書き戻さない。
- groupを選択して空slotのcursorを表示した場合、そのgroupは親groupの直下段を占有する。`display_y` は再描画で変化してよいが論理 `{x,y}` へ書き戻さない。
- 通常時とV選択中の `h` / `l` は同じ規則を使う。キー入力開始時のlogical gridと表示snapshotを固定し、実在x軸上を方向へ進み、現在region外の最初のxで `candidate.display_y <= current.display_y` を満たす候補のうち最大の `display_y` を選ぶ。
- 省略atomicの `display_y=0` も候補に残す。同じx・表示段で候補が競合する場合は可視候補を優先する。移動先確定後の再描画による省略・展開は次のキー入力からだけ使う。
- 分割groupへ外部から入る場合は到着xを維持し、そのxを含むregionだけを選択表示する。クリック時も最寄りの実在xを論理cursorへ設定する。
- `j` / `k` は同じxを含む省略前の論理yを使う。`0` / `$` と文跨ぎfallbackは到着cellの論理 `{x,y}` を設定する。
- 構造編集で現在cellが消えた場合だけcursorを修復する。同じxで `logical_y <= 旧y` の最大cellを選び、それもなければ最寄りatomic xのy=1を選ぶ。描画、snapshot再生成、resize、scrollはcursorを修復・変更してはならない。
- V選択中はactive区間・固定済みオレンジ区間の有無にかかわらず `j` / `k` を使える。入れ子groupは構造深さに従い一段ずつ移動し、深さを固定値に制限しない。
- `U` は通常時だけでなくV選択カーソル表示中にも有効。内部slot上ではそれを含む最内側groupを削除し、親groupの削除対象参照は対象groupの直接membersへ展開して参照切れを残さない。
- V選択中の正本は開始・終了rangeではなく、カーソルが実際に通過したslot参照のpath。経由していないslotを選択候補へ含めない。
- V選択で直前に通ったslotへ戻るとpath末尾を削除する。確定時のみ、選択済みslotを表示順上で隣接する連続区間へ圧縮する。
- 下線内のslotに通常・V選択中・固定済みのいずれかのカーソル表示が1つでもある場合、下線は疑似要素を含む全カーソルの可視下端より下へ配置する。
- 別groupのT内部`left/right`を直接memberに持つ下線は、子group描画後の対象slot実下端より下へ置く。同じ表示行にある分割regionにもそのbaselineを共有する。
- カーソルによる下線の最小Y補正は、そのカーソルを実際に含むgroupだけへ適用する。内側groupが下がった場合は外側groupへ固定間隔を伝播するが、外側groupのカーソル補正で内側・兄弟groupを押し下げてはならない。
- 矢印の水平・垂直線分が、矢印自身の端点ではないgroup標識slotまたはgroup T slotで実際に描画された文字の範囲を横切る場合、そのgroupのslotと下線全体を固定間隔27pxだけ下げる。文字のない透明なslot余白を通るだけなら衝突とはみなさない。文字範囲はDOM Rangeで測り、線幅ぶん1pxだけ拡張する。内側groupが下がった結果は、既存の重なり規則によりそれを包む外側groupへ伝播する。この補正は表示時に導出し、inner_jsonへ保存しない。
- 複数矢印の水平範囲が重なっても、基本レーンの実Y座標が異なる場合は同じ矢印レベルを使う。実Y座標も重なる場合だけ12px単位で別レベルへ送る。
- 矢印の水平線は、X範囲が重なる無関係な下線の2px線とその直下group標識slotの下端までを予約帯として避ける。候補Yが予約帯内なら、帯を完全に抜けるまで12px刻みで下のレーンへ送る。ただし矢印の両端を再帰的に含むgroup自身の帯は障害物から除外し、内部矢印の始点縦線を基本15pxより伸ばさない。このレーン選択では縦線との交差は障害としない。
- 矢印の端点、端点から導出するword・表示行、下線障害物、group標識衝突、押下げ対象は必ず`sentence_idx + GroupId`で解決する。GroupIdは文内名前空間なので、アクティブな文や同じGroupIdを持つ別文のgroupを現在文の経路障害物や端点として扱ってはならない。同一表示行にある両端は、別文を選択した後も同一行経路のままでなければならない。
- 確定した矢印levelを含む水平レーンの下端が次の表示行へ達する場合、不足する縦幅を矢印を所有する文の表示領域として予約する。明示的な文末では直後の`.sentence-break`のheight、同一文内の折返しでは表示行margin、最終文では`.sentence`のbottom paddingへ割り当てる。後続行は予約量だけ下へ移動し、矢印の横線・矢尻との間に7px以上の余白を持つ。予測layoutでの予約後、最終SVG pathへ付与した所有文と実lane Yを再測定し、level再計算後の横線も文のheight内に収まるまで文末heightを補正する。予約量の変更後は後続行のgroup overlayを新しいDOM座標へ再配置する。この余白は表示時だけ導出し、SentenceStateやinner_jsonへ保存しない。
- 通常青、V選択の灰色、固定済みオレンジを含む全カーソルは、slot種類にかかわらず常に2pxの可視borderと20pxの縦幅を持つ。固定済み下線は `::before` のオレンジ枠、現在位置は `::after` の灰色枠を使い、重なっても両方を表示する。
- 下線の表示区間はtoken indexや直接memberの隣接では決めない。通常slot、double左右、T左右を葉slotとし、group memberを再帰展開した葉集合を全葉slot順で連続区間へ分ける。
- token TだけでなくgroupをT化した場合も、`left`と`right`は独立した基礎slotである。別の下線groupは`{structure, port:'left'}`または`{structure, port:'right'}`として片側だけをmemberにでき、display_jsonでは`structure:<id>:left/right`を別々のprimitive slotとして保持する。
- 再帰展開した葉slotが連続する部分は1本の下線にする。選択されていない葉slotが間にある部分は下線を分割し、各区間の内側端を同色のマークで間接接続する。
- `display_json` の各groupが持つ `underlineSegments` は上記の葉slot連続区間であり、`inner_json` の意味上の正本である `members` から毎回導出する。
- `window.KiriEditorData` の `getInnerJson()`, `getDisplayJson()`, `loadInnerJson()` が保存・表示・復元の境界で、`getNavigationSnapshot()`は現在文の描画済みgrid、`getSentenceProcessingSnapshot()`は文分割状況を診断用コピーとして返す。
