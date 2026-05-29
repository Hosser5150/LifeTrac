import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Camera,
  GraduationCap,
  Heart,
  MapPin,
  Sparkles,
  Star,
  Target,
  Trash2
} from "lucide-react";

const iconMap = {
  "book-open": BookOpen,
  briefcase: BriefcaseBusiness,
  "calendar-days": CalendarDays,
  "check-circle": CheckCircle2,
  camera: Camera,
  "graduation-cap": GraduationCap,
  heart: Heart,
  "map-pin": MapPin,
  sparkles: Sparkles,
  star: Star,
  target: Target,
  "trash-2": Trash2
};

export const iconOptions = Object.keys(iconMap);

export function TimelineIcon({ name, size = 18 }: { name?: string; size?: number }) {
  const Icon = iconMap[(name || "sparkles") as keyof typeof iconMap] || Sparkles;
  return <Icon size={size} strokeWidth={2.2} />;
}
