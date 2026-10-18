import {createServer} from 'node:http';
import next from 'next';
import {Server} from 'socket.io';
import {z} from 'zod';
import {GameEngine} from './game';
import {joinSchema,settingsSchema,strokeSchema} from '../shared/types';
const dev=process.env.NODE_ENV!=='production';const app=next({dev,hostname:process.env.HOST||'0.0.0.0',port:Number(process.env.PORT||3000)});await app.prepare();
const http=createServer(app.getRequestHandler());
const io=new Server(http,{maxHttpBufferSize:24000,allowRequest:(req,cb)=>{const origin=req.headers.origin;cb(null,!origin||origin===(process.env.APP_ORIGIN||`http://${req.headers.host}`));}});
const engine=new GameEngine(r=>{for(const p of r.players.filter(p=>p.online))io.to(p.socketId).emit('state',engine.view(r,p.id));});
io.on('connection',socket=>{const rates=new Map<string,{at:number;n:number}>();function limited(key:string,max:number){const now=Date.now();let v=rates.get(key);if(!v||now-v.at>=1000){v={at:now,n:0};rates.set(key,v);}if(++v.n>max)throw Error('操作太快，请稍候');}
 function on(event:string,fn:(data:any)=>unknown,limit=12){socket.on(event,(data,ack)=>{try{limited(event,limit);const result=fn(data);if(typeof ack==='function')ack({ok:true,...(result||{})});}catch(e){const message=e instanceof z.ZodError?'输入格式不正确':e instanceof Error?e.message:'操作失败';if(typeof ack==='function')ack({ok:false,error:message});else socket.emit('notice',message);}});}
 on('create',raw=>{const d=joinSchema.parse(raw);try{engine.locate(socket.id);throw Error('请先离开当前房间');}catch(e){if((e as Error).message!=='请先加入房间')throw e;}if(engine.rooms.size>=500)throw Error('服务器房间已满');const {room,player}=engine.create(d.name,d.avatar,socket.id);return {id:player.id,token:player.token,room:engine.view(room,player.id)};},2);
 on('join',raw=>{const d=joinSchema.parse(raw);try{engine.locate(socket.id);throw Error('请先离开当前房间');}catch(e){if((e as Error).message!=='请先加入房间')throw e;}const code=d.code?.toUpperCase();if(!code)throw Error('请输入房间码');const {room,player}=engine.join(code,d.name,d.avatar,socket.id,d.token);return {id:player.id,token:player.token,room:engine.view(room,player.id)};},3);
 on('ready',()=>{const {room,player}=engine.locate(socket.id);if(room.phase!=='WAITING'&&room.phase!=='GAME_RESULT')throw Error('游戏进行中');player.ready=!player.ready;engine.changed(room);});
 on('start',()=>{const {room,player}=engine.locate(socket.id);engine.start(room,player);});
 on('settings',raw=>{const {room,player}=engine.locate(socket.id);if(room.host!==player.id||room.phase!=='WAITING')throw Error('仅房主可在等待时修改设置');const s=settingsSchema.parse(raw);if(s.maxPlayers<room.players.length)throw Error('人数上限小于当前人数');room.settings=s;engine.changed(room);});
 on('select',raw=>{const d=z.object({index:z.number().int().min(0).max(2),turn:z.number().int()}).parse(raw);const {room,player}=engine.locate(socket.id);if(d.turn!==room.turn)throw Error('回合已经更新');engine.select(room,player,d.index);});
 on('chat',raw=>{const d=z.object({text:z.string().min(1).max(120),turn:z.number().int()}).parse(raw);const {room,player}=engine.locate(socket.id);if(d.turn!==room.turn)throw Error('回合已经更新');engine.chat(room,player,d.text);},3);
 on('draw',raw=>{const d=z.object({turn:z.number().int(),stroke:strokeSchema}).parse(raw);const {room,player}=engine.locate(socket.id);engine.draw(room,player,d.turn,d.stroke);for(const p of room.players.filter(x=>x.online&&x.id!==player.id))io.to(p.socketId).emit('stroke',{turn:room.turn,stroke:d.stroke});},70);
 on('edit',raw=>{const d=z.object({turn:z.number().int(),action:z.enum(['undo','redo','clear'])}).parse(raw);const {room,player}=engine.locate(socket.id);engine.edit(room,player,d.turn,d.action);});
 on('leave',()=>{const {room,player}=engine.locate(socket.id);engine.leave(room,player,true);});
 on('disconnect',()=>{try{const {room,player}=engine.locate(socket.id);engine.leave(room,player);}catch{}});
});
setInterval(()=>engine.tick(),250).unref();http.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log('DrawGuess Arena → http://localhost:'+ (process.env.PORT||3000)));
