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
// Exercise the actual game integration with both players and unavailable storage.
const elements = new Map();
function element(){return {value:'',textContent:'',listeners:{},setAttribute(){},addEventListener(n,fn){this.listeners[n]=fn;}};}
for(const id of ['#bgmToggle'])elements.set(id,element());
const versionButtons = ['1','2'].map(version => Object.assign(element(), {dataset:{bgmVersion:version}}));
const player=()=>({current:null,play(n){this.current=n;},stop(){this.current=null;}});
const one=player(),two=player(),saved=new Map();
const fxOne={muted:false,play(n){this.last=n;},setMuted(m){this.muted=m;}},fxTwo={...fxOne};
const gameContext={window:{BGM:one,BGM2:two,SFX:fxOne,SFX2:fxTwo},$:s=>elements.get(s),game:null,duel:null,localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},document:{addEventListener(){},querySelectorAll(){return versionButtons;}}};
vm.createContext(gameContext);
const game=fs.readFileSync('public/game.js','utf8');
vm.runInContext(game.slice(game.indexOf('const BGM_MUTE_KEY'),game.lastIndexOf('return {};')),gameContext);
const mute=elements.get('#bgmToggle');
vm.runInContext("bgmPlay('lobby')",gameContext);assert.equal(one.current,'lobby');
versionButtons[1].listeners.click();assert.equal(one.current,null);assert.equal(two.current,'lobby');vm.runInContext("sfx('place')",gameContext);assert.equal(fxTwo.last,'place');assert.equal(fxOne.last,undefined);assert.equal(fxOne.muted,true);
mute.listeners.click({stopPropagation(){}});assert.equal(two.current,null);assert.ok(fxOne.muted&&fxTwo.muted);vm.runInContext("sfx('sell')",gameContext);assert.equal(fxTwo.last,'place');
versionButtons[0].listeners.click();assert.equal(one.current,null);
gameContext.localStorage.setItem=()=>{throw Error('blocked');};
gameContext.game={phase:'battle'};gameContext.duel={};
mute.listeners.click({stopPropagation(){}});assert.equal(one.current,'duel');vm.runInContext("sfx('click')",gameContext);assert.equal(fxOne.last,'click');assert.equal(fxOne.muted,false);
gameContext.game.phase='won';versionButtons[1].listeners.click();assert.equal(two.current,'victory');assert.equal(one.current,null);
console.log('PASS: 17 effects, throttling, independent SFX output, version routing, five scores, loop/ending timing, delayed scheduling, stop, mute, scene/version switching, blocked storage');
