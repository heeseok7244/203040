const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let clock = 0, nextId = 0;
const timers = new Map(), sources = [];
const param = () => ({ value: 0, setValueAtTime(v,t) { assert.ok(Number.isFinite(v) && Number.isFinite(t)); }, linearRampToValueAtTime(v,t) { assert.ok(Number.isFinite(v) && Number.isFinite(t)); }, exponentialRampToValueAtTime(v,t) { assert.ok(v > 0 && Number.isFinite(t)); }, setTargetAtTime() {}, cancelScheduledValues() {} });
const node = () => ({ gain:param(), frequency:param(), pan:param(), connect(n){return n;},disconnect(){},start(t){assert.ok(t >= clock);sources.push(this);},stop(t){this.end=t;} });
class AudioContext {
  get currentTime(){return clock;} sampleRate=44100; state='running'; destination={};
  createStereoPanner(){return node();} createGain(){return node();} createDynamicsCompressor(){return node();} createOscillator(){return node();} createBufferSource(){return node();} createBiquadFilter(){return node();}
  createBuffer(c,n){return {getChannelData:()=>new Float32Array(n)};}
}
const context = {window:{AudioContext},setInterval(fn){timers.set(++nextId,fn);return nextId;},clearInterval(id){timers.delete(id);},setTimeout(fn){fn();}};
vm.createContext(context);
let source = fs.readFileSync('public/bgm2.js','utf8');
source = source.replace('let ctx, master', 'global.testSongs = SONGS; let ctx, master');
vm.runInContext(source,context);
const bgm = context.window.BGM2;
function advance(seconds) { const until=clock+seconds; while(clock<until){clock+=0.025;for(const fn of [...timers.values()])fn();} }
for(const [name,song] of Object.entries(context.window.testSongs)) {
  for(const tr of song.tracks) assert.equal(tr.notes.reduce((a,n)=>a+n[1],0), song.beats, name+' track length');
  bgm.play(name);assert.equal(bgm.current,name);assert.equal(timers.size,1);
  advance(song.beats*60/song.bpm+0.3);
  assert.equal(bgm.current,song.loop?name:null);
  bgm.stop();assert.equal(timers.size,0);assert.equal(bgm.current,null);
}
bgm.play('duel');clock+=300;advance(0.1);assert.equal(bgm.current,'duel');bgm.stop();
bgm.setVolume(0);assert.equal(bgm.toggleMute(),true);assert.equal(bgm.toggleMute(),false);
const effects = context.window.SFX2;
const legacy = {window:{},performance:{now:()=>clock*1000}};
vm.createContext(legacy); vm.runInContext(fs.readFileSync('public/bgm.js','utf8'),legacy);
assert.deepEqual(Array.from(effects.names).sort(),Array.from(legacy.window.SFX.names).sort());
for(const name of effects.names) {
  effects.stop(); const before=sources.length;effects.play(name);assert.ok(sources.length>before,name+' emits audio');
  const emitted=sources.length;effects.play(name);assert.equal(sources.length,emitted,name+' throttled');
}
effects.stop();effects.setMuted(true);let before=sources.length;effects.play('click');assert.equal(sources.length,before);
effects.setMuted(false);effects.setVolume(0);effects.play('place');assert.equal(sources.length,before);effects.setVolume(0.8);
effects.play('craft');const effectSources=sources.slice(before),ends=effectSources.map(n=>n.end);bgm.stop();assert.deepEqual(effectSources.map(n=>n.end),ends,'music stop preserves effects');
effects.setMuted(true);assert.ok(effectSources.every(n=>n.end===clock+0.02));
// Exercise the actual game integration: one BGM (version 2), two toggles sharing state, unavailable storage,
// and the lobby start that retries until the audio context is really running.
function element(){return {value:'',textContent:'',listeners:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},classList:{contains(){return true;}},addEventListener(n,fn){this.listeners[n]=fn;}};}
const toggles=[element(),element()];
const two={current:null,running:false,unlocked:0,play(n){this.current=n;},stop(){this.current=null;},unlock(){this.unlocked++;}};
const saved=new Map();
const fxTwo={muted:false,play(n){this.last=n;},setMuted(m){this.muted=m;}};
const docListeners=new Map();
const gameContext={window:{BGM2:two,SFX2:fxTwo},$:()=>null,game:null,duel:null,
  localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},
  document:{addEventListener(n,fn){docListeners.set(n+':'+fn.name,fn);},removeEventListener(n,fn){docListeners.delete(n+':'+fn.name);},querySelectorAll(){return toggles;}}};
vm.createContext(gameContext);
const game=fs.readFileSync('public/game.js','utf8');
vm.runInContext(game.slice(game.indexOf('const BGM_MUTE_KEY'),game.lastIndexOf('return {};')),gameContext);
assert.ok(toggles.every(t=>t.textContent==='🔊'));
vm.runInContext("bgmPlay('lobby')",gameContext);assert.equal(two.current,'lobby');
vm.runInContext("sfx('place')",gameContext);assert.equal(fxTwo.last,'place');assert.equal(fxTwo.muted,false);
const evt={stopPropagation(){}};
toggles[0].listeners.click(evt);assert.equal(two.current,null);assert.ok(fxTwo.muted);assert.ok(toggles.every(t=>t.textContent==='🔇'));
vm.runInContext("sfx('sell')",gameContext);assert.equal(fxTwo.last,'place');assert.equal(saved.get('patent-siege.bgmMuted'),'1');
gameContext.localStorage.setItem=()=>{throw Error('blocked');};
gameContext.game={phase:'battle'};gameContext.duel={};
toggles[1].listeners.click(evt);assert.equal(two.current,'duel');assert.equal(fxTwo.muted,false);assert.ok(toggles.every(t=>t.textContent==='🔊'));
// lobby start: keeps listening while the context is suspended, stops once it runs
gameContext.game=null;gameContext.duel=null;two.current=null;
const lobbyStarts=[...docListeners.values()].filter(fn=>fn.name==='startLobbyBgm');assert.ok(lobbyStarts.length>=3,'lobby start on several inputs');
lobbyStarts[0]();assert.equal(two.unlocked,1);assert.equal(two.current,'lobby');assert.ok([...docListeners.values()].some(fn=>fn.name==='startLobbyBgm'),'still armed while suspended');
two.running=true;lobbyStarts[0]();assert.equal(two.current,'lobby');assert.ok(![...docListeners.values()].some(fn=>fn.name==='startLobbyBgm'),'disarmed once running');
// suspended context: play() must defer scheduling until resume() settles
timers.clear();let resolved;
const susCtx={window:{AudioContext:class extends AudioContext{state='suspended';resume(){return new Promise(r=>{resolved=()=>{this.state='running';r();};});}}},setInterval:context.setInterval,clearInterval:context.clearInterval,setTimeout(fn){fn();}};
vm.createContext(susCtx);vm.runInContext(fs.readFileSync('public/bgm2.js','utf8'),susCtx);
const sus=susCtx.window.BGM2;sus.play('lobby');assert.equal(sus.current,'lobby');assert.equal(timers.size,0,'no scheduling while suspended');assert.equal(sus.running,false);
resolved();
setTimeout(()=>{assert.equal(timers.size,1,'scheduling starts after resume');assert.equal(sus.running,true);
  console.log('PASS: 17 effects, throttling, independent SFX output, five scores, loop/ending timing, delayed scheduling, stop, mute, shared toggles, blocked storage, lobby retry, deferred start after resume');});
