// Run with Electron: electron tests/viewer-smoke.cjs
const {app,BrowserWindow,protocol}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createResourceHandler}=require('../desktop/resources.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'stratscope',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
app.setPath('userData',path.resolve(__dirname,'../.smoke-profile'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  const handler=createResourceHandler(path.resolve(__dirname,'../web'));
  const demoArg=process.argv.indexOf('--demo');
  const demoPath=demoArg<0?null:path.resolve(process.argv[demoArg+1]);
  protocol.handle('stratscope',request=>demoPath&&new URL(request.url).pathname==='/__test_fixture.dem'?new Response(fs.readFileSync(demoPath)):handler(request));
  const errors=[];
  const win=new BrowserWindow({show:true,width:1480,height:960,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  win.webContents.on('render-process-gone',(_e,d)=>errors.push(JSON.stringify(d)));
  const evaluate=code=>win.webContents.executeJavaScript(code);
  await win.loadURL('stratscope://viewer/index.html');
  await evaluate(`document.querySelector('#sample-button, [id="load-sample"], [id="sample"]').click()`);
  let loaded=false;
  for(let i=0;i<100;i++){loaded=await evaluate(`!document.getElementById('scouting').hidden && document.querySelectorAll('.player-row').length===10`);if(loaded)break;await sleep(100);}
  if(!loaded)console.error(JSON.stringify({errors,state:await evaluate(`({toast:document.getElementById('toast').textContent,roster:document.querySelectorAll('.player-row').length})`)}));
  assert.ok(loaded,'sample loads, scouting visible, ten player loadouts');
  assert.equal(await evaluate(`document.querySelectorAll('[data-round]').length`),9,'nine visible round controls');
  assert.ok(await evaluate(`document.querySelector('[data-round]').getBoundingClientRect().height>=20 && document.getElementById('rounds').getBoundingClientRect().height>=20`),'round buttons are visible, not collapsed');
  const count=await evaluate(`document.querySelectorAll('[data-scout-round]').length`);
  assert.ok(count>0,'representative or special rounds available');
  await evaluate(`document.getElementById('special-rounds-toggle').click()`);
  assert.equal(await evaluate(`document.getElementById('special-rounds').hidden`),true);
  await evaluate(`document.getElementById('special-rounds-toggle').click()`);
  for(const key of ['weaponIcons','armorIcons','grenadeIcons']){
    assert.equal(await evaluate(`document.getElementById('${key}-toggle').checked`),true);
    await evaluate(`document.getElementById('${key}-toggle').click()`);
    assert.deepEqual(await evaluate(`['weaponIcons','armorIcons','grenadeIcons'].map(k=>document.getElementById(k+'-toggle').checked)`),['weaponIcons','armorIcons','grenadeIcons'].map(k=>k!==key),'icon layers toggle independently');
    await evaluate(`document.getElementById('${key}-toggle').click()`);
  }
  await evaluate(`document.querySelector('[data-heatmap="2"]').click();document.querySelector('[data-heatmap="3"]').click()`);
  await sleep(200);
  assert.equal(await evaluate(`document.querySelectorAll('[data-heatmap][aria-pressed="true"]').length`),2);
  const target=await evaluate(`Number(document.querySelector('[data-scout-round]').dataset.scoutRound)+1`);
  await evaluate(`document.querySelector('[data-scout-round]').click()`);
  await sleep(300);
  assert.equal(await evaluate(`document.getElementById('play').getAttribute('aria-label')`),'Pause');
  assert.equal(await evaluate(`document.getElementById('round-label').textContent`),`ROUND ${String(target).padStart(2,'0')}`,'representative playback navigates');
  await evaluate(`document.getElementById('play').click()`);
  if(demoPath){
    await evaluate(`(async()=>{const bytes=await(await fetch('/__test_fixture.dem')).arrayBuffer();const transfer=new DataTransfer();transfer.items.add(new File([bytes],'public-test.dem'));const input=document.getElementById('demo-file');input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`);
    let imported=false;
    for(let i=0;i<600;i++){imported=await evaluate(`document.getElementById('file-name').textContent==='public-test.dem' && document.getElementById('loading').hidden`);if(imported)break;await sleep(100);}
    assert.ok(imported,'real demo imported through viewer worker');
    assert.equal(await evaluate(`document.querySelectorAll('.player-row').length`),10);
  }
  fs.mkdirSync(path.resolve(__dirname,'../verification'),{recursive:true});
  await sleep(500);
  fs.writeFileSync(path.resolve(__dirname,'../verification/viewer.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(920,760);
  await sleep(200);
  assert.ok(await evaluate(`getComputedStyle(document.querySelector('.right-panel')).display!=='none'`),'loadouts remain accessible at minimum desktop width');
  assert.deepEqual(errors,[],'no renderer errors');
  console.log(JSON.stringify({loaded,scoutingButtons:count,heatmaps:true,playback:true,workerImport:Boolean(demoPath),rendererErrors:errors}));
  app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
