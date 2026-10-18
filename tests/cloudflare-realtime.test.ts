import test from 'node:test';
import assert from 'node:assert/strict';
import type {RoomView} from '../shared/types';
const url=process.env.CF_TEST_URL;
type Peer={ws:WebSocket;state?:RoomView;id?:string;token?:string;pending:Map<string,(v:any)=>void>;strokes:any[]};
test('Cloudflare WebSocket complete multiplayer game, authorization and reconnect',{skip:!url,timeout:90000},async()=>{
const peers:Peer[]=[];
async function open(code:string){const ws=new WebSocket(url!.replace(/^http/,'ws')+`/api/rooms/${code}/ws`);const p:Peer={ws,pending:new Map(),strokes:[]};peers.push(p);ws.addEventListener('message',event=>{const d=JSON.parse(String(event.data));if(d.event==='state')p.state=d.data;if(d.event==='stroke')p.strokes.push(d.data);if(d.event==='ack'){p.pending.get(d.id)?.(d.data);p.pending.delete(d.id);}});await new Promise<void>((resolve,reject)=>{ws.onopen=()=>resolve();ws.onerror=()=>reject(Error('WebSocket failed'));});return p;}
function send(p:Peer,event:string,data:unknown={}){const id=crypto.randomUUID();return new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('ack timeout '+event)),10000);p.pending.set(id,a=>{clearTimeout(timer);resolve(a);});p.ws.send(JSON.stringify({id,event,data}));});}
async function wait(p:Peer,fn:(r:RoomView)=>boolean){const start=Date.now();while(Date.now()-start<13000){if(p.state&&fn(p.state))return p.state;await new Promise(r=>setTimeout(r,40));}throw Error('state timeout');}
async function join(p:Peer,code:string,name:string,token?:string){const a=await send(p,'join',{code,name,avatar:0,...(token?{token}:{})});assert(a.ok,a.error);p.id=a.id;p.token=a.token;return a;}
try{
const created=await fetch(url+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'云端画手',avatar:0})}).then(r=>r.json()) as any;assert(created.ok,created.error);const code=created.code;
const a=await open(code);await join(a,code,'云端画手',created.token);let b=await open(code);await join(b,code,'云端猜手');assert(!(await send(b,'settings',b.state!.settings)).ok);assert(!JSON.stringify(b.state).includes(a.token!));
const oldId=b.id,token=b.token;b.ws.close();await new Promise(r=>setTimeout(r,150));b=await open(code);await join(b,code,'云端猜手',token);assert.equal(b.id,oldId);await send(b,'ready');assert((await send(a,'start')).ok);
for(let turn=1;turn<=6;turn++){
 const state=await wait(a,r=>r.phase==='WORD_SELECTION'&&r.turn===turn);const d=state.drawer===a.id?a:b,g=d===a?b:a;const options=await wait(d,r=>!!r.choices);assert(!g.state?.choices);const answer=options.choices![0];assert((await send(d,'select',{turn,index:0})).ok);await wait(g,r=>r.phase==='DRAWING');assert(!g.state?.answer);assert(!(await send(d,'chat',{turn,text:answer})).ok);
 const stroke={id:'draw'+turn,color:'#5865ef',width:5,points:[{x:.1,y:.2},{x:.6,y:.8}]};assert(!(await send(g,'draw',{turn,stroke})).ok);assert(!(await send(d,'draw',{turn:turn-1,stroke})).ok);assert((await send(d,'draw',{turn,stroke})).ok);const started=Date.now();while(!g.strokes.some(x=>x.turn===turn)){if(Date.now()-started>5000)throw Error('stroke not synced');await new Promise(r=>setTimeout(r,20));}
 if(turn===1){const c=await open(code);const cc=await join(c,code,'晚加入玩家');assert.equal(cc.room.strokes.length,1);assert(!cc.room.answer);await send(c,'leave');c.ws.close();}
 await send(d,'edit',{turn,action:'undo'});await wait(g,r=>r.strokes.length===0);await send(d,'edit',{turn,action:'redo'});await wait(g,r=>r.strokes.length===1);
 const before=g.state!.players.find(x=>x.id===g.id)!.score;await send(g,'chat',{turn,text:'错误答案'});assert((await send(g,'chat',{turn,text:answer})).ok);await wait(g,r=>r.phase==='ROUND_RESULT');assert.equal(g.state!.players.find(x=>x.id===g.id)!.score,before+100);await send(g,'chat',{turn,text:answer});assert.equal(g.state!.players.find(x=>x.id===g.id)!.score,before+100);
}
const result=await wait(a,r=>r.phase==='GAME_RESULT');assert.equal(result.players.reduce((n,p)=>n+p.score,0),750);await send(a,'leave');await wait(b,r=>r.host===b.id);await send(b,'leave');
}finally{peers.forEach(p=>p.ws.close());}
});
