import { SCHOOL_DIRECTORY } from "@lilink/shared";
import styles from "./schools.module.css";

export function SchoolDomainDirectory() {
  return (
    <section className={styles.directory} aria-labelledby="school-email-title">
      <h2 id="school-email-title" className={styles.directoryTitle}>学校邮箱后缀</h2>
      <div className={styles.directoryBody}>
        <p>合作办学统一按中方学校归属，以下后缀均对应同一所学校。如有错误联系我们。</p>
        <ul className={styles.domainList}>
          {SCHOOL_DIRECTORY.map((school) => (
            <li key={school.id}>
              <div className={styles.domainGroup}>
                <div>
                  <strong>{school.name}</strong>
                  <p>{school.domains.map(domain => (
                    <span className={styles.domainSuffix} key={domain}>@{domain}</span>
                  ))}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
