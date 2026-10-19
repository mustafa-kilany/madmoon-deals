// Line icon set, ported 1:1 from the prototype's components/icons.tsx.
// 24×24 grid, outline only, stroke 2.5, round caps and joins. Color comes from
// the `color` prop (React Native has no inherited text color).
//
//   <Icon name="Home" size={iconSize.nav} color={colors.primary} />
//
// Directional icons (ChevronLeft/Right) don't flip themselves: pick the one
// that points toward the start edge, as BackButton does.

import type { ReactElement } from 'react';
import Svg, {
  Circle,
  Line,
  Path,
  Polygon,
  Polyline,
  Rect,
} from 'react-native-svg';
import { colors } from '@/theme/colors';

const paths = {
  Home: (
    <>
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
  Search: (
    <>
      <Circle cx="11" cy="11" r="8" />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  Add: (
    <>
      <Rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <Line x1="12" y1="8" x2="12" y2="16" />
      <Line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  Chat: (
    <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  ),
  Profile: (
    <>
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </>
  ),
  Gavel: (
    <>
      <Path d="m14 13-7.5 7.5c-.8.8-2.1.8-2.9 0-.8-.8-.8-2.1 0-2.9L11 10" />
      <Path d="m16 16 6-6-4-4-6 6" />
      <Path d="m15 9-4 4" />
    </>
  ),
  Menu: (
    <>
      <Line x1="3" y1="12" x2="21" y2="12" />
      <Line x1="3" y1="6" x2="21" y2="6" />
      <Line x1="3" y1="18" x2="21" y2="18" />
    </>
  ),
  Lock: (
    <>
      <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  Camera: (
    <>
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx="12" cy="13" r="4" />
    </>
  ),
  Check: <Polyline points="20 6 9 17 4 12" />,
  X: (
    <>
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  ChevronLeft: <Polyline points="15 18 9 12 15 6" />,
  ChevronRight: <Polyline points="9 18 15 12 9 6" />,
  // Not in the prototype's set (it used the browser's native <select> arrow).
  ChevronDown: <Polyline points="6 9 12 15 18 9" />,
  Box: (
    <>
      <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <Polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <Line x1="12" y1="22.08" x2="12" y2="12" />
    </>
  ),
  Heart: (
    <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  ),
  Settings: (
    <>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  MapPin: (
    <>
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx="12" cy="10" r="3" />
    </>
  ),
  Clock: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Polyline points="12 6 12 12 16 14" />
    </>
  ),
  Tag: (
    <>
      <Path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <Line x1="7" y1="7" x2="7.01" y2="7" />
    </>
  ),
  Grid: (
    <>
      <Rect x="3" y="3" width="7" height="7" />
      <Rect x="14" y="3" width="7" height="7" />
      <Rect x="14" y="14" width="7" height="7" />
      <Rect x="3" y="14" width="7" height="7" />
    </>
  ),
  Shirt: (
    <Path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
  ),
  Laptop: (
    <>
      <Rect x="3" y="4" width="18" height="12" rx="1" />
      <Line x1="1" y1="20" x2="23" y2="20" />
    </>
  ),
  Car: (
    <Path d="M5 17h14M5 17a2 2 0 1 1-4 0M23 17a2 2 0 1 1-4 0M3 13l1.5-5A2 2 0 0 1 6.4 6.5h11.2a2 2 0 0 1 1.9 1.5L21 13v4H3z" />
  ),
  Sofa: (
    <>
      <Path d="M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
      <Path d="M2 13a2 2 0 0 1 2-2 2 2 0 0 1 2 2v3h12v-3a2 2 0 0 1 4 0v6H2z" />
    </>
  ),
  Sneaker: (
    <>
      <Path d="M2 18h20a1 1 0 0 0 .95-1.31L21 10l-6-3-3 3-4-1-2 2v6a1 1 0 0 0 1 1z" />
      <Path d="M12 10l2 2M15 7l2 2" />
    </>
  ),
  Gamepad: (
    <>
      <Line x1="6" y1="12" x2="10" y2="12" />
      <Line x1="8" y1="10" x2="8" y2="14" />
      <Line x1="15" y1="13" x2="15.01" y2="13" />
      <Line x1="18" y1="11" x2="18.01" y2="11" />
      <Rect x="2" y="6" width="20" height="12" rx="6" />
    </>
  ),
  Watch: (
    <>
      <Circle cx="12" cy="12" r="6" />
      <Polyline points="12 10 12 12 13 13" />
      <Path d="M16.51 17.35l-.35 3.83a2 2 0 0 1-2 1.82H9.83a2 2 0 0 1-2-1.82l-.35-3.83m.01-10.7l.35-3.83A2 2 0 0 1 9.83 1h4.35a2 2 0 0 1 2 1.82l.35 3.83" />
    </>
  ),
  Mail: (
    <>
      <Rect x="2" y="4" width="20" height="16" rx="2" />
      <Path d="m22 7-10 6L2 7" />
    </>
  ),
  IdCard: (
    <>
      <Rect x="2" y="5" width="20" height="14" rx="2" />
      <Circle cx="8" cy="11" r="2" />
      <Path d="M5 16a3 3 0 0 1 6 0" />
      <Line x1="14" y1="10" x2="19" y2="10" />
      <Line x1="14" y1="14" x2="19" y2="14" />
    </>
  ),
  CreditCard: (
    <>
      <Rect x="1" y="4" width="22" height="16" rx="2" />
      <Line x1="1" y1="10" x2="23" y2="10" />
    </>
  ),
  Eye: (
    <>
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  BadgeCheck: (
    <>
      <Path d="M12 2l2.4 2.1 3.1-.5 1 3 2.9 1.4-1 3 1 3-2.9 1.4-1 3-3.1-.5L12 22l-2.4-2.1-3.1.5-1-3L2.6 15l1-3-1-3 2.9-1.4 1-3 3.1.5z" />
      <Path d="m9 12 2 2 4-4" />
    </>
  ),
  Star: (
    <Polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  ),
  Share: (
    <>
      <Circle cx="18" cy="5" r="3" />
      <Circle cx="6" cy="12" r="3" />
      <Circle cx="18" cy="19" r="3" />
      <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </>
  ),
  Shield: (
    <>
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <Path d="m9 12 2 2 4-4" />
    </>
  ),
  Truck: (
    <>
      <Rect x="1" y="3" width="15" height="13" rx="1" />
      <Path d="M16 8h4l3 3v5h-7z" />
      <Circle cx="5.5" cy="18.5" r="2.5" />
      <Circle cx="18.5" cy="18.5" r="2.5" />
    </>
  ),
  Filter: (
    <>
      <Line x1="4" y1="6" x2="20" y2="6" />
      <Line x1="7" y1="12" x2="17" y2="12" />
      <Line x1="10" y1="18" x2="14" y2="18" />
    </>
  ),
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof paths;

type IconProps = {
  name: IconName;
  /** 16 inline · 20 lists · 24 navigation (see theme/spacing iconSize). */
  size?: number;
  color?: string;
  /** Solid fill in the same color: saved hearts, rating stars. */
  filled?: boolean;
};

export function Icon({
  name,
  size = 24,
  color = colors.espresso,
  filled = false,
}: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </Svg>
  );
}
