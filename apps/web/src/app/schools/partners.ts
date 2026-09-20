import { SCHOOL_EMAIL_INSTITUTIONS } from "@lilink/shared";

export type PartnerSchool = {
  id: string;
  name: string;
  logo: string;
  domains: string[];
  source: string;
  region?: string;
};
export type PartnerGroup = PartnerSchool & { campus: string; partners: PartnerSchool[] };

export const partnerGroups: PartnerGroup[] = [
  {
    id: "bupt",
    name: "北京邮电大学",
    campus: "玛丽女王海南学院",
    logo: "bupt.png",
    domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "bupt")!.domains,
    source: "https://nic.bupt.edu.cn/fwzx/xxfw/dzyj1.htm",
    partners: [
      {
        id: "qmul",
        name: "伦敦玛丽女王大学",
        region: "英国",
        logo: "qmul.png",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "qmul")!.domains,
        source: "https://www.qmul.ac.uk/its/its-student-hub/",
      },
    ],
  },
  {
    id: "cuc",
    name: "中国传媒大学",
    campus: "海南国际学院",
    logo: "cuc.png",
    domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "cuc")!.domains,
    source: "https://its.cuc.edu.cn/2024/0813/c8502a241958/page.htm",
    partners: [
      {
        id: "coventry",
        name: "考文垂大学",
        region: "英国",
        logo: "coventry.svg",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "coventry")!.domains,
        source: "https://github.coventry.ac.uk/pages/CUEH/6047CEM/module/tools_and_technologies/",
      },
      {
        id: "abertay",
        name: "阿伯泰大学",
        region: "英国",
        logo: "abertay.png",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "abertay")!.domains,
        source: "https://www.abertay.ac.uk/welcome/new-students/when-you-arrive/first-few-days/",
      },
    ],
  },
  {
    id: "uestc",
    name: "电子科技大学",
    campus: "格拉斯哥海南学院",
    logo: "uestc.png",
    domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "uestc")!.domains,
    source:
      "https://info.uestc.edu.cn/__local/2/8B/9F/37DA3EAED9DD823159C2CB9EABE_F23B9C5E_D26F4.pdf",
    partners: [
      {
        id: "glasgow",
        name: "格拉斯哥大学",
        region: "英国",
        logo: "glasgow.svg",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "glasgow")!.domains,
        source: "https://www.gla.ac.uk/media/Media_853740_smxx.pdf",
      },
    ],
  },
  {
    id: "bsu",
    name: "北京体育大学",
    campus: "海南国际学院",
    logo: "bsu.png",
    domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "bsu")!.domains,
    source: "https://it.bsu.edu.cn/cjwt/xyyx/7f5daaeef3f14c5b992f5419445f102e.htm",
    partners: [
      {
        id: "alberta",
        name: "阿尔伯塔大学",
        region: "加拿大",
        logo: "alberta-mark.png",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "alberta")!.domains,
        source:
          "https://universityofalberta.freshservice.com/support/solutions/articles/19000109285-Request-an-Email-Alias",
      },
    ],
  },
  {
    id: "muc",
    name: "中央民族大学",
    campus: "海南国际学院",
    logo: "muc.png",
    domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "muc")!.domains,
    source: "https://yx.muc.edu.cn/shuzixiaoyuan/dianziyouxiang/",
    partners: [
      {
        id: "mdx",
        name: "密德萨斯大学",
        region: "英国",
        logo: "mdx-official.svg",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "mdx")!.domains,
        source: "https://www.mdx.ac.uk/student-life/how-to-access-mymdx/",
      },
      {
        id: "cityu",
        name: "澳门城市大学",
        region: "中国澳门",
        logo: "cityu.png",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "cityu")!.domains,
        source:
          "https://www.cityu.edu.mo/wp-content/uploads/2016/01/學生電子郵件使用指引Office365.pdf",
      },
    ],
  },
  {
    id: "blcu",
    name: "北京语言大学",
    campus: "海南国际学院",
    logo: "blcu.png",
    domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "blcu")!.domains,
    source: "https://xxb.blcu.edu.cn/info/1221/3091.htm",
    partners: [
      {
        id: "clermont",
        name: "克莱蒙高等商学院",
        region: "法国",
        logo: "clermont.svg",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "clermont")!.domains,
        source:
          "https://www.esc-clermont.fr/docs/ESCClermontBS_GUIDE_ETUDIANTS_INTERNATIONAUX_EN.pdf",
      },
      {
        id: "nsu",
        name: "东北州立大学",
        region: "美国",
        logo: "nsu.png",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "nsu")!.domains,
        source: "https://offices.nsuok.edu/_resources/documents/unused-pdfs/maritalstatus1718.pdf",
      },
    ],
  },
  {
    id: "tju",
    name: "天津大学",
    campus: "海南国际学院 · 雷丁大学亨利国际学院",
    logo: "tju.png",
    domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "tju")!.domains,
    source: "https://its.tju.edu.cn/xfw/qbfw/dzyx/dzyx.htm",
    partners: [
      {
        id: "reading",
        name: "雷丁大学",
        region: "英国",
        logo: "reading.png",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "reading")!.domains,
        source:
          "https://www.reading.ac.uk/digital-technology-services/it-help-and-support/contact-dts",
      },
    ],
  },
  {
    id: "cupl",
    name: "中国政法大学",
    campus: "海南国际学院",
    logo: "cupl.png",
    domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "cupl")!.domains,
    source: "https://yjsy.cupl.edu.cn/__local/A/FA/5A/1E712BB631849BB5B3FEA9F222B_76352B2F_B8BAA.pdf?e=.pdf",
    partners: [
      {
        id: "ottawa",
        name: "渥太华大学",
        region: "加拿大",
        logo: "ottawa.png",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "ottawa")!.domains,
        source: "https://www.uottawa.ca/about-us/information-technology/it-for-you/it-students",
      },
    ],
  },
  {
    id: "cugb",
    name: "中国地质大学（北京）",
    campus: "海南国际学院",
    logo: "cugb.png",
    domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "cugb")!.domains,
    source: "https://www.cugb.edu.cn/yxsy",
    partners: [
      {
        id: "aberdeen",
        name: "阿伯丁大学",
        region: "英国",
        logo: "aberdeen.png",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "aberdeen")!.domains,
        source: "https://www.abdn.ac.uk/toolkit/documents/uploads/myidentity-ug-pgt.pdf",
      },
      {
        id: "bcu",
        name: "伯明翰城市大学",
        region: "英国",
        logo: "bcu.png",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "bcu")!.domains,
        source:
          "https://www.bcu.ac.uk/student-info/learning-support/it-computer-networks-and-printing/faqs",
      },
    ],
  },
  {
    id: "nefu",
    name: "东北林业大学",
    campus: "海南国际学院 · 悉林学院等",
    logo: "nefu.png",
    domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "nefu")!.domains,
    source: "https://nic.nefu.edu.cn/info/1032/1276.htm",
    partners: [
      {
        id: "uts",
        name: "悉尼科技大学",
        region: "澳大利亚",
        logo: "uts.svg",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "uts")!.domains,
        source:
          "https://www.uts.edu.au/for-students/current-students/managing-your-course/using-uts-systems/email",
      },
      {
        id: "auckland",
        name: "奥克兰大学",
        region: "新西兰",
        logo: "auckland.svg",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "auckland")!.domains,
        source:
          "https://www.auckland.ac.nz/en/business/current-students/facilities-resources/email-file-storage.html",
      },
    ],
  },
  {
    id: "xjtu",
    name: "西安交通大学",
    campus: "西安交通大学（海南）",
    logo: "xjtu.png",
    domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "xjtu")!.domains,
    source: "https://nic.xjtu.edu.cn/info/1683/8609.htm",
    partners: [
      {
        id: "ubc",
        name: "不列颠哥伦比亚大学",
        region: "加拿大",
        logo: "ubc-shield.png",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "ubc")!.domains,
        source:
          "https://it.ubc.ca/services/email-voice-internet/ubc-student-email-service/ubc-student-email-terms-service",
      },
      {
        id: "lancaster",
        name: "兰卡斯特大学",
        region: "英国",
        logo: "lancaster.svg",
        domains: SCHOOL_EMAIL_INSTITUTIONS.find((school) => school.id === "lancaster")!.domains,
        source: "https://www.lancaster.ac.uk/staff/mcdonalj/JM/handbook16-17.pdf",
      },
    ],
  },
];
