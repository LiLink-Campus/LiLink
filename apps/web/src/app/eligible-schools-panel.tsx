"use client";

import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type EligibleSchool,
  type EligibleSchoolsPayload,
  extractEmailDomain,
  fetchEligibleSchools,
  findMatchingSchool,
} from "../lib/eligible-schools";
import { useLocale } from "./locale-context";

const SEARCH_RESULT_TRUNCATE_THRESHOLD = 12;
const ELIGIBLE_SCHOOLS_COPY = {
  "zh-CN": {
    searchPlaceholder: "搜索学校名称或邮箱后缀…",
    defaultError: "无法加载学校列表，请稍后再试。",
    loading: "正在加载…",
    failed: "加载失败",
    summary: (schoolCount: number, domainCount: number) =>
      `${schoolCount} 所学校 · ${domainCount} 个邮箱后缀`,
    recognized: "已识别学校：",
    matchedPrefix: "与白名单后缀",
    matchedSuffix: "匹配，可继续注册。",
    unavailable: "暂不在白名单内",
    confirmEmail: "请确认邮箱拼写，或在下方查找你所在的学校。",
    usable: "本邮箱可用",
    empty: (term: string) =>
      `没有找到匹配「${term}」的学校。试试用关键词搜索，例如「北邮」或「bupt.edu」。`,
    showMore: (count: number) => `展开剩余 ${count} 所学校`,
    heading: "合作高校与邮箱后缀",
    searchLabel: "搜索学校或邮箱后缀",
    clearSearch: "清空搜索",
    compactTitle: "查看支持的学校邮箱后缀",
  },
  "en-US": {
    searchPlaceholder: "Search school name or email domain...",
    defaultError: "School list could not be loaded. Please try again later.",
    loading: "Loading...",
    failed: "Failed",
    summary: (schoolCount: number, domainCount: number) =>
      `${schoolCount} schools · ${domainCount} email domains`,
    recognized: "School recognized: ",
    matchedPrefix: "Matches allowlisted domain",
    matchedSuffix: "and can continue registration.",
    unavailable: "is not on the allowlist yet",
    confirmEmail: "Check the email spelling or search for your school below.",
    usable: "This email works",
    empty: (term: string) =>
      `No school matched "${term}". Try a keyword such as "BUPT" or "bupt.edu".`,
    showMore: (count: number) => `Show ${count} more schools`,
    heading: "Partner schools and email domains",
    searchLabel: "Search school or email domain",
    clearSearch: "Clear search",
    compactTitle: "View supported school email domains",
  },
} as const;

type EligibleSchoolsPanelProps = {
  emailInput?: string;
  defaultExpanded?: boolean;
  collapsible?: boolean;
  showSearch?: boolean;
  variant?: "compact" | "full";
  initialPayload?: EligibleSchoolsPayload;
  hasInitialError?: boolean;
};

type DataState =
  | { status: "loading" }
  | { status: "ready"; payload: EligibleSchoolsPayload }
  | { status: "error"; message: string };

export function EligibleSchoolsPanel({
  emailInput = "",
  defaultExpanded = false,
  collapsible = true,
  showSearch = true,
  variant = "compact",
  initialPayload,
  hasInitialError = false,
}: EligibleSchoolsPanelProps) {
  const { locale } = useLocale();
  const copy = ELIGIBLE_SCHOOLS_COPY[locale];
  const [dataState, setDataState] = useState<DataState>(() => {
    if (initialPayload) {
      return { status: "ready", payload: initialPayload };
    }
    if (hasInitialError) {
      return { status: "error", message: copy.defaultError };
    }
    return { status: "loading" };
  });
  const [expanded, setExpanded] = useState(defaultExpanded || !collapsible);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllResults, setShowAllResults] = useState(true);
  const headingId = useId();
  const matchedCardRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (initialPayload) return;

    let cancelled = false;
    fetchEligibleSchools()
      .then((payload) => {
        if (cancelled) return;
        setDataState({ status: "ready", payload });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : copy.defaultError;
        setDataState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [initialPayload, copy.defaultError]);

  const schools = useMemo(
    () => (dataState.status === "ready" ? dataState.payload.schools : []),
    [dataState],
  );

  const matchResult = useMemo(
    () => findMatchingSchool(schools, emailInput),
    [schools, emailInput],
  );

  const emailDomainHint = useMemo(
    () => extractEmailDomain(emailInput),
    [emailInput],
  );

  const filteredSchools = useMemo(() => {
    const trimmedQuery = searchTerm.trim().toLowerCase();
    if (!trimmedQuery) {
      return schools;
    }

    return schools.filter((school) => {
      const searchableNames = [
        school.name,
        school.nativeName,
        school.englishName,
        school.baseName,
        school.nativeBaseName,
        school.englishBaseName,
      ].filter((name): name is string => typeof name === "string");
      if (
        searchableNames.some((name) =>
          name.toLowerCase().includes(trimmedQuery),
        )
      ) {
        return true;
      }
      return school.domains.some((domain) =>
        domain.toLowerCase().includes(trimmedQuery),
      );
    });
  }, [schools, searchTerm]);

  useEffect(() => {
    if (!matchResult) return;
    if (collapsible && !expanded) return;

    matchedCardRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [matchResult, expanded, collapsible]);

  const shouldTruncateLargeResultSet =
    !showAllResults && filteredSchools.length > SEARCH_RESULT_TRUNCATE_THRESHOLD;
  const visibleSchools = shouldTruncateLargeResultSet
    ? filteredSchools.slice(0, SEARCH_RESULT_TRUNCATE_THRESHOLD)
    : filteredSchools;

  const hiddenCount = Math.max(
    0,
    filteredSchools.length - visibleSchools.length,
  );

  function renderSummaryBadge() {
    if (dataState.status === "loading") {
      return <span className="schools-summary-count">{copy.loading}</span>;
    }
    if (dataState.status === "error") {
      return (
        <span className="schools-summary-count schools-summary-count--error">
          {copy.failed}
        </span>
      );
    }
    return (
      <span className="schools-summary-count">
        {copy.summary(
          dataState.payload.totalSchoolCount,
          dataState.payload.totalDomainCount,
        )}
      </span>
    );
  }

  function renderMatchBanner() {
    if (dataState.status !== "ready") return null;

    if (matchResult) {
      return (
        <div className="schools-match-banner schools-match-banner--success">
          <span className="schools-match-banner-icon" aria-hidden>
            ✓
          </span>
          <div>
            <strong>
              {copy.recognized}
              {matchResult.school.name}
            </strong>
            <span>
              {copy.matchedPrefix}
              {" "}
              <code>@{matchResult.matchedDomain}</code>
              {" "}
              {copy.matchedSuffix}
            </span>
          </div>
        </div>
      );
    }

    if (emailDomainHint) {
      return (
        <div className="schools-match-banner schools-match-banner--warning">
          <span className="schools-match-banner-icon" aria-hidden>
            !
          </span>
          <div>
            <strong>
              <code>@{emailDomainHint}</code> {copy.unavailable}
            </strong>
            <span>{copy.confirmEmail}</span>
          </div>
        </div>
      );
    }

    return null;
  }

  function renderSchoolCard(school: EligibleSchool, index: number) {
    const isMatched =
      matchResult != null &&
      ((matchResult.school.slug != null &&
        matchResult.school.slug === school.slug) ||
        matchResult.school.name === school.name);
    const trimmedQuery = searchTerm.trim().toLowerCase();
    const primaryName =
      locale === "en-US"
        ? (school.englishName ?? school.name)
        : (school.nativeName ?? school.name);
    const schoolKey = school.slug ?? school.name;

    const className = [
      "schools-card",
      isMatched ? "schools-card--matched" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <li
        key={`${schoolKey}-${index}`}
        className={className}
        ref={isMatched ? matchedCardRef : undefined}
      >
        <div className="schools-card-main">
          <div className="schools-card-header">
            <h3 title={primaryName}>
              {primaryName}
            </h3>
            {isMatched ? (
              <span className="schools-card-badge">{copy.usable}</span>
            ) : null}
          </div>
        </div>
        <ul className="schools-domain-grid">
          {school.domains.map((domain, domainIndex) => {
            const isMatchedDomain =
              isMatched && matchResult.matchedDomain === domain;
            const isQueried =
              trimmedQuery.length > 0 &&
              domain.toLowerCase().includes(trimmedQuery);
            const chipClassName = [
              "schools-domain-chip",
              isMatchedDomain ? "schools-domain-chip--matched" : "",
              !isMatchedDomain && isQueried
                ? "schools-domain-chip--queried"
                : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <Fragment key={domain}>
                {domainIndex > 0 ? (
                  <li className="schools-domain-sep" aria-hidden>
                    ·
                  </li>
                ) : null}
                <li className={chipClassName}>
                  <span className="schools-domain-at" aria-hidden>
                    @
                  </span>
                  {domain}
                </li>
              </Fragment>
            );
          })}
        </ul>
      </li>
    );
  }

  function renderBody() {
    if (dataState.status === "loading") {
      return (
        <div className="schools-skeleton">
          <span />
          <span />
          <span />
        </div>
      );
    }

    if (dataState.status === "error") {
      return <p className="schools-error">{dataState.message}</p>;
    }

    if (filteredSchools.length === 0) {
      return (
        <div className="schools-empty">
          {copy.empty(searchTerm.trim())}
        </div>
      );
    }

    return (
      <>
        <ul className="schools-grid">
          {visibleSchools.map(renderSchoolCard)}
        </ul>
        {hiddenCount > 0 && (
          <button
            type="button"
            className="schools-show-more"
            onClick={() => setShowAllResults(true)}
          >
            {copy.showMore(hiddenCount)}
          </button>
        )}
      </>
    );
  }

  if (variant === "full") {
    return (
      <section
        className="schools-panel schools-panel--full"
        aria-labelledby={headingId}
      >
        <header className="schools-panel-header schools-panel-header--summary">
          <span id={headingId} className="schools-panel-summary-label">
            {copy.heading}
          </span>
          {renderSummaryBadge()}
        </header>
        {renderMatchBanner()}
        {showSearch && (
          <div className="schools-search">
            <input
              type="search"
              value={searchTerm}
              placeholder={copy.searchPlaceholder}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label={copy.searchLabel}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                aria-label={copy.clearSearch}
              >
                ×
              </button>
            )}
          </div>
        )}
        {renderBody()}
      </section>
    );
  }

  return (
    <section className="schools-panel schools-panel--compact">
      <button
        type="button"
        className="schools-toggle"
        aria-expanded={expanded}
        aria-controls={headingId}
        onClick={() => collapsible && setExpanded((value) => !value)}
        disabled={!collapsible}
      >
        <span className="schools-toggle-label">
          <span className="eyebrow">Eligible schools</span>
          <strong>{copy.compactTitle}</strong>
        </span>
        <span className="schools-toggle-meta">
          {renderSummaryBadge()}
          {collapsible && (
            <span className="schools-toggle-chevron" aria-hidden>
              {expanded ? "−" : "+"}
            </span>
          )}
        </span>
      </button>

      {renderMatchBanner()}

      {expanded && (
        <div className="schools-panel-body" id={headingId}>
          {showSearch && (
            <div className="schools-search">
              <input
                type="search"
                value={searchTerm}
                placeholder={copy.searchPlaceholder}
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label={copy.searchLabel}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label={copy.clearSearch}
                >
                  ×
                </button>
              )}
            </div>
          )}
          {renderBody()}
        </div>
      )}
    </section>
  );
}
