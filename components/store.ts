'use client';
import {create} from 'zustand';
import type {RoomView,Stroke} from '../shared/types';
type State={room:RoomView|null;id:string;connected:boolean;set:(values:Partial<State>)=>void;stroke:(s:Stroke,turn:number)=>void};
export const useGame=create<State>(set=>({room:null,id:'',connected:false,set:values=>set(values),stroke:(s,turn)=>set(state=>({room:state.room&&state.room.turn===turn?{...state.room,strokes:[...state.room.strokes,s]}:state.room}))}));
