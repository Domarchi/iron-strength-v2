import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
const paths = {
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  eyeOff:
    "m3 3 18 18M10.5 5.1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3.2 4M6.3 6.3A20 20 0 0 0 2 12s3.5 7 10 7c2.1 0 4-.7 5.5-1.7M9.9 9.9a3 3 0 0 0 4.2 4.2",
  link: "m10 13 4-4M8 15l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M13 9l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0",
  info: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6M12 7h.01",
  home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  train: "M8 5v14M4 8v8M16 5v14M20 8v8M8 12h8",
  history: "M6 3h12a2 2 0 0 1 2 2v16H4V5a2 2 0 0 1 2-2ZM8 8h8M8 12h8M8 16h5",
  progress: "M4 4v16h16M7 14l4-5 4 3 5-8",
  account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2",
  chevronLeft: "m14 5-7 7 7 7",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  sun: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M20.5 14A9 9 0 0 1 10 3a9 9 0 1 0 10.5 11Z",
  system: "M3 4h18v13H3ZM8 21h8M12 17v4",
  more: "M5 11h.01v2H5ZM12 11h.01v2H12ZM19 11h.01v2H19Z",
  grip: "M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01",
  plus: "M5 12h14M12 5v14",
  minus: "M5 12h14",
  refresh: "M20 7v5h-5M4 17v-5h5M6.5 7a7 7 0 0 1 11-1L20 9M4 15l2.5 3a7 7 0 0 0 11-1",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2",
  pause: "M8 5v14M16 5v14",
  play: "m8 5 11 7-11 7Z",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, color, size = 22 }: { name: IconName; color: string; size?: number }) {
  return (
    <View
      aria-hidden
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d={paths[name]} />
      </Svg>
    </View>
  );
}
