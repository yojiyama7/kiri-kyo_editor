import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const indexUrl = pathToFileURL(path.join(rootDir, 'index.html')).href;
const sampleText = 'one two three four five\nalpha beta gamma';

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(indexUrl);
  await page.locator('#input').fill(sampleText);
  await page.locator('#workspace').click();
  await page.waitForFunction(() => document.querySelectorAll('.word:not([data-dummy])').length === 8);
  return page;
}

async function press(page, key) {
  await page.keyboard.press(key);
  await page.waitForTimeout(20);
}

async function typeKeys(page, keys) {
  for (const key of keys) await press(page, key);
}

async function internalJson(page) {
  return JSON.parse(await page.locator('#internalJson').inputValue());
}

async function currentCursor(page) {
  return page.evaluate(() => {
    const word = document.querySelector('.word.cursor');
    const mark = document.querySelector('.mark-cursor');
    const dual = document.querySelector('.dual-slot-cursor');
    const verbal = document.querySelector('.verbal-slot-cursor');
    const group = document.querySelector('.group-mark-cursor,.group-underline-cursor,.group-verbal-slot-cursor');
    const el = group || verbal || dual || mark || word;
    if (!el) return null;
    const wordEl = el.closest('.word');
    return {
      word: wordEl ? Number(wordEl.dataset.index) : null,
      gapToken: el.closest('.gap-token')?.dataset.gapToken,
      gapTokenIndex: el.closest('.gap-token')?.dataset.gapTokenIndex,
      text: el.textContent,
      classes: [...el.classList],
      workSlot: el.dataset.workSlot || el.dataset.groupSlot || null,
      group: el.dataset.groupWork || el.dataset.groupUnderline || null
    };
  });
}

async function borderCursor(page) {
  return page.locator('.gap-cursor').evaluate((el) => ({
    gap: Number(el.dataset.gapIndex),
    side: el.dataset.gapSide || 'single',
    offset: Number(el.dataset.gapOffset || 0)
  }));
}

async function groupSelectionSnapshot(page) {
  return page.evaluate(() => {
    const bySelector = (selector) => [...document.querySelectorAll(selector)].map((el) => {
      const word = el.closest('.word');
      return {
        word: word?.dataset.index != null ? Number(word.dataset.index) : null,
        gapToken: el.closest('.gap-token')?.dataset.gapToken ?? null,
        gapTokenIndex: el.closest('.gap-token')?.dataset.gapTokenIndex ?? null,
        workSlot: el.dataset.workSlot || el.dataset.groupSlot || null,
        group: el.dataset.groupWork || el.dataset.groupUnderline || null,
        text: el.textContent,
        classes: [...el.classList]
      };
    });
    return {
      mode: document.querySelector('#modeBadge')?.textContent,
      active: bySelector('.slot-group-selecting-active'),
      fixed: bySelector('.slot-group-selecting-fixed'),
      cursor: bySelector('.slot-group-selection-cursor')
    };
  });
}

async function groupSelectionCursorVisual(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.slot-group-selection-cursor');
    if (!el) return null;
    const style = getComputedStyle(el);
    const after = getComputedStyle(el, '::after');
    const rect = el.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      position: style.position,
      afterContent: after.content,
      afterLeft: after.left,
      afterRight: after.right,
      afterTop: after.top,
      afterBottom: after.bottom,
      afterBorderTopWidth: after.borderTopWidth,
      afterBorderTopStyle: after.borderTopStyle
    };
  });
}

async function underlineAndInnerCursorBottoms(page, groupId = 1) {
  return page.evaluate((id) => {
    const line = document.querySelector(`.group-underline[data-group-underline="${id}"]`);
    const cursorSelectors = [
      '.mark-cursor',
      '.dual-slot-cursor',
      '.verbal-slot-cursor',
      '.group-mark-cursor',
      '.group-underline-cursor',
      '.group-verbal-slot-cursor',
      '.slot-group-selecting-active',
      '.slot-group-selecting-fixed',
      '.slot-group-selection-cursor'
    ];
    const visualBottom = (el) => {
      const rect = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      const afterBottom = Number.parseFloat(after.bottom);
      return Math.max(rect.bottom, Number.isFinite(afterBottom) ? rect.bottom - afterBottom : rect.bottom);
    };
    return {
      underlineTop: line?.getBoundingClientRect().top ?? null,
      cursorBottoms: [...document.querySelectorAll(cursorSelectors.join(','))]
        .filter((el) => el.closest('.word'))
        .map((el) => ({classes:[...el.classList], bottom:visualBottom(el)}))
    };
  }, String(groupId));
}

async function firstTokenText(page) {
  const doc = await internalJson(page);
  return doc.sentences[0].tokens[0].slot.text || '';
}

const markCases = [
  ['s sets S', ['s', 'Enter'], 'S'],
  ["s' sets S'", ['s', "'"], "S'"],
  ['v sets V', ['v'], 'V'],
  ['o sets O', ['o'], 'O'],
  ['c sets C', ['c', 'Enter'], 'C'],
  ['con sets 接', ['c', 'o', 'n'], '接'],
  ['m sets M', ['m'], 'M'],
  ['pre sets 前', ['p', 'r', 'e'], '前'],
  ['a sets a', ['a', 'Enter'], 'a'],
  ['ad sets ad', ['a', 'd', 'Enter'], 'ad'],
  ['ado sets 副詞的目的格', ['a', 'd', 'o', 'Enter'], '副詞的目的格'],
  ['sad sets 文ad', ['s', 'a', 'd'], '文ad'],
  ['ac sets aC', ['a', 'c'], 'aC'],
  ['aux sets aux', ['a', 'u', 'x'], 'aux'],
  ['nc sets nC', ['n', 'c'], 'nC'],
  ['+ sets +', ['+'], '+'],
  ['1 sets (1)', ['1'], '(1)'],
  ['2 sets (2)', ['2'], '(2)'],
  ['3 sets (3)', ['3'], '(3)'],
  ['4 sets (4)', ['4'], '(4)'],
  ['5 sets (5)', ['5'], '(5)'],
  ['-3 sets -(3)', ['-', '3'], '-(3)'],
  ['-4 sets -(4)', ['-', '4'], '-(4)'],
  ['-5 sets -(5)', ['-', '5'], '-(5)']
];

for (const [name, keys, expected] of markCases) {
  test(name, async ({ page }) => {
    await typeKeys(page, keys);
    assert.equal(await firstTokenText(page), expected);
  });
}

test('x clears current mark', async ({ page }) => {
  await typeKeys(page, ['s', 'x']);
  assert.equal(await firstTokenText(page), '');
});

test('/ directly edits current slot', async ({ page }) => {
  await press(page, '/');
  await page.keyboard.type('custom');
  await press(page, 'Enter');
  assert.equal(await firstTokenText(page), 'custom');
});

test('h/l/0/$ move the normal cursor', async ({ page }) => {
  await press(page, 'l');
  assert.equal((await currentCursor(page)).word, 1);
  await press(page, 'h');
  assert.equal((await currentCursor(page)).word, 0);
  await press(page, '$');
  assert.equal((await currentCursor(page)).word, 4);
  await press(page, '0');
  assert.equal((await currentCursor(page)).word, 0);
});

test('i enters INSERT and Escape returns NORMAL', async ({ page }) => {
  await press(page, 'i');
  assert.equal(await page.locator('#modeBadge').textContent(), 'INSERT');
  await press(page, 'Escape');
  assert.equal(await page.locator('#modeBadge').textContent(), 'NORMAL');
});

test('d toggles double slot and h/l move between its slots', async ({ page }) => {
  await press(page, 'd');
  await typeKeys(page, ['s', 'Enter']);
  let doc = await internalJson(page);
  assert.deepEqual(doc.sentences[0].tokens[0].slot, {kind:'double',left:'S',right:''});
  await press(page, 'l');
  assert.equal((await currentCursor(page)).word, 0);
  assert.equal((await currentCursor(page)).workSlot, 'right');
  await typeKeys(page, ['o']);
  doc = await internalJson(page);
  assert.deepEqual(doc.sentences[0].tokens[0].slot, {kind:'double',left:'S',right:'O'});
});

test('t creates token T and X removes it', async ({ page }) => {
  await press(page, 't');
  let doc = await internalJson(page);
  assert.equal(doc.sentences[0].structures[0].kind, 'verbal');
  assert.equal(doc.sentences[0].structures[0].form, 'T');
  await press(page, 'X');
  doc = await internalJson(page);
  assert.equal(doc.sentences[0].structures, undefined);
});

test('boundary keys add symbols on current boundary', async ({ page }) => {
  await typeKeys(page, ['[', ']', '<', '>', '(', ')']);
  const doc = await internalJson(page);
  assert.equal(doc.sentences[0].boundaries[0], '[]<>()');
});

test('b mode moves boundary cursor and edits symbols', async ({ page }) => {
  await typeKeys(page, ['b', 'l', '[', ']', 'Backspace', 'x', ']', 'Enter']);
  const doc = await internalJson(page);
  assert.equal(doc.sentences[0].boundaries[1], ']');
  assert.equal(await page.locator('#modeBadge').textContent(), 'NORMAL');
});

test('b mode counts a pseudo token as one item for h and l', async ({ page }) => {
  const inner={version:1,text:'a b',sentences:[{
    tokens:[
      {slot:{kind:'single',text:''}},
      {slot:{kind:'single',text:''}}
    ],
    pseudoTokens:{1:{text:'middle',slot:{kind:'single',text:''}}}
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);

  await page.locator('.word[data-index="1"]').click();
  await press(page,'b');
  assert.deepEqual(await borderCursor(page),{gap:1,side:'after',offset:1});

  await press(page,'h');
  assert.deepEqual(await borderCursor(page),{gap:1,side:'before',offset:0});
  await press(page,'h');
  assert.deepEqual(await borderCursor(page),{gap:0,side:'single',offset:0});

  await press(page,'l');
  assert.deepEqual(await borderCursor(page),{gap:1,side:'before',offset:0});
  await press(page,'l');
  assert.deepEqual(await borderCursor(page),{gap:1,side:'after',offset:1});
  await press(page,'l');
  assert.deepEqual(await borderCursor(page),{gap:2,side:'single',offset:0});
});

test('leaving BORDER returns to the pseudo token immediately right of the border', async ({ page }) => {
  const inner={version:1,text:'a b',sentences:[{
    tokens:Array.from({length:2},() => ({slot:{kind:'single',text:''}})),
    pseudoTokens:{1:[{text:'pseudo',slot:{kind:'single',text:''}}]}
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.word[data-index="1"]').click();
  await typeKeys(page,['b','h','Enter']);
  const cursor=await currentCursor(page);
  assert.equal(cursor.gapToken,'1');
  assert.equal(cursor.gapTokenIndex,'0');
});

test('b slash inserts consecutive pseudo tokens and Backspace removes one', async ({ page }) => {
  await page.locator('.word[data-index="1"]').click();
  await press(page,'b');

  await press(page,'/');
  await page.locator('.direct-slot-input').fill('one');
  await press(page,'Enter');
  assert.equal(await page.locator('#modeBadge').textContent(),'BORDER');

  await press(page,'/');
  await page.locator('.direct-slot-input').fill('two');
  await press(page,'Enter');
  assert.deepEqual(await page.locator('.gap-token[data-gap-token="1"] .token').allTextContents(),['one','two']);
  assert.deepEqual(await borderCursor(page),{gap:1,side:'after',offset:2});

  await press(page,'Enter');
  await press(page,'h');
  assert.ok((await page.locator('.gap-token[data-gap-token-index="1"] .mark').getAttribute('class')).includes('mark-cursor'));
  await press(page,'h');
  assert.ok((await page.locator('.gap-token[data-gap-token-index="0"] .mark').getAttribute('class')).includes('mark-cursor'));
  await press(page,'l');
  assert.ok((await page.locator('.gap-token[data-gap-token-index="1"] .mark').getAttribute('class')).includes('mark-cursor'));

  await press(page,'h');
  await typeKeys(page,['V','l']);
  const selection=await groupSelectionSnapshot(page);
  assert.deepEqual(selection.active.map(item => item.gapTokenIndex).filter(index => index != null),['0','1']);
  await press(page,'Escape');

  await press(page,'b');
  await press(page,'Backspace');
  assert.deepEqual(await page.locator('.gap-token[data-gap-token="1"] .token').allTextContents(),['one']);
  assert.deepEqual(await borderCursor(page),{gap:1,side:'after',offset:1});

  await press(page,'Enter');
  await page.locator('.gap-token[data-gap-token-index="0"] .token').click();
  await press(page,'e');
  await page.locator('.direct-slot-input').fill('changed');
  await press(page,'Enter');
  assert.equal(await page.locator('.gap-token[data-gap-token-index="0"] .token').textContent(),'changed');

  const doc=await internalJson(page);
  assert.deepEqual(doc.sentences[0].pseudoTokens[1],[{
    text:'changed',
    slot:{kind:'single',text:''}
  }]);
});

test('V includes only the selected pseudo token among consecutive neighbors', async ({ page }) => {
  const inner={version:1,text:'a b',sentences:[{
    tokens:[
      {slot:{kind:'single',text:''}},
      {slot:{kind:'single',text:''}}
    ],
    pseudoTokens:{1:[
      {text:'one',slot:{kind:'single',text:''}},
      {text:'two',slot:{kind:'single',text:''}},
      {text:'three',slot:{kind:'single',text:''}}
    ]}
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);

  await page.locator('.gap-token[data-gap-token="1"][data-gap-token-index="1"]').click();
  await typeKeys(page,['V','V','h','h','V','Enter']);

  const doc=await internalJson(page);
  assert.deepEqual(doc.sentences[0].structures[0].members,[
    {token:0,port:'single'},
    {pseudoToken:1,pseudoIndex:1,port:'single'}
  ]);
  const display=await page.evaluate(() => window.KiriEditorData.getDisplayJson());
  assert.deepEqual(display.sentences[0].display.groups[0].primitiveSlots.sort(),[
    'pseudo-token:1:1:single',
    'token:0:single'
  ]);
  const grouped=await page.locator('.gap-token.group-member').evaluateAll((elements) =>
    elements.map((element) => element.dataset.gapTokenIndex)
  );
  assert.deepEqual(grouped,['1']);
  assert.equal(await page.locator('.group-underline').count(),2);
});

test('an underline from test2 to test3 does not extend across unselected test', async ({ page }) => {
  const inner={version:1,text:'His carrer culminated in his being elected President.',sentences:[{
    tokens:Array.from({length:8},() => ({slot:{kind:'single',text:''}})),
    structures:[
      {id:1,kind:'group',members:[{token:1,port:'single'},{token:2,port:'single'}],form:'underline',mark:''},
      {id:4,kind:'group',members:[{structure:1,port:'single'},{structure:2,port:'single'}],form:'underline',mark:''},
      {id:2,kind:'group',members:[{token:3,port:'single'},{token:4,port:'single'}],form:'underline',mark:''},
      {id:3,kind:'group',members:[{token:5,port:'single'},{token:6,port:'single'}],form:'underline',mark:''},
      {id:5,kind:'group',members:[{structure:3,port:'single'},{token:7,port:'single'}],form:'underline',mark:''}
    ],
    pseudoTokens:{5:[
      {text:'test',slot:{kind:'single',text:''}},
      {text:'test2',slot:{kind:'single',text:''}},
      {text:'test3',slot:{kind:'single',text:''}}
    ]}
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.gap-token[data-gap-token-index="1"]').click();
  await typeKeys(page,['V','l','Enter']);

  const doc=await internalJson(page);
  const created=doc.sentences[0].structures.find(structure => structure.id === 6);
  assert.deepEqual(created.members,[
    {pseudoToken:5,pseudoIndex:1,port:'single'},
    {pseudoToken:5,pseudoIndex:2,port:'single'}
  ]);
  const geometry=await page.evaluate(() => {
    const rect=index => document.querySelector(`.gap-token[data-gap-token-index="${index}"] [data-gap-token-work]`).getBoundingClientRect();
    const line=document.querySelector('.group-underline[data-group-underline="6"]').getBoundingClientRect();
    const first=rect(0),selectedStart=rect(1),selectedEnd=rect(2);
    return {
      lineLeft:line.left,lineRight:line.right,
      firstRight:first.right,
      selectedLeft:selectedStart.left,
      selectedRight:selectedEnd.right
    };
  });
  assert.ok(geometry.lineLeft >= geometry.selectedLeft-0.5,JSON.stringify(geometry));
  assert.ok(geometry.lineLeft >= geometry.firstRight-0.5,JSON.stringify(geometry));
  assert.ok(geometry.lineRight <= geometry.selectedRight+0.5,JSON.stringify(geometry));
});

test('h from a test2-test3 group moves to the preceding test pseudo token', async ({ page }) => {
  const inner={version:1,text:'jkhhhhhhHis carrer culminated in his being elected President.',sentences:[{
    tokens:Array.from({length:8},() => ({slot:{kind:'single',text:''}})),
    structures:[
      {id:1,kind:'group',members:[{token:1,port:'single'},{token:2,port:'single'}],form:'underline',mark:''},
      {id:4,kind:'group',members:[{structure:1,port:'single'},{structure:2,port:'single'}],form:'underline',mark:''},
      {id:2,kind:'group',members:[{token:3,port:'single'},{token:4,port:'single'}],form:'underline',mark:''},
      {id:6,kind:'group',members:[
        {pseudoToken:5,pseudoIndex:1,port:'single'},
        {pseudoToken:5,pseudoIndex:2,port:'single'}
      ],form:'underline',mark:''},
      {id:3,kind:'group',members:[{token:5,port:'single'},{token:6,port:'single'}],form:'underline',mark:''},
      {id:5,kind:'group',members:[{structure:3,port:'single'},{token:7,port:'single'}],form:'underline',mark:''}
    ],
    pseudoTokens:{5:[
      {text:'test',slot:{kind:'single',text:''}},
      {text:'test2',slot:{kind:'single',text:''}},
      {text:'test3',slot:{kind:'single',text:''}}
    ]}
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);

  await page.locator('.group-mark[data-group-work="6"]').evaluate((element) => element.click());
  await press(page,'h');
  assert.ok(await page.locator('.gap-token[data-gap-token="5"][data-gap-token-index="0"] .mark').evaluate(
    (element) => element.classList.contains('mark-cursor')
  ));

  await page.locator('.group-mark[data-group-work="6"]').evaluate((element) => element.click());
  await typeKeys(page,['V','h']);
  const selection=await groupSelectionSnapshot(page);
  assert.equal(selection.cursor.length,1);
  assert.equal(selection.cursor[0].gapToken,'5');
  assert.equal(selection.cursor[0].gapTokenIndex,'0');
});

test('every mixed token subset can independently include or exclude each surface token', async ({ page }) => {
  const inner={version:1,text:'a b c',sentences:[{
    tokens:Array.from({length:3},() => ({slot:{kind:'single',text:''}})),
    pseudoTokens:{1:[
      {text:'one',slot:{kind:'single',text:''}},
      {text:'two',slot:{kind:'single',text:''}}
    ]}
  }]};
  const elements=[
    {id:'t0',selector:'.word[data-index="0"]',member:{token:0,port:'single'},primitive:'token:0:single'},
    {id:'p0',selector:'.gap-token[data-gap-token="1"][data-gap-token-index="0"]',member:{pseudoToken:1,pseudoIndex:0,port:'single'},primitive:'pseudo-token:1:0:single'},
    {id:'p1',selector:'.gap-token[data-gap-token="1"][data-gap-token-index="1"]',member:{pseudoToken:1,pseudoIndex:1,port:'single'},primitive:'pseudo-token:1:1:single'},
    {id:'t1',selector:'.word[data-index="1"]',member:{token:1,port:'single'},primitive:'token:1:single'},
    {id:'t2',selector:'.word[data-index="2"]',member:{token:2,port:'single'},primitive:'token:2:single'}
  ];

  for(let mask=0;mask<(1 << elements.length);mask++){
    const selected=elements.filter((_,index) => mask & (1 << index));
    if(selected.length < 2) continue;
    await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
    await page.waitForTimeout(20);

    const selectedIndices=elements.map((_,index) => index).filter(index => mask & (1 << index));
    await page.locator(elements[selectedIndices[0]].selector).click();
    await typeKeys(page,['V','V']);
    let position=selectedIndices[0];
    for(let selectedOffset=1;selectedOffset<selectedIndices.length;selectedOffset++){
      const target=selectedIndices[selectedOffset];
      while(position < target){
        await press(page,'l');
        position++;
      }
      await press(page,'V');
      await press(page,selectedOffset === selectedIndices.length-1 ? 'Enter' : 'V');
    }

    const doc=await internalJson(page);
    assert.deepEqual(doc.sentences[0].structures?.[0]?.members,selected.map(item => item.member),`inner mask ${mask}`);
    const display=await page.evaluate(() => window.KiriEditorData.getDisplayJson());
    const layout=display.sentences[0].display.groups[0];
    assert.deepEqual(
      layout.primitiveSlots.slice().sort(),
      selected.map(item => item.primitive).sort(),
      `display mask ${mask}`
    );
    assert.deepEqual(
      layout.underlineSegments.flatMap(segment => segment.primitiveSlots).sort(),
      selected.map(item => item.primitive).sort(),
      `segments mask ${mask}`
    );
    const runCount=selectedIndices.reduce((count,index,offset) =>
      count+(offset === 0 || index !== selectedIndices[offset-1]+1 ? 1 : 0),0
    );
    assert.equal(await page.locator('.group-underline').count(),runCount,`underline count mask ${mask}`);
    const grouped=await page.evaluate(() => {
      const ids=[];
      if(document.querySelector('.word[data-index="0"].group-member')) ids.push('t0');
      for(const index of [0,1]){
        if(document.querySelector(`.gap-token[data-gap-token="1"][data-gap-token-index="${index}"].group-member`)) ids.push(`p${index}`);
      }
      if(document.querySelector('.word[data-index="1"].group-member')) ids.push('t1');
      if(document.querySelector('.word[data-index="2"].group-member')) ids.push('t2');
      return ids;
    });
    assert.deepEqual(grouped,selected.map(item => item.id),`DOM mask ${mask}`);
  }
});

test('b slash creates a token-like boundary word with one editable slot', async ({ page }) => {
  await typeKeys(page,['b','/']);
  const editor=page.locator('.direct-slot-input');
  assert.equal(await editor.count(),1);
  await editor.fill('You');
  await press(page,'Enter');

  const pseudo=page.locator('.gap-token[data-gap-token="0"]');
  assert.equal(await pseudo.locator('.token').textContent(),'You');
  assert.equal(await page.locator('#modeBadge').textContent(),'BORDER');
  await press(page,'Enter');
  await pseudo.click();
  assert.ok((await pseudo.locator('.mark').getAttribute('class')).includes('mark-cursor'));
  assert.equal(await page.locator('.mark-cursor').count(),1);
  assert.equal(await pseudo.locator('.token').evaluate((el) => getComputedStyle(el).color),'rgb(128, 0, 32)');
  await typeKeys(page,['s','Enter']);

  let doc=await internalJson(page);
  assert.deepEqual(doc.sentences[0].pseudoTokens[0],[{
    text:'You',
    slot:{kind:'single',text:'S'}
  }]);
  assert.equal(await pseudo.locator('.mark').textContent(),'S');

  await press(page,'l');
  assert.equal((await currentCursor(page)).word,0);
  await press(page,'h');
  assert.ok((await pseudo.locator('.mark').getAttribute('class')).includes('mark-cursor'));

  await page.evaluate((inner) => window.KiriEditorData.loadInnerJson(inner),doc);
  await page.waitForTimeout(50);
  doc=await internalJson(page);
  assert.equal(doc.sentences[0].pseudoTokens[0][0].text,'You');
  assert.equal(await page.locator('.gap-token[data-gap-token="0"] .mark').textContent(),'S');

  await page.locator('.gap-token[data-gap-token="0"]').click();
  await typeKeys(page,['V','l']);
  const snap=await groupSelectionSnapshot(page);
  assert.deepEqual(snap.active.map(item => item.gapToken).filter(Boolean),['0']);
  assert.deepEqual(snap.active.map(item => item.word).filter(word => word != null),[0]);
  await press(page,'Enter');
  doc=await internalJson(page);
  assert.deepEqual(doc.sentences[0].structures[0].members,[
    {pseudoToken:0,pseudoIndex:0,port:'single'},
    {token:0,port:'single'}
  ]);
  assert.equal(await page.locator('.group-underline').count(),1);
  await press(page,'t');
  assert.equal(await pseudo.locator('.mark').evaluate((el) => getComputedStyle(el).visibility),'hidden');
  await press(page,'X');
  assert.equal(await pseudo.locator('.mark').evaluate((el) => getComputedStyle(el).visibility),'visible');
  await pseudo.click();
  await press(page,'j');
  assert.equal((await currentCursor(page)).group,'1');
  await press(page,'k');
  assert.ok((await pseudo.locator('.mark').getAttribute('class')).includes('mark-cursor'));
});

test('pseudo tokens are selectable at every boundary by click and horizontal movement', async ({ page }) => {
  const inner={version:1,text:'a b',sentences:[{
    tokens:[
      {slot:{kind:'single',text:''}},
      {slot:{kind:'single',text:''}}
    ],
    pseudoTokens:{
      0:{text:'head',slot:{kind:'single',text:''}},
      1:{text:'middle',slot:{kind:'single',text:'S'}},
      2:{text:'tail',slot:{kind:'single',text:''}}
    }
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);

  for(const index of [0,1,2]){
    const pseudo=page.locator(`.gap-token[data-gap-token="${index}"]`);
    await pseudo.locator('.token').click();
    assert.ok((await pseudo.locator('.mark').getAttribute('class')).includes('mark-cursor'));
    assert.equal(await page.locator('.mark-cursor').count(),1);
  }

  await press(page,'i');
  await page.locator('.gap-token[data-gap-token="1"] .token').click();
  assert.equal(await page.locator('#modeBadge').textContent(),'NORMAL');
  assert.ok((await page.locator('.gap-token[data-gap-token="1"] .mark').getAttribute('class')).includes('mark-cursor'));

  await page.locator('.word[data-index="0"]').click();
  await press(page,'h');
  assert.ok((await page.locator('.gap-token[data-gap-token="0"] .mark').getAttribute('class')).includes('mark-cursor'));
  await press(page,'l');
  assert.equal((await currentCursor(page)).word,0);
  await press(page,'l');
  assert.ok((await page.locator('.gap-token[data-gap-token="1"] .mark').getAttribute('class')).includes('mark-cursor'));
  await press(page,'l');
  assert.equal((await currentCursor(page)).word,1);
  await press(page,'l');
  assert.ok((await page.locator('.gap-token[data-gap-token="2"] .mark').getAttribute('class')).includes('mark-cursor'));
});

test('l visits the right slot of a split token before its adjacent pseudo token', async ({ page }) => {
  const inner={version:1,text:'split next',sentences:[{
    tokens:[
      {slot:{kind:'double',left:'aux',right:'ad'}},
      {slot:{kind:'single',text:''}}
    ],
    pseudoTokens:{1:[{text:'pseudo',slot:{kind:'single',text:'V'}}]}
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('[data-work-word="0"][data-work-slot="left"]').click();

  await press(page,'l');
  let cursor=await currentCursor(page);
  assert.equal(cursor.word,0);
  assert.equal(cursor.workSlot,'right');

  await press(page,'l');
  cursor=await currentCursor(page);
  assert.equal(cursor.gapToken,'1');
  assert.equal(cursor.gapTokenIndex,'0');
});

test('h and l reach a pseudo token immediately beside a group slot', async ({ page }) => {
  const inner={version:1,text:'His carrer culminated in his being elected President.',sentences:[{
    tokens:Array.from({length:8},() => ({slot:{kind:'single',text:''}})),
    pseudoTokens:{5:{text:'int',slot:{kind:'single',text:''}}},
    structures:[
      {id:1,kind:'group',members:[{token:1,port:'single'},{token:2,port:'single'}],form:'underline',mark:''},
      {id:2,kind:'group',members:[{token:3,port:'single'},{token:4,port:'single'}],form:'underline',mark:''},
      {id:3,kind:'group',members:[{structure:1,port:'single'},{structure:2,port:'single'}],form:'underline',mark:''},
      {id:4,kind:'group',members:[{token:5,port:'single'},{token:6,port:'single'}],form:'underline',mark:''},
      {id:5,kind:'group',members:[{structure:4,port:'single'},{token:7,port:'single'}],form:'underline',mark:''}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.group-mark[data-group-work="2"]').evaluate((el) => el.click());
  await press(page,'l');
  assert.ok((await page.locator('.gap-token[data-gap-token="5"] .mark').getAttribute('class')).includes('mark-cursor'));

  await page.locator('.group-mark[data-group-work="4"]').evaluate((el) => el.click());
  await press(page,'h');
  assert.ok((await page.locator('.gap-token[data-gap-token="5"] .mark').getAttribute('class')).includes('mark-cursor'));

  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.group-mark[data-group-work="2"]').evaluate((el) => el.click());
  await typeKeys(page,['V','l']);
  const snap=await groupSelectionSnapshot(page);
  assert.equal(snap.cursor[0].gapToken,'5');
});

test('creating a pseudo token from a group cursor leaves exactly one blue cursor', async ({ page }) => {
  const inner={version:1,text:'a b',sentences:[{
    tokens:[
      {slot:{kind:'single',text:''}},
      {slot:{kind:'single',text:''}}
    ],
    structures:[
      {id:1,kind:'group',members:[{token:0,port:'single'},{token:1,port:'single'}],form:'underline',mark:''}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.group-mark[data-group-work="1"]').evaluate((el) => el.click());
  await typeKeys(page,['b','/']);
  await page.locator('.direct-slot-input').fill('int');
  await press(page,'Enter');

  const blueCursorSelector=[
    '.mark-cursor','.dual-slot-cursor','.verbal-slot-cursor',
    '.group-mark-cursor','.group-underline-cursor','.group-verbal-slot-cursor',
    '.word.cursor','.gap-cursor'
  ].join(',');
  assert.equal(await page.locator(blueCursorSelector).count(),1);
  assert.equal(await page.locator('.gap-cursor').count(),1);
});

test('u and Ctrl+r undo and redo a mark edit', async ({ page }) => {
  await typeKeys(page, ['s', 'Enter']);
  assert.equal(await firstTokenText(page), 'S');
  await press(page, 'u');
  assert.equal(await firstTokenText(page), '');
  await press(page, 'Control+r');
  assert.equal(await firstTokenText(page), 'S');
});

test('V selection starts with one gray cursor on the current slot', async ({ page }) => {
  await press(page, 'V');
  const snap = await groupSelectionSnapshot(page);
  assert.match(snap.mode, /^GROUP SELECT/);
  assert.equal(snap.active.length, 1);
  assert.equal(snap.cursor.length, 1);
  assert.equal(snap.cursor[0].word, 0);
  const visual = await groupSelectionCursorVisual(page);
  assert.ok(visual.width >= 28);
  assert.equal(visual.height, 20);
  assert.equal(visual.position, 'relative');
  assert.notEqual(visual.afterContent, 'none');
  assert.equal(visual.afterLeft, '-4px');
  assert.equal(visual.afterRight, '-4px');
  assert.equal(visual.afterTop, '-4px');
  assert.equal(visual.afterBottom, '-4px');
  assert.equal(visual.afterBorderTopWidth, '2px');
  assert.equal(visual.afterBorderTopStyle, 'solid');
});

test('V selection l moves gray cursor to the head slot and grows active range', async ({ page }) => {
  await typeKeys(page, ['V', 'l']);
  const snap = await groupSelectionSnapshot(page);
  assert.equal(snap.active.length, 2);
  assert.equal(snap.cursor.length, 1);
  assert.equal(snap.cursor[0].word, 1);
});

test('V selection h shrinks active range and moves gray cursor back', async ({ page }) => {
  await typeKeys(page, ['V', 'l', 'h']);
  const snap = await groupSelectionSnapshot(page);
  assert.equal(snap.active.length, 1);
  assert.equal(snap.cursor.length, 1);
  assert.equal(snap.cursor[0].word, 0);
});

test('normal l moves between empty slots inside the same underline', async ({ page }) => {
  await typeKeys(page, ['V', 'l', 'Enter', 'k', 'h', 'l']);
  const cursor = await currentCursor(page);
  assert.equal(cursor.word, 1);
  assert.ok(cursor.classes.includes('mark-cursor'));
});

test('V selection l follows normal movement between empty slots in one underline', async ({ page }) => {
  await typeKeys(page, ['V', 'l', 'Enter', 'k', 'h', 'V', 'l']);
  const snap = await groupSelectionSnapshot(page);
  assert.equal(snap.cursor.length, 1);
  assert.equal(snap.cursor[0].word, 1);
  assert.ok(snap.cursor[0].classes.includes('mark'));
});

test('V selection contains only slots visited while moving across an empty group', async ({ page }) => {
  await typeKeys(page, ['l', 'V', 'l', 'Enter', 'h', 'V', 'l', 'l']);
  let snap = await groupSelectionSnapshot(page);
  assert.equal(snap.active.length, 3);
  assert.deepEqual(snap.active.map((item) => item.word).filter((word) => word != null), [0, 3]);
  assert.deepEqual(snap.active.map((item) => item.group).filter(Boolean), ['1']);

  await press(page, 'h');
  snap = await groupSelectionSnapshot(page);
  assert.equal(snap.active.length, 2);
  assert.deepEqual(snap.active.map((item) => item.word).filter((word) => word != null), [0]);
  assert.deepEqual(snap.active.map((item) => item.group).filter(Boolean), ['1']);
});

test('V selection commits only visited slots after crossing an empty group', async ({ page }) => {
  await typeKeys(page, ['l', 'V', 'l', 'Enter', 'h', 'V', 'l', 'l', 'Enter']);
  const doc=await internalJson(page);
  const group=doc.sentences[0].structures.find((item) => item.kind === 'group' && item.id === 2);
  assert.deepEqual(group.members, [
    {token:0,port:'single'},
    {structure:1,port:'single'},
    {token:3,port:'single'}
  ]);
});

test('Escape leaves V selection mode without creating a group', async ({ page }) => {
  await typeKeys(page, ['V', 'l', 'Escape']);
  const snap = await groupSelectionSnapshot(page);
  assert.equal(snap.mode, 'NORMAL');
  assert.equal(snap.active.length, 0);
  assert.equal(snap.fixed.length, 0);
  assert.equal(snap.cursor.length, 0);

  const doc = await internalJson(page);
  assert.equal((doc.sentences[0].structures ?? []).some((x) => x.kind === 'group'), false);
});

test('Escape leaves V selection mode after fixing a segment', async ({ page }) => {
  await typeKeys(page, ['V', 'l', 'V', 'Escape']);
  const snap = await groupSelectionSnapshot(page);
  assert.equal(snap.mode, 'NORMAL');
  assert.equal(snap.active.length, 0);
  assert.equal(snap.fixed.length, 0);
  assert.equal(snap.cursor.length, 0);

  const doc = await internalJson(page);
  assert.equal((doc.sentences[0].structures ?? []).some((x) => x.kind === 'group'), false);
});

test('V selection moves across double-slot left and right positions', async ({ page }) => {
  await typeKeys(page, ['d', 'V']);
  let snap = await groupSelectionSnapshot(page);
  assert.equal(snap.cursor[0].word, 0);
  assert.equal(snap.cursor[0].workSlot, 'left');

  await press(page, 'l');
  snap = await groupSelectionSnapshot(page);
  assert.equal(snap.active.length, 2);
  assert.equal(snap.cursor.length, 1);
  assert.equal(snap.cursor[0].word, 0);
  assert.equal(snap.cursor[0].workSlot, 'right');

  await press(page, 'l');
  snap = await groupSelectionSnapshot(page);
  assert.equal(snap.active.length, 3);
  assert.equal(snap.cursor[0].word, 1);
  assert.equal(snap.cursor[0].workSlot, 'single');
});

test('V selection moves across token T left and right positions', async ({ page }) => {
  await typeKeys(page, ['t', 'V']);
  let snap = await groupSelectionSnapshot(page);
  assert.equal(snap.cursor[0].word, 0);
  assert.equal(snap.cursor[0].workSlot, 'left');

  await press(page, 'l');
  snap = await groupSelectionSnapshot(page);
  assert.equal(snap.active.length, 2);
  assert.equal(snap.cursor.length, 1);
  assert.equal(snap.cursor[0].word, 0);
  assert.equal(snap.cursor[0].workSlot, 'right');
});

test('V can fix one segment, move gap, add another segment, and commit a non-contiguous group', async ({ page }) => {
  await typeKeys(page, ['V', 'l', 'V']);
  let snap = await groupSelectionSnapshot(page);
  assert.match(snap.mode, /^GROUP GAP/);
  assert.equal(snap.fixed.length, 2);
  assert.equal(snap.active.length, 0);

  await typeKeys(page, ['l', 'l', 'V', 'l']);
  snap = await groupSelectionSnapshot(page);
  assert.match(snap.mode, /^GROUP SELECT/);
  assert.equal(snap.fixed.length, 2);
  assert.equal(snap.active.length, 2);
  assert.equal(snap.cursor.length, 1);
  assert.equal(snap.cursor[0].word, 4);

  await press(page, 'Enter');
  const doc = await internalJson(page);
  const group = doc.sentences[0].structures.find((x) => x.kind === 'group');
  assert.equal(group.form, 'underline');
  assert.deepEqual(group.members, [
    {token:0,port:'single'},
    {token:1,port:'single'},
    {token:3,port:'single'},
    {token:4,port:'single'}
  ]);
});

test('j enters a committed V underline and k returns to the preserved column', async ({ page }) => {
  await typeKeys(page, ['V', 'l', 'Enter']);
  await press(page, 'k');
  await press(page, 'j');
  let cursor = await currentCursor(page);
  assert.equal(cursor.group, '1');
  await press(page, 'k');
  cursor = await currentCursor(page);
  assert.equal(cursor.word, 1);
});

test('V on a selected underline shows the gray selection cursor on that underline', async ({ page }) => {
  await typeKeys(page, ['V', 'l', 'Enter', 'V']);
  const snap = await groupSelectionSnapshot(page);
  assert.match(snap.mode, /^GROUP SELECT/);
  assert.equal(snap.active.length, 1);
  assert.equal(snap.cursor.length, 1);
  assert.equal(snap.cursor[0].word, null);
  assert.equal(snap.cursor[0].classes.includes('group-underline'), true);
  assert.equal(await page.locator('.group-underline-cursor').count(), 0);
  const visual = await page.locator('.group-underline.slot-group-selection-cursor').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const after = getComputedStyle(el, '::after');
    return {
      width: rect.width,
      content: after.content,
      top: after.top,
      bottom: after.bottom,
      height: after.height,
      slotHeight: getComputedStyle(el).getPropertyValue('--slot-cursor-height').trim(),
      borderStyle: after.borderTopStyle,
      borderWidth: after.borderTopWidth
    };
  });
  assert.ok(visual.width > 0);
  assert.notEqual(visual.content, 'none');
  assert.equal(visual.top, '-4px');
  assert.equal(visual.height, '28px');
  assert.equal(visual.slotHeight, '20px');
  assert.equal(visual.borderStyle, 'solid');
  assert.equal(visual.borderWidth, '2px');
});

test('all slot cursor types use the shared slot geometry', async ({ page }) => {
  const cases = [
    {name:'single', keys:[], selector:'.mark-cursor', layout:'single'},
    {name:'double', keys:['d'], selector:'.dual-slot-cursor', layout:'double-pair'},
    {name:'token T', keys:['t'], selector:'.verbal-slot-cursor', layout:'t-pair'},
    {name:'group underline', keys:['V','l','Enter'], selector:'.group-underline-cursor', layout:'underline', pseudo:true},
    {name:'group mark', keys:['V','l','Enter','s','Enter'], selector:'.group-mark-cursor', layout:'single'},
    {name:'group T', keys:['V','l','Enter','t'], selector:'.group-verbal-slot-cursor', layout:'t-pair'},
    {name:'V selection', keys:['V'], selector:'.slot-group-selection-cursor', layout:'single'}
  ];

  for (const item of cases) {
    await page.goto(indexUrl);
    await page.locator('#input').fill(sampleText);
    await page.locator('#workspace').click();
    await page.waitForFunction(() => document.querySelectorAll('.word:not([data-dummy])').length === 8);
    await typeKeys(page, item.keys);
    const geometry = await page.locator(item.selector).first().evaluate((el, pseudo) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        layout:el.dataset.slotLayout,
        minWidth:Number(el.dataset.slotMinWidth),
        actualWidth:rect.width,
        declaredHeight:style.getPropertyValue('--slot-cursor-height').trim(),
        actualHeight:pseudo ? getComputedStyle(el, '::after').height : `${rect.height}px`
      };
    }, Boolean(item.pseudo));
    assert.equal(geometry.layout, item.layout, item.name);
    assert.ok(geometry.actualWidth + 0.1 >= geometry.minWidth, item.name);
    assert.equal(geometry.declaredHeight, '20px', item.name);
    assert.equal(geometry.actualHeight, '20px', item.name);
  }
});

test('all normal cursor types have a visible border', async ({ page }) => {
  const cases = [
    {name:'single', keys:[], selector:'.mark-cursor'},
    {name:'double', keys:['d'], selector:'.dual-slot-cursor'},
    {name:'token T', keys:['t'], selector:'.verbal-slot-cursor'},
    {name:'group underline', keys:['V','l','Enter'], selector:'.group-underline-cursor', pseudo:'::after'},
    {name:'group mark', keys:['V','l','Enter','s','Enter'], selector:'.group-mark-cursor'},
    {name:'group T', keys:['V','l','Enter','t'], selector:'.group-verbal-slot-cursor'}
  ];
  for(const item of cases){
    await page.goto(indexUrl);
    await page.locator('#input').fill(sampleText);
    await page.locator('#workspace').click();
    await page.waitForFunction(() => document.querySelectorAll('.word:not([data-dummy])').length === 8);
    await typeKeys(page,item.keys);
    const border=await page.locator(item.selector).first().evaluate((el,pseudo) => {
      const style=getComputedStyle(el,pseudo || null);
      return {width:style.borderTopWidth,style:style.borderTopStyle,color:style.borderTopColor};
    },item.pseudo || null);
    assert.equal(border.width,'2px',item.name);
    assert.equal(border.style,'solid',item.name);
    assert.notEqual(border.color,'rgba(0, 0, 0, 0)',item.name);
  }
});

test('fixed orange cursors keep a visible border on every selectable slot shape', async ({ page }) => {
  const cases = [
    {name:'single', keys:['V','V'], selector:'.mark.slot-group-selecting-fixed'},
    {name:'double', keys:['d','V','V'], selector:'.dual-left.slot-group-selecting-fixed'},
    {name:'token T', keys:['t','V','V'], selector:'.verbal-left.slot-group-selecting-fixed'},
    {name:'group underline', keys:['V','l','Enter','V','V'], selector:'.group-underline.slot-group-selecting-fixed', pseudo:'::before'},
    {name:'group T', keys:['V','l','Enter','t','V','V'], selector:'.group-verbal-left.slot-group-selecting-fixed'}
  ];
  for(const item of cases){
    await page.goto(indexUrl);
    await page.locator('#input').fill(sampleText);
    await page.locator('#workspace').click();
    await page.waitForFunction(() => document.querySelectorAll('.word:not([data-dummy])').length === 8);
    await typeKeys(page,item.keys);
    const border=await page.locator(item.selector).first().evaluate((el,pseudo) => {
      const style=getComputedStyle(el,pseudo || null);
      return {
        content:style.content,
        width:style.borderTopWidth,
        style:style.borderTopStyle,
        color:style.borderTopColor,
        height:style.height
      };
    },item.pseudo || null);
    if(item.pseudo) assert.notEqual(border.content,'none',item.name);
    assert.equal(border.width,'2px',item.name);
    assert.equal(border.style,'solid',item.name);
    assert.match(border.color,/rgb\(234, 88, 12\)|rgba\(234, 88, 12, /,item.name);
    assert.equal(border.height,'20px',item.name);
  }
});

test('h and l stay on the same underline when it has another leaf in that direction', async ({ page }) => {
  const inner={version:1,text:'a b c',sentences:[{
    tokens:[0,1,2].map(() => ({slot:{kind:'single',text:''}})),
    structures:[
      {id:1,kind:'group',members:[{token:0,port:'single'},{token:2,port:'single'}],form:'underline',mark:''}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await typeKeys(page,['j','k','l']);
  let cursor=await currentCursor(page);
  assert.equal(cursor.word,2);
  await press(page,'h');
  cursor=await currentCursor(page);
  assert.equal(cursor.word,0);
});

test('l reaches President through adjacent child and parent underlines', async ({ page }) => {
  const inner={version:1,text:'His carrer culminated in his being elected President.',sentences:[{
    tokens:Array.from({length:8},() => ({slot:{kind:'single',text:''}})),
    structures:[
      {id:1,kind:'group',members:[{token:1,port:'single'},{token:2,port:'single'}],form:'underline',mark:''},
      {id:3,kind:'group',members:[{structure:1,port:'single'},{structure:2,port:'single'}],form:'underline',mark:''},
      {id:2,kind:'group',members:[{token:3,port:'single'},{token:4,port:'single'}],form:'underline',mark:''},
      {id:4,kind:'group',members:[{token:5,port:'single'},{token:6,port:'single'}],form:'underline',mark:''},
      {id:5,kind:'group',members:[{structure:4,port:'single'},{token:7,port:'single'}],form:'underline',mark:''}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.word[data-index="6"]').click();
  await press(page,'l');
  let cursor=await currentCursor(page);
  assert.equal(cursor.word,7);

  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.word[data-index="6"]').click();
  await typeKeys(page,['V','l']);
  const snap=await groupSelectionSnapshot(page);
  assert.equal(snap.cursor[0].word,7);

  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.group-underline[data-group-underline="5"]').first().evaluate((el) => el.click());
  await typeKeys(page,['k','l']);
  cursor=await currentCursor(page);
  assert.equal(cursor.word,7);
  await press(page,'h');
  cursor=await currentCursor(page);
  assert.equal(cursor.group,'4');
  assert.ok(cursor.classes.includes('group-mark-cursor'));
  await press(page,'l');
  cursor=await currentCursor(page);
  assert.equal(cursor.word,7);
});

test('h moves from President to the adjacent group slot instead of its inner right leaf', async ({ page }) => {
  const inner={version:1,text:'being elected President.',sentences:[{
    tokens:Array.from({length:3},() => ({slot:{kind:'single',text:''}})),
    structures:[
      {id:1,kind:'group',members:[{token:0,port:'single'},{token:1,port:'single'}],form:'underline',mark:''},
      {id:2,kind:'group',members:[{structure:1,port:'single'},{token:2,port:'single'}],form:'underline',mark:''}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.word[data-index="2"]').click();
  const beforeBox=await page.locator('.mark-cursor').boundingBox();
  await press(page,'h');
  let cursor=await currentCursor(page);
  assert.equal(cursor.group,'1');
  assert.ok(cursor.classes.includes('group-mark-cursor'));
  const afterBox=await page.locator('.group-mark-cursor').boundingBox();
  const centerDelta=Math.abs((beforeBox.y+beforeBox.height/2)-(afterBox.y+afterBox.height/2));
  assert.ok(centerDelta <= 2,JSON.stringify({beforeBox,afterBox,centerDelta}));

  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.word[data-index="2"]').click();
  await typeKeys(page,['V','h']);
  const snap=await groupSelectionSnapshot(page);
  assert.equal(snap.cursor[0].group,'1');
});

test('normal and V selection movement go directly between top-level C and V group marks', async ({ page }) => {
  const inner={version:1,text:'His carrer culminated in his being elected President.',sentences:[{
    tokens:Array.from({length:8},() => ({slot:{kind:'single',text:''}})),
    structures:[
      {id:1,kind:'group',members:[{token:1,port:'single'},{token:2,port:'single'}],form:'underline',mark:''},
      {id:4,kind:'group',members:[{structure:1,port:'single'},{structure:2,port:'single'}],form:'underline',mark:'C'},
      {id:2,kind:'group',members:[{token:3,port:'single'},{token:4,port:'single'}],form:'underline',mark:''},
      {id:3,kind:'group',members:[{token:5,port:'single'},{token:6,port:'single'}],form:'underline',mark:''},
      {id:5,kind:'group',members:[{structure:3,port:'single'},{token:7,port:'single'}],form:'underline',mark:'V'}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.group-mark[data-group-work="4"]').evaluate((el) => el.click());
  await press(page,'l');
  let cursor=await currentCursor(page);
  assert.equal(cursor.group,'5');
  assert.ok(cursor.classes.includes('group-mark-cursor'));
  assert.equal(cursor.text,'V');
  await press(page,'h');
  cursor=await currentCursor(page);
  assert.equal(cursor.group,'4');
  assert.equal(cursor.text,'C');

  await press(page,'V');
  await press(page,'l');
  const snap=await groupSelectionSnapshot(page);
  assert.equal(snap.cursor[0].group,'5');
});

test('j and k traverse four nested underlines while an orange selection is fixed', async ({ page }) => {
  const structures=[
    {id:1,kind:'group',members:[{token:0,port:'single'}],form:'underline',mark:''},
    {id:2,kind:'group',members:[{structure:1,port:'single'}],form:'underline',mark:''},
    {id:3,kind:'group',members:[{structure:2,port:'single'}],form:'underline',mark:''},
    {id:4,kind:'group',members:[{structure:3,port:'single'}],form:'underline',mark:''}
  ];
  const inner={version:1,text:'a',sentences:[{
    tokens:[{slot:{kind:'single',text:''}}],
    structures
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await typeKeys(page,['V','V']);
  let snap=await groupSelectionSnapshot(page);
  assert.equal(snap.fixed.length,1);

  for(const group of ['1','2','3','4']){
    await press(page,'j');
    snap=await groupSelectionSnapshot(page);
    assert.equal(snap.cursor[0].group,group);
    assert.equal(snap.fixed.length,1);
  }
  for(const group of ['3','2','1']){
    await press(page,'k');
    snap=await groupSelectionSnapshot(page);
    assert.equal(snap.cursor[0].group,group);
    assert.equal(snap.fixed.length,1);
  }
  await press(page,'k');
  snap=await groupSelectionSnapshot(page);
  assert.equal(snap.cursor[0].word,0);
  assert.equal(snap.fixed.length,1);

  await typeKeys(page,['j','V','j']);
  snap=await groupSelectionSnapshot(page);
  assert.match(snap.mode,/^GROUP SELECT/);
  assert.equal(snap.cursor[0].group,'2');
  assert.equal(snap.fixed.length,1);
  assert.equal(snap.active.length,2);
  await press(page,'k');
  snap=await groupSelectionSnapshot(page);
  assert.equal(snap.cursor[0].group,'1');
  assert.equal(snap.active.length,1);
});

test('vertical movement preserves the column chosen by the last horizontal move', async ({ page }) => {
  const inner={version:1,text:'a b',sentences:[{
    tokens:[0,1].map(() => ({slot:{kind:'single',text:''}})),
    structures:[
      {id:1,kind:'group',members:[{token:0,port:'single'}],form:'underline',mark:''},
      {id:2,kind:'group',members:[{token:1,port:'single'}],form:'underline',mark:''},
      {id:3,kind:'group',members:[{structure:1,port:'single'},{structure:2,port:'single'}],form:'underline',mark:''}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await typeKeys(page,['l','j','j','k','k']);
  let cursor=await currentCursor(page);
  assert.equal(cursor.word,1);

  await typeKeys(page,['h','j','j','k','k']);
  cursor=await currentCursor(page);
  assert.equal(cursor.word,0);

  await typeKeys(page,['V','l','j','j','k','k']);
  const snap=await groupSelectionSnapshot(page);
  assert.equal(snap.cursor[0].word,1);
});

test('j moves to the next line and k to the previous line when no structural slot exists', async ({ page }) => {
  await page.locator('#input').fill('a b\nc d');
  await page.locator('#workspace').click();
  await page.waitForFunction(() => document.querySelectorAll('.word:not([data-dummy])').length === 4);

  await page.locator('.word[data-index="0"]').click();
  await press(page,'j');
  assert.equal((await currentCursor(page)).word,2);

  await press(page,'k');
  assert.equal((await currentCursor(page)).word,0);

  await page.locator('.word[data-index="1"]').click();
  await press(page,'j');
  assert.equal((await currentCursor(page)).word,3);
  await press(page,'k');
  assert.equal((await currentCursor(page)).word,1);
});

test('0 and $ move to the start and end of the current line', async ({ page }) => {
  await page.locator('#input').fill('a b\nc d');
  await page.locator('#workspace').click();
  await page.waitForFunction(() => document.querySelectorAll('.word:not([data-dummy])').length === 4);

  await page.locator('.word[data-index="2"]').click();
  await press(page,'$');
  assert.equal((await currentCursor(page)).word,3);
  await press(page,'0');
  assert.equal((await currentCursor(page)).word,2);

  await page.locator('.word[data-index="0"]').click();
  await press(page,'$');
  assert.equal((await currentCursor(page)).word,1);
});

test('horizontal movement prefers the greatest row index not below the current row', async ({ page }) => {
  const inner={version:1,text:'a b c d e',sentences:[{
    tokens:Array.from({length:5},() => ({slot:{kind:'single',text:''}})),
    structures:[
      {id:1,kind:'group',members:[{token:0,port:'single'}],form:'underline',mark:''},
      {id:2,kind:'group',members:[{token:1,port:'single'}],form:'underline',mark:''},
      {id:3,kind:'group',members:[{structure:1,port:'single'},{structure:2,port:'single'}],form:'underline',mark:'A'},
      {id:4,kind:'group',members:[{token:2,port:'single'}],form:'underline',mark:'B'},
      {id:5,kind:'group',members:[{token:3,port:'single'}],form:'underline',mark:''},
      {id:6,kind:'group',members:[{token:4,port:'single'}],form:'underline',mark:''},
      {id:7,kind:'group',members:[{structure:5,port:'single'},{structure:6,port:'single'}],form:'underline',mark:'C'}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.group-mark[data-group-work="3"]').evaluate((el) => el.click());
  await press(page,'l');
  let cursor=await currentCursor(page);
  assert.equal(cursor.group,'7');
  assert.equal(cursor.text,'C');
  await press(page,'h');
  cursor=await currentCursor(page);
  assert.equal(cursor.group,'3');
  assert.equal(cursor.text,'A');
});

test('j moves to the next line after reaching the bottom of the structural grid', async ({ page }) => {
  const inner={version:1,text:'a b\nc',sentences:[
    {
      tokens:[0,1].map(() => ({slot:{kind:'single',text:''}})),
      structures:[{id:1,kind:'group',members:[{token:0,port:'single'},{token:1,port:'single'}],form:'underline',mark:''}]
    },
    {tokens:[{slot:{kind:'single',text:''}}]}
  ]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await press(page,'j');
  let cursor=await currentCursor(page);
  assert.equal(cursor.group,'1');
  await press(page,'j');
  cursor=await currentCursor(page);
  assert.equal(cursor.word,2);
});

test('nested underline and T lines are ordered by span at equal intervals', async ({ page }) => {
  await typeKeys(page, [
    's', 'Enter', 'l', 'v', 'l', 'o', 'l', 'c', 'Enter', 'l', 'm',
    '0', 'V', 'l', 'l', 'l', 'l', 'Enter',
    'k', 'h', 'h', 'h', 'h', 'V', 'l', 'l', 'Enter',
    'k', 'h', 'h', 'V', 'l', 'Enter', 't'
  ]);
  await page.waitForTimeout(50);

  const layout = await page.evaluate(() => ({
    lines:[...document.querySelectorAll('.group-underline')].map((el) => {
      const rect=el.getBoundingClientRect();
      return {group:Number(el.dataset.groupUnderline), top:rect.top, width:rect.width};
    }).sort((a,b) => a.top-b.top),
    innerTBottom:document.querySelector('[data-group-visual="3"]')?.getBoundingClientRect().bottom
  }));
  const lines=layout.lines;

  assert.deepEqual(lines.map((line) => line.group), [3, 2, 1]);
  assert.ok(lines[0].width < lines[1].width && lines[1].width < lines[2].width);
  assert.ok(Math.abs((lines[1].top-lines[0].top) - 27) < 0.1);
  assert.ok(Math.abs((lines[2].top-lines[1].top) - 27) < 0.1);
  assert.ok(layout.innerTBottom <= lines[1].top);
});

test('an empty child underline is not pushed down by work in its parent group', async ({ page }) => {
  const inner={version:1,text:'21. I can’t do any of those things.',sentences:[{
    tokens:[
      {slot:{kind:'single',text:''}},
      {slot:{kind:'single',text:'S'}},
      {slot:{kind:'double',left:'aux',right:'ad'}},
      {slot:{kind:'single',text:'(3)'}},
      {slot:{kind:'single',text:'O'}},
      {slot:{kind:'single',text:'前'}},
      {slot:{kind:'single',text:''}},
      {slot:{kind:'single',text:''}}
    ],
    structures:[
      {id:4,kind:'group',members:[{token:5,port:'single'},{structure:3,port:'single'}],form:'underline',mark:'a'},
      {id:3,kind:'group',members:[{token:6,port:'single'},{token:7,port:'single'}],form:'underline',mark:'n'}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);

  const geometry=await page.evaluate(() => {
    const child=document.querySelector('.group-underline[data-group-underline="3"]')?.getBoundingClientRect();
    const parent=document.querySelector('.group-underline[data-group-underline="4"]')?.getBoundingClientRect();
    const tokenRects=[6,7].map(index =>
      document.querySelector(`[data-token-index="${index}"]`)?.getBoundingClientRect()
    );
    const emptySlot=document.querySelector('[data-work-word="6"][data-work-slot="single"]')?.getBoundingClientRect();
    return {
      childTop:child?.top,
      parentTop:parent?.top,
      tokenBottom:Math.max(...tokenRects.map(rect => rect?.bottom ?? -Infinity)),
      emptySlotBottom:emptySlot?.bottom
    };
  });
  assert.ok(Math.abs(geometry.childTop-(geometry.tokenBottom+1)) < 0.5,JSON.stringify(geometry));
  assert.ok(geometry.childTop < geometry.emptySlotBottom,JSON.stringify(geometry));
  assert.ok(Math.abs(geometry.parentTop-geometry.childTop-27) < 0.5,JSON.stringify(geometry));
});

test('U removes the current V underline group', async ({ page }) => {
  await typeKeys(page, ['V', 'l', 'Enter', 'U']);
  const doc = await internalJson(page);
  assert.equal(doc.sentences[0].structures, undefined);
});

test('U removes an existing underline while its V selection cursor is visible', async ({ page }) => {
  await typeKeys(page, ['V','l','Enter','V','U']);
  const doc=await internalJson(page);
  assert.equal(doc.sentences[0].structures,undefined);
  assert.equal(await page.locator('.group-underline').count(),0);
  const snap=await groupSelectionSnapshot(page);
  assert.equal(snap.cursor.length,0);
});

test('U removes nested underlines from the innermost one without dangling parent members', async ({ page }) => {
  const inner={version:1,text:'a',sentences:[{
    tokens:[{slot:{kind:'single',text:''}}],
    structures:[
      {id:1,kind:'group',members:[{token:0,port:'single'}],form:'underline',mark:''},
      {id:2,kind:'group',members:[{structure:1,port:'single'}],form:'underline',mark:''},
      {id:3,kind:'group',members:[{structure:2,port:'single'}],form:'underline',mark:''},
      {id:4,kind:'group',members:[{structure:3,port:'single'}],form:'underline',mark:''}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);

  for(const expectedIds of [[2,3,4],[3,4],[4],[]]){
    await press(page,'U');
    await page.waitForTimeout(30);
    const state=await page.evaluate(() => ({
      ids:(window.KiriEditorData.getInnerJson().sentences[0].structures || [])
        .filter((item) => item.kind === 'group')
        .map((item) => item.id),
      lines:[...document.querySelectorAll('.group-underline')]
        .map((el) => Number(el.dataset.groupUnderline))
    }));
    assert.deepEqual(state.ids,expectedIds);
    assert.deepEqual([...new Set(state.lines)].sort((a,b) => a-b),expectedIds);
  }
});

test('r creates an arrow from a to another slot and R deletes it', async ({ page }) => {
  await typeKeys(page, ['a', 'Enter', 'r', 'l', 'Enter']);
  let doc = await internalJson(page);
  assert.deepEqual(doc.sentences[0].arrows, [
    {
      from: { token: 0, port: 'single' },
      to: { token: 1, port: 'single' }
    }
  ]);
  await typeKeys(page, ['h', 'R']);
  doc = await internalJson(page);
  assert.equal(doc.sentences[0].arrows, undefined);
});

test('r can use a pseudo token as its modifier destination', async ({ page }) => {
  const inner={version:1,text:'source target',sentences:[{
    tokens:[
      {slot:{kind:'single',text:'a'}},
      {slot:{kind:'single',text:''}}
    ],
    pseudoTokens:{1:[
      {text:'pseudo',slot:{kind:'single',text:''}}
    ]}
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);

  await page.locator('.word[data-index="0"]').click();
  await press(page,'r');
  await page.locator('.gap-token[data-gap-token="1"][data-gap-token-index="0"]').click();
  await press(page,'Enter');

  const doc=await internalJson(page);
  const expected=[{
    from:{token:0,port:'single'},
    to:{pseudoToken:1,pseudoIndex:0,port:'single'}
  }];
  assert.deepEqual(doc.sentences[0].arrows,expected);
  assert.ok(await page.locator('#arrowLayer > path[marker-end]').count() > 0);

  await page.evaluate((document,value) => window.KiriEditorData.loadInnerJson(document,value),inner);
  await page.waitForTimeout(50);
  await page.locator('.word[data-index="0"]').click();
  await typeKeys(page,['r','l','Enter']);
  assert.deepEqual((await internalJson(page)).sentences[0].arrows,expected);
});

test("r connects didn't right ad to the pseudo V at the same line end", async ({ page }) => {
  const inner={version:1,text:"11. Yes, I did. / No, I didn’t.\n12. Don’t play the trumpet.",sentences:[
    {
      tokens:[
        {slot:{kind:'single',text:''}},
        {slot:{kind:'single',text:'文ad'}},
        {slot:{kind:'single',text:'S'}},
        {slot:{kind:'single',text:'V'}},
        {slot:{kind:'single',text:''}},
        {slot:{kind:'single',text:'文ad'}},
        {slot:{kind:'single',text:'S'}},
        {slot:{kind:'double',left:'aux',right:'ad'}}
      ],
      pseudoTokens:{8:[{text:'do',slot:{kind:'single',text:'V'}}]}
    },
    {
      tokens:Array.from({length:5},() => ({slot:{kind:'single',text:''}})),
      pseudoTokens:{0:[{text:'do',slot:{kind:'single',text:'V'}}]}
    }
  ]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('[data-work-word="7"][data-work-slot="right"]').click();
  await typeKeys(page,['r','$','Enter']);

  const doc=await internalJson(page);
  assert.doesNotMatch(await page.locator('#modeBadge').textContent(),/文を跨/);
  assert.deepEqual(doc.sentences[0].arrows,[{
    from:{token:7,port:'right'},
    to:{pseudoToken:8,pseudoIndex:0,port:'single'}
  }]);
  assert.ok(await page.locator('#arrowLayer > path[marker-end]').count() > 0);
});

test('an arrow to an empty slot inside an underline ends at the slot top', async ({ page }) => {
  const inner={version:1,text:'source target pair',sentences:[{
    tokens:[
      {slot:{kind:'single',text:'a'}},
      {slot:{kind:'single',text:''}},
      {slot:{kind:'single',text:''}}
    ],
    structures:[{
      id:1,kind:'group',
      members:[{token:1,port:'single'},{token:2,port:'single'}],
      form:'underline',mark:''
    }]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  await page.locator('.word[data-index="0"]').click();
  await press(page,'r');
  await page.locator('.word[data-index="1"]').click();
  await press(page,'Enter');

  const geometry=await page.evaluate(() => {
    const workspace=document.querySelector('#workspace').getBoundingClientRect();
    const target=document.querySelector('[data-work-word="1"][data-work-slot="single"]').getBoundingClientRect();
    const path=document.querySelector('#arrowLayer path[marker-end]');
    const match=/L\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/.exec(path?.getAttribute('d') || '');
    return {
      endpointY:match ? Number(match[2]) : null,
      targetTop:target.top-workspace.top+document.querySelector('#workspace').scrollTop,
      targetBottom:target.bottom-workspace.top+document.querySelector('#workspace').scrollTop
    };
  });
  assert.ok(geometry.endpointY != null,JSON.stringify(geometry));
  assert.ok(Math.abs(geometry.endpointY-(geometry.targetTop-1)) <= 0.5,JSON.stringify(geometry));
  assert.ok(Math.abs(geometry.endpointY-(geometry.targetBottom+1)) > 1,JSON.stringify(geometry));
});

test('save persists inner_json, reload restores it, and delete clears storage', async ({ page }) => {
  const storageKey='kiri-kyo-editor:inner-json:v1';
  try {
    await typeKeys(page,['s','Enter','l','o','0','V','l','Enter']);
    const before=await internalJson(page);
    await page.locator('#saveLocal').click();
    const stored=await page.evaluate((key) => JSON.parse(localStorage.getItem(key)),storageKey);
    assert.deepEqual(stored,before);

    await page.locator('#clearAll').click();
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.group-underline').length === 1);
    assert.deepEqual(await internalJson(page),before);

    await page.locator('#deleteLocalSave').click();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key),storageKey),null);
    assert.deepEqual(await internalJson(page),before);
  } finally {
    await page.evaluate((key) => localStorage.removeItem(key),storageKey);
  }
});

test('core transitions are deterministic and do not mutate their input', async ({ page }) => {
  const result = await page.evaluate(() => {
    const previous = window.KiriEditorCore.createState('one two');
    const before = JSON.stringify(previous);
    const first = window.KiriEditorCore.syncText(previous, 'one two three');
    const second = window.KiriEditorCore.syncText(previous, 'one two three');
    const nested={
      groups:[
        {id:1,members:[{word:0,slot:null}]},
        {id:2,members:[{group:1,slot:null}],segments:[{startRef:{word:0,slot:null},endRef:{word:0,slot:null}}]}
      ],
      arrows:[]
    };
    const nestedBefore=JSON.stringify(nested);
    const removed=window.KiriEditorCore.removeGroup(nested,1);
    return {
      inputUnchanged: JSON.stringify(previous) === before,
      deterministic: JSON.stringify(first) === JSON.stringify(second),
      distinct: first !== previous && first.workSlots !== previous.workSlots,
      removeInputUnchanged:JSON.stringify(nested) === nestedBefore,
      flattenedMembers:removed.groups[0].members,
      clearedSegments:removed.groups[0].segments
    };
  });
  assert.deepEqual(result, {
    inputUnchanged:true,
    deterministic:true,
    distinct:true,
    removeInputUnchanged:true,
    flattenedMembers:[{word:0,slot:null}],
    clearedSegments:[]
  });
});

test('slot geometry calculation is pure and uses one height for every layout', async ({ page }) => {
  const result = await page.evaluate(() => {
    const input = {layout:'t-pair',side:'left',textWidth:40,peerTextWidth:70,availableWidth:180};
    const before = JSON.stringify(input);
    const first = window.KiriEditorCore.calculateSlotGeometry(input);
    const second = window.KiriEditorCore.calculateSlotGeometry(input);
    const heights = ['single','double-pair','t-pair','underline'].map((layout) =>
      window.KiriEditorCore.calculateSlotGeometry({...input,layout}).height
    );
    return {
      inputUnchanged:JSON.stringify(input) === before,
      deterministic:JSON.stringify(first) === JSON.stringify(second),
      heights
    };
  });
  assert.equal(result.inputUnchanged, true);
  assert.equal(result.deterministic, true);
  assert.deepEqual(result.heights, [20,20,20,20]);
});

test('horizontal cursor target calculation is pure and shared-slot aware', async ({ page }) => {
  const result = await page.evaluate(() => {
    const input = {
      direction:'right',
      current:{kind:'word',word:0,slot:'left',paired:true},
      previous:null,
      next:{kind:'group',group:1,slot:null,target:'underline',paired:false}
    };
    const before=JSON.stringify(input);
    const inside=window.KiriEditorCore.calculateHorizontalTarget(input);
    const outside=window.KiriEditorCore.calculateHorizontalTarget({
      ...input,
      current:inside
    });
    const containedInput={
      direction:'right',
      current:{word:0,slot:null},
      containingOrders:[
        [{word:0,slot:null}],
        [{word:0,slot:null},{word:3,slot:null}]
      ]
    };
    const containedBefore=JSON.stringify(containedInput);
    const contained=window.KiriEditorCore.calculateContainedHorizontalTarget(containedInput);
    const gridInput={
      direction:'right',
      current:{rowIdx:2,colIdx:0},
      candidates:[
        {ref:{group:4,slot:null},rowIdx:1,colIdx:2},
        {ref:{group:7,slot:null},rowIdx:2,colIdx:4}
      ]
    };
    const gridBefore=JSON.stringify(gridInput);
    const grid=window.KiriEditorCore.calculateGridHorizontalTarget(gridInput);
    const columnInput={
      column:4,
      candidates:[
        {ref:{group:5,slot:null},columns:[3]},
        {ref:{group:6,slot:null},columns:[4,5]}
      ]
    };
    const columnBefore=JSON.stringify(columnInput);
    const column=window.KiriEditorCore.calculateColumnPreservingTarget(columnInput);
    return {
      inputUnchanged:JSON.stringify(input) === before,
      containedInputUnchanged:JSON.stringify(containedInput) === containedBefore,
      gridInputUnchanged:JSON.stringify(gridInput) === gridBefore,
      columnInputUnchanged:JSON.stringify(columnInput) === columnBefore,
      inside,
      outside,
      contained,
      grid,
      column
    };
  });
  assert.equal(result.inputUnchanged, true);
  assert.equal(result.containedInputUnchanged, true);
  assert.equal(result.gridInputUnchanged, true);
  assert.equal(result.columnInputUnchanged, true);
  assert.deepEqual(result.inside, {kind:'word',word:0,slot:'right',paired:true,target:'right'});
  assert.deepEqual(result.outside, {kind:'group',group:1,slot:null,target:'underline',paired:false});
  assert.deepEqual(result.contained,{word:3,slot:null});
  assert.deepEqual(result.grid,{ref:{group:7,slot:null},rowIdx:2,colIdx:4});
  assert.deepEqual(result.column,{ref:{group:6,slot:null},columns:[4,5]});
});

test('selection path calculation is pure, backtracks, and compresses only visited refs', async ({ page }) => {
  const result=await page.evaluate(() => {
    const core=window.KiriEditorCore;
    const path=[{word:0,slot:null},{group:1,slot:null},{word:3,slot:null}];
    const before=JSON.stringify(path);
    const backtracked=core.updateSelectionPath(path,{group:1,slot:null});
    const order=[
      {word:0,slot:null},{word:1,slot:null},{word:2,slot:null},
      {group:1,slot:null},{word:3,slot:null}
    ];
    const runs=core.compressSelectionRefs(order,path);
    return {inputUnchanged:JSON.stringify(path) === before,backtracked,runs};
  });
  assert.equal(result.inputUnchanged,true);
  assert.deepEqual(result.backtracked,[{word:0,slot:null},{group:1,slot:null}]);
  assert.equal(result.runs.length,2);
  assert.deepEqual(result.runs.map((run) => [run.fromIndex,run.toIndex]),[[0,0],[3,4]]);
});

test('underline layout exhaustively satisfies every primitive-slot set relation', async ({ page }) => {
  const result=await page.evaluate(() => {
    const subsets=[];
    for(let mask=1;mask<8;mask++){
      subsets.push([0,1,2].filter((bit) => mask & (1 << bit)));
    }
    const inner={
      version:1,
      text:'a b c',
      sentences:[{
        text:'a b c',
        tokens:['a','b','c'].map((text) => ({text,slot:{kind:'single',text:''}})),
        groups:subsets.map((members,index) => ({
          id:index+1,
          members:members.map((token) => ({token,port:'single'})),
          form:'underline',
          mark:''
        })),
        boundaries:{},
        arrows:[]
      }]
    };
    const before=JSON.stringify(inner);
    const display=window.KiriEditorCore.createDisplayJson(inner);
    return {
      inputUnchanged:JSON.stringify(inner) === before,
      layouts:display.sentences[0].display.groups,
      subsets
    };
  });

  assert.equal(result.inputUnchanged,true);
  const layouts=new Map(result.layouts.map((layout) => [layout.id,layout]));
  const asSet=(values) => new Set(values);
  const subset=(left,right) => [...left].every((value) => right.has(value));

  for(let leftIndex=0;leftIndex<result.subsets.length;leftIndex++){
    for(let rightIndex=leftIndex+1;rightIndex<result.subsets.length;rightIndex++){
      const leftSet=asSet(result.subsets[leftIndex]);
      const rightSet=asSet(result.subsets[rightIndex]);
      const left=layouts.get(leftIndex+1);
      const right=layouts.get(rightIndex+1);
      const shared=[...leftSet].some((value) => rightSet.has(value));
      assert.equal(left.sharesWith.includes(right.id),shared);
      assert.equal(right.sharesWith.includes(left.id),shared);
      if(!shared) continue;

      assert.notEqual(left.level,right.level);
      const leftInside=subset(leftSet,rightSet) && leftSet.size<rightSet.size;
      const rightInside=subset(rightSet,leftSet) && rightSet.size<leftSet.size;
      if(leftInside) assert.ok(left.level<right.level);
      else if(rightInside) assert.ok(right.level<left.level);
      else if(leftSet.size<rightSet.size) assert.ok(left.level<right.level);
      else if(rightSet.size<leftSet.size) assert.ok(right.level<left.level);
      else assert.ok(left.id<right.id ? left.level<right.level : right.level<left.level);
    }
  }
});

test('underline layout recursively expands child groups and keeps the child above its parent', async ({ page }) => {
  const layouts=await page.evaluate(() => {
    const inner={version:1,text:'a',sentences:[{
      text:'a',
      tokens:[{text:'a',slot:{kind:'single',text:'',left:'',right:''}}],
      structures:[
        {id:20,kind:'group',members:[{token:0,port:'single'}],form:'underline',mark:''},
        {id:10,kind:'group',members:[{structure:20,port:'single'}],form:'underline',mark:''}
      ]
    }]};
    return window.KiriEditorCore.createDisplayJson(inner).sentences[0].display.groups;
  });
  const child=layouts.find((layout) => layout.id === 20);
  const parent=layouts.find((layout) => layout.id === 10);
  assert.deepEqual(child.primitiveSlots,['token:0:single']);
  assert.deepEqual(parent.primitiveSlots,['token:0:single']);
  assert.ok(parent.contains.includes(child.id));
  assert.ok(child.level<parent.level);
});

test('underline segments are runs of recursively contained leaf slots', async ({ page }) => {
  const layouts=await page.evaluate(() => {
    const inner={version:1,text:'a b c',sentences:[{
      tokens:[
        {slot:{kind:'double',left:'',right:''}},
        {slot:{kind:'single',text:''}},
        {slot:{kind:'single',text:''}}
      ],
      structures:[
        {kind:'verbal',token:2,form:'T',slots:{left:{kind:'single',text:''},right:{kind:'single',text:''}}},
        {id:1,kind:'group',members:[{token:0,port:'left'},{token:1,port:'single'}],form:'underline',mark:''},
        {id:2,kind:'group',members:[{structure:1,port:'single'}],form:'underline',mark:''},
        {id:3,kind:'group',members:[{token:0,port:'left'},{token:0,port:'right'},{token:1,port:'single'}],form:'underline',mark:''},
        {id:4,kind:'group',members:[{structure:3,port:'single'},{token:2,port:'single'}],form:'underline',mark:''}
      ]
    }]};
    return window.KiriEditorCore.createDisplayJson(inner).sentences[0].display.groups;
  });
  const segments=(id) => layouts.find((layout) => layout.id === id).underlineSegments;
  assert.deepEqual(segments(1).map((segment) => segment.primitiveSlots),[
    ['token:0:left'],
    ['token:1:single']
  ]);
  assert.deepEqual(segments(2),segments(1));
  assert.deepEqual(segments(3).map((segment) => segment.primitiveSlots),[
    ['token:0:left','token:0:right','token:1:single']
  ]);
  assert.deepEqual(segments(4).map((segment) => segment.primitiveSlots),[
    ['token:0:left','token:0:right','token:1:single','token:2:left','token:2:right']
  ]);
});

test('inner_json round-trips all semantic state and excludes display data', async ({ page }) => {
  const result=await page.evaluate(() => {
    const slot=(kind='single',text='',left='',right='') => kind === 'double'
      ? {kind,left,right}
      : {kind,text};
    const inner={version:1,text:'a b',sentences:[{
      tokens:[
        {slot:slot('double','','S','O')},
        {slot:slot('single','hidden')}
      ],
      structures:[
        {kind:'verbal',token:1,form:'T',slots:{left:slot('single','V'),right:slot()}},
        {id:1,kind:'group',members:[{pseudoToken:0,pseudoIndex:0,port:'single'},{token:0,port:'left'}],form:'underline',mark:'n'},
        {id:2,kind:'group',members:[{structure:1,port:'single'},{token:1,port:'left'}],form:'T',mark:'',slots:{left:slot(),right:slot('single','C')}}
      ],
      boundaries:{1:']'},
      pseudoTokens:{0:[{text:'You',slot:slot('single','S')}]},
      arrows:[{from:{structure:1,port:'single'},to:{token:1,port:'left'}}]
    }]};
    const core=window.KiriEditorCore;
    const restored=core.stateFromInnerJson(inner);
    const roundTrip=core.createInnerJson(restored);
    const displayOnlyChanged=core.clone(restored);
    for(const group of displayOnlyChanged.groups){
      group.segments=[{startRef:{word:999,slot:null},endRef:{word:999,slot:null}}];
      group.start=999;
      group.end=999;
      group.linkColor='#000000';
    }
    const afterDisplayOnlyChange=core.createInnerJson(displayOnlyChanged);
    const display=core.createDisplayJson(inner);
    return {inner,roundTrip,afterDisplayOnlyChange,display};
  });
  assert.deepEqual(result.roundTrip,result.inner);
  assert.deepEqual(result.afterDisplayOnlyChange,result.inner);
  assert.equal('display' in result.inner,false);
  assert.equal('display' in result.display,true);
  assert.equal(result.inner.sentences[0].structures.some((item) => 'ranges' in item || 'linkColor' in item),false);
  assert.ok(result.display.sentences[0].display.groups.every((layout) => Number.isInteger(layout.level)));
});

test('pseudo token insertion and removal keep structural references aligned', async ({ page }) => {
  const result=await page.evaluate(() => {
    const core=window.KiriEditorCore;
    const inner={version:1,text:'a b',sentences:[{
      tokens:[{slot:{kind:'single',text:''}},{slot:{kind:'single',text:''}}],
      pseudoTokens:{1:[
        {text:'one',slot:{kind:'single',text:''}},
        {text:'two',slot:{kind:'single',text:''}}
      ]},
      structures:[{
        id:1,kind:'group',form:'underline',mark:'',
        members:[{pseudoToken:1,pseudoIndex:1,port:'single'},{token:1,port:'single'}]
      }]
    }]};
    const original=core.stateFromInnerJson(inner);
    const inserted=core.insertPseudoToken(original,1,1,{text:'middle',slot:{kind:'single',text:''}});
    const afterInsert=core.createInnerJson(inserted);
    const removedBefore=core.removePseudoToken(inserted,1,0);
    const afterRemoveBefore=core.createInnerJson(removedBefore);
    const removedReferenced=core.removePseudoToken(removedBefore,1,1);
    const afterRemoveReferenced=core.createInnerJson(removedReferenced);
    return {inner,original:core.createInnerJson(original),afterInsert,afterRemoveBefore,afterRemoveReferenced};
  });

  assert.deepEqual(result.original,result.inner);
  assert.deepEqual(result.afterInsert.sentences[0].pseudoTokens[1].map(item => item.text),['one','middle','two']);
  assert.equal(result.afterInsert.sentences[0].structures[0].members[0].pseudoIndex,2);
  assert.equal(result.afterRemoveBefore.sentences[0].structures[0].members[0].pseudoIndex,1);
  assert.deepEqual(result.afterRemoveReferenced.sentences[0].structures[0].members,[
    {token:1,port:'single'}
  ]);
});

test('editor data API saves, loads, and derives display_json from inner_json', async ({ page }) => {
  await typeKeys(page,['s','Enter','l','o','0','V','l','Enter']);
  const saved=await page.evaluate(() => window.KiriEditorData.getInnerJson());
  const display=await page.evaluate(() => window.KiriEditorData.getDisplayJson());
  assert.equal(display.sentences[0].display.groups.length,1);
  assert.equal(display.sentences[0].display.groups[0].lineOffset,0);

  await page.evaluate((inner) => window.KiriEditorData.loadInnerJson(inner),saved);
  await page.waitForTimeout(50);
  assert.deepEqual(await internalJson(page),saved);
  assert.equal(await page.locator('.group-underline').count(),1);
});

test('browser rendering separates recursively shared underline regions', async ({ page }) => {
  const inner={version:1,text:'a b',sentences:[{
    text:'a b',
    tokens:[
      {text:'a',slot:{kind:'single',text:'',left:'',right:''}},
      {text:'b',slot:{kind:'single',text:'',left:'',right:''}}
    ],
    structures:[
      {id:20,kind:'group',members:[{token:0,port:'single'},{token:1,port:'single'}],form:'underline',mark:''},
      {id:10,kind:'group',members:[{structure:20,port:'single'}],form:'underline',mark:''},
      {id:30,kind:'group',members:[{token:0,port:'single'},{token:1,port:'single'}],form:'underline',mark:''}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  const tops=await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.group-underline')]
    .map((el) => [el.dataset.groupUnderline,el.getBoundingClientRect().top])));
  assert.equal(Object.keys(tops).length,3);
  assert.equal(new Set(Object.values(tops)).size,3);
  assert.ok(tops['20']<tops['10']);
  assert.ok([...Object.values(tops)].sort((a,b) => a-b).every((top,index,array) => index === 0 || Math.abs(top-array[index-1]-27)<0.1));
});

test('browser splits a parent underline at gaps in descendant leaf slots', async ({ page }) => {
  const inner={version:1,text:'a b',sentences:[{
    tokens:[
      {slot:{kind:'double',left:'',right:''}},
      {slot:{kind:'single',text:''}}
    ],
    structures:[
      {id:1,kind:'group',members:[{token:0,port:'left'},{token:1,port:'single'}],form:'underline',mark:''},
      {id:2,kind:'group',members:[{structure:1,port:'single'}],form:'underline',mark:''}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  const counts=await page.evaluate(() => ({
    child:document.querySelectorAll('.group-underline[data-group-underline="1"]').length,
    parent:document.querySelectorAll('.group-underline[data-group-underline="2"]').length,
    childMarks:document.querySelectorAll('.group-link-mark[data-group-visual="1"]').length,
    parentMarks:document.querySelectorAll('.group-link-mark[data-group-visual="2"]').length
  }));
  assert.deepEqual(counts,{child:2,parent:2,childMarks:2,parentMarks:2});
});

test('an underline stays below every visible cursor inside it', async ({ page }) => {
  const inner={version:1,text:'a b',sentences:[{
    tokens:[
      {slot:{kind:'single',text:''}},
      {slot:{kind:'single',text:'S'}}
    ],
    structures:[
      {id:1,kind:'group',members:[{token:0,port:'single'},{token:1,port:'single'}],form:'underline',mark:''}
    ],
    boundaries:{},
    arrows:[]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);

  await press(page,'V');
  let geometry=await underlineAndInnerCursorBottoms(page);
  assert.ok(geometry.cursorBottoms.some((item) => item.classes.includes('slot-group-selecting-active')));
  assert.ok(geometry.cursorBottoms.some((item) => item.classes.includes('slot-group-selection-cursor')));
  assert.ok(geometry.cursorBottoms.length>0);
  assert.ok(geometry.underlineTop>=Math.max(...geometry.cursorBottoms.map((item) => item.bottom)));

  await press(page,'V');
  geometry=await underlineAndInnerCursorBottoms(page);
  assert.ok(geometry.cursorBottoms.some((item) => item.classes.includes('slot-group-selecting-fixed')));
  assert.ok(geometry.cursorBottoms.length>0);
  assert.ok(geometry.underlineTop>=Math.max(...geometry.cursorBottoms.map((item) => item.bottom)));
});

test('selecting President does not push down the sibling being-elected underline', async ({ page }) => {
  const inner={version:1,text:'His carrer culminated in his being elected President.',sentences:[{
    tokens:Array.from({length:8},() => ({slot:{kind:'single',text:''}})),
    structures:[
      {id:1,kind:'group',members:[{token:1,port:'single'},{token:2,port:'single'}],form:'underline',mark:''},
      {id:4,kind:'group',members:[{structure:1,port:'single'},{structure:2,port:'single'}],form:'underline',mark:''},
      {id:2,kind:'group',members:[{token:3,port:'single'},{token:4,port:'single'}],form:'underline',mark:''},
      {id:3,kind:'group',members:[{token:5,port:'single'},{token:6,port:'single'}],form:'underline',mark:''},
      {id:5,kind:'group',members:[{structure:3,port:'single'},{token:7,port:'single'}],form:'underline',mark:''}
    ]
  }]};
  await page.evaluate((document) => window.KiriEditorData.loadInnerJson(document),inner);
  await page.waitForTimeout(50);
  const before=await page.locator('.group-underline[data-group-underline="3"]').first().evaluate((el) => el.getBoundingClientRect().top);
  await page.locator('.word[data-index="7"]').click();
  await page.waitForTimeout(50);
  const after=await page.locator('.group-underline[data-group-underline="3"]').first().evaluate((el) => el.getBoundingClientRect().top);
  const parentClearance=await page.evaluate(() => {
    const cursor=document.querySelector('.word[data-index="7"] .mark-cursor');
    const parent=document.querySelector('.group-underline[data-group-underline="5"]');
    return {
      cursorBottom:cursor?.getBoundingClientRect().bottom ?? null,
      parentTop:parent?.getBoundingClientRect().top ?? null
    };
  });
  assert.ok(Math.abs(after-before)<0.1);
  assert.ok(parentClearance.parentTop>=parentClearance.cursorBottom);
});

async function run() {
  const executablePath = findBrowserExecutable();
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const failures = [];

  try {
    for (const item of tests) {
      const page = await newPage(browser);
      try {
        await item.fn({ page });
        console.log(`ok - ${item.name}`);
      } catch (error) {
        failures.push({ name: item.name, error });
        console.error(`not ok - ${item.name}`);
        console.error(error?.stack || error);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error(`\n${failures.length} failed, ${tests.length - failures.length} passed`);
    process.exit(1);
  }

  console.log(`\n${tests.length} passed`);
}

function findBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
