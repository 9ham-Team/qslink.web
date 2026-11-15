import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const deploy=await fs.readFile(new URL('../deployment/deploy-dev.sh',import.meta.url),'utf8');
const bootstrap=await fs.readFile(new URL('../deployment/bootstrap-dev.sh',import.meta.url),'utf8');
function run(source,values={}) {
  const env={...process.env};
  for(const key of ['QSL_DEPLOY_PROFILE','QSL_EXPECTED_REVISION','QSL_EXPECTED_REVISION_VUE3'])delete env[key];
  return spawnSync(bash,['-c',source],{encoding:'utf8',windowsHide:true,env:{...env,...values}});
}
const target='a'.repeat(40),other='b'.repeat(40);
const header=deploy.slice(0,deploy.indexOf('MAIL_ENV_FILE='));
const describe=header+'\nprintf "%s|%s|%s|%s|%s" "$TARGET_REVISION" "$IMAGE" "$APP" "$PORT" "$VOLUME"\n';
test('formal dev deployment pins generic SHA and retains isolated 44381 resources',()=>{
  const result=run(describe,{QSL_EXPECTED_REVISION:target});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,target+'|ghcr.io/9ham-team/qslink.web:sha-'+target+'|qslink-test-app-vue3|44381|qslink-test-uploads-vue3');
});
test('legacy Vue parameters still resolve to the same dev environment and generic SHA image',()=>{
  const result=run(describe,{QSL_DEPLOY_PROFILE:'vue3',QSL_EXPECTED_REVISION_VUE3:target});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,target+'|ghcr.io/9ham-team/qslink.web:sha-'+target+'|qslink-test-app-vue3|44381|qslink-test-uploads-vue3');
});
test('archive profile, invalid SHA and conflicting aliases fail before deployment commands',()=>{
  for(const values of [
    {QSL_DEPLOY_PROFILE:'dev-outdate',QSL_EXPECTED_REVISION:target},
    {QSL_EXPECTED_REVISION:'invalid'},
    {QSL_EXPECTED_REVISION:target,QSL_EXPECTED_REVISION_VUE3:other},
    {},
  ]) {
    const result=run(describe,values);assert.notEqual(result.status,0);assert.equal(result.stdout,'');
  }
});
test('bootstrap accepts canonical/legacy SHA consistently and rejects conflicting aliases',()=>{
  const source=bootstrap.slice(bootstrap.indexOf('TARGET_REVISION='),bootstrap.indexOf('exec 8>'))+'\nprintf "%s" "$TARGET_REVISION"\n';
  for(const values of [{QSL_EXPECTED_REVISION:target},{QSL_EXPECTED_REVISION_VUE3:target},{QSL_EXPECTED_REVISION:target,QSL_EXPECTED_REVISION_VUE3:target}]) {
    const result=run(source,values);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,target);
  }
  assert.notEqual(run(source,{QSL_EXPECTED_REVISION:target,QSL_EXPECTED_REVISION_VUE3:other}).status,0);
});
