# Browser Key Tests

`key-tests.mjs` は Playwright で `index.html` を直接開き、主要キー操作を 1 件ずつブラウザ上で検証する。`npm test` は先にactive規則集合Aの全ペア矛盾監査を実行し、その後ブラウザテストを実行する。

ローカルに Node.js と Playwright がある場合:

```powershell
npm test
```

Codex 同梱ランタイムで実行する場合は、`NODE_PATH` に同梱 `node_modules` を通してから実行する。

```powershell
$env:NODE_PATH='C:\Users\yojiy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& 'C:\Users\yojiy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\browser\key-tests.mjs
```

Playwright のブラウザバイナリが未導入でも、通常の Chrome / Edge が標準パスにあればそれを使う。
明示する場合は `PLAYWRIGHT_CHROMIUM_EXECUTABLE` に `chrome.exe` または `msedge.exe` のパスを入れる。
