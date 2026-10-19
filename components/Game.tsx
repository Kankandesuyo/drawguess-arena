"use client";
import { useEffect, useRef, useState } from "react";
import { createRealtimeSocket, type RealtimeSocket } from "./realtime";
import { motion } from "framer-motion";
import {
  Pencil,
  BookOpen,
  Sun,
  Moon,
  Users,
  Plus,
  Link,
  Copy,
  Clock3,
  Send,
  Settings2,
  LogOut,
  Trophy,
  ArrowRight,
  Volume2,
  VolumeX,
  X,
  Check,
  Crown,
  ChevronDown,
} from "lucide-react";
import type { RoomView, Settings, Stroke } from "../shared/types";
import { useGame } from "./store";
import { Button } from "./ui";
import Board from "./Board";
import { useDialog } from "./useDialog";
import { useVisualViewport } from "./useVisualViewport";
import { avatarSchema, type Avatar } from "../shared/avatar";
import AvatarEditor from "./AvatarEditor";
import AvatarImage from "./AvatarImage";
type Ack = {
  ok: boolean;
  error?: string;
  room?: RoomView;
  id?: string;
  token?: string;
};
export default function Game() {
  const { room, id, connected, set, stroke } = useGame();
  const [socket, setSocket] = useState<RealtimeSocket | null>(null);
  const [name, setName] = useState("灵魂小画家");
  const [avatar, setAvatar] = useState<Avatar>(0);
  const [code, setCode] = useState("");
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<
    "help" | "settings" | "join" | "leave" | "avatar" | null
  >(null);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const keyboardOpen = useVisualViewport();
  const [chatFocused, setChatFocused] = useState(false);
  const chatInput = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const chatSending = useRef(false);
  const sendPointer = useRef<number | null>(null);
  const avatarReturn = useRef<"join" | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const playersRef = useRef<HTMLElement>(null);
  useDialog(!!modal, modalRef, () => closeModal());
  useDialog(playersOpen && !modal, playersRef, () => setPlayersOpen(false));
  const [dark, setDark] = useState(false);
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  const prevSuccess = useRef("");
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.dataset.playing = room ? "true" : "false";
    if (room) window.scrollTo(0, 0);
    return () => {
      delete document.documentElement.dataset.playing;
    };
  }, [room?.code]);
  useEffect(() => {
    if (!room) {
      setPlayersOpen(false);
      setModal((current) =>
        current === "settings" || current === "leave" ? null : current,
      );
    }
  }, [room?.code]);
  function flash(s: string) {
    setNotice(s);
    setTimeout(() => setNotice(""), 4000);
  }
  useEffect(() => {
    const stored = localStorage.getItem("drawguess-profile");
    if (stored) {
      try {
        const p = JSON.parse(stored);
        if (typeof p.name === "string") setName(p.name.slice(0, 16));
        const savedAvatar = avatarSchema.safeParse(p.avatar);
        if (savedAvatar.success) setAvatar(savedAvatar.data);
      } catch {}
    }
    const c = new URLSearchParams(location.search).get("room");
    if (c) {
      setCode(c.toUpperCase());
      setModal("join");
    }
    const s = createRealtimeSocket();
    setSocket(s);
    s.on("state", (r: RoomView) => {
      offset.current = r.serverNow - Date.now();
      set({ room: r });
    });
    s.on("stroke", (d: { turn: number; stroke: Stroke }) =>
      stroke(d.stroke, d.turn),
    );
    s.on("notice", flash);
    s.on("connect", () => {
      set({ connected: true });
      const saved = sessionStorage.getItem("drawguess-session");
      if (saved) {
        try {
          const p = JSON.parse(saved);
          s.emit("join", p, (a: Ack) => {
            if (a.ok) {
              set({ room: a.room!, id: a.id! });
              setModal(null);
            } else {
              sessionStorage.removeItem("drawguess-session");
              set({ room: null, id: "" });
              flash(a.error!);
            }
          });
        } catch {
          sessionStorage.removeItem("drawguess-session");
        }
      }
    });
    s.on("disconnect", () => set({ connected: false }));
    s.connect();
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => {
      s.disconnect();
      clearInterval(timer);
    };
  }, [set, stroke]);
  useEffect(() => {
    const container = bottom.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
    const success = room?.messages.filter((m) => m.kind === "success").at(-1);
    if (success && success.id !== prevSuccess.current) {
      prevSuccess.current = success.id;
      if (soundRef.current) {
        const a = new AudioContext();
        const o = a.createOscillator(),
          g = a.createGain();
        o.connect(g);
        g.connect(a.destination);
        o.frequency.value = 660;
        g.gain.setValueAtTime(0.08, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.25);
        o.start();
        o.stop(a.currentTime + 0.25);
        o.onended = () => void a.close();
      }
    }
  }, [room?.messages]);
  useEffect(() => {
    const container = bottom.current?.parentElement;
    if (!container || !room) return;
    // Keyboard animation resizes the scroller without adding a new message.
    // Keep recent messages above the composer throughout that animation.
    const follow = () => { container.scrollTop = container.scrollHeight; };
    const observer = new ResizeObserver(follow);
    observer.observe(container);
    const frame = requestAnimationFrame(follow);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [room?.code, chatFocused, keyboardOpen]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  function emit(event: string, data: unknown = {}, success?: () => void) {
    if (pending) return;
    if (!socket?.connected) {
      flash("连接中，请稍候");
      return;
    }
    setPending(event);
    socket.emit(event, data, (a: Ack) => {
      setPending(null);
      if (!a.ok) flash(a.error ?? "操作失败");
      else success?.();
    });
  }
  function sendChat() {
    const draft = chatInput.current?.value ?? text;
    if (!draft.trim() || cannotChat || pending || chatSending.current) return;
    if (!socket?.connected) {
      flash("连接中，请稍候");
      return;
    }
    // Explicit Send also accepts an IME candidate; Enter still only confirms it.
    chatSending.current = true;
    setPending("chat");
    socket.emit("chat", { text: draft, turn: room?.turn }, (a: Ack) => {
      chatSending.current = false;
      setPending(null);
      if (!a.ok) flash(a.error ?? "发送失败，请重试");
      else setText((current) => (current === draft ? "" : current));
    });
  }
  function enter(event: "create" | "join") {
    if (pending) return;
    if (!name.trim()) {
      flash("先给自己起个昵称吧");
      return;
    }
    if (!socket?.connected) {
      flash("连接中，请稍候");
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur();
    setPending(event);
    socket.emit(
      event,
      { name: name.trim(), avatar, code: code.trim().toUpperCase() },
      (a: Ack) => {
        setPending(null);
        if (!a.ok) {
          flash(a.error!);
          return;
        }
        set({ room: a.room!, id: a.id! });
        sessionStorage.setItem(
          "drawguess-session",
          JSON.stringify({ name, avatar, code: a.room!.code, token: a.token }),
        );
        localStorage.setItem(
          "drawguess-profile",
          JSON.stringify({ name, avatar }),
        );
        history.replaceState(null, "", `?room=${a.room!.code}`);
        setModal(null);
      },
    );
  }
  function openAvatar(returnTo: "join" | null = null) {
    avatarReturn.current = returnTo;
    setPlayersOpen(false);
    setModal("avatar");
  }
  function closeModal() {
    if (pending) return;
    if (modal === "avatar") {
      setModal(avatarReturn.current);
      avatarReturn.current = null;
    } else setModal(null);
  }
  function saveAvatar(value: Avatar) {
    const save = () => {
      setAvatar(value);
      try {
        localStorage.setItem(
          "drawguess-profile",
          JSON.stringify({ name, avatar: value }),
        );
        const stored = sessionStorage.getItem("drawguess-session");
        if (stored) {
          const session = JSON.parse(stored);
          session.avatar = value;
          sessionStorage.setItem("drawguess-session", JSON.stringify(session));
        }
      } catch {
        flash("头像已应用，但浏览器未允许保存到本机");
      }
      setModal(avatarReturn.current);
      avatarReturn.current = null;
    };
    if (room) emit("avatar", { avatar: value }, save);
    else save();
  }
  async function invite() {
    if (!room) {
      setModal("join");
      return;
    }
    const url = `${location.origin}/?room=${room.code}`;
    if (window.matchMedia("(pointer: coarse)").matches && navigator.share) {
      try {
        await navigator.share({
          title: "一起玩你画我猜",
          text: `加入房间 ${room.code}，一起画画猜词！`,
          url,
        });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    await copyInvite();
  }
  async function copyInvite() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/?room=${room.code}`,
      );
      flash("邀请链接已复制，发给朋友就能加入");
    } catch {
      flash(`房间码：${room.code}`);
    }
  }
  const host = room?.host === id;
  const me = room?.players.find((p) => p.id === id);
  const isDrawer = room?.drawer === id;
  const waiting = !room || room.phase === "WAITING";
  const online = room?.players.filter((p) => p.online) ?? [];
  const unready = online.filter((p) => p.id !== room?.host && !p.ready).length;
  const canStart = connected && online.length >= 2 && unready === 0 && !pending;
  const roundIndex =
    room && !waiting
      ? Math.min(
          room.settings.rounds,
          Math.max(
            1,
            Math.ceil(
              room.turn / (room.totalTurns / room.settings.rounds || 1),
            ),
          ),
        )
      : 1;
  const startHint =
    online.length < 2
      ? "至少 2 人在线才能开始，先邀请朋友吧"
      : unready
        ? `等待 ${unready} 位朋友准备`
        : "大家准备好了，房主可以开始";
  const cannotChat =
    !room ||
    !connected ||
    (room.phase === "DRAWING" && (isDrawer || !!me?.guessed));
  const seconds = room?.deadline
    ? Math.max(0, Math.ceil((room.deadline - now - offset.current) / 1000))
    : room?.phase === "GAME_RESULT"
      ? 0
      : (room?.settings.duration ?? 90);
  const phaseLabels = {
    WAITING: "等待开始",
    WORD_SELECTION: "画手选词中",
    DRAWING: "脑洞时间",
    ROUND_RESULT: "本轮结算",
    GAME_RESULT: "本局结束",
  };
  function leave() {
    emit("leave", {}, () => {
      sessionStorage.removeItem("drawguess-session");
      set({ room: null, id: "" });
      setModal(null);
      setPlayersOpen(false);
      history.replaceState(null, "", "/");
    });
  }
  return (
    <div
      className={`app-shell ${room ? "playing" : ""} ${keyboardOpen ? "keyboard-open" : ""} ${chatFocused ? "composer-focused" : ""}`}
    >
      <header className="header">
        <div className="brand">
          <div className="brand-icon">
            <Pencil size={26} />
          </div>
          <strong>画猜俱乐部</strong>
          <span>DrawGuess Arena</span>
        </div>
        <nav>
          <button aria-label="玩法指南" onClick={() => setModal("help")}>
            <BookOpen size={18} />
            <span>玩法指南</span>
          </button>
          <i />
          <button
            className="icon-circle"
            aria-label="切换主题"
            onClick={() => setDark(!dark)}
          >
            {dark ? <Moon size={20} /> : <Sun size={21} />}
          </button>
          <button
            className="sound"
            aria-label="切换音效"
            title={sound ? "关闭音效" : "开启音效"}
            onClick={() => {
              soundRef.current = !sound;
              setSound(!sound);
            }}
          >
            {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
        </nav>
      </header>
      <main className={room ? "in-room" : "lobby"}>
        {room && (
          <div className="mobile-room-bar">
            <button
              aria-label="查看玩家与房间"
              aria-expanded={playersOpen}
              onClick={() => setPlayersOpen(true)}
            >
              <Users size={18} />
              <span>
                {online.length}/{room.settings.maxPlayers} 人 · 房间 {room.code}
              </span>
            </button>
            <span className={connected ? "connection" : "offline"}>
              {connected ? "● 在线" : "● 重连中"}
            </span>
            <button aria-label="邀请朋友" onClick={invite}>
              <Plus size={18} />
              <span>邀请</span>
            </button>
          </div>
        )}
        <div className="breadcrumb">
          游戏大厅 <span>/</span> 好友房间{" "}
          <span className={connected ? "connection" : "offline"}>
            ● {connected ? "已连接" : "连接中"}
          </span>
        </div>
        <section className="intro">
          <div>
            <h1>
              画得开心，猜得尽兴<span className="lime-marks">。</span>
            </h1>
            <p>几笔天马行空，一场默契大考验。</p>
          </div>
          <button className="friend-pill" onClick={invite}>
            <Users size={22} />
            和朋友一起，快乐加倍
            <ArrowRight size={17} />
          </button>
        </section>
        {!room && (
          <section className="mobile-lobby panel">
            <div className="lobby-label">准备好你的昵称</div>
            <div className="mobile-profile">
              <button
                className="avatar"
                aria-label="设置我的头像"
                onClick={() => openAvatar()}
              >
                <AvatarImage value={avatar} />
                <Pencil size={14} />
              </button>
              <label htmlFor="mobile-name">
                朋友会在房间里看到你
                <input
                  id="mobile-name"
                  aria-label="手机昵称"
                  maxLength={16}
                  autoComplete="nickname"
                  enterKeyHint="done"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            </div>
            <Button
              disabled={!connected || !!pending || !name.trim()}
              onClick={() => enter("create")}
            >
              <Plus size={20} />
              {pending === "create" ? "正在创建…" : "创建好友房间"}
            </Button>
            <Button
              className="outline"
              disabled={!!pending}
              onClick={() => setModal("join")}
            >
              输入房间码加入
              <ArrowRight size={18} />
            </Button>
            <p>2–12 人在线玩 · 无需注册 · 轮流画画猜词</p>
          </section>
        )}
        {playersOpen && (
          <button
            className="players-backdrop"
            aria-label="收起玩家面板"
            onClick={() => setPlayersOpen(false)}
          />
        )}
        <div className="arena">
          <aside
            ref={playersRef}
            tabIndex={-1}
            role={playersOpen ? "dialog" : undefined}
            aria-modal={playersOpen || undefined}
            aria-label={playersOpen ? "玩家与房间" : undefined}
            className={`players panel ${playersOpen ? "players-open" : ""}`}
          >
            <div className="panel-title">
              <h2>房间玩家</h2>
              <button
                className="mobile-close"
                aria-label="关闭玩家面板"
                onClick={() => setPlayersOpen(false)}
              >
                <X size={22} />
              </button>
              <span>
                {room?.players.length ?? 0} / {room?.settings.maxPlayers ?? 8}
              </span>
            </div>
            {!room && (
              <div className="profile">
                <button
                  className="avatar"
                  aria-label="设置我的头像"
                  onClick={() => openAvatar()}
                >
                  <AvatarImage value={avatar} />
                  <Pencil size={12} />
                </button>
                <div>
                  <label htmlFor="nickname">你的昵称</label>
                  <input
                    id="nickname"
                    aria-label="你的昵称"
                    maxLength={16}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="player-list">
              {room?.players
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((p, i) => (
                  <motion.div
                    layout
                    className={`player ${p.id === room.drawer && !waiting ? "drawing" : ""}`}
                    key={p.id}
                  >
                    <span className="rank">{i + 1}</span>
                    <span className="avatar">
                      <AvatarImage value={p.avatar} />
                    </span>
                    <div className="player-info">
                      <strong>
                        {p.name}
                        {p.id === id && <small>我</small>}
                      </strong>
                      <span>
                        {p.id === room.host ? (
                          <>
                            <Crown size={11} /> 房主
                          </>
                        ) : p.guessed ? (
                          "✓ 猜对啦"
                        ) : p.id === room.drawer && !waiting ? (
                          "✎ 正在绘画"
                        ) : p.online ? (
                          p.ready ? (
                            "● 已准备"
                          ) : (
                            "● 已加入"
                          )
                        ) : (
                          "暂时离线"
                        )}
                      </span>
                    </div>
                    <b className="score">
                      {p.score}
                      <small>分</small>
                    </b>
                  </motion.div>
                ))}
              {Array.from(
                { length: Math.max(0, 4 - (room?.players.length ?? 0)) },
                (_, i) => (
                  <button className="empty-player" key={i} onClick={invite}>
                    <span>
                      <Plus size={20} />
                    </span>
                    <div>
                      邀请朋友加入<small>一起画画猜词吧！</small>
                    </div>
                  </button>
                ),
              )}
            </div>
            <div className="room-share">
              {room && (
                <button className="edit-my-avatar" onClick={() => openAvatar()}>
                  <span className="avatar">
                    <AvatarImage value={me?.avatar ?? avatar} />
                  </span>
                  <span>
                    修改我的头像<small>只会修改你自己的头像</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              )}
              <div className="room-code-line">
                <span>房间号</span>
                <strong>{room?.code ?? "未加入"}</strong>
                {room && (
                  <button
                    aria-label="复制房间码"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(room.code)
                        .then(() => flash("房间码已复制"))
                        .catch(() => flash(room.code));
                    }}
                  >
                    <Copy size={15} />
                  </button>
                )}
              </div>
              <p>
                {room
                  ? "分享房间号，邀请朋友一起玩"
                  : "给自己起个名字，开启脑洞派对"}
              </p>
              <Button
                className="outline"
                onClick={room ? copyInvite : () => setModal("join")}
              >
                {room ? <Link size={17} /> : <Plus size={17} />}{" "}
                {room ? "复制邀请链接" : "输入房间码加入"}
              </Button>
              {room && (
                <div className="room-actions">
                  {host && (
                    <button
                      onClick={() => {
                        setPlayersOpen(false);
                        setModal("settings");
                      }}
                      disabled={!waiting}
                    >
                      <Settings2 size={14} />
                      房间设置
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setPlayersOpen(false);
                      setModal("leave");
                    }}
                  >
                    <LogOut size={14} />
                    离开房间
                  </button>
                </div>
              )}
            </div>
          </aside>
          <section className="center">
            <div className="status panel">
              <div className="phase">
                <span className="status-dot" />
                <div>
                  <strong>{room ? phaseLabels[room.phase] : "等待开始"}</strong>
                  <small>
                    {waiting
                      ? "邀请更多朋友加入，准备开始游戏吧！"
                      : isDrawer
                        ? "轮到你发挥想象力啦"
                        : "看图猜词，在下方输入答案"}
                  </small>
                </div>
              </div>
              <div className="round">
                <strong>
                  第 {roundIndex} / {room?.settings.rounds ?? 3} 轮
                </strong>
                <small>
                  {room && !waiting
                    ? `画手：${room.players.find((p) => p.id === room.drawer)?.name ?? "等待中"}`
                    : "由房主选择词语"}
                </small>
              </div>
              <div
                className={`timer ${seconds < 11 && room?.phase === "DRAWING" ? "urgent" : ""}`}
              >
                <Clock3 size={20} />
                <strong>
                  {String(Math.floor(seconds / 60)).padStart(2, "0")}:
                  {String(seconds % 60).padStart(2, "0")}
                </strong>
                <small>
                  {room?.phase === "GAME_RESULT"
                    ? "本局结束"
                    : waiting
                      ? "本轮作画时间"
                      : "剩余时间"}
                </small>
              </div>
              <div className="hint">
                <small>
                  {isDrawer && room?.phase === "DRAWING" ? "你的词语" : "提示"}
                </small>
                <strong>
                  {room?.answer && room.phase === "DRAWING"
                    ? room.answer
                    : room?.hint || "＿ ＿ ＿"}
                </strong>
              </div>
            </div>
            <Board socket={socket}>
              {waiting && (
                <div className="board-overlay">
                  <div className="pencil-art">
                    <Pencil size={63} strokeWidth={1.8} />
                    <span />
                    <i />
                  </div>
                  <h2>好戏，等你开场</h2>
                  <p>
                    {room
                      ? "邀请朋友加入，一起开启脑洞派对。"
                      : "画技不重要，快乐最重要。"}
                  </p>
                  {!room ? (
                    <Button
                      disabled={!connected || !!pending}
                      onClick={() => enter("create")}
                    >
                      <Plus size={20} />
                      创建房间
                    </Button>
                  ) : host ? (
                    <Button onClick={() => emit("start")} disabled={!canStart}>
                      <Pencil size={18} />
                      开始游戏
                    </Button>
                  ) : (
                    <Button
                      className={me?.ready ? "ready" : ""}
                      disabled={!connected || !!pending}
                      onClick={() => emit("ready")}
                    >
                      <Check size={18} />
                      {me?.ready ? "已准备 · 取消" : "我准备好了"}
                    </Button>
                  )}
                  {!room && (
                    <button
                      className="sub-action"
                      onClick={() => setModal("join")}
                    >
                      已有房间？输入房间码 <ArrowRight size={14} />
                    </button>
                  )}
                  {room && (
                    <small className="start-hint">
                      {host
                        ? startHint
                        : me?.ready
                          ? "已准备，等待房主开始"
                          : "点准备后，房主就能开始游戏"}
                    </small>
                  )}
                </div>
              )}
              {room?.phase === "WORD_SELECTION" && (
                <div className="board-overlay">
                  <div className="pencil-art">
                    <Pencil size={54} />
                  </div>
                  <h2>
                    {isDrawer ? "选一个你的拿手好戏" : "画手正在挑选词语…"}
                  </h2>
                  <p>
                    {isDrawer
                      ? "答案只有你能看到，选好就开画！"
                      : "稍等一下，精彩即将开始"}
                  </p>
                  <div className="word-choices">
                    {room.choices?.map((w, index) => (
                      <Button
                        key={w}
                        disabled={!!pending}
                        className="outline"
                        onClick={() =>
                          emit("select", { index, turn: room.turn })
                        }
                      >
                        {w}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {room?.phase === "ROUND_RESULT" && (
                <div className="board-overlay result-overlay">
                  <span className="result-icon">🎉</span>
                  <h2>答案是「{room.answer}」</h2>
                  <p>
                    本轮 {room.players.filter((p) => p.guessed).length}{" "}
                    位朋友猜对了 · 下一棒马上开始
                  </p>
                </div>
              )}
              {room?.phase === "GAME_RESULT" && (
                <div className="board-overlay">
                  <Trophy className="trophy" size={54} />
                  <h2>每一笔，都是快乐</h2>
                  <p>本场脑洞排行榜</p>
                  <div className="winners">
                    {room.players
                      .slice()
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 3)
                      .map((p, i) => (
                        <div key={p.id}>
                          <span>
                            {["🥇", "🥈", "🥉"][i]}{" "}
                            <span className="winner-avatar">
                              <AvatarImage value={p.avatar} />
                            </span>{" "}
                            {p.name}
                          </span>
                          <strong>{p.score} 分</strong>
                        </div>
                      ))}
                  </div>
                  {host ? (
                    <Button disabled={!canStart} onClick={() => emit("start")}>
                      再来一局
                    </Button>
                  ) : (
                    <Button
                      disabled={!connected || !!pending}
                      onClick={() => emit("ready")}
                    >
                      {me?.ready ? "已准备 · 取消" : "准备再来一局"}
                    </Button>
                  )}
                  <small>
                    {host
                      ? startHint
                      : me?.ready
                        ? "等待房主开始下一局"
                        : "准备好，再来一局"}
                  </small>
                </div>
              )}
            </Board>
            <div className="canvas-caption">
              <span>
                <span className="tiny-dot" />
                {room?.phase === "DRAWING"
                  ? isDrawer
                    ? "你是本轮画手，画笔已就位"
                    : "你正在猜词，在下方输入答案"
                  : "一块画布，无限种可能"}
              </span>
              <span>让灵魂画手，也有高光时刻 ✦</span>
            </div>
          </section>
          <aside className="chat panel">
            <div className="panel-title">
              <h2>聊天与猜词</h2>
              <Users size={17} />
            </div>
            <div className="messages">
              <div className="welcome">
                <span>📣</span>
                <div>
                  <strong>画猜小助手</strong>
                  <p>
                    欢迎来到画猜俱乐部！
                    <br />
                    邀请朋友加入房间，准备开始一场充满想象力的游戏吧！
                  </p>
                </div>
              </div>
              {room?.messages.map((m) => (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={m.id}
                  className={`message kind-${m.kind} ${m.senderId === id ? "message-own" : "message-other"}`}
                >
                  {m.kind === "chat" && <strong>{m.name}</strong>}
                  <p>{m.text}</p>
                </motion.div>
              ))}
              <div ref={bottom} />
            </div>
            <div className="composer-help" aria-hidden={!chatFocused}>
                <span>
                  {room?.phase === "DRAWING"
                    ? "输入答案，回车或点发送"
                    : "房间聊天，回车或点发送"}
                </span>
                <span>{text.length}/120</span>
            </div>
            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!composing.current) sendChat();
              }}
            >
              <input
                ref={chatInput}
                aria-label="猜词或聊天"
                autoComplete="off"
                autoCorrect="off"
                enterKeyHint="send"
                onFocus={() => setChatFocused(true)}
                onBlur={() => {
                  composing.current = false;
                  setChatFocused(false);
                }}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (e.nativeEvent.isComposing || e.keyCode === 229)
                  )
                    e.preventDefault();
                }}
                placeholder={
                  isDrawer && room?.phase === "DRAWING"
                    ? "画手请用画笔表达"
                    : me?.guessed
                      ? "猜对啦，等待下一轮"
                      : "输入猜测内容…"
                }
                maxLength={120}
                value={text}
                disabled={cannotChat}
                onChange={(e) => setText(e.target.value)}
              />
              <button
                type="button"
                className="composer-dismiss"
                aria-label="收起键盘"
                onClick={() => chatInput.current?.blur()}
              >
                <ChevronDown size={20} />
              </button>
              <Button
                type="button"
                aria-label="发送"
                onPointerDown={(e) => {
                  if (e.isPrimary && e.button === 0 && !cannotChat && text.trim() && !pending) {
                    sendPointer.current = e.pointerId;
                    e.preventDefault();
                  }
                }}
                onPointerUp={(e) => {
                  const pressedHere = sendPointer.current === e.pointerId;
                  sendPointer.current = null;
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (pressedHere && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) sendChat();
                }}
                onPointerCancel={() => { sendPointer.current = null; }}
                onPointerLeave={() => { sendPointer.current = null; }}
                onClick={(e) => {
                  // Keyboard and assistive activation have no pointer-up.
                  if (e.detail === 0) sendChat();
                }}
                disabled={cannotChat || !text.trim() || !!pending}
              >
                <Send size={20} />
                <span className="send-label">发送</span>
              </Button>
            </form>
          </aside>
        </div>
        <section className="steps">
          {[
            [
              Users,
              "01",
              "创建房间",
              "生成房间号，邀请朋友加入，马上开始游戏。",
            ],
            [
              Pencil,
              "02",
              "轮流画画",
              "系统轮流给出词语，用几笔勾勒你的脑洞。",
            ],
            [
              Trophy,
              "03",
              "猜词得分",
              "大家一起猜出正确的词语，又快又准，赢得更高分！",
            ],
          ].map(([Icon, n, title, desc]) => {
            const I = Icon as typeof Users;
            return (
              <div className="step" key={String(n)}>
                <div className="step-icon">
                  <I size={27} />
                </div>
                <b>{String(n)}</b>
                <div>
                  <h3>{String(title)}</h3>
                  <p>{String(desc)}</p>
                </div>
              </div>
            );
          })}
        </section>
        <footer>
          <span>
            <strong>画猜俱乐部</strong> DrawGuess Arena <i />
            让想象力，成为你们的共同语言。
          </span>
          <span>
            一起画，一起猜，一起开心。 <b>♥</b>
          </span>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            ref={modalRef}
            tabIndex={-1}
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close" aria-label="关闭" onClick={closeModal}>
              <X size={22} />
            </button>
            {modal === "avatar" ? (
              <AvatarEditor
                value={me?.avatar ?? avatar}
                pending={!!pending}
                onSave={saveAvatar}
              />
            ) : modal === "leave" ? (
              <>
                <div className="modal-symbol">
                  <LogOut size={30} />
                </div>
                <h2 id="modal-title">离开这个房间？</h2>
                <p>
                  离开会放弃当前玩家身份和分数；暂时切换应用可在断线后尝试重连。
                </p>
                <Button disabled={!!pending || !connected} onClick={leave}>
                  确认离开
                </Button>
                <Button className="outline" onClick={() => setModal(null)}>
                  留在房间
                </Button>
              </>
            ) : modal === "help" ? (
              <>
                <div className="modal-symbol">
                  <BookOpen size={30} />
                </div>
                <h2 id="modal-title">三分钟，默契大考验</h2>
                <p>① 起个昵称，创建房间，把邀请链接发给朋友。</p>
                <p>② 至少 2 人加入，其他玩家准备后，房主开始游戏。</p>
                <p>
                  ③ 画手从三个词中选一个，用画笔表达。其他人在聊天框里猜词。
                </p>
                <p>
                  ④ 前三位猜对分别得 100 / 80 / 60 分，之后按剩余时间得 20–50
                  分。画手每帮一人猜对得 25 分。
                </p>
                <p>每轮每人画一次，完成全部轮数后结算。不要打字泄题哦！</p>
                <Button onClick={() => setModal(null)}>懂了，开玩！</Button>
              </>
            ) : modal === "join" ? (
              <>
                <div className="modal-symbol">
                  <Users size={32} />
                </div>
                <h2 id="modal-title">加入朋友的脑洞派对</h2>
                <p>输入昵称和朋友分享的 6 位房间码</p>
                <button
                  className="join-avatar"
                  onClick={() => openAvatar("join")}
                >
                  <span className="avatar">
                    <AvatarImage value={avatar} />
                  </span>
                  <span>设置我的头像</span>
                  <ArrowRight size={16} />
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    enter("join");
                  }}
                >
                  <label>
                    你的昵称
                    <input
                      aria-label="加入昵称"
                      maxLength={16}
                      autoComplete="nickname"
                      enterKeyHint="next"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    房间码
                    <input
                      aria-label="房间码"
                      className="code-input"
                      placeholder="例如 A3F82B"
                      maxLength={6}
                      autoCapitalize="characters"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="go"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                    />
                  </label>
                  <Button
                    type="submit"
                    disabled={
                      !connected ||
                      !!pending ||
                      !name.trim() ||
                      !/^[A-F0-9]{6}$/.test(code)
                    }
                  >
                    {pending === "join" ? "正在加入…" : "加入房间"}
                    <ArrowRight size={17} />
                  </Button>
                </form>
              </>
            ) : (
              <SettingsForm
                settings={room!.settings}
                pending={!!pending}
                onSave={(settings) => {
                  emit("settings", settings, () => setModal(null));
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function SettingsForm({
  settings,
  onSave,
  pending,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  pending: boolean;
}) {
  const [s, setS] = useState(settings);
  return (
    <>
      <div className="modal-symbol">
        <Settings2 size={30} />
      </div>
      <h2 id="modal-title">设定你们的游戏节奏</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(s);
        }}
      >
        <label>
          房间人数
          <select
            value={s.maxPlayers}
            onChange={(e) => setS({ ...s, maxPlayers: +e.target.value })}
          >
            {Array.from({ length: 11 }, (_, i) => (
              <option key={i} value={i + 2}>
                {i + 2} 人
              </option>
            ))}
          </select>
        </label>
        <label>
          游戏轮数
          <select
            value={s.rounds}
            onChange={(e) =>
              setS({ ...s, rounds: +e.target.value as Settings["rounds"] })
            }
          >
            {[3, 5, 8].map((n) => (
              <option key={n} value={n}>
                {n} 轮
              </option>
            ))}
          </select>
        </label>
        <label>
          每次绘画时间
          <select
            value={s.duration}
            onChange={(e) =>
              setS({ ...s, duration: +e.target.value as Settings["duration"] })
            }
          >
            {[60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n} 秒
              </option>
            ))}
          </select>
        </label>
        <label>
          自定义词库（可选）
          <textarea
            value={s.customWords}
            maxLength={1000}
            placeholder="用逗号分隔，例如：火锅，毕业旅行，小猫"
            onChange={(e) => setS({ ...s, customWords: e.target.value })}
          />
        </label>
        <small>自定义词语和内置词库混合出题，每个词不超过 12 字。</small>
        <Button disabled={pending}>{pending ? "正在保存…" : "保存设置"}</Button>
      </form>
    </>
  );
}
