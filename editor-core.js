(function(global){
  'use strict';

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const Model=global.KiriEditorModel;

  const makeWorkSlot = () => ({enabled:true, kind:'single', text:'', left:'', right:''});
  const makeTSlot = (text = '') => ({enabled:true, kind:'single', text:text || '', left:'', right:''});
  const makeTState = (on = false, left = '', right = '') => ({
    on:Boolean(on),
    slots:{left:makeTSlot(left), right:makeTSlot(right)}
  });

  const markToDisplay = mark => Model?.markToDisplay ? Model.markToDisplay(mark) : String(mark || '');
  const displayToMark = display => Model?.displayToMark ? Model.displayToMark(display) : String(display || '');

  function orderedSentenceTokens(sentenceState){
    return (sentenceState?.token_chain || []).map(id => sentenceState.tokens?.[id]).filter(Boolean);
  }

  function orderedDocumentTokens(state){
    return (state?.sentenceStates || []).flatMap(orderedSentenceTokens);
  }

  function tokenAtWordIndex(state,index){
    return orderedDocumentTokens(state)[index] || null;
  }

  function wordSlotAt(state,index){
    return tokenAtWordIndex(state,index)?.word_slot?.slot || null;
  }

  function sentenceTokenLocation(state,index){
    let remaining=Number(index);
    for(let sentenceIndex=0;sentenceIndex<(state.sentenceStates || []).length;sentenceIndex++){
      const sentenceState=state.sentenceStates[sentenceIndex];
      if(remaining < sentenceState.token_chain.length){
        return {sentenceIndex,sentenceState,tokenId:sentenceState.token_chain[remaining]};
      }
      remaining-=sentenceState.token_chain.length;
    }
    return null;
  }

  function replaceSentenceTokenSlot(state,index,operation){
    const location=sentenceTokenLocation(state,index);
    if(!location) return state;
    state.sentenceStates[location.sentenceIndex]=operation(location.sentenceState,location.tokenId);
    return state;
  }

  function replaceWordSlotWithDouble(state,index){
    return replaceSentenceTokenSlot(state,index,(sentenceState,tokenId) =>
      Model.replaceWordSlotWithDouble(sentenceState,tokenId)
    );
  }

  function restoreWordSlotFromDouble(state,index){
    return replaceSentenceTokenSlot(state,index,(sentenceState,tokenId) =>
      Model.restoreWordSlotFromDouble(sentenceState,tokenId)
    );
  }

  function replaceWordSlotWithT(state,index){
    return replaceSentenceTokenSlot(state,index,(sentenceState,tokenId) => {
      const nextId=Math.max(-1,...Model.validateSentenceState(sentenceState).slot_ids)+1;
      return Model.replaceWordSlotWithT(sentenceState,tokenId,{
        id:nextId,post_slot:{id:nextId+1,kind:'atomic_slot',mark:''}
      });
    });
  }

  function restoreWordSlotFromT(state,index){
    return replaceSentenceTokenSlot(state,index,(sentenceState,tokenId) =>
      Model.restoreWordSlotFromT(sentenceState,tokenId)
    );
  }

  function atomicWordSlotForRef(state,index,side=null){
    const slot=wordSlotAt(state,index);
    if(slot?.kind === 'atomic_slot') return side == null ? slot : null;
    if(slot?.kind === 'double_slot') return side === 'left' ? slot.lslot : side === 'right' ? slot.rslot : null;
    if(slot?.kind === 't_slot') return side === 'left' ? slot.pre_slot : side === 'right' ? slot.post_slot : null;
    return null;
  }

  function setWordSlotMark(state,index,side,display){
    const slot=atomicWordSlotForRef(state,index,side);
    if(slot) slot.mark=displayToMark(display);
    return Boolean(slot);
  }

  function atomicSlotsOf(slot){
    if(!slot) return [];
    if(slot.kind === 'atomic_slot') return [slot];
    if(slot.kind === 'double_slot') return [slot.lslot,slot.rslot];
    if(slot.kind === 't_slot') return [slot.pre_slot,slot.post_slot];
    return [];
  }

  function maxDocumentId(sentenceStates,kind){
    let max=-1;
    for(const sentenceState of sentenceStates || []){
      if(kind === 'token'){
        for(const id of sentenceState.token_chain || []) max=Math.max(max,Number(id));
      }else{
        try{
          const ids=Model.validateSentenceState(sentenceState).slot_ids;
          if(ids.length) max=Math.max(max,...ids);
        }catch(_error){
          for(const token of orderedSentenceTokens(sentenceState)){
            const slot=token.word_slot?.slot;
            if(slot) max=Math.max(max,Number(slot.id),...atomicSlotsOf(slot).map(item => Number(item.id)));
          }
        }
      }
    }
    return max;
  }

  function modelPortSlot(slot,port){
    if(!slot) return null;
    if(port == null || port === 'single') return slot;
    if(slot.kind === 'double_slot') return port === 'left' ? slot.lslot : port === 'right' ? slot.rslot : null;
    if(slot.kind === 't_slot') return port === 'left' ? slot.pre_slot : port === 'right' ? slot.post_slot : null;
    return null;
  }

  function legacyTFromSlot(slot){
    if(slot?.kind !== 't_slot') return makeTState(false);
    return makeTState(true,markToDisplay(slot.pre_slot.mark),markToDisplay(slot.post_slot.mark));
  }

  function groupMarkFromSlot(slot){
    return slot?.kind === 'atomic_slot' ? markToDisplay(slot.mark) : '';
  }

  function buildSentenceGroupView(model,{sentenceIndex=0,atomicXBySlotId=null,lineStep=27}={}){
    if(!model) return null;
    Model.validateSentenceState(model);
    const slotIndex=Model.buildSlotIndex(model);
    const groupsById=new Map(model.underline_groups.map(group => [group.id,group]));
    const tokenOrder=new Map(model.token_chain.map((id,index) => [id,index]));
    const slotById=new Map();
    const addSlot=slot => {
      slotById.set(slot.id,slot);
      if(slot.kind === 'double_slot'){
        slotById.set(slot.lslot.id,slot.lslot);
        slotById.set(slot.rslot.id,slot.rslot);
      }else if(slot.kind === 't_slot'){
        slotById.set(slot.pre_slot.id,slot.pre_slot);
        slotById.set(slot.post_slot.id,slot.post_slot);
      }
    };
    Object.values(model.tokens).forEach(token => addSlot(token.word_slot.slot));
    Object.values(model.pseudo_tokens).flat().forEach(token => addSlot(token.word_slot.slot));
    Object.values(model.boundary_items).forEach(items => items.forEach(item => { if(item.slot) addSlot(item.slot); }));
    model.underline_groups.forEach(group => addSlot(group.slot));

    const surfaceOwners=[];
    const appendOwner=(slot,sortKey) => surfaceOwners.push({slot,sortKey});
    for(let gap=0;gap<=model.token_chain.length;gap++){
      const boundaries=(model.boundary_items?.[gap] || []).map((item,index) => [index,item]);
      boundaries.forEach(([index,item]) => { if(item.slot) appendOwner(item.slot,[gap,0,Number(index)]); });
      (model.pseudo_tokens?.[gap] || []).forEach((item,index) => appendOwner(item.word_slot.slot,[gap,1,index]));
      const tokenId=model.token_chain[gap];
      if(tokenId != null) appendOwner(model.tokens[tokenId].word_slot.slot,[gap,2,0]);
    }
    surfaceOwners.sort((left,right) => left.sortKey[0]-right.sortKey[0]
      || left.sortKey[1]-right.sortKey[1] || left.sortKey[2]-right.sortKey[2]);
    const derivedX=new Map();
    surfaceOwners.forEach(({slot},x) => {
      if(slot.kind === 'atomic_slot') derivedX.set(slot.id,x);
      else if(slot.kind === 'double_slot'){
        derivedX.set(slot.lslot.id,x);
        derivedX.set(slot.rslot.id,x+0.5);
      }else{
        derivedX.set(slot.pre_slot.id,x);
        derivedX.set(slot.post_slot.id,x+0.5);
      }
    });
    const atomicX=new Map(derivedX);
    if(atomicXBySlotId) for(const [id,x] of atomicXBySlotId) atomicX.set(Number(id),x);
    let atomicAxis=[...atomicX].sort((left,right) => left[1]-right[1] || left[0]-right[0]).map(([id]) => id);
    const surfaceAtomicAxis=[...atomicAxis];

    const groupForOwnedSlotId=id => {
      const owner=slotIndex.get(id);
      return owner?.kind === 'underline_group' ? groupsById.get(owner.group_id) || null : null;
    };
    const baseLeafMemo=new Map();
    const baseLeafSlotIds=(groupId,visiting=new Set()) => {
      if(baseLeafMemo.has(groupId)) return baseLeafMemo.get(groupId);
      if(visiting.has(groupId)) return [];
      const group=groupsById.get(groupId);
      if(!group) return [];
      const next=new Set(visiting).add(groupId);
      const result=[];
      for(const childId of group.child_ids){
        const childGroup=groupForOwnedSlotId(childId);
        if(childGroup){ result.push(...baseLeafSlotIds(childGroup.id,next)); continue; }
        const slot=slotById.get(childId);
        if(slot?.kind === 'atomic_slot') result.push(slot.id);
        else if(slot?.kind === 'double_slot') result.push(slot.lslot.id,slot.rslot.id);
        else if(slot?.kind === 't_slot') result.push(slot.pre_slot.id,slot.post_slot.id);
      }
      const unique=[...new Set(result)].filter(id => atomicX.has(id));
      baseLeafMemo.set(groupId,unique);
      return unique;
    };
    // Group T ports are real surface primitives. Insert them immediately after
    // the group's underlying region, matching their rendered order without
    // renumbering token-owned logical x values.
    const groupPortGroups=model.underline_groups
      .filter(group => group.slot.kind === 't_slot' || group.slot.kind === 'double_slot')
      .sort((left,right) => baseLeafSlotIds(left.id).length-baseLeafSlotIds(right.id).length || left.id-right.id);
    for(const group of groupPortGroups){
      const baseIds=baseLeafSlotIds(group.id);
      const last=Math.max(-1,...baseIds.map(id => atomicAxis.indexOf(id)));
      const ports=group.slot.kind === 't_slot'
        ? [group.slot.pre_slot.id,group.slot.post_slot.id]
        : [group.slot.lslot.id,group.slot.rslot.id];
      atomicAxis.splice(last+1,0,...ports);
      const baseX=Math.max(0,...baseIds.map(id => atomicX.get(id)).filter(Number.isFinite));
      atomicX.set(ports[0],baseX);
      atomicX.set(ports[1],baseX+0.5);
    }
    const leafMemo=new Map();
    const leafSlotIds=(groupId,visiting=new Set()) => {
      if(leafMemo.has(groupId)) return leafMemo.get(groupId);
      if(visiting.has(groupId)) return [];
      const group=groupsById.get(groupId);
      if(!group) return [];
      const next=new Set(visiting).add(groupId);
      const result=[];
      for(const childId of group.child_ids){
        const childGroup=groupForOwnedSlotId(childId);
        if(childGroup){
          // The outer SlotId means the complete child group. An internal port
          // remains independently selectable and must not collapse to leaves.
          if(childId === childGroup.slot.id) result.push(...leafSlotIds(childGroup.id,next));
          else result.push(childId);
          continue;
        }
        const slot=slotById.get(childId);
        if(slot?.kind === 'atomic_slot') result.push(slot.id);
        else if(slot?.kind === 'double_slot') result.push(slot.lslot.id,slot.rslot.id);
        else if(slot?.kind === 't_slot') result.push(slot.pre_slot.id,slot.post_slot.id);
      }
      const unique=[...new Set(result)];
      leafMemo.set(groupId,unique);
      return unique;
    };
    const dependencyIds=group => [...new Set(group.child_ids
      .map(id => groupForOwnedSlotId(id)?.id)
      .filter(id => id != null))];
    const depthMemo=new Map();
    const structuralDepth=(groupId,visiting=new Set()) => {
      if(depthMemo.has(groupId)) return depthMemo.get(groupId);
      if(visiting.has(groupId)) return 0;
      const children=dependencyIds(groupsById.get(groupId));
      const depth=children.length
        ? 1+Math.max(...children.map(id => structuralDepth(id,new Set(visiting).add(groupId))))
        : 0;
      depthMemo.set(groupId,depth);
      return depth;
    };
    const regionsFor=ids => {
      const selected=new Set(ids);
      const includesGroupPort=ids.some(id => slotIndex.get(id)?.kind === 'underline_group');
      const regionAxis=includesGroupPort ? atomicAxis : surfaceAtomicAxis;
      const regions=[];
      let current=null;
      for(const id of regionAxis){
        if(!selected.has(id)){ current=null; continue; }
        if(!current){ current=[]; regions.push(current); }
        current.push(id);
      }
      return regions;
    };
    const leafSets=new Map(model.underline_groups.map(group => [group.id,new Set(leafSlotIds(group.id))]));
    const ordered=model.underline_groups.slice().sort((left,right) =>
      leafSets.get(left.id).size-leafSets.get(right.id).size
      || structuralDepth(left.id)-structuralDepth(right.id)
      || left.id-right.id
    );
    const levelById=new Map();
    for(const group of ordered){
      const own=leafSets.get(group.id);
      const levels=ordered.filter(candidate => levelById.has(candidate.id)
        && [...own].some(id => leafSets.get(candidate.id).has(id)))
        .map(candidate => levelById.get(candidate.id));
      levelById.set(group.id,levels.length ? Math.max(...levels)+1 : 0);
    }
    const groups=model.underline_groups.map(group => {
      const atomicSlotIds=leafSlotIds(group.id);
      const own=leafSets.get(group.id);
      const regions=regionsFor(atomicSlotIds).map(ids => ({
        slot_ids:ids,
        xs:ids.map(id => atomicX.get(id)).filter(Number.isFinite)
      }));
      const dependencies=dependencyIds(group);
      return Object.freeze({
        sentence_idx:sentenceIndex,
        group_id:group.id,
        slot_ref:Object.freeze({sentence_idx:sentenceIndex,slot_id:group.slot.id}),
        child_slot_refs:Object.freeze(group.child_ids.map(slotId => Object.freeze({sentence_idx:sentenceIndex,slot_id:slotId}))),
        atomic_slot_ids:Object.freeze([...atomicSlotIds]),
        regions:Object.freeze(regions.map(region => Object.freeze({slot_ids:Object.freeze(region.slot_ids),xs:Object.freeze(region.xs)}))),
        logical_y:structuralDepth(group.id)+2,
        structural_depth:structuralDepth(group.id),
        level:levelById.get(group.id) || 0,
        line_offset:(levelById.get(group.id) || 0)*lineStep,
        child_group_ids:Object.freeze(dependencies),
        containing_group_ids:Object.freeze(model.underline_groups
          .filter(other => other.id !== group.id && leafSlotIds(other.id).some(id => own.has(id)))
          .map(other => other.id))
      });
    });
    return Object.freeze({
      sentence_idx:sentenceIndex,
      model,
      groups_by_id:groupsById,
      slots_by_id:slotIndex,
      atomic_x_by_slot_id:atomicX,
      atomic_axis:Object.freeze(atomicAxis),
      groups:Object.freeze(groups),
      group_view_by_id:new Map(groups.map(group => [group.group_id,group])),
      token_order:tokenOrder
    });
  }

  function deriveSentenceGroupDisplayViews(model,wordOffset=0,sentenceIndex=0){
    if(!model) return [];
    const index=Model.buildSlotIndex(model);
    const tokenLocal=new Map(model.token_chain.map((id,local) => [id,local]));
    const refForId=id => {
      const owner=index.get(id);
      if(!owner) return null;
      const slot=owner.port === 'single' ? null : owner.port;
      if(owner.kind === 'token') return {sentence_idx:sentenceIndex,word:wordOffset+tokenLocal.get(owner.token_id),slot};
      if(owner.kind === 'pseudo_token') return {sentence_idx:sentenceIndex,gapToken:wordOffset+owner.gap,gapTokenIndex:owner.index,slot};
      if(owner.kind === 'boundary') return {sentence_idx:sentenceIndex,boundary:wordOffset+owner.gap,boundaryIndex:owner.index,slot:null};
      return {sentence_idx:sentenceIndex,group:owner.group_id,slot};
    };
    const projected=model.underline_groups.map(group => ({
      id:group.id,
      sentence_idx:sentenceIndex,
      slot:group.slot,
      childRefs:group.child_ids.map(refForId).filter(Boolean),
      regions:[],firstRef:null,lastRef:null,startWord:wordOffset,endWord:wordOffset,
    }));
    const byId=new Map(projected.map(group => [group.id,group]));
    const extent=(group,visiting=new Set()) => {
      if(!group || visiting.has(group.id)) return {start:wordOffset,end:wordOffset};
      const next=new Set(visiting).add(group.id);
      const values=[];
      for(const member of group.childRefs){
        if(member.group != null){ const child=extent(byId.get(member.group),next); values.push(child.start,child.end); }
        else if(member.gapToken != null) values.push(member.gapToken);
        else if(member.boundary != null) values.push(member.boundary);
        else if(member.word != null) values.push(member.word);
      }
      if(values.length){ group.startWord=Math.min(...values); group.endWord=Math.max(...values); }
      return {start:group.startWord,end:group.endWord};
    };
    projected.forEach(group => extent(group));
    return projected;
  }

  function buildDocumentGroupDisplayViews(state){
    let offset=0;
    return (state.sentenceStates || []).flatMap((model,sentenceIndex) => {
      const result=deriveSentenceGroupDisplayViews(model,offset,sentenceIndex);
      offset+=model.token_chain.length;
      return result;
    });
  }


  function sentenceIndexForDisplayRef(state,ref){
    if(Number.isSafeInteger(ref?.sentence_idx)) return ref.sentence_idx;
    if(ref?.word != null){
      return (state.sentenceRanges || []).find(range => ref.word >= range.start && ref.word < range.end)?.index ?? -1;
    }
    if(ref?.gapToken != null) return sentenceIndexForGap(state.sentenceRanges || [],ref.gapToken);
    if(ref?.boundary != null) return sentenceIndexForGap(state.sentenceRanges || [],ref.boundary);
    if(ref?.group != null){
      const matches=(state.sentenceStates || [])
        .map((model,index) => model.underline_groups.some(group => group.id === ref.group) ? index : -1)
        .filter(index => index >= 0);
      return matches.length === 1 ? matches[0] : -1;
    }
    return -1;
  }

  function slotIdForDisplayRef(state,ref){
    const sentenceIndex=sentenceIndexForDisplayRef(state,ref);
    const model=state.sentenceStates?.[sentenceIndex];
    const range=state.sentenceRanges?.[sentenceIndex];
    if(!model || !range) return null;
    let slot=null;
    if(ref?.word != null){
      const tokenId=model.token_chain[ref.word-range.start];
      slot=model.tokens[tokenId]?.word_slot?.slot;
    }else if(ref?.gapToken != null){
      slot=model.pseudo_tokens?.[ref.gapToken-range.start]?.[pseudoIndexOf(ref)]?.word_slot?.slot;
    }else if(ref?.boundary != null){
      slot=model.boundary_items?.[ref.boundary-range.start]?.[boundaryIndexOf(ref)]?.slot;
    }else if(ref?.group != null){
      slot=model.underline_groups.find(group => group.id === ref.group)?.slot;
    }
    return modelPortSlot(slot,ref?.slot)?.id ?? null;
  }

  function displayRefForSlotId(state,sentenceIndex,slotId){
    const model=state.sentenceStates?.[sentenceIndex];
    const range=state.sentenceRanges?.[sentenceIndex];
    if(!model || !range) return null;
    const owner=Model.buildSlotIndex(model).get(slotId);
    if(!owner) return null;
    const slot=owner.port === 'single' ? null : owner.port;
    if(owner.kind === 'token'){
      const local=model.token_chain.indexOf(owner.token_id);
      return {sentence_idx:sentenceIndex,word:range.start+local,slot};
    }
    if(owner.kind === 'pseudo_token') return {
      sentence_idx:sentenceIndex,gapToken:range.start+owner.gap,gapTokenIndex:owner.index,slot
    };
    if(owner.kind === 'boundary') return {
      sentence_idx:sentenceIndex,boundary:range.start+owner.gap,boundaryIndex:owner.index,slot:null
    };
    return {sentence_idx:sentenceIndex,group:owner.group_id,slot};
  }

  function readLegacyGroupsIntoSentenceStates(state,legacyGroups){
    const groups=Array.isArray(legacyGroups) ? legacyGroups : [];
    let nextId=maxDocumentId(state.sentenceStates,'slot')+1;
    let offset=0;
    let sentenceIndex=0;
    for(const model of state.sentenceStates || []){
      const end=offset+model.token_chain.length;
      const localGroups=groups.filter(group => group.sentence_idx === sentenceIndex
        || (group.sentence_idx == null && group.start >= offset && group.end <= end));
      const oldById=new Map(model.underline_groups.map(group => [group.id,group]));
      model.underline_groups=localGroups.map(group => {
        const old=oldById.get(group.id);
        const verbal=normalizeTState(group.verbal) || makeTState(false);
        let slot;
        if(verbal.on){
          const outer=old?.slot?.id ?? nextId++;
          const oldT=old?.slot?.kind === 't_slot' ? old.slot : null;
          slot={id:outer,kind:'t_slot',
            pre_slot:oldT?.pre_slot || createAtomicSlot(nextId++,verbal.slots.left.text || ''),
            post_slot:oldT?.post_slot || createAtomicSlot(nextId++,verbal.slots.right.text || '')};
          slot.pre_slot.mark=displayToMark(verbal.slots.left.text || '');
          slot.post_slot.mark=displayToMark(verbal.slots.right.text || '');
        }else{
          const outer=old?.slot?.id ?? nextId++;
          slot={id:outer,kind:'atomic_slot',mark:displayToMark(group.mark || '')};
        }
        return {id:group.id,kind:'underline_group',child_ids:[],slot};
      });
      const slotIndex=Model.buildSlotIndex(model);
      const localTokenIds=model.token_chain;
      const idForRef=ref => {
        let owner=null;
        if(ref?.word != null){
          const local=ref.word-offset;
          const token=model.tokens[localTokenIds[local]];
          const target=modelPortSlot(token?.word_slot?.slot,ref.slot);
          return target?.id ?? null;
        }
        if(ref?.gapToken != null){
          const item=model.pseudo_tokens?.[ref.gapToken-offset]?.[pseudoIndexOf(ref)];
          return modelPortSlot(item?.word_slot?.slot,ref.slot)?.id ?? null;
        }
        if(ref?.boundary != null) return model.boundary_items?.[ref.boundary-offset]?.[boundaryIndexOf(ref)]?.slot?.id ?? null;
        if(ref?.group != null){
          const target=model.underline_groups.find(item => item.id === ref.group);
          return modelPortSlot(target?.slot,ref.slot)?.id ?? null;
        }
        return null;
      };
      for(const legacy of localGroups){
        const target=model.underline_groups.find(group => group.id === legacy.id);
        target.child_ids=(legacy.members || []).map(idForRef).filter(id => slotIndex.has(id))
          .filter((id,index,ids) => ids.indexOf(id) === index);
      }
      Model.validateSentenceState(model);
      offset=end;
      sentenceIndex++;
    }
    return state;
  }

  function createAtomicSlot(id,mark=''){
    return {id,kind:'atomic_slot',mark:displayToMark(mark)};
  }

  function collectSlotIds(slot,result=[]){
    if(!slot) return result;
    result.push(slot.id);
    if(slot.kind === 'double_slot') result.push(slot.lslot.id,slot.rslot.id);
    if(slot.kind === 't_slot') result.push(slot.pre_slot.id,slot.post_slot.id);
    return result;
  }

  function createSentenceStates(parsed,previous=[]){
    const priorTokens=(previous || []).flatMap(orderedSentenceTokens);
    let nextTokenId=maxDocumentId(previous,'token')+1;
    let nextSlotId=maxDocumentId(previous,'slot')+1;
    const allTokens=parsed.tokens.map((text,index) => {
      const prior=priorTokens[index];
      if(prior) return {...clone(prior),text};
      const token={
        id:nextTokenId++,
        text,
        word_slot:{kind:'word_slot',slot:createAtomicSlot(nextSlotId++,'')}
      };
      return token;
    });
    return parsed.ranges.map(range => {
      const sentenceTokens=allTokens.slice(range.start,range.end);
      const prior=previous?.[range.index];
      const state={
        tokens:Object.fromEntries(sentenceTokens.map(token => [token.id,token])),
        token_chain:sentenceTokens.map(token => token.id),
        pseudo_tokens:Object.fromEntries(Object.entries(clone(prior?.pseudo_tokens || {}))
          .filter(([gap]) => Number(gap) <= sentenceTokens.length)),
        boundary_items:Object.fromEntries(Object.entries(clone(prior?.boundary_items || {}))
          .filter(([gap]) => Number(gap) <= sentenceTokens.length)),
        underline_groups:clone(prior?.underline_groups || []),
        arrows:clone(prior?.arrows || []),
        cursor:sentenceTokens.length ? clone(prior?.cursor || {x:0,y:1}) : null
      };
      const known=new Set();
      const addKnown=slot => {
        known.add(slot.id);
        if(slot.kind === 'double_slot') known.add(slot.lslot.id).add(slot.rslot.id);
        if(slot.kind === 't_slot') known.add(slot.pre_slot.id).add(slot.post_slot.id);
      };
      Object.values(state.tokens).forEach(token => addKnown(token.word_slot.slot));
      Object.values(state.pseudo_tokens).flat().forEach(token => addKnown(token.word_slot.slot));
      Object.values(state.boundary_items).forEach(items => items.forEach(item => { if(item.slot) addKnown(item.slot); }));
      state.underline_groups.forEach(group => addKnown(group.slot));
      state.underline_groups=state.underline_groups.map(group => ({
        ...group,child_ids:group.child_ids.filter(id => known.has(id))
      }));
      while(state.underline_groups.some(group => group.child_ids.length === 0)){
        const empty=state.underline_groups.find(group => group.child_ids.length === 0);
        const removed=new Set();
        const addRemoved=slot => {
          removed.add(slot.id);
          if(slot.kind === 'double_slot') removed.add(slot.lslot.id).add(slot.rslot.id);
          if(slot.kind === 't_slot') removed.add(slot.pre_slot.id).add(slot.post_slot.id);
        };
        addRemoved(empty.slot);
        state.underline_groups=state.underline_groups
          .filter(group => group.id !== empty.id)
          .map(group => ({...group,child_ids:group.child_ids.filter(id => !removed.has(id))}));
      }
      const finalKnown=new Set();
      const addFinal=slot => {
        finalKnown.add(slot.id);
        if(slot.kind === 'double_slot') finalKnown.add(slot.lslot.id).add(slot.rslot.id);
        if(slot.kind === 't_slot') finalKnown.add(slot.pre_slot.id).add(slot.post_slot.id);
      };
      Object.values(state.tokens).forEach(token => addFinal(token.word_slot.slot));
      Object.values(state.pseudo_tokens).flat().forEach(token => addFinal(token.word_slot.slot));
      Object.values(state.boundary_items).flat().forEach(item => { if(item.slot) addFinal(item.slot); });
      state.underline_groups.forEach(group => addFinal(group.slot));
      state.arrows=state.arrows.filter(arrow => {
        if(arrow.from?.kind === 'slot' && !finalKnown.has(arrow.from.slot_id)) return false;
        if(arrow.to?.kind === 'slot' && !finalKnown.has(arrow.to.slot_id)) return false;
        const boundaryIds=new Set(Object.values(state.boundary_items).flat().map(item => item.id));
        if(arrow.from?.kind === 'boundary' && !boundaryIds.has(arrow.from.boundary_id)) return false;
        if(arrow.to?.kind === 'boundary' && !boundaryIds.has(arrow.to.boundary_id)) return false;
        return true;
      });
      Model.validateSentenceState(state);
      return state;
    });
  }

  function replaceDocumentSentenceStates(state,sentenceStates){
    return {...state,sentenceStates};
  }

  const pseudoList = value => Array.isArray(value) ? value : value?.text ? [value] : [];
  function documentPseudoProjection(state){
    const count=orderedDocumentTokens(state).length;
    const result=Array.from({length:count+1},() => []);
    for(const range of state.sentenceRanges || []){
      const model=state.sentenceStates?.[range.index];
      for(const [gap,items] of Object.entries(model?.pseudo_tokens || {})){
        result[range.start+Number(gap)]=items.map(item => ({
          text:item.text,
          slot:{kind:'single',enabled:true,text:markToDisplay(item.word_slot.slot.mark || '')}
        }));
      }
    }
    return result;
  }

  function documentBoundaryProjection(state){
    const count=orderedDocumentTokens(state).length;
    const strings=Array.from({length:count+1},() => '');
    const slots=Array.from({length:count+1},() => []);
    for(const range of state.sentenceRanges || []){
      const model=state.sentenceStates?.[range.index];
      for(const [gap,items] of Object.entries(model?.boundary_items || {})){
        const global=range.start+Number(gap);
        strings[global]=items.map(item => item.symbol).join('');
        slots[global]=items.map(item => item.slot ? {
          kind:'single',enabled:true,text:markToDisplay(item.slot.mark)
        } : null);
      }
    }
    return {strings,slots};
  }

  function documentArrowProjection(state){
    return (state.sentenceStates || []).flatMap((model,sentenceIndex) =>
      (model.arrows || []).map(arrow => ({
        from:displayRefForEndpoint(state,sentenceIndex,arrow.from),
        to:displayRefForEndpoint(state,sentenceIndex,arrow.to)
      })).filter(arrow => arrow.from && arrow.to)
    );
  }
  const arrowSourceValues = Object.freeze(['ad','a','副詞的目的格','同格']);
  const isArrowSourceValue = value => arrowSourceValues.includes(value);
  const pseudoIndexOf = ref => Number(ref?.gapTokenIndex || 0);
  const pseudoAt = (state,ref) => {
    const sentenceIndex=sentenceIndexForDisplayRef(state,ref);
    const range=state.sentenceRanges?.[sentenceIndex];
    return state.sentenceStates?.[sentenceIndex]?.pseudo_tokens?.[ref?.gapToken-range?.start]?.[pseudoIndexOf(ref)] || null;
  };
  const boundaryIndexOf = ref => Number(ref?.boundaryIndex || 0);
  const boundaryAt = (state,ref) => {
    const sentenceIndex=sentenceIndexForDisplayRef(state,ref);
    const range=state.sentenceRanges?.[sentenceIndex];
    return state.sentenceStates?.[sentenceIndex]?.boundary_items?.[ref?.boundary-range?.start]?.[boundaryIndexOf(ref)] || null;
  };
  const isArrowSourceRef = (state,ref) => boundaryAt(state,ref)?.symbol === '<'
    || isArrowSourceValue(displayValue(state,ref));

  function endpointForDisplayRef(state,ref){
    if(!ref) return null;
    const sentenceIndex=sentenceIndexForDisplayRef(state,ref);
    if(sentenceIndex < 0) return null;
    if(ref.boundary != null){
      const item=boundaryAt(state,{...ref,sentence_idx:sentenceIndex});
      if(!item) return null;
      return {sentence_idx:sentenceIndex,endpoint:item.slot
        ? {kind:'slot',slot_id:item.slot.id}
        : {kind:'boundary',boundary_id:item.id}};
    }
    const slotId=slotIdForDisplayRef(state,{...ref,sentence_idx:sentenceIndex});
    return slotId == null ? null : {sentence_idx:sentenceIndex,endpoint:{kind:'slot',slot_id:slotId}};
  }

  function displayRefForEndpoint(state,sentenceIndex,endpoint){
    if(endpoint?.kind === 'slot') return displayRefForSlotId(state,sentenceIndex,endpoint.slot_id);
    if(endpoint?.kind !== 'boundary') return null;
    const model=state.sentenceStates?.[sentenceIndex];
    const range=state.sentenceRanges?.[sentenceIndex];
    if(!model || !range) return null;
    for(const [gap,items] of Object.entries(model.boundary_items || {})){
      const index=items.findIndex(item => item.id === endpoint.boundary_id);
      if(index >= 0) return {sentence_idx:sentenceIndex,boundary:range.start+Number(gap),boundaryIndex:index,slot:null};
    }
    return null;
  }

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
      Number(Boolean(a.isCollapsed))-Number(Boolean(b.isCollapsed))
      || Math.abs(Number(a.colIdx)-currentColumn)-Math.abs(Number(b.colIdx)-currentColumn)
      || Number(a.colIdx)-Number(b.colIdx)
    );
    return clone(sameRow[0]);
  }

  function contiguousColumnRegion(columns,anchor,xAxis=null){
    const ordered=[...new Set((columns || [])
      .map(Number)
      .filter(Number.isFinite))].sort((a,b) => a-b);
    const at=ordered.indexOf(Number(anchor));
    if(at < 0) return [];
    const axis=[...new Set((xAxis || []).map(Number).filter(Number.isFinite))].sort((a,b) => a-b);
    if(axis.length){
      const selected=new Set(ordered);
      const axisAt=axis.indexOf(Number(anchor));
      if(axisAt < 0) return [];
      let start=axisAt;
      let end=axisAt;
      while(start > 0 && selected.has(axis[start-1])) start--;
      while(end < axis.length-1 && selected.has(axis[end+1])) end++;
      return axis.slice(start,end+1);
    }
    let start=at;
    let end=at;
    while(start > 0 && ordered[start-1] === ordered[start]-1) start--;
    while(end < ordered.length-1 && ordered[end+1] === ordered[end]+1) end++;
    return ordered.slice(start,end+1);
  }

  function calculateRegionHorizontalTarget({direction,current,candidates=[],xAxis=[]} = {}){
    if((direction !== 'left' && direction !== 'right') || !current) return null;
    const currentRow=Number(current.rowIdx);
    const currentColumn=Number(current.colIdx);
    if(!Number.isFinite(currentRow) || !Number.isFinite(currentColumn)) return null;
    const currentRegion=contiguousColumnRegion(current.columns,currentColumn,xAxis);
    if(!currentRegion.length) return null;
    const sign=direction === 'left' ? -1 : 1;
    const axis=[...new Set((xAxis || []).map(Number).filter(Number.isFinite))].sort((a,b) => a-b);
    let targetColumn;
    if(axis.length){
      let axisIndex=axis.indexOf(currentColumn);
      if(axisIndex < 0) return null;
      const currentColumns=new Set(currentRegion);
      do{
        axisIndex+=sign;
        targetColumn=axis[axisIndex];
      }while(Number.isFinite(targetColumn) && currentColumns.has(targetColumn));
      if(!Number.isFinite(targetColumn)) return null;
    }else{
      targetColumn=currentColumn+sign;
      const currentColumns=new Set(currentRegion);
      while(currentColumns.has(targetColumn)) targetColumn+=sign;
    }

    const eligible=(candidates || []).flatMap((candidate,index) => {
      const row=Number(candidate?.rowIdx);
      if(!Number.isFinite(row) || row > currentRow) return [];
      const region=contiguousColumnRegion(candidate?.columns,targetColumn,xAxis);
      if(!region.length) return [];
      const sameRegion=row === currentRow
        && region.length === currentRegion.length
        && region.every((column,regionIndex) => column === currentRegion[regionIndex]);
      return sameRegion ? [] : [{candidate,index,row,region}];
    });
    if(!eligible.length) return null;
    eligible.sort((left,right) =>
      right.row-left.row
      || Number(Boolean(left.candidate.isCollapsed))-Number(Boolean(right.candidate.isCollapsed))
      || left.index-right.index
    );
    const selected=eligible[0];
    return {
      ...clone(selected.candidate),
      colIdx:targetColumn,
      columns:selected.region
    };
  }

  function calculateColumnPreservingTarget({column,candidates=[]} = {}){
    const preferred=Number(column);
    if(!Number.isFinite(preferred)) return null;
    const target=(candidates || []).find(candidate =>
      (candidate?.columns || []).some(value => Number(value) === preferred)
    );
    return target ? clone(target) : null;
  }

  function calculateNormalBoundaryIndex({cursor=0,tokenCount=0,symbol=''} = {}){
    const count=Math.max(0,Number(tokenCount) || 0);
    const current=Math.max(0,Math.min(count,Number(cursor) || 0));
    const offset=[')',']','>'].includes(symbol) ? 1 : 0;
    return Math.min(count,current+offset);
  }

  function updateSelectionPath(path, candidate){
    const current=Array.isArray(path) ? path.map(clone) : [];
    if(!candidate) return current;
    if(current.length && sameDisplayRef(current[current.length-1],candidate)) return current;

    const visitedIndex=current.findIndex(ref => sameDisplayRef(ref,candidate));
    if(visitedIndex >= 0) return current.slice(0,visitedIndex+1);
    return [...current,clone(candidate)];
  }

  function removeGroup(state,groupId,sentenceIndexHint=null){
    const next=clone(state);
    const requestedSentence=Number.isSafeInteger(sentenceIndexHint) ? sentenceIndexHint : null;
    const matches=(next.sentenceStates || [])
      .map((model,index) => model.underline_groups.some(group => group.id === groupId) ? index : -1)
      .filter(index => index >= 0 && (requestedSentence == null || requestedSentence === index));
    if(matches.length !== 1) return next;
    const sentenceIndex=matches[0];
    const removed=next.sentenceStates[sentenceIndex].underline_groups.find(group => group.id === groupId);
    const removedIds=[];
    if(removed) collectSlotIds(removed.slot,removedIds);
    next.sentenceStates[sentenceIndex]=Model.removeUnderlineGroup(next.sentenceStates[sentenceIndex],groupId);
    if(next.arrowDraft?.sentence_idx === sentenceIndex
      && next.arrowDraft.endpoint?.kind === 'slot'
      && removedIds.includes(next.arrowDraft.endpoint.slot_id)) next.arrowDraft=null;
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
          const child=byId.get(member.structure);
          const port=member.port || 'single';
          if(child?.form === 'T' && (port === 'left' || port === 'right')){
            keys.add(`structure:${member.structure}:${port}`);
          }else{
            for(const key of collect(member.structure,nextVisiting)) keys.add(key);
          }
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
    const groups=sentence.groups || (sentence.structures || []).filter(item => item.kind === 'group');
    const byId=new Map(groups.map(group => [group.id,group]));
    const extentMemo=new Map();
    const groupExtent=(groupId,visiting=new Set()) => {
      if(extentMemo.has(groupId)) return extentMemo.get(groupId);
      if(visiting.has(groupId)) return {start:0,end:0};
      const next=new Set(visiting).add(groupId);
      const positions=[];
      for(const member of byId.get(groupId)?.members || []){
        if(member?.structure != null){
          const child=groupExtent(member.structure,next);
          positions.push(child.start,child.end);
        }else if(member?.pseudoToken != null){
          positions.push(Number(member.pseudoToken));
        }else if(member?.token != null){
          positions.push(Number(member.token));
        }
      }
      const extent=positions.length
        ? {start:Math.min(...positions),end:Math.max(...positions)}
        : {start:0,end:0};
      extentMemo.set(groupId,extent);
      return extent;
    };
    for(const item of createTokenSequence(tokens.length,sentence.pseudoTokens || [])){
      if(item.kind === 'pseudo-token'){
        order.push(`pseudo-token:${item.gap}:${item.index}:single`);
      }else{
        order.push(...primitiveTokenPorts(sentence,tokens[item.index],item.index)
          .map(port => `token:${item.index}:${port}`));
        const ending=groups
          .filter(group => group.form === 'T' && groupExtent(group.id).end === item.index)
          .sort((left,right) => {
            const a=groupExtent(left.id), b=groupExtent(right.id);
            return (a.end-a.start)-(b.end-b.start) || left.id-right.id;
          });
        for(const group of ending){
          order.push(`structure:${group.id}:left`,`structure:${group.id}:right`);
        }
      }
    }
    return order;
  }

  function primitiveSlotRuns(order,selected){
    const runs=[];
    let active=null;
    const usesStructureSlots=[...selected].some(key => key.startsWith('structure:'));
    for(const key of order){
      if(!usesStructureSlots && key.startsWith('structure:')) continue;
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

  // The document shell owns cross-sentence ordering. Every semantic/layout
  // operation below receives one isolated SentenceState and local companions.
  function splitSentenceStates(state){
    const source=state || createState('');
    const ranges=source.sentenceRanges || parseSentences(source.text || '').ranges;
    const sourceGroups=buildDocumentGroupDisplayViews(source);
    const groupSentenceMemo=new Map();
    const sentenceForPrimitiveRef=ref => {
      if(ref?.boundary != null) return sentenceIndexForGap(ranges,ref.boundary);
      if(ref?.gapToken != null) return sentenceIndexForGap(ranges,ref.gapToken);
      if(ref?.word != null){
        return ranges.find(range => ref.word >= range.start && ref.word < range.end)?.index ?? -1;
      }
      return -1;
    };
    const sentenceForGroup=(id,sentenceHint=null,visiting=new Set()) => {
      const matches=sourceGroups.filter(group => group.id === id
        && (sentenceHint == null || group.sentence_idx === sentenceHint));
      const group=matches.length === 1 ? matches[0] : null;
      const key=group ? `${group.sentence_idx}:${id}` : `${sentenceHint}:${id}`;
      if(groupSentenceMemo.has(key)) return groupSentenceMemo.get(key);
      if(visiting.has(key)) return -1;
      if(!group) return -1;
      const nextVisiting=new Set(visiting).add(key);
      const memberSentences=(group.childRefs || [])
        .map(member => member?.group != null
          ? sentenceForGroup(member.group,member.sentence_idx ?? group.sentence_idx,nextVisiting)
          : sentenceForPrimitiveRef(member))
        .filter(index => index >= 0);
      // Runtime-normalized groups also have segments. They are a fallback for
      // legacy states whose member list has not yet been reconstructed.
      if(!memberSentences.length){
        for(const segment of group.regions || []){
          const index=sentenceForPrimitiveRef(segment.startRef);
          if(index >= 0) memberSentences.push(index);
        }
      }
      const unique=[...new Set(memberSentences)];
      const result=unique.length === 1 ? unique[0] : -1;
      groupSentenceMemo.set(key,result);
      return result;
    };
    const sentenceForRef=ref => ref?.group != null
      ? sentenceForGroup(ref.group,ref.sentence_idx)
      : sentenceForPrimitiveRef(ref);
    return ranges.map(range => {
      const start=range.start;
      const end=range.end;
      const groups=sourceGroups.filter(group => group.sentence_idx === range.index);
      const groupIds=new Set(groups.map(group => group.id));
      const model=source.sentenceStates?.[range.index] || createSentenceStates(
        {tokens:[],ranges:[{index:0,text:'',start:0,end:0}]}
      )[0];
      const arrows=(model.arrows || []).map(arrow => ({
        from:displayRefForEndpoint(source,range.index,arrow.from),
        to:displayRefForEndpoint(source,range.index,arrow.to)
      })).filter(arrow => arrow.from && arrow.to);
      return {
        kind:'sentence_state',
        index:range.index,
        text:range.text || '',
        wordOffset:start,
        range:{...range},
        model,
        tokens:model.tokens,
        token_chain:model.token_chain,
        ownedLocalGaps:Array.from({length:end-start+1},(_,local) => local)
          .filter(local => sentenceIndexForGap(ranges,start+local) === range.index),
        group_views:groups,
        groupIds,
        arrows,
        navigationCursor:{...(source.navigationCursor || {x:null,y:null})}
      };
    });
  }

  function createInnerSentence(sentenceState){
    if(sentenceState?.kind !== 'sentence_state') throw new TypeError('expected a sentence_state');
    const offset=sentenceState.wordOffset;
    const localRef=ref => ref?.group != null
      ? {structure:ref.group,port:ref.slot || 'single'}
      : ref?.boundary != null
        ? {boundary:ref.boundary-offset,boundaryIndex:boundaryIndexOf(ref),port:'single'}
        : ref?.gapToken != null
          ? {pseudoToken:ref.gapToken-offset,pseudoIndex:pseudoIndexOf(ref),port:'single'}
          : {token:(ref?.word ?? offset)-offset,port:ref?.slot || 'single'};
    const ordered=orderedSentenceTokens(sentenceState.model);
    const sentence={tokens:ordered.map(token => {
      const slot=token.word_slot.slot;
      const base=slot.kind === 't_slot' ? slot.pre_slot : slot;
      return {slot:base.kind === 'double_slot'
        ? {kind:'double',left:markToDisplay(base.lslot.mark),right:markToDisplay(base.rslot.mark)}
        : {kind:'single',text:markToDisplay(base.mark)}};
    })};
    const structures=[];
    for(let local=0;local<ordered.length;local++){
      const slot=ordered[local].word_slot.slot;
      if(slot.kind === 't_slot') structures.push({
        kind:'verbal',token:local,form:'T',slots:{
          left:{kind:'single',text:markToDisplay(slot.pre_slot.mark)},
          right:{kind:'single',text:markToDisplay(slot.post_slot.mark)}
        }
      });
    }
    for(const group of deriveSentenceGroupDisplayViews(sentenceState.model,offset,sentenceState.index)){
      const verbal=persistentT(legacyTFromSlot(group.slot));
      const structure={
        id:group.id,
        kind:'group',
        members:(group.childRefs || []).map(localRef),
        form:verbal.on ? 'T' : 'underline',
        mark:groupMarkFromSlot(group.slot)
      };
      if(verbal.on) structure.slots=verbal.slots;
      structures.push(structure);
    }
    if(structures.length) sentence.structures=structures;

    const boundaries={};
    const boundarySlots={};
    const pseudoTokens={};
    for(let localGap=0;localGap<=sentenceState.model.token_chain.length;localGap++){
      const globalGap=offset+localGap;
      if(globalGap < sentenceState.range.start || globalGap > sentenceState.range.end) continue;
      // A token boundary shared by two lines belongs to the preceding line,
      // matching sentenceIndexForGap().
      if(!sentenceState.ownedLocalGaps.includes(localGap)) continue;
      const items=sentenceState.model.boundary_items?.[localGap] || [];
      const value=items.map(item => item.symbol).join('');
      if(value) boundaries[localGap]=value;
      const persistent=Object.fromEntries(items
        .map((item,index) => item.slot ? [index,{kind:'single',text:markToDisplay(item.slot.mark)}] : null)
        .filter(Boolean));
      if(Object.keys(persistent).length) boundarySlots[localGap]=persistent;
      const pseudos=sentenceState.model.pseudo_tokens?.[localGap] || [];
      if(pseudos.length) pseudoTokens[localGap]=pseudos.map(pseudo => ({
        text:pseudo.text,
        slot:{kind:'single',text:markToDisplay(pseudo.word_slot.slot.mark)}
      }));
    }
    if(Object.keys(boundaries).length) sentence.boundaries=boundaries;
    if(Object.keys(boundarySlots).length) sentence.boundarySlots=boundarySlots;
    if(Object.keys(pseudoTokens).length) sentence.pseudoTokens=pseudoTokens;
    if(sentenceState.model.arrows.length){
      const sentenceStates=[];
      const sentenceRanges=[];
      sentenceStates[sentenceState.index]=sentenceState.model;
      sentenceRanges[sentenceState.index]={
        index:sentenceState.index,start:offset,end:offset+sentenceState.model.token_chain.length
      };
      const documentState={sentenceStates,sentenceRanges};
      sentence.arrows=sentenceState.model.arrows.map(arrow => ({
        from:localRef(displayRefForEndpoint(documentState,sentenceState.index,arrow.from)),
        to:localRef(displayRefForEndpoint(documentState,sentenceState.index,arrow.to))
      }));
    }
    return sentence;
  }

  function createDisplaySentence(sentenceState,{lineStep=27}={}){
    if(sentenceState?.kind !== 'sentence_state') throw new TypeError('expected a sentence_state');
    const view=buildSentenceGroupView(sentenceState.model,{
      sentenceIndex:sentenceState.index,
      lineStep
    });
    const tokenLocal=new Map(sentenceState.model.token_chain.map((id,index) => [id,index]));
    const keyForSlotId=slotId => {
      const owner=view.slots_by_id.get(slotId);
      if(!owner) return null;
      const port=owner.port || 'single';
      if(owner.kind === 'token') return `token:${tokenLocal.get(owner.token_id)}:${port}`;
      if(owner.kind === 'pseudo_token') return `pseudo-token:${owner.gap}:${owner.index}:${port}`;
      if(owner.kind === 'boundary') return `boundary:${owner.gap}:${owner.index}:single`;
      return `structure:${owner.group_id}:${port}`;
    };
    const descendantMemo=new Map();
    const descendants=groupId => {
      if(descendantMemo.has(groupId)) return descendantMemo.get(groupId);
      const found=new Set();
      for(const childId of view.group_view_by_id.get(groupId)?.child_group_ids || []){
        found.add(childId);
        for(const nested of descendants(childId)) found.add(nested);
      }
      descendantMemo.set(groupId,found);
      return found;
    };
    const layouts=view.groups.map(group => {
      const primitiveSlots=group.atomic_slot_ids.map(keyForSlotId).filter(Boolean);
      const underlineSegments=group.regions.map(region => {
        const keys=region.slot_ids.map(keyForSlotId).filter(Boolean);
        return {startSlot:keys[0],endSlot:keys.at(-1),primitiveSlots:keys};
      }).filter(segment => segment.primitiveSlots.length);
      const own=new Set(group.atomic_slot_ids);
      const sharesWith=view.groups
        .filter(other => other.group_id !== group.group_id && other.atomic_slot_ids.some(id => own.has(id)))
        .map(other => other.group_id);
      const contains=view.groups
        .filter(other => other.group_id !== group.group_id
          && (descendants(group.group_id).has(other.group_id)
            || (other.atomic_slot_ids.length < own.size
              && other.atomic_slot_ids.every(id => own.has(id)))))
        .map(other => other.group_id);
      return {
        id:group.group_id,
        sentenceIdx:sentenceState.index,
        primitiveSlots,
        underlineSegments,
        sharesWith,
        contains,
        structuralDepth:group.structural_depth,
        linkColor:groupLinkColors[Math.abs(Number(group.group_id) || 0) % groupLinkColors.length],
        level:group.level,
        lineOffset:group.line_offset
      };
    });
    return {display:{groups:layouts}};
  }

  function createInnerJson(state){
    return {
      version:1,
      text:state.text || '',
      sentences:splitSentenceStates(state).map(createInnerSentence)
    };
  }

  function stateFromInnerJson(innerJson){
    const inner=clone(innerJson) || {version:1,text:'',sentences:[]};
    const state=createState(inner.text || (inner.sentences || []).map(sentence => sentence.text || '').join('\n'));
    let offset=0;
    for(const sentence of inner.sentences || []){
      for(let local=0;local<(sentence.tokens || []).length;local++){
        const token=sentence.tokens[local];
        const modelToken=tokenAtWordIndex(state,offset+local);
        if(!modelToken) continue;
        const current=modelToken.word_slot.slot;
        if(token.slot?.kind === 'double'){
          const outer=maxDocumentId(state.sentenceStates,'slot')+1;
          modelToken.word_slot.slot={
            id:outer,kind:'double_slot',
            lslot:{...current,mark:displayToMark(token.slot.left || '')},
            rslot:createAtomicSlot(outer+1,token.slot.right || '')
          };
        }else{
          current.mark=displayToMark(token.slot?.text || '');
        }
      }
      for(const structure of sentence.structures || []){
        if(structure.kind !== 'verbal') continue;
        const word=offset+(structure.token || 0);
        const modelToken=tokenAtWordIndex(state,word);
        if(!modelToken) continue;
        const current=modelToken.word_slot.slot;
        const outer=maxDocumentId(state.sentenceStates,'slot')+1;
        const pre=current.kind === 'atomic_slot'
          ? {...current,mark:displayToMark(structure.slots?.left?.text || markToDisplay(current.mark))}
          : createAtomicSlot(outer+1,structure.slots?.left?.text || '');
        const postId=current.kind === 'atomic_slot' ? outer+1 : outer+2;
        modelToken.word_slot.slot={
          id:outer,kind:'t_slot',pre_slot:pre,
          post_slot:createAtomicSlot(postId,structure.slots?.right?.text || '')
        };
      }
      const sentenceIndex=state.sentenceRanges.find(range => range.start === offset)?.index ?? 0;
      const model=state.sentenceStates[sentenceIndex];
      let nextSlotId=Math.max(-1,...Model.validateSentenceState(model).slot_ids)+1;
      let nextBoundaryId=0;
      for(const [local,value] of Object.entries(sentence.boundaries || {})){
        const gap=Number(local);
        const slots=sentence.boundarySlots?.[local] || {};
        model.boundary_items[gap]=[...String(value)].map((symbol,index) => ({
          id:nextBoundaryId++,kind:'boundary_item',symbol,
          slot:symbol === '[' ? createAtomicSlot(nextSlotId++,slots[index]?.text || '') : null
        }));
      }
      for(const [local,value] of Object.entries(sentence.pseudoTokens || {})){
        model.pseudo_tokens[Number(local)]=pseudoList(value).map(pseudo => ({
          text:String(pseudo?.text || ''),
          word_slot:{kind:'word_slot',slot:createAtomicSlot(nextSlotId++,pseudo?.slot?.text || '')}
        }));
      }
      Model.validateSentenceState(model);
      offset+=(sentence.tokens || []).length;
    }

    const legacyGroups=[];
    const legacyArrows=[];
    offset=0;
    let sentenceIndex=0;
    for(const sentence of inner.sentences || []){
      const localRef=ref => ref?.structure != null
        ? {sentence_idx:sentenceIndex,group:ref.structure,slot:ref.port === 'single' ? null : ref.port}
        : ref?.boundary != null
          ? {sentence_idx:sentenceIndex,boundary:offset+ref.boundary,boundaryIndex:Number(ref.boundaryIndex || 0),slot:null}
        : ref?.pseudoToken != null
          ? {sentence_idx:sentenceIndex,gapToken:offset+ref.pseudoToken,gapTokenIndex:Number(ref.pseudoIndex || 0),slot:null}
          : {sentence_idx:sentenceIndex,word:offset+(ref?.token || 0),slot:ref?.port === 'single' ? null : ref?.port};
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
        legacyGroups.push({
          id:structure.id,
          sentence_idx:sentenceIndex,
          members,
          segments:[],
          start:tokenWords.length ? Math.min(...tokenWords) : offset,
          end:tokenWords.length ? Math.max(...tokenWords) : offset,
          mark:structure.mark || '',
          verbal,
        });
      }
      for(const arrow of sentence.arrows || []) legacyArrows.push({sentenceIndex,from:localRef(arrow.from),to:localRef(arrow.to)});
      offset+=(sentence.tokens || []).length;
      sentenceIndex++;
    }

    const byId=new Map(legacyGroups.map(group => [group.id,group]));
    const extent=(group,visiting=new Set()) => {
      if(!group || visiting.has(group.id)) return {start:0,end:0};
      const next=new Set(visiting).add(group.id);
      const values=[];
      for(const member of group.members){
        if(member.group != null){
          const child=extent(byId.get(member.group),next);
          values.push(child.start,child.end);
        }else if(member.gapToken != null) values.push(member.gapToken);
        else if(member.boundary != null) values.push(member.boundary);
        else if(member.word != null) values.push(member.word);
      }
      if(values.length){
        group.start=Math.min(...values);
        group.end=Math.max(...values);
      }
      return {start:group.start,end:group.end};
    };
    for(const group of legacyGroups) extent(group);
    // Legacy group records exist only inside this v1 input adapter. Runtime
    // state receives the normalized SentenceState representation directly.
    readLegacyGroupsIntoSentenceStates(state,legacyGroups);
    for(const arrow of legacyArrows){
      const from=endpointForDisplayRef(state,arrow.from);
      const to=endpointForDisplayRef(state,arrow.to);
      if(from?.sentence_idx === arrow.sentenceIndex && to?.sentence_idx === arrow.sentenceIndex){
        const model=state.sentenceStates[arrow.sentenceIndex];
        model.arrows.push({from:from.endpoint,to:to.endpoint});
        Model.validateSentenceState(model);
      }
    }
    return state;
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
      navigationCursor:{x:null,y:null},
      text:String(text),
      sentenceStates:createSentenceStates(parsed),
      sentenceRanges:parsed.ranges,
      arrowDraft:null,
      arrowHistoryBefore:null,
      gapMode:false,
      gapCursor:0,
      groupSelection:null
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
      next.sentenceStates=createSentenceStates(parsed,next.sentenceStates);
      next.sentenceRanges=parsed.ranges;
      next.cursor=Math.max(0, Math.min(next.cursor, parsed.tokens.length));
      const borderPositions=calculateBorderPositions(parsed.tokens.length,documentPseudoProjection(next));
      next.gapCursor=Math.max(0, Math.min(next.gapCursor, borderPositions.length-1));
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
      const sentenceIndex=sentenceIndexForGap(next.sentenceRanges || [],gap);
      const range=next.sentenceRanges?.[sentenceIndex];
      const model=next.sentenceStates?.[sentenceIndex];
      if(!model || !range) return;
      const localGap=gap-range.start;
      const list=[...(model.pseudo_tokens?.[localGap] || [])];
      const at=Math.max(0,Math.min(list.length,Number(index) || 0));
      next.arrowDraft=rewritePseudoRefTree(next.arrowDraft,gap,at,'insert');
      next.pendingRef=rewritePseudoRefTree(next.pendingRef,gap,at,'insert');
      next.groupSelection=rewritePseudoRefTree(next.groupSelection,gap,at,'insert');
      const ids=Model.validateSentenceState(model).slot_ids;
      const slotId=ids.length ? Math.max(...ids)+1 : 0;
      list.splice(at,0,{
        text:String(pseudo?.text || ''),
        word_slot:{kind:'word_slot',slot:createAtomicSlot(slotId,pseudo?.slot?.text || '')}
      });
      model.pseudo_tokens={...model.pseudo_tokens,[localGap]:list};
      Model.validateSentenceState(model);
    });
  }

  function removePseudoToken(previous,gap,index){
    return evolve(previous,next => {
      const sentenceIndex=sentenceIndexForGap(next.sentenceRanges || [],gap);
      const range=next.sentenceRanges?.[sentenceIndex];
      const model=next.sentenceStates?.[sentenceIndex];
      if(!model || !range) return;
      const localGap=gap-range.start;
      const list=[...(model.pseudo_tokens?.[localGap] || [])];
      const at=Number(index);
      if(!Number.isInteger(at) || at < 0 || at >= list.length) return;
      next.arrowDraft=rewritePseudoRefTree(next.arrowDraft,gap,at,'remove');
      next.pendingRef=rewritePseudoRefTree(next.pendingRef,gap,at,'remove');
      next.groupSelection=rewritePseudoRefTree(next.groupSelection,gap,at,'remove');
      const removed=list[at];
      if(removed){
        const removedIds=[];
        const slot=removed.word_slot.slot;
        removedIds.push(slot.id);
        if(slot.kind === 'double_slot') removedIds.push(slot.lslot.id,slot.rslot.id);
        if(slot.kind === 't_slot') removedIds.push(slot.pre_slot.id,slot.post_slot.id);
        if(next.arrowDraft?.sentence_idx === sentenceIndex
          && next.arrowDraft.endpoint?.kind === 'slot'
          && removedIds.includes(next.arrowDraft.endpoint.slot_id)) next.arrowDraft=null;
        const cleaned=Model.removeSlotReferences(model,removedIds);
        const cleanedItems=[...(cleaned.pseudo_tokens?.[localGap] || [])];
        cleanedItems.splice(at,1);
        cleaned.pseudo_tokens={...cleaned.pseudo_tokens};
        if(cleanedItems.length) cleaned.pseudo_tokens[localGap]=cleanedItems;
        else delete cleaned.pseudo_tokens[localGap];
        Model.validateSentenceState(cleaned);
        next.sentenceStates[sentenceIndex]=cleaned;
      }
    });
  }

  function groupLocation(state,id,sentenceIndex=null){
    const matches=(state.sentenceStates || []).flatMap((model,index) => {
      if(sentenceIndex != null && sentenceIndex !== index) return [];
      const group=model.underline_groups.find(item => item.id === id);
      return group ? [{sentenceIndex:index,model,group}] : [];
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function disabledByContainingT(state, ref, exceptGroupId = null){
    const sentenceIndex=sentenceIndexForDisplayRef(state,ref);
    const model=state.sentenceStates?.[sentenceIndex];
    const slotId=slotIdForDisplayRef(state,{...ref,sentence_idx:sentenceIndex});
    if(!model || slotId == null) return false;
    const byId=new Map(model.underline_groups.map(group => [group.id,group]));
    const slotIndex=Model.buildSlotIndex(model);
    const contains=(group,target,visiting=new Set()) => {
      if(visiting.has(group.id)) return false;
      const next=new Set(visiting).add(group.id);
      return group.child_ids.some(id => {
        if(id === target) return true;
        const owner=slotIndex.get(id);
        const child=owner?.kind === 'underline_group' ? byId.get(owner.group_id) : null;
        return child ? contains(child,target,next) : false;
      });
    };
    return model.underline_groups.some(group =>
      group.id !== exceptGroupId && group.slot.kind === 't_slot' && contains(group,slotId)
    );
  }

  function refreshEnabled(previous){
    // enabled is derived from structural containment by the sentence view; it
    // is not persisted into Slot or compatibility state.
    return clone(previous);
  }

  function sameDisplayRef(left, right){
    if(!left || !right) return false;
    if(Number.isSafeInteger(left.sentence_idx) && Number.isSafeInteger(right.sentence_idx)
      && left.sentence_idx !== right.sentence_idx) return false;
    if(left.boundary != null || right.boundary != null){
      return left.boundary != null && right.boundary != null
        && left.boundary === right.boundary
        && boundaryIndexOf(left) === boundaryIndexOf(right);
    }
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

  function sentenceOfRef(state, ref,visiting=new Set()){
    if(!ref) return -1;
    if(ref.group != null){
      return sentenceIndexForDisplayRef(state,ref);
    }
    if(ref.boundary != null){
      return sentenceIndexForGap(state.sentenceRanges,ref.boundary);
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
    if(ref.boundary != null) return markToDisplay(boundaryAt(state,ref)?.slot?.mark || '');
    if(ref.gapToken != null){
      const slot=pseudoAt(state,ref)?.word_slot?.slot;
      const atomic=modelPortSlot(slot,ref.slot);
      return atomic?.kind === 'atomic_slot' ? markToDisplay(atomic.mark) : '';
    }
    if(ref.group != null){
      const location=groupLocation(state,ref.group,sentenceIndexForDisplayRef(state,ref));
      const slot=location?.group?.slot;
      const atomic=modelPortSlot(slot,ref.slot);
      return atomic?.kind === 'atomic_slot' ? markToDisplay(atomic.mark) : '';
    }
    if(disabledByContainingT(state,ref)) return '';
    const slot=wordSlotAt(state,ref.word);
    if(slot?.kind === 't_slot'){
      const atomic=ref.slot === 'left' ? slot.pre_slot : ref.slot === 'right' ? slot.post_slot : null;
      return atomic ? markToDisplay(atomic.mark) : '';
    }
    if(slot?.kind === 'double_slot'){
      const atomic=ref.slot === 'left' ? slot.lslot : ref.slot === 'right' ? slot.rslot : null;
      return atomic ? markToDisplay(atomic.mark) : '';
    }
    return slot?.kind === 'atomic_slot' && ref.slot == null ? markToDisplay(slot.mark) : '';
  }

  function validDisplayRef(state, ref){
    if(!ref) return false;
    if(ref.boundary != null){
      const boundary=boundaryAt(state,ref);
      return boundary?.symbol === '<' || Boolean(boundary?.slot);
    }
    if(ref.gapToken != null) return Boolean(pseudoAt(state,ref)?.word_slot?.slot);
    if(ref.group != null){
      const location=groupLocation(state,ref.group,sentenceIndexForDisplayRef(state,ref));
      if(!location) return false;
      const slot=location.group.slot;
      if(slot.kind === 't_slot' || slot.kind === 'double_slot'){
        return (ref.slot === 'left' || ref.slot === 'right')
          && !disabledByContainingT(state,ref,location.group.id);
      }
      return ref.slot == null && !disabledByContainingT(state,ref,location.group.id);
    }
    if(ref.word < 0 || ref.word >= orderedDocumentTokens(state).length) return false;
    if(disabledByContainingT(state,ref)) return false;
    const slot=wordSlotAt(state,ref.word);
    if(slot?.kind === 't_slot') return ref.slot === 'left' || ref.slot === 'right';
    return slot?.kind === 'double_slot'
      ? ref.slot === 'left' || ref.slot === 'right'
      : ref.slot == null;
  }

  function cleanupArrows(previous){
    return evolve(previous, next => {
      next.sentenceStates=next.sentenceStates.map((model,sentenceIndex) => {
        const copy=clone(model);
        copy.arrows=copy.arrows.filter(arrow => {
          const from=displayRefForEndpoint(next,sentenceIndex,arrow.from);
          const to=displayRefForEndpoint(next,sentenceIndex,arrow.to);
          return from && to && validDisplayRef(next,from) && validDisplayRef(next,to) && isArrowSourceRef(next,from);
        });
        Model.validateSentenceState(copy);
        return copy;
      });
      const draftRef=next.arrowDraft
        ? displayRefForEndpoint(next,next.arrowDraft.sentence_idx,next.arrowDraft.endpoint)
        : null;
      if(next.arrowDraft && (!draftRef || !validDisplayRef(next,draftRef) || !isArrowSourceRef(next,draftRef))){
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
    createDisplaySentence,
    createInnerJson,
    createInnerSentence,
    createTokenSequence,
    documentArrowProjection,
    documentBoundaryProjection,
    documentPseudoProjection,
    endpointForDisplayRef,
    displayRefForEndpoint,
    displayRefForSlotId,
    sentenceIndexForGap,
    sentenceIndexForDisplayRef,
    splitSentenceStates,
    calculateColumnPreservingTarget,
    calculateNormalBoundaryIndex,
    calculateBorderPositions,
    calculateContainedHorizontalTarget,
    calculateGridHorizontalTarget,
    calculateRegionHorizontalTarget,
    calculateHorizontalTarget,
    calculateSlotGeometry,
    createState,
    evolve,
    makeTSlot,
    makeTState,
    makeWorkSlot,
    markToDisplay,
    displayToMark,
    orderedDocumentTokens,
    orderedSentenceTokens,
    tokenAtWordIndex,
    wordSlotAt,
    atomicWordSlotForRef,
    buildSentenceGroupView,
    buildDocumentGroupDisplayViews,
    replaceWordSlotWithDouble,
    restoreWordSlotFromDouble,
    replaceWordSlotWithT,
    restoreWordSlotFromT,
    setWordSlotMark,
    slotIdForDisplayRef,
    insertPseudoToken,
    isArrowSourceRef,
    isArrowSourceValue,
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
