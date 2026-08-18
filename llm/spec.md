# リー教・構造図ミニエディタ 仕様メモ

最終確認日: 2026-08-18

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

スクリプト内の主要状態は以下。

- `mode`: `NORMAL` または `INSERT`
- `tokens`: 入力から作られた単語列
- `sentenceRanges`: 各文の `{index, text, start, end}`
- `workSlots`: 各 token の働きの標識 slot
- `verbals`: 各 token の準動詞 T 状態
- `groups`: V 下線 group
- `gaps`: token 境界に置く境界記号
- `boundarySlots`: `gaps` の文字位置に対応する `[` / `<` のsingle slot
- `gapTokens`: token境界ごとの疑似トークン列。各疑似トークンは表面文字列とsingle slotを1つ持つ
- `arrows`: 修飾矢印
- `cursor`, `cursorSlot`: 現在選択中の token と slot
- `groupCursorId`, `groupCursorSlot`, `groupCursorTarget`: V 下線 group 選択状態
- `groupSelection`: V 下線作成中の範囲選択状態
- `arrowDraft`: 矢印作成中の始点
- `markUndoStack`, `markRedoStack`: undo / redo 用履歴

## Slot モデル

通常 token の働きの標識は `workSlots[index]` に保持される。

```js
{ enabled, kind: 'single' | 'double', text, left, right }
```

- `single`: `text` を表示する。
- `double`: `left` と `right` の 2 slot を持つ。
- T 化された token や V 下線 T の内部 token では、元の slot 値は保持したまま `enabled=false` になる。
- inner_jsonには、Tなどで現在非表示の元slotも復元可能な形で保持する。

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
- BORDER位置カーソルと文末ダミーはslotではないため、このgeometryの対象外。`[` / `<` の境界slotはsingle geometryを使う。

T は左右 slot を持つ。

```js
{ on, slots: { left: {enabled, text}, right: {enabled, text} } }
```

## V 下線 group

V 下線 group は `groups` に保持される。

```js
{
  id,
  members: [slotRef],
  segments: [{ startRef, endRef }],
  start,
  end,
  mark,
  verbal
}
```

- `members` はgroupが直接選んだslot参照で、意味構造の正本。
- `segments`, `start`, `end` はmembersから導出する描画用キャッシュ。
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

`gaps` は token 境界に置く文字列配列。長さは `tokens.length + 1`。

`[` と `<` は文字列内の出現位置に対応するsingle slotを持つ。runtimeでは `boundarySlots[gap][boundaryIndex]`、inner_jsonでは `boundarySlots[localGap][boundaryIndex]` にslotを保存し、参照は `{boundary, boundaryIndex, port:'single'}` とする。同じ境界に複数記号があっても文字位置で区別する。

`gapTokens` は `gaps` と同じ境界indexを使う配列で、各要素は `{text, slot}` の配列。1つの境界に疑似トークンを0個以上連続して置ける。inner_jsonでは各sentenceの `pseudoTokens` objectへローカル境界indexをキー、疑似トークン配列を値として保存する。旧形式の単一 `{text, slot}` はindex 0の1要素配列として読み込む。疑似トークンは原文 `text` を変更せず、通常tokenと同じ文字段とsingle標識slotを表示する。

- 改行を挟む共有境界の疑似トークンは、実際に描画される改行前の行へ所属する。矢印の文判定とinner_json保存先も同じ規則を使う。

- 疑似トークンの表面文字列は臙脂色 `#800020` で表示する。
- 色以外は通常tokenのsingle slotと同じ選択対象として扱う。通常カーソルは同時に1つだけ表示し、`h/l`、V選択path、group member、再帰的な葉slot、下線区間、group T包含、`j/k`列移動へ参加する。
- 疑似トークンをクリックした場合は通常tokenのクリックと同じくNORMALへ戻してslotを選択する。INSERTやBORDERなど直前のモードによって青カーソルを抑止してはならない。
- BORDERへ入る時点と疑似トークン作成確定時に、直前のword/group cursor stateを解除する。`gapTokenCursor` が有効な間はword/group側の青カーソルを描画せず、青カーソルは常に1つだけにする。
- group slotの外側に隣接する境界疑似トークンは、groupの端から `h/l` で外へ移動するとき通常tokenより先に選ぶ。ただし、その疑似トークンがgroup自身の再帰的な内部memberなら横移動で外部候補とはみなさない。
- group memberのinner_json参照は `{pseudoToken: localBoundaryIndex, pseudoIndex: indexWithinBoundary, port:'single'}`、純粋コアのprimitive keyは `pseudo-token:<boundary>:<pseudoIndex>:single` とする。

- 境界位置 0 は文頭。
- 境界位置 `tokens.length` は文末。
- NORMALでは開き記号 `[ < (` を現在単語の左境界、閉じ記号 `) ] >` を現在単語の右境界へ追加する。BORDERでは選択中の境界へ6記号をそのまま追加する。
- NORMALで `[` / `<` を作成した直後は、その境界slotを通常カーソルで選択する。クリックでも選択でき、`[` には通常の標識キー列で働きの標識を入力できる。
- `<` の境界slotは標識値が空でも `r` の始点にできる。`h/l` では同じ表示順の隣接する境界slot・疑似トークン・通常トークンへ移動する。
- `b` で境界編集モードに入り、`h/l/0/$` で境界を移動できる。
- 境界編集モードの表示順では通常tokenと疑似トークンをどちらも1要素として数える。疑似トークンがn個ある境界には前・間・後のn+1位置があり、`h/l` 1回で疑似トークン1個を跨ぐ。
- 境界編集モード中の `/` は現在位置へ新しい疑似トークンを挿入する。確定後もBORDERに留まり、カーソルは挿入した疑似トークンの直後へ移る。
- 境界編集モード中の `Backspace` はカーソル直前が疑似トークンならその1個だけを削除する。後続疑似トークンを参照するgroup・矢印の境界内indexは純粋関数で補正する。
- 境界編集モードを終了したときは現在境界の直右のsurface tokenへ戻る。直右が疑似トークンならその正確な境界内indexを選択し、右側要素がない文書末だけ最後のsurface tokenへ戻る。
- NORMALで疑似トークンを選択中の `e` は表面文字列を編集する。通常の `/` は従来どおり疑似トークンのsingle slot内容を編集する。
- 境界編集モードでは `x`/`Delete` で現在境界の境界記号を全削除する。

## 修飾矢印

`arrows` は `{from, to}` の配列。

- 始点にできるのは、表示値が `a`, `ad`, `副詞的目的格`, `同格` の slot、または `<` の境界slot。
- `r` で矢印作成を開始し、移動後 `Enter` で確定。
- 終点には通常トークン、疑似トークン、groupの有効なslotを指定できる。疑似トークンはクリックまたは `h` / `l` 移動で選択し、inner_jsonでは `{pseudoToken, pseudoIndex, port:'single'}` として保存する。
- 疑似トークンを端点とする矢印の表示行は、word indexではなく疑似トークンDOMが属する実際の表示行から求める。矢印の左右順は通常・疑似トークン共通列を使う。
- 終点が通常の下線groupに含まれる空slotの場合、見えないslotの下端ではなく上端の1px上へ矢印の先端を置く。標識文字のあるslot、下線外のslot、group slotは従来どおり下端を使う。
- 1 つの始点から保持できる矢印は 1 本。新規確定時に既存矢印は付け替えられる。
- 文境界を跨げない。
- `R` で現在 slot を始点とする矢印を削除する。
- slot が無効化されたり、始点標識が対象外になった場合は `cleanupArrows()` で削除される。

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

- `h` / `l`: 表示 slot を左右移動。同じ表示高の隣tokenの実slot、親groupの直接兄弟、同じV下線の葉slotという優先関係を使う。同じV下線の探索段階では、方向側に葉slotがあれば内容が空でも優先する。
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
- `r`: `<` / a / ad / 副詞的目的格 / 同格から矢印作成開始
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
- core の `evolve()` は入力を複製してから遷移を実行するため、呼び出し元の状態を変更しない。
- 状態の UI への読み書きは `readEditorState()` / `writeEditorState()` に集約する。
- 外部依存は見当たらない。
- DOM は `render()` で再構築され、下線と矢印はその後に描画される。
- 下線や矢印は DOM の `getBoundingClientRect()` に依存して配置されるため、見た目変更時はブラウザでの表示確認が重要。
- `syncFromInput()` は入力編集後に構造を可能な限り保持しつつ、文境界を跨いだ group や不正矢印を除去する。
- T 化・二重 slot 化・group 化は矢印の参照妥当性に影響する。変更時は `cleanupArrows()` の条件も確認する。
- enabled の再計算と矢印整合性処理は pure core の `refreshEnabled()` / `cleanupArrows()` を使う。
- 通常時とV選択中の `h` / `l` は同じ移動規則を使う。構造候補の比較はpure coreで行い、「実際に同じ表示高か」というDOM由来の候補情報だけをimperative shellから入力する。同じ表示高の隣tokenに実slotがあれば最初に選び、それがない場合に親groupの直接member、再帰的な葉slotを内側から外側のgroup順に探索する。葉探索では方向側に候補があれば空slotでも優先する。
- 水平移動で隣tokenが別行に属する場合は、同じ高さの比較を行わず、その境界tokenに実表示slotがあれば直接選ぶ。実表示slotがない場合だけ通常のgroup入口判定へフォールバックする。
- 移動は葉slot順を列とする2次元グリッドとして扱う。通常・double左右・T左右の葉slotを左から `col_idx` へ割り当て、複数の葉slotを含むgroup slotの `col_idx` は含有列の最小値とする。
- `h` / `l` は同じ構造階層の方向側候補のうち、現在の `row_idx` 以下で最大の `row_idx` にある最寄り要素を選ぶ。最後の横移動で決まった `col_idx` は後続の `j` / `k` 中に維持する。
- 下線groupの隣へ外側から`h` / `l`で入る場合、隣tokenに実表示のあるslotが現在カーソルと同じ表示高なら、そのtoken slotをgroup標識より優先する。隣tokenのslotが完全に空なら、空groupへ外から入る既存規則に従いgroup自身を選ぶ。
- 子group下線と通常slotが同じ親下線の兄弟memberなら、`h` / `l` は子groupと通常slotを直接往復する。通常slotへの移動を「空groupへ外から入る」判定へ戻して親下線へループさせてはならない。
- 同じ表示高の隣tokenに実slotがない場合、親groupの直接membersをその親が作る局所グリッド上の兄弟slotとして扱い、方向側の内側葉slotより先に選ぶ。明示的なmember参照として非T子groupへ横移動するときはmark内容の有無にかかわらず `single` 標識slotを選び、空でも同じ位置にカーソルを表示する。
- 他groupに包含されない最上位group同士は、文ごとの暗黙rootが持つ兄弟memberとして `h` / `l` の直接移動対象にする。
- 明示的な非T group参照へ横移動するときは、markが空でも `single` 標識slotを選ぶ。ただしgroup外から隣tokenへ入る場合は、同じ表示高に実表示のあるtoken slotがあればそのtokenを優先する。上下移動や下線クリックで下線を選ぶ場合との表示targetの違いを混同しない。
- groupから `h` / `l` で外へ出るとき、隣接する疑似トークンは境界番号だけで決めない。groupが再帰的に含む葉を共通トークン列へ投影し、その最左端・最右端の直隣を選ぶ。同じ境界に疑似トークンが連続する場合も、group外の直近1要素へ移動する。
- V選択中はactive区間・固定済みオレンジ区間の有無にかかわらず `j` / `k` を使える。入れ子groupは構造深さに従い一段ずつ移動し、深さを固定値に制限しない。
- `U` は通常時だけでなくV選択カーソル表示中にも有効。内部slot上ではそれを含む最内側groupを削除し、親groupの削除対象参照は対象groupの直接membersへ展開して参照切れを残さない。
- V選択中の正本は開始・終了rangeではなく、カーソルが実際に通過したslot参照のpath。経由していないslotを選択候補へ含めない。
- V選択で直前に通ったslotへ戻るとpath末尾を削除する。確定時のみ、選択済みslotを表示順上で隣接する連続区間へ圧縮する。
- 下線内のslotに通常・V選択中・固定済みのいずれかのカーソル表示が1つでもある場合、下線は疑似要素を含む全カーソルの可視下端より下へ配置する。
- カーソルによる下線の最小Y補正は、そのカーソルを実際に含むgroupだけへ適用する。内側groupが下がった場合は外側groupへ固定間隔を伝播するが、外側groupのカーソル補正で内側・兄弟groupを押し下げてはならない。
- 矢印の水平・垂直線分が、矢印自身の端点ではないgroup標識slotまたはgroup T slotで実際に描画された文字の範囲を横切る場合、そのgroupのslotと下線全体を固定間隔27pxだけ下げる。文字のない透明なslot余白を通るだけなら衝突とはみなさない。文字範囲はDOM Rangeで測り、線幅ぶん1pxだけ拡張する。内側groupが下がった結果は、既存の重なり規則によりそれを包む外側groupへ伝播する。この補正は表示時に導出し、inner_jsonへ保存しない。
- 複数矢印の水平範囲が重なっても、基本レーンの実Y座標が異なる場合は同じ矢印レベルを使う。実Y座標も重なる場合だけ12px単位で別レベルへ送る。
- 矢印の水平線は、X範囲が重なる無関係な下線の2px線とその直下group標識slotの下端までを予約帯として避ける。候補Yが予約帯内なら、帯を完全に抜けるまで12px刻みで下のレーンへ送る。ただし矢印の両端を再帰的に含むgroup自身の帯は障害物から除外し、内部矢印の始点縦線を基本15pxより伸ばさない。このレーン選択では縦線との交差は障害としない。
- 通常青、V選択の灰色、固定済みオレンジを含む全カーソルは、slot種類にかかわらず常に2pxの可視borderと20pxの縦幅を持つ。固定済み下線は `::before` のオレンジ枠、現在位置は `::after` の灰色枠を使い、重なっても両方を表示する。
- 下線の表示区間はtoken indexや直接memberの隣接では決めない。通常slot、double左右、T左右を葉slotとし、group memberを再帰展開した葉集合を全葉slot順で連続区間へ分ける。
- token TだけでなくgroupをT化した場合も、`left`と`right`は独立した基礎slotである。別の下線groupは`{structure, port:'left'}`または`{structure, port:'right'}`として片側だけをmemberにでき、display_jsonでは`structure:<id>:left/right`を別々のprimitive slotとして保持する。
- 再帰展開した葉slotが連続する部分は1本の下線にする。選択されていない葉slotが間にある部分は下線を分割し、各区間の内側端を同色のマークで間接接続する。
- `display_json` の各groupが持つ `underlineSegments` は上記の葉slot連続区間であり、`inner_json` の意味上の正本である `members` から毎回導出する。
- `window.KiriEditorData` の `getInnerJson()`, `getDisplayJson()`, `loadInnerJson()` が保存・表示・復元の境界。
