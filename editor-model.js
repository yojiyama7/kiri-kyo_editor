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
    if(!Array.isArray(state.underline_groups)) fail('state.underline_groups','expected an array');
    assertInteger(state.cursor,'state.cursor');

    const slotIds=new Set();
    const tokenIds=new Set();
    for(const [key,token] of Object.entries(state.tokens)){
      const path=`state.tokens[${key}]`;
      if(!token || typeof token !== 'object') fail(path,'expected a Token object');
      assertInteger(token.id,`${path}.id`);
      if(String(token.id) !== key) fail(path,`record key must equal token.id (${token.id})`);
      if(tokenIds.has(token.id)) fail(`${path}.id`,`duplicate TokenId ${token.id}`);
      tokenIds.add(token.id);
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

    state.underline_groups.forEach((group,index) => {
      const path=`state.underline_groups[${index}]`;
      if(group?.kind !== 'underline_group') fail(`${path}.kind`,'expected underline_group');
      if(!Array.isArray(group.child_ids)) fail(`${path}.child_ids`,'expected an array');
      collectSlot(group.slot,`${path}.slot`,slotIds);
    });

    state.underline_groups.forEach((group,index) => {
      const seen=new Set();
      group.child_ids.forEach((slotId,childIndex) => {
        const path=`state.underline_groups[${index}].child_ids[${childIndex}]`;
        assertInteger(slotId,path);
        if(!slotIds.has(slotId)) fail(path,`unknown SlotId ${slotId}`);
        if(slotId === group.slot.id) fail(path,'an underline group cannot contain its own slot');
        if(seen.has(slotId)) fail(path,`duplicate SlotId ${slotId}`);
        seen.add(slotId);
      });
    });

    if(!slotIds.has(state.cursor)) fail('state.cursor',`unknown SlotId ${state.cursor}`);
    return {slot_ids:[...slotIds],token_ids:[...tokenIds]};
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

  function replaceWordSlotWithT(state,tokenId,tSlot){
    validateSentenceState(state);
    const next=clone(state);
    const token=tokenAt(next,tokenId);
    const current=token.word_slot.slot;
    if(current.kind === 't_slot') fail('t_slot','word slot is already a TSlot');
    if(current.kind !== 'atomic_slot') fail('token_id',`TokenId ${tokenId} must contain an AtomicSlot before T replacement`);
    if(!tSlot || typeof tSlot !== 'object') fail('t_slot','expected a TSlot initializer');
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
    const restored=current.pre_slot;
    token.word_slot.slot=restored;
    next.underline_groups=next.underline_groups.map(group => ({
      ...group,
      child_ids:group.child_ids
        .map(slotId => slotId === current.id ? restored.id : slotId)
        .filter(slotId => slotId !== current.post_slot.id)
        .filter((slotId,index,ids) => ids.indexOf(slotId) === index)
    }));
    if(next.cursor === current.id || next.cursor === current.post_slot.id) next.cursor=restored.id;
    validateSentenceState(next);
    return next;
  }

  return Object.freeze({
    MARKS,
    createSentenceState,
    isMark,
    replaceWordSlotWithT,
    restoreWordSlotFromT,
    validateSentenceState
  });
});
