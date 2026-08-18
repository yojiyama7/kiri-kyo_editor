# LLM Notes for kiri-kyo_editor

このディレクトリは、LLM がこの Web エディタの仕様・実装方針・作業指示を継続的に参照するための記録場所です。

- [spec.md](./spec.md): 現時点で把握したアプリ仕様と内部モデル
- [rules.json](./rules.json): ID、適用条件、結果を持つactive規則集合Aの正本
- [rule-audit.md](./rule-audit.md): 全active規則の列挙とA×A監査結果
- [rule-pair-audit.csv](./rule-pair-audit.csv): A×Aの全順序対の判定
- [retired-rules.json](./retired-rules.json): 新規則を優先して削除した旧規則
- [work-log.md](./work-log.md): LLM 作業履歴・今後の注意点

プロジェクトrootで `node scripts/audit-rules.mjs` を実行すると、規則台帳から全ペア監査結果を再生成する。
