(function(global){
  'use strict';

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

  const makeWorkSlot = () => ({enabled:true, kind:'single', text:'', left:'', right:''});
  const makeTSlot = (text = '') => ({enabled:true, kind:'single', text:text || '', left:'', right:''});
  const makeTState = (on = false, left = '', right = '') => ({
    on:Boolean(on),
    slots:{left:makeTSlot(left), right:makeTSlot(right)}
  });

  const pseudoList = value => Array.isArray(value) ? value : value?.text ? [value] : [];
  const pseudoIndexOf = ref => Number(ref?.gapTokenIndex || 0);
  const pseudoAt = (state,ref) => pseudoList(state.gapTokens?.[ref?.gapToken])[pseudoIndexOf(ref)] || null;

  function normalizeTState(value){
    if(!value) return null;
    const source=value.slots
      ? value
      : {on:value.on, slots:{left:makeTSlot(value.left), right:makeTSlot(value.right)}};
    return {
      on:Boolean(source.on),
      slots:{
        left:{...makeTSlot(), ...(source.slots?.left || {})},
        right:{...makeTSlot(), ...(source.slots?.right || {})}
      }
    };
  }

  function updateTSlot(value, side, text){
    const normalized=normalizeTState(value) || makeTState(false);
    return {
      ...normalized,
      slots:{
        ...normalized.slots,
        [side]:{...normalized.slots[side], text:text || ''}
      }
    };
  }

  function calculateSlotGeometry({
    layout='single',
    side=null,
    textWidth=0,
    peerTextWidth=0,
    availableWidth=0,
    minSlotWidth=28,
    textPadding=12,
    slotHeight=20
  } = {}){
    const required=Math.max(minSlotWidth, Math.ceil(textWidth) + textPadding);
    const peerRequired=Math.max(minSlotWidth, Math.ceil(peerTextWidth) + textPadding);
    const largest=Math.max(required, peerRequired);

    if(layout === 't-pair'){
      const gap=2;
      const containerWidth=Math.max(82, availableWidth, 2 * largest + gap);
      const width=(containerWidth - gap) / 2;
      return {
        layout,
        width,
        minWidth:width,
        height:slotHeight,
        left:side === 'right' ? width + gap : 0,
        containerWidth
      };
    }

    if(layout === 'double-pair'){
      const containerWidth=Math.max(88, Math.ceil(largest / 0.46));
      const width=containerWidth * 0.46;
      return {
        layout,
        width,
        minWidth:width,
        height:slotHeight,
        left:side === 'right' ? containerWidth * 0.54 : 0,
        containerWidth
      };
    }

    if(layout === 'underline'){
      const width=Math.max(1, availableWidth);
      return {layout, width, minWidth:width, height:slotHeight, left:0, containerWidth:width};
    }

    const width=Math.max(required, availableWidth);
    return {
      layout:'single',
      width:availableWidth > 0 ? width : null,
      minWidth:required,
      height:slotHeight,
      left:0,
      containerWidth:width
    };
  }

  function calculateHorizontalTarget({direction, current, previous=null, next=null, last=null} = {}){
    if(direction !== 'left' && direction !== 'right') return null;
    if(!current) return null;
    if(current.kind === 'dummy') return direction === 'left' ? clone(last) : null;

    if(current.paired){
      if(current.slot === 'left' && direction === 'right'){
        return {...clone(current), slot:'right', target:'right'};
      }
      if(current.slot === 'right' && direction === 'left'){
        return {...clone(current), slot:'left', target:'left'};
      }
    }

    return clone(direction === 'left' ? previous : next);
  }

  function calculateContainedHorizontalTarget({direction,current,containingOrders=[]} = {}){
    if(direction !== 'left' && direction !== 'right' || !current) return null;
    const delta=direction === 'left' ? -1 : 1;
    for(const order of containingOrders){
      const index=(order || []).findIndex(ref => sameDisplayRef(ref,current));
      if(index < 0) continue;
      const candidate=order[index+delta];
      if(candidate) return clone(candidate);
    }
    return null;
  }

  function calculateGridHorizontalTarget({direction,current,candidates=[]} = {}){
    if((direction !== 'left' && direction !== 'right') || !current) return null;
    const currentColumn=Number(current.colIdx);
    const currentRow=Number(current.rowIdx);
    if(!Number.isFinite(currentColumn) || !Number.isFinite(currentRow)) return null;
    const sign=direction === 'left' ? -1 : 1;
    const eligible=(candidates || []).filter(candidate => {
      const column=Number(candidate?.colIdx);
      const row=Number(candidate?.rowIdx);
      return Number.isFinite(column) && Number.isFinite(row)
        && row <= currentRow
        && (column-currentColumn)*sign > 0;
    });
    if(!eligible.length) return null;
    const highestRow=Math.max(...eligible.map(candidate => Number(candidate.rowIdx)));
    const sameRow=eligible.filter(candidate => Number(candidate.rowIdx) === highestRow);
    sameRow.sort((a,b) =>
      Math.abs(Number(a.colIdx)-currentColumn)-Math.abs(Number(b.colIdx)-currentColumn)
      || Number(a.colIdx)-Number(b.colIdx)
    );
    return clone(sameRow[0]);
  }

  function calculateColumnPreservingTarget({column,candidates=[]} = {}){
    const preferred=Number(column);
    if(!Number.isFinite(preferred)) return null;
    const target=(candidates || []).find(candidate =>
      (candidate?.columns || []).some(value => Number(value) === preferred)
    );
    return target ? clone(target) : null;
  }

  function updateSelectionPath(path, candidate){
    const current=Array.isArray(path) ? path.map(clone) : [];
    if(!candidate) return current;
    if(current.length && sameDisplayRef(current[current.length-1],candidate)) return current;

    const visitedIndex=current.findIndex(ref => sameDisplayRef(ref,candidate));
    if(visitedIndex >= 0) return current.slice(0,visitedIndex+1);
    return [...current,clone(candidate)];
  }

  function removeGroup(state,groupId){
    const next=clone(state);
    const removed=(next.groups || []).find(group => group.id === groupId);
    if(!removed) return next;
    const replacement=(removed.members || []).map(clone);

    next.groups=(next.groups || [])
      .filter(group => group.id !== groupId)
      .map(group => {
        let changed=false;
        const members=(group.members || []).flatMap(member => {
          if(member?.group !== groupId) return [member];
          changed=true;
          return member.slot == null ? replacement.map(clone) : [];
        });
        if(!changed) return group;
        return {
          ...group,
          members:members.filter((member,index) =>
            members.findIndex(candidate => sameDisplayRef(candidate,member)) === index
          ),
          segments:[],
          startRef:null,
          endRef:null
        };
      });
    next.arrows=(next.arrows || []).filter(arrow =>
      arrow.from?.group !== groupId && arrow.to?.group !== groupId
    );
    if(next.arrowDraft?.group === groupId) next.arrowDraft=null;
    if(next.groupCursorId === groupId){
      next.groupCursorId=null;
      next.groupCursorSlot=null;
      next.groupCursorTarget=null;
    }
    return next;
  }

  function compressSelectionRefs(displayOrder, refs){
    const order=Array.isArray(displayOrder) ? displayOrder : [];
    const selected=Array.isArray(refs) ? refs : [];
    const runs=[];
    let active=null;

    for(let index=0;index<order.length;index++){
      const ref=order[index];
      const included=selected.some(candidate => sameDisplayRef(candidate,ref));
      if(!included){
        active=null;
        continue;
      }
      if(!active){
        active={from:clone(ref),to:clone(ref),fromIndex:index,toIndex:index,count:1};
        runs.push(active);
      }else{
        active.to=clone(ref);
        active.toIndex=index;
        active.count++;
      }
    }
    return runs;
  }

  function endpointKey(ref){
    if(ref?.structure != null) return `structure:${ref.structure}:${ref.port || 'single'}`;
    if(ref?.pseudoToken != null) return `pseudo-token:${ref.pseudoToken}:${Number(ref.pseudoIndex || 0)}:single`;
    return `token:${ref?.token ?? 0}:${ref?.port || 'single'}`;
  }

  function primitiveTokenPorts(sentence,token,index){
    const verbal=(sentence.structures || []).some(item => item.kind === 'verbal' && item.token === index);
    if(verbal || token?.verbal?.on || token?.verbal?.form === 'T') return ['left','right'];
    return token?.slot?.kind === 'double' ? ['left','right'] : ['single'];
  }

  function primitiveKeysForToken(sentence, ref){
    if(ref?.pseudoToken != null){
      const index=Number(ref.pseudoIndex || 0);
      return pseudoList(sentence.pseudoTokens?.[ref.pseudoToken])[index]
        ? [`pseudo-token:${ref.pseudoToken}:${index}:single`]
        : [];
    }
    const token=sentence.tokens?.[ref.token];
    if(!token) return [];
    const ports=primitiveTokenPorts(sentence,token,ref.token);
    const port=ref.port || 'single';
    if(ports.includes(port)) return [`token:${ref.token}:${port}`];
    return ports.map(activePort => `token:${ref.token}:${activePort}`);
  }

  function groupPrimitiveSlotMap(sentence){
    const groups=sentence.groups || (sentence.structures || []).filter(item => item.kind === 'group');
    const byId=new Map(groups.map(group => [group.id,group]));
    const memo=new Map();

    const collect=(groupId,visiting=new Set()) => {
      if(memo.has(groupId)) return memo.get(groupId);
      if(visiting.has(groupId)) return new Set();
      const group=byId.get(groupId);
      if(!group) return new Set();
      const nextVisiting=new Set(visiting).add(groupId);
      const keys=new Set();
      for(const member of group.members || []){
        if(member?.structure != null){
          for(const key of collect(member.structure,nextVisiting)) keys.add(key);
        }else{
          for(const key of primitiveKeysForToken(sentence,member)) keys.add(key);
        }
      }
      memo.set(groupId,keys);
      return keys;
    };

    for(const group of groups) collect(group.id);
    return memo;
  }

  function primitiveSlotOrder(sentence){
    const order=[];
    const tokens=sentence.tokens || [];
    for(const item of createTokenSequence(tokens.length,sentence.pseudoTokens || [])){
      if(item.kind === 'pseudo-token'){
        order.push(`pseudo-token:${item.gap}:${item.index}:single`);
      }else{
        order.push(...primitiveTokenPorts(sentence,tokens[item.index],item.index)
          .map(port => `token:${item.index}:${port}`));
      }
    }
    return order;
  }

  function primitiveSlotRuns(order,selected){
    const runs=[];
    let active=null;
    for(const key of order){
      if(!selected.has(key)){
        active=null;
        continue;
      }
      if(!active){
        active={startSlot:key,endSlot:key,primitiveSlots:[]};
        runs.push(active);
      }
      active.endSlot=key;
      active.primitiveSlots.push(key);
    }
    return runs;
  }

  const setsOverlap=(left,right) => [...left].some(value => right.has(value));
  const strictSubset=(left,right) => left.size < right.size && [...left].every(value => right.has(value));
  const groupLinkColors=[
    '#d97706','#2563eb','#16a34a','#dc2626','#7c3aed','#0891b2',
    '#db2777','#65a30d','#ea580c','#4f46e5','#0f766e','#9333ea'
  ];

  function calculateUnderlineLayouts(sentence,{lineStep=27}={}){
    const groups=sentence.groups || (sentence.structures || []).filter(item => item.kind === 'group');
    const primitives=groupPrimitiveSlotMap(sentence);
    const leafOrder=primitiveSlotOrder(sentence);
    const byId=new Map(groups.map(group => [group.id,group]));
    const descendantMemo=new Map();
    const descendants=(groupId,visiting=new Set()) => {
      if(descendantMemo.has(groupId)) return descendantMemo.get(groupId);
      if(visiting.has(groupId)) return new Set();
      const next=new Set(visiting).add(groupId);
      const found=new Set();
      for(const member of byId.get(groupId)?.members || []){
        if(member?.structure == null) continue;
        found.add(member.structure);
        for(const child of descendants(member.structure,next)) found.add(child);
      }
      descendantMemo.set(groupId,found);
      return found;
    };
    for(const group of groups) descendants(group.id);
    const depthMemo=new Map();
    const structuralDepth=(groupId,visiting=new Set()) => {
      if(depthMemo.has(groupId)) return depthMemo.get(groupId);
      if(visiting.has(groupId)) return 0;
      const childIds=[...(descendants(groupId) || [])];
      if(!childIds.length){
        depthMemo.set(groupId,0);
        return 0;
      }
      const next=new Set(visiting).add(groupId);
      const depth=1+Math.max(...childIds.map(childId => structuralDepth(childId,next)));
      depthMemo.set(groupId,depth);
      return depth;
    };
    const ordered=groups.slice().sort((left,right) => {
      const leftSet=primitives.get(left.id) || new Set();
      const rightSet=primitives.get(right.id) || new Set();
      return leftSet.size-rightSet.size
        || structuralDepth(left.id)-structuralDepth(right.id)
        || left.id-right.id;
    });
    const levelById=new Map();

    for(const group of ordered){
      const own=primitives.get(group.id) || new Set();
      const above=ordered.filter(candidate =>
        levelById.has(candidate.id)
        && setsOverlap(own,primitives.get(candidate.id) || new Set())
      );
      const level=above.length
        ? Math.max(...above.map(candidate => levelById.get(candidate.id))) + 1
        : 0;
      levelById.set(group.id,level);
    }

    return groups.map(group => {
      const own=primitives.get(group.id) || new Set();
      const sharesWith=groups
        .filter(other => other.id !== group.id && setsOverlap(own,primitives.get(other.id) || new Set()))
        .map(other => other.id);
      const contains=groups
        .filter(other => other.id !== group.id && (
          descendants(group.id).has(other.id)
          || strictSubset(primitives.get(other.id) || new Set(),own)
        ))
        .map(other => other.id);
      return {
        id:group.id,
        primitiveSlots:[...own].sort(),
        underlineSegments:primitiveSlotRuns(leafOrder,own),
        sharesWith,
        contains,
        structuralDepth:structuralDepth(group.id),
        linkColor:groupLinkColors[Math.abs(Number(group.id) || 0) % groupLinkColors.length],
        level:levelById.get(group.id) || 0,
        lineOffset:(levelById.get(group.id) || 0) * lineStep
      };
    });
  }

  function createDisplayJson(innerJson,{lineStep=27}={}){
    const display=clone(innerJson) || {version:1,text:'',sentences:[]};
    display.display={groupLineStep:lineStep};
    display.sentences=(display.sentences || []).map(sentence => ({
      ...sentence,
      display:{groups:calculateUnderlineLayouts(sentence,{lineStep})}
    }));
    return display;
  }

  function persistentSlot(slot){
    if(slot?.kind === 'double') return {kind:'double',left:slot.left || '',right:slot.right || ''};
    return {kind:'single',text:slot?.text || ''};
  }

  function persistentT(value){
    const verbal=normalizeTState(value) || makeTState(false);
    return {
      on:Boolean(verbal.on),
      slots:{
        left:persistentSlot(verbal.slots.left),
        right:persistentSlot(verbal.slots.right)
      }
    };
  }

  function createInnerJson(state){
    const document={version:1,text:state.text || '',sentences:[]};
    const ranges=state.sentenceRanges || parseSentences(state.text || '').ranges;
    const groups=state.groups || [];
    const sentenceForWord=word => ranges.find(range => word >= range.start && word < range.end)?.index ?? -1;
    const groupById=new Map(groups.map(group => [group.id,group]));
    const sentenceForGroup=(groupId,visiting=new Set()) => {
      if(visiting.has(groupId)) return -1;
      const next=new Set(visiting).add(groupId);
      for(const member of groupById.get(groupId)?.members || []){
        const sentenceIndex=member?.group != null
          ? sentenceForGroup(member.group,next)
          : member?.gapToken != null
            ? sentenceIndexForGap(ranges,member.gapToken)
            : sentenceForWord(member?.word);
        if(sentenceIndex >= 0) return sentenceIndex;
      }
      return -1;
    };
    const sentenceForRef=ref => {
      if(ref?.group != null) return sentenceForGroup(ref.group);
      if(ref?.gapToken != null){
        return sentenceIndexForGap(ranges,ref.gapToken);
      }
      return sentenceForWord(ref?.word);
    };

    for(const range of ranges){
      const localRef=ref => ref?.group != null
        ? {structure:ref.group,port:ref.slot || 'single'}
        : ref?.gapToken != null
          ? {pseudoToken:ref.gapToken-range.start,pseudoIndex:pseudoIndexOf(ref),port:'single'}
        : {token:(ref?.word ?? range.start)-range.start,port:ref?.slot || 'single'};
      const sentence={tokens:[]};
      for(let word=range.start;word<range.end;word++){
        sentence.tokens.push({slot:persistentSlot(state.workSlots?.[word])});
      }

      const structures=[];
      for(let word=range.start;word<range.end;word++){
        const verbal=persistentT(state.verbals?.[word]);
        if(verbal.on){
          structures.push({
            kind:'verbal',
            token:word-range.start,
            form:'T',
            slots:verbal.slots
          });
        }
      }
      for(const group of groups){
        if(sentenceForGroup(group.id) !== range.index) continue;
        const verbal=persistentT(group.verbal);
        const structure={
          id:group.id,
          kind:'group',
          members:(group.members || []).map(localRef),
          form:verbal.on ? 'T' : 'underline',
          mark:group.mark || ''
        };
        if(verbal.on) structure.slots=verbal.slots;
        structures.push(structure);
      }
      if(structures.length) sentence.structures=structures;

      const boundaries={};
      const pseudoTokens={};
      for(let gap=range.start;gap<=range.end;gap++){
        if(sentenceIndexForGap(ranges,gap) !== range.index) continue;
        if(state.gaps?.[gap]) boundaries[gap-range.start]=state.gaps[gap];
        const pseudos=pseudoList(state.gapTokens?.[gap]);
        if(pseudos.length){
          pseudoTokens[gap-range.start]=pseudos.map(pseudo => ({
            text:pseudo.text,
            slot:persistentSlot(pseudo.slot)
          }));
        }
      }
      if(Object.keys(boundaries).length) sentence.boundaries=boundaries;
      if(Object.keys(pseudoTokens).length) sentence.pseudoTokens=pseudoTokens;

      const arrows=(state.arrows || [])
        .filter(arrow => sentenceForRef(arrow.from) === range.index && sentenceForRef(arrow.to) === range.index)
        .map(arrow => ({from:localRef(arrow.from),to:localRef(arrow.to)}));
      if(arrows.length) sentence.arrows=arrows;
      document.sentences.push(sentence);
    }
    return document;
  }

  function stateFromInnerJson(innerJson){
    const inner=clone(innerJson) || {version:1,text:'',sentences:[]};
    const state=createState(inner.text || (inner.sentences || []).map(sentence => sentence.text || '').join('\n'));
    let offset=0;
    for(const sentence of inner.sentences || []){
      for(let local=0;local<(sentence.tokens || []).length;local++){
        const token=sentence.tokens[local];
        state.workSlots[offset+local]={enabled:true,...persistentSlot(token.slot)};
      }
      for(const structure of sentence.structures || []){
        if(structure.kind !== 'verbal') continue;
        const word=offset+(structure.token || 0);
        state.verbals[word]={on:true,slots:{
          left:{enabled:true,...persistentSlot(structure.slots?.left)},
          right:{enabled:true,...persistentSlot(structure.slots?.right)}
        }};
      }
      for(const [local,value] of Object.entries(sentence.boundaries || {})){
        state.gaps[offset+Number(local)]=value;
      }
      for(const [local,value] of Object.entries(sentence.pseudoTokens || {})){
        state.gapTokens[offset+Number(local)]=pseudoList(value).map(pseudo => ({
          text:String(pseudo?.text || ''),
          slot:{enabled:true,...persistentSlot(pseudo?.slot)}
        }));
      }
      offset+=(sentence.tokens || []).length;
    }

    offset=0;
    for(const sentence of inner.sentences || []){
      const localRef=ref => ref?.structure != null
        ? {group:ref.structure,slot:ref.port === 'single' ? null : ref.port}
        : ref?.pseudoToken != null
          ? {gapToken:offset+ref.pseudoToken,gapTokenIndex:Number(ref.pseudoIndex || 0),slot:null}
        : {word:offset+(ref?.token || 0),slot:ref?.port === 'single' ? null : ref?.port};
      for(const structure of sentence.structures || []){
        if(structure.kind !== 'group') continue;
        const members=(structure.members || []).map(localRef);
        const tokenWords=members.flatMap(ref =>
          ref.word != null ? [ref.word] : ref.gapToken != null ? [ref.gapToken] : []
        );
        const verbal={
          on:structure.form === 'T',
          slots:{
            left:{enabled:true,...persistentSlot(structure.slots?.left)},
            right:{enabled:true,...persistentSlot(structure.slots?.right)}
          }
        };
        state.groups.push({
          id:structure.id,
          members,
          segments:[],
          start:tokenWords.length ? Math.min(...tokenWords) : offset,
          end:tokenWords.length ? Math.max(...tokenWords) : offset,
          mark:structure.mark || '',
          verbal,
        });
      }
      for(const arrow of sentence.arrows || []) state.arrows.push({from:localRef(arrow.from),to:localRef(arrow.to)});
      offset+=(sentence.tokens || []).length;
    }

    const byId=new Map(state.groups.map(group => [group.id,group]));
    const extent=(group,visiting=new Set()) => {
      if(!group || visiting.has(group.id)) return {start:0,end:0};
      const next=new Set(visiting).add(group.id);
      const values=[];
      for(const member of group.members){
        if(member.group != null){
          const child=extent(byId.get(member.group),next);
          values.push(child.start,child.end);
        }else if(member.gapToken != null) values.push(member.gapToken);
        else values.push(member.word);
      }
      if(values.length){
        group.start=Math.min(...values);
        group.end=Math.max(...values);
      }
      return {start:group.start,end:group.end};
    };
    for(const group of state.groups) extent(group);
    state.nextGroupId=Math.max(0,...state.groups.map(group => group.id))+1;
    return refreshEnabled(state);
  }

  function parseSentences(text){
    const lines=String(text).replace(/\r\n?/g, '\n').split('\n');
    const tokens=[];
    const ranges=[];
    for(let index=0; index<lines.length; index++){
      const line=lines[index];
      const words=line.trim() ? line.trim().split(/\s+/) : [];
      const start=tokens.length;
      for(const word of words){
        tokens.push(word);
      }
      ranges.push({index, text:line, start, end:tokens.length});
    }
    return {tokens, ranges};
  }

  function createState(text = ''){
    const parsed=parseSentences(text);
    return {
      mode:'NORMAL',
      pendingKeys:'',
      pendingRef:null,
      numericPending:false,
      cursor:0,
      cursorSlot:null,
      text:String(text),
      tokens:parsed.tokens,
      sentenceRanges:parsed.ranges,
      workSlots:parsed.tokens.map(makeWorkSlot),
      verbals:parsed.tokens.map(() => makeTState(false)),
      arrows:[],
      arrowDraft:null,
      arrowHistoryBefore:null,
      gaps:Array.from({length:parsed.tokens.length + 1}, () => ''),
      gapTokens:Array.from({length:parsed.tokens.length + 1}, () => []),
      gapMode:false,
      gapCursor:0,
      gapTokenCursor:null,
      groups:[],
      nextGroupId:1,
      groupSelection:null,
      groupCursorId:null,
      groupCursorSlot:null,
      groupCursorTarget:null
    };
  }

  // Recipes may mutate only this private clone. The caller's state is never changed.
  function evolve(previous, recipe){
    const next=clone(previous);
    const replacement=recipe(next);
    return replacement === undefined ? next : replacement;
  }

  function syncText(previous, text){
    return evolve(previous, next => {
      const parsed=parseSentences(text);
      next.text=String(text);
      next.tokens=parsed.tokens;
      next.sentenceRanges=parsed.ranges;
      next.workSlots=parsed.tokens.map((_, index) => next.workSlots[index] || makeWorkSlot());
      next.verbals=parsed.tokens.map((_, index) => normalizeTState(next.verbals[index]) || makeTState(false));
      next.gaps=Array.from({length:parsed.tokens.length + 1}, (_, index) => next.gaps[index] || '');
      next.gapTokens=Array.from({length:parsed.tokens.length + 1}, (_, index) => pseudoList(next.gapTokens?.[index]));
      next.cursor=Math.max(0, Math.min(next.cursor, next.tokens.length));
      const borderPositions=calculateBorderPositions(next.tokens.length,next.gapTokens);
      next.gapCursor=Math.max(0, Math.min(next.gapCursor, borderPositions.length-1));
      if(next.gapTokenCursor != null && !pseudoAt(next,next.gapTokenCursor)) next.gapTokenCursor=null;
    });
  }

  function createTokenSequence(tokenCount,gapTokens=[]){
    const items=[];
    for(let gap=0;gap<=tokenCount;gap++){
      pseudoList(gapTokens[gap]).forEach((_,index) => {
        items.push({kind:'pseudo-token',gap,index});
      });
      if(gap < tokenCount) items.push({kind:'token',index:gap});
    }
    return items;
  }

  function calculateBorderPositions(tokenCount, gapTokens=[]){
    const sequence=createTokenSequence(tokenCount,gapTokens);
    const positionBefore=item => item.kind === 'pseudo-token'
      ? {gap:item.gap,offset:item.index}
      : {gap:item.index,offset:pseudoList(gapTokens[item.index]).length};
    const positionAfter=item => item.kind === 'pseudo-token'
      ? {gap:item.gap,offset:item.index+1}
      : {gap:item.index+1,offset:0};
    const raw=sequence.length
      ? [...sequence.map(positionBefore),positionAfter(sequence.at(-1))]
      : [{gap:0,offset:0}];
    return raw.map(position => {
      const count=pseudoList(gapTokens[position.gap]).length;
      const side=count === 0 ? 'single' : position.offset === 0 ? 'before' : position.offset === count ? 'after' : 'between';
      return {...position,side};
    }).filter((position,index,all) => index === 0
      || position.gap !== all[index-1].gap
      || position.offset !== all[index-1].offset
    );
  }

  function rewritePseudoRefTree(value,gap,index,mode){
    if(Array.isArray(value)) return value.map(item => rewritePseudoRefTree(item,gap,index,mode)).filter(Boolean);
    if(!value || typeof value !== 'object') return value;
    if(value.gapToken != null){
      if(value.gapToken !== gap) return clone(value);
      const current=pseudoIndexOf(value);
      if(mode === 'remove' && current === index) return null;
      const moves=mode === 'insert' ? current >= index : current > index;
      return {...clone(value),gapTokenIndex:current+(moves ? (mode === 'insert' ? 1 : -1) : 0)};
    }
    return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,rewritePseudoRefTree(item,gap,index,mode)]));
  }

  function insertPseudoToken(previous,gap,index,pseudo){
    return evolve(previous,next => {
      const list=pseudoList(next.gapTokens?.[gap]);
      const at=Math.max(0,Math.min(list.length,Number(index) || 0));
      next.groups=rewritePseudoRefTree(next.groups,gap,at,'insert');
      next.arrows=rewritePseudoRefTree(next.arrows,gap,at,'insert');
      next.arrowDraft=rewritePseudoRefTree(next.arrowDraft,gap,at,'insert');
      next.pendingRef=rewritePseudoRefTree(next.pendingRef,gap,at,'insert');
      next.groupSelection=rewritePseudoRefTree(next.groupSelection,gap,at,'insert');
      next.gapTokenCursor=rewritePseudoRefTree(next.gapTokenCursor,gap,at,'insert');
      list.splice(at,0,{
        text:String(pseudo?.text || ''),
        slot:{enabled:true,...persistentSlot(pseudo?.slot)}
      });
      next.gapTokens[gap]=list;
    });
  }

  function removePseudoToken(previous,gap,index){
    return evolve(previous,next => {
      const list=pseudoList(next.gapTokens?.[gap]);
      const at=Number(index);
      if(!Number.isInteger(at) || at < 0 || at >= list.length) return;
      next.groups=rewritePseudoRefTree(next.groups,gap,at,'remove');
      next.arrows=rewritePseudoRefTree(next.arrows,gap,at,'remove')
        .filter(arrow => arrow?.from && arrow?.to);
      next.arrowDraft=rewritePseudoRefTree(next.arrowDraft,gap,at,'remove');
      next.pendingRef=rewritePseudoRefTree(next.pendingRef,gap,at,'remove');
      next.groupSelection=rewritePseudoRefTree(next.groupSelection,gap,at,'remove');
      next.gapTokenCursor=rewritePseudoRefTree(next.gapTokenCursor,gap,at,'remove');
      list.splice(at,1);
      next.gapTokens[gap]=list;
    });
  }

  const groupById = (state, id) => state.groups.find(group => group.id === id) || null;

  function refOrderKey(state, ref){
    if(ref?.group != null){
      const group=groupById(state, ref.group);
      if(!group) return 0;
      const base=(ref.slot === 'left' ? group.start : group.end) * 100000;
      const side=ref.slot === 'left' ? 30000 : ref.slot === 'right' ? 70000 : 50000;
      return base + side + (group.id % 10000);
    }
    if(ref?.gapToken != null) return ref.gapToken * 100000 + 10000 + pseudoIndexOf(ref);
    const side=ref?.slot === 'left' ? 20000 : ref?.slot === 'right' ? 80000 : 50000;
    return (ref?.word ?? 0) * 100000 + side;
  }

  function refInsideGroup(state, ref, group){
    if(!ref || !group || ref.group === group.id) return false;
    return (group.segments || []).some(segment => {
      let from=refOrderKey(state, segment.startRef);
      let to=refOrderKey(state, segment.endRef);
      if(from > to) [from, to]=[to, from];
      const value=refOrderKey(state, ref);
      return value >= from && value <= to;
    });
  }

  function disabledByContainingT(state, ref, exceptGroupId = null){
    return state.groups.some(group =>
      group.id !== exceptGroupId && group.verbal?.on && refInsideGroup(state, ref, group)
    );
  }

  function refreshEnabled(previous){
    return evolve(previous, next => {
      for(let index=0; index<next.tokens.length; index++){
        const slot=next.workSlots[index] || makeWorkSlot();
        next.workSlots[index]=slot;
        slot.enabled=!next.verbals[index]?.on && !disabledByContainingT(next, {word:index,slot:null});
        const verbal=next.verbals[index];
        if(verbal?.on){
          verbal.slots.left.enabled=!disabledByContainingT(next, {word:index,slot:'left'});
          verbal.slots.right.enabled=!disabledByContainingT(next, {word:index,slot:'right'});
        }
      }
      for(let index=0;index<(next.gapTokens || []).length;index++){
        pseudoList(next.gapTokens[index]).forEach((pseudo,gapTokenIndex) => {
          if(pseudo?.slot) pseudo.slot.enabled=!disabledByContainingT(next,{gapToken:index,gapTokenIndex,slot:null});
        });
      }
      for(const group of next.groups){
        if(!group.verbal?.on) continue;
        group.verbal.slots.left.enabled=!disabledByContainingT(next, {group:group.id,slot:'left'}, group.id);
        group.verbal.slots.right.enabled=!disabledByContainingT(next, {group:group.id,slot:'right'}, group.id);
      }
    });
  }

  function sameDisplayRef(left, right){
    if(!left || !right) return false;
    if(left.gapToken != null || right.gapToken != null){
      return left.gapToken != null && right.gapToken != null
        && left.gapToken === right.gapToken
        && pseudoIndexOf(left) === pseudoIndexOf(right);
    }
    if(left.group != null || right.group != null){
      return left.group != null && right.group != null
        && left.group === right.group
        && (left.slot || null) === (right.slot || null);
    }
    return left.word === right.word && left.slot === right.slot;
  }

  function sentenceOfRef(state, ref){
    if(!ref) return -1;
    if(ref.group != null){
      const group=groupById(state, ref.group);
      return group ? sentenceOfRef(state, group.segments?.[0]?.startRef) : -1;
    }
    if(ref.gapToken != null){
      return sentenceIndexForGap(state.sentenceRanges,ref.gapToken);
    }
    return state.sentenceRanges.find(range => ref.word >= range.start && ref.word < range.end)?.index ?? -1;
  }

  function sentenceIndexForGap(ranges,gap){
    const left=(ranges || []).find(range => gap > range.start && gap <= range.end);
    if(left) return left.index;
    return (ranges || []).find(range => gap === range.start)?.index ?? -1;
  }

  function displayValue(state, ref){
    if(!ref) return '';
    if(ref.gapToken != null) return pseudoAt(state,ref)?.slot?.text || '';
    if(ref.group != null){
      const group=groupById(state, ref.group);
      if(!group) return '';
      if(group.verbal?.on) return group.verbal.slots?.[ref.slot]?.enabled
        ? group.verbal.slots[ref.slot].text || ''
        : '';
      return ref.slot == null ? group.mark || '' : '';
    }
    const slot=state.workSlots[ref.word];
    const verbal=state.verbals[ref.word];
    if(verbal?.on) return verbal.slots?.[ref.slot]?.enabled ? verbal.slots[ref.slot].text || '' : '';
    if(!slot?.enabled) return '';
    if(slot.kind === 'double') return slot[ref.slot] || '';
    return ref.slot == null ? slot.text || '' : '';
  }

  function validDisplayRef(state, ref){
    if(!ref) return false;
    if(ref.gapToken != null) return Boolean(pseudoAt(state,ref)?.slot?.enabled);
    if(ref.group != null){
      const group=groupById(state, ref.group);
      if(!group) return false;
      return group.verbal?.on
        ? Boolean(group.verbal.slots?.[ref.slot]?.enabled)
        : ref.slot == null;
    }
    if(ref.word < 0 || ref.word >= state.tokens.length) return false;
    const verbal=state.verbals[ref.word];
    const slot=state.workSlots[ref.word];
    if(verbal?.on) return Boolean(verbal.slots?.[ref.slot]?.enabled);
    if(!slot?.enabled) return false;
    return slot.kind === 'double'
      ? ref.slot === 'left' || ref.slot === 'right'
      : ref.slot == null;
  }

  function cleanupArrows(previous){
    return evolve(previous, next => {
      const allowed=new Set(['ad','a','副詞的目的格']);
      next.arrows=next.arrows.filter(arrow =>
        validDisplayRef(next, arrow.from)
        && validDisplayRef(next, arrow.to)
        && sentenceOfRef(next, arrow.from) === sentenceOfRef(next, arrow.to)
        && allowed.has(displayValue(next, arrow.from))
      );
      if(next.arrowDraft && (!validDisplayRef(next, next.arrowDraft) || !allowed.has(displayValue(next, next.arrowDraft)))){
        next.arrowDraft=null;
        next.arrowHistoryBefore=null;
      }
    });
  }

  global.KiriEditorCore=Object.freeze({
    clone,
    cleanupArrows,
    compressSelectionRefs,
    createDisplayJson,
    createInnerJson,
    createTokenSequence,
    sentenceIndexForGap,
    calculateColumnPreservingTarget,
    calculateBorderPositions,
    calculateContainedHorizontalTarget,
    calculateGridHorizontalTarget,
    calculateHorizontalTarget,
    calculateSlotGeometry,
    createState,
    evolve,
    makeTSlot,
    makeTState,
    makeWorkSlot,
    insertPseudoToken,
    normalizeTState,
    parseSentences,
    calculateUnderlineLayouts,
    removeGroup,
    removePseudoToken,
    refreshEnabled,
    syncText,
    stateFromInnerJson,
    updateSelectionPath,
    updateTSlot
  });
})(window);
