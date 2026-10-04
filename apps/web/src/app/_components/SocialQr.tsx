export const socialChannels = [
  { name: "微信", image: "/images/social/wechat-qr.cfdb4f0b6fdb.webp", preview: "/images/social/wechat-qr-preview.79de890c6c9a.webp" },
  { name: "小红书", image: "/images/social/xiaohongshu-qr.0c97c44cc33e.webp", preview: "/images/social/xiaohongshu-qr-preview.2b77d88a4a43.webp" },
] as const;

export function SocialQr({ channel, className }: {
  channel: (typeof socialChannels)[number];
  className?: string;
}) {
  return (
    <a href={channel.image} target="_blank" rel="noopener noreferrer" aria-label={`查看 LiLink ${channel.name}二维码原图`}>
      {/* Fixed previews retain the original-image link without a client loader. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={className} src={channel.preview} alt={`LiLink ${channel.name}二维码`} width={160} height={160} loading="lazy" decoding="async" />
    </a>
  );
}
