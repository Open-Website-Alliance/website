// Browser-native release QA; no npm/browser automation dependencies.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=process.env.OWA_EVIDENCE || path.join(root,'qa-reports');
const site=path.resolve(process.env.OWA_SITE || root);
const basePath=process.env.OWA_BASE_PATH || '/';
const routes=['index.html','charter.html','membership-process.html','privacy.html','404.html'];
if(!/^\/(?:[A-Za-z0-9_.-]+\/)*$/.test(basePath)||basePath.split('/').some(p=>p==='.'||p==='..'))throw new Error('Unsafe test mount');
// Read-only inventory: this suite never generates or rewrites website files.
function fileManifest(){
 const paths=[];
 const walk=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Symlink in website');if(entry.isDirectory())walk(file);else if(entry.isFile())paths.push(path.relative(site,file));else throw new Error('Non-regular website entry');}};
 for(const name of [...routes,'robots.txt','CNAME','assets','images']){const file=path.join(site,name),stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw new Error('Symlink in website');if(stat.isDirectory())walk(file);else if(stat.isFile())paths.push(name);else throw new Error('Non-regular website entry');}
 const files=paths.sort().map(relative=>{const data=fs.readFileSync(path.join(site,relative));return {path:relative,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};});
 return {files,fileCount:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0)};
}
function verifiedManifestDigest(){return createHash('sha256').update(JSON.stringify(fileManifest())).digest('hex');}
const testedManifest=fileManifest();
const runtimePaths=new Set(testedManifest.files.map(file=>path.resolve(site,file.path)));
const testedManifestSha256=createHash('sha256').update(JSON.stringify(testedManifest)).digest('hex');
const {memberProfiles:socialProfiles,memberLogos:logoVariants,documentAnchors}=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures.json'),'utf8'));
const noJS=process.argv.includes('--no-js');
const dark=process.argv.includes('--dark');
const focusOnly=process.argv.includes('--focus-regressions');
const suffix=(dark?'-dark':'')+(noJS?'-no-js':'')+(focusOnly?'-focus':'');
const axeSource=fs.readFileSync(process.env.AXE_PATH || path.join(root,'test-assets/axe.min.js'),'utf8');
if(createHash('sha256').update(axeSource).digest('hex')!=='20c09fe157a8a34a30e241aaa1fcdade657734f08ab379ecfbeb7d45cc46e878')throw new Error('Unverified axe dependency');
const out=path.join(evidence,'screenshots');fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(),'owa-build-ff-'));
fs.writeFileSync(path.join(profile,'user.js'),`user_pref("ui.systemUsesDarkTheme", ${dark?1:0});\nuser_pref("layout.css.prefers-color-scheme.content-override", 2);\n${noJS?'user_pref("javascript.enabled", false);\n':''}`);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
let denyFonts=false, deniedFonts=0, probeRan=false;
const themeScriptPaths=new Set();let denyTheme=false,deniedTheme=0;
const server=http.createServer((request,response)=>{
 try{
  const pathname=new URL(request.url,'http://localhost').pathname;
  if(!pathname.startsWith(basePath)){response.writeHead(404);response.end('Outside the mounted site');return;}
  if(pathname===basePath+'__javascript_probe__.html'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(`<!doctype html><title>Test-only JavaScript probe</title><link rel="icon" href="${basePath}images/logos/OWA%20logo.png"><p>Test fixture, not application content.</p><script>new Image().src=${JSON.stringify(basePath+'__javascript_executed__')};</script>`);return;}
  if(pathname===basePath+'__javascript_executed__'){probeRan=true;response.writeHead(204);response.end();return;}
  let relative=decodeURIComponent(pathname.slice(basePath.length))||'index.html';
  let target=path.resolve(site,relative);let status=200;
  if(!target.startsWith(site+path.sep)) {response.writeHead(403);response.end();return;}
  if(!fs.existsSync(target)&&!path.extname(relative)&&fs.existsSync(target+'.html'))target+='.html';
  if(denyFonts&&target.endsWith('.woff2')){deniedFonts++;response.writeHead(404,{'Cache-Control':'no-store'});response.end();return;}
  if(denyTheme&&themeScriptPaths.has(pathname)){deniedTheme++;response.writeHead(503,{'Content-Type':'text/javascript','Cache-Control':'no-store'});response.end();return;}
  if(!runtimePaths.has(target)||!fs.existsSync(target)||!fs.statSync(target).isFile()){target=path.join(site,'404.html');status=404;}
  response.writeHead(status,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});response.end(fs.readFileSync(target));
 }catch{response.writeHead(500);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}${basePath}`;
for(const relative of ['.git/config','README.md','CONTRIBUTING.md','test-assets/axe.min.js','tests/browser-qa.mjs']){const response=await fetch(base+relative);if(response.status!==404||await response.text()!==fs.readFileSync(path.join(site,'404.html'),'utf8')){server.close();throw new Error('Development file exposed by preview server: '+relative);}}
const ff=spawn(process.env.FIREFOX_BIN || '/usr/bin/firefox',['--headless','--no-remote','--profile',profile,'--remote-debugging-port','0','about:blank'],{stdio:['ignore','pipe','pipe']});
let socket, seq=0, context;const pending=new Map();let logs='';const events=[];let scenario='startup';
const report={target:'static-files-local',basePath,manifest:testedManifest,mode:noJS?'javascript-disabled':'normal',osColorScheme:dark?'dark':'light',manifestSha256:testedManifestSha256,cases:[],anchors:[],axe:[],resourceFailures:[],pageErrors:[],screenshots:[],readability:[],theme:[],unsupported:[],limitations:['Selected automated regressions, not full WCAG conformance or visual/screen-reader review.','Computed solid-color contrast does not prove contrast over imagery or complex compositing.']};
const deadline=setTimeout(()=>{report.result='failed';report.error='QA deadline exceeded';fs.writeFileSync(path.join(evidence,'browser-qa'+suffix+'.json'),JSON.stringify(report,null,2));console.error(report.error);ff.kill('SIGTERM');server.close();process.exit(1)},420000);
function ask(method,params={},timeout=30000){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('BiDi timeout: '+method))},timeout);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression,timeout=30000){const result=await ask('script.evaluate',{expression,target:{context},awaitPromise:true},timeout);if(result.type==='exception')throw new Error(JSON.stringify(result));return result.result?.value;}
async function ready(){
 // Picture source selection is asynchronous; decode() can resolve for the old
 // source. Require painted, complete images again after the media-change frame.
 if(!noJS)await evaluate(`(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()`);
 for(let i=0;i<100;i++){
  if(await evaluate(`document.fonts.status==='loaded'&&[...document.images].every(i=>i.complete&&i.naturalWidth>0)`)){
   if(noJS)return;
   await evaluate(`(async()=>{await Promise.all([...document.images].map(i=>i.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()`);
   if(await evaluate(`[...document.images].every(i=>i.complete&&i.naturalWidth>0)`))return;
  }
  await new Promise(r=>setTimeout(r,50));
 }
 throw new Error('Fonts or selected image variants not ready');
}
async function shot(name,origin='viewport'){const result=await ask('browsingContext.captureScreenshot',{context,origin,format:{type:'image/png'}});const data=Buffer.from(result.data,'base64'),file=name+suffix+'.png';fs.writeFileSync(path.join(out,file),data);report.screenshots.push({file,scenario,manifestSha256:testedManifestSha256,sha256:createHash('sha256').update(data).digest('hex')});}
async function key(value,shift=false){const actions=[];if(shift)actions.push({type:'keyDown',value:'\uE008'});actions.push({type:'keyDown',value},{type:'keyUp',value});if(shift)actions.push({type:'keyUp',value:'\uE008'});await ask('input.performActions',{context,actions:[{type:'key',id:'keyboard',actions}]});}
async function designAudit(){
 const design=JSON.parse(await evaluate(`(()=>{const preference=document.documentElement.dataset.theme,isDark=preference==='dark'||(preference!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);return JSON.stringify({isHome:Boolean(document.querySelector('.hero')),isDark,bodyFont:getComputedStyle(document.body).fontFamily,headingFont:getComputedStyle(document.querySelector('h1')).fontFamily,loadedFonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family.replaceAll('"','')),art:[...document.querySelectorAll('picture[data-polygon-art]')].map(p=>{const i=p.querySelector('img'),r=p.getBoundingClientRect();return {slot:p.dataset.polygonArt,hidden:p.getAttribute('aria-hidden')==='true',emptyAlt:i?.getAttribute('alt')==='',oneImage:p.querySelectorAll('img').length===1,darkSource:p.querySelectorAll('source[data-dark-art]').length===1,decoded:i?.complete&&i.naturalWidth>0,currentSrc:i?.currentSrc?new URL(i.currentSrc).pathname.split('/').pop():null,width:r.width,height:r.height}})})})()`));
 (report.design??=[]).push({scenario,...design});
 if(!design.bodyFont.includes('Instrument Sans')||!design.headingFont.includes('Barlow Condensed')||!['Instrument Sans','Barlow Condensed'].every(f=>design.loadedFonts.includes(f)))throw new Error('Approved design typography missing '+JSON.stringify(design));
 const slots=design.isHome?['hero','members','affiliates','news']:[];
 if(JSON.stringify(design.art.map(a=>a.slot))!==JSON.stringify(slots)||design.art.some(a=>!a.hidden||!a.emptyAlt||!a.oneImage||!a.darkSource||!a.decoded||a.width<=0||a.height<=0||a.currentSrc!==a.slot+(design.isDark?'-dark':'')+'.png'))throw new Error('Approved decorative artwork or theme variant missing '+JSON.stringify(design));
}
// Executed by BiDi in the document, including in the no-page-JavaScript run.
// Geometry tests never add overflow:hidden or alter production files.
function renderedAudit({minimum=16,focus=false}={}){
 const failures=[],unsupported=new Set();let textNodes=0,icons=0,controls=0;
 let minText=Infinity,minIcon=Infinity,minControl=Infinity;
 const describe=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(typeof e.className==='string'?'.'+e.className.trim().replace(/\s+/g,'.'):'');
 const visible=e=>{if(!e.getClientRects().length||e.closest('svg,script,style,template')||(e.closest('.skip')&&!e.closest('.skip').matches(':focus')))return false;for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p),r=p.getBoundingClientRect();if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0||((s.clip!=='auto'||s.clipPath!=='none')&&r.width<=2&&r.height<=2))return false;}const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
 const rgb=value=>{if(!/^rgba?\(/.test(value)){unsupported.add('Unparsed computed color: '+value);return null;}const n=value.match(/[\d.]+/g)?.map(Number);if(!n||n.length<3){unsupported.add('Unparsed computed color: '+value);return null;}return [n[0],n[1],n[2],n[3]??1];};
 const over=(a,b)=>[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])).concat(1);
 const bg=e=>{const chain=[];for(let p=e;p;p=p.parentElement)chain.unshift(p);let color=[255,255,255,1];for(const p of chain){const s=getComputedStyle(p);if(s.backgroundImage!=='none')unsupported.add('Background image/gradient: '+describe(p));if(s.filter!=='none'||Number(s.opacity)!==1)unsupported.add('Complex compositing: '+describe(p));const c=rgb(s.backgroundColor);if(c)color=over(c,color);}return color;};
 const luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const contrast=(value,background)=>{const c=rgb(value);return c?ratio(over(c,background),background):null;};
 const artwork=[...document.querySelectorAll('picture[data-polygon-art]')].filter(visible).map(e=>({slot:e.dataset.polygonArt,rect:e.getBoundingClientRect()}));
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode,e=node.parentElement;if(!node.textContent.trim()||!visible(e))continue;
  const range=document.createRange();range.selectNodeContents(node);const rects=[...range.getClientRects()].filter(r=>r.width>.1&&r.height>.1);if(!rects.length)continue;
  textNodes++;const s=getComputedStyle(e),sample=node.textContent.trim().slice(0,90);
  if(parseFloat(s.fontSize)<minimum-.01)failures.push({kind:'small-text',element:describe(e),sample,size:s.fontSize});
  const c=contrast(s.color,bg(e));if(c!==null){minText=Math.min(minText,c);if(c<4.5)failures.push({kind:'text-contrast',element:describe(e),sample,ratio:c});}
  for(const r of rects){
   for(const art of artwork){const a=art.rect;if(Math.min(r.right,a.right)-Math.max(r.left,a.left)>1&&Math.min(r.bottom,a.bottom)-Math.max(r.top,a.top)>1)failures.push({kind:'artwork-text-collision',slot:art.slot,element:describe(e),sample});}
   if(r.left< -1||r.right>innerWidth+1)failures.push({kind:'text-range-overflow',element:describe(e),sample,left:r.left,right:r.right,width:innerWidth});
   for(let p=e;p&&p!==document.body&&p!==document.documentElement;p=p.parentElement){const ps=getComputedStyle(p),pr=p.getBoundingClientRect();const clipX=/hidden|clip|auto|scroll/.test(ps.overflowX),clipY=/hidden|clip|auto|scroll/.test(ps.overflowY);if((clipX&&(r.left<pr.left-1||r.right>pr.right+1))||(clipY&&(r.top<pr.top-1||r.bottom>pr.bottom+1))){failures.push({kind:'clipped-text-range',element:describe(e),ancestor:describe(p),sample});break;}}
  }
 }
 for(const a of document.querySelectorAll('.member-socials a')){
  if(!visible(a))continue;
  for(const shape of a.querySelectorAll('svg path,svg circle,svg rect,svg polygon,svg line,svg polyline,svg ellipse,svg use')){
   const s=getComputedStyle(shape);for(const paint of ['fill','stroke']){if(s[paint]==='none'||(paint==='stroke'&&parseFloat(s.strokeWidth)===0))continue;const color=rgb(s[paint]);if(!color||color[3]===0)continue;icons++;const c=contrast(s[paint],bg(a));minIcon=Math.min(minIcon,c);if(c<3)failures.push({kind:'icon-contrast',element:a.getAttribute('aria-label'),paint,ratio:c});}
  }
 }
 for(const e of document.querySelectorAll('button,a.primary')){
  if(!visible(e))continue;controls++;const s=getComputedStyle(e),inside=bg(e),outside=bg(e.parentElement),r=e.getBoundingClientRect();
  const c=contrast(s.color,inside);minText=Math.min(minText,c);if(c<4.5||parseFloat(s.fontSize)<minimum-.01)failures.push({kind:'control-text',element:describe(e),ratio:c,size:s.fontSize});
  const borders=['Top','Right','Bottom','Left'].filter(side=>parseFloat(s['border'+side+'Width'])>0&&!['none','hidden'].includes(s['border'+side+'Style'])).map(side=>contrast(s['border'+side+'Color'],outside));
  const boundary=Math.max(ratio(inside,outside),borders.length?Math.min(...borders):1);minControl=Math.min(minControl,boundary);if(boundary<3)failures.push({kind:'control-boundary-contrast',element:describe(e),ratio:boundary});
  if(r.left< -1||r.right>innerWidth+1||e.scrollWidth>e.clientWidth+1)failures.push({kind:'control-overflow',element:describe(e)});
 }
 let focused=null;
 if(focus){const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect(),c=contrast(s.outlineColor,bg(e.parentElement));focused={element:describe(e),outline:s.outlineStyle,width:parseFloat(s.outlineWidth),ratio:c,inView:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};if(!focused.inView||s.outlineStyle==='none'||focused.width<2||c<3)failures.push({kind:'focus-visible-contrast',...focused});}
 const background=bg(document.body);
 const paletteExpected={drupal:'#009CDE',joomla:'#7AC143',typo3:'#FF8700',wordpress:'#32373C',porcelain:'#F5F7FA',white:'#FFFFFF',mist:'#D9E1E6',ink:'#17242C'};
 const rootStyle=getComputedStyle(document.documentElement),palette={};
 for(const [name,expected] of Object.entries(paletteExpected)){palette[name]=rootStyle.getPropertyValue('--owa-'+name).trim().toUpperCase();if(palette[name]!==expected)failures.push({kind:'palette-token',name,expected,actual:palette[name]});}
 const preference=document.documentElement.dataset.theme;
 const isDark=preference==='dark'||(preference!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);
 const expectedPaper=isDark?[23,36,44]:[255,255,255];
 if(background.slice(0,3).some((v,i)=>Math.abs(v-expectedPaper[i])>.01))failures.push({kind:'palette-background',isDark,expected:expectedPaper,actual:background});
 const memberColors={'Drupal':'rgb(0, 156, 222)','Joomla!':'rgb(122, 193, 67)','TYPO3':'rgb(255, 135, 0)','WordPress':'rgb(50, 55, 60)'};
 const memberAccents=[...document.querySelectorAll('.member-logo')].map(e=>{const s=getComputedStyle(e,'::after');return {member:e.querySelector('img').alt,color:s.backgroundColor,width:s.width,height:s.height,content:s.content};});
 for(const a of memberAccents)if(a.color!==memberColors[a.member]||a.width!=='48px'||a.height!=='4px'||a.content!=='""')failures.push({kind:'member-accent',...a});
 const heroText=document.querySelector('.hero')?.textContent.replace(/\s+/g,' ')||'';
 if(['Free and open source.','Independent communities.','A better web, together.'].some(text=>heroText.includes(text)))failures.push({kind:'removed-hero-strapline'});
 let heroLinks=null;
 if(document.querySelector('.hero')){
  const links=selector=>[...document.querySelectorAll(selector)].map(a=>({text:a.textContent.trim(),href:a.getAttribute('href')}));
  heroLinks={actions:links('.hero .actions a'),principles:links('.hero .principles a')};
  if(JSON.stringify(heroLinks.actions)!==JSON.stringify([{text:'Alliance Charter',href:'charter.html'},{text:'News',href:'#news'}]))failures.push({kind:'hero-action-links',actual:heroLinks.actions});
  if(JSON.stringify(heroLinks.principles)!==JSON.stringify([{text:'Read the Open Web Manifesto',href:'charter.html#open-web-manifesto'}]))failures.push({kind:'foundation-manifesto-link',actual:heroLinks.principles});
 }
 const socialRows=[...document.querySelectorAll('.member-socials')].map(list=>{
  const member=list.closest('.member').querySelector('img').alt,links=[...list.querySelectorAll('a')],rows=[];
  for(const link of links.filter(visible)){const top=link.getBoundingClientRect().top;let row=rows.find(r=>Math.abs(r.top-top)<1);if(!row){row={top,count:0};rows.push(row);}row.count++;}
  if(rows.some(row=>row.count>5))failures.push({kind:'social-row-limit',member,rows});
  if(member==='Drupal'&&(list.getAttribute('aria-label')!=='Drupal Association social profiles'||links.some(a=>!a.getAttribute('aria-label')?.startsWith('Drupal Association on '))))failures.push({kind:'drupal-association-only'});
  return {member,linkCount:links.length,rows};
 });
 const newsCoverage=[...document.querySelectorAll('#news article')].map(article=>{
  const sources=article.querySelector('.news-sources'),labels=[...article.querySelectorAll('.news-coverage-label')],label=labels[0];
  const valid=sources?labels.length===1&&label.textContent.trim()==='Also covered in:'&&visible(label)&&Boolean(label.id)&&sources.getAttribute('aria-labelledby')===label.id&&sources.previousElementSibling===label&&sources.querySelectorAll('a[href]').length>0:labels.length===0;
  if(!valid)failures.push({kind:'secondary-coverage-label',article:article.id});
  let inline=null;
  if(sources&&label){
   const first=sources.querySelector('a[href]'),story=article.querySelector('.news-story');
   const textRects=element=>{const range=document.createRange();range.selectNodeContents(element);return [...range.getClientRects()].filter(r=>r.width>.1&&r.height>.1);};
   const labelRects=textRects(label),linkRects=first?textRects(first):[],lastLabel=labelRects.at(-1),firstLink=linkRects[0];
   const labelStyle=getComputedStyle(label),sourceStyle=getComputedStyle(sources),storyStyle=getComputedStyle(story);
   const available=story.clientWidth-parseFloat(storyStyle.paddingLeft)-parseFloat(storyStyle.paddingRight);
   const canShare=labelRects.length===1&&first&&lastLabel.width+parseFloat(labelStyle.marginInlineEnd)+first.getBoundingClientRect().width<=available+.5;
   const sharesLine=Boolean(lastLabel&&firstLink&&Math.abs(lastLabel.bottom-firstLink.bottom)<2&&firstLink.left>=lastLabel.right-1);
   inline={labelDisplay:labelStyle.display,sourcesDisplay:sourceStyle.display,canShare:Boolean(canShare),sharesLine,available};
   if(labelStyle.display!=='inline'||sourceStyle.display!=='inline'||(canShare&&!sharesLine))failures.push({kind:'secondary-coverage-inline',article:article.id,...inline});
  }
  return {article:article.id,secondaryLinks:sources?.querySelectorAll('a[href]').length||0,label:label?.textContent.trim()||null,valid,inline};
 });
 return {textNodes,icons,controls,minTextContrast:Number.isFinite(minText)?minText:null,minIconContrast:Number.isFinite(minIcon)?minIcon:null,minControlContrast:Number.isFinite(minControl)?minControl:null,background,backgroundLuminance:luminance(background),palette,memberAccents,heroLinks,socialRows,newsCoverage,focused,failures,unsupported:[...unsupported],width:innerWidth,scrollWidth:document.documentElement.scrollWidth};
}
async function readability(label,options={}){
 const audit=JSON.parse(await evaluate(`JSON.stringify((${renderedAudit.toString()})(${JSON.stringify(options)}))`));
 report.readability.push({scenario,label,...audit});
 if(audit.scrollWidth>audit.width||audit.failures.length)throw new Error('Readability '+scenario+' '+label+' '+JSON.stringify(audit.failures));
 if(!audit.textNodes)throw new Error('Empty readability audit '+scenario);
 return audit;
}
let noJSAxeUnavailable=false;
async function axeAudit(){
 if(noJSAxeUnavailable){report.axe.push({scenario,status:'unsupported',reason:'Page-JavaScript-disabled axe probe could not execute; see unsupported.'});return;}
 let audit;
 try{
  await evaluate(axeSource,10000);
  audit=JSON.parse(await evaluate(`(()=>{const requested=['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice'];const supported=new Set(axe.getRules().flatMap(r=>r.tags));const tags=requested.filter(t=>supported.has(t));return axe.run(document,{runOnly:{type:'tag',values:tags}}).then(r=>JSON.stringify({tags,unsupportedTags:requested.filter(t=>!supported.has(t)),violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>v.id),passes:r.passes.length}));})()`,noJS?10000:30000));
 }catch(error){if(!noJS)throw error;noJSAxeUnavailable=true;report.unsupported.push({probe:'axe with page JavaScript disabled',reason:String(error)});report.axe.push({scenario,status:'unsupported',reason:String(error)});return;}
 report.axe.push({scenario,status:'executed',...audit});
 if(['wcag2a','wcag2aa','wcag21aa','best-practice'].some(t=>!audit.tags.includes(t)))throw new Error('Existing axe tag coverage unavailable '+JSON.stringify(audit.tags));
 if(audit.unsupportedTags.length)report.unsupported.push({probe:'axe tags',scenario,tags:audit.unsupportedTags});
 if(audit.violations.length)throw new Error('Accessibility violations '+scenario+' '+JSON.stringify(audit.violations));
}
async function nativeTheme(value,{persist=true}={}){
 const options=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('#theme-options button')].map(o=>o.dataset.themeChoice))`));
 if(JSON.stringify(options)!==JSON.stringify(['system','light','dark']))throw new Error('Theme options/order mismatch '+JSON.stringify(options));
 // Native button activation and Tab traversal, not synthetic click/change events.
 await evaluate(`document.querySelector('#theme-mode').focus()`);
 await key('\uE007');
 if(!(await evaluate(`document.querySelector('#theme-mode').getAttribute('aria-expanded')==='true'&&!document.querySelector('#theme-options').hidden`)))throw new Error('Theme disclosure did not open');
 await readability('theme-options-open');
 for(let i=0;i<=options.indexOf(value);i++)await key('\uE004');
 if(await evaluate(`document.activeElement.dataset.themeChoice`)!==value)throw new Error('Theme choice keyboard order changed');
 await readability('theme-choice-focus',{focus:true});
 await key('\uE007');
 if(!(await evaluate(`document.activeElement.id==='theme-mode'&&document.querySelector('#theme-options').hidden&&document.querySelector('#theme-mode').getAttribute('aria-expanded')==='false'`)))throw new Error('Theme disclosure did not close/return focus');
 await ready();await assertTheme(value,{persist});
 await readability('native-theme-'+value,{focus:true});
}
async function assertTheme(value,{persist=true,control=true}={}){
 const state=JSON.parse(await evaluate(`(()=>{const e=document.querySelector('#theme-mode'),c=document.querySelector('.theme-control'),s=c&&getComputedStyle(c);let saved;try{saved=localStorage.getItem('owa-color-theme')}catch{saved='blocked'}return JSON.stringify({theme:document.documentElement.dataset.theme||'system',themeAttribute:document.documentElement.getAttribute('data-theme'),value:e?.dataset.preference,name:e?.getAttribute('aria-label'),expanded:e?.getAttribute('aria-expanded'),panelHidden:document.querySelector('#theme-options')?.hidden,iconCount:[...e.querySelectorAll('svg')].filter(i=>getComputedStyle(i).display!=='none').length,width:e?.getBoundingClientRect().width,height:e?.getBoundingClientRect().height,visible:Boolean(c&&!c.hidden&&c.getClientRects().length&&s.display!=='none'&&s.visibility!=='hidden'),osDark:matchMedia('(prefers-color-scheme: dark)').matches,saved})})()`));
 if(control&&(state.name!=='Color theme: '+value[0].toUpperCase()+value.slice(1)||state.expanded!=='false'||!state.panelHidden||state.iconCount!==1||state.width<44||state.height<44))throw new Error('Theme icon/name/disclosure mismatch '+JSON.stringify(state));
 const audit=await readability('theme-state-'+value);
 const expectedDark=value==='dark'||(value==='system'&&dark);
 const logos=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.member-logo')].map(a=>{const i=a.querySelector('img'),p=a.querySelector('picture');return {member:i.alt,currentSrc:new URL(i.currentSrc).pathname.split('/').pop(),imageCount:a.querySelectorAll('img').length,decoded:i.complete&&i.naturalWidth>0,background:getComputedStyle(a).backgroundColor,pictureBackground:p&&getComputedStyle(p).backgroundColor,imageBackground:getComputedStyle(i).backgroundColor,filter:getComputedStyle(i).filter}}))`));
 if(logos.length){
  if(logos.length!==logoVariants.length||logos.some((l,i)=>l.member!==logoVariants[i].member||l.currentSrc!==logoVariants[i][expectedDark?'dark':'light']||l.imageCount!==1||!l.decoded||l.filter!=='none'||[l.background,l.pictureBackground,l.imageBackground].some(c=>c!=='rgba(0, 0, 0, 0)')))throw new Error('Official transparent logo variant mismatch '+JSON.stringify(logos));
  (report.logoVariants??=[]).push({scenario,preference:value,expectedDark,logos});
 }
 await designAudit();
 report.theme.push({scenario,expected:value,expectedDark,...state,background:audit.background});
 if(state.osDark!==dark||state.theme!==value||state.visible!==control||(control&&state.value!==value)||(persist&&state.saved!==value)||(expectedDark?audit.backgroundLuminance>=.5:audit.backgroundLuminance<=.5))throw new Error('Theme state mismatch '+JSON.stringify(state));
}
async function isolatedTab(){const {userContext}=await ask('browser.createUserContext');const created=await ask('browsingContext.create',{type:'tab',userContext});context=created.context;return userContext;}
async function themeDisclosure(label){
 const closed=()=>evaluate(`document.querySelector('#theme-options').hidden&&document.querySelector('#theme-mode').getAttribute('aria-expanded')==='false'`);
 await evaluate(`scrollTo(0,0);document.querySelector('#theme-mode').focus()`);await key('\uE007');
 await readability('open-theme-options');await axeAudit();await shot('theme-options-'+label);
 await key('\uE004');await key('\uE00C');
 if(!(await closed())||!(await evaluate(`document.activeElement.id==='theme-mode'`)))throw new Error('Theme Escape/return focus failed');
 await key('\uE007');for(let i=0;i<4;i++)await key('\uE004');
 if(!(await closed())||await evaluate(`Boolean(document.activeElement.closest('.theme-control'))`))throw new Error('Theme forward Tab exit failed');
 await evaluate(`document.querySelector('#theme-mode').focus()`);await key('\uE007');await key('\uE004',true);
 if(!(await closed())||await evaluate(`Boolean(document.activeElement.closest('.theme-control'))`))throw new Error('Theme reverse Tab exit failed');
 await evaluate(`document.querySelector('#theme-mode').focus()`);await key('\uE007');
 await ask('input.performActions',{context,actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',x:4,y:4,origin:'viewport'},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
 if(!(await closed()))throw new Error('Theme outside-click dismissal failed');
 await evaluate(`document.querySelector('#theme-mode').focus()`);await key('\uE007');await key('\uE007');
 if(!(await closed()))throw new Error('Theme repeated trigger activation failed');
 (report.themeDisclosure??=[]).push({label,escape:true,returnFocus:true,forwardTabExit:true,reverseTabExit:true,outsideClick:true,repeatedTrigger:true});
}
// CSSOM fixtures, not native zoom: capture sizes before doubling descendants.
function applyTextFixture(mode){
 const elements=[...document.querySelectorAll('body,body *')].filter(e=>e instanceof HTMLElement&&!e.matches('script,style'));
 const sizes=elements.map(e=>parseFloat(getComputedStyle(e).fontSize));
 const style=document.createElement('style');style.id='qa-text-fixture';document.head.append(style);
 const enlarged=mode==='text-200'||mode==='combined';
 if(enlarged)elements.forEach((e,i)=>{e.setAttribute('data-qa-text',String(i));style.sheet.insertRule('[data-qa-text="'+i+'"]{font-size:'+sizes[i]*2+'px!important}',style.sheet.cssRules.length)});
 if(mode==='text-spacing'||mode==='combined'){
  style.sheet.insertRule('body,body *{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}',style.sheet.cssRules.length);
  style.sheet.insertRule('p{margin-bottom:2em!important}',style.sheet.cssRules.length);
 }
 return {mode,elementCount:elements.length,h1Size:getComputedStyle(document.querySelector('h1')).fontSize,doubled:!enlarged||elements.every((e,i)=>Math.abs(parseFloat(getComputedStyle(e).fontSize)-sizes[i]*2)<.05)};
}
function focusedBounds(){
 const e=document.activeElement,r=e.getBoundingClientRect(),s=getComputedStyle(e),margin=parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset);
 const bounds={left:r.left-margin,right:r.right+margin,top:r.top-margin,bottom:r.bottom+margin};
 const clipped=[];
 for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const ps=getComputedStyle(p),pr=p.getBoundingClientRect();if((/hidden|clip|auto|scroll/.test(ps.overflowX)&&(bounds.left<pr.left-1||bounds.right>pr.right+1))||(/hidden|clip|auto|scroll/.test(ps.overflowY)&&(bounds.top<pr.top-1||bounds.bottom>pr.bottom+1)))clipped.push(p.className||p.tagName);}
 return {name:e.getAttribute('aria-label')||e.textContent.trim(),href:e.getAttribute('href'),choice:e.dataset.themeChoice||null,bounds,width:innerWidth,height:innerHeight,clipped,visible:s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2&&e.matches(':focus-visible')&&bounds.left>=-1&&bounds.right<=innerWidth+1&&bounds.top>=-1&&bounds.bottom<=innerHeight+1&&!clipped.length};
}
async function focusRegressions(){
 const result={sidebar:[],theme:[],failures:[]};report.focusRegressions=result;
 const measure=async()=>JSON.parse(await evaluate(`JSON.stringify((${focusedBounds.toString()})())`));
 const fixture=async mode=>{const f=JSON.parse(await evaluate(`JSON.stringify((${applyTextFixture.toString()})(${JSON.stringify(mode)}))`));if(!f.doubled)throw new Error('Focus regression text fixture did not apply');return f;};
 for(const route of ['charter.html','membership-process.html','privacy.html']){
  for(const [label,width,height,enlarge] of [['short',844,390,false],['narrow-landscape',651,256,false],['text-200',1280,1024,true]]){
   scenario='sidebar-focus:'+route+':'+label;console.log('CASE '+scenario);
   await ask('browsingContext.setViewport',{context,viewport:{width,height},devicePixelRatio:1});
   await ask('browsingContext.navigate',{context,url:base+route,wait:'complete'});await ready();
   if(await evaluate('innerWidth')!==width||await evaluate('innerHeight')!==height)throw new Error('Sidebar viewport not established');
   if(enlarge)await fixture('text-200');
   const hrefs=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.desktop-toc a')].map(a=>a.getAttribute('href')))`));
   for(const reverse of [false,true]){
    const expected=reverse?[...hrefs].reverse():hrefs,trace={route,label,reverse,items:[]};result.sidebar.push(trace);
    await evaluate(`document.querySelector(${JSON.stringify(reverse?'.desktop-toc li:last-child a':'.desktop-toc a')}).focus()`);await key('\uE008');
    for(let i=0;i<expected.length;i++){
     const focused=await measure();trace.items.push(focused);
     if(focused.href!==expected[i]||!focused.visible)result.failures.push({scenario,reverse,expected:expected[i],...focused});
     if(i<expected.length-1)await key('\uE004',reverse);
    }
    await shot(route.replace('.html','')+'-focus-'+label+(reverse?'-reverse':'-forward'));
   }
  }
 }
 if(!noJS)for(const route of routes){for(const [mode,height] of [['text-200',800],['text-spacing',800],['combined',800],['short-height',256]]){
  scenario='theme-stress:'+route+':'+mode;console.log('CASE '+scenario);
  await ask('browsingContext.setViewport',{context,viewport:{width:320,height},devicePixelRatio:1});
  await ask('browsingContext.navigate',{context,url:base+route,wait:'complete'});await ready();
  if(await evaluate('innerWidth')!==320||await evaluate('innerHeight')!==height)throw new Error('Theme viewport not established');
  const applied=await fixture(mode);
  await evaluate(`scrollTo(0,0);document.querySelector('#theme-mode').focus()`);await key('\uE007');
  const audit=JSON.parse(await evaluate(`JSON.stringify((${renderedAudit.toString()})({minimum:${mode==='text-200'||mode==='combined'?32:16}}))`));
  report.readability.push({scenario,label:'open-theme-'+mode,...audit});
  const panel=JSON.parse(await evaluate(`(()=>{const r=document.querySelector('#theme-options').getBoundingClientRect();return JSON.stringify({left:r.left,right:r.right,width:innerWidth})})()`));
  const trace={route,mode,height,fixture:applied,panel,items:[]};result.theme.push(trace);
  if(audit.failures.length||panel.left<0||panel.right>panel.width)result.failures.push({scenario,panel,readability:audit.failures});
  for(const choice of ['system','light','dark']){await key('\uE004');const focused=await measure();trace.items.push(focused);if(focused.choice!==choice||!focused.visible)result.failures.push({scenario,expected:choice,...focused});}
  if(mode==='combined'||mode==='short-height')await shot(route.replace('.html','')+'-theme-'+mode);
  await key('\uE00C');trace.escapeRestored=await evaluate(`document.activeElement.id==='theme-mode'&&document.querySelector('#theme-options').hidden&&document.querySelector('#theme-mode').getAttribute('aria-expanded')==='false'`);
  trace.focusAfterEscape=await measure();
  if(!trace.escapeRestored||!trace.focusAfterEscape.visible)result.failures.push({scenario,error:'Escape did not close and restore visible focus',focus:trace.focusAfterEscape});
 }}
 result.expectedSidebar=18;result.expectedTheme=noJS?0:20;
 if(result.sidebar.length!==result.expectedSidebar||result.theme.length!==result.expectedTheme)throw new Error('Incomplete focus regression coverage');
 if(result.failures.length)throw new Error('Focus regressions: '+JSON.stringify(result.failures));
 result.passed=true;
}
try{
 const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Firefox startup failed')),30000);const read=data=>{logs+=data.toString();const m=logs.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}};ff.stdout.on('data',read);ff.stderr.on('data',read);ff.once('error',reject);});
 socket=new WebSocket(origin.replace(/\/$/,'')+'/session');
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);const request=pending.get(msg.id);if(request){clearTimeout(request.timer);pending.delete(msg.id);msg.type==='error'?request.reject(new Error(JSON.stringify(msg))):request.resolve(msg.result);}else if(msg.type==='event')events.push({scenario,...msg});});
 const session=await ask('session.new',{capabilities:{alwaysMatch:{acceptInsecureCerts:false}}});
 report.browser={name:session.capabilities.browserName,version:session.capabilities.browserVersion};
 await ask('session.subscribe',{events:['log.entryAdded','network.responseCompleted']});
 ({context}=await ask('browsingContext.create',{type:'tab'}));
 await ask('browsingContext.navigate',{context,url:base+'__javascript_probe__.html',wait:'complete'});
 report.javascriptProbe={expectedEnabled:!noJS,observedExecution:probeRan};
 if(probeRan===noJS)throw new Error('JavaScript preference probe failed');
 report.osPreference={expected:dark?'dark':'light',observedDark:await evaluate(`matchMedia('(prefers-color-scheme: dark)').matches`)};
 if(report.osPreference.observedDark!==dark)throw new Error('Firefox OS color-scheme preference did not take effect');
 await ask('browsingContext.navigate',{context,url:base+'index.html',wait:'complete'});await ready();await designAudit();
 await focusRegressions();
 report.coverage={axeExecuted:0};
 if(!focusOnly){
 const sizes=noJS?[['desktop',1440,1080],['mobile',390,1120]]:[['desktop',1440,1080],['tablet',820,1100],['mobile',390,1120],['narrow',320,1050]];
 for(const route of routes){
  for(const [label,width,height] of sizes){
   scenario=route+':'+label;console.log('CASE '+scenario+' OS='+report.osColorScheme+' '+report.mode);
   await ask('browsingContext.setViewport',{context,viewport:{width,height},devicePixelRatio:1});
   await ask('browsingContext.navigate',{context,url:base+route,wait:'complete'});await ready();
   const data=JSON.parse(await evaluate(`JSON.stringify({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,h1:document.querySelector('h1').textContent.trim(),h1font:getComputedStyle(document.querySelector('h1')).fontFamily,bodyFont:getComputedStyle(document.body).fontFamily,images:[...document.images].map(i=>({src:i.getAttribute('src'),ok:i.complete&&i.naturalWidth>0})),fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>({family:f.family,style:f.style})),overflow:[...document.querySelectorAll('body *')].filter(e=>!e.classList.contains('skip')&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className}))})`));
   if(data.scrollWidth>width||data.overflow.length)throw new Error('Horizontal overflow '+scenario+' '+JSON.stringify(data));
   if(!data.images.every(i=>i.ok))throw new Error('Broken image '+scenario);
   if(!data.fonts.some(f=>f.family.replaceAll('"','')==='Barlow Condensed')||!data.fonts.some(f=>f.family.replaceAll('"','')==='Instrument Sans'))throw new Error('Font loading failure '+scenario);
   await assertTheme('system',{persist:false,control:!noJS});
   const shared=JSON.parse(await evaluate(`(()=>{const words=[...document.querySelectorAll('.brand .brand-wordmark span')].map(e=>({text:e.textContent.trim(),top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}));const badLinks=[...document.querySelectorAll('a[href]')].flatMap(a=>{const external=/^https?:$/.test(a.protocol)&&a.origin!==location.origin;const described=(a.getAttribute('aria-describedby')||'').split(/\\s+/);const bad=external?(a.target!=='_blank'||!a.relList.contains('noopener')||!a.relList.contains('noreferrer')||!described.includes('external-link-hint')):(a.target!==''&&a.target!=='_self');return bad?[{href:a.getAttribute('href'),target:a.target,rel:a.rel,described}]:[]});return JSON.stringify({words,badLinks,hints:document.querySelectorAll('#external-link-hint').length,hint:document.getElementById('external-link-hint')?.textContent.trim(),oldCopy:document.body.innerText.replace(/\\s+/g,' ').includes('Independent projects. Shared principles.')})})()`));
   if(JSON.stringify(shared.words.map(w=>w.text))!==JSON.stringify(['Open','Website','Alliance'])||shared.words.some((w,i)=>i&&w.top<shared.words[i-1].bottom-1))throw new Error('Brand wordmark must have three distinct lines '+JSON.stringify(shared.words));
   if(shared.oldCopy||shared.badLinks.length||shared.hints!==1||!shared.hint)throw new Error('Shared copy/link contract '+JSON.stringify(shared));
   data.shared=shared;
   data.copyright=JSON.parse(await evaluate(`JSON.stringify({years:[...document.querySelectorAll('footer [data-copyright-year]')].map(e=>e.textContent),currentYear:String(new Date().getFullYear())})`));
   if(data.copyright.years.length!==1||data.copyright.years[0]!==data.copyright.currentYear)throw new Error('Footer copyright year is not current '+scenario);
   data.arrowLinks=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('a[href]')].map(a=>{const nodes=[a,...a.querySelectorAll('*')],arrows=[a.textContent,...nodes.flatMap(e=>['::before','::after'].map(p=>getComputedStyle(e,p).content))].some(t=>/[↗↖↘↙]/.test(t));return {href:a.getAttribute('href'),arrows,hero:Boolean(a.closest('.hero')),external:/^https?:$/.test(a.protocol)&&a.origin!==location.origin}}).filter(a=>a.arrows))`));
   if(data.arrowLinks.some(a=>!a.external||a.hero))throw new Error('Diagonal arrow shown on non-external or hero link '+JSON.stringify(data.arrowLinks));
   if(await evaluate(`Boolean([...document.querySelectorAll('.hero a,.hero a *')].some(e=>[e.textContent,getComputedStyle(e,'::before').content,getComputedStyle(e,'::after').content].some(t=>/[\u2190-\u21ff]/.test(t))))`))throw new Error('Arrow shown in hero link');
   if(await evaluate(`Boolean(document.querySelector('header nav,nav[aria-label="Main navigation"]'))`))throw new Error('Main navigation reintroduced '+scenario);
   if(route==='index.html'){
    if(await evaluate(`Boolean(document.querySelector('.hero .eyebrow'))`))throw new Error('Hero eyebrow reintroduced');
    if(await evaluate(`document.querySelector('#wordpress-card .org').getAttribute('href')`)!=='https://wordpressfoundation.org/')throw new Error('WordPress Foundation destination changed');
    const rendered=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.member')].map(m=>({member:m.querySelector('img').alt,profiles:[...m.querySelectorAll('.member-socials a')].map(a=>({label:a.dataset.platform,url:a.href,name:a.getAttribute('aria-label'),title:a.getAttribute('title'),visibleText:a.innerText.trim(),svg:a.querySelectorAll('svg').length===1&&a.querySelector('svg').getAttribute('aria-hidden')==='true'&&a.querySelector('svg').getAttribute('focusable')==='false',width:a.getBoundingClientRect().width,height:a.getBoundingClientRect().height,clipped:a.getBoundingClientRect().left<m.getBoundingClientRect().left-1||a.getBoundingClientRect().right>m.getBoundingClientRect().right+1}))})))`));
    if(rendered.length!==socialProfiles.length)throw new Error('Member count mismatch');
    for(let i=0;i<socialProfiles.length;i++){
     const expected=socialProfiles[i],actual=rendered[i];
     if(actual.member!==expected.member||JSON.stringify(actual.profiles.map(({label,url,name})=>({label,url,name})))!==JSON.stringify(expected.profiles))throw new Error('Social profile mapping mismatch '+scenario);
     if(actual.profiles.some(p=>p.width<44||p.height<44||p.clipped||p.name!==expected.profiles[actual.profiles.indexOf(p)].name||!p.title||!p.svg||p.visibleText))throw new Error('Social icon target/name/layout failure '+scenario);
    }
    data.memberSocialProfiles=rendered;
    data.news=JSON.parse(await evaluate(`(()=>{const n=document.querySelector('section#news');return JSON.stringify({heading:n?.querySelector('h2')?.textContent.trim(),cta:Boolean(document.querySelector('.hero a[href="#news"]')),articles:[...(n?.querySelectorAll('article')||[])].map(a=>({heading:a.querySelector('h3,h2')?.textContent.trim(),date:a.querySelector('time')?.getAttribute('datetime'),dateText:a.querySelector('time')?.textContent.trim(),sources:[...a.querySelectorAll('a[href]')].filter(l=>/^https?:$/.test(l.protocol)&&l.origin!==location.origin).map(l=>({url:l.href,text:l.textContent.trim()}))}))})})()`));
    if(!data.news.heading||!data.news.cta||!data.news.articles.length||data.news.articles.some(a=>!a.heading||!a.dateText||!a.date||Number.isNaN(Date.parse(a.date))||!a.sources.length||a.sources.some(s=>!s.text)))throw new Error('Static News semantics/content missing '+JSON.stringify(data.news));
    data.newsLayout=JSON.parse(await evaluate(`(()=>{const list=document.querySelector('ol.news-list');return JSON.stringify({list:Boolean(list),rows:[...list.querySelectorAll(':scope>li>article')].map(a=>{const r=a.getBoundingClientRect();return {x:r.x,top:r.top,bottom:r.bottom,width:r.width}})})})()`));
    if(!data.newsLayout.list||data.newsLayout.rows.length!==data.news.articles.length||data.newsLayout.rows.some((r,i,rows)=>i&&(r.top<rows[i-1].bottom-1||Math.abs(r.x-rows[0].x)>1||Math.abs(r.width-rows[0].width)>1)))throw new Error('News is not a single chronological column');
   }
   await axeAudit();
   if(label==='desktop'||label==='mobile'){
    await shot(route.replace('.html','')+'-'+label);
    if(route==='index.html'){
     await shot('index-full-'+label,'document');
     await shot('header-'+label);
     await evaluate(`document.querySelector('.members').scrollIntoView({block:'start'})`);await shot('members-'+label);
     await evaluate(`document.querySelector('#news').scrollIntoView({block:'start'})`);await shot('news-'+label);
     await evaluate(`scrollTo(0,document.documentElement.scrollHeight)`);await shot('index-bottom-'+label);await evaluate(`scrollTo(0,0)`);
    }
    await key('\uE004');if(await evaluate(`document.activeElement.className`)!=='skip')throw new Error('Skip link not first');
    await key('\uE007');if(await evaluate(`document.activeElement.id`)!=='main')throw new Error('Skip link did not focus main');
    if(route==='index.html'){
     await evaluate(`document.querySelector('.hero a[href="#news"]').focus()`);await key('\uE007');
     const newsReached=await evaluate(`location.hash==='#news'&&document.querySelector('#news h2').getBoundingClientRect().top>=-1&&document.querySelector('#news h2').getBoundingClientRect().top<innerHeight`);
     if(!newsReached)throw new Error('Native News keyboard navigation failed');
     (report.newsKeyboard??=[]).push({scenario,passed:true});
    }
    if(route==='charter.html'||route==='membership-process.html'||route==='privacy.html'){
     const selector=label==='mobile'?'.mobile-toc summary':'.desktop-toc a';
     await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);await key('\uE007');
     if(label==='mobile'&&!(await evaluate(`document.querySelector('.mobile-toc').open`)))throw new Error('Native ToC failed');
     if(label==='mobile'){await evaluate(`document.querySelector('.mobile-toc a').focus()`);await key('\uE007');}
     if(!(await evaluate(`Boolean(location.hash&&document.getElementById(location.hash.slice(1)))`)))throw new Error('ToC anchor failed');
    }
   }
   report.cases.push({route,viewport:label,...data});console.log('PASS '+scenario);
  }
 }
 // CSSOM-only fixtures: freeze computed sizes first so inherited em/rem sizes
 // are doubled once, not compounded by doubling every ancestor.
 for(const route of routes){for(const width of [320,1440]){
  scenario='text-stress:'+route+':'+width;console.log('CASE '+scenario);
  await ask('browsingContext.setViewport',{context,viewport:{width,height:1120},devicePixelRatio:1});
  await ask('browsingContext.navigate',{context,url:base+route,wait:'complete'});await ready();
  await readability('320-reflow-or-desktop-baseline');
  for(const mode of ['text-200','text-spacing']){
   const fixture=JSON.parse(await evaluate(`JSON.stringify((${applyTextFixture.toString()})(${JSON.stringify(mode)}))`));
   if(!fixture.doubled)throw new Error('200% text fixture did not apply');
   await readability(mode,{minimum:mode==='text-200'?32:16});
   (report.textFixtures??=[]).push({scenario,...fixture});
   await evaluate(`document.querySelector('#qa-text-fixture').remove();document.querySelectorAll('[data-qa-text]').forEach(e=>e.removeAttribute('data-qa-text'))`);
  }
 }}
 // Actual browser zoom is a separate native-key probe; CSS zoom is not a substitute.
 scenario='browser-zoom';
 await ask('browsingContext.setViewport',{context,viewport:{width:1280,height:1080},devicePixelRatio:1});
 await ask('browsingContext.navigate',{context,url:base+'index.html',wait:'complete'});await ready();
 const zoomBefore=JSON.parse(await evaluate(`JSON.stringify({width:innerWidth,dpr:devicePixelRatio})`));
 const controlKey=async value=>ask('input.performActions',{context,actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'\uE009'},{type:'keyDown',value},{type:'keyUp',value},{type:'keyUp',value:'\uE009'}]}]});
 for(let i=0;i<6;i++)await controlKey('+');
 const zoomAfter=JSON.parse(await evaluate(`JSON.stringify({width:innerWidth,dpr:devicePixelRatio})`));
 const zoomFactor=zoomBefore.width/zoomAfter.width;
 report.browserZoom={before:zoomBefore,after:zoomAfter,factor:zoomFactor};
 if(Math.abs(zoomFactor-2)<.05){for(const route of routes){scenario='browser-zoom:'+route;await ask('browsingContext.navigate',{context,url:base+route,wait:'complete'});await ready();await readability('actual-browser-zoom-200');}}
 else report.unsupported.push({probe:'actual 200% browser zoom via native Ctrl++',reason:'Headless content-context input did not establish 200% zoom; viewport/text fixtures are not a substitute.',...report.browserZoom});
 await controlKey('0');
 const zoomReset=await evaluate('innerWidth');if(Math.abs(zoomReset-zoomBefore.width)>1)throw new Error('Browser zoom failed to reset');
 // Traverse the social links with actual Tab input, without visiting external profiles.
 scenario='social-keyboard';
 await ask('browsingContext.setViewport',{context,viewport:{width:390,height:1120},devicePixelRatio:1});
 await ask('browsingContext.navigate',{context,url:base+'index.html',wait:'complete'});await ready();
 const expectedSocials=socialProfiles.flatMap(row=>row.profiles.map(p=>({url:p.url,name:p.name})));
 await evaluate(`document.querySelector('.member-socials a').focus()`);
 const keyboardSocials=[];
 for(let step=0;step<80&&keyboardSocials.length<expectedSocials.length;step++){
  const current=JSON.parse(await evaluate(`(()=>{const a=document.activeElement,r=a.getBoundingClientRect(),style=getComputedStyle(a);return JSON.stringify({social:a.matches('.member-socials a'),url:a.href,name:a.getAttribute('aria-label'),inView:r.top>=0&&r.bottom<=innerHeight,outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth),top:r.top,bottom:r.bottom,height:innerHeight,focusVisible:a.matches(':focus-visible')})})()`));
  if(current.social){if(!current.inView||current.outline==='none'||current.outlineWidth<2){report.socialFocusFailure={step,...current};await shot('social-focus-failure');throw new Error('Social keyboard focus not visible '+JSON.stringify(current));}keyboardSocials.push({url:current.url,name:current.name});}
  await key('\uE004');
 }
 if(JSON.stringify(keyboardSocials)!==JSON.stringify(expectedSocials))throw new Error('Social keyboard order incomplete');
 report.socialKeyboard={count:keyboardSocials.length,passed:true};
 await evaluate(`document.querySelectorAll('.member-socials a')[document.querySelectorAll('.member-socials a').length-1].focus()`);
 const reverseSocials=[];
 for(let step=0;step<120&&reverseSocials.length<expectedSocials.length;step++){
  const current=JSON.parse(await evaluate(`(()=>{const a=document.activeElement,r=a.getBoundingClientRect(),s=getComputedStyle(a);return JSON.stringify({social:a.matches('.member-socials a'),url:a.href,name:a.getAttribute('aria-label'),visible:r.top>=0&&r.bottom<=innerHeight&&s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2})})()`));
  if(current.social){if(!current.visible)throw new Error('Reverse social focus invisible');reverseSocials.push({url:current.url,name:current.name});}
  if(reverseSocials.length<expectedSocials.length)await key('\uE004',true);
 }
 if(JSON.stringify(reverseSocials)!==JSON.stringify([...expectedSocials].reverse()))throw new Error('Reverse social keyboard order incomplete');
 await readability('social-focus-contrast',{focus:true});report.socialKeyboard.reverseCount=reverseSocials.length;
 // Native pointer navigation proves the CTA and footer are usable, including with JS disabled.
 for(const [selector,start,target] of [['a.primary','index.html','charter.html'],['.principles a','index.html','charter.html#open-web-manifesto'],['.details a[href="membership-process.html"]','index.html','membership-process.html'],['footer a[href="privacy.html"]','charter.html','privacy.html'],['.hero a[href="#news"]','index.html','index.html#news']]){
  scenario='pointer:'+selector;
  await ask('browsingContext.setViewport',{context,viewport:{width:390,height:1120},devicePixelRatio:1});
  await ask('browsingContext.navigate',{context,url:base+start,wait:'complete'});await ready();
  const point=JSON.parse(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const box=e.getBoundingClientRect(),rects=[...e.getClientRects()],r=rects.find(r=>r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight);if(!r)throw new Error('No visible link fragment');const x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return JSON.stringify({x,y,fragmentCount:rects.length,unionCenterHitsLink:document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('a')===e,fragmentCenterHitsLink:document.elementFromPoint(x,y)?.closest('a')===e})})()`));
  if(!point.fragmentCenterHitsLink)throw new Error('Pointer target does not hit a link fragment');
  await ask('input.performActions',{context,actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',x:point.x,y:point.y,origin:'viewport'},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
  let reached=false;for(let i=0;i<100;i++){const tree=await ask('browsingContext.getTree',{root:context,maxDepth:0});if(tree.contexts[0].url===base+target){reached=true;break;}await new Promise(r=>setTimeout(r,50));}
  if(!reached)throw new Error('Pointer navigation failed: '+selector);await ready();
  (report.pointerNavigation??=[]).push({selector,from:start,to:target,geometry:point,passed:true});
 }
 // Theme switching is exercised with native button keys; persistence is read back
 // after a real reload and on every route, not inferred from localStorage alone.
 if(!noJS){
  for(const [label,width] of [['desktop',1440],['mobile',390]]){
   await ask('browsingContext.setViewport',{context,viewport:{width,height:1120},devicePixelRatio:1});
   await ask('browsingContext.navigate',{context,url:base+'index.html',wait:'complete'});await ready();
   scenario='theme-keyboard:'+label;console.log('CASE '+scenario);
   await themeDisclosure(label);
   await evaluate(`document.querySelector('#theme-mode').focus()`);await key('\uE004');await key('\uE004',true);
   if(!(await evaluate(`document.activeElement.id==='theme-mode'`)))throw new Error('Reverse Tab did not return to theme control');
   await readability('theme-reverse-focus',{focus:true});
   await key('\uE004',true);
   if(await evaluate(`document.activeElement.id==='theme-mode'||document.activeElement===document.body`))throw new Error('Theme reverse-focus trap');
   await key('\uE004');if(!(await evaluate(`document.activeElement.id==='theme-mode'`)))throw new Error('Theme forward focus order changed');
   for(const value of ['light','dark','system']){
    scenario='theme-keyboard:'+label+':'+value;
    await nativeTheme(value);
    await ask('browsingContext.reload',{context,wait:'complete'});await ready();await assertTheme(value);
    if(value!=='system'){
     await shot('theme-'+value+'-header-'+label);
     for(const [selector,name] of [['.members','members'],['#news','news']]){await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`);await shot('theme-'+value+'-'+name+'-'+label);}
     await evaluate('scrollTo(0,0)');
    }
    await axeAudit();
    if(label==='desktop')for(const route of routes){scenario='theme-persistence:'+value+':'+route;await ask('browsingContext.navigate',{context,url:base+route,wait:'complete'});await ready();await assertTheme(value);}
    await ask('browsingContext.navigate',{context,url:base+'index.html',wait:'complete'});await ready();
   }
  }
  const mainContext=context;
  // Discover the optional theme asset by content, not a guessed filename.
  const scripts=JSON.parse(await evaluate(`JSON.stringify([...document.scripts].filter(s=>s.src&&new URL(s.src).origin===location.origin).map(s=>new URL(s.src).pathname))`));
  for(const pathname of scripts){const file=path.resolve(site,decodeURIComponent(pathname.slice(basePath.length)));if(file.startsWith(site+path.sep)&&fs.existsSync(file)&&fs.readFileSync(file,'utf8').includes('owa-color-theme'))themeScriptPaths.add(pathname);}
  if(!themeScriptPaths.size)report.unsupported.push({probe:'block theme script response',reason:'No external same-origin theme asset containing owa-color-theme was discoverable.'});
  else{
   scenario='theme-script-failure';console.log('CASE '+scenario);const isolated=await isolatedTab();denyTheme=true;
   try{
    await ask('browsingContext.setViewport',{context,viewport:{width:390,height:1120},devicePixelRatio:1});
    await ask('browsingContext.navigate',{context,url:base+'index.html?themefailure=1',wait:'complete'});await ready();
    await assertTheme('system',{persist:false,control:false});
    if(!deniedTheme)throw new Error('Theme script failure was not exercised');
    report.themeScriptFailure={blockedPaths:[...themeScriptPaths],deniedRequests:deniedTheme,controlHidden:true};
    await shot('theme-script-failure');
   }finally{denyTheme=false;await ask('browsingContext.close',{context});context=mainContext;await ask('browser.removeUserContext',{userContext:isolated});}
  }
  scenario='storage-failure';console.log('CASE '+scenario);const isolated=await isolatedTab();let preload;
  try{
   try{({script:preload}=await ask('script.addPreloadScript',{contexts:[context],functionDeclaration:`()=>{Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('QA storage blocked','SecurityError')}});window.__qaStorageBlocked=true;}`},10000));}
   catch(error){if(!/unknown command|unsupported operation|invalid argument|BiDi timeout/.test(String(error)))throw error;report.unsupported.push({probe:'localStorage-denied preload',reason:String(error)});}
   if(preload){
    await ask('browsingContext.setViewport',{context,viewport:{width:390,height:1120},devicePixelRatio:1});
    await ask('browsingContext.navigate',{context,url:base+'index.html?storagefailure=1',wait:'complete'});await ready();
    if(!(await evaluate(`window.__qaStorageBlocked===true&&(()=>{try{localStorage.getItem('owa-color-theme');return false}catch(e){return e.name==='SecurityError'}})()`)))throw new Error('Storage preload did not block access');
    await assertTheme('system',{persist:false});
    for(const value of ['light','dark','system'])await nativeTheme(value,{persist:false});
    report.storageFailure={preloadApplied:true,nativeToggle:true};
   }
  }finally{if(preload)await ask('script.removePreloadScript',{script:preload});await ask('browsingContext.close',{context});context=mainContext;await ask('browser.removeUserContext',{userContext:isolated});}
 }else report.unsupported.push({probe:'native theme disclosure and storage failure',reason:'Intentionally absent enhancement when page JavaScript is disabled; hidden control and OS theme tested on every route.'});
 // Check required anchors in the rendered documents.
 await ask('browsingContext.setViewport',{context,viewport:{width:390,height:1120},devicePixelRatio:1});
 for(const document of documentAnchors){for(const anchor of document.anchors){scenario='anchor:'+document.name+'#'+anchor;await ask('browsingContext.navigate',{context,url:base+document.name+'.html#'+encodeURIComponent(anchor),wait:'complete'});await ready();const exists=await evaluate(`Boolean(document.getElementById(${JSON.stringify(anchor)}))`);if(!exists)throw new Error('Missing document anchor '+anchor);report.anchors.push({page:document.name,anchor,exists});}}
 for(const [route,anchor,label] of [['charter.html','open-web-manifesto','manifesto'],['membership-process.html','prepare-application-materials','application-materials']]){
  for(const [size,width,height] of [['desktop',1440,1080],['mobile',390,1120]]){await ask('browsingContext.setViewport',{context,viewport:{width,height},devicePixelRatio:1});await ask('browsingContext.navigate',{context,url:base+route+'#'+anchor,wait:'complete'});await ready();await shot(label+'-'+size);await evaluate(`scrollTo(0,document.documentElement.scrollHeight)`);await shot(route.replace('.html','')+'-bottom-'+size);}
 }
 scenario='missing-route';await ask('browsingContext.navigate',{context,url:base+'missing/deep/page',wait:'complete'});await ready();if(!(await evaluate(`document.querySelector('h1').textContent.includes('find your way')`)))throw new Error('404 fallback missing');
 report.deep404=true;
 const missingResponse=events.filter(e=>e.method==='network.responseCompleted'&&e.params.response.url===base+'missing/deep/page').at(-1);
 if(missingResponse?.params.response.status!==404)throw new Error('Missing route did not return HTTP 404');
 await shot('deep-404');
 await evaluate(`document.querySelector('main a.primary').focus()`);await key('\uE007');
 for(let i=0;i<100&&await evaluate('location.href')!==base+'index.html';i++)await new Promise(r=>setTimeout(r,50));
 if(await evaluate('location.href')!==base+'index.html')throw new Error('404 recovery escaped the site mount');
 await ready();report.deep404Recovery=true;
 // Test real font request failures without changing production CSS.
 if(!noJS){scenario='font-failure';denyFonts=true;const {userContext}=await ask('browser.createUserContext',{});({context}=await ask('browsingContext.create',{type:'tab',userContext}));await ask('browsingContext.setViewport',{context,viewport:{width:390,height:1120},devicePixelRatio:1});await ask('browsingContext.navigate',{context,url:base+'index.html?fontfailure=1',wait:'complete'});await ready();const fallback=JSON.parse(await evaluate(`JSON.stringify({overflow:document.documentElement.scrollWidth>innerWidth,h1:document.querySelector('h1').textContent.replace(/\\s+/g,' ').trim(),loaded:[...document.fonts].filter(f=>f.status==='loaded').length})`));if(deniedFonts<3||fallback.overflow||fallback.loaded)throw new Error('Font failure test incomplete '+JSON.stringify(fallback));report.fontFailure={...fallback,failedFontRequests:deniedFonts};denyFonts=false;}
 const errorLogs=events.filter(e=>e.method==='log.entryAdded'&&e.params.type==='javascript'&&e.params.level==='error').map(e=>({scenario:e.scenario,text:e.params.text,source:e.params.source,stackTrace:e.params.stackTrace}));
 report.expectedFontFailureErrors=errorLogs.filter(e=>e.scenario==='font-failure'&&e.text.startsWith('downloadable font: download failed')&&e.text.includes(base+'assets/fonts/'));
 report.expectedThemeFailureErrors=errorLogs.filter(e=>e.scenario==='theme-script-failure'&&/^Loading failed for the <script>/.test(e.text)&&[...themeScriptPaths].some(p=>e.text.includes(new URL(base).origin+p)));
 report.pageErrors=errorLogs.filter(e=>!report.expectedFontFailureErrors.includes(e)&&!report.expectedThemeFailureErrors.includes(e));
 report.resourceFailures=events.filter(e=>e.method==='network.responseCompleted'&&e.params.response.status>=400).map(e=>({scenario:e.scenario,url:e.params.response.url,status:e.params.response.status}));
 const unexpected=report.resourceFailures.filter(e=>!(e.scenario==='font-failure'&&e.status===404&&e.url.includes(base+'assets/fonts/'))&&!(e.scenario==='missing-route'&&e.status===404&&e.url===base+'missing/deep/page')&&!(e.scenario==='theme-script-failure'&&e.status===503&&themeScriptPaths.has(new URL(e.url).pathname)));
 report.offMountRequests=events.filter(e=>e.method==='network.responseCompleted'&&/^https?:/.test(e.params.response.url)&&!e.params.response.url.startsWith(base)).map(e=>e.params.response.url);
 if(report.offMountRequests.length)throw new Error('Application fetched outside the site mount '+JSON.stringify(report.offMountRequests));
 if(unexpected.length||report.pageErrors.length)throw new Error('Unexpected resource or JS failure '+JSON.stringify({unexpected,errors:report.pageErrors}));
 const expectedCases=routes.flatMap(route=>sizes.map(([viewport])=>route+':'+viewport));
 const observedCases=report.cases.map(c=>c.route+':'+c.viewport);
 const expectedAnchors=documentAnchors.reduce((count,document)=>count+document.anchors.length,0);
 report.coverage={expectedCases:expectedCases.length,observedCases:observedCases.length,expectedAnchors,observedAnchors:report.anchors.length,textFixtures:report.textFixtures?.length,axeExecuted:report.axe.filter(a=>a.status==='executed').length,axeUnsupported:report.axe.filter(a=>a.status==='unsupported').length};
 if(JSON.stringify(expectedCases)!==JSON.stringify(observedCases)||report.anchors.length!==expectedAnchors||report.textFixtures?.length!==routes.length*4)throw new Error('Incomplete coverage '+JSON.stringify(report.coverage));
 }
 report.coverage.sidebarFocus=report.focusRegressions.sidebar.length;report.coverage.themeStress=report.focusRegressions.theme.length;
 if(verifiedManifestDigest()!==testedManifestSha256)throw new Error('Browser output changed during testing');
 report.result='pass';console.log('PASS '+report.cases.length+' viewport cases; '+report.anchors.length+' document anchors; '+report.coverage.axeExecuted+' accessibility scans; '+report.coverage.sidebarFocus+' sidebar focus traces; '+report.coverage.themeStress+' theme stress cases; '+report.unsupported.length+' unsupported probes (not conformance).');
 await ask('session.end');
}catch(error){report.result='failed';report.error=String(error.stack||error);console.error(report.error);process.exitCode=1;}
finally{fs.writeFileSync(path.join(evidence,'browser-qa'+suffix+'.json'),JSON.stringify(report,null,2));clearTimeout(deadline);if(socket)socket.close();ff.kill('SIGTERM');server.close();}
