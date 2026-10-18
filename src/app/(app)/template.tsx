/** Re-mounts on every navigation, so each page eases in while the sidebar stays put. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
