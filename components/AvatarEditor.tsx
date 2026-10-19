"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Upload, Check } from "lucide-react";
import { avatars } from "../shared/types";
import { AVATAR_SIZE, MAX_AVATAR_LENGTH, type Avatar } from "../shared/avatar";
import AvatarImage from "./AvatarImage";
import { Button } from "./ui";

export default function AvatarEditor({
  value,
  pending,
  onSave,
}: {
  value: Avatar;
  pending: boolean;
  onSave: (value: Avatar) => void;
}) {
  const [choice, setChoice] = useState<Avatar>(value);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1),
    [x, setX] = useState(50),
    [y, setY] = useState(50);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    preview = useRef<HTMLCanvasElement>(null);
  const url = useRef(""),
    sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  function paint(canvas: HTMLCanvasElement) {
    if (!image) return;
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      ((image.naturalWidth - side) * x) / 100,
      ((image.naturalHeight - side) * y) / 100,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }
  useEffect(() => {
    if (preview.current) paint(preview.current);
  }, [image, zoom, x, y]);
  async function choose(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("请选择 JPG、PNG 或 WebP 图片");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("图片不能超过 5 MB，请选择小一点的照片");
      return;
    }
    const current = ++sequence.current;
    setLoading(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const photo = new Image();
      photo.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        photo.onload = () => resolve();
        photo.onerror = () => reject(Error("图片无法读取，请换一张图片"));
        photo.src = objectUrl;
      });
      if (
        photo.naturalWidth * photo.naturalHeight > 25000000 ||
        !photo.naturalWidth ||
        !photo.naturalHeight
      )
        throw Error("图片尺寸过大，请先缩小后选择");
      if (current !== sequence.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = objectUrl;
      setImage(photo);
      setZoom(1);
      setX(50);
      setY(50);
    } catch (e) {
      URL.revokeObjectURL(objectUrl);
      if (current === sequence.current)
        setError(e instanceof Error ? e.message : "图片读取失败");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }
  function save() {
    if (!image) {
      onSave(choice);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = AVATAR_SIZE;
    paint(canvas);
    let result = "";
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      result = canvas.toDataURL("image/jpeg", quality);
      if (result.length <= MAX_AVATAR_LENGTH) break;
    }
    if (result.length > MAX_AVATAR_LENGTH) {
      setError("头像处理失败，请换一张图片");
      return;
    }
    onSave(result);
  }
  return (
    <>
      <div className="modal-symbol">
        <ImagePlus size={28} />
      </div>
      <h2 id="modal-title">设置你的头像</h2>
      <p>选一张自己的照片，或使用下面的默认头像。</p>
      <div className="avatar-editor-preview">
        {image ? (
          <canvas
            ref={preview}
            width={256}
            height={256}
            aria-label="头像裁剪预览"
          />
        ) : (
          <span className="avatar avatar-preview">
            <AvatarImage value={choice} />
          </span>
        )}
      </div>
      {image && (
        <div className="avatar-crop-controls">
          <label>
            放大
            <input
              aria-label="头像放大"
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(+e.target.value)}
            />
          </label>
          <label>
            左右位置
            <input
              aria-label="头像左右位置"
              type="range"
              min={0}
              max={100}
              value={x}
              onChange={(e) => setX(+e.target.value)}
            />
          </label>
          <label>
            上下位置
            <input
              aria-label="头像上下位置"
              type="range"
              min={0}
              max={100}
              value={y}
              onChange={(e) => setY(+e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="avatar-presets" aria-label="默认头像">
        {avatars.map((emoji, index) => (
          <button
            type="button"
            key={emoji}
            aria-label={`默认头像 ${index + 1}`}
            aria-pressed={!image && choice === index}
            onClick={() => {
              sequence.current++;
              setLoading(false);
              if (url.current) {
                URL.revokeObjectURL(url.current);
                url.current = "";
              }
              setImage(null);
              setChoice(index);
              setError("");
            }}
          >
            {emoji}
            {!image && choice === index && <Check size={13} />}
          </button>
        ))}
      </div>
      <input
        ref={fileInput}
        className="avatar-file"
        aria-label="选择头像图片"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button
        className="outline"
        disabled={loading || pending}
        onClick={() => fileInput.current?.click()}
      >
        <Upload size={18} />
        {loading ? "正在处理…" : image ? "换一张照片" : "从相册选择照片"}
      </Button>
      <p className="avatar-privacy">
        支持 JPG / PNG / WebP，最大 5
        MB。只同步裁剪后的头像缩略图，不上传原照片。
      </p>
      {error && (
        <p className="avatar-error" role="alert">
          {error}
        </p>
      )}
      <Button disabled={loading || pending} onClick={save}>
        {pending ? "正在保存…" : "使用这个头像"}
      </Button>
    </>
  );
}
