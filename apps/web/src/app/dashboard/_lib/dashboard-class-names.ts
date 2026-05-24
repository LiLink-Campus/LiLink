import chromeStyles from "../_styles/dashboardChrome.module.css";
import matchStyles from "../_styles/match.module.css";
import profileStyles from "../_styles/profile.module.css";
import pickerStyles from "../_styles/ValuePicker.module.css";
import sheetStyles from "../_styles/sheet.module.css";
import meStyles from "../_styles/me.module.css";
import chromeV2Styles from "../_styles/dashboardChromeV2.module.css";
import meetupStyles from "../_styles/meetup.module.css";
import reportDialogStyles from "../_styles/ReportDialog.module.css";
import merchantBenefitStyles from "../_styles/merchantBenefits.module.css";

type CssModule = Record<string, string>;
type ClassValue = string | false | null | undefined;

const dashboardStyleMaps: CssModule[] = [
  chromeStyles,
  matchStyles,
  profileStyles,
  pickerStyles,
  sheetStyles,
  meStyles,
  chromeV2Styles,
  meetupStyles,
  reportDialogStyles,
  merchantBenefitStyles,
];

export function dcx(...values: ClassValue[]) {
  return values
    .flatMap((value) => (value ? value.split(/\s+/).filter(Boolean) : []))
    .flatMap((token) => {
      const moduleClasses = dashboardStyleMaps
        .map((styles) => styles[token])
        .filter(Boolean);

      return moduleClasses.length > 0 ? moduleClasses : token;
    })
    .join(" ");
}
