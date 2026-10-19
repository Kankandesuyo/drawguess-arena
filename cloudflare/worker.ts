import {avatarSchema} from '../shared/avatar';
import {DurableObject} from 'cloudflare:workers';
import {z} from 'zod';
import {GameEngine,type Room} from '../server/game';
import {joinSchema,settingsSchema,strokeSchema} from '../shared/types';
import {assets} from './generated-assets';
interface Env {ROOMS:DurableObjectNamespace<DrawRoom>}
const packetSchema=z.object({id:z.string().max(60),event:z.string().max(30),data:z.unknown()});
const codeSchema=z.string().regex(/^[A-F0-9]{6}$/);
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function limitedBody(request:Request,limit:number){
 const reader=request.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();return null;}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(bytes);
}
export default {async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);const origin=request.headers.get('Origin');
 if(url.pathname.startsWith('/api/')){
  if(origin&&origin!==url.origin)return json({ok:false,error:'不允许跨站请求'},403);
  if(url.pathname==='/api/health')return json({ok:true,runtime:'cloudflare-durable-objects'});
  if(url.pathname==='/api/rooms'&&request.method==='POST'){
   if(Number(request.headers.get('Content-Length')||0)>12288)return json({ok:false,error:'请求太大'},413);
   const body=await limitedBody(request,12288);if(body===null)return json({ok:false,error:'请求太大'},413);
   let input:unknown;try{input=JSON.parse(body);}catch{return json({ok:false,error:'请求格式不正确'},400);}const parsed=joinSchema.safeParse(input);if(!parsed.success)return json({ok:false,error:'请输入正确的昵称与头像'},400);
   const code=Array.from(crypto.getRandomValues(new Uint8Array(3)),v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
   return env.ROOMS.getByName(code).fetch(new Request(`https://room.internal/create?code=${code}`,{method:'POST',body:JSON.stringify(parsed.data)}));
  }
  const match=/^\/api\/rooms\/([A-F0-9]{6})\/ws$/.exec(url.pathname);
  if(match&&request.headers.get('Upgrade')?.toLowerCase()==='websocket')return env.ROOMS.getByName(match[1]).fetch(request);
  return json({ok:false,error:'请求不存在'},404);
 }
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
 const path=decodeURIComponent(url.pathname);const asset=assets[path]??assets[path.endsWith('/')?`${path}index.html`:`${path}/index.html`];
 if(!asset)return new Response('Not found',{status:404});
 const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{encodeBody:'manual',headers:{'Content-Type':asset.type,'Content-Encoding':'gzip','Cache-Control':path.startsWith('/_next/')?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'}});
}} satisfies ExportedHandler<Env>;
type Attachment={sid:string;code:string;rates:Record<string,{at:number;n:number}>};
export class DrawRoom extends DurableObject<Env>{
 private engine:GameEngine;private room:Room|null=null;private dirty=false;
 constructor(ctx:DurableObjectState,env:Env){super(ctx,env);this.engine=new GameEngine(()=>{this.dirty=true;});ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS strokes (seq INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL)');const rows=ctx.storage.sql.exec<{data:string}>('SELECT data FROM room_state WHERE id=1').toArray();if(rows.length){this.room=JSON.parse(rows[0].data);this.room!.strokes=ctx.storage.sql.exec<{data:string}>('SELECT data FROM strokes ORDER BY seq').toArray().map(x=>JSON.parse(x.data));this.engine.rooms.set(this.room!.code,this.room!);const live=new Set(ctx.getWebSockets().map(ws=>(ws.deserializeAttachment() as Attachment).sid));for(const p of this.room!.players){if(p.online&&!live.has(p.socketId))this.engine.leave(this.room!,p);}if(this.dirty){this.persist();ctx.waitUntil(this.schedule());}}}
 private persist(rebuild=false){if(!this.room)return;const r=this.room;this.ctx.storage.transactionSync(()=>{const {strokes,...data}=r;this.ctx.storage.sql.exec('INSERT OR REPLACE INTO room_state(id,data) VALUES(1,?)',JSON.stringify(data));if(rebuild){this.ctx.storage.sql.exec('DELETE FROM strokes');for(const s of strokes)this.ctx.storage.sql.exec('INSERT INTO strokes(data) VALUES(?)',JSON.stringify(s));}});}
 private send(ws:WebSocket,event:string,data:unknown,id?:string){try{ws.send(JSON.stringify({event,data,...(id?{id}:{})}));}catch{}}
 private broadcast(){const r=this.room;if(!r)return;for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment() as Attachment;const p=r.players.find(p=>p.socketId===a.sid&&p.online);if(p)this.send(ws,'state',this.engine.view(r,p.id));}this.dirty=false;}
 private async schedule(){if(!this.room)return;const r=this.room;const due=r.deadline||Date.now()+1800000;await this.ctx.storage.setAlarm(Math.max(Date.now()+10,due));}
 async fetch(request:Request){const url=new URL(request.url);
  if(url.pathname==='/create'&&request.method==='POST'){
   if(this.room)return json({ok:false,error:'房间码冲突，请再次创建'},409);
   const d=joinSchema.parse(await request.json());const code=codeSchema.parse(url.searchParams.get('code'));const created=this.engine.create(d.name,d.avatar,crypto.randomUUID(),undefined,code);this.room=created.room;created.player.online=false;created.player.offlineAt=Date.now();this.persist();await this.schedule();return json({ok:true,code,token:created.player.token});
  }
  if(!this.room)return json({ok:false,error:'房间不存在，请检查房间码'},404);
  if(this.ctx.getWebSockets().length>=24)return json({ok:false,error:'房间连接已满'},429);
  const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);pair[1].serializeAttachment({sid:crypto.randomUUID(),code:this.room.code,rates:{}} satisfies Attachment);return new Response(null,{status:101,webSocket:pair[0]});
 }
 private limited(ws:WebSocket,event:string){const a=ws.deserializeAttachment() as Attachment;const now=Date.now();let rate=a.rates[event];if(!rate||now-rate.at>=1000)rate=a.rates[event]={at:now,n:0};const max=event==='draw'?70:event==='chat'?3:event==='avatar'?2:12;if(++rate.n>max)throw Error('操作太快，请稍候');ws.serializeAttachment(a);return a;}
 async webSocketMessage(ws:WebSocket,message:string|ArrayBuffer){let id='';try{
  if(typeof message!=='string'||message.length>24000)throw Error('消息过大或格式错误');
  const p=packetSchema.parse(JSON.parse(message));id=p.id;const a=this.limited(ws,p.event);const r=this.room;if(!r)throw Error('房间已失效，请重新创建');const previousTurn=r.turn;this.engine.tick();let result:Record<string,unknown>={};let rebuild=r.turn!==previousTurn;
  if(p.event==='join'){
   const d=joinSchema.parse(p.data);if(d.code?.toUpperCase()!==r.code)throw Error('房间码不正确');const existing=r.players.find(x=>x.socketId===a.sid&&x.online);if(existing&&existing.token!==d.token)throw Error('请先离开当前身份');const {player}=this.engine.join(r.code,d.name,d.avatar,a.sid,d.token);result={id:player.id,token:player.token,room:this.engine.view(r,player.id)};
  }else{
   const {player}=this.engine.locate(a.sid);
   switch(p.event){
    case 'avatar':{const d=z.object({avatar:avatarSchema}).strict().parse(p.data);this.engine.updateAvatar(r,player,d.avatar);break;}
    case 'ready':if(!['WAITING','GAME_RESULT'].includes(r.phase))throw Error('游戏进行中');player.ready=!player.ready;this.dirty=true;break;
    case 'start':this.engine.start(r,player);rebuild=true;break;
    case 'settings':{if(r.host!==player.id||r.phase!=='WAITING')throw Error('仅房主可在等待时修改设置');const s=settingsSchema.parse(p.data);if(s.maxPlayers<r.players.length)throw Error('人数上限小于当前人数');r.settings=s;this.dirty=true;break;}
    case 'select':{const d=z.object({index:z.number().int().min(0).max(2),turn:z.number().int()}).parse(p.data);if(d.turn!==r.turn)throw Error('回合已经更新');this.engine.select(r,player,d.index);break;}
    case 'chat':{const d=z.object({text:z.string().min(1).max(120),turn:z.number().int()}).parse(p.data);if(d.turn!==r.turn)throw Error('回合已经更新');this.engine.chat(r,player,d.text);break;}
    case 'draw':{const d=z.object({turn:z.number().int(),stroke:strokeSchema}).parse(p.data);this.engine.draw(r,player,d.turn,d.stroke);this.ctx.storage.sql.exec('INSERT INTO strokes(data) VALUES(?)',JSON.stringify(d.stroke));this.persist();for(const other of this.ctx.getWebSockets()){if(other===ws)continue;const oa=other.deserializeAttachment() as Attachment;if(r.players.some(x=>x.online&&x.socketId===oa.sid))this.send(other,'stroke',d);}this.send(ws,'ack',{ok:true},id);return;}
    case 'edit':{const d=z.object({turn:z.number().int(),action:z.enum(['undo','redo','clear'])}).parse(p.data);this.engine.edit(r,player,d.turn,d.action);rebuild=true;break;}
    case 'leave':this.engine.leave(r,player,true);break;
    default:throw Error('不支持的操作');
   }
  }
  this.persist(rebuild);await this.schedule();if(this.dirty)this.broadcast();this.send(ws,'ack',{ok:true,...result},id);
 }catch(e){const error=e instanceof z.ZodError?'输入格式不正确':e instanceof Error?e.message:'操作失败';this.send(ws,id?'ack':'notice',id?{ok:false,error}:error,id);}}
 async webSocketClose(ws:WebSocket,code:number,reason:string){await this.depart(ws);}
 async webSocketError(ws:WebSocket){await this.depart(ws);ws.close(1011,'连接发生错误');}
 private async depart(ws:WebSocket){try{const a=ws.deserializeAttachment() as Attachment;const {room,player}=this.engine.locate(a.sid);this.engine.leave(room,player);this.persist();await this.schedule();this.broadcast();}catch{}}
 async alarm(){if(!this.room)return;this.engine.tick();if(!this.engine.rooms.has(this.room.code)){this.ctx.storage.sql.exec('DELETE FROM strokes');this.ctx.storage.sql.exec('DELETE FROM room_state');this.room=null;return;}this.persist(true);if(this.dirty)this.broadcast();await this.schedule();}
}


