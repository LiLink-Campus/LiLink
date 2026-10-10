import { StaticImage } from "@/components/StaticImage";
import Link from "next/link";
import styles from "./team-members.module.css";

export default function TeamMembers() {
  return <div className={styles.team}>
    {[0, 1, 2].map((member) => <article key={member} className={styles.member}>
      {member === 0 ? <StaticImage className={styles.avatar} src="/images/about/yoryon.f1f0a575ff59.webp" alt="釉蓝yoryon 的蓝色插画头像" width={112} height={112} /> : <StaticImage className={styles.avatar} src={member === 1 ? "/images/about/member-02.b6fbc6031cdb.webp" : "/images/about/devillord6321.016e14db36ed.webp"} alt={member === 1 ? "蟹牛堡 的头像" : "Devillord6321 的猫咪头像"} width={112} height={112} />}
      <h3>{member === 0 ? "釉蓝yoryon" : member === 1 ? "蟹牛堡" : "Devillord6321"}</h3>
      <p className={styles.role}>{member === 0 ? "创始人 & 产品负责人" : "增长 & 运营负责人"}</p>
      <Link prefetch={false} className={styles.link} href={member === 0 ? "/about/team/yoryon" : member === 1 ? "/about/team/member-02" : "/about/team/devillord6321"}>查看介绍 ↗</Link>
    </article>)}
  </div>;
}
