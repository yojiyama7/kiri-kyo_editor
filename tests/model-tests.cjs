const assert=require('node:assert/strict');
const Model=require('../editor-model.js');

const source={
  tokens:{
    10:{
      id:10,
      text:'alpha',
      word_slot:{
        kind:'word_slot',
        slot:{
          id:100,
          kind:'double_slot',
          lslot:{id:101,kind:'atomic_slot',mark:'s'},
          rslot:{id:102,kind:'atomic_slot',mark:'v'}
        }
      }
    },
    20:{
      id:20,
      text:'beta',
      word_slot:{kind:'word_slot',slot:{id:200,kind:'atomic_slot',mark:'a'}}
    }
  },
  token_chain:[10,20],
  pseudo_tokens:{},
  boundary_items:{},
  arrows:[],
  underline_groups:[{
    id:7,
    kind:'underline_group',
    child_ids:[100,200],
    slot:{
      id:300,
      kind:'t_slot',
      pre_slot:{id:301,kind:'atomic_slot',mark:'-3'},
      post_slot:{id:302,kind:'atomic_slot',mark:'ad'}
    }
  }],
  cursor:{x:1,y:1}
};

const state=Model.createSentenceState(source);
assert.notStrictEqual(state,source);
assert.notStrictEqual(state.tokens[10],source.tokens[10]);
assert.deepEqual(Model.validateSentenceState(state),{
  slot_ids:[100,101,102,200,300,301,302],
  token_ids:[10,20],
  group_ids:[7]
});
assert.deepEqual(Model.MARKS,[
  's','v','o','c','con','pre','ap','a','ad','1','2','3','4','5','-3','-4','-5'
]);
for(const mark of ['o','c','con','pre','ap']){
  const withMark=structuredClone(source);
  withMark.tokens[10].word_slot.slot.lslot.mark=mark;
  assert.doesNotThrow(() => Model.validateSentenceState(withMark));
}
const withCustomMark=structuredClone(source);
withCustomMark.tokens[10].word_slot.slot.lslot.mark='任意標識';
assert.doesNotThrow(() => Model.validateSentenceState(withCustomMark));

const withNonStringMark=structuredClone(source);
withNonStringMark.tokens[10].word_slot.slot.lslot.mark=42;
assert.throws(
  () => Model.validateSentenceState(withNonStringMark),
  /unknown mark 42/
);

assert.throws(
  () => Model.validateSentenceState({...source,token_chain:[99]}),
  /unknown TokenId 99/
);
assert.throws(
  () => Model.validateSentenceState({...source,cursor:{x:0.25,y:1}}),
  /integer or half-integer/
);
assert.throws(
  () => Model.validateSentenceState({...source,tokens:{
    ...source.tokens,
    30:{id:30,text:'gamma',word_slot:{kind:'word_slot',slot:{id:100,kind:'atomic_slot',mark:'s'}}}
  },token_chain:[10,20,30]}),
  /duplicate SlotId 100/
);

const beforeT=Model.createSentenceState(source);
const withT=Model.replaceWordSlotWithT(beforeT,20,{
  id:400,
  post_slot:{id:401,kind:'atomic_slot',mark:'ad'}
});
assert.deepEqual(withT.tokens[10].word_slot.slot,{
  id:100,
  kind:'double_slot',
  lslot:{id:101,kind:'atomic_slot',mark:'s'},
  rslot:{id:102,kind:'atomic_slot',mark:'v'}
});
assert.deepEqual(withT.tokens[20].word_slot.slot,{
  id:400,
  kind:'t_slot',
  pre_slot:source.tokens[20].word_slot.slot,
  post_slot:{id:401,kind:'atomic_slot',mark:'ad'}
});
assert.deepEqual(beforeT,source);
assert.deepEqual(Model.restoreWordSlotFromT(withT,20),source);
assert.throws(
  () => Model.replaceWordSlotWithT(beforeT,10,{
    id:500,
    post_slot:{id:501,kind:'atomic_slot',mark:'ad'}
  }),
  /must contain an AtomicSlot/
);

const tReferencedByGroup=structuredClone(withT);
tReferencedByGroup.underline_groups[0].child_ids=[400,401];
const restoredReferenced=Model.restoreWordSlotFromT(tReferencedByGroup,20);
assert.deepEqual(restoredReferenced.underline_groups[0].child_ids,[200]);

const atomicState={
  tokens:{1:{id:1,text:'word',word_slot:{kind:'word_slot',slot:{id:10,kind:'atomic_slot',mark:'s'}}}},
  token_chain:[1],pseudo_tokens:{},boundary_items:{},arrows:[],underline_groups:[],cursor:{x:0,y:1}
};
const doubled=Model.replaceWordSlotWithDouble(atomicState,1);
assert.equal(doubled.tokens[1].word_slot.slot.kind,'double_slot');
assert.deepEqual(doubled.tokens[1].word_slot.slot.lslot,atomicState.tokens[1].word_slot.slot);
assert.deepEqual(Model.restoreWordSlotFromDouble(doubled,1),atomicState);
assert.equal(Model.markToDisplay('con'),'接');
assert.equal(Model.displayToMark('同格'),'ap');
assert.equal(Model.markToDisplay('任意標識'),'任意標識');

const groupState={
  tokens:{1:{id:1,text:'word',word_slot:{kind:'word_slot',slot:{id:10,kind:'atomic_slot',mark:''}}}},
  token_chain:[1],pseudo_tokens:{},boundary_items:{},arrows:[],
  underline_groups:[{id:4,kind:'underline_group',child_ids:[10],slot:{id:20,kind:'atomic_slot',mark:'v'}}],
  cursor:{x:0,y:2}
};
const groupT=Model.replaceUnderlineGroupSlotWithT(groupState,4);
assert.equal(groupT.underline_groups[0].slot.id,20);
assert.equal(groupT.underline_groups[0].slot.kind,'t_slot');
assert.equal(groupT.underline_groups[0].slot.pre_slot.mark,'v');
assert.deepEqual(Model.restoreUnderlineGroupSlotFromT(groupT,4),groupState);
const groupDouble=Model.replaceUnderlineGroupSlotWithDouble(groupState,4);
assert.equal(groupDouble.underline_groups[0].slot.id,20);
assert.deepEqual(Model.restoreUnderlineGroupSlotFromDouble(groupDouble,4),groupState);
assert.equal(Model.buildSlotIndex(groupState).get(20).group_id,4);

const createdGroup=Model.createUnderlineGroup(groupState,[10],9);
assert.equal(createdGroup.underline_groups.at(-1).id,9);
assert.deepEqual(createdGroup.underline_groups.at(-1).child_ids,[10]);
const markedGroup=Model.setUnderlineGroupMark(createdGroup,9,'single','con');
assert.equal(markedGroup.underline_groups.at(-1).slot.mark,'con');
const rewrittenGroup=Model.setUnderlineGroupChildIds(createdGroup,9,[20]);
assert.deepEqual(rewrittenGroup.underline_groups.at(-1).child_ids,[20]);
const prunedGroup=Model.removeSlotReferences(createdGroup,[10]);
assert.equal(prunedGroup.underline_groups.some(group => group.id === 9),false);

const cyclic=structuredClone(groupState);
cyclic.underline_groups.push({id:5,kind:'underline_group',child_ids:[20],slot:{id:30,kind:'atomic_slot',mark:''}});
cyclic.underline_groups[0].child_ids=[30];
assert.throws(() => Model.validateSentenceState(cyclic),/cyclic underline group/);

const nestedGroups=structuredClone(groupState);
nestedGroups.underline_groups.push({id:5,kind:'underline_group',child_ids:[20],slot:{id:30,kind:'atomic_slot',mark:''}});
const removedGroup=Model.removeUnderlineGroup(nestedGroups,4);
assert.deepEqual(removedGroup.underline_groups,[{
  id:5,kind:'underline_group',child_ids:[10],slot:{id:30,kind:'atomic_slot',mark:''}
}]);

let auxiliary=Model.appendBoundaryItem(atomicState,0,'<');
auxiliary=Model.appendBoundaryItem(auxiliary,0,'[');
assert.deepEqual(auxiliary.boundary_items[0].map(item => ({
  id:item.id,kind:item.kind,symbol:item.symbol,hasSlot:Boolean(item.slot)
})),[
  {id:0,kind:'boundary_item',symbol:'<',hasSlot:false},
  {id:1,kind:'boundary_item',symbol:'[',hasSlot:true}
]);
const bracketSlotId=auxiliary.boundary_items[0][1].slot.id;
auxiliary=Model.setBoundaryMark(auxiliary,1,'s');
assert.equal(auxiliary.boundary_items[0][1].slot.mark,'s');
auxiliary=Model.addArrow(auxiliary,{kind:'boundary',boundary_id:0},{kind:'slot',slot_id:10});
auxiliary=Model.addArrow(auxiliary,{kind:'slot',slot_id:bracketSlotId},{kind:'slot',slot_id:10});
assert.equal(auxiliary.arrows.length,2);
const withoutLessThan=Model.removeBoundaryItem(auxiliary,0,0);
assert.equal(withoutLessThan.arrows.length,1);
const withoutBoundaries=Model.clearBoundaryItems(withoutLessThan,0);
assert.deepEqual(withoutBoundaries.boundary_items,{});
assert.deepEqual(withoutBoundaries.arrows,[]);
const duplicateBoundaryIds=structuredClone(auxiliary);
duplicateBoundaryIds.boundary_items[0][1].id=0;
assert.throws(() => Model.validateSentenceState(duplicateBoundaryIds),/duplicate BoundaryItemId/);
assert.throws(() => Model.validateSentenceState({
  ...atomicState,
  arrows:[{from:{kind:'slot',slot_id:999},to:{kind:'slot',slot_id:10}}]
}),/unknown SlotId 999/);
assert.throws(() => Model.validateSentenceState({
  ...atomicState,
  boundary_items:{2:[]}
}),/gap exceeds token count/);
assert.throws(() => Model.validateSentenceState({
  ...atomicState,
  arrows:[
    {from:{kind:'slot',slot_id:10},to:{kind:'slot',slot_id:10}},
    {from:{kind:'slot',slot_id:10},to:{kind:'slot',slot_id:10}}
  ]
}),/duplicate arrow source/);

console.log('model tests passed');
