// Separate debugger-root retention from strong paths in the application.
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const root=path.resolve(process.argv[2] || 'artifacts/frontend-benchmark');
const results=[];
for(const version of ['legacy','vue']) for(const stage of ['before','after']) {
  const heap=JSON.parse(gunzipSync(await fs.readFile(path.join(root,`${version}-${stage}.heapsnapshot.gz`))));
  const fields=heap.snapshot.meta.node_fields;
  const stride=fields.length, edgeStride=heap.snapshot.meta.edge_fields.length;
  const count=heap.nodes.length/stride;
  const edgeTypes=heap.snapshot.meta.edge_types[0];
  const nameIndex=fields.indexOf('name'), detachedIndex=fields.indexOf('detachedness');
  const edgeCountIndex=fields.indexOf('edge_count'),sizeIndex=fields.indexOf('self_size');
  const offsets=new Uint32Array(count+1);
  let offset=0;
  for(let node=0;node<count;node++) {offsets[node]=offset;offset+=heap.nodes[node*stride+edgeCountIndex]*edgeStride;}
  offsets[count]=offset;
  const reachable=new Uint8Array(count),queue=[0];reachable[0]=1;
  for(let i=0;i<queue.length;i++) {
    const node=queue[i];
    for(let edge=offsets[node];edge<offsets[node+1];edge+=edgeStride) {
      const type=edgeTypes[heap.edges[edge]];
      const name=['element','hidden'].includes(type)?'':heap.strings[heap.edges[edge+1]];
      // Exclude only debugger console handles, not application properties.
      if(type==='weak' || /DevTools console/.test(name))continue;
      const target=heap.edges[edge+2]/stride;
      if(!reachable[target]) {reachable[target]=1;queue.push(target);}
    }
  }
  let totalDetached=0,detachedReachableWithoutConsoleRoots=0;
  let detachedEditorForms=0,editorFormsReachableWithoutConsoleRoots=0,reachableSelfBytes=0;
  for(let node=0;node<count;node++) {
    if(reachable[node])reachableSelfBytes+=heap.nodes[node*stride+sizeIndex];
    if(detachedIndex<0 || heap.nodes[node*stride+detachedIndex]!==2)continue;
    totalDetached++;
    if(reachable[node])detachedReachableWithoutConsoleRoots++;
    if(heap.strings[heap.nodes[node*stride+nameIndex]].includes('fEditorForm')) {
      detachedEditorForms++;
      if(reachable[node])editorFormsReachableWithoutConsoleRoots++;
    }
  }
  results.push({version,stage,totalDetached,detachedReachableWithoutConsoleRoots,detachedEditorForms,editorFormsReachableWithoutConsoleRoots,reachableSelfBytes});
}
await fs.writeFile(path.join(root,'heap-root-analysis.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
