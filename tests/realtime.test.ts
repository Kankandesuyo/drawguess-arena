import test from 'node:test';
import assert from 'node:assert/strict';
import {io,type Socket} from 'socket.io-client';
import type {RoomView} from '../shared/types';
type Response={ok:boolean;error?:string;room:RoomView;id:string;token:string};
const url=process.env.LIVE_URL;
test('live multiplayer: permissions, canvas sync, secret answer, reconnect and complete game', {skip:!url,timeout:70000},async()=>{
 const sockets:Socket[]=[];const states=new Map<Socket,RoomView>();
 async function connect(){const s=io(url!,{transports:['websocket'],forceNew:true});sockets.push(s);s.on('state',r=>states.set(s,r));await new Promise<void>((resolve,reject)=>{s.once('connect',()=>resolve());s.once('connect_error',reject);});return s;}
 function emit(s:Socket,event:string,data:unknown={}){return new Promise<Response>((resolve,reject)=>{s.timeout(3000).emit(event,data,(err:Error|null,a:Response)=>err?reject(err):resolve(a));});}
 async function wait(s:Socket,p:(r:RoomView)=>boolean){const start=Date.now();while(Date.now()-start<12000){const r=states.get(s);if(r&&p(r))return r;await new Promise(r=>setTimeout(r,30));}throw Error('state timeout');}
 try{const a=await connect();let b=await connect();const aa=await emit(a,'create',{name:'自动验收A',avatar:0});let bb=await emit(b,'join',{code:aa.room.code,name:'自动验收B',avatar:1});assert(bb.ok);assert.equal(bb.room.players.length,2);assert(!JSON.stringify(bb.room).includes(aa.token));assert(!(await emit(b,'settings',bb.room.settings)).ok);const oldId=bb.id,oldToken=bb.token;b.disconnect();b=await connect();bb=await emit(b,'join',{code:aa.room.code,name:'自动验收B',avatar:1,token:oldToken});assert(bb.ok);assert.equal(bb.id,oldId);await emit(b,'ready');assert((await emit(a,'start')).ok);assert(!(await emit(a,'start')).ok);
 for(let turn=1;turn<=6;turn++){const r=await wait(a,r=>r.phase==='WORD_SELECTION'&&r.turn===turn);const d=r.drawer===aa.id?a:b;const g=d===a?b:a;const drawing=await wait(d,r=>r.phase==='WORD_SELECTION'&&!!r.choices);const secret=drawing.choices![0];assert(!states.get(g)?.choices);await emit(d,'select',{index:0,turn});await wait(g,r=>r.phase==='DRAWING');assert(!states.get(g)?.answer);const stroke={id:`s${turn}`,color:'#5865ef',width:5,points:[{x:.2,y:.3},{x:.7,y:.8}]};assert(!(await emit(g,'draw',{turn,stroke})).ok);assert(!(await emit(d,'draw',{turn:turn-1,stroke})).ok);
 const synced=new Promise<any>(resolve=>g.once('stroke',resolve));assert((await emit(d,'draw',{turn,stroke})).ok);assert.equal((await synced).stroke.points[1].x,.7);
 if(turn===1){const c=await connect();const cc=await emit(c,'join',{code:aa.room.code,name:'新加入C',avatar:2});assert.equal(cc.room.strokes.length,1);assert(!cc.room.answer);await emit(c,'leave');c.disconnect();}
 assert(!(await emit(d,'chat',{turn,text:secret})).ok);const score=states.get(g)!.players.find(p=>p.id===(g===a?aa.id:bb.id))!.score;assert((await emit(g,'chat',{turn,text:'错误答案'})).ok);assert((await emit(g,'chat',{turn,text:` ${secret} `})).ok);const after=await wait(g,r=>r.phase==='ROUND_RESULT');assert.equal(after.players.find(p=>p.id===(g===a?aa.id:bb.id))!.score,score+100);await emit(g,'chat',{turn,text:secret});assert.equal(states.get(g)!.players.find(p=>p.id===(g===a?aa.id:bb.id))!.score,score+100);
 }
 const done=await wait(a,r=>r.phase==='GAME_RESULT');assert.equal(done.players.reduce((n,p)=>n+p.score,0),750);
 }finally{sockets.forEach(s=>s.disconnect());}
});

