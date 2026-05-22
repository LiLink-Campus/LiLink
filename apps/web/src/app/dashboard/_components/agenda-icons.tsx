import type { ComponentType } from "react";
import type { AgendaIconKey } from "../_lib/agenda";
import {
  CalendarIcon,
  CircleIcon,
  ClipboardIcon,
  ClockIcon,
  HeartIcon,
  ProfileIcon,
  SparklesIcon,
} from "./icons";

export const AGENDA_ICONS: Record<
  AgendaIconKey,
  ComponentType<{ className?: string }>
> = {
  calendar: CalendarIcon,
  clock: ClockIcon,
  sparkles: SparklesIcon,
  heart: HeartIcon,
  clipboard: ClipboardIcon,
  profile: ProfileIcon,
  circle: CircleIcon,
};
