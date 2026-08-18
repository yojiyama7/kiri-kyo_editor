# 規則一覧と全ペア矛盾監査

生成日: 2026-08-18

## 監査方法

- active規則集合を A とし、|A| = 159。
- A x A の全順序対 25281 件を検査した。
- 判断名が異なるペアは独立、同じ判断名でも適用条件が排他的なら両立とする。
- 同じ判断名で条件が同時成立し、結果が異なるペアだけを矛盾とする。
- 全順序対の判定は `llm/rule-pair-audit.csv` に保存する。

## 結果

- self: 159
- orthogonal: 25054
- compatible: 68
- unresolved conflict: 0

## 廃止した旧規則

- OLD-JS-01: すべてのgroup参照をportに関係なく子groupの基礎slotへ再帰展開する。
  - 新規則 JS-04, JS-05 を優先。group Tのleft/rightを独立基礎slotとする新規則と矛盾するため削除。
- OLD-MV-01: 下線groupの隣へ外側から入る場合は常にgroup標識を選ぶ。
  - 新規則 MV-05, MV-06, MV-07 を優先。同じ表示高に実表示token slotがある場合はそのslotを優先する新規則と矛盾するため削除。
- OLD-MV-02: 親groupの直接兄弟memberを、同じ表示高の隣tokenより常に先に選ぶ。
  - 新規則 MV-05, MV-08, MV-09 を優先。同じ表示高の実tokenを直接兄弟groupより先に選ぶ新規則と矛盾するため削除。

## Active規則 A

### input

- IN-01: 入力テキストを空白区切りでtoken化する。
- IN-02: 改行を文境界として扱う。
- IN-03: group、T、矢印は文境界を跨げない。
- IN-04: 英文編集時は同じindexの標識と構造を妥当な範囲で維持する。
- IN-05: inner_jsonのtokenと境界indexは文ごとに0から振る。

### slot

- SL-01: single slotはtextを1つ持つ。
- SL-02: double slotは独立したleft/rightを持つ。
- SL-03: token Tとgroup Tは独立したleft/right slotを持つ。
- SL-04: Tで隠れる元slotは値を保持したまま無効化する。
- SL-05: 現在非表示の元slotもinner_jsonから復元可能にする。
- SL-06: 全slot矩形は純粋関数calculateSlotGeometryで算出する。
- SL-07: geometry layoutはsingle、double-pair、t-pair、underlineとする。
- SL-08: 全slotカーソルの外形高さを20pxに統一する。
- SL-09: 青、灰、オレンジの全slotカーソルに2pxの可視borderを表示する。
- SL-10: BORDER位置カーソルと文末dummyはslot geometryの対象外とする。
- SL-11: 通常青カーソルは常に1つだけ表示する。

### sequence

- SQ-01: 通常tokenと疑似tokenの表面順はcreateTokenSequenceを正本とする。
- SQ-02: 共通列の要素はtokenまたはpseudo-tokenとする。
- SQ-03: V選択、葉順、隣接、行候補、BORDER、描画順を共通列から導出する。
- SQ-04: single/double/T左右への展開は共通列要素を得た後に行う。
- SQ-05: 通常tokenと疑似tokenを別走査して同じ表面順を再構築しない。

### group

- GR-01: groupの意味構造の正本は直接選択したslot参照membersとする。
- GR-02: segments、start、endはmembersから導出する描画キャッシュとする。
- GR-03: V groupは合計2slot以上で確定する。
- GR-04: group所属は選択した正確なslot参照だけで決める。
- GR-05: range、同一境界、近接関係から未選択memberを補完しない。
- GR-06: 重なり、包含、同一範囲のgroupを許す。
- GR-07: 非T group自身はsingle標識slotを持つ。
- GR-08: groupをtで左右slotを持つTへ変換する。
- GR-09: Xはgroup TではTだけを外す。
- GR-10: Xは通常V下線ではgroupを削除する。
- GR-11: Uは現在のgroupを解除して削除する。
- GR-12: Uで子groupを削除した親参照は子の直接membersへ展開する。
- GR-13: 非連続memberは複数の下線区間として描画する。
- GR-14: 分割下線の内側端を同色マークで間接接続する。
- GR-15: 分割下線の対応色はdisplay_jsonで決め、保存状態へ入れない。
- GR-16: 疑似token memberは境界indexとpseudoIndexの両方を保持する。
- GR-17: group Tのleft/rightは別groupへ片側だけ含められる独立基礎slotとする。

### pseudo-token

- PS-01: 1境界に疑似tokenを0個以上連続配置できる。
- PS-02: 疑似tokenは表面文字列とsingle slotを1つ持つ。
- PS-03: 疑似tokenは原文textを変更しない。
- PS-04: 疑似tokenの表面文字列を臙脂色で表示する。
- PS-05: 色以外は通常tokenのsingle slotと同じ選択・移動・構造挙動を持つ。
- PS-06: 改行共有境界の疑似tokenは描画される改行前の文へ所属する。
- PS-07: 疑似tokenクリックはNORMALへ戻してそのslotを選択する。
- PS-08: BORDER中の/は新規疑似tokenを挿入し、確定後もBORDERに留まる。
- PS-09: BORDER中のBackspaceは直前の疑似token1個だけを削除する。
- PS-10: 挿入削除時はgroupと矢印のpseudoIndexを純粋関数で補正する。
- PS-11: 疑似token選択中のeは表面文字列を編集する。
- PS-12: 疑似token選択中の/はslot内容を編集する。
- PS-13: n個の疑似tokenがある境界は前・間・後のn+1位置を持つ。
- PS-14: BORDER終了時は直右の通常または疑似tokenへ戻る。
- PS-15: 文書末で直右要素がない場合だけ最後のsurface tokenへ戻る。

### boundary-slot

- BD-01: [は境界文字列内の出現位置ごとにsingle slotを1つ持つ。
- BD-02: NORMALで[を作成した直後とクリック時は、その境界slotを選択する。
- BD-03: [の境界slotには通常の標識キー列で働きの標識を入力できる。
- BD-04: [の境界slotは文ローカル境界indexと境界文字列内indexでinner_jsonへ保存する。
- BD-05: [の境界slotのh/lは表示順で隣接する境界slot、疑似token、通常tokenへ移動する。

### boundary-symbol

- BD-06: <はslotを持たない。
- BD-07: BORDERのrは現在境界で最後の<自体を始点に矢印選択へ移る。

### arrow

- AR-01: 矢印始点はBORDERで指定したslotなしの<、またはa、ad、副詞的目的格、同格の有効slotに限る。
- AR-02: rで現在slotを始点に矢印作成を開始する。
- AR-03: 矢印選択中のEnterで終点を確定する。
- AR-04: 終点には通常token、疑似token、groupの有効slotを指定できる。
- AR-05: 1始点につき矢印は1本とし、新規確定で付け替える。
- AR-06: 矢印は文境界を跨げない。
- AR-07: Rで現在slot始点の矢印を削除する。
- AR-08: 端点無効化または始点標識不適格時に矢印を削除する。
- AR-09: 下線内の空slot終点では矢印先端をslot上端の1px上へ置く。
- AR-10: 空下線内slot以外の終点では従来どおり下端を使う。
- AR-11: 疑似token端点の行は実DOMの表示行から求める。
- AR-12: 水平範囲と実Yが重なる矢印だけ12px単位で別レーンへ送る。
- AR-13: 水平範囲が重なっても実Yが異なる矢印は同じlevelを使う。
- AR-14: 矢印の水平線が無関係な下線および直下group標識帯とX方向に重なる場合、その帯を抜けるまで12px刻みで下のレーンへ送る。両端を含むgroup自身の帯と縦線交差は判定に含めない。
- AR-15: 矢印の両端を再帰的に含むgroupの下線帯は、その内部矢印自身のレーン障害物にしない。

### movement

- MV-01: NORMALとV選択中のh/lは同じ移動先計算を使う。
- MV-02: 葉slot順をcol_idxとする。
- MV-03: 複数葉を含むgroup slotのcol_idxは最小包含列とする。
- MV-04: h/lは方向側候補のうち現在row以下で最大rowの最寄りを選ぶ。
- MV-05: 隣group内tokenに実表示slotが同じ高さにあれば、直接兄弟groupよりtoken slotを優先する。
- MV-06: 隣group内部が完全に空なら外からはgroup自身へ入る。
- MV-07: 同じ高さの実token候補がなく、明示的な非T子group参照を選ぶ場合は空でもsingle group slotを選ぶ。
- MV-08: 同じ高さの実token候補がない場合だけ、親groupの直接兄弟memberを方向側の内側葉より優先する。
- MV-09: 上記候補がない場合、同じ連続下線区間の方向側葉slotを空でも優先する。
- MV-10: 最上位group同士を文の暗黙rootの兄弟としてh/l移動対象にする。
- MV-11: double/T内部の左右移動を隣接疑似tokenより優先する。
- MV-12: double/T外側slotから進んだとき疑似tokenへ出る。
- MV-13: groupから出るとき外部の隣接疑似tokenを通常tokenより先に選ぶ。
- MV-14: group内部memberの疑似tokenは外部候補にしない。
- MV-15: j/kは最後の横移動で決まったcol_idxを維持する。
- MV-16: jは同列の外側構造へ一段下がる。
- MV-17: kは同列の子groupまたは内部slotへ一段上がる。
- MV-18: NORMALで下構造がなければjは次行の表示X最寄りslotへ移る。
- MV-19: NORMALで上構造がなければkは前行の表示X最寄りslotへ移る。
- MV-20: 文跨ぎgroupを避けるためV選択中は行フォールバックしない。
- MV-21: 0は疑似tokenを含む現在行最初のsurfaceへ移る。
- MV-22: $は疑似tokenを含む現在行最後のsurfaceへ移る。
- MV-23: h/lで行境界を跨ぐとき、境界側tokenに実表示slotがあれば内包groupのslotよりtoken slotを優先する。
- MV-24: 非連続下線の区間内側端からh/lすると、別区間へ飛ばず隣接する未所属gap slotへ空でも移動する。

### V-selection

- VS-01: V選択の正本は開始終了rangeではなく実際に通過したslot pathとする。
- VS-02: 直前方向へ戻った場合はpathをその位置まで縮める。
- VS-03: 確定時だけ選択slotを表示順上の連続区間へ圧縮する。
- VS-04: 選択中のVで現在pathを固定区間にする。
- VS-05: 区間固定後のVで現在位置から新しいpathを始める。
- VS-06: EscはV選択をgroup作成なしで終了する。
- VS-07: active/fixed区間の有無にかかわらずV選択中もj/kを使える。
- VS-08: V選択現在位置を灰色カーソルで表示する。
- VS-09: 固定済みV区間をオレンジカーソルで表示する。

### display

- DP-01: 包含される短いgroupを包むgroupより上に置く。
- DP-02: 包含関係のない重なりgroupは短い方を上に置く。
- DP-03: 重なる下線とT横線を上から27px固定間隔で置く。
- DP-04: 再帰的な選択葉が連続する部分を1本の下線にする。
- DP-05: 未選択葉が間にある場合は下線を分割する。
- DP-06: group内部に色を問わずカーソルがあれば下線をその可視下端より下へ置く。
- DP-07: 内側groupのカーソル補正を包む外側groupへ伝播する。
- DP-08: 外側または兄弟のカーソル補正で内側・兄弟groupを下げない。
- DP-09: 矢印が端点以外のgroup slotで実際に表示された文字範囲を横切る場合だけ、そのslotと下線全体を27px下げる。透明なslot余白は衝突に含めない。
- DP-10: 矢印衝突による下方補正をinner_jsonへ保存しない。
- DP-11: group外slotの選択でそのgroupの下線・標識・矢印位置を変えない。
- DP-13: 複数行に折り返す下線は各行の局所下端を基準にし、group間のlevel差を各行で維持する。
- DP-12: group T左右をdisplay_jsonでstructure:<id>:left/rightとして区別する。

### json

- JS-01: inner_jsonを表示情報を含まないセーブ用構造とする。
- JS-02: inner_jsonから状態へ復元し再保存すると同じ正規形になる。
- JS-03: ranges、高さ、level、offset、色をinner_jsonへ入れない。
- JS-04: groupのsingle参照は子groupの基礎slotへ再帰展開する。
- JS-05: group Tのleft/right参照は再帰展開せず独立基礎slotとして保持する。
- JS-06: display_jsonへgroupのprimitive、関係、高さ、色、区間を導出して追加する。
- JS-07: 文とtoken文字列はトップレベルtextから復元し重複保存しない。
- JS-08: 空の標識値以外の空構造・境界・矢印など任意フィールドは省略する。
- JS-09: tokenと疑似tokenの必須slotは内容が空でも保持する。
- JS-10: window.KiriEditorDataの3 APIを保存・表示・復元境界とする。

### keyboard

- KB-01: iでINSERTへ移行する。
- KB-02: EscapeでNORMALへ戻るか保留・選択をキャンセルする。
- KB-03: NORMALのxで現在slot標識を削除する。
- KB-04: NORMALの/で現在slotへ任意文字列を入力する。
- KB-05: dで通常slotとdoubleを切り替える。
- KB-06: tでtokenまたはgroupをT化する。
- KB-07: Vで下線範囲選択を開始する。
- KB-08: bで境界編集モードを切り替える。
- KB-09: NORMALの開き境界記号キーを現在単語の左境界へ追加する。
- KB-10: BORDERのx/Deleteで現在境界の記号を全削除する。
- KB-11: uで標識・構造編集をundoする。
- KB-12: Ctrl-rでredoする。
- KB-13: カーソル移動だけの操作を履歴へ入れない。
- KB-15: NORMALの閉じ境界記号キーを現在単語の右境界へ追加する。
- KB-14: 定義済みキー列を対応する標識文字列へ変換し、apは同格、eadは誘導adとする。

### save

- SV-01: 保存ボタンで現在のinner_jsonをlocalStorageへ保存する。
- SV-02: localStorage保存キーを固定する。
- SV-03: 起動時にversion 1の保存データを自動復元する。
- SV-04: 不正JSONまたは未対応versionは復元せず初期文書を使う。
- SV-05: 保存削除はlocalStorageだけを消し、編集中文書を変更しない。

### implementation

- IM-01: 表示以外の状態遷移と計算をDOM非依存のeditor-coreへ置く。
- IM-02: 描画、DOM計測、イベント、フォーカス、スクロールをindex側で扱う。
- IM-03: coreの状態遷移は入力を変更せず新しい状態を返す。
- IM-04: 状態のUI読み書きをreadEditorState/writeEditorStateへ集約する。
- IM-05: renderでDOMを再構築後、下線と矢印を描画する。
- IM-06: syncFromInputで文跨ぎgroupと不正矢印を除去する。
- IM-07: enabled再計算と矢印整合性を純粋coreで処理する。
- IM-08: 座標依存の表示変更は実ブラウザで検証する。

