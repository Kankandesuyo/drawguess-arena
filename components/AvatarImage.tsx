"use client";
import { useEffect, useState } from "react";
import type { Avatar } from "../shared/avatar";
import { avatars } from "../shared/types";

export default function AvatarImage({ value }: { value: Avatar }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [value]);
  if (typeof value === "number") return <>{avatars[value] ?? avatars[0]}</>;
  if (failed) return <>{avatars[0]}</>;
  return (
    <img
      className="custom-avatar"
      src={value}
      width={96}
      height={96}
      alt="自定义头像"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
