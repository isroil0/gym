'use client';

import DashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import PeopleOutlined from '@mui/icons-material/PeopleAltOutlined';
import FitnessCenterOutlined from '@mui/icons-material/FitnessCenterOutlined';
import CardMembershipOutlined from '@mui/icons-material/CardMembershipOutlined';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import NotificationsOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import ListAltOutlined from '@mui/icons-material/ListAltOutlined';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlineOutlined';
import QrCodeOutlined from '@mui/icons-material/QrCode2Outlined';
import MoreHorizOutlined from '@mui/icons-material/MoreHorizOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import type { SvgIconProps } from '@mui/material/SvgIcon';

const ICONS: Record<string, React.ComponentType<SvgIconProps>> = {
  dashboard: DashboardOutlined,
  home: HomeOutlined,
  members: PeopleOutlined,
  trainers: FitnessCenterOutlined,
  memberships: CardMembershipOutlined,
  attendance: HowToRegOutlined,
  payments: PaymentsOutlined,
  accounting: AccountBalanceOutlined,
  reports: InsightsOutlined,
  notifications: NotificationsOutlined,
  settings: SettingsOutlined,
  workouts: ListAltOutlined,
  sessions: EventNoteOutlined,
  progress: TrendingUpOutlined,
  profile: PersonOutlined,
  qr: QrCodeOutlined,
  audit: HistoryOutlined,
  more: MoreHorizOutlined,
};

export function NavIcon({ name, ...props }: { name: string } & SvgIconProps) {
  const Icon = ICONS[name] ?? MoreHorizOutlined;
  return <Icon {...props} />;
}
