import { ButtonLink } from "@/components/ui";
import Image from "next/image";
import type { Metadata } from "next";
import { SchoolDomainDirectory } from "./school-domain-directory";
import { partnerGroups } from "./partners";
import styles from "./schools.module.css";

export const metadata: Metadata = {
  title: "支持的学校 | LiLink",
  description: "认识黎安园区中外合作高校，查看对应的学校邮箱后缀。",
};

export default function SchoolsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>相聚黎安 · 连接世界</p>
        <h1>
          来自不同的大学，
          <br />
          在同一片校园相遇。
        </h1>
        <p className={styles.description}>在园区的日常里，认识不同学校的同学。</p>
      </header>
      <section aria-labelledby="partner-title">
        <div className={styles.sectionHeading}>
          <h2 id="partner-title">园区中外合作高校</h2>
          <span>11 所中方高校 · 17 所境外伙伴</span>
        </div>
        <div className={styles.cooperationList}>
          {partnerGroups.map((group) => (
            <section
              key={group.id}
              className={styles.cooperationRow}
              aria-labelledby={`school-${group.id}`}
            >
              <div className={styles.chineseSchool}>
                <Image
                  src={`/images/schools/${group.logo}`}
                  width={80}
                  height={80}
                  sizes="(max-width: 700px) 68px, 80px"
                  alt={`${group.name}校徽`}
                />
                <div>
                  <h3 id={`school-${group.id}`}>{group.name}</h3>
                  <p>{group.campus}</p>
                </div>
              </div>
              <div className={styles.connection} aria-hidden="true">
                ×
              </div>
              <ul className={styles.foreignSchools}>
                {group.partners.map((school) => (
                  <li key={school.id}>
                    <div
                      className={`${styles.foreignMark} ${["qmul", "glasgow", "reading", "aberdeen", "bcu"].includes(school.id) ? styles.reversedMark : ""}`}
                    >
                      <Image
                        src={`/images/schools/${school.logo}`}
                        width={160}
                        height={68}
                        sizes="160px"
                        alt={`${school.name}标识`}
                      />
                    </div>
                    <h4>{school.name}</h4>
                    <p>{school.region}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
      <SchoolDomainDirectory />
      <section className={styles.cta}>
        <div>
          <h2>下一次相遇，从你开始。</h2>
          <p>用学校邮箱注册，开启你的 LiLink 校园故事。</p>
        </div>
        <ButtonLink href="/register">立即加入 →</ButtonLink>
      </section>
    </main>
  );
}
