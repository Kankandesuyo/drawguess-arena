import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'画猜俱乐部 · DrawGuess Arena',description:'和朋友一起在线画画、猜词，开启脑洞派对。'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
