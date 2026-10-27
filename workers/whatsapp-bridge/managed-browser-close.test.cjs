const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {closeManagedClient,matchesProfile}=require('./managed-browser-close.cjs');
const profile=path.resolve('whatsapp_auth/session-jpmassagem');
const processFor=(overrides={})=>({pid:123,spawnfile:'chrome.exe',spawnargs:['chrome.exe','--user-data-dir='+profile],exitCode:null,signalCode:null,...overrides});
test('only matches the exact managed profile, not a prefix or a different application',()=>{
 assert.equal(matchesProfile(processFor(),profile),true);
 assert.equal(matchesProfile(processFor({spawnargs:['--user-data-dir='+profile+'-personal']}),profile),false);
 assert.equal(matchesProfile(processFor({spawnfile:'node.exe'}),profile),false);
 assert.equal(matchesProfile(null,profile),false);
});
test('forces only the captured managed browser when destroy hangs',async()=>{
 const child=processFor();let killed;
 await closeManagedClient({pupBrowser:{process:()=>child},destroy:()=>new Promise(()=>{})},profile,{graceMs:5,terminate:async value=>{killed=value.pid;}});
 assert.equal(killed,123);
});
test('does not kill a browser that has already exited gracefully',async()=>{
 const child=processFor();let kills=0;
 await closeManagedClient({pupBrowser:{process:()=>child},destroy:async()=>{child.exitCode=0;}},profile,{terminate:async()=>kills++});
 assert.equal(kills,0);
});
test('refuses to terminate a personal browser even if destroy fails',async()=>{
 let kills=0;const child=processFor({spawnargs:['--user-data-dir='+path.resolve('personal-browser')]});
 await closeManagedClient({pupBrowser:{process:()=>child},destroy:async()=>{throw Error('Disconnected');}},profile,{terminate:async()=>kills++});
 assert.equal(kills,0);
});
test('handles a client that failed before creating a browser',async()=>{
 await closeManagedClient({destroy:async()=>{}},profile);
 await closeManagedClient(null,profile);
});
