import type { Metadata } from "next";
import BeeSweeperApp from "../page";
import { FarcasterReady } from "./FarcasterReady";

export const metadata: Metadata = {
  title: {
    absolute: "BeeSweeper Mini App",
  },
  description: "Clear the hive. Avoid the bees. Submit scores on Base.",
};

export default function MiniAppPage() {
  return (
    <>
      <FarcasterReady />
      <BeeSweeperApp />
    </>
  );
}
