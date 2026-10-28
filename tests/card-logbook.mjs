import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './helpers/database.mjs';
import logbook from '../server/lib/api/logbook.js';

export async function testCardLogbook() {
  const QSL={escapeHtml:String};
  vm.runInNewContext(fs.readFileSync(new URL('../public/js/card-logbook.js',import.meta.url),'utf8'),{window:{QSL},Intl,Date,Map});
  assert.equal(QSL.cardLogbook.today(new Date('2026-10-28T15:59:59Z')),'2026-10-28');
  assert.equal(QSL.cardLogbook.today(new Date('2026-10-28T16:00:00Z')),'2026-10-29');
  assert.equal(QSL.cardLogbook.callSignFor({callSign:' ja1abc '},{callSign:'B2BBB'}),'JA1ABC');
  assert.equal(QSL.cardLogbook.callSignFor({callSign:' '},{callSign:' b2bbb '}),'B2BBB');
  assert.equal(QSL.cardLogbook.callSignFor({callSign:'',owner:{callSign:'JA1ABC/P'}}),'JA1ABC/P');
  const database=await fixture();
  const user={id:'u_card_logbook',role:'user'},other={id:'u_card_logbook_other',role:'user'};
  const route=logbook.routes.find(row=>row.method==='GET' && row.pattern==='/api/me/logbook');
  const list=(query,viewer=user)=>database.db.transaction(db=>route.handler({db,user:viewer,query:new URLSearchParams(query)}));
  try {
    await database.db.transaction(async db=>{
      const now=new Date().toISOString();
      for(const entry of [user,other])db.insert('users',{...entry,username:entry.id,email:entry.id+'@example.invalid',displayName:'测试',callSign:'B1AAA',bio:'',avatarColor:'#0eaf8f',status:'active',address:null,passwordHash:'test-only',createdAt:now,updatedAt:now});
      for(let i=0;i<31;i++){
        const callSign=i===28?'JA1ABCD':i===29?'JA1ABC/P':'JA1ABC';
        const qsoAt='2026-10-28T12:00:'+String(i).padStart(2,'0')+'.000Z';
        db.insert('contactLogs',{id:'qso_card_'+i,userId:i===30?other.id:user.id,dedupKey:'test_'+i,qsoAt,callSign,details:{callSign,qsoAt,stationCallSign:'B1AAA',band:'20M',mode:'FT8',source:'adif'},createdAt:now,updatedAt:now});
      }
      await db.save();
    },{write:true});
    await assert.rejects(list('callSign=JA1ABC',null),err=>err.status===401);
    const first=(await list('callSign= ja1abc ')).body;
    assert.equal(first.total,28);
    assert.equal(first.items.length,25);
    assert.equal(first.items[0].qsoAt,'2026-10-28T12:00:27.000Z');
    assert.ok(first.items.every(row=>row.callSign==='JA1ABC' && !Object.hasOwn(row,'userId')));
    assert.equal((await list('callSign=JA1ABC&page=2')).body.items.length,3);
    assert.equal((await list('callSign=JA1AB')).body.total,0,'prefix is not an exact match');
    assert.equal((await list('callSign=')).body.total,0,'empty exact match never exposes the full log');
    assert.equal((await list('callSign=JA1ABC%2FP')).body.total,1,'portable suffix is preserved');
    assert.equal((await list('q=JA1ABC')).body.total,30,'existing substring search remains available');
    const theirs=(await list('callSign=JA1ABC',other)).body;
    assert.equal(theirs.total,1);
    assert.equal(theirs.items[0].id,'qso_card_30');
  } finally { await database.cleanup(); }
}
