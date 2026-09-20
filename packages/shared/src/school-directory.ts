import { normalizeSchoolEmailDomains } from "./school-email-domain";

// Static directory and initial database configuration. Runtime settings live in School/SchoolDomain.
export const SCHOOL_EMAIL_INSTITUTIONS = [
  {
    "id": "bupt",
    "slug": "bupt-qmul-hainan",
    "name": "北京邮电大学",
    "description": "玛丽女王海南学院",
    "domains": [
      "bupt.edu.cn",
      "bupt.cn"
    ]
  },
  {
    "id": "qmul",
    "slug": "qmul",
    "name": "伦敦玛丽女王大学",
    "description": "英国",
    "domains": [
      "qmul.ac.uk"
    ]
  },
  {
    "id": "cuc",
    "slug": "cuc-hainan-international",
    "name": "中国传媒大学",
    "description": "海南国际学院",
    "domains": [
      "cuc.edu.cn",
      "cuc.cn"
    ]
  },
  {
    "id": "coventry",
    "slug": "coventry",
    "name": "考文垂大学",
    "description": "英国",
    "domains": [
      "coventry.ac.uk"
    ]
  },
  {
    "id": "abertay",
    "slug": "abertay",
    "name": "阿伯泰大学",
    "description": "英国",
    "domains": [
      "abertay.ac.uk"
    ]
  },
  {
    "id": "uestc",
    "slug": "uestc-glasgow-hainan",
    "name": "电子科技大学",
    "description": "格拉斯哥海南学院",
    "domains": [
      "uestc.edu.cn",
      "uestc.cn"
    ]
  },
  {
    "id": "glasgow",
    "slug": "glasgow",
    "name": "格拉斯哥大学",
    "description": "英国",
    "domains": [
      "gla.ac.uk",
      "glasgow.ac.uk"
    ]
  },
  {
    "id": "bsu",
    "slug": "bsu-ualberta-hainan",
    "name": "北京体育大学",
    "description": "海南国际学院",
    "domains": [
      "bsu.edu.cn",
      "bsu.cn"
    ]
  },
  {
    "id": "alberta",
    "slug": "alberta",
    "name": "阿尔伯塔大学",
    "description": "加拿大",
    "domains": [
      "ualberta.ca"
    ]
  },
  {
    "id": "muc",
    "slug": "muc-hainan-international",
    "name": "中央民族大学",
    "description": "海南国际学院",
    "domains": [
      "muc.edu.cn",
      "muc.cn"
    ]
  },
  {
    "id": "mdx",
    "slug": "mdx",
    "name": "密德萨斯大学",
    "description": "英国",
    "domains": [
      "mdx.ac.uk"
    ]
  },
  {
    "id": "cityu",
    "slug": "cityu",
    "name": "澳门城市大学",
    "description": "中国澳门",
    "domains": [
      "cityu.mo"
    ]
  },
  {
    "id": "blcu",
    "slug": "blcu-lian-exchange",
    "name": "北京语言大学",
    "description": "海南国际学院",
    "domains": [
      "blcu.edu.cn",
      "blcu.cn"
    ]
  },
  {
    "id": "clermont",
    "slug": "clermont",
    "name": "克莱蒙高等商学院",
    "description": "法国",
    "domains": [
      "esc-clermont.fr"
    ]
  },
  {
    "id": "nsu",
    "slug": "nsu",
    "name": "东北州立大学",
    "description": "美国",
    "domains": [
      "nsuok.edu"
    ]
  },
  {
    "id": "tju",
    "slug": "tju",
    "name": "天津大学",
    "description": "海南国际学院 · 雷丁大学亨利国际学院",
    "domains": [
      "tju.edu.cn",
      "tju.cn"
    ]
  },
  {
    "id": "reading",
    "slug": "reading",
    "name": "雷丁大学",
    "description": "英国",
    "domains": [
      "student.reading.ac.uk"
    ]
  },
  {
    "id": "cupl",
    "slug": "cupl",
    "name": "中国政法大学",
    "description": "海南国际学院",
    "domains": [
      "cupl.edu.cn",
      "cupl.cn"
    ]
  },
  {
    "id": "ottawa",
    "slug": "ottawa",
    "name": "渥太华大学",
    "description": "加拿大",
    "domains": [
      "uottawa.ca"
    ]
  },
  {
    "id": "cugb",
    "slug": "cugb",
    "name": "中国地质大学（北京）",
    "description": "海南国际学院",
    "domains": [
      "cugb.edu.cn",
      "cugb.cn"
    ]
  },
  {
    "id": "aberdeen",
    "slug": "aberdeen",
    "name": "阿伯丁大学",
    "description": "英国",
    "domains": [
      "abdn.ac.uk"
    ]
  },
  {
    "id": "bcu",
    "slug": "bcu",
    "name": "伯明翰城市大学",
    "description": "英国",
    "domains": [
      "mail.bcu.ac.uk"
    ]
  },
  {
    "id": "nefu",
    "slug": "nefu",
    "name": "东北林业大学",
    "description": "海南国际学院 · 悉林学院等",
    "domains": [
      "nefu.edu.cn",
      "nefu.cn"
    ]
  },
  {
    "id": "uts",
    "slug": "uts",
    "name": "悉尼科技大学",
    "description": "澳大利亚",
    "domains": [
      "student.uts.edu.au"
    ]
  },
  {
    "id": "auckland",
    "slug": "auckland",
    "name": "奥克兰大学",
    "description": "新西兰",
    "domains": [
      "aucklanduni.ac.nz"
    ]
  },
  {
    "id": "xjtu",
    "slug": "xjtu",
    "name": "西安交通大学",
    "description": "西安交通大学（海南）",
    "domains": [
      "xjtu.edu.cn",
      "xjtu.cn"
    ]
  },
  {
    "id": "ubc",
    "slug": "ubc",
    "name": "不列颠哥伦比亚大学",
    "description": "加拿大",
    "domains": [
      "student.ubc.ca"
    ]
  },
  {
    "id": "lancaster",
    "slug": "lancaster",
    "name": "兰卡斯特大学",
    "description": "英国",
    "domains": [
      "lancaster.ac.uk"
    ]
  }
];

export const SCHOOL_COOPERATION_GROUPS = [
  { id: "bupt", partners: ["qmul"] },
  { id: "cuc", partners: ["coventry", "abertay"] },
  { id: "uestc", partners: ["glasgow"] },
  { id: "bsu", partners: ["alberta"] },
  { id: "muc", partners: ["mdx", "cityu"] },
  { id: "blcu", partners: ["clermont", "nsu"] },
  { id: "tju", partners: ["reading"] },
  { id: "cupl", partners: ["ottawa"] },
  { id: "cugb", partners: ["aberdeen", "bcu"] },
  { id: "nefu", partners: ["uts", "auckland"] },
  { id: "xjtu", partners: ["ubc", "lancaster"] },
];

export const SCHOOL_DIRECTORY = SCHOOL_COOPERATION_GROUPS.map(group => {
  const institution = SCHOOL_EMAIL_INSTITUTIONS.find(school => school.id === group.id)!;
  return {
    ...institution,
    domains: normalizeSchoolEmailDomains(SCHOOL_EMAIL_INSTITUTIONS
      .filter(school => school.id === group.id || group.partners.includes(school.id))
      .flatMap(school => school.domains)),
  };
});
