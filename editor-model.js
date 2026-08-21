(function(root,factory){
  const model=factory();
  if(typeof module === 'object' && module.exports) module.exports=model;
  root.KiriEditorModel=model;
})(typeof globalThis !== 'undefined' ? globalThis : this,function(){
  'use strict';

  // Runtime companion for editor-model.d.ts. Keep the literals synchronized
  // with the exported Mark union in that file.
  const MARKS=Object.freeze([
    's','v','o','c','con','pre','ap','a','ad','1','2','3','4','5','-3','-4','-5'
  ]);
  const SLOT_KINDS=new Set(['atomic_slot','double_slot','t_slot']);
  const BOUNDARY_SYMBOLS=new Set(['[',']','<','>','(',')']);
  const MARK_TO_DISPLAY=Object.freeze({
    s:'S',"s'":"S'",v:'V',o:'O',c:'C',con:'接',m:'M',pre:'前',ap:'同格',
    a:'a',ad:'ad',ado:'副詞的目的格',sad:'文ad',ead:'誘導ad',ac:'aC',aux:'aux',nc:'nC',
    '1':'(1)','2':'(2)','3':'(3)','4':'(4)','5':'(5)',
    '-3':'-(3)','-4':'-(4)','-5':'-(5)','+':'+'
  });
  const DISPLAY_TO_MARK=Object.freeze(Object.fromEntries(
    Object.entries(MARK_TO_DISPLAY).map(([mark,display]) => [display,mark])
  ));
  const clone=value => value == null ? value : JSON.parse(JSON.stringify(value));
  function fail(path,message){
    throw new TypeError(`${path}: ${message}`);
  }

  function assertInteger(value,path){
    if(!Number.isSafeInteger(value) || value < 0) fail(path,'expected a non-negative safe integer');
  }

  function isMark(value){
    return typeof value === 'string';
  }

  function markToDisplay(mark){
    return MARK_TO_DISPLAY[mark] ?? String(mark ?? '');
  }

  function displayToMark(display){
    const value=String(display ?? '');
    return DISPLAY_TO_MARK[value] ?? value;
  }

  function validateCursor(cursor,path='state.cursor'){
    if(cursor === null) return;
    if(!cursor || typeof cursor !== 'object') fail(path,'expected a LogicalCursor or null');
    if(!Number.isFinite(cursor.x) || cursor.x < 0 || cursor.x*2 !== Math.trunc(cursor.x*2)){
      fail(`${path}.x`,'expected a non-negative integer or half-integer');
    }
    if(!Number.isSafeInteger(cursor.y) || cursor.y < 1) fail(`${path}.y`,'expected a positive integer');
  }

  function collectSlot(slot,path,slotIds){
    if(!slot || typeof slot !== 'object') fail(path,'expected a Slot object');
    assertInteger(slot.id,`${path}.id`);
    if(slotIds.has(slot.id)) fail(`${path}.id`,`duplicate SlotId ${slot.id}`);
    slotIds.add(slot.id);
    if(!SLOT_KINDS.has(slot.kind)) fail(`${path}.kind`,`unknown slot kind ${String(slot.kind)}`);

    if(slot.kind === 'atomic_slot'){
      if(!isMark(slot.mark)) fail(`${path}.mark`,`unknown mark ${String(slot.mark)}`);
      return;
    }
    if(slot.kind === 'double_slot'){
      collectAtomic(slot.lslot,`${path}.lslot`,slotIds);
      collectAtomic(slot.rslot,`${path}.rslot`,slotIds);
      return;
    }
    collectAtomic(slot.pre_slot,`${path}.pre_slot`,slotIds);
    collectAtomic(slot.post_slot,`${path}.post_slot`,slotIds);
  }

  function collectAtomic(slot,path,slotIds){
    if(slot?.kind !== 'atomic_slot') fail(path,'expected an AtomicSlot');
    collectSlot(slot,path,slotIds);
  }

  function validateSentenceState(state){
    if(!state || typeof state !== 'object') fail('state','expected a SentenceState object');
    if(!state.tokens || typeof state.tokens !== 'object' || Array.isArray(state.tokens)){
      fail('state.tokens','expected a token record');
    }
    if(!Array.isArray(state.token_chain)) fail('state.token_chain','expected an array');
    if(!state.pseudo_tokens || typeof state.pseudo_tokens !== 'object' || Array.isArray(state.pseudo_tokens)){
      fail('state.pseudo_tokens','expected a record');
    }
    if(!state.boundary_items || typeof state.boundary_items !== 'object' || Array.isArray(state.boundary_items)){
      fail('state.boundary_items','expected a record');
    }
    if(!Array.isArray(state.underline_groups)) fail('state.underline_groups','expected an array');
    if(!Array.isArray(state.arrows)) fail('state.arrows','expected an array');
    validateCursor(state.cursor);

    const slotIds=new Set();
    const tokenIds=new Set();
    for(const [key,token] of Object.entries(state.tokens)){
      const path=`state.tokens[${key}]`;
      if(!token || typeof token !== 'object') fail(path,'expected a Token object');
      assertInteger(token.id,`${path}.id`);
      if(String(token.id) !== key) fail(path,`record key must equal token.id (${token.id})`);
      if(tokenIds.has(token.id)) fail(`${path}.id`,`duplicate TokenId ${token.id}`);
      tokenIds.add(token.id);
      if(typeof token.text !== 'string') fail(`${path}.text`,'expected a string');
      if(token.word_slot?.kind !== 'word_slot') fail(`${path}.word_slot.kind`,'expected word_slot');
      collectSlot(token.word_slot.slot,`${path}.word_slot.slot`,slotIds);
    }

    const chainIds=new Set();
    state.token_chain.forEach((tokenId,index) => {
      assertInteger(tokenId,`state.token_chain[${index}]`);
      if(!tokenIds.has(tokenId)) fail(`state.token_chain[${index}]`,`unknown TokenId ${tokenId}`);
      if(chainIds.has(tokenId)) fail(`state.token_chain[${index}]`,`duplicate TokenId ${tokenId}`);
      chainIds.add(tokenId);
    });
    if(chainIds.size !== tokenIds.size) fail('state.token_chain','must contain every token exactly once');

    for(const [gap,items] of Object.entries(state.pseudo_tokens)){
      if(!/^\d+$/.test(gap) || !Array.isArray(items)) fail(`state.pseudo_tokens[${gap}]`,'expected an array at a non-negative integer gap');
      if(Number(gap) > state.token_chain.length) fail(`state.pseudo_tokens[${gap}]`,'gap exceeds token count');
      items.forEach((item,index) => {
        const path=`state.pseudo_tokens[${gap}][${index}]`;
        if(typeof item?.text !== 'string') fail(`${path}.text`,'expected a string');
        if(item.word_slot?.kind !== 'word_slot') fail(`${path}.word_slot.kind`,'expected word_slot');
        collectSlot(item.word_slot.slot,`${path}.word_slot.slot`,slotIds);
      });
    }

    const boundaryIds=new Set();
    for(const [gap,items] of Object.entries(state.boundary_items)){
      if(!/^\d+$/.test(gap) || !Array.isArray(items)){
        fail(`state.boundary_items[${gap}]`,'expected an array at a non-negative integer gap');
      }
      if(Number(gap) > state.token_chain.length) fail(`state.boundary_items[${gap}]`,'gap exceeds token count');
      for(const [index,item] of items.entries()){
        const path=`state.boundary_items[${gap}][${index}]`;
        if(item?.kind !== 'boundary_item') fail(`${path}.kind`,'expected boundary_item');
        assertInteger(item.id,`${path}.id`);
        if(boundaryIds.has(item.id)) fail(`${path}.id`,`duplicate BoundaryItemId ${item.id}`);
        boundaryIds.add(item.id);
        if(!BOUNDARY_SYMBOLS.has(item.symbol)) fail(`${path}.symbol`,`unknown boundary symbol ${String(item.symbol)}`);
        if(item.symbol === '[') collectAtomic(item.slot,`${path}.slot`,slotIds);
        else if(item.slot !== null) fail(`${path}.slot`,'only [ may own an AtomicSlot');
      }
    }

    const groupIds=new Set();
    const groupSlotOwners=new Map();
    state.underline_groups.forEach((group,index) => {
      const path=`state.underline_groups[${index}]`;
      if(group?.kind !== 'underline_group') fail(`${path}.kind`,'expected underline_group');
      assertInteger(group.id,`${path}.id`);
      if(groupIds.has(group.id)) fail(`${path}.id`,`duplicate GroupId ${group.id}`);
      groupIds.add(group.id);
      if(!Array.isArray(group.child_ids)) fail(`${path}.child_ids`,'expected an array');
      collectSlot(group.slot,`${path}.slot`,slotIds);
      const ownIds=[];
      collectSlotIds(group.slot,ownIds);
      ownIds.forEach(id => groupSlotOwners.set(id,group.id));
    });

    state.underline_groups.forEach((group,index) => {
      const seen=new Set();
      group.child_ids.forEach((slotId,childIndex) => {
        const path=`state.underline_groups[${index}].child_ids[${childIndex}]`;
        assertInteger(slotId,path);
        if(!slotIds.has(slotId)) fail(path,`unknown SlotId ${slotId}`);
        if(groupSlotOwners.get(slotId) === group.id) fail(path,'an underline group cannot contain its own slot');
        if(seen.has(slotId)) fail(path,`duplicate SlotId ${slotId}`);
        seen.add(slotId);
      });
    });

    const groupsById=new Map(state.underline_groups.map(group => [group.id,group]));
    const dependencies=group => group.child_ids
      .map(id => groupSlotOwners.get(id))
      .filter(id => id != null);
    const visited=new Set();
    const visiting=new Set();
    const visit=id => {
      if(visiting.has(id)) fail('state.underline_groups',`cyclic underline group reference at GroupId ${id}`);
      if(visited.has(id)) return;
      visiting.add(id);
      dependencies(groupsById.get(id)).forEach(visit);
      visiting.delete(id);
      visited.add(id);
    };
    groupIds.forEach(visit);

    const validateEndpoint=(endpoint,path) => {
      if(endpoint?.kind === 'slot'){
        assertInteger(endpoint.slot_id,`${path}.slot_id`);
        if(!slotIds.has(endpoint.slot_id)) fail(`${path}.slot_id`,`unknown SlotId ${endpoint.slot_id}`);
        return;
      }
      if(endpoint?.kind === 'boundary'){
        assertInteger(endpoint.boundary_id,`${path}.boundary_id`);
        if(!boundaryIds.has(endpoint.boundary_id)) fail(`${path}.boundary_id`,`unknown BoundaryItemId ${endpoint.boundary_id}`);
        return;
      }
      fail(`${path}.kind`,'expected slot or boundary');
    };
    const arrowSources=new Set();
    state.arrows.forEach((arrow,index) => {
      validateEndpoint(arrow?.from,`state.arrows[${index}].from`);
      validateEndpoint(arrow?.to,`state.arrows[${index}].to`);
      const sourceKey=arrow.from.kind === 'slot'
        ? `slot:${arrow.from.slot_id}`
        : `boundary:${arrow.from.boundary_id}`;
      if(arrowSources.has(sourceKey)) fail(`state.arrows[${index}].from`,'duplicate arrow source');
      arrowSources.add(sourceKey);
    });

    if(tokenIds.size === 0 && state.cursor !== null) fail('state.cursor','empty sentence must use null');
    if(tokenIds.size > 0 && state.cursor === null) fail('state.cursor','non-empty sentence requires a LogicalCursor');
    return {slot_ids:[...slotIds],token_ids:[...tokenIds],group_ids:[...groupIds]};
  }

  function collectSlotIds(slot,result){
    result.push(slot.id);
    if(slot.kind === 'double_slot') result.push(slot.lslot.id,slot.rslot.id);
    if(slot.kind === 't_slot') result.push(slot.pre_slot.id,slot.post_slot.id);
  }

  function removeArrowSlotIds(state,ids){
    const removed=new Set(ids);
    state.arrows=state.arrows.filter(arrow =>
      !(arrow.from.kind === 'slot' && removed.has(arrow.from.slot_id))
      && !(arrow.to.kind === 'slot' && removed.has(arrow.to.slot_id))
    );
  }

  function addSlotIndexEntries(index,slot,owner){
    if(slot.kind === 'atomic_slot'){
      index.set(slot.id,{...owner,port:'single'});
      return;
    }
    index.set(slot.id,{...owner,port:'single'});
    if(slot.kind === 'double_slot'){
      index.set(slot.lslot.id,{...owner,port:'left'});
      index.set(slot.rslot.id,{...owner,port:'right'});
    }else{
      index.set(slot.pre_slot.id,{...owner,port:'left'});
      index.set(slot.post_slot.id,{...owner,port:'right'});
    }
  }

  function buildSlotIndex(state){
    validateSentenceState(state);
    const index=new Map();
    for(const token of Object.values(state.tokens)) addSlotIndexEntries(index,token.word_slot.slot,{kind:'token',token_id:token.id});
    for(const [gap,items] of Object.entries(state.pseudo_tokens)) items.forEach((item,itemIndex) =>
      addSlotIndexEntries(index,item.word_slot.slot,{kind:'pseudo_token',gap:Number(gap),index:itemIndex})
    );
    for(const [gap,items] of Object.entries(state.boundary_items)) for(const [itemIndex,item] of items.entries()){
      if(item.slot) addSlotIndexEntries(index,item.slot,{kind:'boundary',gap:Number(gap),index:Number(itemIndex)});
    }
    for(const group of state.underline_groups) addSlotIndexEntries(index,group.slot,{kind:'underline_group',group_id:group.id});
    return index;
  }

  function createSentenceState(state){
    validateSentenceState(state);
    return clone(state);
  }

  function tokenAt(state,tokenId){
    assertInteger(tokenId,'token_id');
    const token=state.tokens?.[tokenId];
    if(!token) fail('token_id',`unknown TokenId ${tokenId}`);
    return token;
  }

  function nextSlotId(state){
    const validation=validateSentenceState(state);
    return validation.slot_ids.length ? Math.max(...validation.slot_ids)+1 : 0;
  }

  function replaceWordSlotWithT(state,tokenId,tSlot){
    validateSentenceState(state);
    const next=clone(state);
    const token=tokenAt(next,tokenId);
    const current=token.word_slot.slot;
    if(current.kind === 't_slot') fail('t_slot','word slot is already a TSlot');
    if(current.kind !== 'atomic_slot') fail('token_id',`TokenId ${tokenId} must contain an AtomicSlot before T replacement`);
    if(!tSlot || typeof tSlot !== 'object') fail('t_slot','expected a TSlot initializer');
    removeArrowSlotIds(next,[current.id]);
    const replacement={
      id:tSlot.id,
      kind:'t_slot',
      pre_slot:current,
      post_slot:clone(tSlot.post_slot)
    };
    token.word_slot.slot=replacement;
    validateSentenceState(next);
    return next;
  }

  function restoreWordSlotFromT(state,tokenId){
    validateSentenceState(state);
    const next=clone(state);
    const token=tokenAt(next,tokenId);
    const current=token.word_slot.slot;
    if(current.kind !== 't_slot') fail('token_id',`TokenId ${tokenId} does not contain a TSlot`);
    removeArrowSlotIds(next,[current.id,current.pre_slot.id,current.post_slot.id]);
    const restored=current.pre_slot;
    token.word_slot.slot=restored;
    next.underline_groups=next.underline_groups.map(group => ({
      ...group,
      child_ids:group.child_ids
        .map(slotId => slotId === current.id ? restored.id : slotId)
        .filter(slotId => slotId !== current.post_slot.id)
        .filter((slotId,index,ids) => ids.indexOf(slotId) === index)
    }));
    validateSentenceState(next);
    return next;
  }

  function replaceWordSlotWithDouble(state,tokenId){
    validateSentenceState(state);
    const next=clone(state);
    const token=tokenAt(next,tokenId);
    const current=token.word_slot.slot;
    if(current.kind !== 'atomic_slot') fail('token_id',`TokenId ${tokenId} must contain an AtomicSlot before double replacement`);
    removeArrowSlotIds(next,[current.id]);
    const outerId=nextSlotId(next);
    token.word_slot.slot={
      id:outerId,
      kind:'double_slot',
      lslot:current,
      rslot:{id:outerId+1,kind:'atomic_slot',mark:''}
    };
    validateSentenceState(next);
    return next;
  }

  function restoreWordSlotFromDouble(state,tokenId){
    validateSentenceState(state);
    const next=clone(state);
    const token=tokenAt(next,tokenId);
    const current=token.word_slot.slot;
    if(current.kind !== 'double_slot') fail('token_id',`TokenId ${tokenId} does not contain a DoubleSlot`);
    removeArrowSlotIds(next,[current.id,current.lslot.id,current.rslot.id]);
    const restored=current.lslot.mark || !current.rslot.mark ? current.lslot : current.rslot;
    token.word_slot.slot=restored;
    next.underline_groups=next.underline_groups.map(group => ({
      ...group,
      child_ids:group.child_ids
        .map(slotId => slotId === current.id ? restored.id : slotId)
        .filter(slotId => slotId !== (restored === current.lslot ? current.rslot.id : current.lslot.id))
        .filter((slotId,index,ids) => ids.indexOf(slotId) === index)
    }));
    validateSentenceState(next);
    return next;
  }

  function groupAt(state,groupId){
    assertInteger(groupId,'group_id');
    const group=state.underline_groups.find(item => item.id === groupId);
    if(!group) fail('group_id',`unknown GroupId ${groupId}`);
    return group;
  }

  function nextGroupId(state){
    const ids=validateSentenceState(state).group_ids;
    return ids.length ? Math.max(...ids)+1 : 0;
  }

  function createUnderlineGroup(state,childIds,groupId=null){
    validateSentenceState(state);
    if(!Array.isArray(childIds) || !childIds.length) fail('child_ids','expected at least one SlotId');
    const next=clone(state);
    const id=groupId == null ? nextGroupId(next) : groupId;
    assertInteger(id,'group_id');
    if(next.underline_groups.some(group => group.id === id)) fail('group_id',`duplicate GroupId ${id}`);
    const slotId=nextSlotId(next);
    next.underline_groups.push({
      id,
      kind:'underline_group',
      child_ids:[...childIds],
      slot:{id:slotId,kind:'atomic_slot',mark:''}
    });
    validateSentenceState(next);
    return next;
  }

  function setUnderlineGroupChildIds(state,groupId,childIds){
    validateSentenceState(state);
    if(!Array.isArray(childIds) || !childIds.length) fail('child_ids','expected at least one SlotId');
    const next=clone(state);
    groupAt(next,groupId).child_ids=[...childIds];
    validateSentenceState(next);
    return next;
  }

  function setUnderlineGroupMark(state,groupId,port,mark){
    validateSentenceState(state);
    if(!isMark(mark)) fail('mark','expected a string');
    const next=clone(state);
    const slot=groupAt(next,groupId).slot;
    let atomic=null;
    if(slot.kind === 'atomic_slot' && (port == null || port === 'single')) atomic=slot;
    if(slot.kind === 't_slot') atomic=port === 'left' ? slot.pre_slot : port === 'right' ? slot.post_slot : null;
    if(slot.kind === 'double_slot') atomic=port === 'left' ? slot.lslot : port === 'right' ? slot.rslot : null;
    if(!atomic) fail('port',`port ${String(port)} is not available on GroupId ${groupId}`);
    atomic.mark=mark;
    validateSentenceState(next);
    return next;
  }

  function removeSlotReferences(state,slotIds){
    validateSentenceState(state);
    const removed=new Set(slotIds || []);
    let next=clone(state);
    next.arrows=next.arrows.filter(arrow =>
      !(arrow.from.kind === 'slot' && removed.has(arrow.from.slot_id))
      && !(arrow.to.kind === 'slot' && removed.has(arrow.to.slot_id))
    );
    next.underline_groups=next.underline_groups.map(group => ({
      ...group,
      child_ids:group.child_ids.filter(id => !removed.has(id))
    }));
    // Empty groups cannot form a useful underline. Removing them through the
    // regular operation also clears references to their outer and port IDs.
    while(next.underline_groups.some(group => group.child_ids.length === 0)){
      const empty=next.underline_groups.find(group => group.child_ids.length === 0);
      next=removeUnderlineGroup(next,empty.id);
    }
    validateSentenceState(next);
    return next;
  }

  function nextBoundaryItemId(state){
    validateSentenceState(state);
    const ids=Object.values(state.boundary_items).flat().map(item => item.id);
    return ids.length ? Math.max(...ids)+1 : 0;
  }

  function appendBoundaryItem(state,gap,symbol){
    validateSentenceState(state);
    assertInteger(gap,'gap');
    if(!BOUNDARY_SYMBOLS.has(symbol)) fail('symbol',`unknown boundary symbol ${String(symbol)}`);
    const next=clone(state);
    const id=nextBoundaryItemId(next);
    const slotId=symbol === '[' ? nextSlotId(next) : null;
    next.boundary_items[gap] ||= [];
    next.boundary_items[gap].push({
      id,kind:'boundary_item',symbol,
      slot:slotId == null ? null : {id:slotId,kind:'atomic_slot',mark:''}
    });
    validateSentenceState(next);
    return next;
  }

  function removeBoundaryItem(state,gap,index){
    validateSentenceState(state);
    assertInteger(gap,'gap');
    assertInteger(index,'index');
    const item=state.boundary_items?.[gap]?.[index];
    if(!item) return clone(state);
    let next=item.slot ? removeSlotReferences(state,[item.slot.id]) : clone(state);
    next.boundary_items[gap]=next.boundary_items[gap].filter((_,itemIndex) => itemIndex !== index);
    if(!next.boundary_items[gap].length) delete next.boundary_items[gap];
    next.arrows=next.arrows.filter(arrow =>
      !(arrow.from.kind === 'boundary' && arrow.from.boundary_id === item.id)
      && !(arrow.to.kind === 'boundary' && arrow.to.boundary_id === item.id)
    );
    validateSentenceState(next);
    return next;
  }

  function clearBoundaryItems(state,gap){
    validateSentenceState(state);
    assertInteger(gap,'gap');
    let next=clone(state);
    while(next.boundary_items?.[gap]?.length) next=removeBoundaryItem(next,gap,next.boundary_items[gap].length-1);
    return next;
  }

  function setBoundaryMark(state,boundaryId,mark){
    validateSentenceState(state);
    assertInteger(boundaryId,'boundary_id');
    if(!isMark(mark)) fail('mark','expected a string');
    const next=clone(state);
    const item=Object.values(next.boundary_items).flat().find(candidate => candidate.id === boundaryId);
    if(!item) fail('boundary_id',`unknown BoundaryItemId ${boundaryId}`);
    if(!item.slot) fail('boundary_id',`BoundaryItemId ${boundaryId} has no slot`);
    item.slot.mark=mark;
    validateSentenceState(next);
    return next;
  }

  const sameEndpoint=(left,right) => left?.kind === right?.kind
    && (left?.kind === 'slot' ? left.slot_id === right.slot_id : left?.boundary_id === right?.boundary_id);

  function addArrow(state,from,to){
    validateSentenceState(state);
    const next=clone(state);
    next.arrows=next.arrows.filter(arrow => !sameEndpoint(arrow.from,from));
    next.arrows.push({from:clone(from),to:clone(to)});
    validateSentenceState(next);
    return next;
  }

  function removeArrowsFrom(state,from){
    validateSentenceState(state);
    const next=clone(state);
    next.arrows=next.arrows.filter(arrow => !sameEndpoint(arrow.from,from));
    validateSentenceState(next);
    return next;
  }

  function removeGroupChildIds(state,removedIds){
    const removed=new Set(removedIds);
    state.underline_groups=state.underline_groups.map(group => ({
      ...group,
      child_ids:group.child_ids.filter(id => !removed.has(id))
    }));
  }

  function replaceUnderlineGroupSlotWithT(state,groupId){
    validateSentenceState(state);
    const next=clone(state);
    const group=groupAt(next,groupId);
    const current=group.slot;
    if(current.kind !== 'atomic_slot') fail('group_id',`GroupId ${groupId} must contain an AtomicSlot before T replacement`);
    removeArrowSlotIds(next,[current.id]);
    const first=nextSlotId(next);
    group.slot={
      id:current.id,
      kind:'t_slot',
      pre_slot:{id:first,kind:'atomic_slot',mark:current.mark},
      post_slot:{id:first+1,kind:'atomic_slot',mark:''}
    };
    validateSentenceState(next);
    return next;
  }

  function restoreUnderlineGroupSlotFromT(state,groupId){
    validateSentenceState(state);
    const next=clone(state);
    const group=groupAt(next,groupId);
    const current=group.slot;
    if(current.kind !== 't_slot') fail('group_id',`GroupId ${groupId} does not contain a TSlot`);
    removeArrowSlotIds(next,[current.id,current.pre_slot.id,current.post_slot.id]);
    group.slot={id:current.id,kind:'atomic_slot',mark:current.pre_slot.mark};
    removeGroupChildIds(next,[current.pre_slot.id,current.post_slot.id]);
    validateSentenceState(next);
    return next;
  }

  function replaceUnderlineGroupSlotWithDouble(state,groupId){
    validateSentenceState(state);
    const next=clone(state);
    const group=groupAt(next,groupId);
    const current=group.slot;
    if(current.kind !== 'atomic_slot') fail('group_id',`GroupId ${groupId} must contain an AtomicSlot before double replacement`);
    removeArrowSlotIds(next,[current.id]);
    const first=nextSlotId(next);
    group.slot={
      id:current.id,
      kind:'double_slot',
      lslot:{id:first,kind:'atomic_slot',mark:current.mark},
      rslot:{id:first+1,kind:'atomic_slot',mark:''}
    };
    validateSentenceState(next);
    return next;
  }

  function restoreUnderlineGroupSlotFromDouble(state,groupId){
    validateSentenceState(state);
    const next=clone(state);
    const group=groupAt(next,groupId);
    const current=group.slot;
    if(current.kind !== 'double_slot') fail('group_id',`GroupId ${groupId} does not contain a DoubleSlot`);
    removeArrowSlotIds(next,[current.id,current.lslot.id,current.rslot.id]);
    const mark=current.lslot.mark || !current.rslot.mark ? current.lslot.mark : current.rslot.mark;
    group.slot={id:current.id,kind:'atomic_slot',mark};
    removeGroupChildIds(next,[current.lslot.id,current.rslot.id]);
    validateSentenceState(next);
    return next;
  }

  function removeUnderlineGroup(state,groupId){
    validateSentenceState(state);
    const next=clone(state);
    const removed=groupAt(next,groupId);
    const removedIds=[];
    collectSlotIds(removed.slot,removedIds);
    const removedSet=new Set(removedIds);
    removeArrowSlotIds(next,removedIds);
    next.underline_groups=next.underline_groups
      .filter(group => group.id !== groupId)
      .map(group => ({
        ...group,
        child_ids:group.child_ids.flatMap(id => id === removed.slot.id
          ? removed.child_ids
          : removedSet.has(id) ? [] : [id]
        ).filter((id,index,ids) => ids.indexOf(id) === index)
      }));
    validateSentenceState(next);
    return next;
  }

  return Object.freeze({
    MARKS,
    addArrow,
    appendBoundaryItem,
    buildSlotIndex,
    clearBoundaryItems,
    createUnderlineGroup,
    createSentenceState,
    displayToMark,
    isMark,
    markToDisplay,
    replaceWordSlotWithDouble,
    replaceWordSlotWithT,
    removeSlotReferences,
    removeArrowsFrom,
    removeBoundaryItem,
    replaceUnderlineGroupSlotWithDouble,
    replaceUnderlineGroupSlotWithT,
    removeUnderlineGroup,
    setUnderlineGroupChildIds,
    setUnderlineGroupMark,
    setBoundaryMark,
    restoreWordSlotFromDouble,
    restoreWordSlotFromT,
    restoreUnderlineGroupSlotFromDouble,
    restoreUnderlineGroupSlotFromT,
    validateSentenceState
  });
});
