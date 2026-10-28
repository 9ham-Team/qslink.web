import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { parseTq8, MAX_COMPRESSED, MAX_EXPANDED } from '../server/lib/tq8.js';
import { tq8Fixture } from './helpers/tq8.mjs';

export function testTq8() {
  const f=tq8Fixture();
  const qso={CALL:'JA1ABC',BAND:'20m',MODE:'FT8',QSO_DATE:'20261028',TIME_ON:'1234',FREQ:'14.074',NAME:'<img onerror=alert(1)>'};
  for(const version of ['1.0','2.0']){
    const parsed=parseTq8(f.make([qso],version),' b1aaa ',f.trust);
    assert.equal(parsed.records[0].STATION_CALLSIGN,'B1AAA');
    assert.equal(parsed.records[0].QSO_DATE,'20261028');
    assert.equal(parsed.records[0].TIME_ON,'123400');
    assert.equal(parsed.records[0].FREQ,'14.074');
    assert.equal(parsed.records[0].NAME,undefined);
    assert.equal(parsed.records[0].LOTW_QSL_RCVD,undefined,'unsigned confirmation flag is ignored');
  }
  const text=f.text([qso]);
  const wrappedCertificate=f.leaf.raw.toString('base64').match(/.{1,64}/g).join('\n')+'\n';
  const typed=text.replace(/<CERTIFICATE:\d+>[^\n]+\n/,`<CERTIFICATE:${Buffer.byteLength(wrappedCertificate)}>${wrappedCertificate}\n`).replace(/(<SIGN_LOTW_V2\.0:\d+)>/,'$1:6>');
  assert.equal(parseTq8(f.encode(typed),'B1AAA',f.trust).records.length,1,'TQSL multiline DER base64 and type-6 signature fields');
  const rejects = (encoded,call='B1AAA',trust=f.trust) => assert.throws(()=>parseTq8(encoded,call,trust),err=>err.status===400 && !!err.fields.tq8);
  rejects(f.make([qso]),'B2BBB');
  assert.throws(()=>parseTq8(f.make([qso]),'B1AAA'),err=>err.status===400,'test certificates must not be trusted by the production route');
  rejects(Buffer.from('<CALL:6>JA1ABC<EOR>').toString('base64'));
  rejects('invalid%%%');
  rejects(Buffer.from([0x1f,0x8b,1,2,3]).toString('base64'));
  rejects(f.encode(text.slice(0,-7)));
  rejects(f.encode(text.replace('<CALL:6>JA1ABC','<CALL:6>JA2ABC')));
  rejects(f.encode(text.replaceAll('JA1ABC','JA2ABC')),'B1AAA'); // both QSO and SIGNDATA changed
  rejects(f.encode(text.replace('<CQZ:2>24','<CQZ:2>25')));
  rejects(f.encode(text.replace('<STATION_UID:1>1','<STATION_UID:1>9')));
  rejects(f.encode(text.replace('SIGN_LOTW_V2.0','SIGN_LOTW_V9.0')));
  rejects(f.encode(text.replace('<FREQ:6>14.074','<FREQ:6>14.074\n<FREQ:6>14.074')));
  rejects(f.encode(text.replace(/<SIGN_LOTW_V2\.0:\d+>[^\n]+\n/,'')));
  rejects(f.encode(text.replace('tCERT','tOTHER')));
  rejects(f.encode(text.replace(/<CERTIFICATE:\d+>[^\n]+\n/,'')));
  const expired=tq8Fixture({expired:true});
  rejects(expired.make([qso]),'B1AAA',expired.trust);
  const foreign=tq8Fixture({callSign:'B2BBB'});
  rejects(foreign.make([qso]),'B1AAA',foreign.trust);
  assert.throws(()=>parseTq8(Buffer.alloc(MAX_COMPRESSED+1,1).toString('base64'),'B1AAA',f.trust),err=>err.status===413);
  assert.throws(()=>parseTq8(gzipSync(Buffer.alloc(MAX_EXPANDED+1,32)).toString('base64'),'B1AAA',f.trust),err=>err.status===413);
}
