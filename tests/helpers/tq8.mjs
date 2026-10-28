// Synthetic certificates and keys are generated in memory for each run; no real
// callsign certificate, private key or personal log is part of these fixtures.
import { generateKeyPairSync, sign, X509Certificate } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const wrap = (tag, value) => {
  const b = Buffer.from(value), n = b.length;
  const size = n < 128 ? Buffer.from([n]) : Buffer.from(n < 256 ? [0x81,n] : [0x82,n >> 8,n & 255]);
  return Buffer.concat([Buffer.from([tag]),size,b]);
};
const seq = (...v) => wrap(0x30, Buffer.concat(v));
function oid(value) {
  const numbers = value.split('.').map(Number), bytes = [40 * numbers[0] + numbers[1]];
  for (const n of numbers.slice(2)) {
    const part = [n & 127]; let rest = Math.floor(n / 128);
    while (rest) { part.unshift((rest & 127) | 128); rest = Math.floor(rest / 128); }
    bytes.push(...part);
  }
  return wrap(6,Buffer.from(bytes));
}
const attr = (name,value) => wrap(0x31,seq(oid(name),wrap(12,Buffer.from(value))));
const dn = (cn,call) => seq(attr('2.5.4.3',cn), ...(call ? [attr('1.3.6.1.4.1.12348.1.1',call)] : []));
const algorithm = seq(oid('1.2.840.113549.1.1.11'),wrap(5,Buffer.alloc(0)));
const key = () => generateKeyPairSync('rsa',{modulusLength:2048});
function cert(pair,subject,issuer,issuerKey,ca=false,expired=false) {
  const validity = seq(wrap(0x17,Buffer.from('250101000000Z')),wrap(0x17,Buffer.from(expired ? '250102000000Z' : '450101000000Z')));
  const basic = ca ? seq(wrap(1,Buffer.from([255]))) : seq();
  const extensions = wrap(0xa3,seq(seq(oid('2.5.29.19'),wrap(1,Buffer.from([255])),wrap(4,basic))));
  const tbs = seq(wrap(0xa0,wrap(2,Buffer.from([2]))),wrap(2,Buffer.from([1])),algorithm,issuer,validity,subject,pair.publicKey.export({type:'spki',format:'der'}),extensions);
  return new X509Certificate(seq(tbs,algorithm,wrap(3,Buffer.concat([Buffer.from([0]),sign('sha256',tbs,issuerKey)]))));
}
const field = (name,value) => `<${name}:${Buffer.byteLength(value)}>${value}\n`;
const block = raw => Object.entries(raw).map(([k,v])=>field(k,String(v))).join('')+'<eor>\n';
export function tq8Fixture({ callSign='B1AAA', expired=false }={}) {
  const rootKey=key(), intermediateKey=key(), leafKey=key();
  const rootName=dn('QSLink TEST Root'), intermediateName=dn('QSLink TEST Intermediate');
  const root=cert(rootKey,rootName,rootName,rootKey.privateKey,true);
  const intermediate=cert(intermediateKey,intermediateName,rootName,rootKey.privateKey,true);
  const leaf=cert(leafKey,dn('QSLink TEST Callsign',callSign),intermediateName,intermediateKey.privateKey,false,expired);
  const station={REC_TYPE:'tSTATION',STATION_UID:'1',CERT_UID:'1',CALL:callSign,GRIDSQUARE:'PM00AA',CQZ:'24',ITUZ:'44'};
  function text(raws,version='2.0') {
    let result=field('TQSL_IDENT','QSLink synthetic TQSL test Lib: V2.8 Config: V11.34 AllowDupes: false')+block({REC_TYPE:'tCERT',CERT_UID:'1',CERTIFICATE:leaf.raw.toString('base64')})+block(station);
    for(const raw of raws){
      const date=raw.QSO_DATE || '', time=(raw.TIME_ON || '').padEnd(6,'0');
      const contact={REC_TYPE:'tCONTACT',STATION_UID:'1',CALL:raw.CALL,BAND:raw.BAND,MODE:raw.MODE,
        QSO_DATE:date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8),QSO_TIME:time.slice(0,2)+':'+time.slice(2,4)+':'+time.slice(4,6)};
      for(const k of ['BAND_RX','FREQ','FREQ_RX','PROP_MODE','SAT_NAME'])if(raw[k])contact[k]=raw[k];
      const signed=('24PM00AA44'+(contact.BAND || '')+(contact.BAND_RX || '')+(contact.CALL || '')+(contact.FREQ || '')+(contact.FREQ_RX || '')+(contact.MODE || '')+(contact.PROP_MODE || '')+contact.QSO_DATE+contact.QSO_TIME+(contact.SAT_NAME || '')).toUpperCase();
      contact['SIGN_LOTW_V'+version]=sign('sha1',Buffer.from(signed),leafKey.privateKey).toString('base64');
      contact.SIGNDATA=signed;
      // Deliberately unsigned extras must never gain the status of signed data.
      contact.LOTW_QSL_RCVD='Y'; contact.NAME=raw.NAME || 'Unsigned name';
      result+=block(contact);
    }
    return result;
  }
  const encode = text => gzipSync(Buffer.from(text)).toString('base64');
  return { trust:{roots:[root],intermediates:[intermediate]}, leaf, text, encode, make:(raws,version)=>encode(text(raws,version)) };
}
