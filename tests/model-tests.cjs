const assert=require('node:assert/strict');
const Model=require('../editor-model.js');

const source={
  tokens:{
    10:{
      id:10,
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
      word_slot:{kind:'word_slot',slot:{id:200,kind:'atomic_slot',mark:'a'}}
    }
  },
  token_chain:[10,20],
  underline_groups:[{
    kind:'underline_group',
    child_ids:[100,200],
    slot:{
      id:300,
      kind:'t_slot',
      pre_slot:{id:301,kind:'atomic_slot',mark:'-3'},
      post_slot:{id:302,kind:'atomic_slot',mark:'ad'}
    }
  }],
  cursor:102
};

const state=Model.createSentenceState(source);
assert.notStrictEqual(state,source);
assert.notStrictEqual(state.tokens[10],source.tokens[10]);
assert.deepEqual(Model.validateSentenceState(state),{
  slot_ids:[100,101,102,200,300,301,302],
  token_ids:[10,20]
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
  () => Model.validateSentenceState({...source,cursor:99}),
  /unknown SlotId 99/
);
assert.throws(
  () => Model.validateSentenceState({...source,tokens:{
    ...source.tokens,
    30:{id:30,word_slot:{kind:'word_slot',slot:{id:100,kind:'atomic_slot',mark:'s'}}}
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
tReferencedByGroup.cursor=401;
const restoredReferenced=Model.restoreWordSlotFromT(tReferencedByGroup,20);
assert.deepEqual(restoredReferenced.underline_groups[0].child_ids,[200]);
assert.equal(restoredReferenced.cursor,200);

console.log('model tests passed');
