const { chromium } = require('playwright'); const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8080/lab.html');await p.locator('#unlock').click();await p.waitForTimeout(300);
await p.locator('#clipLoad').click();await p.waitForFunction(()=>document.querySelector('#clipLoad').textContent==='Clips chargés',null,{timeout:15000});
await p.locator('#clockCheck').click();await p.waitForTimeout(500);
let st=await p.locator('#audioStats').innerText();console.log(st.split('\n').slice(0,4).join(' | '));assert.match(st,/sain/);
// simuler un moteur zombie : horloge figée malgré "running"
await p.evaluate(()=>{const c=__labo.ctx;Object.defineProperty(c,'currentTime',{get:()=>1.234});});
await p.locator('#clockCheck').click();await p.waitForTimeout(500);
assert.ok(await p.locator('#reactivate').isVisible(),'bouton réactiver visible');console.log((await p.locator('#sessionNote').innerText()).split('\n')[1]);
await p.locator('#reactivate').click();await p.waitForTimeout(1500);
st=await p.locator('#audioStats').innerText();console.log(st.split('\n').slice(0,4).join(' | '));assert.match(st,/sain/);assert.match(st,/1 fois/);
assert.ok(await p.locator('#reactivate').isHidden());
// zombie puis test : ensureAudio doit recréer
await p.evaluate(()=>{const c=__labo.ctx;Object.defineProperty(c,'currentTime',{get:()=>2});});
await p.locator('#clockCheck').click();await p.waitForTimeout(500);
await p.locator('#clipCount').click();await p.waitForTimeout(1200);
console.log(await p.evaluate(()=>__labo.R.audio.recreations.map(r=>r.reason+' '+r.clipsRedecoded+' clips').join(' ; ')));
const rep=await p.evaluate(()=>__labo.buildReport());console.log(rep.split('\n').filter(l=>/Horloge|Moteur audio|rapport labo/.test(l)).join('\n'));
assert.deepEqual(errs,[]);await b.close();console.log('OK labo');})().catch(e=>{console.error(e);process.exit(1)});
