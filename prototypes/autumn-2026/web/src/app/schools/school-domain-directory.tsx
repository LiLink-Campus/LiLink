import { partnerGroups } from "./partners";
import styles from "./schools.module.css";

export function SchoolDomainDirectory() {
  return (
    <section className={styles.directory} aria-labelledby="school-email-title">
      <h2 id="school-email-title" className={styles.directoryTitle}>
        学校邮箱后缀
      </h2>
      <div className={styles.directoryBody}>
        <p>使用学校分配的学生邮箱，具体开通情况以学校通知为准。</p>
        <ul className={styles.domainList}>
          {partnerGroups.map((group) => (
            <li key={group.id}>
              <div className={styles.domainGroup}>
                {[group, ...group.partners].map((school) => (
                  <div key={school.id}>
                    {school.id === group.id ? (
                      <strong>{school.name}</strong>
                    ) : (
                      <span>{school.name}</span>
                    )}
                    <p>
                      {school.domains.length
                        ? school.domains.map((domain) => (
                            <span className={styles.domainSuffix} key={domain}>
                              @{domain}
                            </span>
                          ))
                        : "学生邮箱后缀待确认"}
                    </p>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
