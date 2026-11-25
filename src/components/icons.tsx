"use client";

/**
 * PDH Smart Health Check — Centralized Icon System
 * Standardized icon sizes, consistent stroke width, accessible attributes, and tree-shakeable static imports.
 */

import type { LucideProps } from "lucide-react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  BarChart3,
  Building2,
  Calendar,
  CalendarClock,
  CalendarDays,
  Check,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  ClipboardPlus,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  FlaskConical,
  HeartPulse,
  Home,
  Inbox,
  Info,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  Lock,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MessageSquare,
  MessageSquareQuote,
  Package,
  PackageCheck,
  Pencil,
  Phone,
  Plus,
  Receipt,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  X,
} from "lucide-react";

import {
  SiLine,
  SiFacebook,
  SiGoogle,
} from "@icons-pack/react-simple-icons";

export interface IconProps extends LucideProps {
  size?: number | string;
  className?: string;
  title?: string;
}

// Icon standard sizes
export const ICON_SIZES = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const DEFAULT_STROKE_WIDTH = 1.85;

function createIcon(Component: React.ComponentType<LucideProps>) {
  return function StandardizedIcon({
    size = ICON_SIZES.md,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    className = "",
    title,
    ...props
  }: IconProps) {
    return (
      <Component
        size={size}
        strokeWidth={strokeWidth}
        className={`pdh-icon ${className}`.trim()}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        role={title ? "img" : undefined}
        {...props}
      />
    );
  };
}

// Core Mapped Icons
export const IconDashboard = createIcon(LayoutDashboard);
export const IconPatients = createIcon(Users);
export const IconRegistration = createIcon(ClipboardList);
export const IconQuestionnaires = createIcon(ClipboardCheck);
export const IconAppointments = createIcon(CalendarDays);
export const IconBookingControl = createIcon(CalendarClock);
export const IconOrganizations = createIcon(Building2);
export const IconBMI = createIcon(Activity);
export const IconSettings = createIcon(Settings);
export const IconSecurity = createIcon(ShieldCheck);
export const IconAudit = createIcon(ScrollText);
export const IconEdit = createIcon(Pencil);
export const IconDelete = createIcon(Trash2);
export const IconSearch = createIcon(Search);
export const IconFilter = createIcon(Filter);
export const IconSave = createIcon(Save);
export const IconBack = createIcon(ArrowLeft);
export const IconForward = createIcon(ArrowRight);
export const IconSuccess = createIcon(CircleCheck);
export const IconWarning = createIcon(TriangleAlert);
export const IconInfo = createIcon(Info);
export const IconError = createIcon(AlertCircle);
export const IconHealth = createIcon(HeartPulse);
export const IconStethoscope = createIcon(Stethoscope);
export const IconCheck = createIcon(Check);
export const IconClose = createIcon(X);
export const IconMenu = createIcon(Menu);
export const IconLogout = createIcon(LogOut);
export const IconLock = createIcon(LockKeyhole);
export const IconKey = createIcon(KeyRound);
export const IconReceipt = createIcon(Receipt);
export const IconFinance = createIcon(Banknote);
export const IconReports = createIcon(BarChart3);
export const IconLab = createIcon(FlaskConical);
export const IconMessage = createIcon(MessageCircle);
export const IconChatQuote = createIcon(MessageSquareQuote);
export const IconClock = createIcon(Clock);
export const IconPhone = createIcon(Phone);
export const IconMail = createIcon(Mail);
export const IconDownload = createIcon(Download);
export const IconUpload = createIcon(Upload);
export const IconPlus = createIcon(Plus);
export const IconHome = createIcon(Home);
export const IconInbox = createIcon(Inbox);
export const IconPackage = createIcon(Package);
export const IconPackageCheck = createIcon(PackageCheck);
export const IconReset = createIcon(RotateCcw);
export const IconLoading = createIcon(LoaderCircle);
export const IconEye = createIcon(Eye);
export const IconEyeOff = createIcon(EyeOff);
export const IconHelp = createIcon(CircleHelp);
export const IconUserPlus = createIcon(UserPlus);
export const IconUserCheck = createIcon(UserCheck);

// Third-party recognized brand icons
export const BrandIconLine = SiLine;
export const BrandIconFacebook = SiFacebook;
export const BrandIconGoogle = SiGoogle;

export {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  BarChart3,
  Building2,
  Calendar,
  CalendarClock,
  CalendarDays,
  Check,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  ClipboardPlus,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  FlaskConical,
  HeartPulse,
  Home,
  Inbox,
  Info,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  Lock,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MessageSquare,
  MessageSquareQuote,
  Package,
  PackageCheck,
  Pencil,
  Phone,
  Plus,
  Receipt,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  X,
};
