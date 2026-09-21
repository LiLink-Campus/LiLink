import Image from "next/image";

export const socialChannels = [
  { name: "微信", image: "/images/social/wechat-qr.png" },
  { name: "小红书", image: "/images/social/xiaohongshu-qr.png" },
] as const;

export function SocialQr({ channel, className }: {
  channel: (typeof socialChannels)[number];
  className?: string;
}) {
  return (
    <a href={channel.image} target="_blank" rel="noopener noreferrer" aria-label={`查看 LiLink ${channel.name}二维码原图`}>
      <Image className={className} src={channel.image} alt={`LiLink ${channel.name}二维码`} width={160} height={160} sizes="160px" />
    </a>
  );
}
