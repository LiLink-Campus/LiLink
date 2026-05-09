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

const SEARCH_PLACEHOLDER = "搜索学校名称或邮箱后缀…";
const SEARCH_RESULT_TRUNCATE_THRESHOLD = 12;

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

const DEFAULT_ERROR_MESSAGE = "无法加载学校列表，请稍后再试。";

export function EligibleSchoolsPanel({
  emailInput = "",
  defaultExpanded = false,
  collapsible = true,
  showSearch = true,
  variant = "compact",
  initialPayload,
  hasInitialError = false,
}: EligibleSchoolsPanelProps) {
  const [dataState, setDataState] = useState<DataState>(() => {
    if (initialPayload) {
      return { status: "ready", payload: initialPayload };
    }
    if (hasInitialError) {
      return { status: "error", message: DEFAULT_ERROR_MESSAGE };
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
          error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;
        setDataState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [initialPayload]);

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
      if (school.name.toLowerCase().includes(trimmedQuery)) return true;
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
      return <span className="schools-summary-count">正在加载…</span>;
    }
    if (dataState.status === "error") {
      return (
        <span className="schools-summary-count schools-summary-count--error">
          加载失败
        </span>
      );
    }
    return (
      <span className="schools-summary-count">
        {dataState.payload.totalSchoolCount} 所学校 ·
        {" "}
        {dataState.payload.totalDomainCount} 个邮箱后缀
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
            <strong>已识别学校：{matchResult.school.name}</strong>
            <span>
              与白名单后缀
              {" "}
              <code>@{matchResult.matchedDomain}</code>
              {" "}
              匹配，可继续注册。
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
              <code>@{emailDomainHint}</code> 暂不在白名单内
            </strong>
            <span>请确认邮箱拼写，或在下方查找你所在的学校。</span>
          </div>
        </div>
      );
    }

    return null;
  }

  function renderSchoolCard(school: EligibleSchool, index: number) {
    const isMatched =
      matchResult != null && matchResult.school.name === school.name;
    const trimmedQuery = searchTerm.trim().toLowerCase();

    const className = [
      "schools-card",
      isMatched ? "schools-card--matched" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <li
        key={`${school.name}-${index}`}
        className={className}
        ref={isMatched ? matchedCardRef : undefined}
      >
        <div className="schools-card-header">
          <h3 title={school.name}>{school.name}</h3>
          {isMatched ? (
            <span className="schools-card-badge">本邮箱可用</span>
          ) : null}
        </div>
        {school.description ? (
          <p className="schools-card-desc">{school.description}</p>
        ) : null}
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
          没有找到匹配「{searchTerm.trim()}」的学校。试试用关键词搜索，例如「
          复旦」或「sjtu.edu」。
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
            展开剩余 {hiddenCount} 所学校
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
            合作高校与邮箱后缀
          </span>
          {renderSummaryBadge()}
        </header>
        {renderMatchBanner()}
        {showSearch && (
          <div className="schools-search">
            <input
              type="search"
              value={searchTerm}
              placeholder={SEARCH_PLACEHOLDER}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="搜索学校或邮箱后缀"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                aria-label="清空搜索"
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
        aria-controls={expanded ? headingId : undefined}
        onClick={() => collapsible && setExpanded((value) => !value)}
        disabled={!collapsible}
      >
        <span className="schools-toggle-label">
          <span className="eyebrow">Eligible schools</span>
          <strong>查看支持的学校邮箱后缀</strong>
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
                placeholder={SEARCH_PLACEHOLDER}
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label="搜索学校或邮箱后缀"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="清空搜索"
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
